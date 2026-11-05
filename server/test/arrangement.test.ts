import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { arrangementKey, cutOf, parseArrangement, type Arrangement } from '../../shared/arrangement';
import { CHAIR, JOB } from '../../shared/quests.fixture';
import { CONTRACT } from '../../shared/quests.contract.fixture';
import { parseQuestFile, parseRun } from '../../shared/quests';
import { at, intakeRelay, lastUser, OWN, parse, questRows } from './fixtures/intake-relay';

export const CHAIR_Q = parse(CHAIR, 'the-chair');
/** Writes a deal straight into her room (as the Chair's outcome would). */
export const withDeal = (r: ReturnType<typeof intakeRelay>, deal: Partial<Arrangement> = {}) =>
  r.db.setMeta(arrangementKey('hicks'), JSON.stringify({ role: 'operator', tier: 1, cut: 25, nights: 1, since: 0, ...deal }));
const deal = (r: ReturnType<typeof intakeRelay>) => parseArrangement(r.db.getMeta(arrangementKey('hicks')));

describe('the arrangement: writing it, her line', () => {
  it("the Chair's outcome writes it, stamped to its row", async () => {
    const r = intakeRelay({ book: [CHAIR_Q, OWN], trust: 5 });
    await r.relay.startQuest('hicks', 'the-chair');
    await r.relay.chooseQuest('hicks', { id: 'the-chair', beat: 'offer', choice: 'deal' });
    expect(deal(r)).toMatchObject({ role: 'operator', tier: 1, cut: 25, nights: 1 });
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
    const pool = r.relay.questState('hicks').active!.choices.find((c) => c.id === o.choice)!.pool!;
    return { ...pool, why: pool.parts.map((x) => x.label) };
  };

  it('NIX +1d on COOL and WITS while active (the table: +10 is a die)', async () => {
    const withIt = await odds({ choice: 'talk' });
    const without = await odds({ deal: false, choice: 'talk' });
    expect(withIt.why).toContain('NIX');
    expect(withIt.dice - without.dice).toBe(1);
    expect((await odds({ beat: 'desk', choice: 'grab' })).why).not.toContain('NIX');
  });

  it('no stacking with a choice that names her', async () => {
    const named = await odds({ choice: 'talk', text: (t) => t.replace(/talk your way in\. → inside \/ turned \[check cool 50\]/gi, 'Talk your way in. → inside / turned [check cool 50 · nix-direct +15]') });
    expect(named.why).toContain('NIX-DIRECT');
    expect(named.why).not.toContain('NIX');
  });

  it('suspended: no bonus', async () => {
    expect((await odds({ trust: 4, choice: 'talk' })).why).not.toContain('NIX');
  });
});

describe('the arrangement: her cut (Tier 2 spec §2)', () => {
  const lastRow = (r: ReturnType<typeof intakeRelay>) => questRows(r.db).at(-1)!;
  const cutOfRow = (r: ReturnType<typeof intakeRelay>) => lastRow(r).quest!.debrief!.cut;

  it('each job with her pays her cut of what it paid', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 400 });
    withDeal(r, { nights: 2 });
    const [first, second] = listed(r).map((o) => o.id);
    await finish(r, first);
    const pay = lastRow(r).quest!.debrief!.sol;
    expect(cutOfRow(r)).toEqual({ name: 'Nix', pct: 25, amount: cutOf(pay, 25) });
    expect(r.kit().sol).toBe(400 + pay - cutOf(pay, 25));
    await finish(r, second);
    expect(cutOfRow(r)).toMatchObject({ pct: 25 });
    expect(r.jobMoves().some((m) => m.reason === 'Unpaid retainer')).toBe(false);
  });

  it('nothing paid, no cut', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 0 });
    withDeal(r);
    const id = listed(r)[0].id;
    expect(await r.relay.startQuest('hicks', id)).toMatchObject({ ok: true });
    const run = () => parseRun(r.db.metaWithPrefix(`quest.hicks.${id}@`).at(-1)?.v ?? null)!;
    await r.relay.chooseQuest('hicks', { id, beat: run().beat!, choice: 'talk' });
    // A miss on the door: turned, take none, blown.
    if (!run().done) await r.relay.chooseQuest('hicks', { id, beat: run().beat!, choice: '!take' });
    if (lastRow(r).quest?.debrief?.sol === 0) expect(cutOfRow(r)).toBeUndefined();
  });

  it('her own jobs, and suspended: no cut', async () => {
    const r = intakeRelay({ book: [JOBS[0], OWN], trust: 5, sol: 400 });
    withDeal(r, { nights: 2 });
    await finish(r, 'held-papers');
    expect(cutOfRow(r)).toBeUndefined();
    await finish(r, 'job-a');
    expect(cutOfRow(r)).toMatchObject({ pct: 25 });
    const off = intakeRelay({ book: JOBS, trust: 4, sol: 400 });
    withDeal(off);
    await finish(off, listed(off)[0].id);
    expect(cutOfRow(off)).toBeUndefined();
  });

  it('rewind takes the cut back', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 400 });
    withDeal(r);
    const id = listed(r)[0].id;
    await finish(r, id);
    const prior = questRows(r.db).at(-2)!;
    await r.relay.rewind('hicks', prior.id);
    expect(r.kit().sol).toBe(400);
  });

  it('old retainer converts: a stored 150 a night is a 25% cut, never unpaid', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 0 });
    r.db.setMeta(arrangementKey('hicks'), JSON.stringify({ role: 'operator', retainer: 150, nights: 1, since: 0 }));
    await finish(r, listed(r)[0].id);
    expect(cutOfRow(r)).toMatchObject({ pct: 25 });
    expect(r.trustNow()).toBe(5);
  });

  it('her closing note hears the cut', async () => {
    const r = intakeRelay({ book: JOBS, trust: 5, sol: 400 });
    withDeal(r);
    await finish(r, listed(r)[0].id);
    expect(lastUser(r.backend.reqs.at(-1)!)).toContain(`You took your cut: ${cutOfRow(r)!.amount} sol.`);
  });

  it('Tier 2: a deal from a pick that sets chair2 is tier 2, and the cap is 3', async () => {
    const two = parse(CHAIR.replace('arrangement: chair-cut 25 / 1', 'arrangement: chair-cut 20 / 3').replace('[set chair=yes]', '[set chair2=yes]'), 'the-chair-again');
    const r = intakeRelay({ book: [two, ...JOBS], trust: 5, sol: 400 });
    await r.relay.startQuest('hicks', 'the-chair-again');
    await r.relay.chooseQuest('hicks', { id: 'the-chair-again', beat: 'offer', choice: 'deal' });
    expect(deal(r)).toMatchObject({ tier: 2, cut: 20, nights: 3 });
    for (const id of listed(r).slice(0, 3).map((o) => o.id)) await finish(r, id);
    expect(listed(r).every((o) => o.mission?.capped)).toBe(true);
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

  it('every deal is a 20, 25 or 30% cut, one or two jobs, and sets chair=yes on the way', () => {
    const q = load().entry;
    const choices = [...q.beats.values()].flat().flatMap((b) => b.choices);
    const deals = [...q.outcomes.values()].filter((o) => o.effects.arrangement);
    expect(deals.length).toBeGreaterThan(0);
    for (const o of deals) {
      const a = o.effects.arrangement!;
      expect('cut' in a ? [20, 25, 30].includes(a.cut) : false).toBe(true);
      expect([1, 2]).toContain(o.effects.arrangement!.nights);
      for (const c of choices.filter((x) => [x.to, x.fail].includes(o.id))) expect(c.tags).toContainEqual({ kind: 'set', name: 'chair', value: 'yes' });
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
    expect(talk.pool!.parts.map((x) => x.label)).toContain('NIX');
  });
});

describe('final review fixes', () => {
  it('I1: a contract with her never counts toward the night, so small jobs stay uncapped and owe the retainer', async () => {
    const con = parse(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]'), 'the-contract');
    const r = intakeRelay({ book: [...JOBS, con], trust: 5, sol: 1000 });
    withDeal(r);
    // A contract with her that ended tonight (walked away from, or finished).
    const day = Math.floor((at(22, 0) - 360) / 1440);
    r.db.setMeta(`quest.hicks.the-contract@${day}`, JSON.stringify({ beat: null, variant: 0, picks: [], flags: {}, done: true, endDay: day, wait: null, at: 0 }));
    expect(listed(r).every((o) => !o.mission!.capped)).toBe(true);
    await finish(r, listed(r)[0].id);
    expect(questRows(r.db).at(-1)!.quest!.debrief!.cut).toMatchObject({ pct: 25 });
  });
});

describe('The Chair, again: deal2=ready and the locked row (Tier 2 spec §1)', () => {
  const AGAIN = parse(
    CHAIR.replace('title: The Chair', 'title: The Chair, again')
      .replace('starts: lowlight-intake', 'starts: lowlight-intake\nafter: deal2=ready and trust=high and chair=yes and chair2!=yes\nposts: 20:00-02:00')
      .replace('[set chair=yes]', '[set chair2=yes]')
      .replace('arrangement: chair-cut 25 / 1', 'arrangement: chair-cut 20 / 3'),
    'the-chair-again',
  );
  /** A finished run of `id` on story day `d`, ending `tier`, at minute `end` (newest last). */
  const seedRun = (r: ReturnType<typeof intakeRelay>, id: string, d: number, tier: 'clean' | 'messy' | 'blown', end: number, kit: object[] = []) =>
    r.db.setMeta(`quest.hicks.${id}@${d}`, JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, day: d, endDay: d, take: tier === 'messy' ? 'part' : tier === 'blown' ? 'none' : 'full', ...(tier === 'blown' ? { blown: true } : {}), alarm: 0, setup: { approach: 'quiet', people: [], favour: false, at: end - 30, endAt: end }, kit, at: end }));
  const struck = (r: ReturnType<typeof intakeRelay>) => r.db.setMeta('quest.hicks.the-chair', JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: { chair: 'yes' }, done: true, at: 1 }));
  /** Six jobs with her (4 clean, the last 3 not blown) and Trusted in Karasu. */
  const record = (r: ReturnType<typeof intakeRelay>, tiers: ('clean' | 'messy' | 'blown')[] = ['clean', 'messy', 'clean', 'clean', 'messy', 'clean']) =>
    tiers.forEach((t, i) => seedRun(r, JOBS[i % 4].id, i, t, at(21, i), i === 0 ? [{ at: 0, rep: { district: 'karasu', delta: 45 } }] : []));
  const row = (r: ReturnType<typeof intakeRelay>) => r.relay.questState('hicks').open.find((o) => o.id === 'the-chair-again');
  const make = (o: { clock?: number; trust?: number } = {}) => {
    const r = intakeRelay({ book: [CHAIR_Q, AGAIN, ...JOBS], trust: o.trust ?? 5, clock: o.clock ?? at(22, 0, 9) });
    withDeal(r);
    return r;
  };

  it('before Tier 1, no row', () => {
    expect(row(make())).toBeUndefined();
  });
  it('after Tier 1, locked with its checklist', () => {
    const r = make();
    struck(r);
    const x = row(r)!;
    expect(x.locked).toBe('LOCKED');
    expect(x.checks!.map((c) => [c.id, c.ok])).toEqual([['jobs', false], ['clean', false], ['blown', true], ['paid', true], ['standing', false], ['shift', true]]);
    expect(x.checks![0].progress).toBe('0/6');
  });
  it('the record met, in her shift: it lists open and starts', async () => {
    const r = make();
    struck(r);
    record(r);
    const x = row(r)!;
    expect(x.locked).toBeUndefined();
    expect(await r.relay.startQuest('hicks', 'the-chair-again')).toMatchObject({ ok: true });
  });
  it('the record met, outside her shift: locked, only the shift failing', () => {
    const r = make({ clock: at(12, 0, 9) });
    struck(r);
    record(r);
    const x = row(r)!;
    expect(x.locked).toBe('LOCKED');
    expect(x.checks!.filter((c) => !c.ok).map((c) => [c.id, c.progress])).toEqual([['shift', 'FROM 20:00']]);
  });
  it('her trust not high: the trust line, locked', () => {
    const r = make({ trust: 4 });
    struck(r);
    record(r);
    expect(row(r)!.checks!.find((c) => c.id === 'trust')).toMatchObject({ ok: false });
    expect(row(r)!.locked).toBe('LOCKED');
  });
  it('rewind drops a job: 5/6 again, locked', () => {
    const r = make();
    struck(r);
    record(r);
    r.db.setMeta(`quest.hicks.${JOBS[1].id}@5`, '');
    const x = row(r)!;
    expect(x.checks![0]).toMatchObject({ ok: false, progress: '5/6' });
    expect(x.locked).toBe('LOCKED');
  });
  it("contracts and her own clients' jobs don't count", () => {
    const con = parse(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]'), 'the-contract');
    const r = intakeRelay({ book: [CHAIR_Q, AGAIN, ...JOBS, OWN, con], trust: 5, clock: at(22, 0, 9) });
    withDeal(r);
    struck(r);
    record(r, ['clean', 'clean', 'clean', 'clean', 'clean']);
    seedRun(r, 'held-papers', 6, 'clean', at(21, 6));
    seedRun(r, 'the-contract', 7, 'clean', at(21, 7));
    expect(row(r)!.checks![0]).toMatchObject({ ok: false, progress: '5/6' });
  });
  it('an unpaid night in her history fails the paid line', () => {
    const r = make();
    struck(r);
    record(r);
    r.deps.trust!.move('hicks', -1, 'Unpaid retainer', 'old');
    r.deps.trust!.move('hicks', 1, 'Made up', 'later');
    expect(row(r)!.checks!.find((c) => c.id === 'paid')!.ok).toBe(false);
  });
  it('the shipped The Chair, again: locked, then opens and starts on the record', async () => {
    const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string }[] };
    const live = { roster: new Set(fs.readdirSync('characters')), places: new Set(map.places.map((p) => p.id)), decks: null };
    const shipped = parseQuestFile('the-chair-again', fs.readFileSync('world/quests/the-chair-again.md', 'utf8'), live as never);
    if (!shipped.ok) throw new Error(JSON.stringify(shipped.problems));
    const r = intakeRelay({ book: [CHAIR_Q, shipped.entry, ...JOBS], trust: 5, clock: at(22, 0, 9) });
    withDeal(r);
    struck(r);
    expect(row(r)!.locked).toBe('LOCKED');
    record(r);
    expect(row(r)!.locked).toBeUndefined();
    expect(await r.relay.startQuest('hicks', 'the-chair-again')).toMatchObject({ ok: true });
  });

  it("review: newest first across runs with and without a SETUP", () => {
    const r = make();
    struck(r);
    // Three clean late on story day 7 (04:00–04:30, before day 8 starts at 06:00), then a BLOWN one on day 8 with no SETUP:
    // the blown one is the newest, so it's in the last 3.
    seedRun(r, JOBS[0].id, 5, 'clean', at(21, 0, 5));
    seedRun(r, JOBS[1].id, 6, 'clean', at(21, 0, 6));
    for (const [i, mm] of [[2, 10], [3, 20], [0, 30]] as const) seedRun(r, JOBS[i].id, 7, 'clean', at(4, mm, 7));
    r.db.setMeta(`quest.hicks.${JOBS[1].id}@8`, JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, day: 8, endDay: 8, take: 'none', blown: true, alarm: 0, at: 5 }));
    expect(row(r)!.checks!.find((c) => c.id === 'blown')!.ok).toBe(false);
  });
  it("review: jobs ended before the deal on its own day don't count", () => {
    const r = make();
    struck(r);
    withDeal(r, { since: at(22, 0, 3) });
    seedRun(r, JOBS[0].id, 3, 'clean', at(20, 0, 3));
    for (let i = 0; i < 5; i++) seedRun(r, JOBS[(i + 1) % 4].id, 4 + i, 'clean', at(21, 0, 4 + i));
    expect(row(r)!.checks!.find((c) => c.id === 'jobs')!.progress).toBe('5/6');
  });
  it('review: chair=yes with no deal stored draws no row', () => {
    const r = intakeRelay({ book: [CHAIR_Q, AGAIN, ...JOBS], trust: 5, clock: at(22, 0, 9) });
    struck(r);
    expect(row(r)).toBeUndefined();
  });

  it('final review I1: every ending of the shipped The Chair, again strikes the deal (a quest that ends without one never lists again)', () => {
    const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string }[] };
    const live = { roster: new Set(fs.readdirSync('characters')), places: new Set(map.places.map((p) => p.id)), decks: null };
    const shipped = parseQuestFile('the-chair-again', fs.readFileSync('world/quests/the-chair-again.md', 'utf8'), live as never);
    if (!shipped.ok) throw new Error(JSON.stringify(shipped.problems));
    const endings = [...shipped.entry.outcomes.values()].filter((o) => o.to === 'end');
    expect(endings.length).toBeGreaterThan(0);
    for (const o of endings) expect(o.effects.arrangement, o.id).toBeDefined();
  });

  it('struck: row gone, cap 3', async () => {
    const r = make();
    struck(r);
    record(r);
    await r.relay.startQuest('hicks', 'the-chair-again');
    await r.relay.chooseQuest('hicks', { id: 'the-chair-again', beat: 'offer', choice: 'deal' });
    expect(row(r)).toBeUndefined();
    expect(deal(r)).toMatchObject({ tier: 2, cut: 20, nights: 3 });
  });
});

describe('her cut on the WALK card (final review deferred minor M6)', () => {
  const PUSHES = `
# push-1
*The safe behind the desk is open.*

- crack: Empty the safe. → won-1 / lost-1 [check reflex 50]
- pocket: Take one bundle and go. → won-1

## won-1
*Folded notes.*
pay: +150
→ end

## lost-1
*Someone shouts.*
lost
→ end
`;
  const pushy = parse(JOB.replace('title: Back Door', 'title: push-job').replace('tier: 2', 'tier: 1').replace('starts: haes-noodles', 'starts: lowlight-intake').trimEnd() + '\n' + PUSHES, 'push-job');
  const toCard = async (dealOn: boolean) => {
    const r = intakeRelay({ book: [pushy], trust: dealOn ? 5 : 4, sol: 0, rolls: [66] });
    withDeal(r);
    expect(await r.relay.startQuest('hicks', 'push-job')).toMatchObject({ ok: true });
    const run = () => parseRun(r.db.metaWithPrefix('quest.hicks.push-job@').at(-1)?.v ?? null)!;
    await r.relay.chooseQuest('hicks', { id: 'push-job', beat: run().beat!, choice: 'wait' });
    await r.relay.chooseQuest('hicks', { id: 'push-job', beat: 'desk', choice: 'grab' });
    expect(run().beat).toBe('!push');
    const gross = (run().kit ?? []).reduce((n, e) => n + (e.sol ?? 0), 0);
    return { active: r.relay.questState('hicks').active!, gross };
  };
  it('in force: WALK shows the sol after her cut', async () => {
    const { active, gross } = await toCard(true);
    const net = gross - cutOf(gross, 25);
    expect(active.choices[0].line).toBe(`WALK — ${net} SOL · HEAT +0`);
    expect(active.push!.walk.sol).toBe(net);
  });
  it('suspended: WALK shows the whole sol', async () => {
    const { active, gross } = await toCard(false);
    expect(active.choices[0].line).toBe(`WALK — ${gross} SOL · HEAT +0`);
  });
});

