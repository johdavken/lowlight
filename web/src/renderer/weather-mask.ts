/**
 * The weather area as a Pixi mask: every shape filled into one Graphics, in frame px. The rain is
 * clipped to it, so a streak crossing a window post is cut at the post.
 */
import type { Container, Graphics } from 'pixi.js';
import type { Shape } from '../../../shared/weather-area';

/** Clears `g` and fills each shape (white; a mask only reads coverage). Returns `g`. */
export function drawArea(g: Graphics, area: Shape[]): Graphics {
  g.clear();
  for (const shape of area) g.poly(shape.flat()).fill(0xffffff);
  return g;
}

/** Whether a room's weather is masked: only when it has an area (none = rain over the whole frame). */
export function maskFor(area: Shape[] | undefined): area is Shape[] {
  return area !== undefined && area.length > 0;
}

/** Whether `c` is clipped by a mask (Pixi v8 reports no mask as `undefined`, not `null`). */
export function isMasked(c: Container): boolean {
  return Boolean(c.mask);
}
