/** Peak RGB-split offset during a glitch, in art pixels (scaled with the view). */
export const GLITCH_SPLIT = 6;

/**
 * The red/blue offset in screen pixels. At rest it's a fixed 1 px hairline on every screen (a
 * share of an art pixel grew with the upscale and read as blur at 4K: 4 px fringes at 8x). A
 * glitch (`amount` 0..1) ramps it toward GLITCH_SPLIT art pixels.
 */
export function splitPx(amount: number, scale: number): number {
  const a = Math.max(0, Math.min(1, amount));
  return Math.max(1, Math.round(1 + (GLITCH_SPLIT * scale - 1) * a));
}
