/**
 * The stage figures breathe (breath on the figures, 2026-11-17): her chest swells in the light, slowly while
 * listening, quicker while speaking, and nothing of her moves (a stretch from the waist up doubled a row,
 * and a whole-figure 1 px rise looked off in play too); on each out-breath, in an open-air room, a puff of
 * breath fog leaves the mouth. Pure numbers here; figure-light.ts draws them.
 */

export const BREATH = {
  /** Seconds a breath takes. */
  listen: { period: 4.8 },
  speak: { period: 3.4 },
  /** Share of each breath spent breathing out (the puff's time). */
  exhale: 0.45,
} as const;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Where a breath is at `t` seconds, for a figure `phase` (0..1) into its cycle: her breath `level` 0..1
 * (up through the in-breath, back down through the out-breath), and the out-breath's progress `puff`
 * 0..1 (−1 while breathing in).
 */
export function breathAt(t: number, phase: number, speaking: boolean): { puff: number; level: number } {
  const { period } = speaking ? BREATH.speak : BREATH.listen;
  const c = (((t / period + phase) % 1) + 1) % 1;
  const inShare = 1 - BREATH.exhale;
  if (c < inShare) {
    const level = smooth(c / inShare);
    return { puff: -1, level };
  }
  const out = (c - inShare) / BREATH.exhale;
  const level = 1 - smooth(out);
  return { puff: out, level };
}

/** Her mouth, as shares of her sprite: a little below her face point (the select tile's), or under the masters' head. */
export function mouthAt(face: { x: number; y: number } | null): { x: number; y: number } {
  return face ? { x: face.x, y: face.y + 0.035 } : { x: 0.5, y: 0.115 };
}
