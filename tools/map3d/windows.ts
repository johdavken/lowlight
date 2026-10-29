// The lit windows the map's live layer twinkles (spec 2026-10-25 §5): sampled on the walls the camera sees (facing south),
// on the same grid the render's shader uses, so a twinkle lands on a rendered window.
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box } from './geometry';
import { rng } from './rng';

export interface LitWindow3 {
  /** Map %. */
  x: number;
  y: number;
  /** Map px up. */
  z: number;
  district: string;
  color: string;
  seed: number;
  dims: boolean;
}
/** The shader's window grid (map px): across, up. */
const ACROSS = 2.6, UP = 3.2;
/** At most this many twinkling windows a building, so the list stays light (about as many as the painting's scan found). */
const PER_BUILDING = 1;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** The whole list's ceiling: the live layer draws every window each frame (the painting's scan finds about 900). */
export const MAX_WINDOWS = 900;

export function litWindows(buildings: Box[], seed: string): LitWindow3[] {
  const out: LitWindow3[] = [];
  for (const b of buildings) {
    if (b.lit <= 0 || b.kind === 'wall') continue;
    const r = rng(`${seed}:${b.seed}:${b.x.toFixed(1)}:${b.y.toFixed(1)}`);
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [b.x + (sx! * b.w * c) / 2 - (sy! * b.d * s) / 2, b.y + (sx! * b.w * s) / 2 + (sy! * b.d * c) / 2] as const);
    let made = 0;
    for (let i = 0; i < 4 && made < PER_BUILDING; i++) {
      const p = cs[i]!, q = cs[(i + 1) % 4]!;
      // Walls whose outside faces south (towards the camera): the edge's normal points to +y.
      const ex = q[0] - p[0], ey = q[1] - p[1];
      // The edge's outward normal: of (ey, -ex) and its opposite, the one pointing away from the centre.
      const mx = (p[0] + q[0]) / 2 - b.x, my = (p[1] + q[1]) / 2 - b.y;
      const outY = ey * mx - ex * my > 0 ? -ex : ex;
      if (outY <= 0) continue;
      const cols = Math.max(1, Math.floor(Math.hypot(ex, ey) / ACROSS)), rows = Math.max(1, Math.floor(b.h / UP));
      for (let row = 0; row < rows && made < PER_BUILDING; row++)
        for (let col = 0; col < cols && made < PER_BUILDING; col++) {
          if (r() >= b.lit * 0.5) continue;
          const u = (col + 0.5) / cols;
          const x = p[0] + ex * u, y = p[1] + ey * u, z = b.z0 + (row + 0.6) * UP;
          if (z > b.z0 + b.h) continue;
          out.push({ x: r2((x / MAP_W) * 100), y: r2((y / MAP_H) * 100), z: r2(z), district: b.district, color: b.tint, seed: r2(r()), dims: r() < 0.3 });
          made++;
        }
    }
  }
  // Over the ceiling, keep the lowest seeds: an even thinning across the city that's the same every run.
  return out.length <= MAX_WINDOWS ? out : [...out].sort((a, b) => a.seed - b.seed || a.x - b.x || a.y - b.y).slice(0, MAX_WINDOWS);
}
