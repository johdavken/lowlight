/**
 * Greetings: when she speaks first on entering the room, and how she's told what kind of arrival
 * it is. A greeting is due on a first meeting, after a long gap, or once a scene has been ended.
 */
import type { ChatMessage } from '../../shared/types';
import { PREVIOUSLY_GAP_MS } from './journal';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** `latest` is the pair's newest message (undefined: they've never talked). */
export function greetDue(latest: ChatMessage | undefined, now: number): boolean {
  // A new game's opening scene is written before she has said anything: she still opens it.
  if (!latest || latest.mode === 'scene') return true;
  return endsScene(latest) || now - latest.ts >= PREVIOUSLY_GAP_MS;
}

/** Her reply to END SCENE, or the END SCENE line itself — unless it never reached her. */
function endsScene(m: ChatMessage): boolean {
  return m.mode === 'end' && !(m.role === 'user' && m.status === 'failed');
}

function unit(n: number, name: string): string {
  return `${n} ${name}${n === 1 ? '' : 's'}`;
}

/** A time away, rounded down to its largest readable unit. */
function duration(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))} min`;
  if (ms < 2 * DAY) return unit(Math.floor(ms / HOUR), 'hour');
  if (ms < 2 * WEEK) return unit(Math.floor(ms / DAY), 'day');
  return unit(Math.floor(ms / WEEK), 'week');
}

/**
 * The `[arrival: …]` line for a greeting turn; `previous` is the newest message before it. With a story clock
 * (`o.clock`, minutes) and a clocked previous line, the gap is story time (a WAIT moves it while no time passes
 * at the desk); otherwise wall time.
 */
export function arrivalLine(previous: ChatMessage | undefined, now: number, o: { known?: boolean; clock?: number | null } = {}): string {
  // `known`: a first meeting this story with someone she knows from before (a tie).
  if (!previous) return o.known ? '[arrival: first time this story, but you know them]' : '[arrival: first meeting]';
  const story = o.clock !== undefined && o.clock !== null && previous.clock !== undefined;
  const away = duration(story ? (o.clock! - previous.clock!) * MINUTE : now - previous.ts);
  return endsScene(previous) ? `[arrival: back ${away} after the scene ended]` : `[arrival: back after ${away}]`;
}
