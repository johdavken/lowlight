import { describe, expect, it } from 'vitest';
import { worksInGraft, type Ability, type CrewBook, type ErrandKind, type Trait } from './crew-book';
import { growthStep, abilityPool, crewOdds, sellErrand, traitHas, dueAt, hireAbility, offerFor, errandsFor, hiresFor, jobRecruitCard, loyaltyWord, parseInstance, rollSend, slots, vouchedFor, WAGE, type Recruit } from './crew';
import hiresBefore from './crew-hires.fixture.json';
import type { Extra } from './extras';
import type { GoodsKind } from './goods';

const band = (lines: string[], effect = {}) => ({ effect, lines });
const errand = (kind: string, o: Partial<ErrandKind>): ErrandKind => ({
  kind,
  label: kind,
  tag: 'SOL',
  suits: ['fence'],
  hours: 4,
  risk: 'med',
  needs: null,
  blurb: '',
  bands: { clean: band(['{name} did it.'], { sol: [300, 400] }), messy: band(['{name} half did it.']), blown: band(['{name} blew it.']) },
  ...o,
});
const hustle = errand('hustle', { suits: ['fence', 'face'], hours: 5, risk: 'med', needs: { on: 'district', when: 'known' } });
const collect = errand('collect', { suits: ['muscle'], risk: 'high', needs: { on: 'district', when: 'known' } });
const layLow = errand('lay-low', { tag: 'HEAT', suits: ['face'], hours: 6, risk: 'low', needs: { on: 'district', when: 'heat' } });
const kase = errand('case', { tag: 'PREP', suits: ['runner', 'ears'], risk: 'low', needs: { on: 'job' } });
const records = errand('records', { tag: 'PREP', suits: ['runner'], hours: 3, needs: { on: 'job' } });
const scout = errand('scout', { tag: 'PREP', suits: ['ears'], hours: 2, risk: 'low', needs: { on: 'job' } });

const trait = (id: string, effect: Trait['effect'], forS: Trait['for'] = 'any', good = true): Trait => ({ id, label: id.toUpperCase(), good, effect, for: forS, text: '' });
const traits: Trait[] = [
  trait('slick', { kind: 'odds', errand: 'any', delta: 20 }),
  trait('fast', { kind: 'hours', pct: -20 }),
  trait('cagey', { kind: 'never-held' }),
  trait('tough', { kind: 'hurt-not-gone-once' }),
  trait('scales', { kind: 'pay', errand: 'hustle', pct: 20 }, ['fence']),
  trait('loud', { kind: 'heat-on-messy', n: 1 }, 'any', false),
];
const names: Record<string, string[]> = { karasu: ['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'F Six'], strand: ['G Seven', 'H Eight', 'I Nine', 'J Ten'] };
const pitches: Record<string, string[]> = {};
for (const s of ['runner', 'ears', 'face', 'fence', 'wire', 'muscle']) for (const g of [0, 1, 2, 3]) pitches[`${s}:${g}`] = [`a ${s} pitch`];
const ab = (id: string, from: Ability['from'], o: Partial<Ability> = {}): Ability => ({ id, label: id.toUpperCase().replace(/-/g, ' '), for: ['runner'], from, job: { kind: 'die' }, text: '', ...o });
const abilities: Ability[] = [
  ab('spoof', 0, { job: { kind: 'cross', stat: 'wits' } }),
  ab('loop-the-cams', 0),
  ab('log-wipe', 1, { job: { kind: 'alarm' } }),
  ab('patient-wire', 1, { job: { kind: 'nerve' } }),
  ab('clean-exit', 3, { job: { kind: 'save' } }),
];
const book: CrewBook = { names, traits, abilities: [], pitches, errands: [hustle, collect, layLow, kase, records, scout] };
const abook: CrewBook = { ...book, abilities };

const recruit = (o: Partial<Recruit>): Recruit => ({ id: 'r-1', name: 'Juno Sato', face: null, origin: 'karasu', spec: 'face', grade: 1, traits: [], hidden: null, pitch: '', wage: 40, ...o });

const face = (id: string, tags: string[]): Extra => ({ id, file: `${id}.png`, tags });
const faces = [face('crew-face-01', ['crew', 'face']), face('crew-face-02', ['crew', 'face']), face('crew-fence-01', ['crew', 'fence']), face('local-01', ['local']), face('local-02', ['local'])];

describe('crewOdds', () => {
  it('base and modifiers', () => {
    const o = crewOdds({ errand: hustle, recruit: recruit({}), traits: [], heat: 3 });
    expect(o).toMatchObject({ clean: 60, blown: 14, messy: 26, fits: true });
    expect(crewOdds({ errand: hustle, recruit: recruit({}), traits: [], heat: 5 }).clean).toBe(50);
    const g = crewOdds({ errand: kase, recruit: recruit({ spec: 'muscle', grade: 0 }), traits: [], heat: 0 });
    expect(g.clean).toBe(45);
    expect(g.fits).toBe(false);
    expect(g.why).toEqual(['GREEN 50', 'OFF-FIT −15', 'LOW RISK +10']);
  });

  it('clamp', () => {
    expect(crewOdds({ errand: layLow, recruit: recruit({ grade: 3 }), traits: [traits[0]], heat: 0 }).clean).toBe(95);
  });

  it('muscle on high', () => {
    const o = crewOdds({ errand: collect, recruit: recruit({ spec: 'muscle', grade: 2 }), traits: [], heat: 0 });
    expect(o.clean).toBe(55);
    expect(o.blown).toBe(17);
    expect(o.messy).toBe(28);
  });

  it('split', () => {
    // A GREEN off-fit on high risk: 50 − 15 − 15 = 20 clean; the rest 80, half blown = 40.
    const o = crewOdds({ errand: collect, recruit: recruit({ spec: 'face', grade: 0 }), traits: [], heat: 3 });
    expect(o.clean).toBe(20);
    expect(o.blown).toBe(40);
    expect([o.hurt, o.held, o.gone]).toEqual([18, 12, 10]);
    expect(o.hurt + o.held + o.gone).toBe(o.blown);
    const cagey = crewOdds({ errand: collect, recruit: recruit({ spec: 'face', grade: 0 }), traits: [traits[2]], heat: 3 });
    expect([cagey.hurt, cagey.held, cagey.gone]).toEqual([30, 0, 10]);
    const tough = crewOdds({ errand: collect, recruit: recruit({ spec: 'face', grade: 0 }), traits: [traits[3]], heat: 3 });
    expect([tough.hurt, tough.held, tough.gone]).toEqual([28, 12, 0]);
    const used = crewOdds({ errand: collect, recruit: recruit({ spec: 'face', grade: 0 }), traits: [traits[3]], heat: 3, goneUsed: true });
    expect(used.gone).toBe(10);
  });
});

describe('rollSend', () => {
  it('deterministic, and frequencies follow the odds', () => {
    const odds = crewOdds({ errand: hustle, recruit: recruit({}), traits: [], heat: 3 });
    const vars = { name: 'Juno' };
    expect(rollSend({ odds, errand: hustle, seed: 'x', vars })).toEqual(rollSend({ odds, errand: hustle, seed: 'x', vars }));
    const n = { clean: 0, messy: 0, blown: 0 };
    for (let i = 0; i < 2000; i++) {
      const r = rollSend({ odds, errand: hustle, seed: `s${i}`, vars });
      n[r.band]++;
      if (r.band === 'clean') {
        expect(r.sol! % 10).toBe(0);
        expect(r.sol).toBeGreaterThanOrEqual(300);
        expect(r.sol).toBeLessThanOrEqual(400);
        expect(r.line).toBe('Juno did it.');
      }
      if (r.band === 'blown') {
        expect(r.fate).not.toBeNull();
        if (r.fate === 'hurt') expect(r.hurtDays).toBeGreaterThanOrEqual(2);
      } else expect(r.fate).toBeNull();
    }
    expect(Math.abs(n.clean / 20 - odds.clean)).toBeLessThan(3);
    expect(Math.abs(n.blown / 20 - odds.blown)).toBeLessThan(3);
  });
});

describe('goods errands (crew goods spec §2, §3)', () => {
  const band = { effect: {}, lines: ['x'] };
  const base: ErrandKind = { kind: 'sell', label: 'Hustle in {district}', tag: 'SOL', group: 'hustle', suits: ['runner', 'ears', 'face', 'fence', 'muscle'], hours: 5, risk: 'med', needs: { on: 'lot' }, blurb: '', bands: { clean: band, messy: band, blown: band } };
  const pull: ErrandKind = { ...base, kind: 'pull-drive', group: 'collect', suits: ['runner'], hours: 3, risk: 'low', needs: { on: 'offer' }, gives: ['data'] };
  const lift: ErrandKind = { ...pull, kind: 'lift-crate', suits: ['muscle'], gives: ['contraband', 'parts'] };
  const data: GoodsKind = { id: 'data', label: 'Data', route: 'runner', value: 380 };
  const b: CrewBook = { names: {}, traits: [], abilities: [], pitches: {}, errands: [pull, lift, base], goods: [data] };
  const args = { book: b, day: 2, rep: { strand: 20 }, heat: {}, districts: ['strand', 'marsh', 'karasu'] };
  const o = { book: b, districtOfJob: () => null, placeOfJob: () => null };
  it('offers every district for a lot, so a view can open one by recruit', () => {
    const list = errandsFor({ ...args, stash: [{ id: 's1', kind: 'data', value: 380, day: 0, district: 'marsh' }] });
    expect(list.filter((e) => e.kind === 'sell').map((e) => e.district).sort()).toEqual(['karasu', 'marsh', 'strand']);
  });
  it('a lot out on a sale offers nothing', () => {
    expect(errandsFor({ ...args, stash: [{ id: 's1', kind: 'data', value: 380, day: 0, district: 'marsh', out: 'r-a' }] })).toEqual([]);
  });
  it('offers missions only with a seed, in Known districts', () => {
    expect(errandsFor(args)).toEqual([]);
    const list = errandsFor({ ...args, seed: 'pt' });
    expect(list.length).toBe(2);
    expect(list.every((e) => e.district === 'strand' && e.goods)).toBe(true);
  });
  it('parseInstance reads an offer and a sale', () => {
    expect(parseInstance('pull-drive:strand:data@3', o)).toMatchObject({ kind: 'pull-drive', district: 'strand', goods: 'data', day: 3 });
    expect(parseInstance('sell:s1:strand@3', o)).toMatchObject({ kind: 'sell', lot: 's1', district: 'strand', day: 3 });
    expect(parseInstance('sell:s1@3', o)).toBeNull();
  });
  it('odds match by group', () => {
    const t = (errand: string): Trait => ({ id: 't', label: 'T', good: true, effect: { kind: 'odds', errand, delta: 10 }, for: 'any', text: '' });
    const r = recruit({ spec: 'runner', grade: 1 });
    const plain = crewOdds({ errand: pull, recruit: r, traits: [], heat: 0 }).clean;
    expect(crewOdds({ errand: pull, recruit: r, traits: [t('collect')], heat: 0 }).clean).toBe(plain + 10);
    expect(crewOdds({ errand: pull, recruit: r, traits: [t('hustle')], heat: 0 }).clean).toBe(plain);
  });
  it('sellErrand: the route sets hours and risk, and a fence fits any kind', () => {
    expect(sellErrand(base, data, 'ears')).toMatchObject({ hours: 7, risk: 'low' });
    expect(crewOdds({ errand: sellErrand(base, data, 'fence'), recruit: recruit({ spec: 'fence' }), traits: [], heat: 0 }).fits).toBe(true);
    expect(crewOdds({ errand: sellErrand(base, data, 'muscle'), recruit: recruit({ spec: 'muscle' }), traits: [], heat: 0 }).fits).toBe(false);
  });
  it('traitHas reads the effect and the also', () => {
    const t: Trait = { id: 't', label: 'T', good: true, effect: { kind: 'hours', pct: -33 }, also: { kind: 'sells-anywhere' }, for: 'any', text: '' };
    expect([traitHas(t, 'hours'), traitHas(t, 'sells-anywhere'), traitHas(t, 'full-route')]).toEqual([true, true, false]);
  });
});

describe('dueAt', () => {
  it('hours and traits', () => {
    const at = 22 * 60;
    expect(dueAt(at, kase, recruit({ spec: 'ears' }), [])).toBe(at + 240);
    expect(dueAt(at, kase, recruit({ spec: 'runner' }), [])).toBe(at + 240);
    expect(dueAt(at, kase, recruit({ spec: 'runner' }), [traits[1]])).toBe(at + 192);
  });
});

describe('hiresFor', () => {
  const base = { book, place: 'low-roller', district: 'strand', specs: ['face', 'fence'] as const, day: 3, seed: 'pt1', faces, usedFaces: new Set<string>(), origins: ['karasu', 'strand'] };
  it('deterministic', () => {
    expect(hiresFor({ ...base, specs: [...base.specs], tier: 2 })).toEqual(hiresFor({ ...base, specs: [...base.specs], tier: 2 }));
  });
  it('count, grades and the teaser', () => {
    const counts = new Set<number>();
    for (let day = 0; day < 40; day++) {
      const cards = hiresFor({ ...base, specs: [...base.specs], day, tier: 2 });
      const hires = cards.filter((c) => c.recruit);
      counts.add(hires.length);
      for (const c of hires) expect([0, 1]).toContain(c.recruit!.grade);
      for (const c of hires) expect(c.recruit!.spec).not.toBe('wheel');
      expect(cards.filter((c) => c.locked)).toEqual([expect.objectContaining({ locked: expect.objectContaining({ grade: 2, tier: 3 }) })]);
    }
    expect([...counts].sort()).toEqual([2, 3]);
    for (const c of hiresFor({ ...base, specs: [...base.specs], tier: 1 })) if (c.recruit) expect(c.recruit.grade).toBe(0);
    expect(hiresFor({ ...base, specs: [...base.specs], tier: 4 }).some((c) => c.locked)).toBe(false);
  });
  it('a hire: cost, wage, traits by grade, pitch, id', () => {
    for (let day = 0; day < 20; day++) {
      for (const c of hiresFor({ ...base, specs: [...base.specs], day, tier: 4 })) {
        const r = c.recruit!;
        expect(c.cost).toBe([100, 250, 500, 900][r.grade]);
        expect(r.wage).toBe([25, 40, 60, 90][r.grade]);
        expect(r.traits).toHaveLength(r.grade === 0 ? 1 : 2);
        expect(r.hidden).toBe(r.grade === 0 ? null : r.traits[1]);
        expect(r.pitch).toBe(`a ${r.spec} pitch`);
        expect(r.id).toMatch(/^r-[0-9a-z]+$/);
        for (const t of r.traits) {
          const tr = traits.find((x) => x.id === t)!;
          expect(tr.for === 'any' || tr.for.includes(r.spec)).toBe(true);
        }
      }
    }
  });
  it('two in three specialties come from the place', () => {
    let from = 0;
    let all = 0;
    for (let day = 0; day < 300; day++)
      for (const c of hiresFor({ ...base, specs: [...base.specs], day, tier: 2 })) {
        if (!c.recruit) continue;
        all++;
        if (c.recruit.spec === 'face' || c.recruit.spec === 'fence') from++;
      }
    // 2/3 drawn from the place's list, plus the 2/6 of the rest that land on them anyway: 7/9.
    expect(Math.abs(from / all - 7 / 9)).toBeLessThan(0.05);
  });
  it('faces: skips used ones, falls back to local', () => {
    for (let day = 0; day < 30; day++) {
      for (const c of hiresFor({ ...base, specs: ['face'], day, tier: 2, usedFaces: new Set(['crew-face-01']) })) {
        const r = c.recruit;
        if (!r) continue;
        expect(r.face).not.toBe('crew-face-01');
        // With the pools spent (two local faces in the fixture), a card has no face: it shows the initial.
        if (r.spec === 'face') expect(r.face === null || r.face === 'crew-face-02' || r.face.startsWith('local-')).toBe(true);
        if (r.spec === 'runner') expect(r.face === null || r.face.startsWith('local-')).toBe(true);
      }
    }
  });
});

describe('drawRecruit names and faces', () => {
  const gbook: CrewBook = { ...book, names: { karasu: ['Daichi Mori', 'Kenji Lau', 'Hana Ibe', 'Saya Dumont', 'Juno Sato'] }, genders: { 'Daichi Mori': 'man', 'Kenji Lau': 'man', 'Hana Ibe': 'woman', 'Saya Dumont': 'woman' } };
  const gfaces = [face('crew-wire-01', ['crew', 'runner', 'man']), face('crew-wire-02', ['crew', 'runner', 'woman']), face('crew-wire-03', ['crew', 'runner'])];
  const gbase = { book: gbook, place: 'p', district: 'karasu', specs: ['runner'] as Recruit['spec'][], tier: 2 as const, seed: 'pt1', faces: gfaces, usedFaces: new Set<string>(), origins: ['karasu'] };
  it('a gendered face takes a name marked the same or unmarked', () => {
    let seen = 0;
    for (let day = 0; day < 200; day++)
      for (const c of hiresFor({ ...gbase, day })) {
        const r = c.recruit;
        if (!r || !r.face) continue;
        const g = gbook.genders![r.name];
        if (r.face === 'crew-wire-01') expect(g === undefined || g === 'man').toBe(true);
        if (r.face === 'crew-wire-02') expect(g === undefined || g === 'woman').toBe(true);
        seen++;
      }
    expect(seen).toBeGreaterThan(100);
  });
  it('a spent district takes an unused name from another, then reuses its own', () => {
    const two: CrewBook = { ...gbook, names: { karasu: ['Daichi Mori'], strand: ['G Seven'] } };
    const one = (usedNames: Set<string>) => hiresFor({ ...gbase, book: two, day: 1, usedNames, origins: ['karasu'] }).find((c) => c.recruit)!.recruit!.name;
    expect(one(new Set(['Daichi Mori']))).toBe('G Seven');
    expect(one(new Set(['Daichi Mori', 'G Seven']))).toBe('Daichi Mori');
  });
  it('skips names already on the crew', () => {
    for (let day = 0; day < 100; day++)
      for (const c of hiresFor({ ...gbase, day, usedNames: new Set(['Daichi Mori', 'Hana Ibe']) })) if (c.recruit) expect(['Daichi Mori', 'Hana Ibe']).not.toContain(c.recruit.name);
  });
});

describe('errandsFor', () => {
  it('per job, per district, ids round-trip', () => {
    const list = errandsFor({
      book,
      day: 3,
      posted: [{ job: 'back-door', place: 'lowlight-intake', district: 'karasu' }],
      rep: { karasu: 25, strand: 10 },
      heat: { strand: 2 },
      districts: ['karasu', 'strand'],
    });
    expect(list.map((e) => e.id)).toEqual(['hustle:karasu@3', 'collect:karasu@3', 'lay-low:strand@3', 'case:back-door@3', 'records:back-door@3', 'scout:back-door@3']);
    expect(list[3]).toEqual({ id: 'case:back-door@3', kind: 'case', target: 'back-door', district: 'karasu', day: 3, job: 'back-door', place: 'lowlight-intake' });
    for (const e of list) expect(parseInstance(e.id, { book, districtOfJob: () => 'karasu', placeOfJob: () => 'lowlight-intake' })).toEqual(e);
    expect(parseInstance('nope:x@3', { book, districtOfJob: () => null, placeOfJob: () => null })).toBeNull();
  });
});

describe('slots and loyalty', () => {
  it('slots', () => {
    expect(slots({})).toBe(3);
    expect(slots({ karasu: 75, velvet: 10 })).toBe(6);
  });
  it('loyaltyWord', () => {
    expect([24, 25, 49, 50, 74, 75].map(loyaltyWord)).toEqual(['SHAKY', 'UNSURE', 'UNSURE', 'STEADY', 'STEADY', 'LOYAL']);
  });
});

describe('free cards (crew spec §5)', () => {
  const base = { book, place: 'low-roller', district: 'strand', specs: ['face', 'fence'], day: 3, seed: 'pt1', faces, usedFaces: new Set<string>(), origins: ['karasu', 'strand'] };
  it('hiresFor draws the same cards after drawRecruit is pulled out', () => {
    const out = [1, 2, 3, 4].flatMap((tier) => [0, 1, 2, 3, 4, 5].map((day) => hiresFor({ ...base, specs: [...base.specs] as Recruit['spec'][], tier: tier as 1, day })));
    // Abilities came later and are drawn last, from their own seed: everything else is as it was.
    const strip = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === 'abilities' ? undefined : v)));
    expect(strip(out)).toEqual(hiresBefore);
    const withAb = [1, 2, 3, 4].flatMap((tier) => [0, 1, 2, 3, 4, 5].map((day) => hiresFor({ ...base, book: abook, specs: [...base.specs] as Recruit['spec'][], tier: tier as 1, day })));
    expect(strip(withAb)).toEqual(hiresBefore);
  });
  const V = { book, contact: 'cass', contactName: 'Cass', place: 'the-tilt', district: 'karasu', seed: 'pt1', faces, usedFaces: new Set<string>(), origins: ['karasu', 'strand'], spec: null };
  it('a vouched card is free, one grade up, loyalty 70, the same all week', () => {
    const a = vouchedFor({ ...V, tier: 2, week: 3 });
    expect(a.cost).toBe(0);
    expect(a.recruit!.grade).toBe(2);
    expect(a.loyalty).toBe(70);
    expect(a.from).toEqual({ vouched: 'cass', name: 'Cass' });
    expect(a.recruit!.wage).toBe(WAGE[2]);
    expect(vouchedFor({ ...V, tier: 2, week: 3 })).toEqual(a);
    expect(vouchedFor({ ...V, tier: 2, week: 4 }).recruit!.id).not.toBe(a.recruit!.id);
  });
  it('a vouch at A Name caps at VET', () => expect(vouchedFor({ ...V, tier: 4, week: 0 }).recruit!.grade).toBe(3));
  it('a vouch with a spec named uses it', () => expect(vouchedFor({ ...V, spec: 'runner', tier: 1, week: 0 }).recruit!.spec).toBe('runner'));
  it('a job card is free at loyalty 50 and seeded by the run key', () => {
    const J = { book, title: 'Weigh Station', place: 'long-haul', district: 'spine', seed: 'pt1', faces, usedFaces: new Set<string>(), origins: ['karasu', 'strand'] };
    const c = jobRecruitCard({ ...J, runKey: 'quest.hicks.weigh-station@4', spec: 'muscle', grade: 1 });
    expect(c).toMatchObject({ cost: 0, loyalty: 50, from: { job: 'quest.hicks.weigh-station@4', title: 'Weigh Station' } });
    expect(c.recruit).toMatchObject({ spec: 'muscle', grade: 1, wage: WAGE[1] });
    expect(jobRecruitCard({ ...J, runKey: 'quest.hicks.weigh-station@5', spec: 'muscle', grade: 1 }).recruit!.id).not.toBe(c.recruit!.id);
  });
});

describe('abilities (crew abilities spec §1)', () => {
  const wire = (o: Partial<Recruit> = {}) => recruit({ spec: 'runner', grade: 0, ...o });
  it('abilityPool: the specialty, from grade, not known, in file order', () => {
    expect(abilityPool(abook, 'runner', 0, []).map((a) => a.id)).toEqual(['spoof', 'loop-the-cams']);
    expect(abilityPool(abook, 'runner', 3, ['spoof', 'log-wipe']).map((a) => a.id)).toEqual(['loop-the-cams', 'patient-wire', 'clean-exit']);
    expect(abilityPool(abook, 'face', 3, [])).toEqual([]);
  });
  it('hireAbility: seeded, within the grade', () => {
    expect(hireAbility(abook, wire(), 's1')).toBe(hireAbility(abook, wire(), 's1'));
    const seen = new Set<string | null>();
    for (let i = 0; i < 50; i++) seen.add(hireAbility(abook, wire(), `s${i}`));
    expect([...seen].sort()).toEqual(['loop-the-cams', 'spoof']);
    expect(hireAbility(abook, recruit({ spec: 'face' }), 's1')).toBeNull();
  });
  it('offerFor: two distinct, never known; one or none when that is all', () => {
    for (let i = 0; i < 30; i++) {
      const o = offerFor(abook, wire({ id: `r-${i}` }), ['spoof'], 1, 'pt');
      expect(o).toHaveLength(2);
      expect(new Set(o).size).toBe(2);
      expect(o).not.toContain('spoof');
      expect(o).not.toContain('clean-exit');
    }
    expect(offerFor(abook, wire(), ['spoof', 'loop-the-cams', 'log-wipe'], 1, 'pt')).toEqual(['patient-wire']);
    expect(offerFor(abook, wire(), ['spoof', 'loop-the-cams', 'log-wipe', 'patient-wire'], 1, 'pt')).toEqual([]);
    expect(offerFor(abook, wire(), ['spoof'], 2, 'pt')).toEqual(offerFor(abook, wire(), ['spoof'], 2, 'pt'));
  });
  it('a runner takes the errand hours as written', () => {
    expect(dueAt(0, { ...hustle, hours: 3 }, { spec: 'runner' } as Parameters<typeof dueAt>[2], [])).toBe(180);
  });
  it('a hire draws one ability for its grade', () => {
    for (let day = 0; day < 20; day++)
      for (const c of hiresFor({ book: abook, place: 'p', district: 'strand', specs: ['runner'], day, tier: 4, seed: 'pt1', faces, usedFaces: new Set(), origins: ['karasu', 'strand'] }))
        if (c.recruit) expect(c.recruit.abilities).toEqual(c.recruit.spec === 'runner' ? [expect.any(String)] : []);
  });
});

describe('growth by job (rewards, 2026-11-03)', () => {
  it('a job at or above the recruit counts full', () => expect([growthStep(1, 0), growthStep(2, 1), growthStep(3, 1), growthStep(undefined, 3)]).toEqual([1, 1, 1, 1]));
  it('a job below the recruit counts half', () => expect([growthStep(1, 1), growthStep(1, 2), growthStep(2, 2)]).toEqual([0.5, 0.5, 0.5]));
});

describe('groundwork (tier 3 contracts spec §3)', () => {
  const gw = { kind: 'groundwork', label: 'x', tag: 'PREP' as const, suits: ['muscle' as const, 'ears' as const], hours: 8, risk: 'med' as const, needs: { on: 'run' as const }, blurb: '', bands: { clean: { effect: {}, lines: ['a'] }, messy: { effect: {}, lines: ['b'] }, blown: { effect: {}, lines: ['c'] } } };
  const b = { names: {}, traits: [], abilities: [], pitches: {}, errands: [gw] };
  const args = { book: b, day: 5, posted: [], rep: {}, heat: {}, districts: [] };
  it('one instance a piece, and the id round-trips', () => {
    const [e] = errandsFor({ ...args, runs: [{ run: 'the-contract@3', piece: 'boat', spec: 'muscle' }] });
    expect(e).toMatchObject({ run: 'the-contract@3', piece: 'boat', spec: 'muscle', day: 5 });
    expect(parseInstance(e.id, { book: b, districtOfJob: () => null, placeOfJob: () => null })).toEqual(e);
  });
  it('none with no runs', () => expect(errandsFor(args)).toEqual([]));
  it('never offers a retired errand', () => {
    const b2 = { ...b, errands: [{ ...gw, retired: true as const }] };
    expect(errandsFor({ ...args, book: b2, runs: [{ run: 'the-contract@3', piece: 'boat', spec: 'muscle' }] })).toEqual([]);
  });
  it('the right specialty adds 10', () => {
    const recruit = { id: 'r', name: 'R', spec: 'muscle', grade: 1, traits: [], hidden: null, wage: 40, cost: 250, pitch: '', face: '' } as unknown as Parameters<typeof crewOdds>[0]['recruit'];
    const odds = (match?: 'muscle' | 'ears') => crewOdds({ errand: gw, recruit, traits: [], heat: 0, ...(match ? { match } : {}) }).clean;
    expect(odds('muscle') - odds('ears')).toBe(10);
  });
});

describe('traits on a job', () => {
  const trait = (effect: Trait['effect']): Trait => ({ id: 't', label: 'T', good: true, effect, for: 'any', text: '' });
  it('a job reads heat, wages and the two falls; errand effects stay off its cards', () => {
    for (const e of [{ kind: 'heat-on-messy', n: 1 }, { kind: 'never-held' }, { kind: 'hurt-not-gone-once' }, { kind: 'wage-on-clean', n: 15 }] as const) expect(worksInGraft(trait(e))).toBe(true);
    for (const e of [{ kind: 'odds', errand: 'any', delta: 5 }, { kind: 'pay', errand: 'any', pct: 10 }, { kind: 'hours', pct: -33 }, { kind: 'busy', days: 2 }, { kind: 'sells-anywhere' }, { kind: 'full-route' }] as const) expect(worksInGraft(trait(e))).toBe(false);
  });
});
