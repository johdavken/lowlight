/**
 * Liar's dice in words (spec §4–§5): bids as people say them, the stake, a round from her side,
 * the game as the conversation keeps it (a copy, like a gig's snapshot), and the line she reacts to.
 */
import type { Face, RoundRecord, Side } from './rules';

export const STAKE_MAX = 60;
export const STAKES = ['a drink', 'the next round', 'a truth', 'nothing'] as const;
const MAX_ROUNDS = 20;
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "four 5s", "one 5", "11 6s". */
export function bidText(b: { q: number; face: Face }): string {
  return `${NUM[b.q] ?? String(b.q)} ${b.face}${b.q === 1 ? '' : 's'}`;
}

/** A stake as one line, trimmed, at most STAKE_MAX characters, its square brackets round (they'd end her `[dice: …]` line); nothing typed is "nothing". */
export function cleanStake(raw: string): string {
  const s = raw.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim().slice(0, STAKE_MAX).trim();
  return s || 'nothing';
}

/** A finished game as the conversation keeps it. `result` is yours: won means you beat her. */
export interface DiceSnapshot {
  you: string;
  her: string;
  stake: string;
  result: 'won' | 'lost';
  rounds: RoundRecord[];
  /** Her line for each round (null where none came). */
  lines: (string | null)[];
  /** The deal's seed (replays the game); rows saved before it was kept have none. */
  seed?: number;
}

/** One round in a line. From her side (her context) "you" is her; from yours (the feed's card) it's you. */
export function roundSummary(r: RoundRecord, names: { you: string; her: string }, from: Side = 'her'): string {
  const who = (s: Side) => (s === from ? 'you' : s === 'her' ? names.her : names.you);
  return `round ${r.round}: ${who(r.bid.by)} bid ${bidText(r.bid)}, ${who(r.caller)} called, there ${r.count === 1 ? 'was' : 'were'} ${r.count}, ${who(r.loser)} lost a die`;
}

export function diceActionLine(d: DiceSnapshot): string {
  return `*${d.you} plays liar's dice with ${d.her}, for ${d.stake}.*`;
}

/** Her context for the game (spec §5.2): the turn's text. */
export function diceText(d: DiceSnapshot): string {
  const end = d.rounds[d.rounds.length - 1].left;
  const score = d.result === 'won' ? `${d.you} won, ${end.you} dice to ${end.her}` : `You won, ${end.her} dice to ${end.you}`;
  const how = d.rounds.map((r) => roundSummary(r, d)).join('; ');
  const said = d.lines.filter((l): l is string => !!l);
  const lines = said.length ? ` What you said at the table: ${said.map((l) => `"${l}"`).join(' / ')}` : '';
  return `[dice: ${d.you} just played liar's dice with you, for ${d.stake}. ${score}, over ${d.rounds.length} round${d.rounds.length === 1 ? '' : 's'}. How it went: ${how}.${lines}]`;
}

const isSide = (v: unknown): v is Side => v === 'you' || v === 'her';
const isFace = (v: unknown): v is Face => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6;
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10;
const isBid = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return Number.isInteger(b.q) && (b.q as number) >= 1 && (b.q as number) <= 10 && isFace(b.face) && isSide(b.by);
};

/** The shape of a finished round (from outside: the tab, an undo's restore). */
export function isRoundRecord(v: unknown): v is RoundRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const dice = r.dice as Record<string, unknown> | undefined;
  const left = r.left as Record<string, unknown> | undefined;
  return (
    Number.isInteger(r.round) &&
    (r.round as number) >= 1 &&
    Array.isArray(r.bids) &&
    r.bids.length <= 64 &&
    r.bids.every(isBid) &&
    isSide(r.caller) &&
    typeof dice === 'object' &&
    dice !== null &&
    [dice.you, dice.her].every((d) => Array.isArray(d) && d.length <= 5 && d.every(isFace)) &&
    isBid(r.bid) &&
    isCount(r.count) &&
    isSide(r.loser) &&
    typeof left === 'object' &&
    left !== null &&
    isCount(left.you) &&
    isCount(left.her)
  );
}

/** A snapshot from outside, or null when it isn't a whole one. */
export function parseDiceSnapshot(v: unknown): DiceSnapshot | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (typeof d.you !== 'string' || typeof d.her !== 'string' || typeof d.stake !== 'string' || d.stake !== cleanStake(d.stake)) return null;
  if (d.result !== 'won' && d.result !== 'lost') return null;
  if (!Array.isArray(d.rounds) || d.rounds.length < 1 || d.rounds.length > MAX_ROUNDS || !d.rounds.every(isRoundRecord)) return null;
  if (!Array.isArray(d.lines) || d.lines.length !== d.rounds.length || !d.lines.every((l) => l === null || typeof l === 'string')) return null;
  if (d.seed !== undefined && !Number.isInteger(d.seed)) return null;
  return { you: d.you, her: d.her, stake: d.stake, result: d.result, rounds: d.rounds as RoundRecord[], lines: d.lines as (string | null)[], ...(d.seed !== undefined ? { seed: d.seed as number } : {}) };
}
