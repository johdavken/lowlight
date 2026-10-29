import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { arrangementKey, parseArrangement, type Arrangement } from '../../shared/arrangement';
import { BIG, CHAIR, JOB } from '../../shared/quests.fixture';
import { parseQuestFile, parseRun } from '../../shared/quests';
import { at, intakeRelay, lastUser, OWN, parse, questRows } from './fixtures/intake-relay';

export const CHAIR_Q = parse(CHAIR, 'the-chair');
/** Writes a deal straight into her room (as the Chair's outcome would). */
export const withDeal = (r: ReturnType<typeof intakeRelay>, deal: Partial<Arrangement> = {}) =>
  r.db.setMeta(arrangementKey('hicks'), JSON.stringify({ role: 'operator', retainer: 150, nights: 1, since: 0, ...deal }));
const deal = (r: ReturnType<typeof intakeRelay>) => parseArrangement(r.db.getMeta(arrangementKey('hicks')));

describe('the arrangement: writing it, her line', () => {
  it("the Chair's outcome writes it, stamped to its row", async () => {
    const r = intakeRelay({ book: [CHAIR_Q, OWN], trust: 5 });
    await r.relay.startQuest('hicks', 'the-chair');
    await r.relay.chooseQuest('hicks', { id: 'the-chair', beat: 'offer', choice: 'deal' });
    expect(deal(r)).toMatchObject({ role: 'operator', retainer: 150, nights: 1 });
    const prior = questRows(r.db).at(-2)!;
    await r.relay.rewind('hicks', prior.id);
    expect(deal(r)).toBeNull();
  });

  it('her line, active and stepped back', async () => {
    const line = (r: ReturnType<typeof intakeRelay>) => lastUser(r.backend.reqs.at(-1)!);
    const on = intakeRelay({ trust: 5 });
    withDeal(on);
    await on.relay.send('hicks', 'evening');
    expect(line(on)).toContain("[arrangement] You sit hicks's chair");
    expect(line(on)).toContain('Tonight: 0 of 1 done.');
    const back = intakeRelay({ trust: 4 });
    withDeal(back);
    await back.relay.send('hicks', 'evening');
    expect(line(back)).toContain('[arrangement — stepped back]');
    const none = intakeRelay({ trust: 5 });
    await none.relay.send('hicks', 'evening');
    expect(line(none)).not.toContain('[arrangement');
    const ooc = intakeRelay({ trust: 5 });
    withDeal(ooc);
    await ooc.relay.send('hicks', 'brb', 'ooc');
    expect(line(ooc)).not.toContain('[arrangement');
  });
});

/** Back Door at the Intake with Nix among its crew (not one of her own), as `id`. */
const jobWithNix = (id: string) => parse(JOB.replace('title: Back Door', `title: ${id}`).replace('tier: 2', 'tier: 1').replace('starts: haes-noodles', 'starts: lowlight-intake'), id);
const JOBS = ['job-a', 'job-b', 'job-c', 'job-d'].map(jobWithNix);
/** The jobs (not her own) listed now, in order. */
const listed = (r: ReturnType<typeof intakeRelay>) => r.relay.questState('hicks').open.filter((o) => o.mission && !o.mission.own);
/** Runs `id` to its end without a roll (wait, then skim: MESSY). */
async function finish(r: ReturnType<typeof intakeRelay>, id: string) {
  expect(await r.relay.startQuest('hicks', id)).toMatchObject({ ok: true });
  const run = () => parseRun(r.db.metaWithPrefix(`quest.hicks.${id}@`).at(-1)?.v ?? null)!;
  await r.relay.chooseQuest('hicks', { id, beat: run().beat!, choice: 'wait' });
  await r.relay.chooseQuest('hicks', { id, beat: 'desk', choice: 'skim' });
  expect(run().done).toBe(true);
}

describe('the arrangement: the nights cap', () => {
  it('after one job tonight, the rest are capped', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 1000 });
    withDeal(r);
    const [first, ...rest] = listed(r).map((o) => o.id);
    await finish(r, first);
    for (const id of rest) {
      expect(listed(r).find((o) => o.id === id)!.mission!.capped).toBe('Nix');
      expect(await r.relay.startQuest('hicks', id)).toBe('nix is done tonight');
    }
    r.setClock(at(22, 0, 2));
    expect(listed(r).every((o) => !o.mission!.capped)).toBe(true);
  });

  it('her own jobs', async () => {
    const r = intakeRelay({ book: [JOBS[0], OWN], trust: 5, sol: 1000 });
    withDeal(r);
    await finish(r, 'job-a');
    const own = r.relay.questState('hicks').open.find((o) => o.id === 'held-papers')!;
    expect(own.mission!.capped).toBeUndefined();
    expect(await r.relay.startQuest('hicks', 'held-papers')).toMatchObject({ ok: true });
  });

  it('tonight is the story day', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 1000, clock: at(23, 30) });
    withDeal(r, { nights: 2 });
    const ids = listed(r).map((o) => o.id);
    await finish(r, ids[0]);
    r.setClock(at(1, 30));
    expect(listed(r).find((o) => o.id === ids[1])!.mission!.capped).toBeUndefined();
    await finish(r, ids[1]);
    expect(listed(r).find((o) => o.id === ids[2])!.mission!.capped).toBe('Nix');
    const next = intakeRelay({ book: JOBS, trust: 5, sol: 1000, clock: at(5, 50) });
    withDeal(next);
    await finish(next, listed(next)[0].id);
    next.setClock(at(6, 10, 2));
    expect(listed(next).every((o) => !o.mission!.capped)).toBe(true);
  });

  it('suspended: no cap', async () => {
    const r = intakeRelay({ book: JOBS, trust: 4 });
    withDeal(r);
    const ids = listed(r).map((o) => o.id);
    await finish(r, ids[0]);
    await finish(r, ids[1]);
    expect(listed(r).every((o) => !o.mission!.capped)).toBe(true);
  });
});

describe('the arrangement: her bonus', () => {
  const odds = async (o: { deal?: boolean; trust?: number; text?: (t: string) => string; beat?: 'door' | 'desk'; choice: string }) => {
    const q = parse((o.text ?? ((t: string) => t))(JOB.replace('tier: 2', 'tier: 1').replace('starts: haes-noodles', 'starts: lowlight-intake')), 'back-door');
    const r = intakeRelay({ book: [q], trust: o.trust ?? 5 });
    if (o.deal !== false) withDeal(r);
    await r.relay.startQuest('hicks', 'back-door');
    if (o.beat === 'desk') await r.relay.chooseQuest('hicks', { id: 'back-door', beat: r.relay.questState('hicks').active!.beat, choice: 'wait' });
    return r.relay.questState('hicks').active!.choices.find((c) => c.id === o.choice)!.odds!;
  };

  it('NIX +10 on COOL and WITS while active', async () => {
    const withIt = await odds({ choice: 'talk' });
    const without = await odds({ deal: false, choice: 'talk' });
    expect(withIt.why).toContain('NIX +10');
    expect(withIt.chance - without.chance).toBe(10);
    expect((await odds({ beat: 'desk', choice: 'grab' })).why).not.toContain('NIX +10');
  });

  it('no stacking with a choice that names her', async () => {
    const named = await odds({ choice: 'talk', text: (t) => t.replace(/talk your way in\. → inside \/ turned \[check cool 50\]/gi, 'Talk your way in. → inside / turned [check cool 50 · nix-direct +15]') });
    expect(named.why).toContain('NIX-DIRECT +15');
    expect(named.why).not.toContain('NIX +10');
  });

  it('suspended: no bonus', async () => {
    expect((await odds({ trust: 4, choice: 'talk' })).why).not.toContain('NIX +10');
  });
});

describe('the arrangement: the retainer', () => {
  const lastRow = (r: ReturnType<typeof intakeRelay>) => questRows(r.db).at(-1)!;
  const retainerOf = (r: ReturnType<typeof intakeRelay>) => lastRow(r).quest!.debrief!.retainer;

  it("the night's first job pays her", async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 400 });
    withDeal(r);
    const [first, second] = listed(r).map((o) => o.id);
    await finish(r, first);
    expect(retainerOf(r)).toEqual({ name: 'Nix', amount: 150, paid: true });
    const pay = lastRow(r).quest!.debrief!.sol;
    expect(r.kit().sol).toBe(400 + pay - 150);
    withDeal(r, { nights: 2 });
    await finish(r, second);
    expect(retainerOf(r)).toBeUndefined();
  });

  it('short: not paid, trust −1', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 100 });
    withDeal(r);
    await finish(r, listed(r)[0].id);
    expect(retainerOf(r)).toEqual({ name: 'Nix', amount: 150, paid: false });
    expect(r.kit().sol).toBe(100 + lastRow(r).quest!.debrief!.sol);
    expect(r.trustNow()).toBe(4);
    expect(r.jobMoves().at(-1)).toMatchObject({ trust: -1, reason: 'Unpaid retainer' });
  });

  it('her own jobs', async () => {
    const r = intakeRelay({ book: [JOBS[0], OWN], trust: 5, sol: 400 });
    withDeal(r, { nights: 2 });
    await finish(r, 'held-papers');
    expect(retainerOf(r)).toBeUndefined();
    await finish(r, 'job-a');
    expect(retainerOf(r)).toMatchObject({ paid: true });
  });

  it('rewind takes the retainer back', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 400 });
    withDeal(r);
    const id = listed(r)[0].id;
    await finish(r, id);
    const prior = questRows(r.db).at(-2)!;
    await r.relay.rewind('hicks', prior.id);
    expect(r.kit().sol).toBe(400);
    await r.relay.chooseQuest('hicks', { id, beat: 'desk', choice: 'skim' });
    expect(retainerOf(r)).toMatchObject({ paid: true });
  });

  it('suspended: no retainer', async () => {
    const r = intakeRelay({ book: JOBS, trust: 4, sol: 400 });
    withDeal(r);
    await finish(r, listed(r)[0].id);
    expect(retainerOf(r)).toBeUndefined();
  });

  it('her closing note hears it', async () => {
    const paid = intakeRelay({ book: JOBS, trust: 5, sol: 400 });
    withDeal(paid);
    await finish(paid, listed(paid)[0].id);
    expect(lastUser(paid.backend.reqs.at(-1)!)).toContain('Your retainer was paid.');
    const short = intakeRelay({ book: JOBS, trust: 5, sol: 0 });
    withDeal(short);
    await finish(short, listed(short)[0].id);
    expect(lastUser(short.backend.reqs.at(-1)!)).toContain("Your retainer wasn't paid: they came up short.");
  });
});

describe('the shipped Chair (world/quests)', () => {
  const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string }[] };
  const live = { roster: new Set(fs.readdirSync('characters')), places: new Set(map.places.map((p) => p.id)), decks: null };
  const load = () => {
    const r = parseQuestFile('the-chair', fs.readFileSync('world/quests/the-chair.md', 'utf8'), live as never);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r;
  };

  it('parses with no warnings, on her shift at the Intake', () => {
    const r = load();
    expect(r.warnings).toEqual([]);
    expect(r.entry).toMatchObject({ kind: 'quest', starts: 'lowlight-intake', with: ['nix-direct'], posts: [1200, 120] });
  });

  it('every deal is 100, 150 or 200 a night, one or two jobs, and sets chair=yes on the way', () => {
    const q = load().entry;
    const choices = [...q.beats.values()].flat().flatMap((b) => b.choices);
    const deals = [...q.outcomes.values()].filter((o) => o.effects.arrangement);
    expect(deals.length).toBeGreaterThan(0);
    for (const o of deals) {
      expect([100, 150, 200]).toContain(o.effects.arrangement!.retainer);
      expect([1, 2]).toContain(o.effects.arrangement!.nights);
      for (const c of choices.filter((x) => [x.to, x.close, x.fail].includes(o.id))) expect(c.tags).toContainEqual({ kind: 'set', name: 'chair', value: 'yes' });
    }
    // Two jobs a night only at high trust and high warmth.
    const two = deals.filter((o) => o.effects.arrangement!.nights === 2).map((o) => o.id);
    for (const c of choices.filter((x) => two.includes(x.to))) {
      const needs = c.tags.find((t) => t.kind === 'needs');
      expect(needs && needs.kind === 'needs' && needs.all).toEqual(expect.arrayContaining([expect.objectContaining({ axis: 'trust', band: 'high' }), expect.objectContaining({ axis: 'warmth', band: 'high' })]));
    }
  });

  it('offered only at high trust, on her shift, and not once struck', async () => {
    const q = load().entry;
    const ids = (r: ReturnType<typeof intakeRelay>) => r.relay.questState('hicks').open.map((o) => o.id);
    expect(ids(intakeRelay({ book: [q], trust: 5 }))).toContain('the-chair');
    expect(ids(intakeRelay({ book: [q], trust: 4 }))).not.toContain('the-chair');
    expect(ids(intakeRelay({ book: [q], trust: 5, clock: at(3, 0) }))).not.toContain('the-chair');
    const r = intakeRelay({ book: [q], trust: 5 });
    expect(await r.relay.startQuest('hicks', 'the-chair')).toMatchObject({ ok: true });
  });
});

describe('trustFromEnv (e2e)', async () => {
  const { trustFromEnv } = await import('../src/mission-run');
  it('reads NIX_TEST_TRUST=player@contact:N[,…]; unset or bad is none', () => {
    expect(trustFromEnv({ NIX_TEST_TRUST: 'cass@nix-direct:6, hicks@cass:-2' })).toEqual([
      { player: 'cass', contact: 'nix-direct', trust: 6 },
      { player: 'hicks', contact: 'cass', trust: -2 },
    ]);
    expect(trustFromEnv({})).toEqual([]);
    expect(trustFromEnv({ NIX_TEST_TRUST: 'cass:6' })).toEqual([]);
  });
});

describe('mid-run review fixes (server)', () => {
  it("I2: a tab's odds read its own player's deal, whoever the relay last served", async () => {
    const q = parse(JOB.replace('tier: 2', 'tier: 1').replace('starts: haes-noodles', 'starts: lowlight-intake'), 'back-door');
    const r = intakeRelay({ book: [q], trust: 5 });
    withDeal(r);
    await r.relay.startQuest('hicks', 'back-door');
    // Another player's turn moves the relay's current player; hicks's cards still carry her +10.
    await r.relay.send('cass', 'evening');
    const talk = r.relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!;
    expect(talk.odds!.why).toContain('NIX +10');
  });
});

describe('final review fixes', () => {
  it('I1: a big job with her never counts toward the night, so small jobs stay uncapped and owe the retainer', async () => {
    const big = parse(BIG.replace('starts: haes-noodles', 'starts: lowlight-intake'), 'north-gate');
    const r = intakeRelay({ book: [...JOBS, big], trust: 5, sol: 1000 });
    withDeal(r);
    // A big job with her that ended tonight (walked away from, or finished).
    const day = Math.floor((at(22, 0) - 360) / 1440);
    r.db.setMeta(`quest.hicks.north-gate@${day}`, JSON.stringify({ beat: null, variant: 0, picks: [], flags: {}, done: true, endDay: day, wait: null, at: 0 }));
    expect(listed(r).every((o) => !o.mission!.capped)).toBe(true);
    await finish(r, listed(r)[0].id);
    expect(questRows(r.db).at(-1)!.quest!.debrief!.retainer).toMatchObject({ paid: true });
  });
});
