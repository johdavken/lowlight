/**
 * Papers' solver (spec §2.3–§2.4): every identity is tried, so the cheapest packet that passes a
 * bulletin is known exactly. Booth nine is solved by dropping each rule in turn at his price.
 * Traps are failing rules whose cheapest one-step fixes all break a rule that was passing.
 */
import { cost, FIELDS, holds, type Identity, type Rule, type Values } from './rules';

const memo = new Map<string, readonly Identity[]>();

/** Every combination of field values, with and without each extra. Memoised per value lists. */
export function identities(values: Values): readonly Identity[] {
  const key = JSON.stringify(values);
  const hit = memo.get(key);
  if (hit) return hit;
  const sizes = FIELDS.map((f) => values[f].length);
  const total = sizes.reduce((a, b) => a * b, 1) * 4;
  const out: Identity[] = new Array(total);
  for (let i = 0; i < total; i++) {
    let n = i;
    const id = {} as Identity;
    FIELDS.forEach((f, k) => {
      id[f] = values[f][n % sizes[k]];
      n = Math.floor(n / sizes[k]);
    });
    id.medical = (n & 1) === 1;
    id.renewal = (n & 2) === 2;
    out[i] = id;
  }
  memo.set(key, out);
  return out;
}

export interface Solution {
  min: number;
  count: number;
  best: Identity;
}

export function solve(truth: Identity, rules: readonly Rule[], looks: readonly string[], values: Values): Solution | null {
  let min = Infinity;
  let count = 0;
  let best: Identity | null = null;
  for (const id of identities(values)) {
    const c = cost(id, truth);
    if (c > min || !looks.includes(id.age) || !rules.every((r) => holds(r, id))) continue;
    if (c < min) {
      min = c;
      count = 1;
      best = id;
    } else count++;
  }
  return best ? { min, count, best } : null;
}

export interface WithBooth {
  min: number;
  minWith: number;
  best: Identity;
  /** The rule booth nine looks past in the best packet; null when he isn't worth it. */
  overlook: number | null;
}

/**
 * One pass: the cheapest packet passing every rule, and for each rule the cheapest failing only
 * that one. Booth nine on rule i costs min(both) + boothCost; ties keep him out, then the lowest i.
 */
export function solveWith(truth: Identity, rules: readonly Rule[], looks: readonly string[], values: Values, boothCost: number): WithBooth | null {
  let none: { cost: number; best: Identity } | null = null;
  const only: ({ cost: number; best: Identity } | null)[] = rules.map(() => null);
  for (const id of identities(values)) {
    if (!looks.includes(id.age)) continue;
    let failed = -1;
    let ok = true;
    for (let i = 0; i < rules.length; i++) {
      if (holds(rules[i], id)) continue;
      if (failed >= 0) {
        ok = false;
        break;
      }
      failed = i;
    }
    if (!ok) continue;
    const c = cost(id, truth);
    if (failed < 0) {
      if (!none || c < none.cost) none = { cost: c, best: id };
    } else if (!only[failed] || c < only[failed]!.cost) only[failed] = { cost: c, best: id };
  }
  if (!none) return null;
  let pick = { cost: none.cost, best: none.best, overlook: null as number | null };
  only.forEach((o, i) => {
    const s = o && o.cost < none!.cost ? o : none!;
    if (s.cost + boothCost < pick.cost) pick = { cost: s.cost + boothCost, best: s.best, overlook: i };
  });
  return { min: none.cost, minWith: pick.cost, best: pick.best, overlook: pick.overlook };
}

function singleChanges(truth: Identity, looks: readonly string[], values: Values): Identity[] {
  const out: Identity[] = [];
  for (const f of FIELDS) for (const v of values[f]) if (v !== truth[f] && (f !== 'age' || looks.includes(v))) out.push({ ...truth, [f]: v });
  if (!truth.medical) out.push({ ...truth, medical: true });
  if (!truth.renewal) out.push({ ...truth, renewal: true });
  return out;
}

/** traps (above) and naive: the sum of each failing rule's cheapest fix, as if they didn't interact. */
export function analyse(truth: Identity, rules: readonly Rule[], looks: readonly string[], values: Values): { traps: number; naive: number } {
  const passing = rules.filter((r) => holds(r, truth));
  const changes = singleChanges(truth, looks, values);
  let traps = 0;
  let naive = 0;
  for (const rule of rules.filter((r) => !holds(r, truth))) {
    const fixes = changes.filter((id) => holds(rule, id));
    if (fixes.length === 0) {
      naive = Infinity;
      continue;
    }
    const cheapest = Math.min(...fixes.map((id) => cost(id, truth)));
    naive += cheapest;
    if (fixes.filter((id) => cost(id, truth) === cheapest).every((id) => passing.some((p) => !holds(p, id)))) traps++;
  }
  return { traps, naive };
}
