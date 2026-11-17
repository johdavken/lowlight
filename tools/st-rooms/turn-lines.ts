// Per-turn lines for her prompt that SillyTavern needs worked out from its own chat (extension/room-tools.js).
import { awayFor } from '../../server/src/greet';
import { PREVIOUSLY_GAP_MS } from '../../server/src/journal';

/**
 * `[arrival: Hicks back after 6 hours]` when your newest message came at least PREVIOUSLY_GAP_MS after the line before
 * it (the gap after which the game greets you as back), worded as the game's arrival line; null for a shorter gap or a
 * time that doesn't read.
 */
export function arrivalGap(you: string, prevMs: number, nowMs: number): string | null {
  if (!Number.isFinite(prevMs) || !Number.isFinite(nowMs)) return null;
  const gap = nowMs - prevMs;
  if (gap < PREVIOUSLY_GAP_MS) return null;
  return `[arrival: ${you} back after ${awayFor(gap)}]`;
}
