/**
 * The map's camera: a district's frame (in map %) and the view that fits it into the space the band and strip leave, and the
 * player's own scroll-zoom, drag and pinch. The map covers the screen at 1×; its edge can come as far as the screen's
 * middle, over the empty grid (spec 2026-10-28 §2).
 */
import { placesIn, type CityMapData } from '../../../../shared/map-schema';

/** A box on the map, in map % (0–100 each way). */
export interface Frame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** Applied as `translate(tx, ty) scale(scale)` with origin 0 0; px. */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}
/** A point on the screen, px. */
export interface Point {
  x: number;
  y: number;
}

export const CITY_VIEW: View = { scale: 1, tx: 0, ty: 0 };

/** Room around the outer pins, in map %. */
const PAD = 3;
/** The smallest frame (a one-place district), in map %. */
const MIN = 14;

/** The district's pins with room around them; null when it has no places. */
export function districtFrame(map: CityMapData, districtId: string): Frame | null {
  const pins = placesIn(map, districtId).map((p) => p.pin);
  if (!pins.length) return null;
  const xs = pins.map((p) => p[0]);
  const ys = pins.map((p) => p[1]);
  const grow = (lo: number, hi: number): [number, number] => {
    const [a, b] = [lo - PAD, hi + PAD];
    const short = MIN - (b - a);
    return short > 0 ? [a - short / 2, b + short / 2] : [a, b];
  };
  const [x0, x1] = grow(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = grow(Math.min(...ys), Math.max(...ys));
  return { x0, y0, x1, y1 };
}

/** A size in px: the screen's, or the map's (the picture at the city view, covering the screen). */
export interface Size {
  w: number;
  h: number;
}

/** The map at the city view: the picture scaled to cover the screen, its `aspect` (w / h) kept. */
export function coverSize(screen: Size, aspect: number): Size {
  if (!screen.w || !screen.h) return { ...screen };
  return screen.w / screen.h > aspect ? { w: screen.w, h: screen.w / aspect } : { w: screen.h * aspect, h: screen.h };
}

/** `v` moved so the city's edge comes no further than the screen's middle, each way: anything on it can be centred. */
export function clampView(v: View, map: Size, screen: Size): View {
  const fit = (t: number, m: number, s: number) => Math.min(s / 2, Math.max(s / 2 - m * v.scale, t));
  return { scale: v.scale, tx: fit(v.tx, map.w, screen.w), ty: fit(v.ty, map.h, screen.h) };
}

/** The whole city: 1×, centred. */
export function cityView(map: Size, screen: Size): View {
  return clampView({ scale: 1, tx: (screen.w - map.w) / 2, ty: (screen.h - map.h) / 2 }, map, screen);
}

/** `v` zoomed by `factor` about the screen point `at` (which stays put), 1×–`maxScale`. */
export function zoomAt(v: View, factor: number, at: { x: number; y: number }, map: Size, screen: Size, maxScale: number): View {
  const scale = Math.min(maxScale, Math.max(1, v.scale * factor));
  const k = scale / v.scale;
  return clampView({ scale, tx: at.x - (at.x - v.tx) * k, ty: at.y - (at.y - v.ty) * k }, map, screen);
}

/**
 * Two fingers from `from` (their midpoint and distance when the pinch began, at `start`) to `now`: the scale follows
 * the distance, 1×–`maxScale`, and the map point that was under the first midpoint stays under the current one.
 */
export function pinchView(start: View, from: { mid: Point; dist: number }, now: { mid: Point; dist: number }, map: Size, screen: Size, maxScale: number): View {
  const scale = Math.min(maxScale, Math.max(1, (start.scale * now.dist) / (from.dist || 1)));
  const mx = (from.mid.x - start.tx) / start.scale;
  const my = (from.mid.y - start.ty) / start.scale;
  return clampView({ scale, tx: now.mid.x - mx * scale, ty: now.mid.y - my * scale }, map, screen);
}
