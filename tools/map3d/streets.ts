// Velvet's streets (2026-10-26): the red-light quarter is old and low, and sells discretion. One winding main street, the
// Row, runs up to the cliff foot under the Cat; narrow lanes wander off it and off each other, paper lanterns strung across
// them. The Glass Orchid stands among them with a glowing glass roof. Dim, steady light: nothing blinks.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor, type Place } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Curve, Light, Prop, Strip } from './geometry';
import { between, pick, rng } from './rng';
import { resample, smooth } from './structure';

type P = [number, number];
type Streets = NonNullable<DistrictStyle['streets']>;
export interface StreetsGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
  /** The Row's and the lanes' centrelines (map px); each lane starts on the Row or an earlier lane. */
  row: P[];
  lanes: P[][];
  /** From a point to the nearest street's edge or the house's walls (map px; negative on a street). */
  distance: (x: number, y: number) => number;
  /** How far back from a street's edge the row houses reach: the district's blocks stand behind them. */
  frontDepth: number;
}

function segDist(px: number, py: number, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/** `style`: the district's (window and sign colours for the row houses). */
export function districtStreets(district: string, cfg: Streets, border: Anchor[], places: Place[], style?: DistrictStyle): StreetsGeometry {
  const r = rng(`streets:${district}`);
  const signs0 = [...cfg.lanternColors, ...(style?.signColors ?? [])];
  const out: StreetsGeometry = { buildings: [], props: [], strips: [], curves: [], lights: [], row: [], lanes: [], distance: () => Infinity, frontDepth: 0 };
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const roads: { pts: P[]; width: number }[] = [];
  const toRoad = (x: number, y: number, skip?: P[]) => {
    let best = Infinity;
    for (const rd of roads) {
      if (rd.pts === skip) continue;
      for (let i = 0; i < rd.pts.length - 1; i++) best = Math.min(best, segDist(x, y, rd.pts[i]!, rd.pts[i + 1]!) - rd.width / 2);
    }
    return best;
  };

  // The red-light stretch: a band along one lane where everything burns red.
  const RL = cfg.redLight;
  const rlA: P | null = RL ? [(RL.from[0] / 100) * MAP_W, (RL.from[1] / 100) * MAP_H] : null;
  const rlB: P | null = RL ? [(RL.to[0] / 100) * MAP_W, (RL.to[1] / 100) * MAP_H] : null;
  const inRed = (x: number, y: number) => !!RL && segDist(x, y, rlA!, rlB!) < RL.width / 2;
  // Its extras draw from their own stream, so the quarter's lanes and blocks stand exactly where they did without it.
  const rr = rng(`redlight:${district}`);
  const string = (mx: number, my: number, ang: number, width: number, z: number, color: string) => {
    const nx = -Math.sin(ang), ny = Math.cos(ang), half = width / 2 + 1.2;
    const pt = (u: number): [number, number, number] => [mx + nx * (u * 2 - 1) * half, my + ny * (u * 2 - 1) * half, z - 4 * u * (1 - u) * 1.1];
    out.curves.push({ points: [0, 0.2, 0.4, 0.6, 0.8, 1].map(pt), bevel: 0.06, material: 'neon', color, strength: 4 });
    for (const u of [0.25, 0.5, 0.75]) {
      const [lx, ly, lz] = pt(u);
      out.props.push({ kind: 'lamp', x: lx, y: ly, z0: lz - 1.1, w: 0.9, d: 0.9, h: 1.1, a: 0, color });
    }
  };

  /** Lays a street: its paving, and every `every` px a string of paper lanterns across it. */
  const lay = (pts: P[], width: number, every: number) => {
    roads.push({ pts, width });
    let run = every * r();
    let runRed = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i]!, pts[i + 1]!];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      out.strips.push({ x: mx, y: my, w: seg + 0.4, d: width, h: 0.2, z0: 0.06, a: ang, material: 'street' });
      run += seg;
      const red = inRed(mx, my);
      // The red-light stretch hangs its own red strings three times as close, from its own stream.
      if (red) {
        runRed += seg;
        if (runRed >= every / 3) {
          runRed = 0;
          const z = between(rr, 5, 7.5), color = pick(rr, RL!.colors);
          string(mx, my, ang, width, z, color);
          if (rr() < 0.6) out.lights.push({ x: mx, y: my, z: z - 1, color, power: 14000, radius: 1, reach: 30 });
        }
      }
      if (run < every) continue;
      run = 0;
      // Across the street, eaves to eaves, sagging; three lanterns hang from it (the draws made either way, so nothing
      // after them moves; on the red stretch its own strings stand in).
      const z = between(r, 5, 7.5);
      const color = pick(r, cfg.lanternColors);
      const lit = r() < 0.22;
      if (red) continue;
      string(mx, my, ang, width, z, color);
      if (lit) out.lights.push({ x: mx, y: my, z: z - 1, color, power: 9000, radius: 1, reach: 30 });
    }
  };

  // The Row.
  const row = resample(smooth(cfg.row.map(([x, y]) => [(x / 100) * MAP_W, (y / 100) * MAP_H] as P)), 6).filter(([x, y]) => inside(x, y));
  out.row = row;
  lay(row, cfg.width, cfg.lanternEvery);

  // The square (pass 5): where the Row ends at the cliff foot under the Cat it opens out, paved, with lantern strings
  // radiating from a pole in its middle and a ring of stalls.
  let square: { x: number; y: number; R: number } | null = null;
  if (cfg.square && row.length) {
    const [x, y] = row.at(-1)!, R = cfg.square.radius;
    square = { x, y, R };
    for (let k = -R; k <= R; k += 4) {
      const half = Math.sqrt(Math.max(0, R * R - k * k));
      if (half > 1) out.strips.push({ x, y: y + k, w: half * 2, d: 4.3, h: 0.2, z0: 0.06, a: 0, material: 'street' });
    }
    out.strips.push({ x, y, w: 0.6, d: 0.6, h: 9.5, z0: 0.2, a: 0, material: 'girder' });
    const N = 12;
    for (let k = 0; k < N; k++) {
      const t = (k / N) * Math.PI * 2, color = pick(r, cfg.lanternColors);
      const ex = x + Math.cos(t) * (R - 1.5), ey = y + Math.sin(t) * (R - 1.5);
      const pts = Array.from({ length: 6 }, (_, j): [number, number, number] => {
        const u = j / 5;
        return [x + (ex - x) * u, y + (ey - y) * u, 9.5 - 4.5 * u - Math.sin(u * Math.PI) * 1.2];
      });
      out.curves.push({ points: pts, bevel: 0.06, material: 'neon', color, strength: 4 });
      for (const j of [2, 4]) out.props.push({ kind: 'lamp', x: pts[j]![0], y: pts[j]![1], z0: pts[j]![2] - 1.1, w: 0.9, d: 0.9, h: 1.1, a: 0, color });
      // Stalls round the edge, every other spoke.
      if (k % 2 === 0) {
        const sx = x + Math.cos(t + 0.26) * (R - 4), sy = y + Math.sin(t + 0.26) * (R - 4);
        const sc = pick(r, signs0);
        out.buildings.push({ x: sx, y: sy, w: 4.5, d: 3.2, h: 3, z0: 0, a: t + Math.PI / 2, tint: sc, lit: 0.9, brick: 0, seed: r(), district, kind: 'shack' });
        out.props.push({ kind: 'shopfront', x: sx - Math.cos(t) * 1.8, y: sy - Math.sin(t) * 1.8, z0: 0.6, w: 3.6, d: 0.3, h: 1.4, a: t + Math.PI / 2, color: sc });
      }
    }
    out.lights.push({ x, y, z: 8, color: '#ffb070', power: 42000, radius: 3, reach: 55 });
    // A stair climbs from the square up to the Cat's scaffold, lanterns on posts beside it.
    const C = cfg.square.climb;
    if (C) {
      const [tx, ty] = [(C.to[0] / 100) * MAP_W, (C.to[1] / 100) * MAP_H];
      const ang = Math.atan2(ty - y, tx - x), len = Math.hypot(tx - x, ty - y) - R * 0.7;
      const [sx, sy] = [x + Math.cos(ang) * R * 0.7, y + Math.sin(ang) * R * 0.7];
      out.strips.push({ x: sx, y: sy, w: 0, d: 2.4, h: 0.5, z0: 0, a: ang, material: 'stair', ends: [[sx, sy, 0.2], [tx, ty, C.z]] });
      for (let d = 6; d < len; d += 8) {
        const u = d / len, z = u * C.z;
        for (const side of [-1, 1]) {
          const px = sx + Math.cos(ang) * d - Math.sin(ang) * side * 2, py = sy + Math.sin(ang) * d + Math.cos(ang) * side * 2;
          out.strips.push({ x: px, y: py, w: 0.25, d: 0.25, h: 2.6, z0: z, a: ang, material: 'girder' });
          out.props.push({ kind: 'lamp', x: px, y: py, z0: z + 2.6, w: 0.9, d: 0.9, h: 1, a: 0, color: pick(r, cfg.lanternColors) });
        }
      }
    }
  }

  // Lanes: from a point on the Row (or an earlier lane), off to one side, wandering; each stops where it meets another
  // street (a junction, not a dead end), or at the quarter's edge.
  const STEP = 6;
  for (let k = 0, tries = 0; k < cfg.lanes.count && tries < cfg.lanes.count * 12; tries++) {
    // Spread over the quarter: off the Row more often than not, else off any lane, at an even spot along it; skip a spot
    // that already has a street close by on either side.
    const parent = r() < 0.55 || !out.lanes.length ? row : out.lanes[Math.floor(r() * out.lanes.length)]!;
    if (parent.length < 6) continue;
    const at = 2 + Math.floor(r() * (parent.length - 4));
    const [a, b] = [parent[at]!, parent[at + 1]!];
    const along = Math.atan2(b[1] - a[1], b[0] - a[0]);
    let head = along + (r() < 0.5 ? -1 : 1) * between(r, 1.1, 1.9);
    if (toRoad(a[0] + Math.cos(head) * 14, a[1] + Math.sin(head) * 14, parent) < cfg.lanes.width * 2) continue;
    const L = between(r, cfg.lanes.length[0], cfg.lanes.length[1]);
    const lane: P[] = [a];
    // No dead ends: past its length a lane keeps on (straighter) until it meets another street or the quarter's edge; one
    // that never does isn't built.
    let joined = false;
    for (let d = STEP; d <= L * 3; d += STEP) {
      head += between(r, -0.12, 0.12) * (d > L ? 0.4 : 1);
      const q = lane.at(-1)!;
      const nq: P = [q[0] + Math.cos(head) * STEP, q[1] + Math.sin(head) * STEP];
      if (!inside(nq[0], nq[1])) {
        joined = true;
        break;
      }
      lane.push(nq);
      // Met another street: join it and stop.
      if (d > 18 && toRoad(nq[0], nq[1], parent) < cfg.lanes.width) {
        joined = true;
        break;
      }
    }
    if (!joined || lane.length < 6) continue;
    // Not alongside another street for its length (lanes cross and join, they don't run in pairs).
    const crowded = lane.slice(4, -2).filter((q) => toRoad(q[0], q[1], parent) < cfg.lanes.width * 2.5).length;
    if (crowded > lane.length * 0.25) continue;
    out.lanes.push(lane);
    lay(lane, cfg.lanes.width, cfg.lanternEvery * 0.8);
    k++;
  }

  // The house (the Glass Orchid): a low lit hall with a glass roof, lanterns round its court.
  let houseAt: { x: number; y: number; w: number; d: number } | null = null;
  if (cfg.house) {
    const H = cfg.house;
    const p = places.find((q) => q.id === H.near);
    if (p) {
      let [x, y] = [(p.pin[0] / 100) * MAP_W, (p.pin[1] / 100) * MAP_H];
      // Off the street if its pin is on one.
      for (let k = 0; k < 20 && toRoad(x, y) < H.d / 2 + 2; k++) y -= 3;
      houseAt = { x, y, w: H.w, d: H.d };
      out.buildings.push({ x, y, w: H.w, d: H.d, h: H.h, z0: 0, a: 0, tint: '#ffb347', lit: 0.85, brick: 1, seed: 0.41, district, kind: 'building' });
      // The glass roof: a low hipped glow, its ridge and hips traced.
      const z = H.h, top = H.h + 4, hw = H.w / 2 - 0.5, hd = H.d / 2 - 0.5;
      const c = (u: number, v: number, zz: number): [number, number, number] => [x + u, y + v, zz];
      const ridge: [number, number, number][] = [c(-hw * 0.4, 0, top), c(hw * 0.4, 0, top)];
      for (const pts of [
        [c(-hw, -hd, z), c(hw, -hd, z), c(hw, hd, z), c(-hw, hd, z), c(-hw, -hd, z)],
        ridge,
        [c(-hw, -hd, z), ridge[0]!, c(-hw, hd, z)],
        [c(hw, -hd, z), ridge[1]!, c(hw, hd, z)],
      ])
        out.curves.push({ points: pts, bevel: 0.28, material: 'neon', color: H.glass, strength: 10 });
      out.lights.push({ x, y, z: top + 2, color: H.glass, power: 55000, radius: 4, reach: 60 });
      // Its name on a tall blade sign at the front corner, so it can be found from across the quarter.
      out.props.push({ kind: 'hanging-sign', x: x + hw + 0.8, y: y + hd + 0.8, z0: 3, w: 0.5, d: 2.6, h: H.h + 2, a: Math.PI / 2, color: H.glass });
      // Lanterns on posts along its front.
      for (let u = -hw; u <= hw; u += 4) {
        out.props.push({ kind: 'lamp', x: x + u, y: y + hd + 2.5, z0: 2.6, w: 0.9, d: 0.9, h: 1.1, a: 0, color: '#ff4f3a' });
      }
    }
  }

  // Quality pass 1 ("more in line with the Ribbon"): row houses line every street, square to it, low and
  // jostling, brick more often than not; shopfronts at the door, blade signs hung out over the street, air-con on the
  // walls, cables and washing strung across the lanes, warm lamps along the Row.
  // Walls lit in the Ribbon's warm palette, with the quarter's own pink.
  const windows = cfg.wallColors ?? style?.windowColors ?? ['#ffb38a'];
  const signs = [...cfg.lanternColors, ...(style?.signColors ?? [])];
  const LAUNDRY = ['#8a6a6a', '#6a7a8a', '#a08a6a', '#7a5a7a', '#c0b0a0'];
  const F = { row: [9, 13], lane: [6, 9] } as const;
  out.frontDepth = F.row[1] + 9;
  for (const rd of roads) {
    const isRow = rd.pts === row;
    const [d0, d1] = isRow ? F.row : F.lane;
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [a, b] = [rd.pts[i]!, rd.pts[i + 1]!];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const nx = -Math.sin(ang), ny = Math.cos(ang), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const hs: number[] = [];
      // On the red-light stretch the walls, signs and fronts burn red, and every door is lit.
      const red = inRed(mx, my);
      for (const side of [-1, 1]) {
        const dep = between(r, d0, d1);
        const off = rd.width / 2 + 0.4 + dep / 2;
        const [x, y] = [mx + nx * side * off, my + ny * side * off];
        // Each house by where it stands: red on the stretch, whichever street it fronts.
        const redH = red || inRed(x, y);
        const wallsHere = redH ? RL!.walls : windows, signsHere = redH ? RL!.colors : signs;
        // Not into another street, out of the quarter or into the house.
        const back: P = [mx + nx * side * (off + dep / 2), my + ny * side * (off + dep / 2)];
        if (!inside(x, y) || !inside(back[0], back[1]) || toRoad(x, y, rd.pts) < dep / 2 + 0.5 || toRoad(back[0], back[1], rd.pts) < 0.5) continue;
        if (houseAt && Math.abs(x - houseAt.x) < houseAt.w / 2 + dep / 2 && Math.abs(y - houseAt.y) < houseAt.d / 2 + dep / 2) continue;
        if (square && Math.hypot(x - square.x, y - square.y) < square.R + dep / 2 + 1) continue;
        const h = Math.min(38, between(r, isRow ? 10 : 7, isRow ? 27 : 20) * (r() < 0.15 ? 1.45 : 1));
        hs.push(h);
        out.buildings.push({ x, y, w: seg * 1.05, d: dep, h, z0: 0, a: ang, tint: pick(r, wallsHere), lit: redH ? 0.95 : 0.85, brick: r() < 0.55 ? 1 : 0, seed: r(), district, kind: 'stack' });
        // A lower tier stepping down behind it, as the Ribbon's blocks do.
        if (r() < 0.6) {
          const d2 = between(r, 5, 8), o2 = off + dep / 2 + d2 / 2;
          const [tx, ty] = [mx + nx * side * o2, my + ny * side * o2];
          if (inside(tx, ty) && toRoad(tx, ty, rd.pts) > d2 / 2 + 0.5 && (!square || Math.hypot(tx - square.x, ty - square.y) > square.R + d2 / 2 + 1)) out.buildings.push({ x: tx, y: ty, w: seg * between(r, 0.8, 1.05), d: d2, h: h * between(r, 0.45, 0.75), z0: 0, a: ang, tint: pick(r, wallsHere), lit: redH ? 0.8 : 0.5, brick: r() < 0.65 ? 1 : 0, seed: r(), district, kind: 'tier' });
        }
        const face = rd.width / 2 + 0.25;
        const at = (o: number, t = 0): [number, number] => [mx + nx * side * o + Math.cos(ang) * t, my + ny * side * o + Math.sin(ang) * t];
        // The quarter's own draws first; on the red stretch, a door left dark is lit from its own stream.
        const door = r() < (isRow ? 0.7 : 0.45) ? r : redH && rr() < 0.9 ? rr : null;
        if (door) {
          const [fx, fy] = at(face);
          out.props.push({ kind: 'shopfront', x: fx, y: fy, z0: 0.4, w: seg * 0.75, d: 0.35, h: 2.2, a: ang, color: pick(door, signsHere) });
        }
        // Lit fronts up the wall too: a window bay, a balcony, a club's upstairs sign.
        for (let z = 4.4; z < h - 2; z += 4) {
          const up = r() < (isRow ? 0.22 : 0.12) ? r : redH && rr() < 0.4 ? rr : null;
          if (!up) continue;
          const [ux, uy] = at(face, between(up, -0.25, 0.25) * seg);
          out.props.push({ kind: 'shopfront', x: ux, y: uy, z0: z, w: seg * between(up, 0.3, 0.6), d: 0.3, h: 1.6, a: ang, color: pick(up, up() < 0.6 ? wallsHere : signsHere) });
        }
        const blade = r() < (isRow ? 0.3 : 0.1) ? r : redH && rr() < 0.5 ? rr : null;
        if (blade && h > 9) {
          const [qx, qy] = at(face - 1.2);
          out.props.push({ kind: 'hanging-sign', x: qx, y: qy, z0: between(blade, 3.5, Math.min(h - 5, 12)), w: 0.35, d: 2.2, h: 4.5, a: ang + Math.PI / 2, color: pick(blade, signsHere) });
        }
        if (r() < 0.3) {
          const [qx, qy] = at(face - 0.3, between(r, -0.3, 0.3) * seg);
          out.props.push({ kind: 'ac', x: qx, y: qy, z0: between(r, 3.5, h - 2), w: 1.1, d: 0.6, h: 0.8, a: ang });
        }
        if (r() < 0.25) out.props.push({ kind: 'tank', x, y, z0: h, w: 2.4, d: 2.4, h: 2.2, a: 0 });
        if (r() < 0.3) out.props.push({ kind: 'ac', x: x + between(r, -seg / 3, seg / 3), y, z0: h, w: 1.3, d: 1, h: 0.8, a: ang });
      }
      // Across the street, between the two fronts: cables, and on the lanes washing on some.
      if (hs.length === 2 && r() < (isRow ? 0.25 : 0.4)) {
        const z = between(r, 4.5, Math.min(...hs) - 1), sag = between(r, 0.5, 1.4), half = rd.width / 2 + 0.3;
        const t = between(r, -0.4, 0.4) * seg;
        const p0: [number, number] = [mx - nx * half + Math.cos(ang) * t, my - ny * half + Math.sin(ang) * t];
        const p1: [number, number] = [mx + nx * half + Math.cos(ang) * t, my + ny * half + Math.sin(ang) * t];
        const pts = Array.from({ length: 6 }, (_, k): [number, number, number] => {
          const u = k / 5;
          return [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, z - 4 * u * (1 - u) * sag];
        });
        out.curves.push({ points: pts, bevel: 0.06, material: 'cable' });
        if (!isRow && r() < 0.5)
          for (let k = 1; k < 5; k++) {
            if (r() < 0.35) continue;
            const [lx, ly, lz] = pts[k]!;
            out.props.push({ kind: 'laundry', x: lx, y: ly, z0: lz - 0.9, w: 0.7, d: 0.08, h: 0.8, a: ang + Math.PI / 2, color: pick(r, LAUNDRY) });
          }
      }
      // Warm lamps down the street wash the walls, as the Ribbon's gap lights do.
      if (i % (isRow ? 3 : 5) === 0) {
        const warm = pick(r, ['#ffb070', '#ff8a5a', '#ffcf9a']);
        out.lights.push({ x: mx, y: my, z: isRow ? 7 : 5, color: red ? pick(rr, RL!.colors) : warm, power: isRow ? 32000 : 16000, radius: 2, reach: isRow ? 60 : 40 });
      } else if (red) out.lights.push({ x: mx, y: my, z: 5, color: pick(rr, RL!.colors), power: 16000, radius: 2, reach: 40 });
    }
  }

  out.distance = (x, y) => {
    let best = toRoad(x, y);
    if (houseAt) best = Math.min(best, Math.max(Math.abs(x - houseAt.x) - houseAt.w / 2, Math.abs(y - houseAt.y) - houseAt.d / 2));
    if (square) best = Math.min(best, Math.hypot(x - square.x, y - square.y) - square.R);
    return best;
  };
  return out;
}
