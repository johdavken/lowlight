/**
 * The face change as a pixel dissolve: the new face comes in through an ordered (Bayer) dither,
 * a few levels at a time, while the old one goes out through the inverse, so every pixel is fully
 * one face or the other (no see-through double mouth halfway).
 */

/** 4×4 Bayer thresholds, 0..15: a cell shows the new face once the level passes its number. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** How many visible steps the dissolve takes, and how long each holds (ms). */
export const DISSOLVE_STEPS = 8;
export const DISSOLVE_STEP_MS = 35;

/** Art pixels per dither cell's side, in the sprite's own pixels (Studio SNAP draws 2px art pixels). */
export const DITHER_CELL_PX = 2;

const cache = new Map<string, string>();

/**
 * The CSS mask for step `step` of DISSOLVE_STEPS (1..steps): `incoming` opens the cells whose
 * threshold is below the level, the outgoing mask is its exact inverse. A 4×4 tile, crisp.
 */
export function ditherMask(step: number, incoming: boolean, steps = DISSOLVE_STEPS): string {
  const key = `${step}/${steps}/${incoming ? 'in' : 'out'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const level = (step / steps) * 16;
  let rects = '';
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (BAYER4[y][x] < level === incoming) rects += `<rect x='${x}' y='${y}' width='1' height='1'/>`;
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'>${rects}</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  cache.set(key, url);
  return url;
}

/** The mask tile's size as percentages of the art box, so a dither cell is DITHER_CELL_PX of her own pixels. */
export function ditherTile(width: number, height: number): string {
  const side = 4 * DITHER_CELL_PX;
  return `${(100 * side) / width}% ${(100 * side) / height}%`;
}
