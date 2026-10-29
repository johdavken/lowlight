import { describe, expect, test } from 'vitest';
import type { Tier } from '../gig/rules';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type Face, type PapersData } from './data';
import { FIRST_NIGHT_NOTES } from './first-night';
import { PAPERS_TIERS, papersBoard } from './generate';
import { holds } from './rules';

const faces: Face[] = (['u25', 'mid', 'o40'] as const).flatMap((p, i) =>
  Array.from({ length: 16 }, (_, k) => {
    const band = (['under 25', '25–40', 'over 40'] as const)[i];
    return { id: `${p}-${String(k + 1).padStart(2, '0')}`, band, looks: [band] };
  }),
);
const data: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: ['Ines'], m: ['Tomas'], x: [] }, family: ['Varga', 'Okoye'] }, faces, reasons: [...DEFAULT_REASONS] };
const core = (b: ReturnType<typeof papersBoard>) => ({ truth: b.truth, rules: b.rules.map((r) => r.rule) });

test('the same seed gives the same board', () => {
  expect(papersBoard('medium', 42, data)).toEqual(papersBoard('medium', 42, data));
});

describe.each<Tier>(['easy', 'medium', 'hard'])('%s boards over 200 seeds', (tier) => {
  test('sit in the tier band with enough traps and failing rules', () => {
    const T = PAPERS_TIERS[tier];
    for (let s = 1; s <= 200; s++) {
      const b = papersBoard(tier, s * 7919, data);
      expect(b.firstNight).toBe(false);
      expect(b.rules).toHaveLength(T.rules);
      expect(b.rules.filter((r) => !holds(r.rule, b.truth)).length).toBeGreaterThanOrEqual(T.fail);
      expect(b.traps).toBeGreaterThanOrEqual(T.trap);
      // Faces here pass for their own band only, as the attempts are judged.
      expect(b.minWith).toBeGreaterThanOrEqual(T.lo);
      expect(b.minWith).toBeLessThanOrEqual(T.hi);
      expect(b.clean).toBe(b.minWith + T.cleanPlus);
      expect(b.cap).toBe(b.minWith + T.capPlus);
      expect(b.booth).toBe(T.booth);
      expect(b.face.looks).toContain(b.truth.age);
    }
  });
});

describe('two streams', () => {
  test('names and reasons change only the dressing', () => {
    const a = papersBoard('hard', 7, data);
    const b = papersBoard('hard', 7, { ...data, names: { given: { f: [], m: [], x: ['Juno'] }, family: [] }, reasons: [] });
    expect(core(b)).toEqual(core(a));
    expect([b.cap, b.clean]).toEqual([a.cap, a.clean]);
    expect(b.name).toBe('the client');
    expect(b.rules.every((r) => r.why === 'By order of the Isle.')).toBe(true);
  });
  test('faces never change the truth or the rules', () => {
    const a = papersBoard('medium', 11, data);
    const wide = faces.map((f) => ({ ...f, looks: f.band === '25–40' ? (['under 25', '25–40', 'over 40'] as Face['looks']) : f.looks }));
    expect(core(papersBoard('medium', 11, { ...data, faces: wide }))).toEqual(core(a));
    expect(core(papersBoard('medium', 11, { ...data, faces: [] }))).toEqual(core(a));
  });
});

test('seed 0 is the first night', () => {
  const b = papersBoard('hard', 0, data);
  expect(b).toMatchObject({ firstNight: true, seed: 0, tier: 'easy', min: 4, minWith: 2, clean: 4, cap: 6, booth: 0 });
  expect(b.truth.origin).toBe('Sable Coast');
  expect(b.face.looks).toEqual(['over 40']);
  expect(b.face.id).toMatch(/^o40-/);
  expect(b.notes).toEqual(FIRST_NIGHT_NOTES);
  expect(b.rules.map((r) => r.rule)).toEqual([
    { kind: 'if', f: 'age', v: 'over 40', then: { g: 'sponsor', op: 'is', w: 'a co-op' } },
    { kind: 'if', f: 'trade', v: 'clinic', then: { doc: 'medical' } },
    { kind: 'if', f: 'sponsor', v: 'a co-op', then: { doc: 'renewal' } },
  ]);
});

test('a band with no faces still deals, with no photo', () => {
  const b = papersBoard('easy', 5, { ...data, faces: [] });
  expect(b.face).toEqual({ id: null, looks: [b.truth.age] });
});

test('the dressing: a name, an ARR number and a 2026 issue date', () => {
  const b = papersBoard('medium', 3, data);
  expect(['Ines', 'Tomas'].some((g) => b.name.startsWith(g))).toBe(true);
  expect(b.idNumber).toMatch(/^ARR-\d{6}$/);
  expect(b.issued).toMatch(/^\d{2} [A-Z]{3} 2026$/);
});

test('300 boards deal in under 10 s (a guard against an accidental slowdown)', () => {
  const t0 = performance.now();
  for (const tier of ['easy', 'medium', 'hard'] as const) for (let s = 1; s <= 100; s++) papersBoard(tier, s * 104729, data);
  expect(performance.now() - t0).toBeLessThan(10_000);
});

describe('names follow the origin (2026-10-12)', () => {
  const regional: PapersData = {
    ...data,
    origins: [
      { name: 'Vrana', names: { given: { f: [], m: [], x: ['Zofia'] }, family: ['Novak'] } },
      { name: 'Sundarpur', names: { given: { f: [], m: [], x: ['Priya'] }, family: ['Iyer'] } },
      { name: 'Skarnholm' },
    ],
  };
  test("a client gets a name from their own origin's list", () => {
    for (let s = 1; s <= 60; s++) {
      const b = papersBoard('medium', s, regional);
      if (b.truth.origin === 'Vrana') expect(b.name).toBe('Zofia Novak');
      if (b.truth.origin === 'Sundarpur') expect(b.name).toBe('Priya Iyer');
      if (b.truth.origin === 'Skarnholm') expect(['Ines', 'Tomas'].some((g) => b.name.startsWith(g))).toBe(true);
    }
  });
  test('regional names never change the board', () => {
    const plain: PapersData = { ...regional, origins: regional.origins.map(({ name }) => ({ name })) };
    for (const s of [3, 9, 27]) expect(core(papersBoard('hard', s, regional))).toEqual(core(papersBoard('hard', s, plain)));
  });
  test("the first night's client is from the first origin, named from its list", () => {
    expect(papersBoard('easy', 0, regional)).toMatchObject({ name: 'Zofia Novak', truth: { origin: 'Vrana' } });
  });
});

describe('pronouns follow the face (2026-10-12)', () => {
  const tagged: PapersData = {
    ...data,
    names: { given: { f: ['Ines'], m: ['Tomas'], x: ['Deniz'] }, family: ['Varga'] },
    faces: faces.map((f, i) => ({ ...f, ...(i % 2 ? { gender: 'm' as const } : { gender: 'f' as const }) })),
  };
  test('a woman’s face gets a woman’s or either name and she; a man’s gets he', () => {
    for (let s = 1; s <= 40; s++) {
      const b = papersBoard('medium', s, tagged);
      const g = tagged.faces.find((f) => f.id === b.face.id)!.gender;
      if (g === 'f') {
        expect(b.pronoun).toBe('she');
        expect(['Ines Varga', 'Deniz Varga']).toContain(b.name);
      } else {
        expect(b.pronoun).toBe('he');
        expect(['Tomas Varga', 'Deniz Varga']).toContain(b.name);
      }
    }
  });
  test('an untagged face, or no face, is they, with any name', () => {
    expect(papersBoard('medium', 5, { ...tagged, faces: data.faces }).pronoun).toBe('they');
    expect(papersBoard('medium', 5, { ...tagged, faces: [] }).pronoun).toBe('they');
  });
  test('gender never changes the board', () => {
    for (const s of [2, 8, 19]) expect(core(papersBoard('hard', s, tagged))).toEqual(core(papersBoard('hard', s, data)));
  });
});
