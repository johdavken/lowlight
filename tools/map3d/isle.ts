// Tidal Isle ("cliffs of varying heights", then natural rock below and built terraces above, Alcatraz for
// reference). A rock in the bay: a low quay apron round much of it at the water, natural cliffs where the apron gives out,
// vegetated slopes climbing to a ridge along the isle's long axis, highest at the QDF's end. Buildings stand one by one on
// pads cut into the slope and held up by retaining walls, along switchback roads that wind up from the docks. Steady light.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor, type Place } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Light, Prop, Strip, TerrainGrid } from './geometry';
import { between, pick, rng } from './rng';
import { noise2 } from './terrain';

type P = [number, number];
type Isle = NonNullable<DistrictStyle['isle']>;
export interface IsleGeometry {
  grid: TerrainGrid & { id: string };
  /** The ground's height at a point (map px; -1 off the isle). */
  heightAt: (x: number, y: number) => number;
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  lights: Light[];
  /** From a point to the nearest pad or road (map px; negative on one). */
  distance: (x: number, y: number) => number;
}

const pct = (p: readonly number[]): P => [(p[0]! / 100) * MAP_W, (p[1]! / 100) * MAP_H];
const WARM = ['#ffc27a', '#ffb060', '#ffd9a0'];

function segDist(x: number, y: number, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

/** `others`: the other districts' borders; the natural shore keeps a channel of at least 50 px from them. */
export function isleGeometry(district: string, cfg: Isle, border: Anchor[], places: Place[], others: Anchor[][] = []): IsleGeometry {
  const pts = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const toEdge = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) best = Math.min(best, segDist(x, y, pts[i]!, pts[(i + 1) % pts.length]!));
    return best;
  };
  const r = rng(`isle:${district}`);
  // The natural shore ("the map border is just administrative"): the rock's edge wanders in and out of
  // the drawn border by up to `coast.amp` px, two octaves of noise, so headlands, coves and outcrops replace its segments.
  const shoreA = noise2(`isle:${district}:shore`), shoreB = noise2(`isle:${district}:shore2`);
  const otherPts = others.map((b) => b.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]));
  const toOther = (x: number, y: number) => {
    let best = Infinity;
    for (const op of otherPts) for (let i = 0; i < op.length; i++) best = Math.min(best, segDist(x, y, op[i]!, op[(i + 1) % op.length]!));
    return best;
  };
  const edge = (x: number, y: number) => {
    const sd = inside(x, y) ? toEdge(x, y) : -toEdge(x, y);
    const e = sd + cfg.coast.amp * (shoreA(x * 0.007, y * 0.007) * 0.7 + shoreB(x * 0.028, y * 0.028) * 0.3);
    // Never closer than about a 60 px channel to another district; the channel's width wanders (60–125 px) so that stretch of
    // shore isn't a straight line along the neighbour's border, and the two limits blend (a soft min) without a corner.
    // Everywhere, not only near the isle's own edge: its drawn border touches Drownworks at a corner.
    if (!(e > 0 && otherPts.length)) return e;
    const c = toOther(x, y) - (92 + 22 * shoreB(x * 0.02 + 7, y * 0.02 + 3) + 10 * shoreA(x * 0.06, y * 0.06));
    const k = 12;
    return -k * Math.log(Math.exp(-e / k) + Math.exp(-c / k));
  };
  const rough = noise2(`isle:${district}:rough`), cliffN = noise2(`isle:${district}:cliff`), apronN = noise2(`isle:${district}:apron`);
  const [r0, r1] = [pct(cfg.ridge.from), pct(cfg.ridge.to)];
  const ridgeT = (x: number, y: number) => {
    const dx = r1[0] - r0[0], dy = r1[1] - r0[1];
    return Math.max(0, Math.min(1, ((x - r0[0]) * dx + (y - r0[1]) * dy) / (dx * dx + dy * dy)));
  };
  // The natural ground: the apron (quay level) at the coast, or a cliff where the apron gives out; then the slope rising
  // to the ridge, its crest higher toward the ridge's `from` end (the QDF's).
  // The coast point nearest a point: cliff or apron is the coast's choice, so the whole slope behind it agrees.
  const nearestCoast = (x: number, y: number): P => {
    let best: P = pts[0]!, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!, dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const q: P = [a[0] + t * dx, a[1] + t * dy], dd = Math.hypot(q[0] - x, q[1] - y);
      if (dd < bd) [best, bd] = [q, dd];
    }
    return best;
  };
  const ground = (x: number, y: number) => {
    const d = edge(x, y);
    if (d < 0) return -1;
    const [kx, ky] = nearestCoast(x, y);
    // How cliffy this stretch of coast is, 0 (apron) to 1 (cliff), eased so neighbours blend without seams.
    const cv = Math.max(0, Math.min(1, (cliffN(kx * 0.006, ky * 0.006) - cfg.cliffShare + 0.15) / 0.3));
    const c = cv * cv * (3 - 2 * cv);
    const apron = (1 - c) * cfg.apron * (0.6 + 0.8 * (apronN(kx * 0.01, ky * 0.01) * 0.5 + 0.5));
    if (d < apron) return cfg.quay * (1 - c);
    const rd = segDist(x, y, r0, r1);
    const crest = cfg.ridge.high + (cfg.ridge.low - cfg.ridge.high) * ridgeT(x, y);
    const t = Math.max(0, Math.min(1, (d - apron) / (d - apron + rd + 1)));
    const base = cfg.quay * (1 - c);
    // A rock step off the apron (a full cliff off the water where it's cliffy), then the slope easing to the crest.
    const step = Math.min(1, (d - apron) / cfg.face);
    const lift = (cfg.ledge + (cfg.cliff - cfg.ledge) * c) * Math.pow(step, 0.3);
    return Math.max(base, base + lift + (crest - base - lift) * Math.pow(t, 0.8) + rough(x * 0.03, y * 0.03) * 2.5);
  };
  const step = 2;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad0 = cfg.coast.amp + step;
  const x0 = Math.min(...xs) - pad0, y0 = Math.min(...ys) - pad0;
  const cols = Math.ceil((Math.max(...xs) + pad0 - x0) / step) + 2, rows = Math.ceil((Math.max(...ys) + pad0 - y0) / step) + 2;
  const hs: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) hs.push(ground(x0 + i * step, y0 + j * step));
  // Smooth the slopes (not the shore): distance to a polygon creases along its corners' bisectors; a few blurs of the
  // land above the ledge take the creases out.
  for (let pass = 0; pass < 6; pass++) {
    const src = hs.slice();
    for (let j = 2; j < rows - 2; j++)
      for (let i = 2; i < cols - 2; i++) {
        const k = j * cols + i;
        if (src[k]! < cfg.quay + cfg.ledge) continue;
        let sum = 0, n = 0;
        for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) {
          const q = src[k + v * cols + u]!;
          if (q >= 0) { sum += q; n++; }
        }
        hs[k] = Math.max(cfg.quay + cfg.ledge, sum / n);
      }
  }
  const idx = (x: number, y: number) => {
    const i = Math.round((x - x0) / step), j = Math.round((y - y0) / step);
    return i >= 0 && j >= 0 && i < cols && j < rows ? j * cols + i : -1;
  };
  const hAt = (x: number, y: number) => {
    const k = idx(x, y);
    return k < 0 ? -1 : hs[k]!;
  };
  const grad = (x: number, y: number): P => [(hAt(x + 9, y) - hAt(x - 9, y)) / 18, (hAt(x, y + 9) - hAt(x, y - 9)) / 18];

  const out: IsleGeometry = { grid: { id: district, x0, y0, step, cols, rows, heights: [] }, heightAt: hAt, buildings: [], props: [], strips: [], lights: [], distance: () => Infinity };
  const box = (b: Omit<Box, 'district' | 'seed'>) => out.buildings.push({ ...b, district, seed: r() });

  // ── roads: switchbacks from the quay up to the ridge (laid before the pads, which keep off them) ──
  const roads: P[][] = [];
  const cxm = xs.reduce((s2, v) => s2 + v, 0) / xs.length, cym = ys.reduce((s2, v) => s2 + v, 0) / ys.length;
  for (const road of cfg.roads.paths) {
    const given = pct(road.from);
    // Start on the quay: walk out from the isle's middle until the ground is at quay level.
    let [x, y] = given;
    const oa = Math.atan2(y - cym, x - cxm);
    // A start in the water (the natural shore curves in there): step inland onto the rock first.
    for (let k = 0; k < 80 && hAt(x, y) < 0; k++) [x, y] = [x - Math.cos(oa) * 3, y - Math.sin(oa) * 3];
    for (let k = 0; k < 80 && hAt(x, y) > cfg.quay + 0.5; k++) {
      const nx2 = x + Math.cos(oa) * 3, ny2 = y + Math.sin(oa) * 3;
      if (hAt(nx2, ny2) < 0) break;
      [x, y] = [nx2, ny2];
    }
    // Legs at ±`turn`° to the climb toward its end (a point given, else the nearest point of the ridge), each about `leg`
    // long, until it's reached.
    const t2 = ridgeT(x, y);
    const [tx, ty] = road.to ? pct(road.to) : [r0[0] + (r1[0] - r0[0]) * t2, r0[1] + (r1[1] - r0[1]) * t2];
    const turn = ((road.turn ?? 60) * Math.PI) / 180, legL = road.leg ?? cfg.roads.leg;
    const climb = Math.atan2(ty - y, tx - x);
    const path: P[] = [[x, y]];
    let dir = 1;
    // Until it has climbed level with its end (the zigzag swings wide, so distance alone can miss it).
    const ahead = () => (tx - x) * Math.cos(climb) + (ty - y) * Math.sin(climb);
    for (let leg = 0; leg < 40 && ahead() > legL * Math.cos(turn) * 0.5; leg++) {
      const a2 = climb + dir * turn + between(r, -0.15, 0.15), L = legL * between(r, 0.75, 1.25);
      for (let d2 = 4; d2 <= L; d2 += 4) {
        const nx2 = x + Math.cos(a2) * 4, ny2 = y + Math.sin(a2) * 4;
        // Off the rock, or nearer the water than 4 px and getting nearer (a road starting on the shore may leave it).
        if (hAt(nx2, ny2) < 0 || (edge(nx2, ny2) < 4 && edge(nx2, ny2) < edge(x, y))) break;
        [x, y] = [nx2, ny2];
        path.push([x, y]);
      }
      dir = -dir;
    }
    path.push([tx, ty]);
    roads.push(path);
  }
  const onRoad = (x: number, y: number, m: number) => roads.some((path) => path.some((q, k) => k < path.length - 1 && segDist(x, y, q, path[k + 1]!) < m));

  // ── pads: flat terraces cut into the slope, squared to the contour, each a building on it and a retaining wall below ──
  type Pad = { x: number; y: number; w: number; d: number; a: number; z: number };
  const pads: Pad[] = [];
  const padHit = (x: number, y: number, m = 0) =>
    pads.some((p) => {
      const c = Math.cos(-p.a), s = Math.sin(-p.a), dx = x - p.x, dy = y - p.y;
      return Math.abs(dx * c - dy * s) < p.w / 2 + m && Math.abs(dx * s + dy * c) < p.d / 2 + m;
    });
  const flatten = (p: Pad) => {
    const c = Math.cos(p.a), s = Math.sin(p.a);
    for (let u = -p.w / 2; u <= p.w / 2; u += 1) for (let v = -p.d / 2; v <= p.d / 2; v += 1) {
      const k = idx(p.x + u * c - v * s, p.y + u * s + v * c);
      if (k >= 0 && hs[k]! >= 0) hs[k] = p.z;
    }
  };
  const tryPad = (x: number, y: number, w: number, d: number, minH: number) => {
    const h = hAt(x, y);
    // On the rock, back from its shore, and inside the district (buildings keep to the administrative line).
    if (h < minH || edge(x, y) < cfg.apron + 8 || !inside(x, y) || toEdge(x, y) < 6) return null;
    const [gx, gy] = grad(x, y);
    // Long side along the contour (perpendicular to the slope).
    const a = Math.atan2(gx, -gy);
    const c = Math.cos(a), s = Math.sin(a);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => hAt(x + (u! * w * c) / 2 - (v! * d * s) / 2, y + (u! * w * s) / 2 + (v! * d * c) / 2));
    if (Math.min(...corners) < minH - 4 || Math.max(...corners) - Math.min(...corners) > cfg.maxCut) return null;
    if (padHit(x, y, Math.max(w, d) / 2 + 6)) return null;
    if (onRoad(x, y, Math.max(w, d) / 2 + 4)) return null;
    const p = { x, y, w, d, a, z: (Math.max(...corners) + Math.min(...corners)) / 2 };
    pads.push(p);
    return p;
  };
  // The QDF first, on the high end.
  const Q = cfg.qdf;
  const [qx, qy] = pct(Q.at);
  const qpad: Pad = { x: qx, y: qy, w: Q.w + 30, d: Q.d + 24, a: 0, z: hAt(qx, qy) };
  pads.push(qpad);
  // Halls along the ridge, smaller blocks down the slopes.
  for (let k = 0; k < 4000 && pads.length < cfg.pads; k++) {
    const t = r(), side = r() < 0.5 ? -1 : 1, off = between(r, 0, 1) ** 1.4 * cfg.spread;
    const along: P = [r0[0] + (r1[0] - r0[0]) * t, r0[1] + (r1[1] - r0[1]) * t];
    const nx = -(r1[1] - r0[1]), ny = r1[0] - r0[0], nl = Math.hypot(nx, ny);
    const x = along[0] + (nx / nl) * side * off, y = along[1] + (ny / nl) * side * off;
    const hall = off < cfg.spread * 0.3 && r() < 0.6;
    tryPad(x, y, hall ? between(r, 28, 42) : between(r, 10, 20), hall ? between(r, 13, 18) : between(r, 8, 13), cfg.quay + cfg.ledge * 0.8);
  }
  for (const p of pads) flatten(p);

  let lampN = 0;
  for (const path of roads)
    for (let k = 0; k < path.length - 1; k++) {
      const [a, b] = [path[k]!, path[k + 1]!];
      const za = Math.max(0, hAt(...a)) + 0.15, zb = Math.max(0, hAt(...b)) + 0.15;
      out.strips.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w: 0, d: 4.5, h: 0.2, z0: Math.min(za, zb), a: Math.atan2(b[1] - a[1], b[0] - a[0]), material: 'street', ends: [[a[0], a[1], za], [b[0], b[1], zb]] });
      if (k % 3 === 0) {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), sd = lampN++ % 2 ? 1 : -1;
        const lx = a[0] - Math.sin(ang) * sd * 3, ly = a[1] + Math.cos(ang) * sd * 3;
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: za + 3, w: 1.3, d: 1.3, h: 0.6, a: 0, color: '#ff9a48' });
        if (lampN % 3 === 0) out.lights.push({ x: lx, y: ly, z: za + 7, color: '#ffa860', power: 16000, radius: 5, reach: 40 });
      }
    }
  // The surf line and the quay lamps follow the real shore: every land cell with water beside it.
  let sn = 0;
  for (let j = 1; j < rows - 1; j++)
    for (let i = 1; i < cols - 1; i++) {
      const k = j * cols + i, h = hs[k]!;
      if (h < 0) continue;
      const wet = [k - 1, k + 1, k - cols, k + cols].filter((q) => hs[q]! < 0);
      if (!wet.length || sn++ % 2) continue;
      const x = x0 + i * step, y = y0 + j * step;
      out.strips.push({ x, y, w: 2.6, d: 2.6, h: 0.15, z0: -0.45, a: 0, material: 'street-light', color: '#5a6c84' });
      if (Math.abs(h - cfg.quay) < 0.6 && sn % 12 === 1) out.props.push({ kind: 'lamp', x, y, z0: cfg.quay + 3, w: 0.8, d: 0.8, h: 0.5, a: 0, color: '#ffb060' });
    }

  // ── buildings on the pads, retaining walls below them ──
  for (const p of pads) {
    const c = Math.cos(p.a), s = Math.sin(p.a);
    // The wall along each long side where the natural ground falls away below the pad.
    for (const sd of [-1, 1]) {
      const wx = p.x - s * sd * (p.d / 2 + 0.6), wy = p.y + c * sd * (p.d / 2 + 0.6);
      const below = ground(wx - s * sd * 3, wy + c * sd * 3);
      if (below < 0 || below > p.z - 1.5) continue;
      out.strips.push({ x: wx, y: wy, w: p.w + 1.2, d: 1.2, h: p.z - below + 1, z0: below, a: p.a, material: 'concrete' });
      for (let u = -p.w / 2 + 3; u < p.w / 2; u += 7) out.props.push({ kind: 'lamp', x: wx + u * c, y: wy + u * s, z0: p.z + 1.2, w: 0.6, d: 0.6, h: 0.4, a: 0, color: '#ffc27a' });
    }
    if (p === qpad) continue;
    const big = p.w > 26;
    const h = big ? between(r, 9, 14) : between(r, 6, 11);
    box({ x: p.x, y: p.y, w: p.w - 3, d: p.d - 3, h, z0: p.z, a: p.a, tint: pick(r, WARM), lit: big ? 0.55 : 0.65, brick: r() < 0.5 ? 1 : 0, kind: 'building' });
    if (big) for (let u = -p.w / 2 + 5; u < p.w / 2 - 3; u += 7) out.props.push({ kind: 'shopfront', x: p.x + u * c, y: p.y + u * s, z0: p.z + h + 0.05, w: 4, d: 1.6, h: 0.2, a: p.a, color: '#ff9a48' });
    out.lights.push({ x: p.x, y: p.y, z: p.z + h + 6, color: '#ffa860', power: big ? 18000 : 9000, radius: 5, reach: 40 });
  }

  // ── trees and scrub on the slopes, off the pads and roads ──
  const veg = noise2(`isle:${district}:veg`);
  let trees = 0;
  for (let k = 0; k < cfg.trees * 6 && trees < cfg.trees; k++) {
    const x = between(r, Math.min(...xs), Math.max(...xs)), y = between(r, Math.min(...ys), Math.max(...ys)), h = hAt(x, y);
    if (h < cfg.quay + 1 || veg(x * 0.02, y * 0.02) < -0.1 || padHit(x, y, 3) || onRoad(x, y, 4)) continue;
    out.props.push({ kind: 'pine', x, y, z0: h - 0.3, w: between(r, 2.2, 3.6), d: 3, h: between(r, 4, 9), a: 0 });
    trees++;
  }

  // ── the QDF: a stepped dark mass inside a perimeter wall, watchtowers at the corners, a lit yard ──
  const qz = qpad.z;
  box({ x: qx, y: qy, w: Q.w, d: Q.d, h: Q.h, z0: qz, a: 0, tint: '#9fb4d8', lit: 0.06, brick: 0, kind: 'building' });
  box({ x: qx, y: qy, w: Q.w * 0.55, d: Q.d * 0.55, h: Q.h * 0.4, z0: qz + Q.h, a: 0, tint: '#9fb4d8', lit: 0.04, brick: 0, kind: 'building' });
  for (const s2 of [-1, 1]) box({ x: qx + s2 * (Q.w / 2 + 6), y: qy + 4, w: 12, d: Q.d * 0.7, h: Q.h * 0.6, z0: qz, a: 0, tint: '#9fb4d8', lit: 0.05, brick: 0, kind: 'building' });
  const ww = qpad.w - 4, wd = qpad.d - 4;
  for (const [cx2, cy2, len, an] of [[qx, qy - wd / 2, ww, 0], [qx, qy + wd / 2, ww, 0], [qx - ww / 2, qy, wd, Math.PI / 2], [qx + ww / 2, qy, wd, Math.PI / 2]] as const)
    out.strips.push({ x: cx2, y: cy2, w: len, d: 1.6, h: 6, z0: qz, a: an, material: 'concrete' });
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    box({ x: qx + (u * ww) / 2, y: qy + (v * wd) / 2, w: 4, d: 4, h: 16, z0: qz, a: 0, tint: '#cfe2ff', lit: 0.3, brick: 0, kind: 'tower' });
    out.props.push({ kind: 'lamp', x: qx + (u * ww) / 2, y: qy + (v * wd) / 2, z0: qz + 16, w: 1.6, d: 1.6, h: 1, a: 0, color: '#cfe2ff' });
  }
  out.strips.push({ x: qx, y: qy + Q.d / 2 + 6, w: Q.w + 16, d: 8, h: 0.15, z0: qz + 0.05, a: 0, material: 'street-light', color: '#3a4458' });
  for (const [u, v] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const)
    out.lights.push({ x: qx + u * (Q.w / 2 + 10), y: qy + v * (Q.d / 2 + 10), z: qz + 6, color: '#cfe2ff', power: 40000, radius: 2, reach: 50 });

  // ── the Ferry Stairs: from the slope above its place, flights down to a landing on the water ──
  const S = cfg.stairs;
  const pin = places.find((p) => p.id === S.near);
  if (pin) {
    const [px, py] = pct(pin.pin);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const ang = Math.atan2(py - my, px - mx), ox = Math.cos(ang), oy = Math.sin(ang);
    let tx = px, ty = py;
    for (let k = 0; k < 120 && hAt(tx + ox * 3, ty + oy * 3) > 0.5; k++) [tx, ty] = [tx + ox * 3, ty + oy * 3];
    const topZ = Math.max(hAt(px, py), 8);
    const flights = 4, run = 14, nx = -oy, ny = ox;
    let z = topZ, sx = tx - ox * 6, sy = ty - oy * 6;
    for (let f = 0; f < flights; f++) {
      const dir = f % 2 ? -1 : 1, z1 = z - topZ / flights;
      const ex = sx + nx * dir * run + ox * 2, ey = sy + ny * dir * run + oy * 2;
      out.strips.push({ x: (sx + ex) / 2, y: (sy + ey) / 2, w: 0, d: 2.2, h: 0.5, z0: z1, a: Math.atan2(ey - sy, ex - sx), material: 'stair', ends: [[sx, sy, z], [ex, ey, Math.max(0.3, z1)]] });
      out.props.push({ kind: 'lamp', x: ex, y: ey, z0: Math.max(0.3, z1) + 2.6, w: 0.8, d: 0.8, h: 0.6, a: 0, color: '#ffc27a' });
      [sx, sy, z] = [ex, ey, z1];
    }
    const lx = sx + ox * 6, ly = sy + oy * 6;
    out.strips.push({ x: lx, y: ly, w: 26, d: 8, h: 1, z0: -0.6, a: Math.atan2(ny, nx), material: 'concrete' });
    for (let k = 0; k < 3; k++) {
      const fx = lx + ox * (10 + k * 9) + nx * 5, fy = ly + oy * (10 + k * 9) + ny * 5;
      box({ x: fx, y: fy, w: 7, d: 3, h: 1.8, z0: -0.5, a: ang, tint: '#ffc27a', lit: 0.5, brick: 0, kind: 'car' });
      out.props.push({ kind: 'lamp', x: fx, y: fy, z0: 1.6, w: 0.5, d: 0.5, h: 0.5, a: 0, color: '#ffc27a' });
    }
    out.lights.push({ x: lx, y: ly, z: 4, color: '#ffc27a', power: 16000, radius: 2, reach: 45 });
  }

  out.grid.heights = hs.map((h) => Math.round(h * 10) / 10);
  out.distance = (x, y) => (padHit(x, y) || onRoad(x, y, 3) ? -1 : Infinity);
  return out;
}
