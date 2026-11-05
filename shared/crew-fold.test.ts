import { describe, expect, it } from 'vitest';
import { storyDay } from './board';
import type { Ability, CrewBook, ErrandKind, Trait } from './crew-book';
import { crewOdds, parseInstance, rollSend, sellErrand, type Recruit } from './crew';
import { wantedFor, type GoodsKind, type Lot } from './goods';
import { foldWithCrew, type FoldJob, type CrewEvent } from './crew-fold';
import { foldKit, type KitEvent } from './mission';
import { callEffect, drawHurtDays, jobShares, type Call, type Setup } from './hand';

const DAY = 1440;
const at = (day: number, hh: number, mm = 0) => (day - 1) * DAY + hh * 60 + mm;

const band = (lines: string[], effect = {}) => ({ effect, lines });
const hustle: ErrandKind = {
  kind: 'hustle',
  label: 'Hustle',
  tag: 'SOL',
  suits: ['fence', 'face'],
  hours: 5,
  risk: 'med',
  needs: { on: 'district', when: 'known' },
  blurb: '',
  bands: { clean: band(['{name} moved it.'], { sol: [300, 400], rep: 1 }), messy: band(['{name} sold half.'], { sol: [150, 150], heat: 1 }), blown: band(['{name} got caught.']) },
};
const kase: ErrandKind = {
  kind: 'case',
  label: 'Case {job}',
  tag: 'PREP',
  suits: ['runner', 'ears'],
  hours: 4,
  risk: 'low',
  needs: { on: 'job' },
  blurb: '',
  bands: { clean: band(['{name} cased it.'], { prep: { flag: 'cased', value: 'clean' } }), messy: band(['{name} was seen.'], { prep: { flag: 'cased', value: 'messy' }, heat: 1 }), blown: band(['{name} was made.']) },
};
const scout: ErrandKind = { ...kase, kind: 'scout', suits: ['ears'], hours: 2, bands: { clean: band(['{name} looked.'], { reveal: true }), messy: band(['{name} looked, seen.'], { reveal: true, heat: 1 }), blown: band(['{name} was made.']) } };
const trait = (id: string, effect: Trait['effect']): Trait => ({ id, label: id.toUpperCase(), good: true, effect, for: 'any', text: '' });
const traits = [trait('slick', { kind: 'odds', errand: 'any', delta: 40 }), trait('dud', { kind: 'odds', errand: 'any', delta: -80 }), trait('busy7', { kind: 'busy', days: 7 }), trait('busy0', { kind: 'busy', days: 0 })];
const book: CrewBook = { names: {}, traits, abilities: [], pitches: {}, errands: [hustle, kase, scout] };
const instance = (id: string) => parseInstance(id, { book, districtOfJob: () => 'karasu', placeOfJob: () => 'lowlight-intake' });

const recruit = (o: Partial<Recruit>): Recruit => ({ id: 'r-a', name: 'Juno Sato', face: null, origin: 'strand', spec: 'face', grade: 1, traits: [], hidden: null, pitch: '', wage: 40, ...o });
const start = { deck: null, nerveMax: 2, from: at(1, 18) };
const rep: KitEvent = { at: at(1, 18), rep: { district: 'strand', delta: 25 } };

/** The seed the fold rolls with, and its roll for a recruit on an errand. */
const rollOf = (r: Recruit, errand: ErrandKind, id: string, heat = 0, ts: Trait[] = []) =>
  rollSend({ odds: crewOdds({ errand, recruit: r, traits: ts, heat, goneUsed: true }), errand, seed: `pt|${id}|${r.id}`, vars: { name: r.name.split(' ')[0] } });
/** A recruit id whose roll on `errand` lands `want`. */
function idFor(want: (r: ReturnType<typeof rollOf>) => boolean, base: Partial<Recruit>, errand: ErrandKind, id: string): Recruit {
  for (let i = 0; i < 5000; i++) {
    const r = recruit({ ...base, id: `r-${i}` });
    if (want(rollOf(r, errand, id))) return r;
  }
  throw new Error('no seed');
}

const fold = (crew: CrewEvent[][], now: number, kitEvents: KitEvent[] = [rep]) => foldWithCrew({ start, kitEvents, crew, now, book, seed: 'pt', instance });
const hire = (r: Recruit, when = at(1, 19), cost = 250): CrewEvent => ({ type: 'hire', at: when, recruit: r, place: 'low-roller', cost });
const send = (errand: string, when = at(1, 20)): CrewEvent => ({ type: 'send', at: when, errand });
const H = 'hustle:strand@0';

describe('foldKit hooks', () => {
  const events: KitEvent[] = [
    { at: at(1, 20), sol: 500, heat: 4, district: 'karasu' },
    { at: at(1, 21), rep: { district: 'karasu', delta: 50 } },
    { at: at(2, 22), edge: -1 },
  ];
  it('keep old results', () => {
    const plain = foldKit(start, events, at(4, 12));
    expect(foldKit(start, events, at(4, 12), { hooks: { items: [], apply: () => ({}), six: () => ({}) } })).toEqual(plain);
  });
  it('six runs before cooling', () => {
    const seen: number[] = [];
    foldKit(start, events, at(2, 12), { hooks: { items: [], apply: () => ({}), six: (k) => (seen.push(k.heat.karasu), {}) } });
    expect(seen).toEqual([4]);
  });
});

describe('foldWithCrew', () => {
  it('hire then hustle lands', () => {
    const r = idFor((x) => x.band === 'clean', {}, hustle, H);
    const roll = rollOf(r, hustle, H);
    const { kit, crew } = fold([[hire(r), send(H)]], at(2, 2));
    // The sign-on takes sol to 0 (never below), then the hustle pays.
    expect(kit.sol).toBe(roll.sol);
    expect(kit.rep.strand).toBe(26);
    const m = crew.members[0];
    expect(m.state).toBe('ready');
    expect(m.log[0]).toMatchObject({ at: at(2, 1), band: 'clean', fate: null, line: 'Juno moved it.', effects: `+${roll.sol} SOL · STRAND REP +1` });
    expect(crew.latest).toBe(at(2, 1));
  });

  it('not landed before due', () => {
    const r = idFor((x) => x.band === 'clean', {}, hustle, H);
    const m = fold([[hire(r), send(H)]], at(2, 1) - 1).crew.members[0];
    expect(m).toMatchObject({ state: 'out', due: at(2, 1), errand: H });
    expect(m.log).toEqual([]);
  });

  it('a recruit who ran nothing draws no wage', () => {
    expect(fold([[hire(recruit({}), at(1, 19), 0)]], at(3, 7), [rep, { at: at(1, 18), sol: 100 }]).kit.sol).toBe(100);
  });
  it('wages short mid-roster', () => {
    const a = recruit({ id: 'r-a' });
    const b = recruit({ id: 'r-b' });
    const c = recruit({ id: 'r-c' });
    const night = (d: number) => ({ key: `k${d}`, title: 'Job', district: 'karasu', setup: { approach: 'quiet' as const, people: ['r-a', 'r-b', 'r-c'], favour: false, at: at(d, 20) }, calls: [], end: { at: at(d, 22), tier: 'messy' as const, getOut: false } });
    const run = (nights: number[], now: number) => foldWithCrew({ start, kitEvents: [rep, { at: at(1, 18), sol: 100 }], crew: [[hire(c, at(1, 19, 2), 0)], [hire(a, at(1, 19), 0)], [hire(b, at(1, 19, 1), 0)]], now, book, seed: 'pt', instance, jobs: nights.map(night) });
    // 100 sol after the hires, all three on a job: a (40) and b (40) are paid at 06:00, c isn't.
    const { kit, crew } = run([1], at(2, 7));
    expect(kit.sol).toBe(20);
    expect(crew.members.map((m) => [m.recruit.id, m.loyalty])).toEqual([['r-a', 50], ['r-b', 50], ['r-c', 35]]);
    // The next unpaid night: 35 → 20, SHAKY, and c walks. 20 sol covers nobody.
    const later = run([1, 2], at(3, 7));
    expect(later.kit.sol).toBe(20);
    expect(later.crew.members.find((m) => m.recruit.id === 'r-c')).toMatchObject({ state: 'gone', gone: 'walked' });
  });

  it('recall and let go cancel the landing', () => {
    const r = idFor((x) => x.band === 'clean', {}, hustle, H);
    for (const stop of ['recall', 'letgo'] as const) {
      const { kit, crew } = fold([[hire(r, at(1, 19), 0), send(H), { type: stop, at: at(1, 21) }]], at(2, 3));
      expect(kit.sol).toBe(0);
      expect(crew.members[0].log).toEqual([]);
      expect(crew.members[0].state).toBe(stop === 'recall' ? 'ready' : 'gone');
      expect(crew.taken).toEqual([H]);
    }
  });

  it('growth', () => {
    // Three clean hustles on three nights promote a GREEN to HAND.
    const ids = [0, 1, 2].map((d) => `hustle:strand@${d}`);
    let r: Recruit | null = null;
    for (let i = 0; i < 20000 && !r; i++) {
      const c = recruit({ id: `r-${i}`, grade: 0, wage: 25, traits: ['slick', 'busy0'], hidden: 'busy0' });
      if (ids.every((id) => rollOf(c, hustle, id, 0, [traits[0], traits[3]]).band === 'clean')) r = c;
    }
    const evs: CrewEvent[] = [hire(r!, at(1, 19), 0), ...ids.map((id, d) => send(id, at(1 + d, 20)))];
    const before = fold([evs.slice(0, 3)], at(3, 3)).crew.members[0];
    expect(before.revealed).toEqual(['slick']);
    expect(before.toNext).toBe(1);
    const m = fold([evs], at(4, 3)).crew.members[0];
    expect(m.recruit.grade).toBe(1);
    expect(m.recruit.wage).toBe(40);
    expect(m.log[0].promoted?.to).toBe(1);
    // A promotion no longer draws a trait (crew abilities spec §1).
    expect(m.recruit.traits).toEqual(['slick', 'busy0']);
    expect(m.log[0].promoted?.trait).toBeUndefined();
    expect(m.toNext).toBe(5);
  });

  it('held, talking, bail', () => {
    const r = idFor((x) => x.fate === 'held', { traits: ['dud'] }, hustle, H);
    const evs = [hire(r, at(1, 19), 0), send(H)];
    const held = fold([evs], at(2, 3)).crew.members[0];
    expect(held.state).toBe('held');
    expect(held.loyalty).toBe(40);
    // 40 → 30 (06:00 day 2) → 20, SHAKY, at day 3's 06:00: talks. The heat lands after that 06:00's cooling.
    const talked = fold([evs], at(3, 7));
    expect(talked.crew.members[0]).toMatchObject({ state: 'gone', gone: 'talked' });
    expect(talked.kit.heat.strand).toBe(2);
    const bailed = fold([[...evs, { type: 'bail', at: at(2, 3), cost: 600 }]], at(2, 4), [rep, { at: at(1, 18), sol: 1000 }]);
    expect(bailed.crew.members[0]).toMatchObject({ state: 'ready', loyalty: 55 });
    expect(bailed.kit.sol).toBe(400);
  });

  it('hurt and the doc', () => {
    const r = idFor((x) => x.fate === 'hurt' && x.hurtDays === 3, { traits: ['dud'] }, hustle, H);
    const evs = [hire(r, at(1, 19), 0), send(H)];
    expect(fold([evs], at(2, 3)).crew.members[0]).toMatchObject({ state: 'hurt', hurtDays: 3 });
    expect(fold([evs], at(2, 7)).crew.members[0]).toMatchObject({ state: 'hurt', hurtDays: 2 });
    const doc = fold([[...evs, { type: 'doc', at: at(2, 3) }]], at(2, 7), [rep, { at: at(1, 18), sol: 500 }]);
    expect(doc.crew.members[0].hurtDays).toBe(1);
    expect(doc.kit.sol).toBe(400 - 40);
    // Paid each night (unpaid, a hurt recruit would walk first).
    expect(fold([evs], at(5, 7), [rep, { at: at(1, 18), sol: 1000 }]).crew.members[0].state).toBe('ready');
  });

  it('gone hits morale', () => {
    const r = idFor((x) => x.fate === 'gone', { traits: ['dud'] }, hustle, H);
    const other = recruit({ id: 'r-zz' });
    const { crew } = fold([[hire(r, at(1, 19), 0), send(H)], [hire(other, at(1, 19), 0)]], at(2, 3));
    expect(crew.members.find((m) => m.recruit.id === r.id)).toMatchObject({ state: 'gone', gone: 'dead' });
    expect(crew.members.find((m) => m.recruit.id === 'r-zz')!.loyalty).toBe(45);
  });

  it('prep and scout', () => {
    const C = 'case:back-door@0';
    const clean = idFor((x) => x.band === 'clean', { spec: 'runner' }, kase, C);
    expect(fold([[hire(clean, at(1, 19), 0), send(C)]], at(2, 3)).crew.prep['back-door@0']).toEqual({ cased: 'clean' });
    const blown = idFor((x) => x.band === 'blown', { spec: 'runner', traits: ['dud'] }, kase, C);
    expect(fold([[hire(blown, at(1, 19), 0), send(C)]], at(2, 3)).crew.prep['back-door@0']).toEqual({ 'blown-prep': 'case' });
    const S = 'scout:back-door@0';
    const s = idFor((x) => x.band !== 'blown', { spec: 'ears' }, scout, S);
    expect(fold([[hire(s, at(1, 19), 0), send(S)]], at(2, 3)).crew.scouted).toEqual(['back-door@0']);
  });

  it('deterministic', () => {
    const a = recruit({ id: 'r-a' });
    const b = recruit({ id: 'r-b' });
    const lists = [[hire(a, at(1, 19), 0), send(H)], [hire(b, at(1, 19, 5), 0)]];
    expect(fold(lists, at(3, 3))).toEqual(fold(lists, at(3, 3)));
    expect(fold([...lists].reverse(), at(3, 3))).toEqual(fold(lists, at(3, 3)));
  });

  it('busy', () => {
    const b7 = recruit({ id: 'r-b7', traits: ['busy7'] });
    const b0 = recruit({ id: 'r-b0', traits: ['busy0'] });
    const { crew } = fold([[hire(b7, at(1, 19), 0)], [hire(b0, at(1, 19), 0)]], at(1, 20));
    expect(crew.members.find((m) => m.recruit.id === 'r-b7')!.busy).toBe(true);
    expect(crew.members.find((m) => m.recruit.id === 'r-b0')!.busy).toBe(false);
    // A busy recruit's send is ignored.
    expect(fold([[hire(b7, at(1, 19), 0), send(H)]], at(1, 21)).crew.members[0].state).toBe('ready');
  });

  it('lost errand kind', () => {
    const r = recruit({});
    const { kit, crew } = fold([[hire(r, at(1, 19), 0), send('gone-kind:strand@0')]], at(1, 21));
    expect(kit.sol).toBe(0);
    expect(crew.members[0].log[0]).toMatchObject({ band: 'messy', line: 'Juno came back with nothing to say.' });
    expect(crew.members[0].state).toBe('ready');
  });

  it('taken is today only', () => {
    const r = idFor((x) => x.band === 'clean', {}, hustle, H);
    expect(fold([[hire(r, at(1, 19), 0), send(H)]], at(1, 22)).crew.taken).toEqual([H]);
    expect(storyDay(at(2, 7))).toBe(1);
    expect(fold([[hire(r, at(1, 19), 0), send(H)]], at(2, 7)).crew.taken).toEqual([]);
  });
});

describe('foldWithCrew review fixes', () => {
  it('an errand is taken once a day', () => {
    const a = idFor((x) => x.band === 'clean', {}, hustle, H);
    const b = recruit({ id: 'r-other' });
    // B on the same errand, and A recalled and re-sent: only A's first send counts, and it was recalled.
    const { kit, crew } = fold([[hire(a, at(1, 19), 0), send(H), { type: 'recall', at: at(1, 20, 30) }, send(H, at(1, 21))], [hire(b, at(1, 19, 1), 0), send(H, at(1, 20, 10))]], at(2, 5));
    expect(kit.sol).toBe(0);
    expect(crew.members.every((m) => m.state === 'ready' && m.log.length === 0)).toBe(true);
    expect(crew.taken).toEqual([H]);
  });

  it("a send for another day's errand is ignored", () => {
    const a = idFor((x) => x.band === 'clean', {}, hustle, H);
    expect(fold([[hire(a, at(1, 19), 0), send(H, at(2, 20))]], at(3, 5)).crew.members[0].log).toEqual([]);
  });

  it('goneUsed is on the member', () => {
    const r = recruit({});
    expect(fold([[hire(r, at(1, 19), 0)]], at(1, 20)).crew.members[0].goneUsed).toBe(false);
  });

  it('a hire and a send in the same minute fold hire first, whatever the list order', () => {
    const a = idFor((x) => x.band === 'clean', {}, hustle, H);
    const h = hire(a, at(1, 20), 0);
    const s = send(H, at(1, 20));
    const m = fold([[s, h]], at(2, 5)).crew.members;
    expect(m).toHaveLength(1);
    expect(m[0].log).toHaveLength(1);
  });

  it('events before the hire are no-ops, not a lost recruit', () => {
    const a = recruit({});
    const m = fold([[send(H, at(1, 18)), hire(a, at(1, 19), 0)]], at(1, 21)).crew.members;
    expect(m).toHaveLength(1);
    expect(m[0].state).toBe('ready');
  });
});

describe('the hand: crew on a job', () => {
  const K = 'quest.hicks.back-door@0';
  const setup = (people: string[], o: Partial<Setup> = {}): Setup => ({ approach: 'quiet', people, favour: false, at: at(1, 20), ...o });
  const job = (s: Setup, calls: Call[], end: { at: number; tier: 'clean' | 'messy' | 'blown'; getOut?: boolean; walked?: boolean } | null) => ({ key: K, title: 'Back Door', district: 'karasu', setup: s, calls, end: end ? { getOut: false, ...end } : null });
  const foldJobs = (rs: Recruit[], jobs: ReturnType<typeof job>[], now: number, ts: Trait[] = traits) =>
    foldWithCrew({ start, kitEvents: [rep], crew: rs.map((r) => [hire(r)]), now, book: { ...book, traits: ts }, seed: 'pt', instance, jobs });
  const dez = recruit({ id: 'dez', name: 'Dez Vance', spec: 'runner' });

  it('a job costs its recruit one night of wages', () => {
    const j = job(setup(['dez']), [], { at: at(1, 22), tier: 'messy' });
    // No sol here: a wage due goes unpaid, an idle night owes nothing.
    expect(foldJobs([dez], [j], at(3, 7)).crew.members[0].loyalty).toBeLessThan(foldJobs([dez], [], at(3, 7)).crew.members[0].loyalty);
  });
  it('a job below the recruit moves them half as far; one from before counts full', () => {
    const hand = { ...dez, grade: 1 as const };
    const run = (n: number, tier?: number) => job(setup(['dez'], tier ? { tier } : {}), [], { at: at(1, 21 + n), tier: 'clean' });
    const left = (tier?: number) => foldJobs([hand], [run(0, tier)], at(2, 0)).crew.members[0].toNext;
    expect(left(1)).toBe(4.5);
    expect(left(2)).toBe(4);
    expect(left()).toBe(4);
  });

  it('on a job from GO IN until its end, then ready', () => {
    const j = [job(setup(['dez']), [], { at: at(1, 22), tier: 'messy' })];
    expect(foldJobs([dez], j, at(1, 21)).crew.members[0]).toMatchObject({ state: 'job', job: 'Back Door' });
    const after = foldJobs([dez], j, at(1, 23)).crew.members[0];
    expect(after.state).toBe('ready');
    expect(after.job).toBeUndefined();
    expect(after.runs.messy).toBe(1);
  });

  it('old runs: no jobs fold as now', () => {
    expect(foldJobs([dez], [], at(1, 23))).toEqual(foldWithCrew({ start, kitEvents: [rep], crew: [[hire(dez)]], now: at(1, 23), book, seed: 'pt', instance }));
  });

  it('clean counts toward the next grade and loyalty +5', () => {
    const m = foldJobs([dez], [job(setup(['dez']), [], { at: at(1, 22), tier: 'clean' })], at(1, 23)).crew.members[0];
    expect(m).toMatchObject({ state: 'ready', toNext: 4, loyalty: 55 });
    expect(m.runs.clean).toBe(1);
  });

  it('call losses land at their pick, count down, and draw nothing more at the end', () => {
    const c: Call = { beat: 'desk', choice: 'grab', card: 'dez', again: true, at: at(1, 21), loss: 'hurt' };
    const j = [job(setup(['dez']), [{ ...c, again: false, loss: undefined, at: at(1, 20, 30) }, c], { at: at(1, 22), tier: 'blown' })];
    const mid = foldJobs([dez], j, at(1, 21, 30)).crew.members[0];
    expect(mid.state).toBe('hurt');
    expect(mid.hurtDays).toBe(drawHurtDays(`${K}|desk|dez|days`, 'med'));
    const end = foldJobs([dez], j, at(1, 23)).crew.members[0];
    expect(end).toMatchObject({ state: 'hurt', loyalty: 50 });
    expect(end.runs.blown).toBe(0);
  });

  it('blown fates match jobShares; gone hits everyone', () => {
    for (let i = 0; i < 40; i++) {
      const r = recruit({ id: `r${i}`, name: 'Rae Moss', spec: 'runner' });
      const share = jobShares({ setup: setup([r.id]), calls: [], tier: 'blown', seed: K, recruits: [{ id: r.id, spec: 'runner', traits: [], goneUsed: false }] })[0];
      const m = foldJobs([r, dez], [job(setup([r.id]), [], { at: at(1, 22), tier: 'blown' })], at(1, 23)).crew.members;
      const me = m.find((x) => x.recruit.id === r.id)!;
      if (share.fate === 'gone') {
        expect(me).toMatchObject({ state: 'gone', gone: 'dead' });
        expect(m.find((x) => x.recruit.id === 'dez')!.loyalty).toBe(45);
      } else expect(me).toMatchObject({ state: share.fate, loyalty: 40 });
    }
  });

  it('messy heat: a gossip on a MESSY job puts its heat on the job district', () => {
    const gossip = trait('gossip', { kind: 'heat-on-messy', n: 1 });
    const g = recruit({ id: 'g', name: 'Gil Moss', spec: 'ears', traits: ['gossip'] });
    const k = foldJobs([g], [job(setup(['g']), [], { at: at(1, 22), tier: 'messy' })], at(1, 23), [...traits, gossip]).kit;
    expect(k.heat.karasu).toBe(1);
  });

  it('rewind replays call losses', () => {
    const c: Call = { beat: 'desk', choice: 'grab', card: 'dez', again: true, at: at(1, 21), loss: 'held' };
    const j = (calls: Call[]) => [job(setup(['dez']), calls, null)];
    expect(foldJobs([dez], j([]), at(1, 21, 30)).crew.members[0].state).toBe('job');
    const a = foldJobs([dez], j([c]), at(1, 21, 30)).crew.members[0];
    expect(a.state).toBe('held');
    expect(foldJobs([dez], j([c]), at(1, 21, 30)).crew.members[0]).toEqual(a);
  });

  it('a job that starts in the minute the last one ended takes the same crew, whatever order the runs come in', () => {
    const first = { ...job(setup(['dez']), [], { at: at(1, 21), tier: 'messy' }), key: 'quest.hicks.marked-cards@0' };
    const next = { ...job(setup(['dez'], { at: at(1, 21) }), [], { at: at(1, 22), tier: 'clean' }), key: 'quest.hicks.house-rules@0' };
    for (const jobs of [[first, next], [next, first]]) {
      const m = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(dez)]], now: at(1, 23), book, seed: 'pt', instance, jobs }).crew.members[0];
      expect(m.runs).toEqual({ clean: 1, messy: 1, blown: 0 });
    }
  });

  it('a send while on a job does nothing', () => {
    const r = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(dez), send(H, at(1, 21))]], now: at(1, 21, 30), book, seed: 'pt', instance, jobs: [job(setup(['dez']), [], null)] });
    expect(r.crew.members[0].state).toBe('job');
  });
});

describe('crew phase 2 (crew spec §5)', () => {
  const setup = (people: string[], o: Partial<Setup> = {}): Setup => ({ approach: 'quiet', people, favour: false, at: at(1, 20), ...o });
  const dez = recruit({ id: 'dez', name: 'Dez Vance', spec: 'runner' });
  const pell = recruit({ id: 'pell', name: 'Pell Ash', spec: 'muscle' });
  // Dez is taken on Back Door's call at 21:00; the job ends blown at 22:00.
  const taken: Call = { beat: 'desk', choice: 'grab', card: 'dez', again: true, at: at(1, 21), loss: 'held' };
  const backDoor = { key: 'quest.hicks.back-door@0', title: 'Back Door', district: 'karasu', setup: setup(['dez']), calls: [taken], end: { at: at(1, 22), tier: 'blown' as const, getOut: false } };
  const rescue = (tier: 'clean' | 'messy' | 'blown', o: { getOut?: boolean; walked?: boolean; endAt?: number; people?: string[]; key?: string } = {}) => ({
    key: o.key ?? 'quest.hicks.spring-quiet@0',
    title: 'Spring',
    district: 'strand',
    setup: setup(o.people ?? ['pell'], { at: at(1, 23, 30) }),
    calls: [],
    end: { at: o.endAt ?? at(2, 1), tier, getOut: o.getOut ?? false },
    spring: 'dez',
  });
  const spring = (when = at(1, 23), job = 'spring-quiet'): CrewEvent => ({ type: 'spring', at: when, job });
  const run = (dezEvents: CrewEvent[], jobs: unknown[], now: number) =>
    foldWithCrew({ start, kitEvents: [rep], crew: [[hire(dez), ...dezEvents], [hire(pell, at(1, 19, 1))]], now, book, seed: 'pt', instance, jobs: jobs as never });
  const dezOf = (s: ReturnType<typeof run>) => s.crew.members.find((m) => m.recruit.id === 'dez')!;

  it('a vouched hire starts at its loyalty, keeps who vouched and costs nothing', () => {
    const s = foldWithCrew({ start, kitEvents: [rep], crew: [[{ type: 'hire', at: at(1, 19), recruit: dez, place: 'the-tilt', cost: 0, loyalty: 70, vouched: 'cass' }]], now: at(1, 20), book, seed: 'pt', instance });
    expect(s.crew.members[0]).toMatchObject({ loyalty: 70, vouched: 'cass' });
    expect(s.kit.sol).toBe(foldWithCrew({ start, kitEvents: [rep], crew: [], now: at(1, 20), book, seed: 'pt', instance }).kit.sol);
  });

  it('a spring sets the member spring while held', () => {
    expect(dezOf(run([spring()], [backDoor], at(1, 23, 10)))).toMatchObject({ state: 'held', spring: { job: 'spring-quiet', day: 0 } });
  });

  it('a spring while not held does nothing', () => {
    expect(dezOf(run([spring(at(1, 20, 30))], [backDoor], at(1, 23, 10))).spring).toBeUndefined();
  });

  it('a spring job ended clean frees them with +15', () => {
    const m = dezOf(run([spring()], [backDoor, rescue('clean')], at(2, 2)));
    expect(m).toMatchObject({ state: 'ready', loyalty: 65 });
    expect(m.spring).toBeUndefined();
    expect(m.log[0]).toMatchObject({ line: 'Dez is out.', effects: 'SPRUNG', from: 'job' });
  });

  it('a messy spring, or one that GETs OUT, frees them too', () => {
    expect(dezOf(run([spring()], [backDoor, rescue('messy')], at(2, 2))).state).toBe('ready');
    expect(dezOf(run([spring()], [backDoor, rescue('messy', { getOut: true })], at(2, 2))).state).toBe('ready');
  });

  it('a blown spring leaves them held at -10', () => {
    // Nobody else on it: a crewmate lost on the job would cost Dez 5 more.
    const m = dezOf(run([spring()], [backDoor, rescue('blown', { people: [] })], at(2, 2)));
    expect(m).toMatchObject({ state: 'held', loyalty: 40 });
    expect(m.log[0]).toMatchObject({ line: 'Dez is still inside.', from: 'job' });
  });

  it('a spring job ending after they were bailed changes nothing more', () => {
    const m = dezOf(run([spring(), { type: 'bail', at: at(1, 23, 40), cost: 600 }], [backDoor, rescue('clean')], at(2, 2)));
    expect(m).toMatchObject({ state: 'ready', loyalty: 65 });
    expect(m.log[0].effects).not.toBe('SPRUNG');
  });

  it('a spring job ending after they were left frees nobody', () => {
    const m = dezOf(run([spring(), { type: 'leave', at: at(1, 23, 40) }], [backDoor, rescue('clean')], at(2, 2)));
    expect(m).toMatchObject({ state: 'gone', gone: 'left', goneAt: at(1, 23, 40) });
  });

  it("another file's job, or another night's, doesn't free them", () => {
    expect(dezOf(run([spring()], [backDoor, rescue('clean', { key: 'quest.hicks.spring-loud@0' })], at(2, 2))).state).toBe('held');
  });

  it('a second spring the same day does nothing; one the next day counts', () => {
    expect(dezOf(run([spring(), spring(at(1, 23, 20), 'spring-loud')], [backDoor], at(1, 23, 30))).spring).toEqual({ job: 'spring-quiet', day: 0 });
    // Held through 06:00 (−10), sprung again on day 1.
    expect(dezOf(run([spring(), spring(at(2, 7), 'spring-loud')], [backDoor], at(2, 8))).spring).toEqual({ job: 'spring-loud', day: 1 });
  });

  it('one rescue a night across the roster: a second recruit sprung the same day does nothing', () => {
    const koji = recruit({ id: 'koji', name: 'Koji Mar', spec: 'face' });
    const kojiTaken: Call = { beat: 'desk', choice: 'grab', card: 'koji', again: true, at: at(1, 21), loss: 'held' };
    const both = { ...backDoor, setup: setup(['dez', 'koji']), calls: [taken, kojiTaken] };
    const s = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(dez), spring()], [hire(koji, at(1, 19, 2)), { type: 'spring', at: at(1, 23, 5), job: 'spring-loud' }]], now: at(1, 23, 30), book, seed: 'pt', instance, jobs: [both] as never });
    expect(s.crew.members.find((m) => m.recruit.id === 'dez')!.spring).toEqual({ job: 'spring-quiet', day: 0 });
    expect(s.crew.members.find((m) => m.recruit.id === 'koji')!.spring).toBeUndefined();
  });

  it('a crew action in the minute a job took them comes after it (SPRING THEM right after the debrief)', () => {
    // Taken on the call at 21:00, sprung at 21:00.
    expect(dezOf(run([spring(at(1, 21))], [backDoor], at(1, 21, 30))).spring).toEqual({ job: 'spring-quiet', day: 0 });
  });

  it('a hire and a GO IN in the same minute still take the hire on the job', () => {
    const j = { ...backDoor, calls: [], setup: setup(['dez'], { at: at(1, 19) }), end: null };
    expect(dezOf(run([], [j], at(1, 19, 30))).state).toBe('job');
  });

  it('final review I1: RECALL then GO IN in the same minute takes them on the job', () => {
    const j = { ...backDoor, calls: [], setup: setup(['dez'], { at: at(1, 20) }), end: null };
    const s = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(dez), send(H, at(1, 19, 30)), { type: 'recall', at: at(1, 20) }]], now: at(1, 20, 30), book, seed: 'pt', instance, jobs: [j] as never });
    expect(s.crew.members[0].state).toBe('job');
  });

  it('final review I2: one rescue a night holds after the first rescue frees them', () => {
    const koji = recruit({ id: 'koji', name: 'Koji Mar', spec: 'face' });
    const kojiTaken: Call = { beat: 'desk', choice: 'grab', card: 'koji', again: true, at: at(1, 21), loss: 'held' };
    const both = { ...backDoor, setup: setup(['dez', 'koji']), calls: [taken, kojiTaken] };
    const s = foldWithCrew({
      start,
      kitEvents: [rep],
      crew: [[hire(dez), spring()], [hire(koji, at(1, 19, 2)), { type: 'spring', at: at(2, 1, 30), job: 'spring-loud' }]],
      now: at(2, 2),
      book,
      seed: 'pt',
      instance,
      jobs: [both, rescue('clean', { people: [] })] as never,
    });
    expect(s.crew.members.find((m) => m.recruit.id === 'dez')!.state).toBe('ready');
    expect(s.crew.members.find((m) => m.recruit.id === 'koji')!.spring).toBeUndefined();
    expect(s.crew.springDays).toEqual([0]);
  });

  it('talked sets goneAt at that 06:00', () => {
    // Held from 21:00 at 50: −10 a night, SHAKY (< 25) after three 06:00s, so they talk at the third.
    const m = dezOf(run([], [backDoor], at(5, 7)));
    expect(m).toMatchObject({ state: 'gone', gone: 'talked', goneAt: at(4, 6) });
  });

  it("a job's log lines carry from: 'job'; an errand's don't", () => {
    expect(dezOf(run([], [backDoor], at(1, 23))).log[0].from).toBe('job');
    const s = fold([[hire(dez), send(H)]], at(2, 3));
    expect(s.crew.members[0].log[0].from).toBeUndefined();
  });
});

describe('abilities (crew abilities spec §1, §3)', () => {
  const ab = (id: string, from: Ability['from'], o: Partial<Ability> = {}): Ability => ({ id, label: id.toUpperCase().replace(/-/g, ' '), for: ['face'], from, job: { kind: 'die' }, text: '', ...o });
  const abilities = [ab('read-the-room', 0), ab('smooth', 0, { job: { kind: 'heat' } }), ab('cover', 1), ab('one-more', 2, { job: { kind: 'again' } }), ab('talk-down', 3, { job: { kind: 'save' } })];
  const abook: CrewBook = { ...book, abilities };
  const K = (n: number) => `quest.hicks.job-${n}@0`;
  const setup = (people: string[], when: number): Setup => ({ approach: 'quiet', people, favour: false, at: when });
  const cleanJob = (rid: string, n: number) => ({ key: K(n), title: `Job ${n}`, district: 'karasu', setup: setup([rid], at(1, 20) + n * 10), calls: [], end: { at: at(1, 20) + n * 10 + 5, tier: 'clean' as const, getOut: false } });
  const foldA = (crew: CrewEvent[][], now: number, jobs: ReturnType<typeof cleanJob>[] = [], b: CrewBook = abook) => foldWithCrew({ start, kitEvents: [rep], crew, now, book: b, seed: 'pt', instance, jobs });
  const juno = (o: Partial<Recruit> = {}) => recruit({ id: 'juno', grade: 0, abilities: ['read-the-room'], ...o });
  const three = [1, 2, 3].map((n) => cleanJob('juno', n));
  const later = at(1, 22);

  it('hire slots the hire ability', () => {
    expect(foldA([[hire(juno())]], at(1, 20)).crew.members[0]).toMatchObject({ abilities: ['read-the-room'], slotted: ['read-the-room'], picks: [] });
  });
  it('legacy recruit: no abilities on the hire gets one, seeded, slotted', () => {
    const r = juno({ abilities: undefined });
    const a = foldA([[hire(r)]], at(1, 20)).crew.members[0];
    expect(a.abilities).toHaveLength(1);
    expect(['read-the-room', 'smooth']).toContain(a.abilities[0]);
    expect(a.slotted).toEqual(a.abilities);
    expect(foldA([[hire(r)]], at(1, 20)).crew.members[0].abilities).toEqual(a.abilities);
  });
  it('promotion opens a pick, not a trait', () => {
    const m = foldA([[hire(juno())]], later, three).crew.members[0];
    expect(m.recruit.grade).toBe(1);
    expect(m.picks).toHaveLength(1);
    expect(m.picks[0].grade).toBe(1);
    expect([...m.picks[0].offer].sort()).toEqual(['cover', 'smooth']);
    expect(m.recruit.traits).toEqual([]);
    expect(m.log[0].promoted).toEqual({ to: 1 });
  });
  it('learn takes the pick; a HAND with its slot full keeps it unslotted', () => {
    const m = foldA([[hire(juno()), { type: 'learn', at: later, ability: 'cover', grade: 1 }]], later + 1, three).crew.members[0];
    expect(m.abilities).toEqual(['read-the-room', 'cover']);
    expect(m.picks).toEqual([]);
    expect(m.slotted).toEqual(['read-the-room']);
  });
  it('learn into a free slot slots it', () => {
    const m = foldA([[hire(juno()), { type: 'unslot', at: at(1, 19, 30), ability: 'read-the-room' }, { type: 'learn', at: later, ability: 'cover', grade: 1 }]], later + 1, three).crew.members[0];
    expect(m.slotted).toEqual(['cover']);
  });
  it('learn refused: not on the offer, or the wrong grade', () => {
    for (const ev of [{ type: 'learn', at: later, ability: 'talk-down', grade: 1 }, { type: 'learn', at: later, ability: 'cover', grade: 2 }] as CrewEvent[]) {
      const m = foldA([[hire(juno()), ev]], later + 1, three).crew.members[0];
      expect(m.abilities).toEqual(['read-the-room']);
      expect(m.picks).toHaveLength(1);
    }
  });
  it('queued picks: the second offer leaves out the first; a stored KEEP lands by grade', () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => cleanJob('juno', n));
    const m = foldA([[hire(juno())]], at(1, 23), eight).crew.members[0];
    expect(m.recruit.grade).toBe(2);
    expect(m.picks.map((p) => p.grade)).toEqual([1, 2]);
    // The second offer leaves out what the first offers.
    for (const id of m.picks[1].offer) expect(m.picks[0].offer).not.toContain(id);
    const second = m.picks[1].offer[0];
    // A stored KEEP lands on its own grade's pick, even past a pick whose ability has left the book (crew cleanup spec §4): the relay holds the order.
    const past = foldA([[hire(juno()), { type: 'learn', at: at(1, 23), ability: 'gone-now', grade: 1 }, { type: 'learn', at: at(1, 23), ability: second, grade: 2 }]], at(1, 23) + 1, eight).crew.members[0];
    expect(past.abilities).toContain(second);
    expect(past.picks.map((p) => p.grade)).toEqual([1]);
  });
  it('slot and unslot, a swap with out, nothing while out on an errand', () => {
    const pro = juno({ grade: 2, abilities: ['read-the-room'] });
    const base: CrewEvent[] = [hire(pro), { type: 'unslot', at: at(1, 19, 10), ability: 'read-the-room' }];
    expect(foldA([base], at(1, 20)).crew.members[0].slotted).toEqual([]);
    expect(foldA([[...base, { type: 'slot', at: at(1, 19, 20), ability: 'read-the-room' }]], at(1, 20)).crew.members[0].slotted).toEqual(['read-the-room']);
    // An ability they don't know does nothing.
    expect(foldA([[hire(juno()), { type: 'slot', at: at(1, 19, 20), ability: 'cover' }]], at(1, 20)).crew.members[0].slotted).toEqual(['read-the-room']);
    // A GREEN's one slot is full: a second slot does nothing, a swap with out takes it.
    const known = juno({ abilities: ['read-the-room', 'smooth'] });
    expect(foldA([[hire(known), { type: 'slot', at: at(1, 19, 20), ability: 'smooth' }]], at(1, 20)).crew.members[0].slotted).toEqual(['read-the-room']);
    expect(foldA([[hire(known), { type: 'slot', at: at(1, 19, 20), ability: 'smooth', out: 'read-the-room' }]], at(1, 20)).crew.members[0].slotted).toEqual(['smooth']);
    const out = foldA([[hire(known), send(H, at(1, 19, 10)), { type: 'unslot', at: at(1, 19, 20), ability: 'read-the-room' }]], at(1, 19, 30)).crew.members[0];
    expect(out.state).toBe('out');
    expect(out.slotted).toEqual(['read-the-room']);
  });
  it('a slotted ability gives no errand bonus', () => {
    const r = recruit({ id: 'r-plain', abilities: ['cover'] });
    expect(foldA([[hire(r), send(H)]], at(2, 3)).crew.members[0].log[0].band).toBe(rollOf(r, hustle, H).band);
  });
  it('a never-held trait still holds on an errand', () => {
    const nh: Trait = trait('nh', { kind: 'never-held' });
    const b2: CrewBook = { ...abook, traits: [...traits, nh] };
    const r = idFor((x) => x.fate === 'held', { traits: ['dud', 'nh'] }, hustle, H);
    expect(foldA([[hire(r), send(H)]], at(2, 3), [], b2).crew.members[0].state).toBe('hurt');
  });
  it('rewind past learn: the pick is open again', () => {
    expect(foldA([[hire(juno())]], later + 1, three).crew.members[0].picks).toHaveLength(1);
  });
  it('an ability gone from the book drops out of known, slotted and offers', () => {
    const m = foldA([[hire(juno())]], later, three, { ...abook, abilities: abilities.filter((a) => a.id !== 'read-the-room' && a.id !== 'smooth') }).crew.members[0];
    expect(m.abilities).toEqual([]);
    expect(m.slotted).toEqual([]);
    expect(m.picks).toEqual([{ grade: 1, offer: ['cover'] }]);
  });
  it('final review I1: a KEEP stands after abilities.md gains a line (the offer is redrawn, the choice is kept)', () => {
    const kept = foldA([[hire(juno())]], later, three).crew.members[0].picks[0].offer[0];
    const events: CrewEvent[] = [hire(juno()), { type: 'learn', at: later, ability: kept, grade: 1 }];
    const more: CrewBook = { ...abook, abilities: [...abilities, ab('new-one', 0), ab('new-two', 1)] };
    const m = foldA([events], later + 1, three, more).crew.members[0];
    expect(m.abilities).toEqual(['read-the-room', kept]);
    expect(m.picks).toEqual([]);
    // Still refused: one they already know, one above their grade, one not of their specialty.
    for (const ability of ['read-the-room', 'talk-down']) expect(foldA([[hire(juno()), { type: 'learn', at: later, ability, grade: 1 }]], later + 1, three).crew.members[0].picks).toHaveLength(1);
  });
});

describe('the stash (crew goods spec)', () => {
  const lines = (effect = {}) => ({ effect, lines: ['{name} went.'] });
  const bands = { clean: lines({ lot: 'full' }), messy: lines({ lot: 'damaged', heat: 1 }), blown: lines() };
  const pull: ErrandKind = { kind: 'pull-drive', label: 'Pull', tag: 'SOL', group: 'collect', gives: ['data'], suits: ['runner'], hours: 3, risk: 'low', needs: { on: 'offer' }, blurb: '', bands };
  const buy: ErrandKind = { ...pull, kind: 'buy-cheap', suits: ['fence'], gives: ['any'], cost: 0.4 };
  const sell: ErrandKind = { ...pull, kind: 'sell', group: 'hustle', gives: undefined, suits: ['runner', 'ears', 'face', 'fence', 'muscle'], hours: 5, risk: 'med', needs: { on: 'lot' }, bands: { clean: lines({ rep: 1 }), messy: lines(), blown: lines() } };
  const data: GoodsKind = { id: 'data', label: 'Data', route: 'runner', value: 380 };
  const gb: CrewBook = { ...book, errands: [pull, buy, sell], goods: [data] };
  const inst = (id: string) => parseInstance(id, { book: gb, districtOfJob: () => null, placeOfJob: () => null });
  const P = 'pull-drive:strand:data@0';
  const B = 'buy-cheap:strand:data@0';
  const S = (lot: string, day = 1, d = 'strand') => `sell:${lot}:strand@${day}`.replace('strand@', `${d}@`);
  const go = (crew: CrewEvent[][], now: number, jobs?: FoldJob[]) => foldWithCrew({ start, kitEvents: [rep, { at: at(1, 18), sol: 1000 }], crew, now, book: gb, seed: 'pt', instance: inst, placeDistrict: () => 'strand', ...(jobs ? { jobs } : {}) });
  const first = (o: Partial<Recruit> = {}) => recruit({ id: 'r-first', spec: 'fence', ...o });
  const band = (b: string) => (r: { band: string }) => r.band === b;
  const hired = (r: Recruit, ...rest: CrewEvent[]): CrewEvent[][] => [[hire(first(), at(1, 18, 30), 0)], [hire(r, at(1, 19), 0), ...rest]];
  /** The stash without the first hire's lot. */
  const got = (c: { crew: { stash?: Lot[] } }) => (c.crew.stash ?? []).filter((l) => l.id !== 'first');
  const runner = (want: string, errand: ErrandKind, id: string) => idFor(band(want), { spec: 'runner', grade: 1 }, errand, id);
  const withRoute = (spec: Recruit['spec']) => sellErrand(sell, data, spec);

  it('a clean collect brings a full lot', () => {
    const c = go(hired(runner('clean', pull, P), send(P)), at(2, 3));
    expect(got(c)).toEqual([expect.objectContaining({ kind: 'data', value: 380, district: 'strand', day: 0 })]);
    expect(got(c)[0].damaged).toBeUndefined();
  });
  it('a messy one brings a damaged lot and heat', () => {
    const c = go(hired(runner('messy', pull, P), send(P)), at(2, 3));
    expect(got(c)[0].damaged).toBe(true);
    expect(c.kit.heat.strand).toBe(1);
  });
  it('a blown one brings nothing', () => expect(got(go(hired(runner('blown', pull, P), send(P)), at(2, 3)))).toEqual([]));
  it('rewound, the lot is gone', () => {
    const r = runner('clean', pull, P);
    expect(got(go(hired(r), at(2, 3)))).toEqual([]);
  });
  it('the first hire brings one lot, a second hire none', () => {
    const c = go([[hire(first(), at(1, 18, 30), 0)], [hire(recruit({ id: 'r-b' }), at(1, 19), 0)]], at(1, 20));
    expect(c.crew.stash).toEqual([{ id: 'first', kind: 'data', value: 380, day: 0, district: 'strand' }]);
  });
  it('a sale reserves the lot; recall puts it back', () => {
    const id = S('first', 0);
    const r = recruit({ id: 'r-b', spec: 'runner' });
    const ev = hired(r, send(id, at(1, 20)));
    expect(go(ev, at(1, 21)).crew.stash![0].out).toBe('r-b');
    const back = go(hired(r, send(id, at(1, 20)), { type: 'recall', at: at(1, 21) } as CrewEvent), at(1, 22));
    expect(back.crew.stash![0].out).toBeUndefined();
    expect(back.crew.members[1].state).toBe('ready');
  });
  it('a clean sale pays the price and rep, and removes the lot', () => {
    const id = S('first', 0);
    const r = idFor(band('clean'), { id: 'x', spec: 'runner', grade: 1 }, withRoute('runner'), id);
    const c = go(hired(r, send(id, at(1, 20))), at(2, 1));
    expect(c.crew.stash).toEqual([]);
    expect(c.crew.members[1].log[0].effects).toContain('SOL');
    expect(c.kit.rep.strand).toBe(26);
  });
  it('a messy sale pays half; a blown one loses the lot', () => {
    const id = S('first', 0);
    const clean = idFor(band('clean'), { spec: 'runner', grade: 1 }, withRoute('runner'), id);
    const messy = idFor(band('messy'), { spec: 'runner', grade: 1 }, withRoute('runner'), id);
    const blown = idFor(band('blown'), { spec: 'runner', grade: 1 }, withRoute('runner'), id);
    const sol = (r: Recruit) => go(hired(r, send(id, at(1, 20))), at(1, 23, 30)).kit.sol;
    expect(sol(clean) - sol(blown)).toBeGreaterThan(sol(messy) - sol(blown));
    expect(sol(messy) - sol(blown)).toBeGreaterThan(0);
    expect(go(hired(blown, send(id, at(1, 20))), at(2, 1)).crew.stash).toEqual([]);
  });
  it('a runner adds no heat on a messy sale; muscle adds heat on a clean one', () => {
    const id = S('first', 0);
    const r = idFor(band('messy'), { spec: 'runner', grade: 1 }, withRoute('runner'), id);
    expect(go(hired(r, send(id, at(1, 20))), at(2, 1)).kit.heat.strand ?? 0).toBe(0);
    const m = idFor(band('clean'), { spec: 'muscle', grade: 3 }, withRoute('muscle'), id);
    expect(go(hired(m, send(id, at(1, 20))), at(2, 1)).kit.heat.strand).toBe(1);
  });
  it('Buy It Cheap costs 40 % when sent, returned if recalled', () => {
    const r = recruit({ id: 'r-b', spec: 'fence' });
    expect(go(hired(r, send(B, at(1, 20))), at(1, 21)).kit.sol).toBe(1000 - 150);
    expect(go(hired(r, send(B, at(1, 20)), { type: 'recall', at: at(1, 21) } as CrewEvent), at(1, 22)).kit.sol).toBe(1000);
  });
  it('a recruit let go, or walking at 06:00, puts the lot back', () => {
    const id = S('first', 0);
    const r = recruit({ id: 'r-b', spec: 'runner' });
    expect(go(hired(r, send(id, at(2, 4))), at(2, 5)).crew.stash![0].out).toBe('r-b');
    expect(go(hired(r, send(id, at(2, 4)), { type: 'letgo', at: at(2, 4, 30) } as CrewEvent), at(2, 5)).crew.stash![0].out).toBeUndefined();
    const shaky: CrewEvent = { ...(hire(r, at(1, 19), 0) as Extract<CrewEvent, { type: 'hire' }>), loyalty: 30 };
    const broke = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(first(), at(1, 18, 30), 0)], [shaky, send(id, at(2, 4))]], now: at(2, 6, 30), book: gb, seed: 'pt', instance: inst, placeDistrict: () => 'strand' });
    expect(broke.crew.members[1].gone).toBe('walked');
    expect(broke.crew.stash![0].out).toBeUndefined();
  });
  it('a sell naming no lot lands as nothing, with no sol', () => {
    const r = recruit({ id: 'r-b', spec: 'runner' });
    const c = go(hired(r, send(S('s99', 0), at(1, 20))), at(1, 21));
    expect(c.kit.sol).toBe(1000);
    expect(c.crew.members[1].log[0].line).toContain('nothing to say');
  });
  it('a lot id comes from its offer, so a book edit can\'t repoint a stored sale', () => {
    const r = runner('clean', pull, P);
    const slow: CrewBook = { ...gb, errands: [{ ...pull, hours: 4 }, buy, sell] };
    const a = got(go(hired(r, send(P)), at(2, 3)))[0].id;
    const b = foldWithCrew({ start, kitEvents: [rep], crew: hired(r, send(P)), now: at(2, 3), book: slow, seed: 'pt', instance: (id) => parseInstance(id, { book: slow, districtOfJob: () => null, placeOfJob: () => null }), placeDistrict: () => 'strand' }).crew.stash!.find((l) => l.id !== 'first')!.id;
    expect(a).toBe(b);
  });
  it('recall one, send another on that lot in the same minute: the sale stands, whoever was hired first', () => {
    const a = recruit({ id: 'r-b', spec: 'runner' });
    const b = recruit({ id: 'r-a', spec: 'runner' });
    const when = at(1, 21);
    const c = go([[hire(first(), at(1, 18, 30), 0)], [hire(b, at(1, 19), 0), send(S('first', 0, 'karasu'), when)], [hire(a, at(1, 19, 1), 0), send(S('first', 0), at(1, 20)), { type: 'recall', at: when } as CrewEvent]], at(1, 21, 30));
    expect(c.crew.stash![0].out).toBe('r-a');
    expect(c.crew.members.find((m) => m.recruit.id === 'r-a')!.state).toBe('out');
  });
  it('a lot landing this minute can be sold this minute', () => {
    const r = runner('clean', pull, P);
    const landed = at(1, 20) + 180;
    const lot = got(go(hired(r, send(P)), landed))[0].id;
    const other = recruit({ id: 'r-z', spec: 'ears' });
    const c = go([...hired(r, send(P)), [hire(other, at(1, 19), 0), send(`sell:${lot}:strand@0`, landed)]], landed + 1);
    expect(c.crew.stash!.find((l) => l.id === lot)!.out).toBe('r-z');
  });
  it('a recruit landing this minute can be sent this minute', () => {
    const r = runner('clean', pull, P);
    const landed = at(1, 20) + 180;
    const c = go(hired(r, send(P), send(S('first', 0), landed)), landed + 1);
    expect(c.crew.stash!.find((l) => l.id === 'first')!.out).toBe(r.id);
  });
  it('a recalled sale can go again the same night', () => {
    const a = recruit({ id: 'r-b', spec: 'runner' });
    const c = go(hired(a, send(S('first', 0), at(1, 20)), { type: 'recall', at: at(1, 20, 30) } as CrewEvent, send(S('first', 0), at(1, 21))), at(1, 21, 30));
    expect(c.crew.stash![0].out).toBe('r-b');
    expect(c.crew.taken).toContain(S('first', 0));
  });
  it('a second sale of a lot already out lands as nothing', () => {
    const a = recruit({ id: 'r-b', spec: 'runner' });
    const b = recruit({ id: 'r-c', spec: 'runner' });
    const c = go([[hire(first(), at(1, 18, 30), 0)], [hire(a, at(1, 19), 0), send(S('first', 0), at(1, 20))], [hire(b, at(1, 19), 0), send(S('first', 0, 'karasu'), at(1, 20, 1))]], at(1, 21));
    expect(c.crew.stash![0].out).toBe('r-b');
    expect(c.crew.members[2].log[0].line).toContain('nothing to say');
  });
  it('a sale pays by the board of the night it was sent', () => {
    const other: GoodsKind = { id: 'x', label: 'X', route: 'ears', value: 100 };
    const b2: CrewBook = { ...gb, goods: [data, other] };
    const inst2 = (id: string) => parseInstance(id, { book: b2, districtOfJob: () => null, placeOfJob: () => null });
    const want = (day: number) => wantedFor({ seed: 'pt', day, districts: ['strand'], kinds: ['data', 'x'] }).strand;
    const lotKind = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(first(), at(1, 18, 30), 0)]], now: at(1, 19), book: b2, seed: 'pt', instance: inst2, placeDistrict: () => 'strand' }).crew.stash![0].kind;
    const price = (day: number) => {
      const id = `sell:first:strand@${day}`;
      const r = idFor(band('clean'), { spec: lotKind === 'data' ? 'runner' : 'ears', grade: 1 }, sellErrand(sell, lotKind === 'data' ? data : other, lotKind === 'data' ? 'runner' : 'ears'), id);
      const c = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(first(), at(1, 18, 30), 0)], [hire(r, at(1, 19), 0), send(id, at(1 + day, 20))]], now: at(3 + day, 1), book: b2, seed: 'pt', instance: inst2, placeDistrict: () => 'strand' });
      return c.crew.members[1].log[0].effects;
    };
    const value = lotKind === 'data' ? 380 : 100;
    const hit = [0, 1, 2].find((d) => want(d) === lotKind)!;
    const miss = [0, 1, 2].find((d) => want(d) !== lotKind)!;
    expect(price(hit)).toContain(`+${value * 1.5} SOL`);
    expect(price(miss)).toContain(`+${value} SOL`);
  });
  it('loot on a clean end joins; damaged on a messy end; none on a blown end', () => {
    const job = (tier: 'clean' | 'messy' | 'blown'): FoldJob => ({ key: 'quest.hicks.j@0', title: 'J', district: 'karasu', setup: { approach: 'quiet', people: [], favour: false, at: at(1, 21) }, calls: [], end: { at: at(1, 22), tier, getOut: false }, drops: 'data' });
    const base: CrewEvent[][] = [[hire(first(), at(1, 18, 30), 0)]];
    expect(got(go(base, at(1, 23), [job('clean')]))).toEqual([expect.objectContaining({ kind: 'data', district: 'karasu', value: 380 })]);
    expect(got(go(base, at(1, 23), [job('messy')]))[0].damaged).toBe(true);
    expect(got(go(base, at(1, 23), [job('blown')]))).toEqual([]);
  });
  it('loot with the stash full is lost', () => {
    const job = (n: number): FoldJob => ({ key: `quest.hicks.j${n}@0`, title: 'J', district: 'karasu', setup: { approach: 'quiet', people: [], favour: false, at: at(1, 21) }, calls: [], end: { at: at(1, 22), tier: 'clean', getOut: false }, drops: 'data' });
    expect(go([[hire(first(), at(1, 18, 30), 0)]], at(1, 23), [1, 2, 3, 4, 5].map(job)).crew.stash).toHaveLength(4);
  });
});

describe('old recruits (crew cleanup spec §4)', () => {
  const ab = (id: string, o: Partial<Ability> = {}): Ability => ({ id, label: id, for: ['runner'], from: 0, job: { kind: 'die' }, text: '', ...o });
  const b: CrewBook = { ...book, abilities: [ab('spoof'), ab('loop')] };
  const go = (r: Recruit) => foldWithCrew({ start, kitEvents: [rep], crew: [[hire(r)]], now: at(1, 20), book: b, seed: 'pt', instance }).crew.members[0];
  it('a stored wire reads as a runner, and lifts on TECH', () => {
    const m = go(recruit({ spec: 'wire' as Recruit['spec'], abilities: ['spoof'] }));
    expect(m.recruit.spec).toBe('runner');
    expect(callEffect({ spec: m.recruit.spec }, 'tech', 'open')).toMatchObject({ lift: true });
  });
  it('a recruit whose only ability was removed gets a seeded one', () => {
    const m = go(recruit({ spec: 'runner', grade: 0, abilities: ['over-the-roofs'] }));
    expect(m.abilities).toHaveLength(1);
    expect(m.slotted).toEqual(m.abilities);
  });
  it('a removed ability drops out and the slot takes what is left', () => {
    const m = go(recruit({ spec: 'runner', grade: 0, abilities: ['over-the-roofs', 'spoof'] }));
    expect(m.abilities).toEqual(['spoof']);
    expect(m.slotted).toEqual(['spoof']);
  });
});

describe('a retired errand (crew cleanup spec §1)', () => {
  const retired: CrewBook = { ...book, errands: [hustle, { ...kase, retired: true }, scout] };
  const inst = (id: string) => parseInstance(id, { book: retired, districtOfJob: () => 'karasu', placeOfJob: () => 'lowlight-intake' });
  const sure = recruit({ traits: ['slick'], grade: 0 });
  const go = (crew: CrewEvent[][], now: number) => foldWithCrew({ start, kitEvents: [rep], crew, now, book: retired, seed: 'pt', instance: inst }).crew;
  it('an old send still lands, counts its run and keeps a promotion', () => {
    const m = go([[hire(sure, at(1, 19), 0), send('case:back-door@0', at(1, 20)), send('case:back-door@1', at(2, 20)), send('case:back-door@2', at(3, 20))]], at(4, 12)).members[0];
    expect(m.runs.clean).toBe(3);
    expect(m.recruit.grade).toBe(1);
    expect(m.log.map((l) => l.line).join()).not.toContain('nothing to say');
  });
  it('a recruit out on one when the save loads lands with their result', () => {
    const c = go([[hire(sure, at(1, 19), 0), send('case:back-door@0', at(1, 20))]], at(2, 3));
    expect(c.members[0].log[0].effects).toContain('CASED');
  });
});

describe('groundwork in the fold (tier 3 contracts spec §3)', () => {
  const gw: ErrandKind = { kind: 'groundwork', label: 'x', tag: 'PREP', suits: ['runner'], hours: 8, risk: 'med', needs: { on: 'run' }, blurb: '', bands: { clean: band(['{name} did it.']), messy: band(['{name} did it, loud.']), blown: band(['{name} lost it.']) } };
  const b: CrewBook = { ...book, errands: [gw] };
  const dez = recruit({ id: 'dez', name: 'Dez Vance', spec: 'runner' });
  const inst = (id: string) => parseInstance(id, { book: b, districtOfJob: () => null, placeOfJob: () => null });
  const id = 'groundwork:the-contract@3:boat:runner@0';
  const run = (r: Recruit) => foldWithCrew({ start, kitEvents: [rep], crew: [[hire(r), send(id)]], now: at(3, 12), book: b, seed: 'pt', instance: inst }).crew;
  it('calling them back opens the piece again', () => {
    const c = foldWithCrew({ start, kitEvents: [rep], crew: [[hire(dez), send(id), { type: 'recall', at: at(1, 21), recruit: dez.id } as CrewEvent]], now: at(3, 12), book: b, seed: 'pt', instance: inst }).crew;
    expect(c.groundwork?.['the-contract@3']).toEqual([]);
    expect(c.reports?.['the-contract@3:boat']).toBeUndefined();
  });
  it('a recruit walking out at 06:00 opens the piece again', () => {
    const shaky: CrewEvent = { ...(hire(dez, at(1, 19), 0) as Extract<CrewEvent, { type: 'hire' }>), loyalty: 30 };
    const c = foldWithCrew({ start, kitEvents: [rep], crew: [[shaky, send(id, at(2, 3))]], now: at(2, 6, 30), book: b, seed: 'pt', instance: inst }).crew;
    expect(c.members[0]).toMatchObject({ state: 'gone', gone: 'walked' });
    expect(c.groundwork?.['the-contract@3']).toEqual([]);
  });
  it('a send counts on the run, and the landing reports, blown or not', () => {
    for (const r of [dez, { ...dez, id: 'r2', traits: ['dud'] }]) {
      const c = run(r as Recruit);
      expect(c.groundwork?.['the-contract@3']).toEqual([{ piece: 'boat', day: 0 }]);
      expect(c.reports?.['the-contract@3:boat']?.line).toBeTruthy();
    }
  });
});
