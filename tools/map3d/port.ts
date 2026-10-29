// Dockside (2026-10-27): the freight port, as the painting has it. Straight concrete quays along the coast with ships
// berthed at them under red gantry cranes, a container yard behind each quay (stacks in every colour, lanes between,
// floodlight masts), sheds with lit loading doors behind that; wide container piers out into open water with ships both
// sides; ships at anchor and tugs out in the bay; a few tall brick chimneys inland. Everything else inland is the
// district's own blocks, kept off the port by `distance`.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Light, Prop, Strip } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];
type Port = NonNullable<DistrictStyle['port']>;
export interface PortGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  lights: Light[];
  /** From a point to the nearest piece of port on land (map px; negative inside): blocks keep off it. */
  distance: (x: number, y: number) => number;
  /** Each ship's footprint (centre, length, beam, angle), for tests. */
  ships: { x: number; y: number; l: number; b: number; a: number }[];
  /** The railway's trunk line, end to end (null if none fits): neighbours' lines join it (Iron Reach's). */
  rail: [P, P] | null;
  /** A branch off the trunk toward `rail.branchTo`, from its junction to where it leaves the district (null if none). */
  branch: [P, P] | null;
  /** The truck road out of the port toward `road.toward`, from its start to where it leaves the district. */
  road: [P, P] | null;
}

const FLOOD = '#ffe2b0';
const SODIUM = '#ffb060';
const RAIL = '#7a5a3c';
const CELL = 8;
/** A pier deck's top (z0 −0.6, 1.6 thick): what stands on a pier stands here. */
const PIER_DECK = 1;

/** A frame on the ground: `u` along `t`, `v` along `n` (inland on a quay). */
type Frame = { at: (u: number, v: number) => P; a: number; t: P; n: P };
const frame = (o: P, t: P, n: P): Frame => ({ at: (u, v) => [o[0] + t[0] * u + n[0] * v, o[1] + t[1] * u + n[1] * v], a: Math.atan2(t[1], t[0]), t, n });

/** `solid`: whether a point is ground (any land, an isle). `blocked`: the distance to a structure, raised highway or road. */
export function portGeometry(district: string, cfg: Port, border: Anchor[], coast: [P, P][], solid: (x: number, y: number) => boolean, blocked: (x: number, y: number) => number = () => Infinity): PortGeometry {
  const r = rng(`port:${district}`);
  const out: PortGeometry = { buildings: [], props: [], strips: [], lights: [], distance: () => Infinity, ships: [], rail: null, branch: null, road: null };
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const pts = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
  // What the port takes on land, on a grid of 8 px cells: blocks keep off it.
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
  const mark = (f: Frame, u0: number, u1: number, v0: number, v1: number) => {
    for (let u = u0; u <= u1; u += CELL / 2) for (let v = v0; v <= v1; v += CELL / 2) taken.add(key(...f.at(u, v)));
  };
  // Ships so far, as their four corners: no two overlap.
  const hulls: P[][] = [];
  const overlaps = (c: P[]) => hulls.some((h) => sepFails(h, c));
  const water = (x: number, y: number) => !solid(x, y);

  // A ship: hull, a narrower bow, containers stacked on deck in rows, the bridge and funnel at the stern, steady
  // navigation lights (red to port, green to starboard, white on the mast).
  const ship = (cx: number, cy: number, l: number, b: number, a: number, loaded = 0.85) => {
    const t: P = [Math.cos(a), Math.sin(a)], n: P = [-t[1], t[0]];
    const f = frame([cx, cy], t, n);
    out.ships.push({ x: cx, y: cy, l, b, a });
    const lamp = (u: number, v: number, z: number, color: string) => {
      const [x, y] = f.at(u, v);
      out.props.push({ kind: 'lamp', x, y, z0: z, w: 0.7, d: 0.7, h: 0.6, a: 0, color });
    };
    const hull = (u: number, w: number, d: number, h: number, z0: number) => {
      const [x, y] = f.at(u, 0);
      out.buildings.push({ x, y, w, d, h, z0, a, tint: SODIUM, lit: 0, brick: 0, seed: r(), district, kind: 'car' });
    };
    hull(-l * 0.04, l * 0.92, b, 4, -1.4);
    hull(l * 0.44, l * 0.08, b * 0.62, 4, -1.4);
    // The bridge at the stern, lit, with its funnel behind.
    const bu = -l / 2 + 7;
    const [bx, by] = f.at(bu, 0);
    out.buildings.push({ x: bx, y: by, w: 6, d: b - 2, h: 9, z0: 2.6, a, tint: '#ffd9a0', lit: 0.7, brick: 0, seed: r(), district, kind: 'shack' });
    const [fx, fy] = f.at(bu - 4.5, 0);
    out.buildings.push({ x: fx, y: fy, w: 2.6, d: 3, h: 6, z0: 2.6, a, tint: SODIUM, lit: 0, brick: 0, seed: r(), district, kind: 'car' });
    // Containers on deck: rows across the beam, bays along the hull from the bridge to the bow.
    const rows = Math.max(2, Math.floor((b - 2) / 2.6));
    for (let u = bu + 6; u < l / 2 - 8; u += 8.2) {
      if (r() > loaded) continue;
      const tiers = Math.round(between(r, 1, 3.4));
      for (let k = 0; k < rows; k++) {
        const v = -((rows - 1) * 2.6) / 2 + k * 2.6;
        const [x, y] = f.at(u, v);
        for (let z = 0; z < tiers; z++) out.props.push({ kind: 'container', x, y, z0: 2.6 + z * 2.1, w: 7.6, d: 2.4, h: 2, a, color: pick(r, cfg.containers) });
      }
    }
    // A faint lit rail round the deck and lamps along it, so the hull reads against the black water.
    for (const side of [-1, 1]) {
      const [rx, ry] = f.at(-l * 0.04, side * (b / 2 - 0.3));
      out.strips.push({ x: rx, y: ry, w: l * 0.92, d: 0.3, h: 0.12, z0: 2.7, a, material: 'street-light', color: SODIUM });
      for (let u = -l / 2 + 4; u < l / 2 - 6; u += 12) lamp(u, side * (b / 2 - 0.5), 3.2, '#ffc27a');
    }
    lamp(bu, -b / 2 + 0.6, 10.5, '#ff3b3b');
    lamp(bu, b / 2 - 0.6, 10.5, '#3bff8a');
    lamp(bu + 1, 0, 12.2, '#fff1d6');
    lamp(l / 2 - 2, 0, 3, '#fff1d6');
  };
  const corners = (cx: number, cy: number, l: number, b: number, a: number, m = 0): P[] => {
    const c = Math.cos(a), s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + i! * (l / 2 + m) * c - j! * (b / 2 + m) * s, cy + i! * (l / 2 + m) * s + j! * (b / 2 + m) * c]);
  };
  // Open water under the whole hull and a little round it, and no other ship there.
  const fits = (cx: number, cy: number, l: number, b: number, a: number, m: number) => {
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = -1; i <= 1; i += 0.25)
      for (let j = -1; j <= 1; j += 0.5) {
        const u = i * (l / 2 + m), v = j * (b / 2 + m);
        if (!water(cx + u * c - v * s, cy + u * s + v * c)) return false;
      }
    return !overlaps(corners(cx, cy, l, b, a, 3));
  };

  // A gantry crane at `u` on a berth, its legs on the quay (v 2 to 16) and its boom out over the water (v < 0): legs,
  // portal beams, the boom with its machinery house, the A-frame and its ties. Some stand with the boom raised.
  const crane = (f: Frame, u: number, raised: boolean) => {
    const H = cfg.cranes.height, R = cfg.cranes.reach;
    const strip = (uc: number, vc: number, w: number, d: number, h: number, z0: number, along: 'u' | 'v') => {
      const [x, y] = f.at(uc, vc);
      out.strips.push({ x, y, w, d, h, z0, a: along === 'u' ? f.a : f.a + Math.PI / 2, material: 'crane' });
    };
    const tie = (u0: number, v0: number, z0: number, u1: number, v1: number, z1: number, d = 0.7) => {
      const [x0, y0] = f.at(u0, v0), [x1, y1] = f.at(u1, v1);
      out.strips.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: 0, d, h: d, z0: 0, a: 0, material: 'crane', ends: [[x0, y0, z0], [x1, y1, z1]] });
    };
    for (const du of [-5, 5]) {
      for (const v of [2, 16]) strip(u + du, v, 1.3, 1.3, H, 0, 'u');
      // A portal beam joining each side's legs at the top, and a sill beam low down.
      strip(u + du, 9, 15.3, 1.1, 1.2, H - 1.2, 'v');
      strip(u + du, 9, 15.3, 0.8, 0.8, 4, 'v');
    }
    for (const v of [2, 16]) strip(u, v, 11.3, 1, 1, H - 5, 'u');
    if (raised) {
      // Boom raised (idle): it stands up steeply from the waterside legs.
      tie(u - 1.6, 2, H, u - 1.6, -R * 0.28, H + R * 0.92, 1.2);
      tie(u + 1.6, 2, H, u + 1.6, -R * 0.28, H + R * 0.92, 1.2);
    } else {
      // The boom out over the ship, the backreach over the yard.
      strip(u - 1.6, (22 - R) / 2, R + 22, 1.2, 1.6, H, 'v');
      strip(u + 1.6, (22 - R) / 2, R + 22, 1.2, 1.6, H, 'v');
      // Its trolley lamp, lit down on the hatch.
      const [lx, ly] = f.at(u, -R * 0.5);
      out.props.push({ kind: 'lamp', x: lx, y: ly, z0: H - 1, w: 1.4, d: 1.4, h: 0.8, a: f.a, color: FLOOD });
    }
    // The machinery house on the backreach.
    strip(u, 17, 6, 5, 3, H + 1.6, 'u');
    // The A-frame: two posts up from the boom, ties down to the boom's tip and to the backreach.
    const top = H + H * 0.4;
    for (const du of [-2.5, 2.5]) tie(u + du, 9, H, u + du * 0.4, 10, top);
    if (!raised) tie(u, 10, top, u, -R, H + 1.6, 0.5);
    tie(u, 10, top, u, 22, H + 1.6, 0.5);
    // A steady red lamp on the apex.
    const [ax, ay] = f.at(u, 10);
    out.props.push({ kind: 'lamp', x: ax, y: ay, z0: top + 0.4, w: 0.8, d: 0.8, h: 0.6, a: 0, color: '#ff3b3b' });
  };

  // A berth from u0 to u1 of a frame (water at v < 0): ships along it with gaps, two to four cranes over each, a crane
  // or two idle between; trucks on the apron. Returns whether any ship berthed.
  // `deck`: the height of the ground it stands on (a pier's deck is 1 up).
  const berth = (f: Frame, u0: number, u1: number, deck = 0) => {
    let u = u0 + between(r, 4, 20), any = false;
    while (u < u1) {
      const l = between(r, cfg.ships.length[0], cfg.ships.length[1]), b = between(r, cfg.ships.beam[0], cfg.ships.beam[1]);
      if (u + l > u1) break;
      const [cx, cy] = f.at(u + l / 2, -(b / 2 + 2.5));
      const a = f.a + (r() < 0.5 ? 0 : Math.PI);
      // The land grid runs a few px past the quay's line, so the open-water check looks a little further out.
      const [ox, oy] = f.at(u + l / 2, -(b / 2 + 7.5));
      if (fits(ox, oy, l, b, a, 1) && blocked(cx, cy) > b) {
        hulls.push(corners(cx, cy, l, b, a, 3));
        ship(cx, cy, l, b, a);
        any = true;
        const n = Math.max(1, Math.min(4, Math.round(l / cfg.cranes.every)));
        for (let k = 0; k < n; k++) crane(f, u + (l * (k + 0.5)) / n + between(r, -3, 3), false);
        // The cranes' floodlights on the deck: the containers being worked show their colours.
        out.lights.push({ x: cx, y: cy, z: cfg.cranes.height, color: FLOOD, power: 45000, radius: 2, reach: 70 });
      } else if (r() < 0.5) crane(f, u + l / 2, true);
      u += l + between(r, cfg.ships.gap[0], cfg.ships.gap[1]);
    }
    // Yard trucks on the apron.
    for (let t = u0 + 10; t < u1 - 10; t += between(r, 18, 40)) {
      const [x, y] = f.at(t, between(r, 6, cfg.quay - 4));
      out.buildings.push({ x, y, w: 4.5, d: 2, h: 2, z0: deck, a: f.a, tint: SODIUM, lit: 0, brick: 0, seed: r(), district, kind: 'car' });
      out.props.push({ kind: 'lamp', x, y, z0: deck + 2, w: 0.5, d: 0.5, h: 0.4, a: 0, color: '#fff1d6' });
    }
    return any;
  };

  // A container yard over u0..u1, v0..v1 of a frame: blocks of stacks (containers lying along u) with lanes between,
  // floodlight masts along the lanes. `own`: whether a point may hold a stack (on the district's land, or on a pier).
  const yard = (f: Frame, u0: number, u1: number, v0: number, v1: number, own: (x: number, y: number) => boolean, deck = 0) => {
    const LANE_U = 6, LANE_V = 7, SU = 8.2, SV = 2.7;
    let v = v0;
    while (v < v1 - 6) {
      const rows = Math.min(Math.floor((v1 - v) / SV), Math.round(between(r, 5, 7)));
      if (rows < 3) break;
      let u = u0 + between(r, 0, 6);
      while (u < u1 - SU) {
        const cols = Math.min(Math.floor((u1 - u) / SU), Math.round(between(r, 4, 7)));
        if (cols < 2) break;
        const mean = between(r, cfg.tiers[0], cfg.tiers[1]);
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++) {
            const roll = r(), tiers = Math.max(0, Math.round(mean + between(r, -1.2, 1.2))), c0 = r();
            if (roll < 0.07 || tiers === 0) continue;
            const [x, y] = f.at(u + SU * (i + 0.5), v + SV * (j + 0.5));
            if (!own(x, y) || blocked(x, y) < 5) continue;
            for (let z = 0; z < tiers; z++) out.props.push({ kind: 'container', x, y, z0: deck + z * 2.1, w: 7.6, d: 2.4, h: 2, a: f.a, color: cfg.containers[Math.floor(((c0 + z * 0.37) % 1) * cfg.containers.length)]! });
          }
        u += cols * SU + LANE_U;
      }
      v += rows * SV + LANE_V;
    }
    // Floodlight masts in rows across the yard, its front row on the lane before it.
    const rowsV: number[] = [];
    for (let vm = v0 - 3; vm < v1 - 10; vm += cfg.masts * 0.9) rowsV.push(vm);
    if (rowsV.length === 1) rowsV.push((v0 + v1) / 2);
    for (let u = u0 + cfg.masts / 2; u < u1; u += cfg.masts * between(r, 0.85, 1.15))
      for (const vm of rowsV) {
        const [x, y] = f.at(u, vm);
        if (!own(x, y) || blocked(x, y) < 5) continue;
        const h = between(r, 22, 28);
        out.props.push({ kind: 'lattice', x, y, z0: deck, w: 0.9, d: 0.9, h, a: 0 });
        out.props.push({ kind: 'lamp', x, y, z0: deck + h, w: 2.6, d: 1.2, h: 0.9, a: f.a, color: FLOOD });
        out.lights.push({ x, y, z: deck + h, color: FLOOD, power: 50000, radius: 2, reach: 70 });
      }
  };

  // Sheds behind a yard: long low halls, gaps between, loading doors lit along the yard side.
  const sheds = (f: Frame, u0: number, u1: number, v: number) => {
    let u = u0 + between(r, 2, 10);
    while (u < u1 - 20) {
      const w = Math.min(u1 - u, between(r, 34, 70)), d = between(r, 16, 24), h = between(r, 6, 10);
      const [x, y] = f.at(u + w / 2, v + d / 2);
      const ok = [[0, 0], [w, 0], [0, d], [w, d]].every(([du, dv]) => {
        const [qx, qy] = f.at(u + du!, v + dv!);
        return inside(qx, qy) && solid(qx, qy) && blocked(qx, qy) > 4;
      });
      if (ok) {
        out.buildings.push({ x, y, w, d, h, z0: 0, a: f.a, tint: SODIUM, lit: 0.18, brick: r() < 0.4 ? 1 : 0, seed: r(), district, kind: 'building' });
        for (let k = 6; k < w - 4; k += between(r, 8, 14)) {
          const [sx, sy] = f.at(u + k, v - 0.3);
          out.props.push({ kind: 'shopfront', x: sx, y: sy, z0: 0, w: 4, d: 0.4, h: 3.2, a: f.a, color: SODIUM });
        }
        mark(f, u, u + w, v, v + d);
      }
      u += w + between(r, 6, 16);
    }
  };

  // Piers first, so the berths along the coast leave room for them: the longest coast edges, evenly spread, each out
  // into open water (nothing solid round its run), its length shortened until it fits.
  type Seg = { f: Frame; len: number; busy: [number, number][]; terminal?: boolean };
  // Where a rail spur meets each terminal: behind its sheds, in its quay's frame.
  const backs: { f: Frame; u: number; v: number }[] = [];
  const segs: Seg[] = coast.map(([p0, p1]) => {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
    const t: P = [dx / len, dy / len];
    let n: P = [-t[1], t[0]];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    if (!inside(mx + n[0] * 10, my + n[1] * 10)) n = [-n[0], -n[1]];
    return { f: frame(p0, t, n), len, busy: [] };
  });
  const W = cfg.piers.width;
  const byLength = [...segs].sort((a, b) => b.len - a.len);
  for (let k = 0, laid = 0; laid < cfg.piers.count && k < cfg.piers.count * 6; k++) {
    const s = byLength[k % Math.min(byLength.length, 3)]!;
    const u = between(r, W + 40, s.len - W - 40);
    if (s.len < 2 * W + 100 || s.busy.some(([a, b]) => u > a - W - 60 && u < b + W + 60)) continue;
    let L = between(r, cfg.piers.length[0], cfg.piers.length[1]);
    const clear = (len: number) => {
      for (let v = -8; v >= -len - 40; v -= 8) for (let du = -W / 2 - 34; du <= W / 2 + 34; du += 8) if (!water(...s.f.at(u + du, v))) return false;
      return true;
    };
    while (L >= cfg.piers.length[0] * 0.6 && !clear(L)) L *= 0.85;
    if (!clear(L)) continue;
    s.busy.push([u - W / 2, u + W / 2]);
    laid++;
    // The pier's own frame: `u` across it, `v` out along it from the coast (so the coast frame's -v).
    const out0 = s.f.at(u, 0);
    const pf = frame(out0, s.f.t, [-s.f.n[0], -s.f.n[1]]);
    const [px, py] = pf.at(0, L / 2);
    out.strips.push({ x: px, y: py, w: W, d: L, h: 1.6, z0: -0.6, a: pf.a, material: 'concrete' });
    for (const side of [-1, 1]) {
      // A faint lit kerb down each side so the pier reads against the black water.
      const [kx, ky] = pf.at(side * (W / 2 - 0.4), L / 2);
      out.strips.push({ x: kx, y: ky, w: 0.3, d: L - 1, h: 0.12, z0: 1, a: pf.a, material: 'street-light', color: SODIUM });
      // A berth down each side: its own frame runs out along the pier, water beyond the side.
      const bo = pf.at(side * (W / 2), 0);
      const bt: P = [pf.n[0], pf.n[1]];
      const bn: P = [-side * pf.t[0], -side * pf.t[1]];
      berth(frame(bo, bt, bn), 4, L - 4, PIER_DECK);
    }
    // Containers down the middle, between the cranes' legs on both sides.
    const mid = frame(pf.at(-W / 2 + 18, 0), [pf.n[0], pf.n[1]], [pf.t[0], pf.t[1]]);
    yard(mid, 6, L - 8, 0, W - 36, () => true, PIER_DECK);
    // A steady red light at the pier's end.
    for (const side of [-1, 1]) {
      const [ex, ey] = pf.at(side * (W / 2 - 1), L - 1);
      out.props.push({ kind: 'lamp', x: ex, y: ey, z0: 1.4, w: 0.8, d: 0.8, h: 0.8, a: 0, color: '#ff3b3b' });
    }
  }

  // Along every coast edge: stretches of terminal (berth, apron, yard, sheds) and of plain quay (apron and sheds), the
  // piers' roots left clear.
  const Q = cfg.quay;
  // Not on ground another yard, shed or quay already holds.
  const free = (x: number, y: number) => inside(x, y) && solid(x, y) && !taken.has(key(x, y));
  for (const s of segs) {
    const f = s.f;
    // Quay apron along the whole edge, its edge lit.
    const runs: [number, number][] = [];
    let start = 6;
    for (const [a, b] of [...s.busy].sort((x, y) => x[0] - y[0])) {
      if (a - 4 > start) runs.push([start, a - 4]);
      start = b + 4;
    }
    if (s.len - 6 > start) runs.push([start, s.len - 6]);
    const [ax, ay] = f.at(s.len / 2, Q / 2);
    out.strips.push({ x: ax, y: ay, w: s.len, d: Q, h: 0.3, z0: 0, a: f.a, material: 'concrete' });
    const [kx, ky] = f.at(s.len / 2, 0.6);
    out.strips.push({ x: kx, y: ky, w: s.len, d: 0.3, h: 0.12, z0: 0.4, a: f.a, material: 'street-light', color: SODIUM });
    mark(f, 0, s.len, 0, Q);
    for (const [a, b] of runs) {
      // Break the free run into stretches 160–420 px long, each a terminal or plain quay.
      let u = a;
      while (u < b - 40) {
        const e = Math.min(b, u + between(r, 160, 420));
        // Every quay edge gets at least one terminal (cranes on the inlet too): its first stretch.
        const terminal = r() < cfg.terminals || !s.terminal;
        if (terminal) {
          // The docks run inland a ways: each terminal's yard its own depth.
          const Y = between(r, cfg.yard[0], cfg.yard[1]);
          s.terminal = true;
          backs.push({ f, u: (u + e) / 2, v: Q + Y + 44 });
          berth(f, u, e);
          yard(f, u + 4, e - 4, Q + 6, Q + 6 + Y, free);
          mark(f, u, e, Q, Q + 6 + Y);
          sheds(f, u, e, Q + Y + 14);
        } else {
          // Plain quay: a barge or tug tied up now and then, sheds right behind the apron.
          if (r() < 0.6) {
            const l = between(r, 22, 34), [cx, cy] = f.at((u + e) / 2, -5.5);
            if (fits(cx, cy, l, 7, f.a, 1)) {
              hulls.push(corners(cx, cy, l, 7, f.a, 3));
              out.buildings.push({ x: cx, y: cy, w: l, d: 7, h: 2, z0: -0.6, a: f.a, tint: SODIUM, lit: 0.2, brick: 0, seed: r(), district, kind: 'car' });
            }
          }
          sheds(f, u, e, Q + 6);
        }
        u = e + between(r, 10, 24);
      }
    }
  }

  // The railway: a trunk line behind the terminals, parallel to the longest quay; container yards
  // inland strung along it; a spur from every yard and terminal to the trunk; a marshalling yard of parallel tracks
  // with trains standing on them; steady signals down the line. Track: a gravel bed and two rails.
  const sf = byLength[0]!.f;
  const tf = frame(sf.at(0, cfg.rail.offset), sf.t, sf.n);
  // Track's own cells: kept apart from `taken` while the railway is laid, so parallel tracks and spurs can sit close.
  const railCells = new Set<string>();
  const track = (a: P, b: P, own = true) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    if (L < 4) return;
    const nx = -dy / L, ny = dx / L, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    out.strips.push({ x: mx, y: my, w: L, d: 4.4, h: 0.25, z0: 0, a: ang, material: 'concrete' });
    // The rails catch the floodlights: a faint warm glint, so the lines read at night.
    for (const side of [-1, 1]) out.strips.push({ x: mx + nx * side * 1.2, y: my + ny * side * 1.2, w: L, d: 0.3, h: 0.3, z0: 0.25, a: ang, material: 'street-light', color: RAIL });
    if (own) for (let t = 0; t <= L; t += CELL / 2) railCells.add(key(a[0] + (dx * t) / L, a[1] + (dy * t) / L));
  };
  // Clear for track between two points: on Dockside ground, nothing else there (its ends may touch what they serve).
  const clearRun = (a: P, b: P, skip = 10) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = skip; t <= L - skip; t += 4) {
      const x = a[0] + ((b[0] - a[0]) * t) / L, y = a[1] + ((b[1] - a[1]) * t) / L;
      if (!free(x, y) || blocked(x, y) < 3) return false;
    }
    return true;
  };
  // The trunk: the longest clear run along the line.
  const cx1 = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length, cy1 = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
  const R1 = Math.max(...pts.map((p) => Math.hypot(p[0] - cx1, p[1] - cy1)));
  const u0t = (cx1 - tf.at(0, 0)[0]) * tf.t[0] + (cy1 - tf.at(0, 0)[1]) * tf.t[1];
  let best: [number, number] = [0, 0], runStart: number | null = null;
  for (let u = u0t - 2 * R1; u <= u0t + 2 * R1; u += 4) {
    const ok = free(...tf.at(u, 0)) && blocked(...tf.at(u, 0)) >= 3;
    if (ok && runStart === null) runStart = u;
    if ((!ok || u + 4 > u0t + 2 * R1) && runStart !== null) {
      if (u - runStart > best[1] - best[0]) best = [runStart, u - 4];
      runStart = null;
    }
  }
  const [ta, tb] = best;
  const trunk = tb - ta > 200;
  if (trunk) {
    track(tf.at(ta, 0), tf.at(tb, 0));
    out.rail = [tf.at(ta, 0), tf.at(tb, 0)];
    // Steady signals down the line, red or green.
    for (let u = ta + 40; u < tb - 20; u += cfg.rail.signalEvery) {
      const [x, y] = tf.at(u, 4);
      out.props.push({ kind: 'mast', x, y, z0: 0, w: 0.4, d: 0.4, h: 4, a: 0 });
      out.props.push({ kind: 'lamp', x, y, z0: 4, w: 0.6, d: 0.6, h: 0.6, a: 0, color: r() < 0.5 ? '#ff3b3b' : '#3bff8a' });
    }
  }
  // A branch toward a neighbour (Iron Reach's steelworks): off the trunk where it points best, straight to the border,
  // laid before the inland yards so they keep clear of it.
  if (trunk && cfg.rail.branchTo) {
    const T: P = [(cfg.rail.branchTo[0] / 100) * MAP_W, (cfg.rail.branchTo[1] / 100) * MAP_H];
    const o = tf.at(0, 0);
    const tu = (T[0] - o[0]) * tf.t[0] + (T[1] - o[1]) * tf.t[1];
    for (const shift of [0, 40, -40, 80, -80, 120, -120, 160, -160]) {
      const ju = Math.max(ta + 60, Math.min(tb - 60, tu + shift));
      const J = tf.at(ju, 0);
      const dx = T[0] - J[0], dy = T[1] - J[1], L = Math.hypot(dx, dy);
      let exit: P | null = null;
      for (let t = 8; t < L; t += 4) {
        const x = J[0] + (dx * t) / L, y = J[1] + (dy * t) / L;
        if (!inside(x, y)) {
          exit = [x, y];
          break;
        }
        if (!solid(x, y) || taken.has(key(x, y)) || blocked(x, y) < 3) break;
      }
      if (!exit) continue;
      track(J, exit);
      out.branch = [J, exit];
      break;
    }
  }
  // The truck road out of the port: from beside the trunk, alongside the branch, out of the district
  // toward the Spine's foot; lit both sides, faint tail lights on it. Laid before the inland yards so they keep clear.
  const RD = cfg.road;
  if (trunk && RD) {
    const T: P = [(RD.toward[0] / 100) * MAP_W, (RD.toward[1] / 100) * MAP_H];
    const o = tf.at(0, 0);
    const base = out.branch ? (out.branch[0][0] - o[0]) * tf.t[0] + (out.branch[0][1] - o[1]) * tf.t[1] : (T[0] - o[0]) * tf.t[0] + (T[1] - o[1]) * tf.t[1];
    for (const shift of [40, 60, 80, 100, -40, -60, -80, 120, 140]) {
      // On the trunk's inland side, clear of its rails.
      const J = tf.at(Math.max(ta + 30, Math.min(tb - 30, base + shift)), RD.width);
      const dx = T[0] - J[0], dy = T[1] - J[1], L = Math.hypot(dx, dy);
      let exit: P | null = null;
      for (let t = 4; t < L; t += 4) {
        const x = J[0] + (dx * t) / L, y = J[1] + (dy * t) / L;
        if (!inside(x, y)) {
          exit = [x, y];
          break;
        }
        const side = [-1, 1].map((k): P => [x - (dy / L) * k * RD.width, y + (dx / L) * k * RD.width]);
        if (!solid(x, y) || [[x, y] as P, ...side].some(([qx, qy]) => taken.has(key(qx, qy)) || railCells.has(key(qx, qy))) || blocked(x, y) < 3) break;
      }
      if (!exit) continue;
      truckRoad(J, exit, RD.width, (c) => railCells.add(c), out, r);
      out.road = [J, exit];
      break;
    }
  }
  // A train: a locomotive and flatcars of containers along a track from `a` toward `b`.
  const train = (a: P, b: P, cars: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), tx = dx / L, ty = dy / L;
    let t = 4;
    out.buildings.push({ x: a[0] + tx * (t + 7), y: a[1] + ty * (t + 7), w: 14, d: 3.2, h: 3.6, z0: 0.4, a: ang, tint: '#ffd9a0', lit: 0.3, brick: 0, seed: r(), district, kind: 'car' });
    out.props.push({ kind: 'lamp', x: a[0] + tx * (t - 0.3), y: a[1] + ty * (t - 0.3), z0: 2.4, w: 0.6, d: 0.6, h: 0.6, a: 0, color: '#fff1d6' });
    t += 15;
    for (let k = 0; k < cars && t + 9 < L; k++, t += 9) {
      const x = a[0] + tx * (t + 4.3), y = a[1] + ty * (t + 4.3);
      out.strips.push({ x, y, w: 8.4, d: 2.8, h: 0.5, z0: 0.4, a: ang, material: 'girder' });
      if (r() < 0.88) out.props.push({ kind: 'container', x, y, z0: 0.9, w: 7.6, d: 2.4, h: 2, a: ang, color: pick(r, cfg.containers) });
      if (r() < 0.35) out.props.push({ kind: 'container', x, y, z0: 3, w: 7.6, d: 2.4, h: 2, a: ang, color: pick(r, cfg.containers) });
    }
  };
  // Rail-mounted gantry cranes spanning a set of tracks (in frame `g`, tracks from v0 to v1), one every `every` px
  // from u0 to u1: legs either side, twin girders across at the top, the trolley and its lamp; red like the quay cranes.
  const gantries = (g: Frame, u0: number, u1: number, v0: number, v1: number, every: number, h = 16) => {
    const lo = Math.min(v0, v1) - 5, hi = Math.max(v0, v1) + 5, span = hi - lo;
    for (let u = u0 + every / 2; u < u1; u += every * between(r, 0.8, 1.2)) {
      for (const du of [-3, 3])
        for (const v of [lo, hi]) {
          const [x, y] = g.at(u + du, v);
          out.strips.push({ x, y, w: 1.1, d: 1.1, h, z0: 0, a: g.a, material: 'crane' });
        }
      for (const du of [-1.6, 1.6]) {
        const [x, y] = g.at(u + du, (lo + hi) / 2);
        out.strips.push({ x, y, w: 1, d: span + 1, h: 1.4, z0: h, a: g.a, material: 'crane' });
      }
      const tv = lo + span * between(r, 0.2, 0.8), [tx, ty] = g.at(u, tv);
      out.strips.push({ x: tx, y: ty, w: 4.6, d: 3.4, h: 2.4, z0: h - 1, a: g.a, material: 'crane' });
      out.props.push({ kind: 'lamp', x: tx, y: ty, z0: h - 1.4, w: 1.2, d: 1.2, h: 0.6, a: 0, color: FLOOD });
    }
  };
  if (trunk) {
    // The marshalling yard: parallel tracks beside the trunk near its middle, joined to it at both ends, trains on most.
    const mid = (ta + tb) / 2 + between(r, -(tb - ta) / 6, (tb - ta) / 6);
    const half = Math.min(cfg.rail.yardLength / 2, (tb - ta) / 2 - 40);
    const side = r() < 0.5 ? 1 : -1;
    for (let k = 1; k <= cfg.rail.tracks; k++) {
      const v = side * k * 6;
      const a = tf.at(mid - half + k * 6, v), b = tf.at(mid + half - k * 6, v);
      if (!clearRun(a, b, 0)) break;
      track(a, b);
      // Joined to the trunk at each end by a short diagonal.
      track(tf.at(mid - half - 14 + k * 2, 0), a);
      track(b, tf.at(mid + half + 14 - k * 2, 0));
      if (r() < cfg.rail.trains) train(a, b, Math.floor(between(r, 8, (2 * half) / 9 - 4)));
    }
    // Gantry cranes spanning its tracks, swapping containers between trains.
    gantries(tf, mid - half + 30, mid + half - 30, side * 6, side * cfg.rail.tracks * 6, 110, 18);
    // Floodlights over the marshalling yard.
    for (let u = mid - half; u <= mid + half; u += cfg.masts) {
      const [x, y] = tf.at(u, side * (cfg.rail.tracks * 6 + 6));
      if (!free(x, y)) continue;
      out.props.push({ kind: 'lattice', x, y, z0: 0, w: 0.9, d: 0.9, h: 24, a: 0 });
      out.props.push({ kind: 'lamp', x, y, z0: 24, w: 2.6, d: 1.2, h: 0.9, a: tf.a, color: FLOOD });
      out.lights.push({ x, y, z: 24, color: FLOOD, power: 50000, radius: 2, reach: 70 });
    }
  }
  // Container yards further inland, lit like the terminals': strung along the trunk on both sides,
  // squared to it, a paved lot with sheds along its far side, each with a spur to the line.
  for (let n = 0, t = 0; n < cfg.inlandYards.count && t < cfg.inlandYards.count * 300; t++) {
    const w = between(r, cfg.inlandYards.size[0], cfg.inlandYards.size[1]), d = between(r, cfg.inlandYards.size[0], cfg.inlandYards.size[1]) * 0.7;
    const side = r() < 0.5 ? 1 : -1, gap = between(r, 30, 140);
    const u = trunk ? between(r, ta, tb - w) : u0t + between(r, -R1, R1);
    // Its near edge `gap` from the trunk, the yard running away from it.
    const v0 = side > 0 ? gap : -gap - d;
    // Each turned a little off the line, so the yards don't stand in ranks.
    const turn = between(r, -cfg.inlandYards.turn, cfg.inlandYards.turn) * (Math.PI / 180), ct = Math.cos(turn), st = Math.sin(turn);
    const yt: P = [tf.t[0] * ct - tf.t[1] * st, tf.t[0] * st + tf.t[1] * ct];
    const f = frame(tf.at(u, v0), yt, [-yt[1], yt[0]]);
    // Corners and centre first: most sites fail there, before the full scan.
    let ok = [[0, 0], [w, 0], [0, d], [w, d], [w / 2, d / 2]].every(([du, dv]) => {
      const [x, y] = f.at(du!, dv!);
      return free(x, y) && !railCells.has(key(x, y));
    });
    for (let du = -16; du <= w + 16 && ok; du += 8)
      for (let dv = -16 - (side < 0 ? 34 : 0); dv <= d + 16 + (side > 0 ? 34 : 0) && ok; dv += 8) {
        const [x, y] = f.at(du, dv);
        if (!free(x, y) || railCells.has(key(x, y)) || blocked(x, y) < 10) ok = false;
      }
    if (!ok) continue;
    n++;
    const [sx, sy] = f.at(w / 2, d / 2);
    out.strips.push({ x: sx, y: sy, w: w + 6, d: d + 6, h: 0.3, z0: 0, a: f.a, material: 'concrete' });
    yard(f, 0, w, 4, d, free);
    mark(f, -6, w + 6, -6, d + 6);
    // Sheds on the side away from the line.
    if (side > 0) sheds(f, 0, w, d + 10);
    else sheds(frame(f.at(w, d), [-tf.t[0], -tf.t[1]], [-tf.n[0], -tf.n[1]]), 0, w, d + 10);
    // Its spur: from the yard's edge facing the line, square to the trunk.
    if (trunk) {
      const su = u + w * between(r, 0.3, 0.7);
      const a = tf.at(su, side > 0 ? gap - 4 : -gap + 4), b = tf.at(su, 0);
      if (clearRun(a, b, 2)) {
        track(a, b);
        // A train loading at the yard now and then: along the yard's edge.
        const e0 = tf.at(u + 10, side > 0 ? gap - 8 : -gap + 8), e1 = tf.at(u + w - 10, side > 0 ? gap - 8 : -gap + 8);
        if (clearRun(e0, e1, 0)) {
          track(e0, e1);
          if (r() < cfg.rail.trains) train(e0, e1, Math.floor((w - 40) / 9));
        }
      }
    }
  }
  // Spurs from the terminals: behind each one's sheds, square to its quay, to where they meet the trunk.
  if (trunk)
    for (const bk of backs) {
      const a = bk.f.at(bk.u, bk.v);
      // Along the quay's inland normal to the trunk line.
      const n = bk.f.n, den = n[0] * tf.n[0] + n[1] * tf.n[1];
      if (Math.abs(den) < 0.3) continue;
      const o = tf.at(0, 0), dist = ((o[0] - a[0]) * tf.n[0] + (o[1] - a[1]) * tf.n[1]) / den;
      if (dist < 10 || dist > 700) continue;
      const b: P = [a[0] + n[0] * dist, a[1] + n[1] * dist];
      const along = (b[0] - o[0]) * tf.t[0] + (b[1] - o[1]) * tf.t[1];
      if (along < ta || along > tb || !clearRun(a, b, 4)) continue;
      track(a, b);
      // A short siding along the back of the terminal, a train on it now and then.
      const s0 = bk.f.at(bk.u - 60, bk.v), s1 = bk.f.at(bk.u + 60, bk.v);
      if (clearRun(s0, s1, 0)) {
        track(s0, s1);
        if (r() < cfg.rail.trains) train(s0, s1, 10);
      }
    }

  for (const c of railCells) taken.add(c);

  // Out in the bay: ships at anchor (riding lights on, a little turned) and tugs, in open water within reach of the
  // coast, clear of the shore and of each other.
  const along = (k: number): P => {
    const s = pick(r, segs);
    const [x, y] = s.f.at(between(r, 0, s.len), -between(r, 80, 80 + k));
    return [x, y];
  };
  for (let n = 0, t = 0; n < cfg.anchored && t < cfg.anchored * 40; t++) {
    const [x, y] = along(260);
    const l = between(r, cfg.ships.length[0], cfg.ships.length[1]), b = between(r, cfg.ships.beam[0], cfg.ships.beam[1]), a = r() * Math.PI * 2;
    if (!fits(x, y, l, b, a, 30)) continue;
    hulls.push(corners(x, y, l, b, a, 40));
    ship(x, y, l, b, a, 0.7);
    n++;
  }
  for (let n = 0, t = 0; n < cfg.tugs && t < cfg.tugs * 40; t++) {
    const [x, y] = along(140);
    const a = r() * Math.PI * 2;
    if (!fits(x, y, 12, 5, a, 10)) continue;
    hulls.push(corners(x, y, 12, 5, a, 6));
    const tf = frame([x, y], [Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]);
    out.buildings.push({ x, y, w: 12, d: 5, h: 2.2, z0: -0.8, a, tint: SODIUM, lit: 0, brick: 0, seed: r(), district, kind: 'car' });
    const [cx, cy] = tf.at(1, 0);
    out.buildings.push({ x: cx, y: cy, w: 4, d: 3.4, h: 2.4, z0: 1.4, a, tint: '#ffd9a0', lit: 0.8, brick: 0, seed: r(), district, kind: 'shack' });
    out.props.push({ kind: 'lamp', x: cx, y: cy, z0: 4.2, w: 0.6, d: 0.6, h: 0.5, a: 0, color: '#fff1d6' });
    const [sx, sy] = tf.at(-6, 0);
    out.props.push({ kind: 'lamp', x: sx, y: sy, z0: 1.6, w: 0.5, d: 0.5, h: 0.4, a: 0, color: '#ff3b3b' });
    n++;
  }

  // Chimneys inland, away from the port, brick, a steady red lamp on top.
  const cx0 = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const R = Math.max(...pts.map((p) => Math.hypot(p[0] - cx0, p[1] - cy0)));
  const chimneys: P[] = [];
  for (let t = 0; t < 600 && chimneys.length < cfg.stacks; t++) {
    const x = cx0 + between(r, -R, R), y = cy0 + between(r, -R, R);
    if (!inside(x, y) || !solid(x, y) || blocked(x, y) < 20 || near(x, y) < 140) continue;
    if (chimneys.some((c) => Math.hypot(c[0] - x, c[1] - y) < 400 && Math.hypot(c[0] - x, c[1] - y) > 0)) continue;
    chimneys.push([x, y]);
    // In pairs, as painted: a second one close beside.
    const h = between(r, 52, 70);
    for (const [ox, oy] of [[0, 0], [14, -4]] as P[]) {
      if (!inside(x + ox, y + oy)) continue;
      out.buildings.push({ x: x + ox, y: y + oy, w: 5, d: 5, h, z0: 0, a: 0, tint: SODIUM, lit: 0, brick: 1, seed: r(), district, kind: 'stack' });
      out.props.push({ kind: 'lamp', x: x + ox, y: y + oy, z0: h, w: 0.8, d: 0.8, h: 0.6, a: 0, color: '#ff3b3b' });
      taken.add(key(x + ox, y + oy));
    }
  }
  function near(x: number, y: number) {
    let best = Infinity;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) if (taken.has(`${cx + i}:${cy + j}`)) best = Math.min(best, Math.hypot(i, j) * CELL);
    return best;
  }

  // Warehouses over the rest of Dockside's ground (its blocks become warehouses): a grid squared to
  // the district, sodium-lit streets between; each slot a long warehouse with its loading doors lit, a truck lot of
  // trailers under a floodlight, or a small container depot. Laid last, on whatever the port left. Its own random
  // stream, so the port doesn't move when the grid changes.
  {
    const H = cfg.warehouses;
    const wr = rng(`warehouses:${district}`);
    const wa = (H.angleDeg * Math.PI) / 180, ca = Math.cos(wa), sa = Math.sin(wa);
    const pu = H.slot[0] + H.street, pv = H.slot[1] + H.street;
    const at = (c: P, u: number, v: number): P => [c[0] + u * ca - v * sa, c[1] + u * sa + v * ca];
    const open = (x: number, y: number) => inside(x, y) && solid(x, y) && !taken.has(key(x, y)) && blocked(x, y) > 2;
    const fits = (c: P, w: number, d: number) => {
      for (let u = -w / 2 - 1; u <= w / 2 + 1; u += 6) for (let v = -d / 2 - 1; v <= d / 2 + 1; v += 6) if (!open(...at(c, u, v))) return false;
      return true;
    };
    const claimRect = (c: P, w: number, d: number) => {
      for (let u = -w / 2; u <= w / 2; u += CELL / 2) for (let v = -d / 2; v <= d / 2; v += CELL / 2) taken.add(key(...at(c, u, v)));
    };
    let piece = 0;
    for (let i = -Math.ceil(R1 / pu) - 1; i <= Math.ceil(R1 / pu) + 1; i++)
      for (let j = -Math.ceil(R1 / pv) - 1; j <= Math.ceil(R1 / pv) + 1; j++) {
        const c: P = [cx1 + i * pu * ca - j * pv * sa, cy1 + i * pu * sa + j * pv * ca];
        const roll = Array.from({ length: 8 }, wr);
        // Streets along the slot's two near sides, a lamp every few pieces.
        for (const [su, sv, len, along] of [[0, -pv / 2, pu, 0], [-pu / 2, 0, pv, Math.PI / 2]] as const) {
          const ends = along ? [at(c, su, -len / 2), at(c, su, len / 2)] : [at(c, -len / 2, sv), at(c, len / 2, sv)];
          if (!ends.every(([x, y]) => open(x, y)) || !open(...at(c, su, sv))) continue;
          const [x, y] = at(c, su, sv);
          out.strips.push({ x, y, w: len + 0.5, d: H.street - 2, h: 0.2, z0: 0.06, a: wa + along, material: 'street' });
          if (++piece % H.lampEvery === 0) {
            const [lx, ly] = along ? at(c, su + H.street / 2 - 1, 0) : at(c, 0, sv + H.street / 2 - 1);
            out.props.push({ kind: 'lamp', x: lx, y: ly, z0: 3.4, w: 1.2, d: 1.2, h: 0.6, a: 0, color: SODIUM });
          }
        }
        // A whole slot, or each half on its own where the ground is broken.
        const parts: [P, number, number][] = [];
        if (fits(c, H.slot[0], H.slot[1])) parts.push([c, H.slot[0], H.slot[1]]);
        else
          for (const hu of [-H.slot[0] / 4, H.slot[0] / 4]) {
            const ch = at(c, hu, 0);
            if (fits(ch, H.slot[0] / 2 - 2, H.slot[1])) parts.push([ch, H.slot[0] / 2 - 2, H.slot[1]]);
          }
        for (const [pc, W, D] of parts) {
          claimRect(pc, W, D);
          const k = parts.length === 1 && W === H.slot[0] ? roll[0]! : wr();
          const [x, y] = pc;
          if (k < 0.68) {
            // A warehouse: long and low, a row of lit loading doors down its front, a faint skylight down its roof.
            const w = W * 0.94, d = D * 0.72, h = 7 + roll[1]! * 5;
            out.buildings.push({ x, y, w, d, h, z0: 0, a: wa, tint: SODIUM, lit: 0.15, brick: roll[2]! < 0.4 ? 1 : 0, seed: wr(), district, kind: 'building' });
            for (let u = -w / 2 + 5; u < w / 2 - 3; u += 8 + roll[3]! * 4) {
              const [sx, sy] = at(pc, u, -d / 2 - 0.3);
              out.props.push({ kind: 'shopfront', x: sx, y: sy, z0: 0, w: 4, d: 0.4, h: 3.2, a: wa, color: SODIUM });
            }
            // Skylights down the roof, lit from the work inside.
            for (const sv of roll[4]! < 0.5 ? [0] : [-d / 4, d / 4]) {
              const [gx, gy] = at(pc, 0, sv);
              out.strips.push({ x: gx, y: gy, w: w * 0.84, d: 0.7, h: 0.4, z0: h, a: wa, material: 'street-light', color: '#ffb060' });
            }
            // A trailer or two backed up to the doors.
            for (let q = 0; q < 2; q++) {
              if (wr() < 0.4) continue;
              const [tx, ty] = at(pc, -w / 2 + 8 + wr() * (w - 16), -d / 2 - 6);
              out.buildings.push({ x: tx, y: ty, w: 2.6, d: 9, h: 3, z0: 0, a: wa, tint: SODIUM, lit: 0, brick: 0, seed: wr(), district, kind: 'car' });
            }
          } else if (k < 0.88) {
            // A truck lot: rows of trailers, some carrying containers, under a floodlight.
            out.strips.push({ x, y, w: W, d: D, h: 0.25, z0: 0, a: wa, material: 'concrete' });
            for (let u = -W / 2 + 4; u < W / 2 - 3; u += 4.2)
              for (const v of [-D / 4, D / 4]) {
                if (wr() < 0.25) continue;
                const [tx, ty] = at(pc, u, v);
                out.buildings.push({ x: tx, y: ty, w: 2.6, d: 10, h: 1.4, z0: 0, a: wa, tint: SODIUM, lit: 0, brick: 0, seed: wr(), district, kind: 'car' });
                if (wr() < 0.6) out.props.push({ kind: 'container', x: tx, y: ty, z0: 1.4, w: 2.4, d: 7.6, h: 2, a: wa, color: pick(wr, cfg.containers) });
              }
            const [mx, my] = at(pc, 0, -D / 2 + 1);
            out.props.push({ kind: 'lattice', x: mx, y: my, z0: 0, w: 0.9, d: 0.9, h: 20, a: 0 });
            out.props.push({ kind: 'lamp', x: mx, y: my, z0: 20, w: 2.4, d: 1.1, h: 0.9, a: wa, color: FLOOD });
            out.lights.push({ x, y, z: 20, color: FLOOD, power: 45000, radius: 2, reach: 55 });
          } else {
            // A small container depot.
            for (let u = -W / 2 + 4.5; u < W / 2 - 4; u += 8.2)
              for (let v = -D / 2 + 2; v < D / 2 - 2; v += 2.7) {
                if (wr() < 0.12) continue;
                const [sx, sy] = at(pc, u, v), tiers = 1 + Math.floor(wr() * 3);
                for (let z = 0; z < tiers; z++) out.props.push({ kind: 'container', x: sx, y: sy, z0: z * 2.1, w: 7.6, d: 2.4, h: 2, a: wa, color: pick(wr, cfg.containers) });
              }
            out.lights.push({ x, y, z: 22, color: FLOOD, power: 50000, radius: 2, reach: 60 });
          }
          if (wr() < H.lights) out.lights.push({ x: at(pc, -W / 2, -D / 2)[0], y: at(pc, -W / 2, -D / 2)[1], z: 30, color: SODIUM, power: 45000, radius: 0.6, reach: 120 });
        }
      }
  }

  out.distance = (x, y) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let best = 6 * CELL;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) if (taken.has(`${cx + i}:${cy + j}`)) best = Math.min(best, Math.max(0, Math.hypot(i, j) - 1) * CELL - 4);
    return best;
  };
  return out;
}

/** A lit truck road from `a` to `b`, `w` px wide: asphalt, lamps both sides, short faint runs of tail and head lights
 * down its lanes. `claim` takes each cell it covers, so blocks keep off it. Shared with Iron Reach. */
export function truckRoad(a: P, b: P, w: number, claim: (cell: string) => void, out: { strips: Strip[]; props: Prop[] }, r: () => number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  if (L < 8) return;
  const tx = dx / L, ty = dy / L, nx = -ty, ny = tx;
  out.strips.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w: L + 1, d: w, h: 0.25, z0: 0.08, a: ang, material: 'street' });
  for (let t = 6; t < L - 4; t += 16)
    for (const side of [-1, 1])
      out.props.push({ kind: 'lamp', x: a[0] + tx * t + nx * side * (w / 2 + 0.8), y: a[1] + ty * t + ny * side * (w / 2 + 0.8), z0: 4, w: 0.8, d: 0.8, h: 0.5, a: 0, color: SODIUM });
  for (let t = r() * 30; t < L - 8; t += 22 + r() * 30) {
    const lane = r() < 0.5 ? -1 : 1;
    out.strips.push({ x: a[0] + tx * (t + 3) + nx * lane * w * 0.22, y: a[1] + ty * (t + 3) + ny * lane * w * 0.22, w: 6, d: 0.5, h: 0.2, z0: 0.4, a: ang, material: lane < 0 ? 'car-red' : 'car-white' });
  }
  for (let t = 0; t <= L; t += CELL / 2) for (const k of [-0.5, 0, 0.5]) claim(`${Math.floor((a[0] + tx * t + nx * k * w) / CELL)}:${Math.floor((a[1] + ty * t + ny * k * w) / CELL)}`);
}

/** Whether two convex quads overlap (no separating axis among their edges). */
function sepFails(a: P[], b: P[]) {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1], ny = p[0] - q[0];
      const pa = a.map((v) => v[0] * nx + v[1] * ny), pb = b.map((v) => v[0] * nx + v[1] * ny);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  return true;
}
