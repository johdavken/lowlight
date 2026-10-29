import { describe, expect, it } from 'vitest';
import { storyDay } from './board';
import type { CrewBook, ErrandKind, Trait } from './crew-book';
import { crewOdds, parseInstance, rollSend, type Recruit } from './crew';
import { foldWithCrew, type CrewEvent } from './crew-fold';
import { foldKit, type KitEvent } from './mission';

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
const book: CrewBook = { names: {}, traits, pitches: {}, errands: [hustle, kase, scout] };
const instance = (id: string) => parseInstance(id, { book, districtOfJob: () => 'karasu', placeOfJob: () => 'lowlight-intake' });

const recruit = (o: Partial<Recruit>): Recruit => ({ id: 'r-a', name: 'Juno Sato', face: null, origin: 'strand', spec: 'face', grade: 1, traits: [], hidden: null, pitch: '', wage: 40, ...o });
const start = { deck: null, edgeMax: 2, from: at(1, 18) };
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

  it('wages short mid-roster', () => {
    const a = recruit({ id: 'r-a' });
    const b = recruit({ id: 'r-b' });
    const c = recruit({ id: 'r-c' });
    // 100 sol after the hires: a (40) and b (40) are paid at 06:00, c isn't.
    const { kit, crew } = fold([[hire(c, at(1, 19, 2), 0)], [hire(a, at(1, 19), 0)], [hire(b, at(1, 19, 1), 0)]], at(2, 7), [rep, { at: at(1, 18), sol: 100 }]);
    expect(kit.sol).toBe(20);
    expect(crew.members.map((m) => [m.recruit.id, m.loyalty])).toEqual([['r-a', 50], ['r-b', 50], ['r-c', 35]]);
    // The next unpaid night: 35 → 20, SHAKY, and c walks. 20 sol covers nobody.
    const later = fold([[hire(c, at(1, 19, 2), 0)], [hire(a, at(1, 19), 0)], [hire(b, at(1, 19, 1), 0)]], at(3, 7), [rep, { at: at(1, 18), sol: 100 }]);
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
    // The promotion may add a third trait (one in three).
    expect(m.revealed.slice(0, 2)).toEqual(['slick', 'busy0']);
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
