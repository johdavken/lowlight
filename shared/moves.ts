/**
 * Off-screen moves (spec 2026-11-18): every 2 story hours, contacts who aren't with you do something in the city. Stored
 * in playthrough.json (`moves`, `beat`, `since`); pure rules here, the runner in server/src/moves.ts.
 */
import { DAY } from './clock';

export type MoveEffect = { kind: 'going'; place: string; until: number } | { kind: 'text'; about: string; tries?: number; sent?: true } | { kind: 'word' };

export interface Move {
  /** The even hour the beat ran at (story minutes): the move counts once the clock is there. */
  beat: number;
  /** When it happened, inside the mover's window (`at ≤ beat`). */
  at: number;
  who: string;
  /** One first-person line, in her voice. */
  line: string;
  /** Where it happened (a scene id). */
  place: string;
  effect?: MoveEffect;
}

/** A beat on every even story hour. */
export const BEAT_EVERY = 120;
/** A long jump's one beat covers at most this much. */
export const BEAT_SPAN_MAX = 480;
export const MOVERS_MAX = 3;
/** What the prompt asks for. */
export const LINE_MAX = 140;
/** Clipped at a word under this; refused over it. */
export const LINE_CLIP = 160;
/** A window clipped shorter than this leaves her out. */
export const HER_WINDOW_MIN = 30;
/** Spans and the place check move in these steps. */
export const STEP = 30;
export const GOING_DEFAULT = 120;
export const MOVES_KEEP = 2 * DAY;
export const SINCE_SHOWN = 3;
export const WORD_SHOWN = 2;
/** Failed beats in a row before beats stop for the session. */
export const DEAD_BEATS = 3;

/** The first even hour strictly after `start`. */
export function firstBeat(start: number): number {
  return Math.floor(start / BEAT_EVERY) * BEAT_EVERY + BEAT_EVERY;
}

/** The newest even hour at or before `clock` that hasn't run (later than `last`, and no earlier than the first beat); null: none. */
export function dueBeat(clock: number, last: number | null, start: number): number | null {
  const newest = Math.floor(clock / BEAT_EVERY) * BEAT_EVERY;
  if (newest < firstBeat(start)) return null;
  if (last !== null && newest <= last) return null;
  return newest;
}

/** What a beat covers: from the last one (or the start), at most BEAT_SPAN_MAX back. */
export function beatWindow(beat: number, last: number | null, start: number): { from: number; to: number } {
  return { from: Math.max(last ?? start, beat - BEAT_SPAN_MAX), to: beat };
}

/** Her part of the window: she only moved after you left her. Under HER_WINDOW_MIN: null. */
export function herWindow(w: { from: number; to: number }, parted: number | undefined): { from: number; to: number } | null {
  const from = parted !== undefined ? Math.max(w.from, parted) : w.from;
  return w.to - from < HER_WINDOW_MIN ? null : { from, to: w.to };
}

/** The beat that stands after a rewind left the clock at `clock`: every even hour up to it ran, moves or not; null: none yet. */
export function beatStanding(clock: number, start: number): number | null {
  const b = Math.floor(clock / BEAT_EVERY) * BEAT_EVERY;
  return b >= firstBeat(start) ? b : null;
}

/** The moves that count now: their beat has come. */
export function standing(moves: readonly Move[], clock: number): Move[] {
  return moves.filter((m) => m.beat <= clock);
}

/** A rewind left the clock at `clock`: later beats never happened. */
export function undoBeats(moves: readonly Move[], clock: number): { moves: Move[]; beat: number | null } {
  const kept = standing(moves, clock);
  return { moves: kept, beat: kept.length > 0 ? Math.max(...kept.map((m) => m.beat)) : null };
}

/** The fields a branch from a line at `clock` keeps. Absent stays absent. */
export function forBranch(o: { moves?: Move[]; beat?: number; since?: Record<string, number> }, clock: number): { moves?: Move[]; beat?: number; since?: Record<string, number> } {
  const out: { moves?: Move[]; beat?: number; since?: Record<string, number> } = {};
  if (o.moves !== undefined || o.beat !== undefined) {
    const { moves, beat } = undoBeats(o.moves ?? [], clock);
    // Every even hour up to the line ran, moves or not (review I1): the newest of them stands.
    const ran = o.beat === undefined ? null : o.beat <= clock ? o.beat : Math.floor(clock / BEAT_EVERY) * BEAT_EVERY;
    const b = Math.max(beat ?? -Infinity, ran ?? -Infinity);
    if (moves.length > 0) out.moves = moves;
    if (Number.isFinite(b)) out.beat = b;
  }
  if (o.since !== undefined) out.since = Object.fromEntries(Object.entries(o.since).filter(([, t]) => t <= clock));
  return out;
}

export function pruneOld(moves: readonly Move[], clock: number): Move[] {
  return moves.filter((m) => m.at >= clock - MOVES_KEEP);
}

type Going = Move & { effect: { kind: 'going'; place: string; until: number } };
/** Her standing going moves, newest beat first; none made before you last left her. */
function goings(moves: readonly Move[], who: string, clock: number, parted?: number): Going[] {
  return standing(moves, clock)
    .filter((m): m is Going => m.who === who && m.effect?.kind === 'going' && (parted === undefined || m.beat >= parted))
    .sort((a, b) => b.beat - a.beat);
}

/** Where a going move has her at `clock` (from its beat until its end); null: none. */
export function goingAt(moves: readonly Move[], who: string, clock: number, parted?: number): { place: string; until: number; beat: number } | null {
  const g = goings(moves, who, clock, parted).find((m) => clock < m.effect.until);
  return g ? { place: g.effect.place, until: g.effect.until, beat: g.beat } : null;
}

/** The newest going move that has ended: where it left her. */
export function lastGoing(moves: readonly Move[], who: string, clock: number, parted?: number): { place: string; until: number; beat: number } | null {
  const g = goings(moves, who, clock, parted).find((m) => m.effect.until <= clock);
  return g ? { place: g.effect.place, until: g.effect.until, beat: g.beat } : null;
}

/** What the beat checks one mover against (spec §2.3, §4.1). */
export interface MoverCheck {
  id: string;
  /** Her part of the window (herWindow). */
  window: { from: number; to: number };
  /** Where the world puts her at a minute; null: her room's scene (`room`). */
  placeAt(clock: number): string | null;
  room: string;
  /** Whether a fixed block of hers falls in [from, to). */
  fixed(from: number, to: number): boolean;
  /** Her meeting with you, in story minutes (the stored plan's meet, for MEET_WAIT); null: none. */
  meeting: { from: number; to: number } | null;
}

/** `hh:mm` as the minute inside `w` it names; null: not a time, or not in the window. */
function inWindow(hhmm: unknown, w: { from: number; to: number }): number | null {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d\d?):(\d\d)$/.exec(hhmm.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const of = Number(m[1]) * 60 + Number(m[2]);
  let t = w.from - (((w.from % DAY) + DAY) % DAY) + of;
  if (t < w.from) t += DAY;
  return t <= w.to ? t : null;
}

const named = (line: string, name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(line);

/**
 * The beat's answer (`{"moves":[…]}`, already parsed) as the moves it keeps, and a reason for each it refuses (spec §2.3).
 * A move whose effect can't stand keeps its line without it.
 */
export function keepMoves(answer: unknown, o: { beat: number; movers: MoverCheck[]; places: Set<string>; fenced: string[] }): { moves: Move[]; refused: string[] } {
  const list = typeof answer === 'object' && answer !== null ? (answer as { moves?: unknown }).moves : undefined;
  if (!Array.isArray(list)) return { moves: [], refused: ['no moves list'] };
  const moves: Move[] = [];
  const refused: string[] = [];
  const seen = new Set<string>();
  let word = false;
  let text = false;
  for (const raw of list) {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '?';
    const refuse = (why: string) => refused.push(`${id}: ${why}`);
    const mover = o.movers.find((m) => m.id === id);
    if (!mover) {
      refuse('not one who could move');
      continue;
    }
    if (seen.has(id)) {
      refuse('a second move');
      continue;
    }
    if (moves.length >= MOVERS_MAX) {
      refuse(`more than ${MOVERS_MAX}`);
      continue;
    }
    const at = inWindow(r.at, mover.window);
    if (at === null) {
      refuse(`at ${String(r.at)} is outside her window`);
      continue;
    }
    const place = typeof r.place === 'string' ? r.place : '';
    const where = (t: number) => mover.placeAt(t) ?? mover.room;
    if (![at, at - STEP, at + STEP].some((t) => where(t) === place)) {
      refuse(`${place || 'no place'} isn't where she was at ${String(r.at)}`);
      continue;
    }
    const line = typeof r.line === 'string' ? r.line.replace(/\s+/g, ' ').trim() : '';
    if (line === '' || line.length > LINE_CLIP) {
      refuse(line === '' ? 'empty line' : 'line too long');
      continue;
    }
    // Each part of a name of 3+ letters (final review I3): a surname alone is still them.
    const hit = o.fenced.flatMap((n) => n.split(/\s+/)).find((w) => w.length >= 3 && named(line, w));
    if (hit) {
      refuse(`names ${hit}`);
      continue;
    }
    seen.add(id);
    const move: Move = { beat: o.beat, at, who: id, line, place };
    const e = (typeof r.effect === 'object' && r.effect !== null ? r.effect : null) as Record<string, unknown> | null;
    const drop = (why: string) => refused.push(`${id}: effect dropped, ${why}`);
    if (e?.kind === 'going') {
      const to = typeof e.place === 'string' ? e.place : '';
      const cap = o.beat + BEAT_EVERY + GOING_DEFAULT;
      const named = inWindow(e.until, { from: o.beat, to: o.beat + DAY });
      const until = named === null || named <= o.beat ? o.beat + GOING_DEFAULT : Math.min(named, cap);
      if (!o.places.has(to)) drop(`${to || 'no place'} isn't a place`);
      else if (mover.fixed(o.beat, until)) drop('a fixed block');
      else if (mover.meeting && o.beat < mover.meeting.to && until > mover.meeting.from) drop('her meeting with you');
      else move.effect = { kind: 'going', place: to, until };
    } else if (e?.kind === 'word') {
      if (word) drop('a second word');
      else {
        word = true;
        move.effect = { kind: 'word' };
      }
    } else if (e?.kind === 'text') {
      const about = typeof e.about === 'string' ? e.about.trim() : '';
      if (text) drop('a second text');
      else if (about === '') drop('a text about nothing');
      else {
        text = true;
        move.effect = { kind: 'text', about };
      }
    }
    moves.push(move);
  }
  return { moves, refused };
}

const hm = (t: number) => {
  const d = ((t % DAY) + DAY) % DAY;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

/** Her moves since you last saw her (spec §5): her standing moves after `since` (or the start), SINCE_SHOWN at most, newest kept. */
export function sinceLine(moves: readonly Move[], who: string, since: number | null, start: number, clock: number, player: string): string | null {
  const from = since ?? start;
  const hers = standing(moves, clock)
    .filter((m) => m.who === who && m.at >= from)
    .sort((a, b) => a.at - b.at)
    .slice(-SINCE_SHOWN);
  return hers.length === 0 ? null : `[since you last saw ${player}: ${hers.map((m) => `${hm(m.at)} ${m.line}`).join(' · ')}]`;
}

/** Word on the street she'd have heard (spec §4.3): standing `word` moves from the last story day, WORD_SHOWN at most, newest kept. */
export function wordLine(moves: readonly Move[], heardBy: (m: Move) => boolean, clock: number, name: (id: string) => string): string | null {
  const heard = standing(moves, clock)
    .filter((m) => m.effect?.kind === 'word' && m.at >= clock - DAY && heardBy(m))
    .sort((a, b) => a.at - b.at)
    .slice(-WORD_SHOWN);
  return heard.length === 0 ? null : `[word going round: ${heard.map((m) => `${name(m.who)} · ${m.line}, ${hm(m.at)}`).join(' · ')}]`;
}
