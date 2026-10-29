// Helios Towers (lore: helios-towers; "primarily 5 eco super structures, though there would be
// surrounding infrastructure"). Five towers, each its own city: stepped gold-lit glass with sky gardens at every setback
// (green terraces with trees), vertical gardens up the faces, each with a crown of its own — the first the painting's
// golden triangle. Skybridges join neighbours high up, so residents never touch the ground. Below: landscaped grounds,
// a service ring road round each base, lit service gates with security booths (workers are scanned in and out), loading
// docks, and low utility blocks between.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Curve, Light, Prop, Strip } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];
type Arcologies = NonNullable<DistrictStyle['arcologies']>;
export interface ArcologyGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
  /** Each tower's centre, footprint radius and height (for tests and neighbours). */
  towers: { x: number; y: number; r: number; h: number }[];
  /** From a point to the nearest piece of the Towers' ground (map px; negative inside): blocks keep off. */
  distance: (x: number, y: number) => number;
}

const GREEN = '#8fe07a';
const CELL = 8;
type Crown = Arcologies['crown'];

export function arcologyGeometry(district: string, cfg: Arcologies, border: Anchor[], solid: (x: number, y: number) => boolean, blocked: (x: number, y: number) => number = () => Infinity): ArcologyGeometry {
  const r = rng(`arcology:${district}`);
  const out: ArcologyGeometry = { buildings: [], props: [], strips: [], curves: [], lights: [], towers: [], distance: () => Infinity };
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const pts = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const R = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const toEdge = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!, dx = q[0] - p[0], dy = q[1] - p[1];
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy));
    }
    return best;
  };
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
  const claimDisc = (x: number, y: number, rad: number) => {
    for (let u = -rad; u <= rad; u += CELL / 2) for (let v = -rad; v <= rad; v += CELL / 2) if (u * u + v * v <= rad * rad) taken.add(key(x + u, y + v));
  };
  const a0 = (cfg.angleDeg * Math.PI) / 180;
  const box = (x: number, y: number, w: number, d: number, h: number, z0: number, a: number, o: Partial<Box> = {}) =>
    // Warm windows close-set up every face: the painting's towers glow gold, not as dark glass.
    out.buildings.push({ x, y, w, d, h, z0, a, tint: pick(r, cfg.glass), lit: 0.85, brick: 0, seed: r(), district, kind: 'building', ...o });

  // Where the five stand: the first where the painting's golden tower is, the rest as far from each other as the
  // district allows (best of many candidates), each well inside the border and clear of structures.
  const sites: P[] = [[(cfg.first[0] / 100) * MAP_W, (cfg.first[1] / 100) * MAP_H]];
  while (sites.length < cfg.count) {
    let best: P | null = null, bestD = -1;
    for (let t = 0; t < 400; t++) {
      const p: P = [cx + between(r, -R, R), cy + between(r, -R, R)];
      if (!inside(...p) || toEdge(...p) < cfg.footprint[1] * 0.75 || blocked(...p) < cfg.footprint[1] || !solid(...p)) continue;
      const d = Math.min(...sites.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
      if (d > bestD) [best, bestD] = [p, d];
    }
    if (!best) break;
    sites.push(best);
  }

  // A tower: tiers stepping in as they rise, a sky garden on every setback, vertical gardens up the faces, a crown.
  const tower = (c: P, k: number) => {
    const [x, y] = c;
    // One design, one maker: the same plan, tiers and crown on all five; only height and turn vary.
    const foot = cfg.footprint[1];
    const H = k === 0 ? cfg.height[1] : between(r, cfg.height[0], cfg.height[1]);
    const a = a0 + (k === 0 ? 0 : between(r, -0.25, 0.25));
    const plan = cfg.plan;
    const onFace = (u: number, v: number): [number, number] => [x + u * Math.cos(a) - v * Math.sin(a), y + u * Math.sin(a) + v * Math.cos(a)];
    const tiers = 5;
    let z = 0, w = foot, d = foot * 0.9;
    const tint = pick(r, cfg.glass);
    for (let t = 0; t < tiers; t++) {
      const th = (H * (t === 0 ? 0.34 : 0.66 / (tiers - 1))) * between(r, 0.92, 1.08);
      const parts: [number, number, number, number, number][] = // dx, dy, w, d, angle
        plan === 'cross' ? [[0, 0, w, d * 0.42, a], [0, 0, w * 0.42, d, a]]
        : plan === 'octagon' ? [[0, 0, w * 0.82, d * 0.82, a], [0, 0, w * 0.82, d * 0.82, a + Math.PI / 4]]
        : plan === 'twin' ? [[-w * 0.24, 0, w * 0.46, d, a], [w * 0.24, 0, w * 0.46, d * 0.86, a]]
        : [[0, 0, w, d, a]];
      for (const [dx, dy, pw, pd, pa] of parts) box(x + dx * Math.cos(a) - dy * Math.sin(a), y + dx * Math.sin(a) + dy * Math.cos(a), pw, pd, th, z, pa, { tint, kind: t === 0 ? 'building' : 'tier' });
      // Vertical gardens: green strips up the face toward the camera.
      for (let g = -1; g <= 1; g += 2) {
        // On the front face in the tower's own turned frame (u along, v out of the face).
        const [gx, gy] = onFace(g * w * 0.3, d / 2 + 0.3);
        out.strips.push({ x: gx, y: gy, w: 1.2, d: 0.4, h: th * 0.9, z0: z + th * 0.05, a, material: 'street-light', color: GREEN });
      }
      z += th;
      if (t < tiers - 1) {
        // The sky garden on the setback: a terrace edged in green light, trees on it, a warm glow.
        const nw = w * 0.78, nd = d * 0.78;
        out.strips.push({ x, y, w: w + 2, d: d + 2, h: 0.8, z0: z, a, material: 'concrete' });
        for (const [sx, sy, sw, sd] of [[0, -d / 2 - 0.6, w + 2, 0.4], [0, d / 2 + 0.6, w + 2, 0.4], [-w / 2 - 0.6, 0, 0.4, d + 2], [w / 2 + 0.6, 0, 0.4, d + 2]] as const)
          out.strips.push({ x: x + sx * Math.cos(a) - sy * Math.sin(a), y: y + sx * Math.sin(a) + sy * Math.cos(a), w: sw === 0.4 ? 0.25 : sw, d: sd === 0.4 ? 0.25 : sd, h: 0.3, z0: z + 0.8, a, material: 'street-light', color: GREEN });
        for (let q = 0; q < 28; q++) {
          // Trees in the ring between this tier's edge and the next tier's.
          const u = between(r, -w / 2 + 1.5, w / 2 - 1.5), v = between(r, -d / 2 + 1.5, d / 2 - 1.5);
          if (Math.abs(u) < nw / 2 + 1 && Math.abs(v) < nd / 2 + 1) continue;
          const th2 = between(r, 3, 6);
          out.props.push({ kind: 'pine', x: x + u * Math.cos(a) - v * Math.sin(a), y: y + u * Math.sin(a) + v * Math.cos(a), z0: z + 0.8, w: th2 * 0.6, d: th2 * 0.6, h: th2, a: 0 });
        }
        out.lights.push({ x, y: y + d / 2, z: z + 4, color: '#ffe2a0', power: 30000, radius: 0.6, reach: 60 });
        w = nw;
        d = nd;
      }
    }
    // The crown.
    const crown: Crown = cfg.crown;
    const top = z, fo = d / 2 + 0.4;
    const F = (u: number, zz: number): [number, number, number] => [...onFace(u, fo), zz];
    if (crown === 'triangle') {
      // The painting's golden triangle with its eye, lit on the face toward the camera, and a gold spire.
      const zc = top - H * 0.08, sz = w * 0.42;
      out.curves.push({ points: [F(-sz, zc - sz * 0.6), F(sz, zc - sz * 0.6), F(0, zc + sz * 0.95), F(-sz, zc - sz * 0.6)], bevel: 0.5, material: 'neon', color: cfg.emblem, strength: 14 });
      out.curves.push({ points: Array.from({ length: 17 }, (_, q) => F(Math.cos((q / 16) * Math.PI * 2) * sz * 0.32, zc + Math.sin((q / 16) * Math.PI * 2) * sz * 0.2)), bevel: 0.35, material: 'neon', color: cfg.emblem, strength: 14 });
      const [bx, by] = onFace(0, fo - 0.25);
      out.props.push({ kind: 'billboard', x: bx, y: by, z0: zc - sz, w: sz * 2.6, d: 0.2, h: sz * 2.3, a, color: '#2a1a06' });
      out.props.push({ kind: 'mast', x, y, z0: top, w: 1.4, d: 1.4, h: H * 0.12, a: 0 });
    } else if (crown === 'spire') {
      box(x, y, w * 0.5, d * 0.5, H * 0.06, top, a, { kind: 'tier', tint: '#fff3d6' });
      out.props.push({ kind: 'mast', x, y, z0: top + H * 0.06, w: 1.6, d: 1.6, h: H * 0.16, a: 0 });
    } else if (crown === 'ring') {
      // A halo of light round the top, as of a garden ring.
      const ring: [number, number, number][] = Array.from({ length: 33 }, (_, q) => [x + Math.cos((q / 32) * Math.PI * 2) * w * 0.7, y + Math.sin((q / 32) * Math.PI * 2) * d * 0.7, top + 6]);
      out.curves.push({ points: ring, bevel: 0.5, material: 'neon', color: GREEN, strength: 10 });
    } else if (crown === 'dome') {
      out.props.push({ kind: 'tank', x, y, z0: top, w: Math.min(w, d) * 0.8, d: Math.min(w, d) * 0.8, h: H * 0.05, a: 0 });
      // A garden under the dome, glowing faintly green through it.
      out.curves.push({ points: Array.from({ length: 25 }, (_, q): [number, number, number] => [x + Math.cos((q / 24) * Math.PI * 2) * Math.min(w, d) * 0.4, y + Math.sin((q / 24) * Math.PI * 2) * Math.min(w, d) * 0.4, top + 0.6]), bevel: 0.4, material: 'neon', color: GREEN, strength: 8 });
    } else {
      box(x, y, w * 0.9, d * 0.18, H * 0.1, top, a, { kind: 'tier', tint: pick(r, cfg.glass) });
    }
    out.props.push({ kind: 'lamp', x, y, z0: top + (crown === 'spire' ? H * 0.22 : crown === 'triangle' ? H * 0.12 : H * 0.1), w: 0.9, d: 0.9, h: 0.6, a: 0, color: '#ff3b3b' });
    // A soft gold wash up the tower from below.
    out.lights.push({ x, y: y + d / 2 + 30, z: H * 0.3, color: '#ffcf7a', power: 120000, radius: 0.6, reach: 140 });
    out.towers.push({ x, y, r: foot / 2, h: H });
  };
  sites.forEach((c, k) => tower(c, k));

  // Skybridges: each tower to its nearest neighbour or two, high up, lit along both rails.
  const done = new Set<string>();
  for (const [i, t] of out.towers.entries()) {
    const near = out.towers.map((o, j) => ({ o, j, d: Math.hypot(o.x - t.x, o.y - t.y) })).filter((n) => n.j !== i).sort((p, q) => p.d - q.d).slice(0, 2);
    for (const { o, j, d } of near) {
      const id = [i, j].sort().join(':');
      if (done.has(id) || d > cfg.bridgeReach) continue;
      done.add(id);
      const z = Math.min(t.h, o.h) * between(r, 0.45, 0.7);
      const ang = Math.atan2(o.y - t.y, o.x - t.x), L = d - t.r - o.r;
      const sx = t.x + Math.cos(ang) * t.r, sy = t.y + Math.sin(ang) * t.r;
      const mx = sx + Math.cos(ang) * (L / 2), my = sy + Math.sin(ang) * (L / 2);
      out.buildings.push({ x: mx, y: my, w: L + 2, d: 6, h: 4, z0: z, a: ang, tint: '#fff3d6', lit: 0.7, brick: 0, seed: r(), district, kind: 'bridge', glass: 1 });
      for (const side of [-1, 1]) out.strips.push({ x: mx - Math.sin(ang) * side * 3.2, y: my + Math.cos(ang) * side * 3.2, w: L, d: 0.3, h: 0.3, z0: z + 4, a: ang, material: 'street-light', color: '#ffe2a0' });
    }
  }

  // The grounds: a landscaped park round each base, a service ring road with lamps, service gates with security booths,
  // loading docks.
  for (const t of out.towers) {
    const parkR = t.r + cfg.grounds;
    for (let q = 0; q < 80; q++) {
      const ang = r() * Math.PI * 2, d = t.r + 6 + Math.sqrt(r()) * (parkR - t.r - 14);
      const x = t.x + Math.cos(ang) * d, y = t.y + Math.sin(ang) * d;
      if (!inside(x, y) || blocked(x, y) < 3) continue;
      const h = between(r, 5, 10);
      out.props.push({ kind: 'pine', x, y, z0: 0, w: h * 0.55, d: h * 0.55, h, a: 0 });
      if (q % 8 === 0) out.props.push({ kind: 'lamp', x: x + 2, y, z0: 2.4, w: 0.5, d: 0.5, h: 0.4, a: 0, color: '#ffe2a0' });
    }
    // The ring road.
    const ring: [number, number][] = [];
    for (let q = 0; q <= 36; q++) {
      const ang = (q / 36) * Math.PI * 2, x = t.x + Math.cos(ang) * parkR, y = t.y + Math.sin(ang) * parkR;
      ring.push([x, y]);
    }
    for (let q = 0; q < ring.length - 1; q++) {
      const [p0, p1] = [ring[q]!, ring[q + 1]!];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if (!inside(mx, my) || blocked(mx, my) < 3) continue;
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      out.strips.push({ x: mx, y: my, w: L + 0.6, d: 7, h: 0.2, z0: 0.06, a: ang, material: 'street' });
      if (q % 2 === 0) out.props.push({ kind: 'lamp', x: mx - Math.sin(ang) * 4.5, y: my + Math.cos(ang) * 4.5, z0: 3.4, w: 0.9, d: 0.9, h: 0.5, a: 0, color: '#ffe2a0' });
    }
    // Service gates: two or three, a lit entrance in the base and a security booth on the ring with its cold light.
    for (let g = 0; g < 3; g++) {
      if (g === 2 && r() < 0.5) continue;
      const ang = (g / 3) * Math.PI * 2 + between(r, 0, 0.6) + Math.PI / 2;
      const ex = t.x + Math.cos(ang) * (t.r + 0.6), ey = t.y + Math.sin(ang) * (t.r + 0.6);
      out.props.push({ kind: 'shopfront', x: ex, y: ey, z0: 0, w: 6, d: 0.5, h: 4, a: ang + Math.PI / 2, color: '#d8ecff' });
      const bx = t.x + Math.cos(ang) * (parkR - 7), by = t.y + Math.sin(ang) * (parkR - 7);
      if (!inside(bx, by)) continue;
      out.buildings.push({ x: bx, y: by, w: 4, d: 3, h: 3, z0: 0, a: ang, tint: '#d8ecff', lit: 0.9, brick: 0, seed: r(), district, kind: 'shack' });
      out.props.push({ kind: 'lamp', x: bx, y: by, z0: 3.2, w: 0.9, d: 0.9, h: 0.5, a: 0, color: '#e8f4ff' });
      out.lights.push({ x: bx, y: by, z: 8, color: '#d8ecff', power: 12000, radius: 0.6, reach: 35 });
      // The service drive from the booth to the gate, and a loading dock beside it.
      const dx = ex - bx, dy = ey - by, dl = Math.hypot(dx, dy), da = Math.atan2(dy, dx);
      out.strips.push({ x: (bx + ex) / 2, y: (by + ey) / 2, w: dl, d: 5, h: 0.2, z0: 0.07, a: da, material: 'street' });
      const lx = (bx + ex) / 2 - Math.sin(da) * 9, ly = (by + ey) / 2 + Math.cos(da) * 9;
      if (inside(lx, ly)) out.buildings.push({ x: lx, y: ly, w: 12, d: 7, h: 5, z0: 0, a: da, tint: '#ffcf7a', lit: 0.3, brick: 0, seed: r(), district, kind: 'building' });
    }
    claimDisc(t.x, t.y, parkR + 6);
  }

  // Between the grounds: low utility blocks (plant rooms, substations, depots) on a grid, lit dimly, lamps on the
  // service streets.
  const G = cfg.utility;
  const ca = Math.cos(a0), sa = Math.sin(a0);
  for (let i = -Math.ceil(R / G.slot) - 1; i <= Math.ceil(R / G.slot) + 1; i++)
    for (let j = -Math.ceil(R / G.slot) - 1; j <= Math.ceil(R / G.slot) + 1; j++) {
      const x = cx + i * G.slot * ca - j * G.slot * sa, y = cy + i * G.slot * sa + j * G.slot * ca;
      const w = G.slot - 10;
      const corners: P[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [x + (u! * w * ca) / 2 - (v! * w * sa) / 2, y + (u! * w * sa) / 2 + (v! * w * ca) / 2]);
      if (![[x, y] as P, ...corners].every(([qx, qy]) => inside(qx, qy) && solid(qx, qy) && blocked(qx, qy) > 3 && !taken.has(key(qx, qy)))) continue;
      if (r() < 0.2) continue;
      out.buildings.push({ x, y, w: w * between(r, 0.6, 0.95), d: w * between(r, 0.5, 0.9), h: between(r, G.height[0], G.height[1]), z0: 0, a: a0, tint: pick(r, ['#ffcf7a', '#d8ecff']), lit: 0.3, brick: 0, seed: r(), district, kind: 'building' });
      out.props.push({ kind: 'lamp', x: x + (G.slot / 2) * ca, y: y + (G.slot / 2) * sa, z0: 3.4, w: 0.8, d: 0.8, h: 0.5, a: 0, color: '#ffe2a0' });
      for (const [qx, qy] of corners) taken.add(key(qx, qy));
      taken.add(key(x, y));
    }

  out.distance = (x, y) => {
    let best = Infinity;
    for (const t of out.towers) best = Math.min(best, Math.hypot(x - t.x, y - t.y) - (t.r + cfg.grounds + 8));
    const c0 = Math.floor(x / CELL), c1 = Math.floor(y / CELL);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (taken.has(`${c0 + i}:${c1 + j}`)) best = Math.min(best, Math.max(0, Math.hypot(i, j) - 1) * CELL - 4);
    return best;
  };
  return out;
}
