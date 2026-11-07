import type { Crop } from '../../../shared/types';

/** The thinnest band of a sprite the stage will show (stops a bad crop from zooming into a few pixels). */
const MIN_BAND = 0.1;

/**
 * Where everyone's waist lands on the room stage, as a share of the figure's height from its top: the
 * average of those who can stand there (a place's residents can't). The art draws every head at the same height, so proportions differ below it; lining
 * up waists instead keeps legs alike and reads as people of different heights, at the same size.
 */
export const WAIST_LINE = 0.383;
/** How far figures move toward the line: 1 all the way, 0 heads level as drawn. */
export const WAIST_PULL = 1;

/**
 * How far a figure stands below where it's drawn, as a share of its height (negative: above), so that
 * its waist meets the line. No waist: it stays where it is. One waist per character, so a change of
 * outfit never moves her; and a fixed line, so nobody moves when the other figure changes.
 */
export function figureDrop(waist: number | null | undefined, pull = WAIST_PULL): number {
  return waist === null || waist === undefined ? 0 : (WAIST_LINE - waist) * pull;
}

/**
 * Sizes a figure that shows the `crop` band of a sprite at `height`: the whole image is scaled so
 * the band fills the height, then shifted up by the part above the band. `aspect` is the sprite's
 * width / height (2:3 masters).
 */
export function figureBox(crop: Crop, height: number, aspect = 2 / 3): { width: number; bgWidth: number; bgHeight: number; bgY: number } {
  let top = Math.min(Math.max(crop.top, 0), 1);
  let bottom = Math.min(Math.max(crop.bottom, 0), 1);
  if (bottom - top < MIN_BAND) {
    bottom = Math.min(1, top + MIN_BAND);
    top = bottom - MIN_BAND;
  }
  const k = height / (bottom - top);
  return { width: k * aspect, bgWidth: k * aspect, bgHeight: k, bgY: -top * k };
}
