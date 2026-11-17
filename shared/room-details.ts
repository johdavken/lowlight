/**
 * A room's details (scene.json `details`): small things that happen or can be noticed there. The room line names
 * only the lights, so these are her room's texture; one comes every `DETAIL_EVERY` plain turns, in an order that
 * doesn't repeat one until the whole list has gone round. She saw the same six light labels every turn and wrote
 * the same monitors, porthole and stair back into most replies (Rue's hab, 2026-11-12).
 */

/** At most this many details per room, each at most `ROOM_DETAIL_MAX` characters. */
export const ROOM_DETAILS_MAX = 16;
export const ROOM_DETAIL_MAX = 160;

/** A detail on every this-many turns; the turns between have none, so the room can stay in the background. Every other turn, GLM opened most replies on the room (2026-11-12). */
export const DETAIL_EVERY = 3;

/** FNV-1a, 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** `0…n-1` shuffled by `seed` (a small LCG over the hash), the same order for the same seed. */
function order(n: number, seed: string): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let s = hash(seed) || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The detail for turn `turn` (0, 1, 2… counted per pair and room), or null on the turns between. Each round of the
 * list is shuffled by `seed` and the round number; a round never starts with the detail the last one ended on.
 */
export function roomDetail(details: readonly string[], seed: string, turn: number, every: number = DETAIL_EVERY): string | null {
  if (details.length === 0 || turn < 0 || turn % every !== 0) return null;
  const k = Math.floor(turn / every);
  const n = details.length;
  const round = Math.floor(k / n);
  const roundOrder = (r: number): number[] => {
    const o = order(n, `${seed}:${r}`);
    if (r > 0 && n > 1) {
      const prev = order(n, `${seed}:${r - 1}`);
      if (o[0] === prev[n - 1]) [o[0], o[1]] = [o[1]!, o[0]!];
    }
    return o;
  };
  return details[roundOrder(round)[k % n]!]!;
}

/** The line she's given: something that happens partway through this moment, hers to use or leave. */
export function roomDetailLine(detail: string): string {
  const d = detail.trim();
  return `[in the room, partway through this moment: ${/[.!?…]$/.test(d) ? d : `${d}.`} If you use it, let it land in the middle of your reply, under what's said, not as its first line. Or leave it.]`;
}
