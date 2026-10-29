/** Deterministic hash of an integer lattice point + seed to [0, 1). */
function hash(i: number, seed: number): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothly interpolated 1-D value noise in [0, 1). */
function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(i, seed);
  const b = hash(i + 1, seed);
  return a + (b - a) * s;
}

/**
 * Brightness multiplier for a flickering light: in [1 - flicker, 1], exactly 1 when flicker = 0.
 * A slow wobble plus fast, mostly-quiet dips (squared noise keeps the light near full most of the time).
 */
export function flickerFactor(tSec: number, flicker: number, seed: number): number {
  if (flicker <= 0) return 1;
  const k = Math.min(1, flicker);
  const slow = valueNoise(tSec * 2, seed);
  const fast = valueNoise(tSec * 14, seed + 7919);
  const dip = 0.35 * slow + 0.65 * fast * fast;
  return 1 - k * Math.max(0, Math.min(1, dip));
}
