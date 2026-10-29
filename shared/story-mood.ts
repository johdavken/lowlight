/**
 * Moods from story state (spec 2026-10-20-story-moods): which of a room's moods the story calls for
 * now, and a key naming the rule and its window, so the room acts only when the key changes. The
 * first rule that applies wins; a rule applies only when the room has one of its moods.
 */
import { DAY, minuteOfDay, parseHhmm } from './clock';

export type JobState = 'on' | 'after' | null;

export interface MoodInput {
  /** The room's mood names (its presets). */
  moods: readonly string[];
  /** The room's venue hours, HH:MM (absent: not a venue). */
  hours?: { open: string; close: string };
  /** Story clock minutes. */
  now: number;
  /** A job under way, just over (within AFTER_JOB_MINUTES), or neither. */
  job: JobState;
}

/** How long after a job its "after" moods hold, in story minutes. */
export const AFTER_JOB_MINUTES = 120;

/** The clock windows: dawn 04:30–07:00, late 00:00–04:30 (start minute of day, length). */
const DAWN = { start: 270, length: 150 };
const LATE = { start: 0, length: 270 };
/** Last call is the half hour before close; closing the half hour after. */
const HALF = 30;

/** The story day a window holding `now` began on, or null when `now` is outside it. */
function windowDay(now: number, w: { start: number; length: number }): number | null {
  if (w.length <= 0) return null;
  const into = (minuteOfDay(now) - w.start + DAY) % DAY;
  return into < w.length ? Math.floor((now - into) / DAY) + 1 : null;
}

/** The first of `names` the room has. */
const first = (moods: readonly string[], names: string[]): string | null => names.find((n) => moods.includes(n)) ?? null;

export function moodFor(o: MoodInput): { key: string; mood: string } | null {
  const rules: Array<() => { key: string; names: string[] } | null> = [
    () => (o.job === 'on' ? { key: 'job', names: ['tense'] } : null),
    () => (o.job === 'after' ? { key: 'after-job', names: ['after-the-job', 'after-hours'] } : null),
    ...venueRules(o),
    () => dayRule('dawn', DAWN, ['dawn']),
    () => dayRule('late', LATE, ['late']),
  ];
  function dayRule(name: string, w: { start: number; length: number }, names: string[]) {
    const day = windowDay(o.now, w);
    return day === null ? null : { key: `${name}@${day}`, names };
  }
  for (const rule of rules) {
    const r = rule();
    const mood = r && first(o.moods, r.names);
    if (r && mood) return { key: r.key, mood };
  }
  return null;
}

/** Last call, closing and closed, for a room with hours. */
function venueRules(o: MoodInput): Array<() => { key: string; names: string[] } | null> {
  const open = o.hours ? parseHhmm(o.hours.open) : null;
  const close = o.hours ? parseHhmm(o.hours.close) : null;
  // Open == close is open all day: no last call, no closing.
  if (open === null || close === null || open === close) return [];
  // The time from closing to opening again: closing takes its first half hour, closed the rest (none when it reopens sooner).
  const shut = (open - close + DAY) % DAY;
  const windows: Array<[string, { start: number; length: number }, string[]]> = [
    ['last-call', { start: (close - HALF + DAY) % DAY, length: HALF }, ['last-call']],
    ['closing', { start: close, length: Math.min(HALF, shut) }, ['closing-up', 'closing']],
    ['closed', { start: (close + HALF) % DAY, length: Math.max(0, shut - HALF) }, ['closed', 'lights-out']],
  ];
  return windows.map(([name, w, names]) => () => {
    const day = windowDay(o.now, w);
    return day === null ? null : { key: `${name}@${day}`, names };
  });
}
