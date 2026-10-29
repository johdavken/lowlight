/**
 * Lowlight's story clock (spec 2026-10-10 story clock): minutes since Day 1 00:00, per playthrough.
 * A story starts at night, Day 1 20:00. Day 1 is a Thursday (spec 2026-10-20 weekdays). Schedules
 * are blocks of minutes-of-day, each on every day or on the days it lists.
 */
import type { ChatMode } from './types';

export const DAY = 1440;
/** Where a playthrough's clock starts: Day 1, 20:00. */
export const START = 1200;
/** A week of minutes. */
export const WEEK = 7 * DAY;
/** Weekdays, Monday first; a block's `days` and `weekdayOf` index into it. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
/** Day 1's weekday: Thursday. */
export const START_WEEKDAY = 3;
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Minutes a turn of each kind moves the clock, charged on its user row. */
export const TURN_COST: Record<ChatMode, number> = { rp: 5, ooc: 5, encounter: 10, quest: 10, dice: 15, travel: 20, gig: 30, greet: 0, end: 0, scene: 0, text: 2 };

const two = (n: number) => String(n).padStart(2, '0');
const hhmm = (m: number) => `${two(Math.floor(minuteOfDay(m) / 60))}:${two(minuteOfDay(m) % 60)}`;
const day = (m: number) => Math.floor(m / DAY) + 1;

/** The weekday of clock time `m`, 0 (Monday) to 6 (Sunday). */
export function weekdayOf(m: number): number {
  return (((Math.floor(m / DAY) + START_WEEKDAY) % 7) + 7) % 7;
}

/** `Saturday`. */
export function weekdayName(i: number): string {
  return FULL[i]!;
}

/** `Sat`. */
export function weekdayShort(i: number): string {
  return FULL[i]!.slice(0, 3);
}

/** `Day 3 · Sat 21:40`. */
export function formatClock(m: number): string {
  return `Day ${day(m)} · ${weekdayShort(weekdayOf(m))} ${hhmm(m)}`;
}

/** Her prompt's line: `[time: Saturday, Day 3, 21:40]`. */
export function promptClock(m: number): string {
  return `[time: ${weekdayName(weekdayOf(m))}, Day ${day(m)}, ${hhmm(m)}]`;
}

/** `HH:MM` (two digits each, 00:00–23:59) → minute of day; null otherwise. */
export function parseHhmm(s: string): number | null {
  const m = /^(\d\d):(\d\d)$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** A minute-of-day as `HH:MM`. */
export function hhmmOf(minuteOfDay: number): string {
  return hhmm(minuteOfDay);
}

export function minuteOfDay(m: number): number {
  return ((m % DAY) + DAY) % DAY;
}

/** The next clock time, strictly after `m`, whose time of day is `at` (a minute of day). */
export function nextOccurrence(m: number, at: number): number {
  const base = m - minuteOfDay(m) + at;
  return base > m ? base : base + DAY;
}

/**
 * A schedule block: `from` inclusive, `to` exclusive (minutes of day); `to < from` runs past midnight.
 * `days` (weekday indices, sorted, unique, non-empty) limits it to those days; none means every day.
 * An overnight block belongs to the day it starts: Friday 20:00–04:00 holds into Saturday morning.
 */
export interface Block {
  from: number;
  to: number;
  room: string;
  days?: number[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const daysOf = (b: Block) => b.days ?? ALL_DAYS;
const lengthOf = (b: Block) => (b.to - b.from + DAY) % DAY;
/** Clock time `m` as a minute of the week, Monday 00:00 = 0. */
const weekMinute = (m: number) => weekdayOf(m) * DAY + minuteOfDay(m);

/** Whether `b` holds week minute `x` (its spans wrap past Sunday into Monday). */
function coversWeek(b: Block, x: number): boolean {
  const len = lengthOf(b);
  return daysOf(b).some((d) => (((x - (d * DAY + b.from)) % WEEK) + WEEK) % WEEK < len);
}

/**
 * A block's `days` as written in a character file (spec 2026-10-20 weekdays): none → `{}`; names
 * (any case) → sorted unique indices, with all seven → `{}`; `[]` → `{ days: [] }` for the caller to
 * reject; an unknown name, or anything not a list → `{ bad }`.
 */
export function parseDays(raw: unknown): { days?: number[]; bad?: string } {
  if (raw === undefined) return {};
  if (!Array.isArray(raw)) return { bad: String(raw) };
  const days = new Set<number>();
  for (const n of raw) {
    const i = typeof n === 'string' ? (WEEKDAYS as readonly string[]).indexOf(n.toLowerCase()) : -1;
    if (i < 0) return { bad: String(n) };
    days.add(i);
  }
  if (days.size === 7) return {};
  return { days: [...days].sort((a, b) => a - b) };
}

/** The room of the block covering clock time `m`, or null (free). */
export function scheduledRoom(blocks: Block[], m: number): string | null {
  const x = weekMinute(m);
  return blocks.find((b) => coversWeek(b, x))?.room ?? null;
}

/** Whether two blocks share any minute of the week. */
export function blocksOverlap(a: Block, b: Block): boolean {
  if (lengthOf(a) === 0 || lengthOf(b) === 0) return false;
  // Two arcs on the week's circle meet iff one holds the other's start.
  return daysOf(a).some((d) => coversWeek(b, d * DAY + a.from)) || daysOf(b).some((d) => coversWeek(a, d * DAY + b.from));
}

/** The soonest block start strictly after clock time `m` (searching a week ahead), with its clock minute. */
export function nextBlockStart(blocks: Block[], m: number): { block: Block; at: number } | null {
  let best: { block: Block; at: number } | null = null;
  for (const block of blocks) {
    const days = daysOf(block);
    for (let at = nextOccurrence(m, block.from); at <= m + WEEK; at += DAY) {
      if (!days.includes(weekdayOf(at))) continue;
      if (!best || at < best.at) best = { block, at };
      break;
    }
  }
  return best;
}

/** Whether any block's start falls in `(after, upTo]` (clock minutes, across days). */
export function blockStartedBetween(blocks: Block[], after: number, upTo: number): boolean {
  if (upTo <= after) return false;
  return blocks.some((b) => {
    const next = nextBlockStart([b], after);
    return next !== null && next.at <= upTo;
  });
}

/** The block that starts next after clock time `m` (null with none). */
export function nextBlock(blocks: Block[], m: number): Block | null {
  return nextBlockStart(blocks, m)?.block ?? null;
}
