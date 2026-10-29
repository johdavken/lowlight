// Iron Reach (2026-10-27): the industrial zone, as the painting has it. Steelworks — blast furnaces with their stoves
// and dust catchers, the molten glow at the casthouse, a skip incline up to the throat, a long rolling mill — tall brick
// chimneys in pairs with steady red lamps, gas holders in their frames, tanks lit cyan, pipe racks between the plants,
// and pines along the wooded west edge. Everything else is the district's own factory blocks, kept off by `distance`.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor } from '../../shared/map-schema';
import { ELEV_DEG, MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Light, Prop, Strip } from './geometry';
import { between, pick, rng } from './rng';
import { truckRoad } from './port';

type P = [number, number];
type Industry = NonNullable<DistrictStyle['industry']>;
export interface FoundryGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  lights: Light[];
  /** From a point to the nearest plant (map px; negative inside): blocks keep off them. */
  distance: (x: number, y: number) => number;
}

const MOLTEN = '#ffb030';
const SODIUM = '#ffb060';
const RED = '#ff3b3b';
const RAIL = '#7a5a3c';
const CELL = 8;

/** A neighbour the works blend into (Dockside): its border, its containers' colours, and the distance to what it has
 * already laid (its port), so the works only take its free ground. */
export interface Blend {
  border: Anchor[];
  containers: string[];
  taken: (x: number, y: number) => number;
}
/** `railFrom`: a neighbour's line arriving at the border (Dockside's branch), from its junction to the border. */
/** More from the neighbours: the port's truck road arriving at the border; neighbours whose blocks the works give way to
 * (border, window colours, heights); the ambience's smoke plumes, which stand on chimneys. */
export interface FoundryExtra {
  road?: [P, P] | null;
  edges?: { border: Anchor[]; colors: string[]; height: [number, number] }[];
  plumes?: P[];
}
export function foundryGeometry(district: string, cfg: Industry, border: Anchor[], solid: (x: number, y: number) => boolean, blocked: (x: number, y: number) => number = () => Infinity, railFrom: [P, P] | null = null, blend: Blend | null = null, extra: FoundryExtra = {}): FoundryGeometry {
  // The stream the helpers (box seeds, chimney heights) draw from: the plants' own, switched to a section's own stream
  // while it lays (the road, the plume chimneys, the derrick, the works grid), so editing one never moves another
  // (review, 2026-10-27).
  const main = rng(`industry:${district}`);
  let r = main;
  const out: FoundryGeometry = { buildings: [], props: [], strips: [], lights: [], distance: () => Infinity };
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  // The edges shared with each block-neighbour, and the nearest one's distance.
  const edgeSets = (extra.edges ?? []).map((e) => {
    const inE = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], e.border);
    const ps = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
    const segs: [P, P][] = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!, q = ps[(i + 1) % ps.length]!, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;
      // (The Spine's strip runs between Iron Reach and its northern neighbours: look across it.)
      if ([[nx, ny], [-nx, -ny]].some(([ax, ay]) => [40, 90, 150].some((k) => inE(mx + ax! * k, my + ay! * k)))) segs.push([p, q]);
    }
    return { e, segs };
  });
  const edgeDist = (x: number, y: number) => {
    let best: { d: number; e: NonNullable<FoundryExtra['edges']>[number] } | null = null;
    for (const { e, segs } of edgeSets)
      for (const [p, q] of segs) {
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy);
        if (!best || d < best.d) best = { d, e };
      }
    return best;
  };
  // Where plants may stand: the district, until the works grid spills over into the blend band.
  let zone = inside;
  // The border edges shared with the blend neighbour, and the distance to them.
  const shared: [P, P][] = [];
  const inNb = (x: number, y: number) => !!blend && insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], blend.border);
  const toShared = (x: number, y: number) => {
    let best = Infinity;
    for (const [p, q] of shared) {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy));
    }
    return best;
  };
  const pts = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const R = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const a0 = (cfg.angleDeg * Math.PI) / 180;
  if (blend)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;
      if ([[nx, ny], [-nx, -ny]].some(([ax, ay]) => !inside(mx + ax! * 20, my + ay! * 20) && inNb(mx + ax! * 30, my + ay! * 30))) shared.push([p, q]);
    }
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
  const toEdge = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!, dx = q[0] - p[0], dy = q[1] - p[1];
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy));
    }
    return best;
  };
  // A frame turned `a` at a centre: `u` along, `v` across.
  // `s` scales a plant's layout and sizes (the steelworks are drawn at `cfg.scale`).
  const frame = (c: P, a: number, s = 1) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    return { a, s, at: (u: number, v: number): P => [c[0] + (u * ca - v * sa) * s, c[1] + (u * sa + v * ca) * s] };
  };
  type F = ReturnType<typeof frame>;
  // Room for a footprint w × d (plus margin): on ground, inside, clear of structures and of what's laid.
  const room = (f: F, w: number, d: number, m: number) => {
    for (let u = -w / 2 - m; u <= w / 2 + m; u += 8)
      for (let v = -d / 2 - m; v <= d / 2 + m; v += 8) {
        const [x, y] = f.at(u, v);
        if (!zone(x, y) || !solid(x, y) || blocked(x, y) < 6 || taken.has(key(x, y))) return false;
      }
    return true;
  };
  const claim = (f: F, w: number, d: number) => {
    for (let u = -w / 2; u <= w / 2; u += CELL / 2) for (let v = -d / 2; v <= d / 2; v += CELL / 2) taken.add(key(...f.at(u, v)));
  };
  const box = (f: F, u: number, v: number, w: number, d: number, h: number, z0: number, o: Partial<Box> = {}) => {
    const [x, y] = f.at(u, v);
    out.buildings.push({ x, y, w: w * f.s, d: d * f.s, h: h * f.s, z0: z0 * f.s, a: f.a, tint: SODIUM, lit: 0, brick: 0, seed: r(), district, kind: 'building', ...o });
  };
  const tank = (f: F, u: number, v: number, w: number, h: number, z0 = 0) => {
    const [x, y] = f.at(u, v);
    out.props.push({ kind: 'tank', x, y, z0: z0 * f.s, w: w * f.s, d: w * f.s, h: h * f.s, a: 0 });
  };
  const lamp = (f: F, u: number, v: number, z: number, color: string, s = 0.7) => {
    const [x, y] = f.at(u, v);
    out.props.push({ kind: 'lamp', x, y, z0: z * f.s, w: s, d: s, h: s * 0.8, a: 0, color });
  };
  const pipe = (f: F, u0: number, v0: number, z0: number, u1: number, v1: number, z1: number, d = 1.2) => {
    const [x0, y0] = f.at(u0, v0), [x1, y1] = f.at(u1, v1);
    out.strips.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: 0, d: d * f.s, h: d * f.s, z0: 0, a: 0, material: 'pipe', ends: [[x0, y0, z0 * f.s], [x1, y1, z1 * f.s]] });
  };
  const lattice = (f: F, u: number, v: number, h: number, w = 0.8) => {
    const [x, y] = f.at(u, v);
    out.props.push({ kind: 'lattice', x, y, z0: 0, w: w * f.s, d: w * f.s, h: h * f.s, a: 0 });
  };
  const light = (f: F, u: number, v: number, z: number, color: string, power: number, reach: number) => {
    const [x, y] = f.at(u, v);
    out.lights.push({ x, y, z: z * f.s, color, power, radius: 3, reach: reach * f.s });
  };
  // A glowing strip on the ground or a face: slag pits, hot metal channels, oven doors.
  const glow = (f: F, u: number, v: number, w: number, d: number, h: number, z0: number, color = MOLTEN) => {
    const [x, y] = f.at(u, v);
    out.strips.push({ x, y, w: w * f.s, d: d * f.s, h: h * f.s, z0: z0 * f.s, a: f.a, material: 'street-light', color });
  };
  // Floodlight masts round a plant's footprint, sodium, lighting its walls.
  const floods = (f: F, w: number, d: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2 + 0.4, u = (Math.cos(t) * w) / 2, v = (Math.sin(t) * d) / 2;
      lattice(f, u, v, 22);
      lamp(f, u, v, 22, '#ffd9a0', 0.8);
      light(f, u, v, 22, SODIUM, 80000, 70);
    }
  };
  const chimneys = (f: F, u: number, v: number, n: number, h: number) => {
    for (let k = 0; k < n; k++) {
      const [x, y] = f.at(u + k * 11, v + between(r, -2, 2));
      const hk = h * between(r, 0.9, 1.05);
      out.buildings.push({ x, y, w: 10, d: 10, h: hk, z0: 0, a: f.a, tint: SODIUM, lit: 0, brick: 1, seed: r(), district, kind: 'stack' });
      // A lit band near the top (the painting's stacks read by it), on all four faces.
      for (const [bu, bv, bw, bd] of [[0, -5.2, 10.6, 0.4], [0, 5.2, 10.6, 0.4], [-5.2, 0, 0.4, 10.6], [5.2, 0, 0.4, 10.6]] as const) {
        const [gx, gy] = [x + Math.cos(f.a) * bu - Math.sin(f.a) * bv, y + Math.sin(f.a) * bu + Math.cos(f.a) * bv];
        out.strips.push({ x: gx, y: gy, w: bw, d: bd, h: 0.8, z0: hk * 0.86, a: f.a, material: 'street-light', color: '#ffb060' });
      }
      out.props.push({ kind: 'lamp', x, y, z0: hk, w: 0.9, d: 0.9, h: 0.6, a: 0, color: RED });
      out.props.push({ kind: 'lamp', x, y, z0: hk * 0.6, w: 0.6, d: 0.6, h: 0.5, a: 0, color: RED });
    }
  };

  // A steelworks: two blast furnaces side by side, each with its stoves, dust catcher, downcomer and skip incline; the
  // casthouse between glowing molten orange, slag pits and a hot-metal channel; coke oven batteries with their doors
  // aglow and a quench tower; a long rolling mill with a lit clerestory; chimneys; floodlights round it all.
  const steelworks = (f: F) => {
    const H = cfg.furnace;
    for (const fu of [-30, 30]) {
      tank(f, fu, 0, 11, H);
      // The furnace's top: a frame of lattice legs round the throat, a hood, a red lamp.
      for (const [du, dv] of [[-5, -5], [5, -5], [5, 5], [-5, 5]] as P[]) lattice(f, fu + du, dv, H + 14);
      box(f, fu, 0, 8, 8, 4, H + 10, { kind: 'tier', lit: 0.4, tint: '#ffc27a' });
      lamp(f, fu, 0, H + 14.5, RED, 0.9);
      // Its belly glows where the tuyeres ring it.
      glow(f, fu, 0, 12, 12, 0.6, 6, '#ff7a2a');
      // Stoves: tall domed cylinders in a row behind.
      for (let k = 0; k < 3; k++) tank(f, fu - 12 + k * 12, 24, 8, H * 0.78);
      // Dust catcher and downcomer.
      tank(f, fu + 16, -16, 7, H * 0.55);
      pipe(f, fu, -2, H + 6, fu + 16, -16, H * 0.55, 1.6);
      pipe(f, fu, 6, H * 0.5, fu, 24, H * 0.5, 1.4);
      // The skip incline: a girder bridge from the stock house up to the throat.
      const [s0x, s0y] = f.at(fu, -58), [s1x, s1y] = f.at(fu, -4);
      out.strips.push({ x: (s0x + s1x) / 2, y: (s0y + s1y) / 2, w: 0, d: 3 * f.s, h: 1.4 * f.s, z0: 0, a: 0, material: 'girder', ends: [[s0x, s0y, 4 * f.s], [s1x, s1y, (H + 4) * f.s]] });
      box(f, fu, -60, 16, 10, 8, 0, { brick: 1, lit: 0.2 });
    }
    // The casthouse between them, its doors open on the molten iron.
    box(f, 0, -2, 26, 20, 13, 0, { lit: 0.55, tint: '#ff9a4a' });
    for (const du of [-9, 0, 9]) {
      const [x, y] = f.at(du, -12.3);
      out.props.push({ kind: 'shopfront', x, y, z0: 0, w: 5 * f.s, d: 0.5, h: 5 * f.s, a: f.a, color: MOLTEN });
    }
    // Hot metal runs in a channel out to the ladle track; slag pits glow beside it.
    glow(f, 0, -22, 4, 18, 0.3, 0.1);
    glow(f, -16, -32, 16, 10, 0.3, 0.1, '#ff9a20');
    glow(f, 16, -32, 14, 8, 0.3, 0.1, '#ffb040');
    // Torpedo ladle cars waiting on their track, each with its glowing mouth.
    for (const du of [-44, -26, 26, 44]) {
      box(f, du, -40, 12, 4, 4, 0.4, { kind: 'car', lit: 0 });
      lamp(f, du, -40, 4.6, MOLTEN, 1.4);
    }
    light(f, 0, -18, 6, MOLTEN, 120000, 90);
    light(f, 0, 0, H + 6, '#ff8a3a', 40000, 60);
    // Coke oven batteries: long low blocks, a row of glowing doors down the pusher side, a quench tower at the end.
    for (const bv of [-84, -100]) {
      box(f, -10, bv, 90, 10, 9, 0, { brick: 1, lit: 0.1 });
      for (let k = -50; k <= 30; k += 6) glow(f, k, bv - 5.3, 2.2, 0.4, 5, 1, '#ff7a2a');
    }
    box(f, 46, -92, 9, 9, 26, 0, { brick: 1, lit: 0.1, kind: 'stack' });
    light(f, -10, -92, 10, '#ff7a2a', 50000, 70);
    // The rolling mill: a long hall behind, a clerestory of lit windows down its roof.
    box(f, 0, 62, 150, 22, 14, 0, { lit: 0.45, tint: '#ffc27a', brick: 0 });
    box(f, 0, 62, 140, 6, 3, 14, { kind: 'tier', lit: 0.8, tint: '#ffd9a0' });
    // Glowing slabs on the run-out table at its end.
    glow(f, 82, 62, 14, 3, 0.8, 1, '#ff9a4a');
    // The pipe rack from the furnaces to the mill.
    for (const fu of [-30, 30]) pipe(f, fu + 6, 26, 9, fu + 6, 50, 9, 1.2);
    chimneys(f, 60, 30, 2, cfg.chimney);
    floods(f, 190, 190, 8);
  };

  // A gas holder: a big cylinder in a frame of lattice posts, a lamp on top.
  const gasholder = (f: F) => {
    const w = between(r, 30, 40), h = between(r, 22, 30);
    tank(f, 0, 0, w, h);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2, [x, y] = f.at(Math.cos(t) * (w / 2 + 1.5), Math.sin(t) * (w / 2 + 1.5));
      out.props.push({ kind: 'lattice', x, y, z0: 0, w: 0.8, d: 0.8, h: h + 6, a: 0 });
    }
    lamp(f, 0, 0, h, RED);
  };

  // A tank farm lit cyan, as painted: squat tanks with a cold light on each, a faint glow over them.
  const cyanTanks = (f: F) => {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const u = (i - 1) * 16, v = (j - 0.5) * 16, w = between(r, 9, 12), h = between(r, 8, 13);
        tank(f, u, v, w, h);
        lamp(f, u, v, h + 0.2, cfg.cyan, 1.6);
      }
    const [x, y] = f.at(0, 0);
    out.lights.push({ x, y, z: 16, color: cfg.cyan, power: 26000, radius: 3, reach: 50 });
  };

  // A refinery: cracking columns in their lattice frames, strings of small lamps up them; spherical tanks; a flare stack
  // burning at its top; pipe racks threading it all; floodlit.
  const refinery = (f: F) => {
    for (let k = 0; k < 7; k++) {
      const u = -50 + (k % 4) * 22 + between(r, -3, 3), v = k < 4 ? -18 : 14, w = between(r, 4, 7), h = between(r, 34, 58);
      tank(f, u, v, w, h);
      for (const [du, dv] of [[-4, -4], [4, -4], [4, 4], [-4, 4]] as P[]) lattice(f, u + du, v + dv, h * 0.85, 0.5);
      // Lamps strung up the column, and a red one on top.
      for (let z = 6; z < h; z += 5) lamp(f, u + w / 2 + 0.4, v, z, '#ffe2b0', 0.6);
      lamp(f, u, v, h + 0.4, RED, 0.8);
    }
    // Spherical tanks in a row (squat cylinders drawn round).
    for (let k = 0; k < 4; k++) {
      tank(f, 40 + (k % 2) * 16, -20 + Math.floor(k / 2) * 18, 13, 11);
      lamp(f, 40 + (k % 2) * 16, -20 + Math.floor(k / 2) * 18, 11.2, SODIUM, 0.9);
    }
    // Pipe racks along and across.
    for (const v of [-2, 30]) for (let k = 0; k < 3; k++) {
      const [x, y] = f.at(-5, v + (k - 1) * 1.6);
      out.strips.push({ x, y, w: 120, d: 1.1, h: 1.1, z0: 8 + (k % 2) * 1.4, a: f.a, material: 'pipe' });
    }
    // The flare stack: a tall thin mast, its flame burning at the top and lighting the plant.
    const fl: [number, number] = [70, 34];
    lattice(f, fl[0], fl[1], cfg.flare, 1.2);
    tank(f, fl[0], fl[1], 2, cfg.flare);
    const [x, y] = f.at(fl[0], fl[1]);
    // The flame: a broad orange tongue round a bright core, leaning downwind.
    out.props.push({ kind: 'lamp', x, y, z0: cfg.flare + 0.5, w: 5, d: 5, h: 7, a: 0, color: '#ffa020' });
    out.props.push({ kind: 'lamp', x: x + 1.2, y: y - 0.6, z0: cfg.flare + 5, w: 3.4, d: 3.4, h: 6, a: 0, color: '#ffc040' });
    out.props.push({ kind: 'lamp', x, y, z0: cfg.flare + 2, w: 2, d: 2, h: 4, a: 0, color: '#fff1c0' });
    out.lights.push({ x, y, z: cfg.flare + 4, color: '#ff9a3a', power: 90000, radius: 3, reach: 120 });
    floods(f, 150, 100, 6);
  };

  r = rng(`industry-road:${district}`);
  // The port's truck road carries on to the Spine's foot: across the strip between the districts,
  // then straight for the foot while the ground is clear; a truck plaza at its end with trailers under floodlights and
  // a cargo lift up to the deck, lit all the way.
  if (extra.road && cfg.spineFoot) {
    const S: P = [(cfg.spineFoot[0] / 100) * MAP_W, (cfg.spineFoot[1] / 100) * MAP_H];
    const E = extra.road[1], dx = S[0] - E[0], dy = S[1] - E[1], L = Math.hypot(dx, dy), tx = dx / L, ty = dy / L;
    let end: P = E;
    for (let t = 4; t < L - 40; t += 4) {
      const x = E[0] + tx * t, y = E[1] + ty * t;
      if (!inside(x, y) && t < 80) {
        end = [x, y];
        continue;
      }
      if (!inside(x, y) || !solid(x, y) || taken.has(key(x, y))) break;
      end = [x, y];
    }
    if (Math.hypot(end[0] - E[0], end[1] - E[1]) > 60) {
      truckRoad(E, end, 10, (c) => taken.add(c), out, r);
      // The plaza: paved, trailers in rows, floodlights, at the road's end.
      const pf = frame([end[0] + tx * 30, end[1] + ty * 30], Math.atan2(ty, tx));
      box(pf, 0, 0, 56, 40, 0.3, 0, { kind: 'wall', lit: 0 });
      for (let u = -22; u <= 22; u += 4.4)
        for (const v of [-10, 10]) {
          if (r() < 0.2) continue;
          box(pf, u, v, 2.6, 10, 1.4, 0, { kind: 'car' });
          if (r() < 0.6) {
            const [cx2, cy2] = pf.at(u, v);
            out.props.push({ kind: 'container', x: cx2, y: cy2, z0: 1.4, w: 2.4, d: 7.6, h: 2, a: pf.a, color: blend ? pick(r, blend.containers) : pick(r, cfg.crates) });
          }
        }
      for (const u of [-28, 28]) {
        lattice(pf, u, -20, 22);
        lamp(pf, u, -20, 22, '#ffd9a0', 0.8);
        light(pf, u, -20, 26, SODIUM, 50000, 120);
      }
      // The cargo lift: a lattice tower beside the plaza up to the deck, lamps up it, a red one on top.
      const deck = cfg.spineDeck;
      for (const [du, dv] of [[-3, -3], [3, -3], [3, 3], [-3, 3]] as P[]) lattice(pf, 34 + du, dv, deck, 1);
      for (let z = 8; z < deck; z += 9) lamp(pf, 37.6, 0, z, '#ffe2b0', 0.6);
      lamp(pf, 34, 0, deck + 1, RED, 0.9);
      claim(pf, 80, 50);
    }
  }
  r = rng(`industry-plumes:${district}`);
  // Chimneys under the ambience's smoke plumes (the author adds smoke in Studio): a pair whose tops stand where the plume
  // rises on screen, so their bases sit h·cos52° south of it.
  for (const [px, py] of extra.plumes ?? []) {
    const h = cfg.chimney * 1.05; const c: P = [px, py + h * Math.cos((ELEV_DEG * Math.PI) / 180)];
    if (!inside(...c)) continue;
    // Stepping aside for the road if it runs there.
    for (let k = 0; k < 6 && taken.has(key(...c)); k++) c[0] += 16;
    const f = frame(c, a0);
    chimneys(f, -5.5, 0, 2, h);
    claim(f, 30, 14);
  }
  r = rng(`industry-derrick:${district}`);
  // The wooded west edge (the painting's cliff): a derrick tower among thick pines, lit up its legs.
  if (cfg.derrick) {
    const D: P = [(cfg.derrick.at[0] / 100) * MAP_W, (cfg.derrick.at[1] / 100) * MAP_H], H = cfg.derrick.height;
    const df = frame(D, a0);
    // Four legs leaning in from a wide base to a narrow top, cross-braced, a platform, a crown block.
    const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [su, sv] of legs) {
      const [x0, y0] = df.at(su * 9, sv * 9), [x1, y1] = df.at(su * 2, sv * 2);
      out.strips.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: 0, d: 1, h: 1, z0: 0, a: 0, material: 'girder', ends: [[x0, y0, 0], [x1, y1, H]] });
      for (let z = 6; z < H; z += 7) {
        const k = z / H, [lx, ly] = df.at(su * (9 - 7 * k), sv * (9 - 7 * k));
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: z, w: 0.5, d: 0.5, h: 0.4, a: 0, color: '#ffd9a0' });
      }
    }
    for (let z = 10; z < H - 4; z += 12) {
      const k = z / H, e = 9 - 7 * k;
      for (let i = 0; i < 4; i++) {
        const [a1, b1] = legs[i]!, [a2, b2] = legs[(i + 1) % 4]!;
        const [x0, y0] = df.at(a1 * e, b1 * e), [x1, y1] = df.at(a2 * (9 - 7 * ((z + 12) / H)), b2 * (9 - 7 * ((z + 12) / H)));
        out.strips.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: 0, d: 0.5, h: 0.5, z0: 0, a: 0, material: 'girder', ends: [[x0, y0, z], [x1, y1, z + 12]] });
      }
    }
    box(df, 0, 0, 10, 10, 1, H * 0.3, { kind: 'tier', lit: 0.3, tint: '#ffd9a0' });
    box(df, 0, 0, 4, 4, 3, H, { kind: 'tier', lit: 0 });
    lamp(df, 0, 0, H + 3.4, RED, 0.9);
    // Its pump house and a lamp at the door.
    box(df, 16, 6, 12, 8, 6, 0, { brick: 1, lit: 0.4, tint: '#ffc27a' });
    light(df, 4, 4, 30, '#ffd9a0', 40000, 90);
    claim(df, 40, 30);
    // Thick pines round it, a few lamps along a track among them.
    for (let n = 0, t = 0; n < 160 && t < 1200; t++) {
      const a = r() * Math.PI * 2, d = 22 + Math.sqrt(r()) * cfg.derrick.forest, x = D[0] + Math.cos(a) * d, y = D[1] + Math.sin(a) * d;
      if (!inside(x, y) || !solid(x, y) || blocked(x, y) < 4 || taken.has(key(x, y))) continue;
      const h = between(r, 8, 16);
      out.props.push({ kind: 'pine', x, y, z0: 0, w: h * 0.45, d: h * 0.45, h, a: 0 });
      taken.add(key(x, y));
      n++;
      if (n % 5 === 0) out.props.push({ kind: 'lamp', x: x + 2, y, z0: 2.5, w: 0.5, d: 0.5, h: 0.4, a: 0, color: '#ffb060' });
      // A low warm light now and then, so the trees show against each other.
      if (n % 20 === 0) out.lights.push({ x: x + 2, y, z: 12, color: '#ffb060', power: 18000, radius: 0.6, reach: 50 });
    }
  }

  r = main;
  // Plants spread over the district, each kind in turn, well inside and apart.
  const kinds: [number, number, number, (f: F) => void][] = [
    [cfg.steelworks, 175 * cfg.scale, 190 * cfg.scale, steelworks],
    [cfg.refineries, 160, 100, refinery],
    [cfg.gasholders, 50, 50, gasholder],
    [cfg.tanks, 54, 40, cyanTanks],
  ];
  const plants: { c: P; w: number; d: number; a: number }[] = [];
  for (const [count, w, d, make] of kinds)
    for (let n = 0, t = 0; n < count && t < count * 400; t++) {
      const c: P = [cx + between(r, -R, R), cy + between(r, -R, R)];
      const a = a0 + (r() < 0.3 ? Math.PI / 2 : 0);
      const f0 = frame(c, a);
      if (toEdge(...c) < Math.max(w, d) / 2 + 30 || !room(f0, w, d, 10)) continue;
      // The steelworks' layout runs from its coke ovens (v −105) to its mill (v 73): centred on its footprint.
      const f = make === steelworks ? frame(f0.at(0, 16 * cfg.scale), a, cfg.scale) : f0;
      if (plants.some((p) => Math.hypot(p.c[0] - c[0], p.c[1] - c[1]) < (Math.max(p.w, p.d) + Math.max(w, d)) / 2 + cfg.apart)) continue;
      claim(f0, w + 12, d + 12);
      plants.push({ c, w, d, a });
      make(f);
      n++;
    }
  // Chimney pairs (and a three) standing over the factory blocks between the plants.
  for (let n = 0, t = 0; n < cfg.chimneys && t < cfg.chimneys * 300; t++) {
    const c: P = [cx + between(r, -R, R), cy + between(r, -R, R)];
    const f = frame(c, a0);
    if (toEdge(...c) < 40 || !room(f, 30, 10, 4)) continue;
    claim(f, 30, 10);
    chimneys(f, -6, 0, r() < 0.2 ? 3 : 2, cfg.chimney * between(r, 0.75, 1));
    n++;
  }
  // Pipe racks across the zone between the plants: long runs on trestles, three pipes high.
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i]!;
    const q = plants.filter((o) => o !== p).sort((a, b) => Math.hypot(a.c[0] - p.c[0], a.c[1] - p.c[1]) - Math.hypot(b.c[0] - p.c[0], b.c[1] - p.c[1]))[0];
    if (!q || Math.hypot(q.c[0] - p.c[0], q.c[1] - p.c[1]) > cfg.rackReach) continue;
    const dx = q.c[0] - p.c[0], dy = q.c[1] - p.c[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const s = Math.max(p.w, p.d) / 2, e = L - Math.max(q.w, q.d) / 2;
    if (e - s < 20) continue;
    const f = frame(p.c, ang);
    for (let k = 0; k < 3; k++) {
      const [x, y] = f.at((s + e) / 2, (k - 1) * 1.6);
      out.strips.push({ x, y, w: e - s, d: 1.1, h: 1.1, z0: 9 + (k % 2) * 1.4, a: ang, material: 'pipe' });
    }
    for (let u = s + 4; u < e; u += 18) {
      const [x, y] = f.at(u, 0);
      out.props.push({ kind: 'lattice', x, y, z0: 0, w: 0.8, d: 3.6, h: 9, a: ang });
    }
  }
  // Freight rail in from Dockside: the branch off its trunk carries on into the district as a main
  // line toward the middle, to the far side; a spur square off it to each plant; ore trains on the line and sidings;
  // steady signals. Track as Dockside's: a gravel bed and two faintly glinting rails.
  const track = (a: P, b: P) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    if (L < 4) return;
    const nx = -dy / L, ny = dx / L, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    out.strips.push({ x: mx, y: my, w: L, d: 4.4, h: 0.25, z0: 0, a: ang, material: 'concrete' });
    for (const side of [-1, 1]) out.strips.push({ x: mx + nx * side * 1.2, y: my + ny * side * 1.2, w: L, d: 0.3, h: 0.3, z0: 0.25, a: ang, material: 'street-light', color: RAIL });
    for (let t = 0; t <= L; t += CELL / 2) railCells.add(key(a[0] + (dx * t) / L, a[1] + (dy * t) / L));
  };
  // Track's own cells, apart from `taken` while the railway is laid so lines can meet and cross.
  const railCells = new Set<string>();
  const clear = (x: number, y: number) => inside(x, y) && solid(x, y) && !taken.has(key(x, y)) && blocked(x, y) > 3;
  // An ore train: a locomotive and dark hopper wagons heaped with ore.
  const oreTrain = (a: P, b: P, cars: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), tx = dx / L, ty = dy / L;
    out.buildings.push({ x: a[0] + tx * 9, y: a[1] + ty * 9, w: 14, d: 3.2, h: 3.6, z0: 0.4, a: ang, tint: '#ffd9a0', lit: 0.3, brick: 0, seed: r(), district, kind: 'car' });
    out.props.push({ kind: 'lamp', x: a[0] + tx * 1.8, y: a[1] + ty * 1.8, z0: 2.4, w: 0.6, d: 0.6, h: 0.6, a: 0, color: '#fff1d6' });
    for (let k = 0, t = 18; k < cars && t + 8 < L; k++, t += 7.6) {
      out.buildings.push({ x: a[0] + tx * (t + 3.4), y: a[1] + ty * (t + 3.4), w: 7, d: 3, h: 2.8, z0: 0.4, a: ang, tint: SODIUM, lit: 0, brick: 0, seed: r(), district, kind: 'car' });
      out.props.push({ kind: 'rubble', x: a[0] + tx * (t + 3.4), y: a[1] + ty * (t + 3.4), z0: 3.2, w: 5.6, d: 2.2, h: 0.8, a: ang });
    }
  };
  if (railFrom) {
    const [J, E] = railFrom;
    const dx = E[0] - J[0], dy = E[1] - J[1], L0 = Math.hypot(dx, dy), tx = dx / L0, ty = dy / L0;
    // From where it crosses the border, on along its line through the district while the ground is clear.
    // (The branch ends at its own district's border; the strip of ground between the two is crossed first.)
    let end: P = E, entered = false;
    for (let t = 4; t < 2 * R; t += 4) {
      const x = E[0] + tx * t, y = E[1] + ty * t;
      if (!entered && !inside(x, y) && t < 80 && solid(x, y)) {
        end = [x, y];
        continue;
      }
      entered = true;
      if (!clear(x, y)) break;
      end = [x, y];
    }
    if (Math.hypot(end[0] - E[0], end[1] - E[1]) > 60) {
      track(E, end);
      const nx = -ty, ny = tx;
      for (let t = 60; t < Math.hypot(end[0] - E[0], end[1] - E[1]) - 20; t += 150) {
        const x = E[0] + tx * t + nx * 4, y = E[1] + ty * t + ny * 4;
        out.props.push({ kind: 'mast', x, y, z0: 0, w: 0.4, d: 0.4, h: 4, a: 0 });
        out.props.push({ kind: 'lamp', x, y, z0: 4, w: 0.6, d: 0.6, h: 0.6, a: 0, color: r() < 0.5 ? RED : '#3bff8a' });
      }
      // Spurs: from the main line square to each plant's near side; a train on some.
      for (const p of plants) {
        const along = (p.c[0] - E[0]) * tx + (p.c[1] - E[1]) * ty, side = (p.c[0] - E[0]) * nx + (p.c[1] - E[1]) * ny;
        const lenMain = Math.hypot(end[0] - E[0], end[1] - E[1]);
        if (along < 10 || along > lenMain - 10) continue;
        const s0: P = [E[0] + tx * along + nx * Math.sign(side) * 3, E[1] + ty * along + ny * Math.sign(side) * 3];
        // Up to the plant's claimed ground, not into it.
        const reach = Math.abs(side) - Math.max(p.w, p.d) / 2 - 10;
        if (reach < 8) continue;
        const s1: P = [s0[0] + nx * Math.sign(side) * reach, s0[1] + ny * Math.sign(side) * reach];
        let ok = true;
        for (let t = 6; t < reach - 6 && ok; t += 4) if (!clear(s0[0] + nx * Math.sign(side) * t, s0[1] + ny * Math.sign(side) * t)) ok = false;
        if (!ok) continue;
        track(s0, s1);
        // A siding alongside the plant, an ore train waiting on it.
        const g0: P = [s1[0] - tx * 40, s1[1] - ty * 40], g1: P = [s1[0] + tx * 40, s1[1] + ty * 40];
        let gok = true;
        for (let t = 0; t <= 80 && gok; t += 4) if (!inside(g0[0] + tx * t, g0[1] + ty * t)) gok = false;
        if (gok) {
          track(g0, g1);
          if (r() < 0.7) oreTrain(g0, g1, 9);
        }
      }
      // An ore train on the main line.
      oreTrain(E, end, Math.min(18, Math.floor(Math.hypot(end[0] - E[0], end[1] - E[1]) / 7.6) - 4));
    }
  }

  // The interchange (the rail travels between the two): parallel tracks along the border shared with
  // the blend neighbour, the longest clear run of each, trains standing on them — ore for the works, containers for the
  // port.
  const containerTrain = (a: P, b: P, cars: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), tx = dx / L, ty = dy / L;
    out.buildings.push({ x: a[0] + tx * 9, y: a[1] + ty * 9, w: 14, d: 3.2, h: 3.6, z0: 0.4, a: ang, tint: '#ffd9a0', lit: 0.3, brick: 0, seed: r(), district, kind: 'car' });
    out.props.push({ kind: 'lamp', x: a[0] + tx * 1.8, y: a[1] + ty * 1.8, z0: 2.4, w: 0.6, d: 0.6, h: 0.6, a: 0, color: '#fff1d6' });
    for (let k = 0, t = 18; k < cars && t + 9 < L; k++, t += 9) {
      const x = a[0] + tx * (t + 4.3), y = a[1] + ty * (t + 4.3);
      out.strips.push({ x, y, w: 8.4, d: 2.8, h: 0.5, z0: 0.4, a: ang, material: 'girder' });
      if (r() < 0.85) out.props.push({ kind: 'container', x, y, z0: 0.9, w: 7.6, d: 2.4, h: 2, a: ang, color: blend!.containers[Math.floor(r() * blend!.containers.length)]! });
    }
  };
  if (blend && shared.length) {
    const [p, q] = shared.reduce((m, e) => (Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]) > Math.hypot(m[1][0] - m[0][0], m[1][1] - m[0][1]) ? e : m));
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), tx = (q[0] - p[0]) / L, ty = (q[1] - p[1]) / L;
    let nx = -ty, ny = tx;
    if (!inside(p[0] + tx * L * 0.5 + nx * 20, p[1] + ty * L * 0.5 + ny * 20)) [nx, ny] = [-nx, -ny];
    const free = (x: number, y: number) => inside(x, y) && solid(x, y) && !taken.has(key(x, y)) && blocked(x, y) > 3;
    let laid = 0;
    for (let k = 0; k < cfg.interchange.tracks; k++) {
      const v = cfg.interchange.offset + k * 6;
      let best: [number, number] = [0, 0], start: number | null = null;
      for (let t = 0; t <= L; t += 4) {
        const ok = free(p[0] + tx * t + nx * v, p[1] + ty * t + ny * v) && t < L;
        if (ok && start === null) start = t;
        if (!ok && start !== null) {
          if (t - start > best[1] - best[0]) best = [start, t - 4];
          start = null;
        }
      }
      if (best[1] - best[0] < 120) continue;
      const a: P = [p[0] + tx * best[0] + nx * v, p[1] + ty * best[0] + ny * v], b: P = [p[0] + tx * best[1] + nx * v, p[1] + ty * best[1] + ny * v];
      track(a, b);
      const cars = Math.floor((best[1] - best[0] - 30) / 9);
      // Trains alternate by track laid, containers first, so both kinds stand at the interchange.
      if (r() < cfg.interchange.trains || laid < 2) (laid % 2 ? oreTrain : containerTrain)(a, b, Math.max(4, Math.floor(cars * between(r, 0.5, 0.9))));
      laid++;
    }
    // Gantry cranes spanning the interchange, lifting containers between the port's trains and the works'.
    {
      const gf = { a: Math.atan2(ty, tx), s: 1, at: (u: number, v: number): P => [p[0] + tx * u + nx * v, p[1] + ty * u + ny * v] };
      const v0 = cfg.interchange.offset, v1 = cfg.interchange.offset + (cfg.interchange.tracks - 1) * 6;
      for (let u = 60 + between(r, 0, 40); u < L - 40; u += 130 * between(r, 0.8, 1.2)) {
        const lo = v0 - 5, hi = v1 + 5, h = 18;
        for (const du of [-3, 3]) for (const v of [lo, hi]) {
          const [x, y] = gf.at(u + du, v);
          out.strips.push({ x, y, w: 1.1, d: 1.1, h, z0: 0, a: gf.a, material: 'crane' });
        }
        for (const du of [-1.6, 1.6]) {
          const [x, y] = gf.at(u + du, (lo + hi) / 2);
          out.strips.push({ x, y, w: 1, d: hi - lo + 1, h: 1.4, z0: h, a: gf.a, material: 'crane' });
        }
        const [gx, gy] = gf.at(u, lo + (hi - lo) * between(r, 0.2, 0.8));
        out.strips.push({ x: gx, y: gy, w: 4.6, d: 3.4, h: 2.4, z0: h - 1, a: gf.a, material: 'crane' });
        out.props.push({ kind: 'lamp', x: gx, y: gy, z0: h - 1.4, w: 1.2, d: 1.2, h: 0.6, a: 0, color: '#ffe2b0' });
      }
    }
    // Floodlights over the interchange.
    for (let t = 30; t < L; t += 90) {
      const v = cfg.interchange.offset + cfg.interchange.tracks * 6 + 4, x = p[0] + tx * t + nx * v, y = p[1] + ty * t + ny * v;
      if (!free(x, y)) continue;
      out.props.push({ kind: 'lattice', x, y, z0: 0, w: 0.9, d: 0.9, h: 22, a: 0 });
      out.props.push({ kind: 'lamp', x, y, z0: 22, w: 2.6, d: 1.2, h: 0.9, a: Math.atan2(ty, tx), color: '#ffd9a0' });
      out.lights.push({ x, y, z: 22, color: SODIUM, power: 60000, radius: 3, reach: 70 });
    }
  }
  for (const c of railCells) taken.add(c);
  // The works spill over into the blend neighbour's free ground near the shared border, and near it on both sides
  // they take its look: container yards in its colours and long warehouses.
  if (blend) zone = (x, y) => inside(x, y) || (inNb(x, y) && toShared(x, y) < cfg.blendReach && blend.taken(x, y) > 6);

  // The works between the plants (the painting's Iron Reach is industry end to end): a grid of slots squared to the
  // district with sodium-lit streets between; each slot a factory hall with lit clerestories down its roof, a tank
  // cluster, a floodlit yard of sheds and stacked crates, a hall with its own chimney, or a scrap lot. Its own random
  // stream, so the plants don't move when the grid changes.
  const G = cfg.grid;
  const gr = rng(`industry-grid:${district}`);
  r = gr;
  const pu = G.slot[0] + G.street, pv = G.slot[1] + G.street;
  const ca = Math.cos(a0), sa = Math.sin(a0);
  const open = (x: number, y: number) => zone(x, y) && solid(x, y) && !taken.has(key(x, y)) && blocked(x, y) > 2;
  let piece = 0;
  for (let i = -Math.ceil(R / pu) - 1; i <= Math.ceil(R / pu) + 1; i++)
    for (let j = -Math.ceil(R / pv) - 1; j <= Math.ceil(R / pv) + 1; j++) {
      const c: P = [cx + i * pu * ca - j * pv * sa, cy + i * pu * sa + j * pv * ca];
      const f = frame(c, a0);
      const roll = Array.from({ length: 12 }, gr);
      // Streets along the slot's two near sides, a lamp every few pieces, a pool of light at some crossings.
      for (const [su, sv, len, along] of [[0, -pv / 2, pu, 0], [-pu / 2, 0, pv, Math.PI / 2]] as const) {
        const e = along ? [f.at(su, -len / 2), f.at(su, len / 2)] : [f.at(-len / 2, sv), f.at(len / 2, sv)];
        if (!e.every(([x, y]) => open(x, y)) || !open(...f.at(su, sv))) continue;
        const [x, y] = f.at(su, sv);
        out.strips.push({ x, y, w: len + 0.5, d: G.street - 2, h: 0.2, z0: 0.06, a: a0 + along, material: 'street' });
        if (++piece % G.lampEvery === 0) {
          const [lx, ly] = along ? f.at(su + G.street / 2 - 1, 0) : f.at(0, sv + G.street / 2 - 1);
          out.props.push({ kind: 'lamp', x: lx, y: ly, z0: 3.4, w: 0.6, d: 0.6, h: 0.4, a: 0, color: SODIUM });
        }
      }
      if (roll[0]! < G.lights) {
        const [x, y] = f.at(-pu / 2, -pv / 2);
        // A small soft size, so the wet ground reflects a pinpoint, not a blob.
        if (open(x, y)) out.lights.push({ x, y, z: 30, color: SODIUM, power: 50000, radius: 0.6, reach: 120 });
      }
      // A whole slot, or failing that each half on its own (the ground between plants is rarely a clean rectangle).
      const parts: [F, number, number][] = [];
      if (room(f, G.slot[0], G.slot[1], 1)) parts.push([f, G.slot[0], G.slot[1]]);
      else
        for (const hu of [-G.slot[0] / 4, G.slot[0] / 4]) {
          const fh = frame(f.at(hu, 0), a0);
          if (room(fh, G.slot[0] / 2 - 2, G.slot[1], 1)) parts.push([fh, G.slot[0] / 2 - 2, G.slot[1]]);
        }
      for (const [f, W, D] of parts) {
      claim(f, W, D);
      const k = parts.length === 1 && W === G.slot[0] ? roll[1]! : gr();
      const [fx0, fy0] = f.at(0, 0);
      const near = blend ? toShared(fx0, fy0) < cfg.blendReach : false;
      // Toward Cloudridge and Helios the works give way to their blocks: brick and tower blocks, windows in their
      // colours, more of them and taller the nearer the line.
      const eb = edgeDist(fx0, fy0);
      if (eb && eb.d < (cfg.edgeReach ?? 0) && gr() < 1 - eb.d / cfg.edgeReach!) {
        const k2 = 1 - eb.d / cfg.edgeReach!;
        for (const [du, dv] of [[-W / 4, -D / 4], [W / 4, -D / 4], [-W / 4, D / 4], [W / 4, D / 4]] as P[]) {
          if (gr() < 0.12) continue;
          const h = between(gr, eb.e.height[0], eb.e.height[1]) * (0.5 + 0.5 * k2);
          box(f, du, dv, W / 2 - 3, D / 2 - 3, h, 0, { lit: 0.5, tint: pick(gr, [...eb.e.colors, '#ffb060']), brick: gr() < 0.6 * (1 - k2) + 0.2 ? 1 : 0 });
        }
        continue;
      }
      if (near && gr() < (inside(fx0, fy0) ? 0.45 : 0.75)) {
        if (gr() < 0.6) {
          // A container yard in the port's colours: rows of stacks, a floodlight.
          for (let u = -W / 2 + 4.5; u < W / 2 - 4; u += 8.2)
            for (let v = -D / 2 + 2; v < D / 2 - 2; v += 2.7) {
              if (gr() < 0.1) continue;
              const [x, y] = f.at(u, v);
              const tiers = 1 + Math.floor(gr() * 3);
              for (let z = 0; z < tiers; z++) out.props.push({ kind: 'container', x, y, z0: z * 2.1, w: 7.6, d: 2.4, h: 2, a: a0, color: blend!.containers[Math.floor(gr() * blend!.containers.length)]! });
            }
          lattice(f, 0, -D / 2 - 2, 24);
          lamp(f, 0, -D / 2 - 2, 24, '#ffe2b0', 0.8);
          light(f, 0, 0, 24, '#ffe2b0', 50000, 60);
        } else {
          // A long warehouse with its loading doors lit.
          const w = W * 0.94, d = D * 0.6, h = 7 + gr() * 3;
          box(f, 0, 0, w, d, h, 0, { lit: 0.18, brick: gr() < 0.4 ? 1 : 0 });
          for (let u = -w / 2 + 6; u < w / 2 - 4; u += 9) {
            const [x, y] = f.at(u, -d / 2 - 0.3);
            out.props.push({ kind: 'shopfront', x, y, z0: 0, w: 4, d: 0.4, h: 3.2, a: a0, color: SODIUM });
          }
        }
      } else if (k < 0.45) {
        // A factory hall: lit clerestories down a sawtooth roof, doors lit along its front.
        const h = 9 + roll[2]! * 8, w = W * 0.92, d = D * 0.82;
        box(f, 0, 0, w, d, h, 0, { lit: 0.3, tint: '#ffc27a', brick: roll[3]! < 0.5 ? 1 : 0 });
        const n = 2 + Math.floor(roll[4]! * 3);
        for (let q = 0; q < n; q++) glow(f, 0, -d / 2 + ((q + 0.5) * d) / n, w * 0.9, 0.6, 0.5, h, '#ff9a4a');
        for (let u = -w / 2 + 6; u < w / 2 - 4; u += 10 + roll[5]! * 8) {
          const [x, y] = f.at(u, -d / 2 - 0.3);
          out.props.push({ kind: 'shopfront', x, y, z0: 0, w: 4, d: 0.4, h: 3.6, a: a0, color: SODIUM });
        }
      } else if (k < 0.6) {
        // A tank cluster with a floodlight.
        const n = 3 + Math.floor(roll[2]! * 3);
        for (let q = 0; q < n; q++) {
          const u = -W / 2 + 10 + ((q % 3) * (W - 20)) / 2, v = q < 3 ? -D / 4 : D / 4, w = 8 + gr() * 7, h = 7 + gr() * 10;
          tank(f, u, v, w, h);
          lamp(f, u, v, h + 0.2, roll[3]! < 0.3 ? cfg.cyan : SODIUM, 0.9);
        }
        lattice(f, W / 2 - 4, D / 2 - 4, 20);
        lamp(f, W / 2 - 4, D / 2 - 4, 20, '#ffd9a0', 0.8);
        light(f, 0, 0, 20, roll[3]! < 0.3 ? cfg.cyan : SODIUM, 50000, 55);
      } else if (k < 0.85) {
        // A yard: two sheds, crates stacked between, a floodlight mast lighting it.
        box(f, -W / 4, D / 4, W * 0.4, D * 0.4, 7 + roll[2]! * 4, 0, { lit: 0.2, brick: 1 });
        box(f, W / 4, D / 4, W * 0.36, D * 0.36, 6 + roll[3]! * 4, 0, { lit: 0.2 });
        for (let q = 0; q < 10; q++) {
          if (gr() < 0.25) continue;
          const [x, y] = f.at(-W / 2 + 8 + (q % 5) * 9, -D / 2 + 6 + Math.floor(q / 5) * 5);
          const tiers = 1 + Math.floor(gr() * 3);
          for (let z = 0; z < tiers; z++) out.props.push({ kind: 'container', x, y, z0: z * 2.1, w: 7.6, d: 2.4, h: 2, a: a0, color: cfg.crates[Math.floor(gr() * cfg.crates.length)]! });
        }
        lattice(f, 0, -D / 2 + 2, 22);
        lamp(f, 0, -D / 2 + 2, 22, '#ffd9a0', 0.8);
        light(f, 0, -D / 4, 22, SODIUM, 60000, 60);
      } else if (k < 0.95) {
        // A hall with its own chimney.
        const h = 10 + roll[2]! * 6;
        box(f, -W / 8, 0, W * 0.7, D * 0.8, h, 0, { lit: 0.3, tint: '#ffc27a', brick: 1 });
        glow(f, -W / 8, 0, W * 0.62, 0.6, 0.5, h, '#ff9a4a');
        chimneys(f, W / 2 - 8, 0, 1, cfg.chimney * (0.55 + roll[3]! * 0.3));
      } else {
        // A scrap lot: heaps and a dim lamp.
        for (let q = 0; q < 6; q++) {
          const [x, y] = f.at((gr() - 0.5) * W * 0.8, (gr() - 0.5) * D * 0.8);
          out.props.push({ kind: 'rubble', x, y, z0: 0, w: 4 + gr() * 6, d: 3 + gr() * 5, h: 1 + gr() * 3, a: gr() * 3 });
        }
        lamp(f, 0, 0, 3, '#ff9a4a', 1);
      }
      // A floodlight over most slots, so the works' steel catches light as the port's yards do.
      if (gr() < G.lights) {
        const [x, y] = f.at(0, 0);
        out.lights.push({ x, y, z: 30, color: SODIUM, power: 45000, radius: 0.6, reach: 120 });
      }
      }
    }

  // Pines along the wooded west edge, thick by the map's edge and thinning inland, as painted.
  // Their own stream and their own count (the derrick's forest is apart).
  r = rng(`industry-pines:${district}`);
  for (let t = 0, placed = 0; t < cfg.pines.count * 15 && placed < cfg.pines.count; t++) {
    const x = between(r, 0, cfg.pines.depth), y = cy + between(r, -R, R);
    if (!inside(x, y) || !solid(x, y) || blocked(x, y) < 4 || taken.has(key(x, y))) continue;
    if (r() > 1 - x / cfg.pines.depth * 0.8) continue;
    const h = between(r, 7, 14);
    out.props.push({ kind: 'pine', x, y, z0: 0, w: h * 0.45, d: h * 0.45, h, a: 0 });
    taken.add(key(x, y));
    placed++;
  }

  out.distance = (x, y) => {
    const c0 = Math.floor(x / CELL), c1 = Math.floor(y / CELL);
    let best = 5 * CELL;
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) if (taken.has(`${c0 + i}:${c1 + j}`)) best = Math.min(best, Math.max(0, Math.hypot(i, j) - 1) * CELL - 4);
    return best;
  };
  return out;
}
