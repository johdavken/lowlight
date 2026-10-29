// Raised roads (spec 2026-10-25 §3): a traffic path with a height becomes a road deck on pylons, with its light trails, so
// the map's live cars ride the rendered road. Ground paths get no geometry; every road and rail keeps buildings off it.
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { MapTraffic } from '../../shared/map-schema';
import type { Prop, Strip } from './geometry';

type P = [number, number];
const toPx = (path: [number, number][]): P[] => path.map(([x, y]) => [(x / 100) * MAP_W, (y / 100) * MAP_H]);
/** A road deck's width (map px). */
export const ROAD_W = 16;

export function roadGeometry(traffic: MapTraffic[]): { strips: Strip[]; props: Prop[] } {
  const strips: Strip[] = [], props: Prop[] = [];
  for (const t of traffic) {
    if (!t.z) continue;
    const pts = toPx(t.path);
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i]!, pts[i + 1]!];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -Math.sin(ang), ny = Math.cos(ang), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      strips.push({ x: mx, y: my, w: seg + 1, d: ROAD_W, h: 3, z0: t.z - 3, a: ang, material: 'road' });
      strips.push({ x: mx - nx * 4, y: my - ny * 4, w: seg, d: 0.6, h: 0.2, z0: t.z + 0.1, a: ang, material: 'trail-red' });
      strips.push({ x: mx + nx * 4, y: my + ny * 4, w: seg, d: 0.6, h: 0.2, z0: t.z + 0.1, a: ang, material: 'trail-white' });
      if (i % 2 === 0) props.push({ kind: 'pylon', x: a[0], y: a[1], z0: 0, w: 4, d: 4, h: t.z - 3, a: ang });
    }
  }
  return { strips, props };
}

/** From a point to the nearest car or train path's edge (map px); drones don't count. */
export function roadDistance(traffic: MapTraffic[]): (x: number, y: number) => number {
  const paths = traffic.filter((t) => t.kind !== 'drone').map((t) => toPx(t.path));
  return (x, y) => {
    let best = Infinity;
    for (const pts of paths)
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = [pts[i]!, pts[i + 1]!];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy));
      }
    return best - ROAD_W / 2;
  };
}
