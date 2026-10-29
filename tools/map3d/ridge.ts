// The ridge ("misty mountains with tall trees", as the painting has it): on the ground between a flooded
// district and the neighbours it names, rocky crags, tall pines crowded among them, and a low mist lying over it all.
import { insideBorder, type Anchor, type CityMapData } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Light, Prop, Volume } from './geometry';
import { between, rng } from './rng';
import type { LandGrid } from './water';

type P = [number, number];
export interface RidgeGeometry {
  props: Prop[];
  volumes: Volume[];
  lights: Light[];
}

function toBorder(b: Anchor[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < b.length; i++) {
    const a = b[i]!, c = b[(i + 1) % b.length]!;
    const ax = (a.x / 100) * MAP_W, ay = (a.y / 100) * MAP_H, cx = (c.x / 100) * MAP_W, cy = (c.y / 100) * MAP_H;
    const dx = cx - ax, dy = cy - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** `runs`: the filler land between districts (gapRuns), [row, firstCol, lastCol] on `land`'s grid. */
export function ridgeGeometry(map: CityMapData, district: string, withIds: string[], land: LandGrid, runs: [number, number, number][], reach = 280): RidgeGeometry {
  const out: RidgeGeometry = { props: [], volumes: [], lights: [] };
  const me = map.districts.find((d) => d.id === district)?.border;
  const them = withIds.map((id) => map.districts.find((d) => d.id === id)?.border).filter((b): b is Anchor[] => !!b);
  if (!me || !them.length) return out;
  const all = map.districts.filter((d) => d.border).map((d) => d.border!);
  const inAny = (x: number, y: number) => all.some((b) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], b));
  // The strip: filler cells near both the flooded district and one of its named neighbours.
  const cells: P[] = [];
  for (const [row, c0, c1] of runs)
    for (let c = c0; c <= c1; c++) {
      const x = (c + 0.5) * land.step, y = (row + 0.5) * land.step;
      if (toBorder(me, x, y) < reach && them.some((b) => toBorder(b, x, y) < reach) && !inAny(x, y)) cells.push([x, y]);
    }
  if (!cells.length) return out;
  const r = rng(`ridge:${district}`);
  const pick = () => cells[Math.floor(r() * cells.length)]!;
  // Crags: a few big, most smaller, jostling.
  const n = Math.max(6, Math.round(cells.length / 4));
  for (let k = 0; k < n; k++) {
    const [x, y] = pick(), big = r() < 0.3;
    const rad = big ? between(r, 9, 15) : between(r, 5, 9);
    const cx = x + between(r, -3, 3), cy = y + between(r, -3, 3), h = big ? between(r, 24, 38) : between(r, 10, 22);
    if (inAny(cx, cy)) continue;
    out.props.push({ kind: 'crag', x: cx, y: cy, z0: -0.4, w: rad * 2, d: rad * 2, h, a: 0 });
  }
  // Tall pines crowded among them, in clumps.
  for (let k = 0; k < cells.length * 0.9; k++) {
    const [x, y] = pick();
    const h = between(r, 10, 18);
    out.props.push({ kind: 'pine', x: x + between(r, -4, 4), y: y + between(r, -4, 4), z0: between(r, 0, 4), w: between(r, 2.2, 3.4), d: 3, h, a: 0 });
  }
  // Mist: low slabs of fog over the strip, a coarse tiling of it.
  const T = 64, seen = new Set<string>();
  for (const [x, y] of cells) {
    const key = `${Math.floor(x / T)}:${Math.floor(y / T)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const x0 = Math.floor(x / T) * T, y0 = Math.floor(y / T) * T;
    out.volumes.push({ kind: 'mist', outline: [[x0, y0], [x0 + T, y0], [x0 + T, y0 + T], [x0, y0 + T]], z0: 0, z1: between(r, 18, 30), density: 0.09 });
  }
  return out;
}
