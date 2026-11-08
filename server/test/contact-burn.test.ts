import { describe, expect, it } from 'vitest';
import { parseRun, type QuestStatus } from '../../shared/quests';
import { CONTACT_BURN_REASON } from '../../shared/hand';
import type { ContactCard } from '../../shared/types';
import { at, intakeRelay, lastUser } from './fixtures/intake-relay';
import { standingControl } from '../src/standing';
import { DEFAULT_SHARED_STANDING } from '../../shared/standing';

// Contact cards spec §4: a job in another room that ends BLOWN after Cass's card played costs her trust on her next turn.
const CASS: ContactCard = { id: 'cass', name: 'Cass Okafor', accent: '#fff', portrait: null, spec: 'runner' };
const elsewhere = (o: { blown?: boolean; played?: boolean; getaway?: boolean } = {}): QuestStatus => {
  const run = parseRun(
    JSON.stringify({
      beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, day: 1, endDay: 1, take: 'full', ...(o.blown ?? true ? { blown: true } : {}), ...(o.getaway ? { getaway: true } : {}),
      setup: { approach: 'quiet', people: [], favour: false, at: 0, contacts: [CASS] },
      calls: o.played ?? true ? [{ beat: 'door', choice: 'talk', card: 'contact:cass', again: false, at: 5 }] : [],
    }),
  );
  if (!run) throw new Error('bad run');
  return { id: 'held-papers@1', contact: 'nix-direct', run };
};

describe('contact cards: the cost', () => {
  it('a blown job after her card: trust −1 on her next turn, once', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere()] });
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(-1);
    expect(t.jobMoves().map((m) => m.reason)).toEqual([CONTACT_BURN_REASON]);
    await t.relay.send('hicks', 'still here');
    expect(t.trustNow()).toBe(-1);
  });

  it('brought and not played, clean or messy: nothing', async () => {
    for (const o of [{ played: false }, { blown: false }]) {
      const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere(o)] });
      await t.relay.send('hicks', 'hey');
      expect(t.trustNow()).toBe(0);
    }
  });

  const guested = (o: { blown?: boolean } = {}): QuestStatus => {
    const base = elsewhere({ played: false, ...o });
    return { ...base, run: { ...base.run, setup: { ...base.run.setup!, contacts: undefined, people: ['guest-cass'], guest: { ...CASS, grade: 3, abilities: [] } } } };
  };
  it('a guest brought on a blown job, never called: trust −1 on her next turn, once', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [guested()] });
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(-1);
    await t.relay.send('hicks', 'still here');
    expect(t.trustNow()).toBe(-1);
  });
  it('a guest file brought on a blown mission costs nobody trust (The Passenger spec, engine §2)', async () => {
    const base = guested();
    const noa = { ...base, run: { ...base.run, setup: { ...base.run.setup!, people: ['guest-noa'], guest: { id: 'noa', name: 'Noa Vey', accent: '#fff', portrait: null, spec: 'runner' as const, grade: 0 as const, abilities: [], kind: 'guest' as const } } } };
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [noa] });
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(0);
  });
  it('a blown contract waiting on its fallout costs her trust now, not after it plays (review I1)', async () => {
    const base = guested();
    const waiting = { ...base, run: { ...base.run, done: false, setup: { ...base.run.setup!, endAt: 5 }, contract: { stage: 'fallout' as const, wait: null, results: {}, reported: [] } } };
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [waiting] });
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(-1);
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain('you lent a hand');
  });
  it('a contract still on its night costs nothing yet', async () => {
    const base = guested();
    const going = { ...base, run: { ...base.run, done: false, contract: { stage: 'night' as const, wait: null, results: {}, reported: [] } } };
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [going] });
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(0);
  });
  it('a guest on a clean job costs nothing, and a blown one costs nobody else', async () => {
    const clean = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [guested({ blown: false })] });
    await clean.relay.send('hicks', 'hey');
    expect(clean.trustNow()).toBe(0);
    const other = intakeRelay({ contact: 'hicks-other', clock: at(23, 0), others: () => [guested()] });
    await other.relay.send('hicks', 'hey');
    expect(other.trustNow()).toBe(0);
  });

  const noted = (o: { brought?: boolean } = {}): QuestStatus => {
    const base = guested({ blown: false });
    return { ...base, run: { ...base.run, guestNote: 'You were right about the band.', setup: { ...base.run.setup!, ...(o.brought === false ? { guest: undefined, people: [] } : {}) } } };
  };
  const notes = (t: ReturnType<typeof intakeRelay>) => t.db.listNotes('hicks').map((n) => n.text);
  it('a guest-note reaches her journal on her next turn, once (guest crew spec §3)', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [noted()] });
    await t.relay.send('hicks', 'hey');
    expect(notes(t)).toEqual(['You were right about the band.']);
    await t.relay.send('hicks', 'still here');
    expect(notes(t)).toEqual(['You were right about the band.']);
  });
  it('a guest-note goes in her own journal, not her dossier on the player (final review I1)', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [noted()] });
    await t.relay.send('hicks', 'hey');
    expect(t.db.listNotes('hicks')[0]).toMatchObject({ about: 'me', pinned: true });
  });
  it('with the pins full it still has keys, so it can come up (final review I1)', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [{ ...noted(), run: { ...noted().run, guestNote: 'I was right about Fairy Dust.' } }] });
    for (let i = 0; i < 8; i++) t.db.insertNote(null, { id: `n${i + 101}`, text: `pin ${i}`, pinned: true, keys: [], about: 'me', createdAt: 1, updatedAt: 1, editedBy: 'agent' } as never);
    await t.relay.send('hicks', 'hey');
    const note = t.db.listNotes('hicks').find((n) => n.text.startsWith('I was right'))!;
    expect(note).toMatchObject({ pinned: false });
    expect(note.keys).toEqual(expect.arrayContaining(['Fairy', 'Dust']));
  });
  it('a replay to another ending writes its own note (final review M8)', async () => {
    let run = noted();
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [run] });
    await t.relay.send('hicks', 'hey');
    run = { ...run, run: { ...run.run, guestNote: 'It all went wrong.' } };
    await t.relay.send('hicks', 'still here');
    expect(notes(t)).toContain('It all went wrong.');
  });
  it('no guest-note for a guest left behind, or in anyone else\'s room', async () => {
    const left = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [noted({ brought: false })] });
    await left.relay.send('hicks', 'hey');
    expect(notes(left)).toEqual([]);
    const other = intakeRelay({ contact: 'hicks-other', clock: at(23, 0), others: () => [noted()] });
    await other.relay.send('hicks', 'hey');
    expect(notes(other)).toEqual([]);
  });

  it('rewinding her line takes the move back; the next turn applies it once', async () => {
    let job: QuestStatus[] = [];
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => job });
    await t.relay.send('hicks', 'hi');
    const before = t.db.recentMessages('hicks', 10).findLast((m) => m.role === 'agent')!;
    job = [elsewhere()];
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(-1);
    // Rewind to her reply before it: the line that carried the move goes, and the move with it.
    await t.relay.rewind('hicks', before.id);
    expect(t.trustNow()).toBe(0);
    await t.relay.send('hicks', 'again');
    expect(t.trustNow()).toBe(-1);
  });

  it('they remember being called in, with no pronoun (final review I1); a card brought and not played is not theirs to remember', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere()] });
    await t.relay.send('hicks', 'hey');
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain('[done together: Held Papers — went bad, you lent a hand, tonight]');
    const quiet = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere({ played: false })] });
    await quiet.relay.send('hicks', 'hey');
    expect(lastUser(quiet.backend.reqs.at(-1)!)).not.toContain('done together');
  });

  it('the burn leaves her own trust move on that turn alone (final review M1, regraded)', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere()] });
    await t.relay.send('hicks', 'sorry about the job');
    expect(CONTACT_BURN_REASON).not.toMatch(/\b(her|his|she|he)\b/);
    const reply = t.db.recentMessages('hicks', 10).findLast((m) => m.role === 'agent')!;
    const her = standingControl({ db: t.db, player: () => 'hicks', start: () => ({ trust: 0, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    expect(her.move({ trust: 1, warmth: 0, reason: 'a straight apology' }, reply.id)).not.toBe('already');
    expect(t.trustNow()).toBe(0);
  });
});
