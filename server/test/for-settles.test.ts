import { describe, expect, it } from 'vitest';
import { parseQuestFile, parseRun, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { at, intakeRelay, lastUser } from './fixtures/intake-relay';

const file = (front: string, end = '*Done.*\n→ end') => `---
title: The Favour
kind: mission
tier: 1
starts: lowlight-intake
pitch: A small thing she asked.
pay: 90
${front}
---

# door

*A door.*

- go: Go in. → done
- wait: Wait. → done

## done
${end}
`;
const entry = (front: string, end?: string): QuestEntry => {
  const r = parseQuestFile('the-favour', file(front, end), { roster: null, places: null });
  if (!r.ok) throw new Error(r.problems.map((p) => p.message).join('; '));
  return r.entry;
};
const problems = (front: string, end?: string, roster: ReadonlySet<string> | null = null) => {
  const r = parseQuestFile('the-favour', file(front, end), { roster, places: null });
  return r.ok ? [] : r.problems.map((p) => p.message);
};
const ended = (settles: { who: string; text: string }[], contact = 'nix-direct'): QuestStatus => {
  const run = parseRun(JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, day: 1, endDay: 1, settles }));
  if (!run) throw new Error('bad run');
  return { id: 'the-favour@1', contact, run };
};

describe('for: a job for one player', () => {
  it('reads, and goes only on a job', () => {
    expect(entry('for: hicks').for).toBe('hicks');
    expect(problems('for: hicks').length).toBe(0);
    expect(problems('for: hicks').concat(problems('for: nobody', undefined, new Set(['hicks'])))).toEqual(["no character 'nobody'"]);
    const quest = file('for: hicks').replace('kind: mission\ntier: 1\n', '').replace('pay: 90\n', '');
    const r = parseQuestFile('the-favour', quest, { roster: null, places: null });
    expect(r.ok ? [] : r.problems.map((p) => p.message)).toContain('for: goes only on a job (kind: mission or contract)');
  });
  it("lists every night for its player, past the board's draw", () => {
    const fillers = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ ...entry('after: null'), id, title: id }));
    const t = intakeRelay({ book: [entry('for: hicks'), ...fillers], clock: at(22, 0) });
    expect(t.relay.questState('hicks').open.map((q) => q.id)).toContain('the-favour');
  });
  it('never lists for anyone else', () => {
    const t = intakeRelay({ book: [entry('for: soren')], clock: at(22, 0) });
    expect(t.relay.questState('hicks').open.map((q) => q.id)).not.toContain('the-favour');
  });
  it('waits for the rep of its tier', () => {
    const t = intakeRelay({ book: [{ ...entry('for: hicks'), tier: 2 }], clock: at(22, 0) });
    expect(t.relay.questState('hicks').open.map((q) => q.id)).not.toContain('the-favour');
  });
});

describe('bars: a deck that stays home', () => {
  it('reads, and goes only on a job', () => {
    expect(entry('bars: stall-build').bars).toBe('stall-build');
    const quest = file('bars: stall-build').replace('kind: mission\ntier: 1\n', '').replace('pay: 90\n', '');
    const r = parseQuestFile('the-favour', quest, { roster: null, places: null });
    expect(r.ok ? [] : r.problems.map((p) => p.message)).toContain('bars: goes only on a job (kind: mission or contract)');
  });
  it('SETUP names the deck that stays home and offers no slots', () => {
    const t = intakeRelay({ book: [entry('bars: stall-build')], clock: at(22, 0) });
    const offer = t.relay.questState('hicks').open.find((q) => q.id === 'the-favour')?.setup;
    expect(offer?.deck).toBeNull();
    expect(offer?.barred).toBe('Stall build');
    expect(offer?.programs).toBeUndefined();
  });
  it('any other deck goes in as usual', () => {
    const t = intakeRelay({ book: [entry('bars: field-deck')], clock: at(22, 0) });
    const offer = t.relay.questState('hicks').open.find((q) => q.id === 'the-favour')?.setup;
    expect(offer?.deck?.name).toBe('Stall build');
    expect(offer?.barred).toBeUndefined();
  });
});

describe('settles: what an ending settles', () => {
  const END = '*Done.*\nsettles: cass: The offer is off the table.\nsettles: hicks: He chose her.\n→ end';
  it('reads every line, on an ending, in its length', () => {
    expect(entry('after: null', END).kind).toBe('mission');
    const r = parseQuestFile('the-favour', file('after: null', END), { roster: null, places: null });
    expect(r.ok && r.entry.outcomes.get('done')?.effects.settles).toEqual([{ who: 'cass', text: 'The offer is off the table.' }, { who: 'hicks', text: 'He chose her.' }]);
    expect(problems('after: null', `*Done.*\nsettles: cass: ${'x'.repeat(301)}\n→ end`)).toEqual(['settles: at most 300 characters (this is 301)']);
    expect(problems('after: null', END, new Set(['cass']))).toEqual(["settles: no contact 'hicks'"]);
  });
  it('goes on the run when the job ends', async () => {
    const t = intakeRelay({ book: [entry('after: null', END)], clock: at(22, 0) });
    await t.relay.startQuest('hicks', 'the-favour');
    await t.relay.chooseQuest('hicks', { id: 'the-favour', beat: 'door', choice: 'go' });
    const runs = t.db.metaWithPrefix('quest.hicks.').map(({ v }) => parseRun(v));
    expect(runs.at(-1)?.settles).toEqual([{ who: 'cass', text: 'The offer is off the table.' }, { who: 'hicks', text: 'He chose her.' }]);
  });
  it('reaches its contact on every turn, from any room, and goes when the run does', async () => {
    let runs = [ended([{ who: 'cass', text: 'The offer is off the table.' }], 'rue')];
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => runs });
    await t.relay.send('hicks', 'hey');
    await t.relay.send('hicks', 'still here');
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain('[settled: The offer is off the table.');
    runs = [];
    await t.relay.send('hicks', 'and now');
    expect(lastUser(t.backend.reqs.at(-1)!)).not.toContain('[settled:');
  });
  it('reaches nobody else', async () => {
    const t = intakeRelay({ contact: 'nix-direct', clock: at(23, 0), others: () => [ended([{ who: 'cass', text: 'Off the table.' }])] });
    await t.relay.send('hicks', 'hey');
    expect(lastUser(t.backend.reqs.at(-1)!)).not.toContain('[settled:');
  });
});
