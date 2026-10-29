// Blackouts (spec 2026-10-27): a dark tile split by its district mask. The mask's red is the district index × 8
// (0: water, the gaps — never dark). Works on raw RGBA buffers, so it is tested without a canvas.

/** The district index a mask pixel's red names (±1 from rounding is fine). */
export const maskIndex = (r: number): number => Math.round(r / 8);

/** The distinct district indices in a mask, sorted (0 left out). */
export function districtsIn(mask: Uint8ClampedArray): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < mask.length; i += 4) {
    const k = maskIndex(mask[i]!);
    if (k) seen.add(k);
  }
  return [...seen].sort((a, b) => a - b);
}

/** The dark tile's pixels where the mask names `index`; everything else transparent. */
export function splitDark(dark: Uint8ClampedArray, mask: Uint8ClampedArray, index: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dark.length);
  if (!index) return out;
  for (let i = 0; i < dark.length; i += 4) {
    if (maskIndex(mask[i]!) !== index) continue;
    out[i] = dark[i]!;
    out[i + 1] = dark[i + 1]!;
    out[i + 2] = dark[i + 2]!;
    out[i + 3] = dark[i + 3]!;
  }
  return out;
}
