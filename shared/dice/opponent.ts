/**
 * Her play (spec §2): the odds, shaped by three settings from her character file. She sees only
 * her own dice and the bids. She reads your bids as a sign of what you hold, bluffs with the most
 * believable raise her dice don't back, and calls LIAR only when a bid is more likely false.
 */
import { rng } from '../gig/generate';
import { bid, callLiar, countFace, lastBid, minRaise, newGame, totalDice, type DiceState, type Face, type Side } from './rules';

export interface DiceSettings {
  /** How often she makes a raise her dice don't back. */
  bluff: number;
  /** How thin a raise she'll still make rather than call. */
  nerve: number;
  /** How readily she calls LIAR. */
  suspicion: number;
}
export const DEFAULT_SETTINGS: DiceSettings = { bluff: 0.25, nerve: 0.5, suspicion: 0.5 };
/** Tuned in the playable mockup (spec §2, §10). */
export const TUNE = { callBase: 0.15, callSpan: 0.35, acceptBase: 0.5, acceptSpan: 0.35, read: 1.35, bluffLo: 0.3 };

export type Move = { kind: 'bid'; q: number; face: Face; bluff: boolean; p: number } | { kind: 'liar'; p: number };

const FACES: Face[] = [1, 2, 3, 4, 5, 6];
const other = (s: Side): Side => (s === 'you' ? 'her' : 'you');

/** P(the table holds ≥ q of `face`), given `own` and `unknown` hidden dice; `read` > 1 when the other side has bid this face. */
export function chance(q: number, face: Face, own: readonly Face[], unknown: number, read = 1): number {
  const need = q - countFace(own, face);
  if (need <= 0) return 1;
  if (need > unknown) return 0;
  const p = Math.min(0.75, (face === 1 ? 1 / 6 : 1 / 3) * read);
  let tail = 0;
  let c = 1; // C(unknown, k)
  for (let k = 0; k <= unknown; k++) {
    if (k > 0) c = (c * (unknown - k + 1)) / k;
    if (k >= need) tail += c * p ** k * (1 - p) ** (unknown - k);
  }
  return Math.min(1, tail);
}

/** The face her dice back best: most dice with wild 1s, never 1s, the higher face on a tie. */
export function strongestFace(own: readonly Face[]): Face {
  let best: Face = 2;
  for (const f of [3, 4, 5, 6] as Face[]) if (countFace(own, f) >= countFace(own, best)) best = f;
  return best;
}

/** One move for whoever's turn it is, seeing only their own dice. */
export function chooseMove(s: DiceState, settings: DiceSettings, rand: () => number): Move {
  const me = s.turn;
  const own = s.dice[me];
  const unknown = s.left[other(me)];
  const total = totalDice(s);
  const last = lastBid(s);
  const theirs = new Set(s.bids.filter((b) => b.by !== me).map((b) => b.face));
  const read = (f: Face) => (theirs.has(f) ? TUNE.read : 1);
  const callLine = TUNE.callBase + TUNE.callSpan * settings.suspicion;
  const accept = TUNE.acceptBase - TUNE.acceptSpan * settings.nerve;

  if (!last) {
    const f = strongestFace(own);
    let q = Math.max(1, Math.floor(countFace(own, f) + unknown / 3));
    const bluffing = rand() < settings.bluff;
    if (bluffing) q++;
    q = Math.min(q, total);
    return { kind: 'bid', q, face: f, bluff: bluffing, p: chance(q, f, own, unknown) };
  }

  const pLast = chance(last.q, last.face, own, unknown, read(last.face));
  if (pLast === 0 || pLast < callLine) return { kind: 'liar', p: 1 - pLast };

  // Every legal raise, most likely first (non-1 faces win ties, then the higher face).
  const raises = FACES.map((f) => ({ face: f, q: minRaise(last, f, total) }))
    .filter((x) => x.q !== Infinity)
    .map((x) => ({ ...x, p: chance(x.q, x.face, own, unknown, read(x.face)) }))
    .sort((a, b) => b.p - a.p || Number(a.face === 1) - Number(b.face === 1) || b.face - a.face);
  const best = raises[0];

  // A bluff: the most believable raise her dice don't back.
  if (rand() < settings.bluff) {
    const b = raises.find((x) => x.p >= TUNE.bluffLo && x.p < 0.5);
    if (b) return { kind: 'bid', q: b.q, face: b.face, bluff: true, p: b.p };
  }
  // Nothing she likes: call only if the bid on the table is more likely false than true.
  if (!best || (best.p < accept && pLast < 0.5)) return { kind: 'liar', p: 1 - pLast };
  return { kind: 'bid', q: best.q, face: best.face, bluff: false, p: best.p };
}

/** `n` games of `a` (as her) against `b` (as you): for tests and tuning. */
export function simulate(n: number, a: DiceSettings, b: DiceSettings, seed: number): { herWinRate: number; bluffRate: number; bluffsCalled: number; callsPerGame: number; callsRight: number } {
  let wins = 0;
  let bluffs = 0;
  let bluffsCalled = 0;
  let calls = 0;
  let callsRight = 0;
  let bids = 0;
  for (let i = 0; i < n; i++) {
    const gameSeed = seed + i * 7919;
    let s = newGame(gameSeed);
    const r = rng(gameSeed ^ 0x9e3779b9);
    for (let guard = 0; !s.over && guard < 500; guard++) {
      const me = s.turn;
      const m = chooseMove(s, me === 'her' ? a : b, r);
      if (m.kind === 'liar') {
        const last = lastBid(s)!;
        const { state, record } = callLiar(s);
        s = state;
        if (me === 'her') {
          calls++;
          if (record.loser !== 'her') callsRight++;
        } else if (last.by === 'her' && last.bluff) bluffsCalled++;
      } else {
        s = bid(s, m.q, m.face, m.bluff);
        if (me === 'her') {
          bids++;
          if (m.bluff) bluffs++;
        }
      }
    }
    if (s.over === 'her') wins++;
  }
  return { herWinRate: wins / n, bluffRate: bluffs / Math.max(1, bids), bluffsCalled: bluffsCalled / Math.max(1, bluffs), callsPerGame: calls / n, callsRight: callsRight / Math.max(1, calls) };
}
