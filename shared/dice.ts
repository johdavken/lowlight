/**
 * The table (spec 2026-10-29): a check as a d6 pool. The stat gives the dice, crew and deck and prep add or take
 * them away, the card's base sets the position (the stakes), and the highest die decides: 6 clean, 4–5 at a cost,
 * 1–3 a miss, two 6s a crit. Pure: the game server, Studio, the sim and their tests share it.
 */
import { GRADES, type JobEffect } from './crew-book';
import type { Deck } from './gear';
import { hashSeed } from './board';
import { rng } from './rng';
import { APPROACH_STATS, better, type Approach, type CallEffect } from './hand';
import { belowTier, type Program } from './programs';
import type { Check } from './mission';
import { holds, type CondCtx, type DiceRoll } from './quests';
import type { Stats } from './stats';

export type Position = 'dark' | 'open' | 'wire';
export const POSITION_NAMES: Record<Position, string> = { dark: 'IN THE DARK', open: 'IN THE OPEN', wire: 'ON THE WIRE' };

/** How much a pass fills TAKE (effect and NERVE spec §1): a step either side of FAIR, today's table. */
export type Effect = 'small' | 'fair' | 'big';
export const EFFECT_NAMES: Record<Effect, string> = { small: 'SMALL', fair: 'FAIR', big: 'BIG' };
const EFFECTS: readonly Effect[] = ['small', 'fair', 'big'];
/** SAFE: a position better for a step less effect; BOLD the other way (§1). */
export type Trade = 'safe' | 'bold';
/** PUSH's two modes, both PUSH_NERVE: a die, or a step of effect (§1). */
export type PushMode = 'dice' | 'effect';
/** Heat in the job's district from which a roll is a step SMALLER (§1): the line favours stop at. */
export const EFFECT_HEAT = 6;

export const POOL_MAX = 6;
/** ALARM's segments (spec §2): full means GET OUT. */
export const ALARM_MAX = 4;

export interface DiceResult {
  kind: 'crit' | 'clean' | 'cost' | 'miss';
  pass: boolean;
  take: number;
  alarm: number;
  heat: number;
}

/** A check's pool for one player, as the card shows it. `dice` may be 0 or less (rolled as 2d, keep the lower). */
/** Where a pool's die came from, in the hand's groups: POCKETS (the deck), PEOPLE (who's with you), the setup's approach, PUSH. */
export type PartKind = 'pocket' | 'people' | 'setup' | 'push';

export interface Pool {
  stat: string;
  /** The stat's own dice, before the parts (the card's base dots). */
  base: number;
  dice: number;
  /** Each die past the stat's, and where it came from (the call card colours its tab and cell by `kind`; none: a modifier). */
  parts: { label: string; dice: 1 | -1; kind?: PartKind }[];
  position: Position;
  /** How it got there: after ALARM and a breaker, then whether a call lifts it and a NEXT ROLL cost worsens it. Programs and a trade go between, so a preview can judge them as the roll does. */
  path?: { placed: Position; lift: boolean; worse: boolean; press?: true; better?: true };
  noDeck: boolean;
  /** The carried deck on a grid check (deck effects spec 2026-10-30): how it matches the job's tier, and its traits that act. */
  deck?: DeckEdge;
  /** How much a pass fills TAKE (effect and NERVE spec §1); absent on a check that fills none (GET OUT, a push beat). */
  effect?: Effect;
  /** The effect before the clamp, SMALL 0 to BIG 2 (past either end when the steps run over), so a preview adds steps as the roll sums them. */
  effectRaw?: number;
  /** Each step that moved it from the choice's tag (or FAIR), in order: HEAT 6, OUTCLASSED, SAFE / BOLD, PUSH. */
  effectParts?: { label: string; step: 1 | -1 }[];
  /** The job's tier against this roll (tier effect spec §1): the cut, or what lifted it; absent on tier 1 or a roll that fills no TAKE. */
  tier?: { label: string; lifted: boolean };
  /** The programs running on this roll (programs spec §1.4): `alarm` 1 when below the job's tier. */
  programs?: { id: string; label: string; alarm: 0 | 1 }[];
  /** A quiet program runs: HEAT +1 isn't dealt among this roll's costs. */
  quiet?: true;
}

/**
 * What a deck does on one grid check: `match`, its quality against the job's tier (above holds, below is
 * outclassed, equal or no tier null); `broke` (breaker turned the wire into the open), no heat, cheaper STEADY.
 */
export interface DeckEdge {
  match: 'holds' | 'outclassed' | null;
  broke: boolean;
  hidden: boolean;
  chrome: boolean;
}


/** The card's deck words (deck effects spec §3): `DECK HOLDS` or `OUTCLASSED`, `BREAKER`, `HIDDEN · NO DECK HEAT`; chrome shows on STEADY's own card. */
export function deckNotes(pool: Pick<Pool, 'deck'>): string[] {
  const d = pool.deck;
  if (!d) return [];
  return [...(d.match === 'holds' ? ['DECK HOLDS'] : d.match === 'outclassed' ? ['OUTCLASSED'] : []), ...(d.broke ? ['BREAKER'] : []), ...(d.hidden ? ['HIDDEN · NO DECK HEAT'] : [])];
}

/** NERVE for PUSH (+1d) and for PRESS ON (the table spec §3). */
export const PUSH_NERVE = 2;
export const PRESS_NERVE = 1;


/** Dice for a stat rating (spec §1): 1–3 → 1, 4–6 → 2, 7–8 → 3, 9–10 → 4. */
export const statDice = (rating: number): 1 | 2 | 3 | 4 => (rating >= 9 ? 4 : rating >= 7 ? 3 : rating >= 4 ? 2 : 1);

/** ALARM at which every position is one step worse (spec §1). */
export const ALARM_SHIFT = 2;

const WORSE: Record<Position, Position> = { dark: 'open', open: 'wire', wire: 'wire' };

/** The card's base as its position (spec §1): 55+ in the dark, 45–54 in the open, 44 or less (or red) on the wire; ALARM 2+ one worse. */
export function positionOf(base: number, red: boolean, alarm: number): Position {
  const p: Position = red || base <= 44 ? 'wire' : base >= 55 ? 'dark' : 'open';
  return alarm >= ALARM_SHIFT ? WORSE[p] : p;
}

/** What the last pick left for the next one: NEXT ROLL costs (roll lifecycle spec §1.1), and a setup's bonus (ability pass spec §2). */
export type NextRoll = { worse?: true; small?: true; better?: true; die?: true; noCut?: true };

/**
 * The job's tier on one roll (tier effect spec §1): from tier 2 a roll that fills TAKE is a step smaller, unless a called
 * recruit of grade at least the tier takes it (GREEN..VET read 1–4), or a deck of quality at least the tier runs a
 * position or effect program on it or makes it a grid roll. An ON A ROLL press counts as a call (ability pass spec §1). Null: no cut applies.
 */
export function tierCut(o: { tier?: number; takes: boolean; call?: CallEffect; press?: CallEffect; deck: Deck | null; programs: Program[]; grid: boolean; angle?: boolean; noCut?: boolean }): NonNullable<Pool['tier']> | null {
  const { tier, deck } = o;
  if (tier === undefined || tier < 2 || !o.takes) return null;
  // An angle needs a recruit on the card, of any grade (tier 3 contracts spec §3).
  if (o.angle && [o.call, o.press].some((c) => c?.grade !== undefined)) return { label: 'ANGLE', lifted: true };
  if (o.noCut) return { label: 'INSIDE INFORMATION', lifted: true };
  const by = [o.call, o.press].find((c) => c?.grade !== undefined && c.grade + 1 >= tier);
  if (by) return { label: `${by.label.toUpperCase()} · ${GRADES[by.grade!]}`, lifted: true };
  const holds = deck !== null && deck.quality >= tier;
  if (holds && (o.grid || o.programs.some((p) => p.kind === 'position' || p.kind === 'effect'))) return { label: `${deck.name.toUpperCase()} Q${deck.quality}`, lifted: true };
  return { label: o.angle ? 'ANGLE NEEDS CREW' : `TIER ${tier} −1`, lifted: false };
}

/** What a cracked terminal fills: 2, or on a template job 1 under the tier's cut (a deck of the tier's quality lifts it, as on a grid roll). */
export const crackTake = (q: { tier: number; template?: true }, deck: Deck | null): number => (q.template && tierCut({ tier: q.tier, takes: true, deck, programs: [], grid: true })?.lifted === false ? 1 : 2);

/** SETUP's line for a job of tier 2 or more (tier effect spec §2): the help that covers a roll. */
export const tierLine = (tier: number): string => `TIER ${tier} · rolls run SMALL unless ${GRADES[tier - 1]} crew or a Q${tier}+ deck covers them`;

/**
 * A check's pool for one player: the stat's dice, then deck, crew, modifiers, prep, temper, the approach, a call and PUSH, one die each.
 * After ALARM's shift a breaker deck turns the wire into the open on a grid check, then a lifting call moves it one better,
 * then the trade (SAFE / BOLD). Effect (effect and NERVE spec §1): the choice's `tag`, then heat, an outclassed deck, the
 * trade and PUSH for effect, clamped; none where the check fills no TAKE (`takes: false`, which also ignores the trade and
 * an effect PUSH). `push: true` is PUSH for dice (old clients). `tier`: the job's. `press`: an ON A ROLL ability beside
 * the call (ability pass spec §1): its dice, lift, step of effect and grade count as a call's.
 */
/** A check rolled on another stat: talking past a thing, so off the grid too. */
export const swappedCheck = (check: Check, stat: Check['stat']): Check => ({ ...check, stat, grid: false });

export function poolOf(
  check: Check,
  who: { stats: Stats; deck: Deck | null; with: string; alarm?: number; ctx?: CondCtx; temper?: 'easy' | 'hard' | null; extra?: { delta: number; label: string }[]; push?: boolean | PushMode; approach?: Approach; call?: CallEffect; press?: CallEffect; tier?: number; tag?: Effect; heat?: number; trade?: Trade; takes?: boolean; next?: NextRoll; programs?: Program[] },
): Pool {
  // One More Thing (tier 3 beat play spec §2): the roll is on COOL from here, so what's tied to the old stat drops off.
  const swap = who.call?.stat ?? who.press?.stat;
  if (swap) check = swappedCheck(check, swap);
  const takes = who.takes !== false;
  const push: PushMode | null = who.push === true ? 'dice' : who.push === 'dice' || (who.push === 'effect' && takes) ? who.push : null;
  const trade = takes ? who.trade : undefined;
  const parts: Pool['parts'] = [];
  const add = (label: string, dice: 1 | -1, kind?: PartKind) => parts.push({ label, dice, ...(kind ? { kind } : {}) });
  const noDeck = check.grid && who.deck === null;
  if (check.grid) add(who.deck ? who.deck.name.toUpperCase() : 'NO DECK', who.deck ? 1 : -1, 'pocket');
  for (const c of check.crew) if (c.contact === who.with) add(c.contact.toUpperCase(), 1, 'people');
  for (const m of check.mods ?? []) if (who.ctx && holds(m.when, who.ctx)) add(m.label.toUpperCase(), m.delta >= 0 ? 1 : -1);
  for (const x of who.extra ?? []) add(x.label.toUpperCase(), x.delta >= 0 ? 1 : -1);
  if (who.temper === 'easy') add('EASY MARK', 1);
  if (who.temper === 'hard') add('HARD MARK', -1);
  if (who.approach && APPROACH_STATS[who.approach].includes(check.stat)) add(who.approach.toUpperCase(), 1, 'setup');
  for (const c of [who.call, who.press]) if (c?.dice) add(c.label.toUpperCase(), c.dice);
  if (who.next?.die) add('SET UP', 1);
  if (push === 'dice') add('PUSH', 1, 'push');
  const base = statDice(who.stats[check.stat]);
  const dice = Math.min(POOL_MAX, base + parts.reduce((n, p) => n + p.dice, 0));
  // A greed press's ALARM counts for its own roll (ability pass spec §2), though it lands with it.
  const shifted = positionOf(check.base, check.red, (who.alarm ?? 0) + (who.call?.alarm ?? 0) + (who.press?.alarm ?? 0));
  const d = check.grid ? who.deck : null;
  const broke = Boolean(d?.traits.includes('breaker')) && shifted === 'wire';
  const placed: Position = broke ? 'open' : shifted;
  const edge: DeckEdge | undefined = d
    ? { match: who.tier === undefined || d.quality === who.tier ? null : d.quality > who.tier ? 'holds' : 'outclassed', broke, hidden: d.traits.includes('hidden'), chrome: d.traits.includes('chrome') }
    : undefined;
  // Programs (programs spec §1.4): a position step each, after breaker and before a crew lift.
  const programs = who.programs ?? [];
  const run = programs.reduce((p, x) => (x.kind === 'position' ? better(p) : p), placed);
  const called = who.call?.lift ? better(run) : run;
  const lifted = who.press?.lift ? better(called) : called;
  const traded = trade === 'safe' ? better(lifted) : trade === 'bold' ? WORSE[lifted] : lifted;
  // A NEXT ROLL WORSE cost (roll lifecycle spec §1.1) comes last, after the trade.
  const worsened = who.next?.worse ? WORSE[traded] : traded;
  // A setup's better position (ability pass spec §2) comes after it.
  const position = who.next?.better ? better(worsened) : worsened;
  const cut = tierCut({ tier: who.tier, takes, call: who.call, press: who.press, deck: who.deck, programs, grid: check.grid, angle: check.angle, noCut: who.next?.noCut });
  const effectParts: NonNullable<Pool['effectParts']> = [];
  if (takes) {
    if ((who.heat ?? 0) >= EFFECT_HEAT) effectParts.push({ label: `HEAT ${who.heat}`, step: -1 });
    if (edge?.match === 'outclassed') effectParts.push({ label: 'OUTCLASSED', step: -1 });
    if (cut && !cut.lifted) effectParts.push({ label: cut.label, step: -1 });
    if (who.next?.small) effectParts.push({ label: 'NEXT ROLL', step: -1 });
    // A recruit of the tier's grade on an angle: they'd skip the cut anyway, so what you know makes the roll bigger.
    if (check.angle && [who.call, who.press].some((c) => c?.grade !== undefined && who.tier !== undefined && c.grade + 1 >= who.tier)) effectParts.push({ label: 'ANGLE', step: 1 });
    for (const x of programs) if (x.kind === 'effect') effectParts.push({ label: x.name, step: 1 });
    if (trade) effectParts.push({ label: trade.toUpperCase(), step: trade === 'safe' ? -1 : 1 });
    if (push === 'effect') effectParts.push({ label: 'PUSH', step: 1 });
    for (const c of [who.call, who.press]) if (c?.step) effectParts.push({ label: c.label, step: c.step });
  }
  const start = EFFECTS.indexOf(who.tag ?? 'fair');
  const effectRaw = takes ? effectParts.reduce((n, p) => n + p.step, start) : undefined;
  const effect = effectRaw === undefined ? undefined : EFFECTS[Math.max(0, Math.min(2, effectRaw))];
  const ran = programs.map((x) => ({ id: x.id, label: x.name, alarm: (who.deck && belowTier(who.deck, x, who.tier) ? 1 : 0) as 0 | 1 }));
  const quiet = programs.some((x) => x.kind === 'quiet');
  return { stat: check.stat.toUpperCase(), base, dice, parts, position, path: { placed, lift: who.call?.lift === true, worse: who.next?.worse === true, ...(who.press?.lift ? { press: true as const } : {}), ...(who.next?.better ? { better: true as const } : {}) }, noDeck, ...(edge ? { deck: edge } : {}), ...(effect ? { effect, effectRaw } : {}), effectParts, ...(cut ? { tier: cut } : {}), ...(ran.length ? { programs: ran } : {}), ...(quiet ? { quiet: true as const } : {}) };
}

/** Why SAFE or BOLD isn't offered on this pool (built without it), or null (§1). */
export function tradeRefusal(pool: Pick<Pool, 'position' | 'effect'>, trade: Trade): string | null {
  if (!pool.effect) return 'NOTHING TO TAKE HERE';
  if (trade === 'safe') return pool.position === 'dark' ? 'ALREADY IN THE DARK' : pool.effect === 'small' ? 'ALREADY SMALL' : null;
  return pool.position === 'wire' ? 'ALREADY ON THE WIRE' : pool.effect === 'big' ? 'ALREADY BIG' : null;
}

/** Why a press's step of effect isn't offered on this pool (built without the step), or null (ability pass spec §2): it must have effect to move. */
export function stepRefusal(pool: Pick<Pool, 'effect'>, step: 1 | -1): string | null {
  if (!pool.effect) return 'NOTHING TO TAKE HERE';
  return step > 0 ? (pool.effect === 'big' ? 'ALREADY BIG' : null) : pool.effect === 'small' ? 'ALREADY SMALL' : null;
}

/** Why PUSH for effect isn't offered on this pool (built without it), or null (§1). */
export function effectPushRefusal(pool: Pick<Pool, 'effect'>): string | null {
  if (!pool.effect) return 'NOTHING TO TAKE HERE';
  return pool.effect === 'big' ? 'ALREADY BIG' : null;
}

/** Roll a pool: `dice` d6 keeping the highest, or 2d keeping the lowest at 0 or less. */
export function rollPool(dice: number, d6: () => number): { faces: number[]; keep: 'high' | 'low' } {
  const n = dice >= 1 ? dice : 2;
  return { faces: Array.from({ length: n }, () => d6()), keep: dice >= 1 ? 'high' : 'low' };
}

/** What each position costs on a 4–5 and a miss (spec §1): [ALARM, heat]. */
export const POSITION_COSTS: Record<Position, { cost: [number, number]; miss: [number, number] }> = {
  dark: { cost: [0, 0], miss: [1, 0] },
  open: { cost: [1, 0], miss: [1, 1] },
  wire: { cost: [1, 1], miss: [2, 1] },
};

/** The result of a roll (spec §1): the kept die, two 6s a crit; ALARM and heat by position. */
export function resultOf(faces: number[], keep: 'high' | 'low', position: Position, effect: Effect = 'fair'): DiceResult {
  if (keep === 'high' && faces.filter((f) => f === 6).length >= 2) return kindResult('crit', position, effect);
  const top = keep === 'high' ? Math.max(...faces) : Math.min(...faces);
  return kindResult(top === 6 ? 'clean' : top >= 4 ? 'cost' : 'miss', position, effect);
}

/** A result's TAKE, ALARM and heat from its kind, position and effect (the faces only decide the kind); effect moves a pass's TAKE by one. */
export function kindResult(kind: DiceResult['kind'], position: Position, effect: Effect = 'fair'): DiceResult {
  const c = POSITION_COSTS[position];
  const step = EFFECTS.indexOf(effect) - 1;
  if (kind === 'crit') return { kind, pass: true, take: 3 + step, alarm: 0, heat: 0 };
  if (kind === 'clean') return { kind, pass: true, take: 2 + step, alarm: 0, heat: 0 };
  if (kind === 'cost') return { kind, pass: true, take: 1 + step, alarm: c.cost[0], heat: c.cost[1] };
  return { kind, pass: false, take: 0, alarm: c.miss[0], heat: c.miss[1] };
}

/**
 * Faces for a roll of `n` dice from one test entry (`NIX_TEST_ROLLS`, unit tests): the entry is the face kept,
 * the rest 1s (6s when keeping the lower); `66` is two 6s.
 */
export function facesFor(entry: number, n: number, keep: 'high' | 'low'): number[] {
  if (entry === 66) return Array.from({ length: n }, (_, i) => (i < 2 ? 6 : 1));
  return Array.from({ length: n }, (_, i) => (i === 0 ? entry : keep === 'high' ? 1 : 6));
}

/** A saved miss's faces: the kept die turns to a 5 (keep-low: every die under 5), so the roll reads as the 4–5 it became. */
export function savedFaces(faces: number[], keep: 'high' | 'low'): number[] {
  if (keep === 'low') return faces.map((f) => Math.max(f, 5));
  const i = faces.indexOf(Math.max(...faces));
  return faces.map((f, j) => (j === i ? 5 : f));
}

/**
 * What an AFTER A ROLL ability does to a parked roll (crew abilities spec §2): `save` makes a miss the 4–5 result for its
 * position, its kept die a 5 (no heat on a hidden deck's check; a deck's hold isn't re-applied, an outclassed deck's
 * miss is gone), `alarm` takes one ALARM off, `nerve` gives one back. Null: it can't act on this roll.
 */
export function afterEffect(job: JobEffect, roll: DiceRoll, cost: { alarm: number; heat: number }): { roll: DiceRoll; cost: { alarm: number; heat: number }; nerve: number } | null {
  if (job.kind === 'save') {
    if (roll.kind !== 'miss') return null;
    const [alarm, heat] = POSITION_COSTS[roll.position].cost;
    const { deck: _miss, ...rest } = roll;
    return { roll: { ...rest, faces: savedFaces(roll.faces, roll.keep), kind: 'cost', pass: true, saved: true }, cost: { alarm, heat: roll.hidden ? 0 : heat }, nerve: 0 };
  }
  if (job.kind === 'alarm') return cost.alarm > 0 ? { roll, cost: { ...cost, alarm: cost.alarm - 1 }, nerve: 0 } : null;
  if (job.kind === 'nerve') return { roll, cost, nerve: 1 };
  return null;
}

/** Run It Twice (tier 3 beat play spec §2): the same pool, position and effect, new faces from `seed`; the second result stands. */
export function rerunRoll(o: { seed: string; roll: DiceRoll; faces?: number[] }): DiceRoll {
  const r = rng(hashSeed(o.seed));
  const faces = o.faces ?? o.roll.faces.map(() => 1 + Math.floor(r() * 6));
  const { saved: _saved, deck: _deck, ...was } = o.roll;
  const result = resultOf(faces, o.roll.keep, o.roll.position, o.roll.effect);
  const { saved: _gone, ...unsaved } = o.roll;
  return { ...(result.kind === 'miss' ? unsaved : was), faces, kind: result.kind, pass: result.pass, rerun: true };
}

/** The card a waiting pass shows when nothing's left to pay (a won gamble, a free 4–5): TAKE IT's way on, without its cost. */
export const CARRY_ON = 'CARRY ON';

/** A gamble's die (ability pass spec §2), seeded so rewind and BRANCH HERE roll the same. */
export const gambleDie = (seed: string): number => 1 + Math.floor(rng(hashSeed(seed))() * 6);

/** What a gamble's die does: 4+ a step up (a 4–5 to a clean 6, a miss to a 4–5), else it stays and costs one more (`worse`). */
export const gambleResult = (die: number, on: 'cost' | 'miss'): 'clean' | 'cost' | 'worse' => (die < 4 ? 'worse' : on === 'cost' ? 'clean' : 'cost');

/** Faces whose kept die reads `top`: every other die moved so it stays the one kept. */
export function gambleFaces(faces: number[], keep: 'high' | 'low', top: number): number[] {
  const out = faces.map((f) => (keep === 'high' ? Math.min(f, top) : Math.max(f, top)));
  out[out.indexOf(keep === 'high' ? Math.max(...out) : Math.min(...out))] = top;
  return out;
}

/** A fragile deck dies on a miss that shows a 1 (spec §1). */
export const fragileDies = (faces: number[], result: DiceResult): boolean => result.kind === 'miss' && faces.includes(1);

/** TAKE's segments by job tier (spec §2). */
export const takeSize = (tier: 1 | 2 | 3 | 4): number => (tier === 1 ? 3 : tier === 2 ? 4 : 6);
/** A job's TAKE clock: its own `take-size:` (balancing 2026-11-01), else its tier's. */
export const jobTakeSize = (q: { tier: 1 | 2 | 3 | 4; takeSize?: number }): number => q.takeSize ?? takeSize(q.tier);
