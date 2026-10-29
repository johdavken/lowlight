// Hand-placed landmarks (spec 2026-10-25 §2): the neon cat on the cliff face, the cyan planet sign beside Hicks's block, the
// freight lift at the public landing, Hae's red bowl at Level 4. Each is tied to a place or a point.
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Landmark } from '../../shared/city-schema';
import type { Place } from '../../shared/map-schema';
import type { Box, Curve, Light, Prop } from './geometry';
import type { RibbonFrame } from './structure';

export interface LandmarkContext {
  places: Place[];
  /** The Ribbon at a point (null: no Ribbon). */
  frame: ((x: number, y: number) => RibbonFrame) | null;
  /** The ground's height at a point (map px; below 0 off the terrain), and the cliff top's height. */
  height?: (x: number, y: number) => number;
  cliffTop?: number;
}

type V3 = [number, number, number];
const ring = (cx: number, cy: number, cz: number, rx: number, rz: number, steps = 36): V3[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const t = (k / steps) * 2 * Math.PI;
    return [cx + rx * Math.cos(t), cy, cz + rz * Math.sin(t)];
  });
/** The Cat on the cliff, seated as the rooms paint it: its outline, tail and front legs, in units of its height (u across,
 * v up from its base). */
const CAT_SEATED: [number, number][][] = [
  [[-0.17, 0], [-0.2, 0.14], [-0.16, 0.34], [-0.1, 0.5], [-0.085, 0.66], [-0.11, 0.78], [-0.1, 1], [-0.045, 0.88], [0.045, 0.88], [0.1, 1], [0.11, 0.78], [0.085, 0.66], [0.1, 0.5], [0.16, 0.34], [0.2, 0.14], [0.17, 0], [-0.17, 0]],
  [[0.17, 0.03], [0.3, 0.06], [0.34, 0.18], [0.27, 0.27]],
  [[-0.05, 0], [-0.045, 0.4]],
  [[0.05, 0], [0.045, 0.4]],
  [[-0.07, 0.75], [-0.03, 0.745]],
  [[0.03, 0.745], [0.07, 0.75]],
];
/** The cat's outline (the test's), in units of its size: x across, v down from its ears. */
const CAT: [number, number][] = [[-0.25, 0.9], [-0.5, 0.4], [-0.42, -0.2], [-0.2, -0.35], [-0.3, -0.8], [-0.08, -0.55], [0.12, -0.55], [0.3, -0.8], [0.22, -0.3], [0.45, 0], [0.42, 0.5], [0.3, 0.9], [-0.25, 0.9]];

export function landmarkGeometry(list: Landmark[], ctx: LandmarkContext): { buildings: Box[]; curves: Curve[]; props: Prop[]; lights: Light[] } {
  const out = { buildings: [] as Box[], curves: [] as Curve[], props: [] as Prop[], lights: [] as Light[] };
  const where = (at: [number, number] | { place: string }): [number, number] | null => {
    if (Array.isArray(at)) return [(at[0] / 100) * MAP_W, (at[1] / 100) * MAP_H];
    const p = ctx.places.find((q) => q.id === at.place);
    return p ? [(p.pin[0] / 100) * MAP_W, (p.pin[1] / 100) * MAP_H] : null;
  };
  const tower = (x: number, y: number, h: number, tint: string): Box => ({ x, y, w: 6, d: 6, h, z0: 0, a: 0, tint, lit: 0.6, brick: 0, seed: 0.3, district: 'karasu', kind: 'tower' });
  for (const l of list) {
    const p = where(l.at);
    if (!p) continue;
    if (l.kind === 'tower-sign') {
      let [x, y] = p, top = l.height;
      if (l.besideStructure && ctx.frame) {
        const f = ctx.frame(x, y);
        const o = f.side * (f.gap / 2 + f.depth + 7);
        [x, y] = [f.mx + f.nx * o, f.my + f.ny * o];
        top = f.levels * f.levelHeight + l.height;
      }
      if (l.shape === 'cat' && l.onCliff && ctx.height && ctx.cliffTop) {
        // Against the face nearest its point, standing up from the cliff's foot on a scaffold, facing the city.
        const H = ctx.cliffTop, hAt = ctx.height;
        // The cliff's foot nearest its point: low ground with the top of the cliff just north of it (a face toward the city).
        let [cx, cy] = p, best = Infinity;
        for (let dy = -400; dy <= 400; dy += 4)
          for (let dx = -400; dx <= 400; dx += 4) {
            const x = p[0] + dx, y = p[1] + dy, h = hAt(x, y);
            if (h < 0 || h > H * 0.3 || hAt(x, y - 30) < H * 0.8) continue;
            const d = Math.hypot(dx, dy);
            if (d < best) [best, cx, cy] = [d, x, y];
          }
        const z0 = Math.max(0, hAt(cx, cy));
        const k = l.height, y = cy + 4;
        for (const line of CAT_SEATED)
          out.curves.push({ points: line.map(([u, v]) => [cx + u * k, y, z0 + 2 + v * k] as V3), bevel: 1.1, material: 'neon', color: l.color, ...(l.strength ? { strength: l.strength } : {}) });
        // The scaffold: poles and rails behind it, back against the rock.
        for (let u = -0.3; u <= 0.3; u += 0.1) out.props.push({ kind: 'lattice', x: cx + u * k, y: y - 1.5, z0: z0 - 6, w: 0.5, d: 0.5, h: k + 10, a: 0 });
        for (let v = 0; v <= 1; v += 0.1) out.props.push({ kind: 'lattice', x: cx, y: y - 1.5, z0: z0 + v * k, w: k * 0.62, d: 0.4, h: 0.4, a: 0 });
        out.lights.push({ x: cx, y: y + 10, z: z0 + k * 0.5, color: l.color, power: 120000, radius: 5, reach: 120 });
      } else if (l.shape === 'cat') {
        const sz = l.size ?? 1;
        out.buildings.push({ ...tower(x, y + 6, top, '#ffb347'), w: 16 * sz, d: 12 });
        const k = 2.6 * 9 * 1.6 * sz;
        out.curves.push({ points: CAT.map(([u, v]) => [x + u * k, y, top + (0.9 - v) * k] as V3), bevel: 0.9 * sz, material: 'neon', color: l.color, ...(l.strength ? { strength: l.strength } : {}) });
      } else {
        out.buildings.push(tower(x, y, top, '#bfe0ff'));
        out.curves.push({ points: ring(x, y - 1, top + 7, 5.5, 2), bevel: 0.3, material: 'neon', color: l.color });
        out.curves.push({ points: ring(x, y - 0.5, top + 7, 3.2, 3.2), bevel: 0.3, material: 'neon', color: l.color });
      }
    } else if (l.kind === 'freight-lift' && ctx.frame) {
      const f = ctx.frame(p[0], p[1]);
      const o = f.side * (f.gap / 2 - 3.2);
      const [x, y] = [f.mx + f.nx * o, f.my + f.ny * o];
      const top = f.levels * f.levelHeight + 10;
      const c = Math.cos(f.ang), s = Math.sin(f.ang);
      for (const [dx, dy] of [[-2, -2], [2, -2], [2, 2], [-2, 2]] as const) out.props.push({ kind: 'lattice', x: x + dx * c - dy * s, y: y + dx * s + dy * c, z0: 0, w: 0.5, d: 0.5, h: top, a: f.ang });
      for (let z = 0; z < top; z += 4) out.props.push({ kind: 'lattice', x, y, z0: z, w: 4.4, d: 4.4, h: 0.25, a: f.ang });
      out.buildings.push({ x, y, w: 3.4, d: 3.4, h: 4.2, z0: (l.carLevel - 1) * f.levelHeight + 0.3, a: f.ang, tint: '#ffcf7a', lit: 1, brick: 0, seed: 0.7, district: 'karasu', kind: 'car' });
      out.props.push({ kind: 'lamp', x, y, z0: top, w: 0.8, d: 0.8, h: 0.8, a: 0, color: '#ff2a2a' });
      out.lights.push({ x, y, z: (l.carLevel - 1) * f.levelHeight + 3, color: '#ffcf7a', power: 60000, radius: 2, reach: 60 });
    } else if (l.kind === 'wall-sign' && ctx.frame) {
      const f = ctx.frame(p[0], p[1]);
      const o = f.side * (f.gap / 2 - 0.6);
      const [hx, hy] = [f.mx + f.nx * o, f.my + f.ny * o];
      const z0 = (l.level - 1) * f.levelHeight + 4.5;
      const tx = Math.cos(f.ang), ty = Math.sin(f.ang);
      const bowl: V3[] = Array.from({ length: 11 }, (_, k) => {
        const t = (k * Math.PI) / 10;
        return [hx + tx * 1.6 * Math.cos(t), hy + ty * 1.6 * Math.cos(t), z0 - 1.2 * Math.sin(t)];
      });
      const at = (u: number, dz: number): V3 => [hx + tx * u, hy + ty * u, z0 + dz];
      for (const pts of [bowl, [bowl[0]!, bowl.at(-1)!], [at(0.2, 0.2), at(1.3, 2)], [at(0.6, 0.2), at(1.7, 1.8)]]) out.curves.push({ points: pts, bevel: 0.18, material: 'neon', color: l.color });
    }
  }
  return out;
}
