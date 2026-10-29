// The climb to Mirage Heights (spec 2026-10-25 §3), ported from the test's render3.py: rough ground rising from the
// districts below into a sheer, craggy face under the plateau, with pines, scree, a lamp-lit stair, a funicular and shacks.
import { insideBorder, type Anchor, type CityMapData } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Terrain } from '../../shared/city-schema';
import type { Box, Light, Prop, Strip, TerrainGrid } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];
const toPx = (b: Anchor[]): P[] => b.map((a) => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
const inPoly = (x: number, y: number, b: Anchor[]) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], b);
/** The ground isn't the climb further than this from both the plateau and the districts below (map px). */
const REACH = 420;

function segDist(px: number, py: number, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
function polyDist(x: number, y: number, poly: P[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, y, poly[i]!, poly[(i + 1) % poly.length]!));
  return d;
}

/** Seeded 2D value noise in [-1, 1], smooth between lattice points. */
export function noise2(seed: string): (x: number, y: number) => number {
  const r = rng(seed);
  const table = Array.from({ length: 512 }, () => r() * 2 - 1);
  const perm = Array.from({ length: 256 }, (_, i) => i).sort(() => r() - 0.5);
  const h = (i: number, j: number) => table[(perm[i & 255]! + j * 57) & 511]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = fade(x - i), fy = fade(y - j);
    const a = h(i, j) + (h(i + 1, j) - h(i, j)) * fx;
    const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/** The ground's height (map px) anywhere: the plateau's height on it, -1 inside a district below or away from the climb. */
export function heightField(t: Terrain, map: CityMapData): (x: number, y: number) => number {
  const plateau = map.districts.find((d) => d.id === t.plateau)?.border;
  const lows = t.risesFrom.map((id) => map.districts.find((d) => d.id === id)?.border).filter((b): b is Anchor[] => !!b);
  if (!plateau) return () => -1;
  const others = map.districts.filter((d) => d.border && d.id !== t.plateau && !t.risesFrom.includes(d.id)).map((d) => d.border!);
  const plateauPx = toPx(plateau), lowsPx = lows.map(toPx);
  const n1 = noise2('terrain:face'), n2 = noise2('terrain:crags'), n3 = noise2('terrain:ground');
  return (x, y) => {
    if (inPoly(x, y, plateau)) return t.height;
    if (lows.some((b) => inPoly(x, y, b)) || others.some((b) => inPoly(x, y, b))) return -1;
    const dm = polyDist(x, y, plateauPx);
    const dv = Math.min(...lowsPx.map((p) => polyDist(x, y, p)));
    if (dm + dv > REACH) return -1;
    const k = dv / (dv + dm);
    const t0 = t.faceStart + t.faceJitter * n1(x * 0.008, y * 0.008);
    let f = Math.max(0, Math.min(1, (k - t0) / t.faceWidth));
    f = f * f * (3 - 2 * f);
    const h = t.height * (0.32 * k + 0.68 * f) + t.crags * Math.abs(n2(x * 0.015, y * 0.015)) * k + 3.5 * n3(x * 0.07, y * 0.07) * k;
    return Math.max(0, Math.min(t.height, h));
  };
}

export interface TerrainGeometry {
  grid: TerrainGrid;
  props: Prop[];
  lights: Light[];
  buildings: Box[];
  strips: Strip[];
}

/** The nearest point of a polygon's outline to (x, y). */
function nearestOn(poly: P[], x: number, y: number): P {
  let best: P = poly[0]!, bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const p: P = [a[0] + u * dx, a[1] + u * dy];
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bd) [best, bd] = [p, d];
  }
  return best;
}

export function terrainGeometry(t: Terrain, map: CityMapData): TerrainGeometry | null {
  const plateau = map.districts.find((d) => d.id === t.plateau)?.border;
  const lows = t.risesFrom.map((id) => map.districts.find((d) => d.id === id)?.border).filter((b): b is Anchor[] => !!b);
  if (!plateau || !lows.length) return null;
  const H = heightField(t, map);
  const all = [plateau, ...lows].flatMap(toPx);
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
  const y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
  const step = t.gridStep;
  const cols = Math.ceil((x1 - x0) / step) + 1, rows = Math.ceil((y1 - y0) / step) + 1;
  const heights: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) heights.push(Math.round(H(x0 + i * step, y0 + j * step) * 10) / 10);
  const at = (x: number, y: number) => {
    const i = Math.round((x - x0) / step), j = Math.round((y - y0) / step);
    return i >= 0 && j >= 0 && i < cols && j < rows ? heights[j * cols + i]! : -1;
  };
  const r = rng('terrain:props');
  const forest = noise2('terrain:forest');
  const out: TerrainGeometry = { grid: { x0, y0, step, cols, rows, heights }, props: [], lights: [], buildings: [], strips: [] };
  // Pines in clusters on the slope, scree at its foot.
  for (let k = 0; k < 9000; k++) {
    const x = between(r, x0, x1), y = between(r, y0, y1), z = at(x, y);
    const roll = r();
    if (z > 3 && z < t.height - 4 && forest(x * 0.02, y * 0.02) > t.forest && roll < 0.5) {
      const rad = between(r, 2.2, 3.8);
      out.props.push({ kind: 'pine', x, y, z0: z, w: rad * 2, d: rad * 2, h: rad * between(r, 2.6, 3.4), a: 0 });
    } else if (z >= 0 && z <= 3 && roll < 0.25) out.props.push({ kind: 'scree', x, y, z0: 0, w: between(r, 0.8, 3), d: between(r, 0.8, 2.4), h: between(r, 0.4, 2), a: between(r, 0, 3) });
  }
  const plateauPx = toPx(plateau);
  const centre: P = [plateauPx.reduce((s, p) => s + p[0], 0) / plateauPx.length, plateauPx.reduce((s, p) => s + p[1], 0) / plateauPx.length];
  // A zig-zag stair from the last district below up to the plateau, a lamp at each turn.
  if (t.stair) {
    const low = toPx(lows.at(-1)!);
    const base = nearestOn(low, centre[0], centre[1]);
    const top = nearestOn(plateauPx, base[0], base[1]);
    const flights = 10;
    for (let k = 0; k < flights; k++) {
      const u0 = k / flights, u1 = (k + 1) / flights, sx = k % 2 ? 6 : -6;
      const ax = base[0] + (top[0] - base[0]) * u0 + sx, ay = base[1] + (top[1] - base[1]) * u0;
      const bx = base[0] + (top[0] - base[0]) * u1 - sx, by = base[1] + (top[1] - base[1]) * u1;
      const az = Math.max(0, at(ax, ay)) + 0.6, bz = Math.max(0, at(bx, by)) + 0.6;
      out.strips.push({ x: (ax + bx) / 2, y: (ay + by) / 2, w: Math.hypot(bx - ax, by - ay), d: 1.2, h: 0.4, z0: az, a: Math.atan2(by - ay, bx - ax), material: 'stair', ends: [[ax, ay, az], [bx, by, bz]] });
      out.props.push({ kind: 'lamp', x: bx, y: by, z0: bz + 0.4, w: 0.6, d: 0.6, h: 0.7, a: 0, color: '#ffcf7a' });
      out.lights.push({ x: bx, y: by, z: bz + 2.5, color: '#ffb347', power: 30000, radius: 2, reach: 60 });
    }
  }
  // A funicular straight up from the first district below, on trestles where the ground falls away, its car partway.
  if (t.funicular) {
    const low = toPx(lows[0]!);
    const base = nearestOn(low, centre[0], centre[1]);
    const top = nearestOn(plateauPx, base[0], base[1]);
    const zb = Math.max(0, at(base[0], base[1])) + 1, zt = t.height + 1;
    out.strips.push({ x: (base[0] + top[0]) / 2, y: (base[1] + top[1]) / 2, w: Math.hypot(top[0] - base[0], top[1] - base[1]), d: 2.6, h: 0.8, z0: zb, a: Math.atan2(top[1] - base[1], top[0] - base[0]), material: 'stair', ends: [[base[0], base[1], zb], [top[0], top[1], zt]] });
    for (let k = 1; k < 12; k++) {
      const u = k / 12, x = base[0] + (top[0] - base[0]) * u, y = base[1] + (top[1] - base[1]) * u;
      const zr = zb + (zt - zb) * u, zg = Math.max(0, at(x, y));
      if (zr - zg > 2) out.props.push({ kind: 'pylon', x, y, z0: zg, w: 0.8, d: 2.4, h: zr - zg, a: Math.atan2(top[1] - base[1], top[0] - base[0]) });
    }
    const u = 0.42, cx = base[0] + (top[0] - base[0]) * u, cy = base[1] + (top[1] - base[1]) * u, cz = zb + (zt - zb) * u;
    out.buildings.push({ x: cx, y: cy, w: 3, d: 4, h: 3, z0: cz, a: Math.atan2(top[1] - base[1], top[0] - base[0]), tint: '#ffcf7a', lit: 1, brick: 0, seed: 0.5, district: t.plateau, kind: 'car' });
    out.lights.push({ x: cx, y: cy, z: cz + 5, color: '#ffb347', power: 30000, radius: 2, reach: 60 });
  }
  // Shacks clinging to ledges.
  for (let made = 0, tries = 0; made < t.shacks && tries < 4000; tries++) {
    const x = between(r, x0, x1), y = between(r, y0, y1), z = at(x, y);
    if (z <= 15 || z >= t.height - 5) continue;
    out.buildings.push({ x, y, w: between(r, 3, 5), d: between(r, 2.5, 4), h: between(r, 2.5, 4), z0: z - 0.5, a: between(r, 0, 3), tint: pick(r, ['#ffb347', '#ffcf7a', '#ff8c3a']), lit: 0.9, brick: r() < 0.5 ? 1 : 0, seed: r(), district: t.plateau, kind: 'shack' });
    if (r() < 0.5) out.lights.push({ x, y, z: z + 4, color: '#ffb347', power: 30000, radius: 2, reach: 60 });
    made++;
  }
  // The Shelf: a lit balustrade along the cliff top, above the face the Cat hangs on. Per column of the
  // grid, from the south, the first cell at the top with the face dropping away just south of it; neighbours join into a
  // low wall with lamp posts along it.
  if (t.shelf) {
    const edge: (P | null)[] = [];
    for (let i = 0; i < cols; i += 2) {
      let found: P | null = null;
      for (let j = rows - 9; j >= 0; j--) {
        if (heights[j * cols + i]! >= t.height * 0.92 && heights[(j + 8) * cols + i]! < t.height * 0.6 && heights[(j + 8) * cols + i]! >= 0) {
          found = [x0 + i * step, y0 + j * step];
          break;
        }
      }
      edge.push(found);
    }
    let n = 0;
    for (let k = 1; k < edge.length; k++) {
      const a = edge[k - 1], b = edge[k];
      if (!a || !b || Math.abs(b[1] - a[1]) > 9) continue;
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      out.strips.push({ x: mx, y: my, w: seg + 0.3, d: 0.8, h: 1.2, z0: t.height, a: ang, material: 'concrete' });
      // Its coping catches the lamps: a faint warm line along the top.
      out.strips.push({ x: mx, y: my, w: seg + 0.3, d: 0.3, h: 0.15, z0: t.height + 1.2, a: ang, material: 'street-light', color: '#ff9a4a' });
      if (n++ % 3 === 0) {
        out.strips.push({ x: mx, y: my - 0.6, w: 0.3, d: 0.3, h: 3.4, z0: t.height, a: ang, material: 'girder' });
        out.props.push({ kind: 'lamp', x: mx, y: my - 0.6, z0: t.height + 3.4, w: 0.9, d: 0.9, h: 0.8, a: 0, color: '#ffb070' });
        if (n % 12 === 1) out.lights.push({ x: mx, y: my, z: t.height + 4, color: '#ffb070', power: 9000, radius: 1, reach: 30 });
      }
    }
  }
  return out;
}
