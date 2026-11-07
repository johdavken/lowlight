/**
 * What a costly roll costs (roll lifecycle spec 2026-11-02 §1): five costs, three dealt from the ones that can bite,
 * picked by position and result, each then taken, resisted or armoured. Pure: the server, the sim and tests share it.
 */
import { hashSeed } from './board';
import type { DiceResult, Position } from './dice';
import type { Approach } from './hand';
import { rng } from './rng';

export type CostId = 'alarm' | 'heat' | 'worse' | 'small' | 'take';

/** Each cost's tag and its meaning for the GM, worded to say what it is not (the 2026-11-02 probe, round 2). */
export const COSTS: Record<CostId, { tag: string; meaning: string }> = {
  alarm: { tag: 'ALARM +1', meaning: 'Something about the whole job moves a step toward discovery (a log entry, a call made, a noise reported). Not about the next spot, and not a new danger yet.' },
  heat: { tag: 'HEAT +1', meaning: 'The district will remember this after the job: a face seen, a name passed on. Nothing changes inside the job itself.' },
  worse: { tag: 'NEXT ROLL WORSE', meaning: 'The very next obstacle is now more dangerous: a specific threat waiting there. Nobody suspects the job as a whole any more than before.' },
  small: { tag: 'NEXT ROLL SMALL', meaning: 'The next obstacle will pay less if you get through: the prize or the window shrinks. It is not more dangerous and nobody is more suspicious.' },
  take: { tag: 'TAKE −1', meaning: 'You lose part of what you have taken so far (only from the loot listed).' },
};
/** What a roll can deal. `heat` stays a CostId for a waiting roll dealt before ALARM became HEAT (tier template spec §2). */
const ORDER: readonly CostId[] = ['alarm', 'worse', 'small', 'take'];

/** How many costs a deal offers. */
export const DEALT = 3;
/** RESIST on a grid check with a chrome deck rolls one die more (it replaces chrome's cheaper STEADY). */
export const RESIST_CHROME_DIE = 1;

/**
 * How each approach goes wrong (approach shapes spec §1): a cost it's never dealt, and one that comes first. QUIET gets
 * heard, SMOOTH's lie gets harder to hold, HARD breaks what it came for.
 */
export const APPROACH_COSTS: Record<Approach, { never: CostId; first: CostId }> = {
  quiet: { never: 'take', first: 'alarm' },
  smooth: { never: 'small', first: 'worse' },
  hard: { never: 'alarm', first: 'take' },
};
/** False: `never` still holds, and every pick is free (the spec's "removal"). */
export const FORCED_FIRST = true;

/** The cost that has to be picked first on this deal: null with no approach, or when it wasn't dealt because it can't bite. */
export function firstCost(approach: Approach | null | undefined, dealt: readonly CostId[]): CostId | null {
  if (!approach || !FORCED_FIRST) return null;
  const { first } = APPROACH_COSTS[approach];
  return dealt.includes(first) ? first : null;
}

/**
 * Up to three different costs, seeded (rewind and BRANCH HERE deal the same), from the ones that can bite here:
 * `take` (TAKE above 0 on a check that fills it), `next` (a next roll in this job), `alarm` (below ALARM's max). With an
 * approach its `never` cost stays out and its `first` cost leads, so a slice of the deal takes it first.
 */
export function dealCosts(seed: string, can: { take: boolean; next: boolean; alarm: boolean }, approach?: Approach | null): CostId[] {
  const never = approach ? APPROACH_COSTS[approach].never : null;
  const pool = ORDER.filter((c) => c !== never && (c === 'worse' || c === 'small' ? can.next : can[c as 'take' | 'alarm']));
  const r = rng(hashSeed(seed));
  const out: CostId[] = [];
  while (pool.length > 0 && out.length < DEALT) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const first = firstCost(approach, out);
  return first ? [first, ...out.filter((c) => c !== first)] : out;
}

const PICKS: Record<Position, { cost: number; miss: number }> = { dark: { cost: 0, miss: 1 }, open: { cost: 1, miss: 2 }, wire: { cost: 2, miss: 2 } };

/** How many of the dealt costs you pick (§1.2): by position, a miss a step worse; none on a 6 or a crit. */
export function picksFor(kind: DiceResult['kind'], position: Position, dealt: number): number {
  if (kind !== 'cost' && kind !== 'miss') return 0;
  return Math.min(dealt, PICKS[position][kind]);
}

/** RESIST's NERVE (§1.3) by the kept die: 6 → 0, 4–5 → 1, 1–3 → 2; two 6s give one back (−1). */
export function resistPrice(faces: number[]): number {
  if (faces.filter((f) => f === 6).length >= 2) return -1;
  const top = Math.max(...faces);
  return top === 6 ? 0 : top >= 4 ? 1 : 2;
}
