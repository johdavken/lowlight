import type { Crop } from '../../../shared/types';

/** The thinnest band of a sprite the stage will show (stops a bad crop from zooming into a few pixels). */
const MIN_BAND = 0.1;

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
