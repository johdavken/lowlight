/**
 * Papers' generator (spec §2.4–§2.5): a seeded draw of a client and tonight's bulletin, kept only
 * when the solver says it plays at the tier. Two streams: the first draws the truth and the rules
 * and nothing else; the second dresses the board (face, name, ID number, issue date, reasons), so
 * editing those data files never changes what the puzzle is.
 */
import type { Pronoun } from '../pronoun';
import type { Tier } from '../gig/rules';
import { allGiven, reasonFor, type AgeBand, type PapersData } from './data';
import { firstNightBoard } from './first-night';
import { FIELDS, holds, valuesFor, type Identity, type Rule } from './rules';
import { analyse, solve, solveWith } from './solve';

export const PAPERS_TIERS: Record<Tier, { rules: number; fail: number; lo: number; hi: number; trap: number; cleanPlus: number; capPlus: number; booth: number }> = {
  easy: { rules: 3, fail: 1, lo: 2, hi: 3, trap: 0, cleanPlus: 2, capPlus: 4, booth: 0 },
  medium: { rules: 4, fail: 2, lo: 3, hi: 5, trap: 1, cleanPlus: 1, capPlus: 3, booth: 1 },
  hard: { rules: 5, fail: 2, lo: 4, hi: 7, trap: 1, cleanPlus: 0, capPlus: 2, booth: 1 },
};

export interface BulletinRule {
  rule: Rule;
  why: string;
  lore: string;
}

export interface PapersBoard {
  tier: Tier;
  seed: number;
  truth: Identity;
  /** The origin values this board was dealt with: the desk's ORIGIN choices. */
  origins: string[];
  rules: BulletinRule[];
  name: string;
  /** From the face's gender tag (Studio FACES): she, he, or they when untagged. */
  pronoun: Pronoun;
  face: { id: string | null; looks: AgeBand[] };
  idNumber: string;
  issued: string;
  min: number;
  minWith: number;
  /** How many packets cost exactly `min`. */
  optimal: number;
  best: Identity;
  overlook: number | null;
  clean: number;
  cap: number;
  booth: number;
  traps: number;
  naive: number;
  attempts: number;
  firstNight: boolean;
  /** The officer's margin notes: the first night only. */
  notes: string[];
}

const ATTEMPTS = 3000;
const NEXT_SEEDS = 10;
const DRESSING = 0x9e3779b9;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** mulberry32, as the mockup and the other gig generators use. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(r() * arr.length))];

function drawRule(r: () => number, truth: Identity, values: ReturnType<typeof valuesFor>): Rule | null {
  const useTruth = r() < 0.6;
  if (r() < 0.25) {
    const f = pick(r, FIELDS);
    const v = useTruth ? truth[f] : pick(r, values[f]);
    if ((f === 'age' && v === '25–40') || (f === 'arrival' && v !== 'older')) return null;
    return { kind: 'ban', f, v };
  }
  const f = pick(r, FIELDS);
  const v = useTruth ? truth[f] : pick(r, values[f]);
  const cat = pick(r, (['doc', 'sponsor', 'district', 'trade'] as const).filter((c) => c !== f));
  if (cat === 'doc') return { kind: 'if', f, v, then: { doc: pick(r, ['medical', 'renewal'] as const) } };
  if (cat === 'sponsor') return { kind: 'if', f, v, then: r() < 0.4 ? { g: 'sponsor', op: 'not', w: 'none' } : { g: 'sponsor', op: 'is', w: pick(r, ['a House', 'a co-op', 'a corp']) } };
  if (cat === 'district') return { kind: 'if', f, v, then: { g: 'district', op: r() < 0.35 ? 'is' : 'not', w: pick(r, values.district) } };
  return { kind: 'if', f, v, then: { g: 'trade', op: 'not', w: pick(r, values.trade) } };
}

/** The second stream's draws, always the same number of them, so one file's length never shifts the next. */
export function dress(seed: number, truth: { age: string; origin: string }, data: PapersData, rules: readonly Rule[]): Pick<PapersBoard, 'face' | 'name' | 'pronoun' | 'idNumber' | 'issued'> & { rules: BulletinRule[] } {
  const r = rng((seed ^ DRESSING) >>> 0);
  const truthAge = truth.age;
  const pool = data.faces.filter((f) => f.band === truthAge);
  const f = r();
  const face = pool.length ? pool[Math.min(pool.length - 1, Math.floor(f * pool.length))] : null;
  const g = r();
  const fam = r();
  // A client's name follows where they're from (origins.json), else the shared pool.
  const local = data.origins.find((o) => o.name === truth.origin)?.names;
  const { given: byGender, family } = local && allGiven(local.given).length && local.family.length ? local : data.names;
  // The given name follows the face's gender tag: that gender's names and the either ones (all of them if none fit).
  const gender = face?.gender;
  const fits = gender ? [...byGender[gender], ...byGender.x] : allGiven(byGender);
  const given = fits.length ? fits : allGiven(byGender);
  const name = given.length && family.length ? `${given[Math.floor(g * given.length)]} ${family[Math.floor(fam * family.length)]}` : 'the client';
  const pronoun = gender === 'f' ? 'she' : gender === 'm' ? 'he' : 'they';
  const idNumber = `ARR-${String(Math.floor(r() * 1e6)).padStart(6, '0')}`;
  const issued = `${String(1 + Math.floor(r() * 28)).padStart(2, '0')} ${MONTHS[Math.floor(r() * 12)]} 2026`;
  return {
    face: face ? { id: face.id, looks: face.looks } : { id: null, looks: [truthAge as AgeBand] },
    name,
    pronoun,
    idNumber,
    issued,
    rules: rules.map((rule) => ({ rule, ...reasonFor(rule, data.reasons, r) })),
  };
}

function attempt(tier: Tier, seed: number, data: PapersData): PapersBoard | null {
  const T = PAPERS_TIERS[tier];
  const values = valuesFor(data.origins.map((o) => o.name));
  const r = rng(seed);
  for (let n = 1; n <= ATTEMPTS; n++) {
    const truth = {} as Identity;
    for (const f of FIELDS) truth[f] = pick(r, values[f]);
    truth.medical = r() < 0.25;
    truth.renewal = r() < 0.15;
    const rules: Rule[] = [];
    const seen = new Set<string>();
    for (let guard = 0; rules.length < T.rules && guard < 60; guard++) {
      const x = drawRule(r, truth, values);
      if (!x || seen.has(JSON.stringify(x))) continue;
      seen.add(JSON.stringify(x));
      rules.push(x);
    }
    if (rules.length < T.rules || rules.filter((x) => !holds(x, truth)).length < T.fail) continue;
    // Judged as if the face passes for its own age only: the face file must never decide the puzzle.
    const strict = [truth.age];
    if (analyse(truth, rules, strict, values).traps < T.trap) continue;
    const judged = solveWith(truth, rules, strict, values, T.booth);
    if (!judged || judged.minWith < T.lo || judged.minWith > T.hi) continue;
    const d = dress(seed, truth, data, rules);
    const w = solveWith(truth, rules, d.face.looks, values, T.booth)!;
    const { traps, naive } = analyse(truth, rules, d.face.looks, values);
    return {
      tier,
      seed,
      truth,
      origins: [...values.origin],
      ...d,
      min: w.min,
      minWith: w.minWith,
      optimal: solve(truth, rules, d.face.looks, values)!.count,
      best: w.best,
      overlook: w.overlook,
      clean: w.minWith + T.cleanPlus,
      cap: w.minWith + T.capPlus,
      booth: T.booth,
      traps,
      naive,
      attempts: n,
      firstNight: false,
      notes: [],
    };
  }
  return null;
}

/** A board for a job: seed 0 is the first night; a seed that never deals tries the next ten, then the first night. */
export function papersBoard(tier: Tier, seed: number, data: PapersData): PapersBoard {
  if (seed === 0) return firstNightBoard(data);
  for (let k = 0; k <= NEXT_SEEDS; k++) {
    const s = (seed + k) >>> 0 || 1;
    const b = attempt(tier, s, data);
    if (b) return b;
  }
  return firstNightBoard(data);
}
