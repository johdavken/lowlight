/**
 * The first night (spec §2.8): the hand-written board every player's first Papers run gets, with
 * the officer's margin notes. 4 without booth nine, 2 with him; dropping the co-op sponsor looks
 * cheapest for rule 3 and breaks rule 1. Found by the mockup's generator (easy, seed 93).
 */
import type { PapersData } from './data';
import { dress, PAPERS_TIERS, type PapersBoard } from './generate';
import { valuesFor, type Identity, type Rule } from './rules';
import { analyse, solve, solveWith } from './solve';

export const FIRST_NIGHT_NOTES: readonly string[] = [
  "Every line you change costs one for each paper it's printed on. Origin is on two.",
  "A paper they don't have costs two to make from nothing. Keeping a real one costs nothing.",
  "The photo is their face. Write an age it can't pass for and the booth will see it.",
  'Give them a sponsor and the letter comes with it. A letter from nothing costs two.',
  'Booth nine looks past one rule a night. Give him the one that costs you most.',
];

const RULES: Rule[] = [
  { kind: 'if', f: 'age', v: 'over 40', then: { g: 'sponsor', op: 'is', w: 'a co-op' } },
  { kind: 'if', f: 'trade', v: 'clinic', then: { doc: 'medical' } },
  { kind: 'if', f: 'sponsor', v: 'a co-op', then: { doc: 'renewal' } },
];

export function firstNightBoard(data: PapersData): PapersBoard {
  const T = PAPERS_TIERS.easy;
  const values = valuesFor(data.origins.map((o) => o.name));
  const truth: Identity = { origin: values.origin[0], district: 'Karasu', trade: 'clinic', age: 'over 40', sponsor: 'a co-op', arrival: 'last week', medical: false, renewal: false };
  const d = dress(0, truth, data, RULES);
  // The board's numbers are fixed by the spec: the face passes for over 40 only, whatever its tags.
  const looks = ['over 40' as const];
  const w = solveWith(truth, RULES, looks, values, T.booth)!;
  const { traps, naive } = analyse(truth, RULES, looks, values);
  return {
    tier: 'easy',
    seed: 0,
    truth,
    origins: [...values.origin],
    ...d,
    face: { id: d.face.id, looks },
    min: w.min,
    minWith: w.minWith,
    optimal: solve(truth, RULES, looks, values)!.count,
    best: w.best,
    overlook: w.overlook,
    clean: w.minWith + T.cleanPlus,
    cap: w.minWith + T.capPlus,
    booth: T.booth,
    traps,
    naive,
    attempts: 0,
    firstNight: true,
    notes: [...FIRST_NIGHT_NOTES],
  };
}
