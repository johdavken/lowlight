// The Strand's seafront: a boardwalk along its coast with stalls, light strings and a few small rides;
// the Low Roller, a giant pink wheel on its pier, seen city-wide; and the old pier running out to the Breakwater with a
// fisherman's lantern at its tip. Steady lights only: nothing blinks.
import type { DistrictStyle } from '../../shared/city-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Place } from '../../shared/map-schema';
import type { Box, Curve, Light, Prop, Strip } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];
type Waterfront = NonNullable<DistrictStyle['waterfront']>;
export interface WaterfrontGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
}

const STRING_COLORS = ['#ffcf7a', '#ffb347', '#ff7fbf'];

/** An edge's direction, length and its normal pointing out to the water. */
function frame([a, b]: [P, P], isLand: (x: number, y: number) => boolean) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const tx = dx / len, ty = dy / len;
  let nx = -ty, ny = tx;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  if (isLand(mx + nx * 14, my + ny * 14) && !isLand(mx - nx * 14, my - ny * 14)) [nx, ny] = [-nx, -ny];
  return { len, tx, ty, nx, ny, ang: Math.atan2(dy, dx) };
}

/** The point on the coast nearest a place's pin with open water for `reach` px straight out (and a margin past it), with
 * that edge's frame; with none clear, the point with the longest run of water. */
type Frame = ReturnType<typeof frame>;
/** `fits`: a spot must also pass this (the wheel: land behind it on screen) to beat any spot that doesn't. */
function nearestCoast(edges: [P, P][], place: Place | undefined, isLand: (x: number, y: number) => boolean, reach: number, margin = 0, fits?: (x: number, y: number, f: Frame) => boolean) {
  const px = place ? (place.pin[0] / 100) * MAP_W : 0, py = place ? (place.pin[1] / 100) * MAP_H : 0;
  const need = reach * 1.25 + 30;
  let best = { score: -Infinity, x: 0, y: 0, e: edges[0]! };
  for (const e of edges) {
    const f = frame(e, isLand);
    // `margin`: keep this far from the edge's corners (the wheel's half-width, so it doesn't hang past a turn of the coast).
    for (let t = Math.max(f.len * 0.15, margin); t <= Math.min(f.len * 0.85, f.len - margin); t += 8) {
      const x = e[0][0] + f.tx * t, y = e[0][1] + f.ty * t;
      let run = 12;
      while (run < need && !isLand(x + f.nx * run, y + f.ny * run)) run += 6;
      const score = (fits && fits(x, y, f) ? 1e7 : 0) + (run >= need ? 1e6 : run * 100) - Math.hypot(px - x, py - y);
      if (score > best.score) best = { score, x, y, e };
    }
  }
  return { x: best.x, y: best.y, ...frame(best.e, isLand) };
}

export function waterfrontGeometry(district: string, cfg: Waterfront, edges: [P, P][], places: Place[], isLand: (x: number, y: number) => boolean): WaterfrontGeometry {
  const out: WaterfrontGeometry = { buildings: [], props: [], strips: [], curves: [], lights: [] };
  if (!edges.length) return out;
  const r = rng(`waterfront:${district}`);
  const box = (b: Omit<Box, 'district' | 'seed'>) => out.buildings.push({ ...b, district, seed: r() });
  const BW = cfg.boardwalk;

  // ── the boardwalk: a deck along each stretch of coast, half over the water, stalls on its landward side, a light string
  // on poles along its seaward rail, and now and then a lamp pool ──
  let longest = { len: 0, e: edges[0]! };
  for (const e of edges) {
    const f = frame(e, isLand);
    if (f.len > longest.len) longest = { len: f.len, e };
    const [a] = e;
    const at = (t: number, o: number): P => [a[0] + f.tx * t + f.nx * o, a[1] + f.ty * t + f.ny * o];
    // In short pieces, so the deck can bend with a natural shore.
    for (let t = -BW.width * 0.3; t < f.len + BW.width * 0.3; t += 8) {
      const [px, py] = at(t + 4, BW.width * 0.3);
      out.strips.push({ x: px, y: py, w: 8.6, d: BW.width, h: 0.5, z0: 0.15, a: f.ang, material: 'walkway' });
    }
    for (let t = BW.stallEvery / 2; t < f.len; t += BW.stallEvery) {
      if (r() < 0.25) continue;
      const w = between(r, 4, 7), d = between(r, 3, 4.5), h = between(r, 2.6, 4.2);
      const [sx, sy] = at(t, BW.width * 0.3 - BW.width / 2 + d / 2 + 0.5);
      const color = pick(r, BW.colors);
      box({ x: sx, y: sy, w, d, h, z0: 0.65, a: f.ang, tint: color, lit: 0.9, brick: 0, kind: 'shack' });
      const [fx, fy] = at(t, BW.width * 0.3 - BW.width / 2 + d + 0.7);
      out.props.push({ kind: 'shopfront', x: fx, y: fy, z0: 1, w: w * 0.8, d: 0.3, h: 1.6, a: f.ang, color });
    }
    // The light string: poles every ~24 px on the seaward rail, warm bulbs sagging between them.
    const spans = Math.max(1, Math.round(f.len / 24));
    const rail = BW.width * 0.3 + BW.width / 2 - 1;
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= spans; k++) {
      const [qx, qy] = at((f.len * k) / spans, rail);
      out.strips.push({ x: qx, y: qy, w: 0.4, d: 0.4, h: 5, z0: 0.65, a: f.ang, material: 'girder' });
      if (k === spans) {
        pts.push([qx, qy, 5.6]);
        break;
      }
      for (let u = 0; u < 6; u++) {
        const [ux, uy] = at((f.len * (k + u / 6)) / spans, rail);
        pts.push([ux, uy, 5.6 - 4 * (u / 6) * (1 - u / 6) * 1.4]);
      }
    }
    out.curves.push({ points: pts, bevel: 0.12, material: 'neon', color: pick(r, STRING_COLORS) });
    for (let t = 40; t < f.len - 20; t += 120) {
      const [lx, ly] = at(t, BW.width * 0.3);
      out.lights.push({ x: lx, y: ly, z: 8, color: pick(r, BW.colors), power: 30000, radius: 2, reach: 50 });
    }
  }

  // ── rides on the longest stretch: a carousel, a drop tower and a small coaster in a row ──
  {
    const f = frame(longest.e, isLand);
    const [a] = longest.e;
    const at = (t: number, o: number): P => [a[0] + f.tx * t + f.nx * o, a[1] + f.ty * t + f.ny * o];
    const ring = (cx: number, cy: number, z: number, rad: number, n = 20): [number, number, number][] =>
      Array.from({ length: n + 1 }, (_, k) => [cx + Math.cos((k / n) * Math.PI * 2) * rad, cy + Math.sin((k / n) * Math.PI * 2) * rad * 0.9, z]);
    // Carousel: a drum under a glowing canopy rim.
    const [kx, ky] = at(f.len * 0.2, BW.width * 0.3);
    out.props.push({ kind: 'tank', x: kx, y: ky, z0: 0.65, w: 7, d: 7, h: 3.2, a: 0 });
    out.props.push({ kind: 'fan', x: kx, y: ky, z0: 3.85, w: 9, d: 9, h: 0.5, a: 0 });
    out.curves.push({ points: ring(kx, ky, 4.1, 4.6), bevel: 0.2, material: 'neon', color: '#ffcf7a' });
    // Drop tower: a mast with a lit ring partway up.
    const [dx, dy] = at(f.len * 0.42, BW.width * 0.3);
    out.strips.push({ x: dx, y: dy, w: 1.4, d: 1.4, h: 44, z0: 0.65, a: f.ang, material: 'girder' });
    out.curves.push({ points: ring(dx, dy, 30, 2), bevel: 0.35, material: 'neon', color: '#7fe9ff' });
    out.props.push({ kind: 'lamp', x: dx, y: dy, z0: 44.6, w: 1, d: 1, h: 1, a: 0, color: '#ff3b5c' });
    // Coaster: a track of humps on girder legs along the deck.
    const track: [number, number, number][] = [];
    const t0 = f.len * 0.55, t1 = Math.min(f.len * 0.9, t0 + 90);
    for (let k = 0; k <= 36; k++) {
      const t = t0 + ((t1 - t0) * k) / 36;
      const z = 3 + 9 * Math.abs(Math.sin((k / 36) * Math.PI * 2.5)) * (1 - k / 60);
      const [tx, ty] = at(t, BW.width * 0.3 + Math.sin((k / 36) * Math.PI * 4) * 2);
      track.push([tx, ty, z]);
      if (k % 3 === 0) out.strips.push({ x: tx, y: ty, w: 0.35, d: 0.35, h: z - 0.6, z0: 0.65, a: f.ang, material: 'girder' });
    }
    out.curves.push({ points: track, bevel: 0.25, material: 'neon', color: '#ff7fbf' });
  }

  // ── the Low Roller: a pier straight out from the coast nearest its place, the wheel at its end, facing the city ──
  {
    const W = cfg.wheel;
    const R = W.height / 2 - 1.5, hz = W.height - R;
    // The map's camera squashes heights (cos 52°), so the wheel leans its top back ~27° to face it and read as a circle.
    const LEAN = (27 * Math.PI) / 180, uy = -Math.sin(LEAN), uz = Math.cos(LEAN);
    // Inland, it faces the camera square while the shore slants: set back far enough that its whole width is over land.
    const setBack = (f: Frame) => (W.pier < 0 ? -Math.max(-W.pier, R * Math.abs(Math.sin(f.ang)) + 6) : W.pier);
    // On the map, what shows behind a point of the rim is the ground north of it by its height × cos(52°): all land, so
    // the wheel reads as standing in the Strand, not over the bay.
    const LIFT = Math.cos((52 * Math.PI) / 180);
    const fits = (x: number, y: number, f: Frame) => {
      const o = setBack(f), cx = x + f.nx * o, cy = y + f.ny * o;
      for (let k = 0; k < 24; k++) {
        const t = (k / 24) * Math.PI * 2;
        const py = cy + Math.sin(t) * R * uy, pz = hz + Math.sin(t) * R * uz;
        if (!isLand(cx + Math.cos(t) * R, py - pz * LIFT)) return false;
      }
      return true;
    };
    const c = nearestCoast(edges, places.find((p) => p.id === W.near), isLand, Math.max(0, W.pier) + W.height / 2, W.height / 2 + 6, fits);
    const out_ = setBack(c);
    const hx = c.x + c.nx * out_, hy = c.y + c.ny * out_;
    // On the boardwalk: a plaza widens the deck under it, out to the wheel's feet.
    out.strips.push({ x: c.x + c.nx * (out_ / 2 + 3), y: c.y + c.ny * (out_ / 2 + 3), w: R * 1.4 + 16, d: Math.abs(out_) + 18, h: 0.55, z0: 0.15, a: c.ang, material: 'walkway' });
    const on = (t: number, rad: number, side: number): [number, number, number] => [hx + Math.cos(t) * rad, hy + side + Math.sin(t) * rad * uy, hz + Math.sin(t) * rad * uz];
    const N = 48;
    for (const side of [-1.6, 1.6]) {
      out.curves.push({ points: Array.from({ length: N + 1 }, (_, k) => on((k / N) * Math.PI * 2, R, side)), bevel: 0.45, material: 'neon', color: W.color, strength: 9 });
      for (let k = 0; k < 16; k++) out.curves.push({ points: [[hx, hy + side, hz], on((k / 16) * Math.PI * 2, R, side)], bevel: 0.12, material: 'cable' });
    }
    // The cars hang under the rim, alternately warm and cyan.
    for (let k = 0; k < 16; k++) {
      const [cx, cy, cz] = on((k / 16) * Math.PI * 2 + 0.1, R, 0);
      out.props.push({ kind: 'lamp', x: cx, y: cy, z0: cz - 2.4, w: 2.2, d: 3, h: 1.8, a: 0, color: k % 2 ? '#7fe9ff' : '#ffcf7a' });
    }
    // The A-frame: four legs from the hub down to the pier.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.strips.push({ x: hx, y: hy, w: 0, d: 1.2, h: 1.2, z0: 0, a: 0, material: 'girder', ends: [[hx, hy + sy * 1.8, hz], [hx + sx * R * 0.55, hy + sy * 5, 0.8]] });
    out.props.push({ kind: 'lamp', x: hx, y: hy, z0: hz - 1, w: 2.4, d: 4.4, h: 2.4, a: 0, color: W.color });
    // The ticket gate at its foot on the boardwalk.
    box({ x: c.x + c.nx * 4, y: c.y + c.ny * 4, w: 10, d: 4, h: 4, z0: 0.65, a: c.ang, tint: W.color, lit: 1, brick: 0, kind: 'shack' });
    out.lights.push({ x: hx, y: hy - 6, z: hz, color: W.color, power: 90000, radius: 6, reach: 110 });
    out.lights.push({ x: c.x + c.nx * 6, y: c.y + c.ny * 6, z: 6, color: '#ffcf7a', power: 40000, radius: 2, reach: 60 });
  }

  // ── the old pier: a long narrow deck on piles, lanterns along it, the Breakwater (upstairs) at its far end and a
  // fisherman's lantern past it ──
  {
    const Q = cfg.pier;
    const c = nearestCoast(edges, places.find((p) => p.id === Q.near), isLand, Q.length);
    const ang = Math.atan2(c.ny, c.nx);
    const at = (t: number, o = 0): P => [c.x + c.nx * t - c.ny * o, c.y + c.ny * t + c.nx * o];
    const [mx, my] = at(Q.length / 2);
    out.strips.push({ x: mx, y: my, w: Q.length, d: Q.width, h: 0.6, z0: 0.3, a: ang, material: 'concrete' });
    for (let t = 6; t < Q.length; t += 10)
      for (const o of [-1, 1]) {
        const [px, py] = at(t, o * (Q.width / 2 - 0.6));
        out.strips.push({ x: px, y: py, w: 0.7, d: 0.7, h: 1.2, z0: -0.6, a: ang, material: 'girder' });
      }
    let k = 0;
    for (let t = 14; t < Q.length - 24; t += 22, k++) {
      const o = (k % 2 ? 1 : -1) * (Q.width / 2 - 0.8);
      const [lx, ly] = at(t, o);
      out.strips.push({ x: lx, y: ly, w: 0.3, d: 0.3, h: 3.4, z0: 0.9, a: ang, material: 'girder' });
      out.props.push({ kind: 'lamp', x: lx, y: ly, z0: 4.3, w: 0.8, d: 0.8, h: 0.9, a: 0, color: '#ffcf7a' });
      if (k % 2 === 0) out.lights.push({ x: lx, y: ly, z: 5, color: '#ffcf7a', power: 9000, radius: 1, reach: 30 });
    }
    // The Breakwater: a grill on the deck, its upstairs room above.
    const [bx, by] = at(Q.length - 14);
    box({ x: bx, y: by, w: 16, d: 20, h: 6, z0: 0.9, a: ang, tint: '#ffb347', lit: 0.9, brick: 0, kind: 'building' });
    box({ x: bx, y: by, w: 12, d: 14, h: 5, z0: 6.9, a: ang, tint: '#ffcf7a', lit: 1, brick: 0, kind: 'building' });
    const [sx, sy] = at(Q.length - 25, Q.width / 2 + 1);
    out.props.push({ kind: 'sign', x: sx, y: sy, z0: 7, w: 6, d: 0.4, h: 1.6, a: ang, color: '#ff7a3c' });
    out.lights.push({ x: bx, y: by, z: 9, color: '#ffb347', power: 50000, radius: 3, reach: 60 });
    const [fx, fy] = at(Q.length + 1);
    out.props.push({ kind: 'lamp', x: fx, y: fy, z0: 3.4, w: 0.9, d: 0.9, h: 1, a: 0, color: '#ffd27a' });
    out.strips.push({ x: fx, y: fy, w: 0.3, d: 0.3, h: 3.2, z0: 0.9, a: ang, material: 'girder' });
    out.lights.push({ x: fx, y: fy, z: 4.5, color: '#ffd27a', power: 14000, radius: 1, reach: 40 });
  }
  return out;
}
