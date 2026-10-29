/**
 * Liar's dice (spec §1): Perudo with LIAR only. Five dice each, 1s wild except in a bid on 1s,
 * raise or call; whoever's wrong loses a die, and out of dice is out of the game. Pure and plain
 * data: the RNG travels in the state, so a game can be copied, saved or replayed from its seed.
 */

export type Face = 1 | 2 | 3 | 4 | 5 | 6;
export type Side = 'you' | 'her';
export interface Bid {
  q: number;
  face: Face;
  by: Side;
  /** Hers only: she knew her dice didn't back it (for stats and the dev log). */
  bluff?: boolean;
}
export interface RoundRecord {
  round: number;
  bids: Bid[];
  caller: Side;
  dice: { you: Face[]; her: Face[] };
  /** The bid that was called. */
  bid: Bid;
  count: number;
  loser: Side;
  /** Dice left after the round. */
  left: { you: number; her: number };
}
export interface DiceState {
  seed: number;
  round: number;
  left: { you: number; her: number };
  dice: { you: Face[]; her: Face[] };
  bids: Bid[];
  turn: Side;
  opener: Side;
  /** The winner, once someone is out of dice. */
  over: Side | null;
  rounds: RoundRecord[];
  /** mulberry32's accumulator (shared/gig/generate.ts's rng), carried so the state stays plain data. */
  rngState: number;
}

export const START_DICE = 5;

const other = (s: Side): Side => (s === 'you' ? 'her' : 'you');

/** One step of mulberry32: the number and the next accumulator. */
function nextRandom(a: number): [number, number] {
  const next = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

function roll(a: number, n: number): [Face[], number] {
  const out: Face[] = [];
  for (let i = 0; i < n; i++) {
    const [r, next] = nextRandom(a);
    a = next;
    out.push((1 + Math.floor(r * 6)) as Face);
  }
  return [out, a];
}

/** Dice that count toward a bid on `face`: the face and every wild 1; a bid on 1s counts only 1s. */
export function countFace(dice: readonly Face[], face: Face): number {
  return dice.filter((d) => d === face || (face !== 1 && d === 1)).length;
}

/** The lowest legal quantity on `face` after `last`; Infinity if none fits under `total`. */
export function minRaise(last: Bid | null, face: Face, total: number): number {
  let q: number;
  if (!last) q = face === 1 ? Infinity : 1;
  else if (last.face !== 1 && face !== 1) q = face > last.face ? last.q : last.q + 1;
  else if (last.face !== 1) q = Math.ceil(last.q / 2);
  else if (face !== 1) q = 2 * last.q + 1;
  else q = last.q + 1;
  return q <= total ? q : Infinity;
}

export function isLegal(last: Bid | null, q: number, face: Face, total: number): boolean {
  return Number.isInteger(q) && q <= total && q >= minRaise(last, face, total);
}

export function newGame(seed: number): DiceState {
  const [you, a1] = roll(seed >>> 0, START_DICE);
  const [her, a2] = roll(a1, START_DICE);
  return { seed, round: 1, left: { you: START_DICE, her: START_DICE }, dice: { you, her }, bids: [], turn: 'you', opener: 'you', over: null, rounds: [], rngState: a2 };
}

export const totalDice = (s: DiceState): number => s.left.you + s.left.her;
export const lastBid = (s: DiceState): Bid | null => s.bids[s.bids.length - 1] ?? null;

export function bid(s: DiceState, q: number, face: Face, bluff?: boolean): DiceState {
  if (s.over) throw new Error('the game is over');
  if (!isLegal(lastBid(s), q, face, totalDice(s))) throw new Error(`can't bid ${q} × ${face} now`);
  const b: Bid = bluff === undefined ? { q, face, by: s.turn } : { q, face, by: s.turn, bluff };
  return { ...s, bids: [...s.bids, b], turn: other(s.turn) };
}

/** LIAR on the last bid, by whoever's turn it is. Rolls the next round unless someone is out. */
export function callLiar(s: DiceState): { state: DiceState; record: RoundRecord } {
  const last = lastBid(s);
  if (!last || s.over) throw new Error('nothing to call');
  const caller = s.turn;
  const count = countFace([...s.dice.you, ...s.dice.her], last.face);
  const loser = count >= last.q ? caller : last.by;
  const left = { ...s.left, [loser]: s.left[loser] - 1 };
  const record: RoundRecord = { round: s.round, bids: [...s.bids], caller, dice: { you: [...s.dice.you], her: [...s.dice.her] }, bid: last, count, loser, left: { ...left } };
  const rounds = [...s.rounds, record];
  if (left[loser] === 0) return { state: { ...s, left, rounds, over: other(loser) }, record };
  const [you, a1] = roll(s.rngState, left.you);
  const [her, a2] = roll(a1, left.her);
  return { state: { ...s, left, rounds, round: s.round + 1, bids: [], turn: loser, opener: loser, dice: { you, her }, rngState: a2 }, record };
}
