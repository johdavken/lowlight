/**
 * The rendered city map's projection (spec 2026-10-25 §1): the city seen from the south, tilted down ELEV, orthographic.
 * Blender stretches the ground north–south by 1/sin(ELEV), so a ground point at map % (x, y) renders at exactly (x, y) %
 * of the picture; a height (map px, up) lifts it on screen by z·cos(ELEV). The generator, the render and the map's live
 * layer all go through here, so they never disagree.
 */
import type { Pt } from './map-schema';

/** The map's size at 1× in map px (the old picture's size). */
export const MAP_W = 4608;
export const MAP_H = 3072;
/** How far the camera looks down. */
export const ELEV_DEG = 52;
const ELEV = (ELEV_DEG * Math.PI) / 180;

/** A height in map px as screen % of the map's height. */
export function liftPct(z: number): number {
  return ((z * Math.cos(ELEV)) / MAP_H) * 100;
}

/** Map %, at a height in map px, to screen % of the rendered map. */
export function toScreen(p: Pt, z = 0): Pt {
  return [p[0], p[1] - liftPct(z)];
}

/** A pin's height on a structure: its level's walkway, or above the stack's roof. */
export function pinHeight(level: number | 'roof', levelHeight: number, stackHeight: number): number {
  return level === 'roof' ? stackHeight + 9 : (level - 1) * levelHeight + 1.2;
}

/** Blender's north–south stretch of the ground. */
export function groundStretch(): number {
  return 1 / Math.sin(ELEV);
}
