// Which tiles a render needs, and each tile's fingerprint (spec 2026-10-25 §3): a hash of everything that can show in it,
// including its margin and the reach of light pools, so only the tiles a change touches render again.
import { createHash, type Hash } from 'node:crypto';
import { MAP_H, MAP_W, groundStretch, liftPct } from '../../shared/map-projection';
import { tileGrid, TILE } from '../../shared/map-tiles';
import type { RenderSettings } from '../../shared/city-schema';
import type { Anchor } from '../../shared/map-schema';
import type { Geometry } from './geometry';

/** Levels up to this scale render everywhere; deeper ones only over deep-zoom districts. */
const EVERYWHERE_UP_TO = 4;
/** How far up a district's tallest things reach on screen (map %), so deep tiles cover them. */
const DEEP_LIFT = liftPct(140);

export interface Needed {
  scale: number;
  keys: string[];
}

/** Even-odd point in polygon (map %). */
function inPoly(x: number, y: number, poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Whether a rect (map %) meets a polygon: any sample of the rect inside it, or any of its corners inside the rect. */
function rectMeets(x0: number, y0: number, x1: number, y1: number, poly: [number, number][]): boolean {
  for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4; v++) if (inPoly(x0 + ((x1 - x0) * u) / 4, y0 + ((y1 - y0) * v) / 4, poly)) return true;
  return poly.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
}

/** `areas`: deep-zoom corridors (map %), e.g. around the Spine; deep tiles meet the shape itself, not its bounds. */
export function tilesNeeded(render: RenderSettings, deep: Anchor[][], areas: [number, number][][] = []): Needed[] {
  return render.levels.map((scale) => {
    const { cols, rows } = tileGrid(scale);
    const keys: string[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (scale > EVERYWHERE_UP_TO) {
          const x0 = ((c * TILE) / (MAP_W * scale)) * 100, x1 = (((c + 1) * TILE) / (MAP_W * scale)) * 100;
          const y0 = ((r * TILE) / (MAP_H * scale)) * 100, y1 = (((r + 1) * TILE) / (MAP_H * scale)) * 100;
          const touches = deep.some((b) => {
            const bx0 = Math.min(...b.map((a) => a.x)), bx1 = Math.max(...b.map((a) => a.x));
            const by0 = Math.min(...b.map((a) => a.y)) - DEEP_LIFT, by1 = Math.max(...b.map((a) => a.y));
            return x0 < bx1 && x1 > bx0 && y0 < by1 && y1 > by0;
          });
          // A raised deck's tall things reach up into the tiles above the corridor: test the tile grown downward.
          if (!touches && !areas.some((a) => rectMeets(x0, y0, x1, y1 + DEEP_LIFT, a))) continue;
        }
        keys.push(`${c}_${r}`);
      }
    return { scale, keys };
  });
}

/** Map % bounds an item can show in: its footprint, lifted by its height. */
interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const pct = (x0: number, x1: number, y0: number, y1: number, zLo: number, zHi: number): Bounds => ({
  x0: (x0 / MAP_W) * 100,
  x1: (x1 / MAP_W) * 100,
  y0: (y0 / MAP_H) * 100 - liftPct(zHi),
  y1: (y1 / MAP_H) * 100 - liftPct(zLo),
});

/** The moon's shadow on the ground per unit of height, in map px (from map/city/render.json's moon rotation). */
function shadowPerHeight(render: RenderSettings): [number, number] {
  const [rx, , rz] = render.moon.rotation.map((a) => (a * Math.PI) / 180) as [number, number, number];
  // The sun points down its local -Z, turned by X then Z (Blender's XYZ Euler).
  const dX = -Math.sin(rx) * Math.sin(rz), dY = Math.sin(rx) * Math.cos(rz), dZ = -Math.cos(rx);
  const k = 1 / Math.max(0.05, -dZ);
  return [dX * k, (-dY * k) / groundStretch()];
}

/** Where something can change pixels: its footprint lifted by its height, its moon shadow, and its reflection below it on wet ground. */
export function itemBounds(
  b: { x: number; y: number; w: number; d: number; h: number; z0: number; ends?: [[number, number, number], [number, number, number]] },
  render: RenderSettings,
): Bounds {
  let r = Math.hypot(b.w, b.d) / 2;
  if (b.ends) r = Math.max(r, Math.hypot(b.ends[1][0] - b.ends[0][0], b.ends[1][1] - b.ends[0][1]) / 2);
  const zHi = b.ends ? Math.max(b.ends[0][2], b.ends[1][2]) + b.h : b.z0 + b.h;
  return grow(pct(b.x - r, b.x + r, b.y - r, b.y + r, Math.min(b.z0, zHi), zHi), zHi, render);
}

function grow(bd: Bounds, zHi: number, render: RenderSettings): Bounds {
  const [sx, sy] = shadowPerHeight(render);
  const dx = ((sx * zHi) / MAP_W) * 100, dy = ((sy * zHi) / MAP_H) * 100;
  return {
    x0: bd.x0 + Math.min(0, dx),
    x1: bd.x1 + Math.max(0, dx),
    y0: bd.y0 + Math.min(0, dy),
    y1: bd.y1 + Math.max(0, dy) + liftPct(zHi),
  };
}

function* items(g: Geometry, render: RenderSettings): Generator<[Bounds, string]> {
  for (const list of [g.buildings, g.props, g.strips] as { x: number; y: number; w: number; d: number; h: number; z0: number; ends?: [[number, number, number], [number, number, number]] }[][]) {
    for (const b of list) yield [itemBounds(b, render), JSON.stringify(b)];
  }
  for (const c of g.curves) {
    const xs = c.points.map((p) => p[0]), ys = c.points.map((p) => p[1]), zs = c.points.map((p) => p[2]);
    const zHi = Math.max(...zs) + 1;
    yield [grow(pct(Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1, Math.min(...zs), zHi), zHi, render), JSON.stringify(c)];
  }
  for (const l of g.lights) yield [pct(l.x - l.reach, l.x + l.reach, l.y - l.reach, l.y + l.reach, 0, l.z + l.reach), JSON.stringify(l)];
  if (g.landFill) {
    const st = g.landFill.step;
    // In bands of 32 rows, so a change in one place re-renders only nearby tiles.
    const bands = new Map<number, string[]>();
    for (const [row, c0, c1] of g.landFill.runs) {
      const k = Math.floor(row / 32);
      (bands.get(k) ?? bands.set(k, []).get(k)!).push(`${row}:${c0}:${c1}`);
    }
    for (const [k, runs] of bands) yield [pct(0, 4608, k * 32 * st, (k + 1) * 32 * st, 0, 1), `fill:${runs.join(',')}`];
  }
  // Land changes the shore on every tile it touches.
  // Its district too: the mask paints the land in its district's index.
  for (const [i, poly] of (g.land ?? []).entries()) {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    yield [pct(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), 0, 1), `land:${JSON.stringify(poly)}:${g.landDistricts?.[i] ?? ''}`];
  }
  // The mask's floor (water and gaps near a district), in bands of 32 rows like the land fill.
  if (g.maskFloor) {
    const st = g.maskFloor.step;
    const bands = new Map<number, string[]>();
    for (const [row, c0, c1, idx] of g.maskFloor.runs) {
      const k = Math.floor(row / 32);
      (bands.get(k) ?? bands.set(k, []).get(k)!).push(`${row}:${c0}:${c1}:${idx}`);
    }
    for (const [k, runs] of bands) yield [pct(0, 4608, k * 32 * st, (k + 1) * 32 * st, 0, 1), `mask:${runs.join(',')}`];
  }
  for (const v of g.volumes) {
    const xs = v.outline.map((p) => p[0]), ys = v.outline.map((p) => p[1]);
    yield [pct(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), v.z0, v.z1), JSON.stringify(v)];
  }
  // The terrain (and any isles) in blocks of 16×16 cells, each with its own heights.
  for (const t of [g.terrain, ...(g.islands ?? [])]) {
    if (!t) continue;
    const B = 16;
    for (let j0 = 0; j0 < t.rows; j0 += B)
      for (let i0 = 0; i0 < t.cols; i0 += B) {
        const hs: number[] = [];
        for (let j = j0; j < Math.min(t.rows, j0 + B + 1); j++) for (let i = i0; i < Math.min(t.cols, i0 + B + 1); i++) hs.push(t.heights[j * t.cols + i]!);
        if (hs.every((h) => h < 0)) continue;
        const x0 = t.x0 + i0 * t.step, y0 = t.y0 + j0 * t.step;
        const zHi = Math.max(0, ...hs);
        yield [grow(pct(x0, x0 + B * t.step, y0, y0 + B * t.step, 0, zHi), zHi, render), `terrain:${'id' in t ? t.id : ''}:${i0}:${j0}:${hs.join(',')}`];
      }
  }
}

/**
 * The geometry's keys the fingerprints hash, and those the renderer never draws. A new key fails a test until it's in
 * one list (blackouts phase 2 §5): fingerprints follow what the generator made, not the generator's version.
 */
export const HASHED_KEYS: readonly (keyof Geometry)[] = ['buildings', 'props', 'lights', 'strips', 'curves', 'terrain', 'islands', 'volumes', 'land', 'landDistricts', 'districts', 'maskFloor', 'landFill'];
export const NOT_RENDERED_KEYS: readonly (keyof Geometry)[] = ['pinHeights'];

/** `<scale>/<col>_<row>` → fingerprint, for every needed tile. `salt` carries the render script and Blender versions. */
export function fingerprints(g: Geometry, render: RenderSettings, needed: Needed[], salt: string): Map<string, string> {
  const hashes = new Map<string, Hash>();
  const wanted = new Map(needed.map((n) => [n.scale, new Set(n.keys)]));
  // The district table sets every item's mask index, so it is in every tile's hash.
  const head = JSON.stringify(render) + salt + JSON.stringify(g.districts);
  for (const n of needed) for (const k of n.keys) hashes.set(`${n.scale}/${k}`, createHash('sha256').update(head));
  for (const [b, text] of items(g, render)) {
    for (const n of needed) {
      const s = n.scale, keys = wanted.get(s)!;
      const mx = (render.margin / (MAP_W * s)) * 100, my = (render.margin / (MAP_H * s)) * 100;
      const { cols, rows } = tileGrid(s);
      const c0 = Math.max(0, Math.floor((((b.x0 - mx) / 100) * MAP_W * s) / TILE)), c1 = Math.min(cols - 1, Math.floor((((b.x1 + mx) / 100) * MAP_W * s) / TILE));
      const r0 = Math.max(0, Math.floor((((b.y0 - my) / 100) * MAP_H * s) / TILE)), r1 = Math.min(rows - 1, Math.floor((((b.y1 + my) / 100) * MAP_H * s) / TILE));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const key = `${c}_${r}`;
          if (keys.has(key)) hashes.get(`${s}/${key}`)!.update(text).update('\n');
        }
    }
  }
  return new Map([...hashes].map(([k, h]) => [k, h.digest('hex').slice(0, 24)]));
}
