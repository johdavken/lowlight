import { describe, expect, it } from 'vitest';
import type { CrewBook, ErrandKind, Trait } from './crew-book';
import { crewOdds, dueAt, errandsFor, hiresFor, loyaltyWord, parseInstance, rollSend, slots, type Recruit } from './crew';
import type { Extra } from './extras';

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
const records = errand('records', { tag: 'PREP', suits: ['wire'], hours: 3, needs: { on: 'job' } });
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
const book: CrewBook = { names, traits, pitches, errands: [hustle, collect, layLow, kase, records, scout] };

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

describe('dueAt', () => {
  it('hours, RUNNER and traits', () => {
    const at = 22 * 60;
    expect(dueAt(at, kase, recruit({ spec: 'ears' }), [])).toBe(at + 240);
    expect(dueAt(at, kase, recruit({ spec: 'runner' }), [])).toBe(at + 160);
    expect(dueAt(at, kase, recruit({ spec: 'runner' }), [traits[1]])).toBe(at + 128);
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
        if (r.spec === 'wire') expect(r.face === null || r.face.startsWith('local-')).toBe(true);
      }
    }
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
