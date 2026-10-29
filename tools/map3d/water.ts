// Land and water (Strand pass). Land is every district plus the narrow gaps between them (a grid of the
// districts, grown and shrunk back by GAP_CLOSE, so streets between districts stay land); water is the open area joined to
// the bay (flooded from its own point, WATER_SEED), so map edges and enclosed gaps stay land.
// A district's coast is the part of its border with open water outside.
import { insideBorder, type CityMapData } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { noise2 } from './terrain';

type P = [number, number];
const px = (x: number, y: number): P => [(x / 100) * MAP_W, (y / 100) * MAP_H];
/** The land grid's cell (map px) and how far it closes gaps (cells): gaps up to about 2 × 6 × 8 = 96 px are land. */
const CELL = 8;
const GAP_CLOSE = 6;

/** Every district's border as a land polygon (map px), but the flooded ones (`under`: the Marsh, gone under). */
export function landPolygons(map: CityMapData, under: string[] = []): P[][] {
  return landDistricts(map, under).map((d) => d.border!.map((a) => px(a.x, a.y)));
}

/** The districts `landPolygons` makes slabs of, in its order. */
export function landPolygonIds(map: CityMapData, under: string[] = []): string[] {
  return landDistricts(map, under).map((d) => d.id);
}

const landDistricts = (map: CityMapData, under: string[]) => map.districts.filter((d) => d.border && d.border.length >= 3 && !under.includes(d.id));

export interface LandGrid {
  step: number;
  cols: number;
  rows: number;
  /** 1: land (a district or a closed gap). */
  cells: Uint8Array;
}

/** Chamfer distance (in cells) from each cell to the nearest cell where `on` is false/true. */
function distanceTo(cells: Uint8Array, cols: number, rows: number, target: 0 | 1): Float32Array {
  const d = new Float32Array(cols * rows);
  const INF = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = cells[i] === target ? 0 : INF;
  const D1 = 1, D2 = Math.SQRT2;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (x > 0) d[i] = Math.min(d[i]!, d[i - 1]! + D1);
      if (y > 0) {
        d[i] = Math.min(d[i]!, d[i - cols]! + D1);
        if (x > 0) d[i] = Math.min(d[i]!, d[i - cols - 1]! + D2);
        if (x < cols - 1) d[i] = Math.min(d[i]!, d[i - cols + 1]! + D2);
      }
    }
  for (let y = rows - 1; y >= 0; y--)
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (x < cols - 1) d[i] = Math.min(d[i]!, d[i + 1]! + D1);
      if (y < rows - 1) {
        d[i] = Math.min(d[i]!, d[i + cols]! + D1);
        if (x < cols - 1) d[i] = Math.min(d[i]!, d[i + cols + 1]! + D2);
        if (x > 0) d[i] = Math.min(d[i]!, d[i + cols - 1]! + D2);
      }
    }
  return d;
}

/** Where the bay's water is flooded from, map % (open water mid-bay). Its own point, not the Bay's name: moving a
 * district's name in Studio never changes the city (district names spec 2026-10-28). */
export const WATER_SEED: [number, number] = [45.5, 60.5];

/** `extra`: more land as polygons (map px), e.g. the Spine's corridor (a district with no border). */
/** `skip`: districts left out entirely (isles that bring their own ground and natural shore). */
export function landGrid(map: CityMapData, extra: P[][] = [], under: string[] = [], skip: string[] = []): LandGrid {
  const cols = Math.ceil(MAP_W / CELL), rows = Math.ceil(MAP_H / CELL);
  // Flooded districts count as land while the gaps close (the ground between the Marsh and its neighbours stays ground,
  // as the painting has it), and are made water after.
  const borders = map.districts.filter((d) => d.border && d.border.length >= 3 && !skip.includes(d.id)).map((d) => d.border!);
  const raw = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const p: P = [(((x + 0.5) * CELL) / MAP_W) * 100, (((y + 0.5) * CELL) / MAP_H) * 100];
      raw[y * cols + x] = borders.some((b) => insideBorder(p, b)) || extra.some((poly) => inPoly(((x + 0.5) * CELL), ((y + 0.5) * CELL), poly)) ? 1 : 0;
    }
  // Close: grow the land by GAP_CLOSE, then shrink back. A flooded district stays water however narrow its gaps.
  const drowned = map.districts.filter((d) => d.border && under.includes(d.id)).map((d) => d.border!);
  const isDrowned = (x: number, y: number) => drowned.some((b) => insideBorder([(((x + 0.5) * CELL) / MAP_W) * 100, (((y + 0.5) * CELL) / MAP_H) * 100], b));
  const toLand = distanceTo(raw, cols, rows, 1);
  const grown = new Uint8Array(cols * rows);
  for (let i = 0; i < grown.length; i++) grown[i] = toLand[i]! <= GAP_CLOSE ? 1 : 0;
  const toWater = distanceTo(grown, cols, rows, 0);
  const closed = new Uint8Array(cols * rows);
  for (let i = 0; i < closed.length; i++) closed[i] = raw[i] || toWater[i]! > GAP_CLOSE ? 1 : 0;
  // Water is only the open area joined to the bay (flooded from WATER_SEED); anything else is land.
  const cells = new Uint8Array(cols * rows).fill(1);
  const bay = WATER_SEED;
  const start = Math.floor(((bay[1] / 100) * MAP_H) / CELL) * cols + Math.floor(((bay[0] / 100) * MAP_W) / CELL);
  const stack = closed[start] ? [] : [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (cells[i] === 0 || closed[i]) continue;
    cells[i] = 0;
    const x = i % cols, y = (i - x) / cols;
    if (x > 0) stack.push(i - 1);
    if (x < cols - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - cols);
    if (y < rows - 1) stack.push(i + cols);
  }
  if (drowned.length) for (let i = 0; i < cells.length; i++) if (isDrowned(i % cols, Math.floor(i / cols))) cells[i] = 0;
  return { step: CELL, cols, rows, cells };
}

function inPoly(x: number, y: number, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Whether a point (map px) is on land. */
export function onLand(g: LandGrid): (x: number, y: number) => boolean {
  return (x, y) => {
    const cx = Math.floor(x / g.step), cy = Math.floor(y / g.step);
    if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return false;
    return g.cells[cy * g.cols + cx] === 1;
  };
}

/** The filler land between districts as horizontal runs of cells [row, firstCol, lastCol] (what the borders don't cover),
 * kept a cell back from open water so its steps never show past the smooth district shores. */
export function gapRuns(map: CityMapData, g: LandGrid): [number, number, number][] {
  // Every district, flooded ones too: a flooded district's cells are water, never filler land.
  const borders = map.districts.filter((d) => d.border && d.border.length >= 3).map((d) => d.border!);
  const inDistrict = (x: number, y: number) => borders.some((b) => insideBorder([(((x + 0.5) * g.step) / MAP_W) * 100, (((y + 0.5) * g.step) / MAP_H) * 100], b));
  const water = distanceTo(g.cells, g.cols, g.rows, 0);
  const runs: [number, number, number][] = [];
  for (let y = 0; y < g.rows; y++) {
    let start = -1;
    for (let x = 0; x <= g.cols; x++) {
      const i = y * g.cols + x;
      const fill = x < g.cols && g.cells[i] === 1 && water[i]! > 1.5 && !inDistrict(x, y);
      if (fill && start < 0) start = x;
      if (!fill && start >= 0) {
        runs.push([y, start, x - 1]);
        start = -1;
      }
    }
  }
  return runs;
}

/** The edges of a district's border (map px) with open water outside them, as [a, b] pairs. */
export function coastEdges(map: CityMapData, g: LandGrid, districtId: string): [P, P][] {
  const d = map.districts.find((x) => x.id === districtId);
  if (!d?.border) return [];
  const land = onLand(g);
  const own = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], d.border!);
  const pts = d.border.map((a) => px(a.x, a.y));
  const out: [P, P][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const o1: P = [mx - (dy / L) * 14, my + (dx / L) * 14], o2: P = [mx + (dy / L) * 14, my - (dx / L) * 14];
    const outside = own(...o1) ? o2 : o1;
    if (!land(...outside)) out.push([a, b]);
  }
  return out;
}

/** A natural shore: the polygon resampled every `step` px; where a point's outside is open water it
 * moves out into the water by up to `amp` px (two octaves of noise: headlands and coves), never nearer than 10 px to other
 * land, so the coast stops being straight. Inland points (shared with other land) don't move: nothing is cut. */
export interface ShoreShift {
  x: number;
  y: number;
  nx: number;
  ny: number;
  o: number;
}
export function naturalShore(poly: P[], isWater: (x: number, y: number) => boolean, seed: string, amp: number, step = 6, shifts: ShoreShift[] = []): P[] {
  const a = noise2(`${seed}:a`), b = noise2(`${seed}:b`);
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    // Outward normal (the polygon winds one way or the other).
    const s = area > 0 ? 1 : -1;
    const nx = (dy / len) * s, ny = (-dx / len) * s;
    for (let t = 0; t < len; t += step) {
      const x = p[0] + (dx / len) * t, y = p[1] + (dy / len) * t;
      if (!isWater(x + nx * 4, y + ny * 4)) {
        out.push([x, y]);
        continue;
      }
      let o = amp * (0.5 + 0.5 * (a(x * 0.01, y * 0.01) * 0.86 + b(x * 0.03, y * 0.03) * 0.14));
      // Stop short of other land.
      for (let k = 2; k <= o + 10; k += 2) if (!isWater(x + nx * k, y + ny * k)) { o = Math.max(0, Math.min(o, k - 10)); break; }
      out.push([x + nx * Math.max(0, o), y + ny * Math.max(0, o)]);
      shifts.push({ x, y, nx, ny, o: Math.max(0, o) });
    }
  }
  return out;
}

/** Moves what stands along a coast (boardwalks, walls, piers, the wheel) out with the natural shore: each point shifts
 * along the shore's normal by the shore's offset at the nearest coast point within `reach` px. */
export function followShore(shifts: ShoreShift[], reach = 22): (x: number, y: number) => [number, number] {
  const CELL = 24, grid = new Map<string, ShoreShift[]>();
  for (const sh of shifts) {
    const k = `${Math.floor(sh.x / CELL)}:${Math.floor(sh.y / CELL)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(sh);
  }
  return (x, y) => {
    let best: ShoreShift | null = null, bd = reach;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let u = -1; u <= 1; u++)
      for (let v = -1; v <= 1; v++)
        for (const sh of grid.get(`${cx + u}:${cy + v}`) ?? []) {
          const d = Math.hypot(sh.x - x, sh.y - y);
          if (d < bd) [best, bd] = [sh, d];
        }
    if (!best) return [x, y];
    // Fade out with distance, so things inland stay put.
    const k = 1 - bd / reach;
    return [x + best.nx * best.o * k, y + best.ny * best.o * k];
  };
}
