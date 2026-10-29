/**
 * Her plan (her plans spec 2026-10-21): where she heads now, and where and when she said she'd be.
 * Stored as `plan.<player>` meta in her room database, under the stamp of the reply it came from.
 */
import { hhmmOf, minuteOfDay, nextOccurrence, parseHhmm } from './clock';

export interface Plan {
  /** Where she heads now, and until when (story minutes). */
  going: { place: string; until: number } | null;
  /** Where and when she said she'd be. She waits there MEET_WAIT minutes. */
  meet: { place: string; at: number } | null;
  /** The reply it came from. */
  from: string;
  /** You walked in on her during the meeting. */
  met?: true;
  /** You came back after the meeting, having left her before it: she waited for nothing (spec §6). */
  missed?: true;
  /** You joined her at the place she went: her going is done, no card again (final review M3). */
  joined?: true;
}

/** The Residual's answer: places are scene ids, times HH:MM. */
export interface PlanAnswer {
  going: { place: string; until: string | null } | null;
  meet: { place: string; at: string } | null;
}

/** How long she waits at the meeting place (spec §2). */
export const MEET_WAIT = 60;
/** How long she's away with no time named and no meeting (spec §2). */
export const GOING_DEFAULT = 120;

export const planKey = (player: string) => `plan.${player}`;
/**
 * What you did about her plan (final review I1): its own record, `{from, met?, missed?, joined?}`, each mark the
 * story minute it was made, written when you walk in. A mark counts only for the plan it names and once the clock
 * has reached it, so a rewind past walking in undoes it without the write log having to know which row it belongs to.
 */
export type SeenMark = 'met' | 'missed' | 'joined';

/** `raw` (the stored seen record) with `mark` made at `clock`, for the plan `from`; another plan's marks are dropped. */
export function markSeen(raw: string | null, from: string, mark: SeenMark, clock: number): string {
  let o: Record<string, unknown> = {};
  try {
    const v: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof v === 'object' && v !== null && (v as Record<string, unknown>).from === from) o = v as Record<string, unknown>;
  } catch {
    /* a broken record is none */
  }
  return JSON.stringify({ ...o, from, [mark]: clock });
}
export const planSeenKey = (player: string) => `plan.${player}.seen`;

/** `plan` with its seen record folded in, when that record is this plan's and the clock has reached it. */
export function withSeen(plan: Plan, raw: string | null, clock: number): Plan {
  let v: unknown;
  try {
    v = raw === null ? null : JSON.parse(raw);
  } catch {
    return plan;
  }
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  if (o.from !== plan.from) return plan;
  const made = (k: SeenMark) => typeof o[k] === 'number' && (o[k] as number) <= clock;
  return { ...plan, ...(made('met') ? { met: true as const } : {}), ...(made('missed') ? { missed: true as const } : {}), ...(made('joined') ? { joined: true as const } : {}) };
}

/** `hhmm`'s next time on the clock from `clock`; the reply's own minute is now. */
function when(clock: number, hhmm: string): number {
  const at = parseHhmm(hhmm)!;
  return minuteOfDay(clock) === at ? clock : nextOccurrence(clock, at);
}

/** The answer as a plan on the clock (spec §2 defaults); null with neither leg. */
export function resolvePlan(a: PlanAnswer, clock: number, from: string): Plan | null {
  const meet = a.meet ? { place: a.meet.place, at: when(clock, a.meet.at) } : null;
  let going: Plan['going'] = null;
  if (a.going) {
    const named = a.going.until !== null ? when(clock, a.going.until) : null;
    const until = meet ? Math.min(named ?? meet.at, meet.at) : (named ?? clock + GOING_DEFAULT);
    going = { place: a.going.place, until };
  }
  if (!going && !meet) return null;
  return { going, meet, from };
}

/** Where the plan has her at `clock`; null between its legs and after it. */
export function planPlaceAt(p: Plan, clock: number): string | null {
  if (p.going && clock < p.going.until) return p.going.place;
  if (p.meet && clock >= p.meet.at && clock < p.meet.at + MEET_WAIT) return p.meet.place;
  return null;
}

/** Past the meeting window, or (with no meeting) past the going leg. */
export function planOver(p: Plan, clock: number): boolean {
  if (p.meet) return clock >= p.meet.at + MEET_WAIT;
  return p.going === null || clock >= p.going.until;
}

/** Where she'll be next, for her row after her place (spec §7, `home · Hae's 21:00`): the meeting; null without one or when over. */
export function planTail(p: Plan, clock: number, name: (sceneId: string) => string): string | null {
  if (planOver(p, clock) || !p.meet) return null;
  return `${name(p.meet.place)} ${hhmmOf(minuteOfDay(p.meet.at))}`;
}

const isLeg = (v: unknown, time: 'until' | 'at'): boolean =>
  typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).place === 'string' && typeof (v as Record<string, unknown>)[time] === 'number';

/** A stored plan; null when missing, unreadable, or with neither leg. */
export function parsePlan(raw: string | null): Plan | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const going = o.going === null || o.going === undefined ? null : isLeg(o.going, 'until') ? (o.going as Plan['going']) : undefined;
  const meet = o.meet === null || o.meet === undefined ? null : isLeg(o.meet, 'at') ? (o.meet as Plan['meet']) : undefined;
  if (going === undefined || meet === undefined || (!going && !meet) || typeof o.from !== 'string') return null;
  return { going, meet, from: o.from, ...(o.met === true ? { met: true as const } : {}), ...(o.missed === true ? { missed: true as const } : {}) };
}
