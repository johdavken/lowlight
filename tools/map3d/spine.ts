// The Spine (lore: the-spine, pylon-forty, the-catwalk, deck-market, the-long-haul): a superhighway raised on enormous
// pylons from Iron Reach past Nexus to Karasu and down toward the Marsh, taller than nearly everything. People live in it:
// hab rings cut into the pylons, container habs hung on cables under the deck, a night market in the dark beneath it.
import { MAP_H, MAP_W, pinHeight } from '../../shared/map-projection';
import type { SpineStructure } from '../../shared/city-schema';
import type { Place } from '../../shared/map-schema';
import type { Box, Curve, Light, Prop, Strip } from './geometry';
import { CLEARANCE } from './lots';
import { between, pick, rng } from './rng';
import { offsetPath, resample, smooth } from './structure';

type P = [number, number];
const WARM = ['#ffb347', '#ff9a3c', '#ffcf7a', '#ff8c3a'];
const BULBS = ['#ffcf7a', '#ffb347', '#ff4f8b', '#ff2a3a'];

function segDist(px: number, py: number, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

export interface SpineGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
  pinHeights: Record<string, number>;
  /** For the city's lots: under CLEARANCE only right around a pylon (the street under the deck stays open). */
  distance: (x: number, y: number) => number;
  /** Whether a point is under the deck. */
  under: (x: number, y: number) => boolean;
  /** The 8× corridor around the deck, map px. */
  along: P[];
}

/** `avoid`: from a point to another structure's outer face (the Ribbon); no pylon stands inside it. */
export function spineGeometry(s: SpineStructure, places: Place[], avoid: ((x: number, y: number) => number) | null): SpineGeometry {
  const r = rng(`spine:${s.id}`);
  const D = s.deckHeight, W = s.deckWidth;
  const route = smooth(s.route.map(([x, y]) => [(x / 100) * MAP_W, (y / 100) * MAP_H] as P));
  const even = resample(route, 6);
  const n = even.length;
  const out: SpineGeometry = { buildings: [], props: [], strips: [], curves: [], lights: [], pinHeights: {}, distance: () => Infinity, under: () => false, along: [] };
  const placePx = (id: string): P | null => {
    const p = places.find((q) => q.id === id);
    return p ? [(p.pin[0] / 100) * MAP_W, (p.pin[1] / 100) * MAP_H] : null;
  };
  const near = (q: P | null, x: number, y: number, d: number) => !!q && Math.hypot(x - q[0], y - q[1]) < d;
  const catwalkAt = s.catwalk ? placePx(s.catwalk.place) : null;

  // The deck: road, crash barriers, the light trails of the traffic, its dark underside; sodium lamps on the outer edges.
  let lampRun = 0;
  for (let i = 0; i < n - 1; i++) {
    const [a, b] = [even[i]!, even[i + 1]!];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const at = (o: number): P => [mx + nx * o, my + ny * o];
    out.strips.push({ x: mx, y: my, w: seg * 1.03, d: W, h: 4, z0: D - 4, a: ang, material: 'road' });
    out.strips.push({ x: mx, y: my, w: seg * 1.03, d: W - 2, h: 0.6, z0: D - 5.2, a: ang, material: 'soffit' });
    for (const side of [-1, 1]) {
      const [bx, by] = at(side * (W / 2 - 0.5));
      out.strips.push({ x: bx, y: by, w: seg * 1.03, d: 0.6, h: 1.4, z0: D, a: ang, material: 'rail' });
      // The deck's concrete edge, a band you can see from the street.
      const [fx, fy] = at(side * (W / 2 + 0.4));
      out.strips.push({ x: fx, y: fy, w: seg * 1.03, d: 0.8, h: 7, z0: D - 7, a: ang, material: 'girder' });
      // Traffic: now and then a short run of car lights in one of three lanes, headlights one way, tail lights the other.
      for (const lane of [0.18, 0.32, 0.44]) {
        if (r() > 0.22) continue;
        const [tx, ty] = at(side * W * lane);
        const len = between(r, 2.5, Math.min(7, seg));
        out.strips.push({ x: tx, y: ty, w: len, d: 0.45, h: 0.2, z0: D + 0.1, a: ang, material: side < 0 ? 'car-red' : 'car-white' });
      }
    }
    out.strips.push({ x: mx, y: my, w: seg * 1.03, d: 1.2, h: 1, z0: D, a: ang, material: 'rail' });
    lampRun += seg;
    if (lampRun >= s.lampEvery) {
      lampRun = 0;
      const side = i % 2 === 0 ? 1 : -1;
      const [lx, ly] = at(side * (W / 2 - 1.2));
      out.props.push({ kind: 'mast', x: lx, y: ly, z0: D, w: 0.3, d: 0.3, h: 6, a: 0 });
      out.props.push({ kind: 'lamp', x: lx - nx * side * 1.2, y: ly - ny * side * 1.2, z0: D + 5.6, w: 0.9, d: 0.9, h: 0.5, a: 0, color: '#ffb347' });
      out.lights.push({ x: lx, y: ly, z: D + 5, color: '#ffb347', power: 45000, radius: 1.2, reach: 70 });
    }
    // The catwalk along the outer edge near its place, a yellow beacon at its end.
    if (s.catwalk && near(catwalkAt, mx, my, 70)) {
      const [cx, cy] = at(s.catwalk.side * (W / 2 + 1));
      out.strips.push({ x: cx, y: cy, w: seg * 1.02, d: 1.4, h: 0.3, z0: D - 1.5, a: ang, material: 'walkway' });
      out.strips.push({ x: cx + nx * s.catwalk.side * 0.7, y: cy + ny * s.catwalk.side * 0.7, w: seg * 1.02, d: 0.12, h: 1, z0: D - 1.2, a: ang, material: 'rail' });
    }
  }
  if (s.catwalk && catwalkAt) {
    const i = nearestIdx(even, catwalkAt);
    const [a, b] = [even[Math.min(i + 10, n - 2)]!, even[Math.min(i + 11, n - 1)]!];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const x = a[0] - Math.sin(ang) * s.catwalk.side * (W / 2 + 1), y = a[1] + Math.cos(ang) * s.catwalk.side * (W / 2 + 1);
    out.props.push({ kind: 'lamp', x, y, z0: D - 1.2, w: 1, d: 1, h: 1, a: 0, color: '#ffd23a' });
    out.lights.push({ x, y, z: D + 1, color: '#ffd23a', power: 20000, radius: 1, reach: 40 });
  }

  // Pylons by distance along the route, kept out of the Ribbon; the landmark (Pylon Forty) bigger and busier.
  const pylons: { x: number; y: number; a: number; w: number; d: number }[] = [];
  const landmarkAt = s.landmark ? placePx(s.landmark.place) : null;
  let landmarkPylon = -1, landmarkBest = Infinity;
  const arc: number[] = [0];
  for (let i = 1; i < n; i++) arc.push(arc[i - 1]! + Math.hypot(even[i]![0] - even[i - 1]![0], even[i]![1] - even[i - 1]![1]));
  for (let d = s.pylonEvery / 2; d < arc.at(-1)!; d += s.pylonEvery) {
    let placed = false;
    for (const shift of [0, 12, -12, 24, -24]) {
      const t = d + shift;
      const i = Math.max(0, Math.min(n - 2, arc.findIndex((v) => v > t) - 1));
      const [a, b] = [even[i]!, even[i + 1]!];
      const u = Math.max(0, Math.min(1, (t - arc[i]!) / (arc[i + 1]! - arc[i]! || 1)));
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      if (avoid && avoid(x, y) < Math.hypot(s.pylon.w, s.pylon.d) / 2 + 2) continue;
      pylons.push({ x, y, a: Math.atan2(b[1] - a[1], b[0] - a[0]), w: s.pylon.w, d: s.pylon.d });
      if (landmarkAt) {
        const dl = Math.hypot(x - landmarkAt[0], y - landmarkAt[1]);
        if (dl < landmarkBest) [landmarkBest, landmarkPylon] = [dl, pylons.length - 1];
      }
      placed = true;
      break;
    }
    void placed;
  }
  pylons.forEach((p, k) => {
    const big = k === landmarkPylon && s.landmark;
    const w = big ? s.landmark!.w : p.w, d = big ? s.landmark!.d : p.d;
    p.w = w;
    p.d = d;
    // A bare concrete column (no windows), a hammerhead cap under the deck, and its hab rings: glowing bands cut into the
    // concrete, a few near the top on most pylons, nine on the landmark.
    const CAP = 7;
    out.buildings.push({ x: p.x, y: p.y, w, d, h: D - 4 - CAP, z0: 0, a: p.a, tint: '#ffb347', lit: 0, brick: 0, seed: r(), district: 'spine', kind: 'pylon' });
    out.strips.push({ x: p.x, y: p.y, w: w * 0.9, d: W * 0.92, h: CAP, z0: D - 4 - CAP, a: p.a, material: 'concrete' });
    const rings = big ? 9 : 1 + Math.floor(r() * 3);
    for (let ring = 0; ring < rings; ring++) {
      const z = big ? 6 + ring * ((D - 4 - CAP - 10) / 8) : D - 4 - CAP - 6 - ring * s.ringHeight;
      out.props.push({ kind: 'ring', x: p.x, y: p.y, z0: z, w: w + 0.6, d: d + 0.6, h: 1.4, a: p.a, color: pick(r, WARM) });
    }
    // An expansion joint over each pylon.
    out.strips.push({ x: p.x, y: p.y, w: 0.8, d: W, h: 0.1, z0: D + 0.05, a: p.a, material: 'slab' });
  });

  // Habs at the foot of each pylon, stacked against the concrete, and low habs lining the street under the deck between
  // pylons (a lane left open down the middle): the neighbourhoods in the dark under the road.
  const hab = (x: number, y: number, w: number, d: number, h: number, z0: number, a: number) => {
    if (avoid && avoid(x, y) < Math.hypot(w, d) / 2 + 1) return;
    out.buildings.push({ x, y, w, d, h, z0, a, tint: pick(r, WARM), lit: between(r, 0.35, 0.7), brick: r() < 0.4 ? 1 : 0, seed: r(), district: 'spine', kind: 'building' });
  };
  const HAB_TOP = D - 40;
  for (const p of pylons) {
    const ring = Math.hypot(p.w, p.d) / 2;
    const count = 7 + Math.floor(r() * 6);
    for (let k = 0; k < count; k++) {
      const t = (k / count) * Math.PI * 2 + between(r, -0.2, 0.2);
      const rad = ring + between(r, 2, 10);
      const x = p.x + Math.cos(t) * rad, y = p.y + Math.sin(t) * rad;
      const w = between(r, 3.5, 6.5), d = between(r, 3, 5);
      const h1 = between(r, 3.5, 9);
      hab(x, y, w, d, h1, 0, p.a + between(r, -0.3, 0.3));
      // Now and then another stacked on top, climbing the pylon.
      if (r() < 0.45 && h1 + 6 < HAB_TOP) hab(x - Math.cos(t) * 1.2, y - Math.sin(t) * 1.2, w * 0.8, d * 0.8, between(r, 3, 6), h1, p.a);
    }
  }
  for (let k = 0; k < pylons.length - 1; k++) {
    const p = pylons[k]!, q = pylons[k + 1]!;
    const span = Math.hypot(q.x - p.x, q.y - p.y);
    if (span > s.pylonEvery * 1.8) continue;
    const ang = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(ang), ny = Math.cos(ang);
    const pr0 = Math.hypot(p.w, p.d) / 2 + 12, pr1 = Math.hypot(q.w, q.d) / 2 + 12;
    for (const side of [-1, 1]) {
      for (let u = pr0; u < span - pr1; u += between(r, 5, 8)) {
        const w = between(r, 4, 6.5), d = between(r, 4, 7);
        const o = side * between(r, 7, W / 2 - 2);
        hab(p.x + Math.cos(ang) * u + nx * o, p.y + Math.sin(ang) * u + ny * o, w, d, between(r, 3, 10), 0, ang + between(r, -0.15, 0.15));
      }
    }
  }

  // Hangers: container habs on cables under the deck between pylons.
  for (let k = 0; k < pylons.length - 1; k++) {
    const p = pylons[k]!, q = pylons[k + 1]!;
    if (Math.hypot(q.x - p.x, q.y - p.y) > s.pylonEvery * 1.8) continue;
    const count = r() < s.hangers ? 2 + Math.floor(r() * 4) : 0;
    for (let c = 0; c < count; c++) {
      const u = 0.25 + 0.5 * ((c + 0.5) / count) + between(r, -0.06, 0.06);
      const ang = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(ang), ny = Math.cos(ang);
      const side = r() < 0.5 ? -1 : 1, off = side * between(r, 2, W / 2 - 3.5);
      const x = p.x + (q.x - p.x) * u + nx * off, y = p.y + (q.y - p.y) * u + ny * off;
      const drop = between(r, 6, 30), h = 4.2, top = D - 5.5 - drop;
      out.buildings.push({ x, y, w: 8, d: 4, h, z0: top - h, a: ang, tint: pick(r, WARM), lit: 0.9, brick: 0, seed: r(), district: 'spine', kind: 'shack' });
      for (const e of [-2.4, 2.4]) {
        const cx = x + Math.cos(ang) * e, cy = y + Math.sin(ang) * e;
        out.curves.push({ points: [[cx, cy, top], [cx, cy, D - 5.2]], bevel: 0.08, material: 'cable' });
      }
    }
  }

  // The deck market in the dark under the deck: stalls and strings of bulbs between the pylons near its place.
  const marketAt = s.market ? placePx(s.market.place) : null;
  if (s.market && marketAt) {
    const nearPylons = pylons.filter((p) => Math.hypot(p.x - marketAt[0], p.y - marketAt[1]) < s.market!.radius);
    for (let k = 0; k < nearPylons.length - 1; k++) {
      const p = nearPylons[k]!, q = nearPylons[k + 1]!;
      for (let strand = 0; strand < 4; strand++) {
        const z = between(r, 6, 11), sag = between(r, 1, 3), o = between(r, -W / 2 + 2, W / 2 - 2);
        const nx = -Math.sin(p.a), ny = Math.cos(p.a);
        const pts: [number, number, number][] = Array.from({ length: 9 }, (_, i) => {
          const u = i / 8;
          return [p.x + (q.x - p.x) * u + nx * o, p.y + (q.y - p.y) * u + ny * o, z - 4 * u * (1 - u) * sag];
        });
        out.curves.push({ points: pts, bevel: 0.14, material: 'neon', color: pick(r, BULBS) });
      }
      for (let st = 0; st < 10; st++) {
        const u = r(), o = between(r, -W / 2 + 1.5, W / 2 - 1.5);
        const nx = -Math.sin(p.a), ny = Math.cos(p.a);
        out.props.push({ kind: 'shopfront', x: p.x + (q.x - p.x) * u + nx * o, y: p.y + (q.y - p.y) * u + ny * o, z0: 0, w: 2.2, d: 1.6, h: 1.5, a: p.a + between(r, -0.3, 0.3), color: pick(r, BULBS) });
      }
      out.lights.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: 8, color: '#ffb347', power: 26000, radius: 1.5, reach: 45 });
    }
  }

  // The hauler stop on the deck: trucks parked along the edge under marker lights, a pink neon cup.
  const haulAt = s.haulerStop ? placePx(s.haulerStop.place) : null;
  if (haulAt) {
    const i = nearestIdx(even, haulAt);
    for (let t = 0; t < 4; t++) {
      const j = Math.max(0, Math.min(n - 2, i - 6 + t * 4));
      const [a, b] = [even[j]!, even[j + 1]!];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const side = (haulAt[0] - a[0]) * -Math.sin(ang) + (haulAt[1] - a[1]) * Math.cos(ang) > 0 ? 1 : -1;
      const o = side * (W / 2 - 3);
      const x = a[0] - Math.sin(ang) * o, y = a[1] + Math.cos(ang) * o;
      out.buildings.push({ x, y, w: 9, d: 3, h: 3.4, z0: D, a: ang, tint: '#ff8c3a', lit: 0.2, brick: 0, seed: r(), district: 'spine', kind: 'car' });
      out.props.push({ kind: 'lamp', x: x + Math.cos(ang) * 4.6, y: y + Math.sin(ang) * 4.6, z0: D + 3, w: 0.5, d: 0.5, h: 0.4, a: 0, color: '#ff8c3a' });
    }
    const pyl = pylons.reduce((best, p) => (Math.hypot(p.x - haulAt[0], p.y - haulAt[1]) < Math.hypot(best.x - haulAt[0], best.y - haulAt[1]) ? p : best), pylons[0]!);
    if (pyl) {
      const cup: [number, number, number][] = Array.from({ length: 13 }, (_, k) => {
        const t = (k / 12) * Math.PI;
        return [pyl.x + 2.2 * Math.cos(t), pyl.y + pyl.d / 2 + 0.6, D - 10 - 2.2 * Math.sin(t)];
      });
      out.curves.push({ points: cup, bevel: 0.25, material: 'neon', color: '#ff5fb0' });
      out.lights.push({ x: pyl.x, y: pyl.y + pyl.d / 2 + 3, z: D - 10, color: '#ff5fb0', power: 18000, radius: 1, reach: 35 });
    }
  }

  // Places on the Spine stand at their ring (a ring is ringHeight up), the deck places on the deck.
  for (const p of places) {
    if (p.on !== s.id || p.level === undefined) continue;
    out.pinHeights[p.id] = p.level === 'roof' ? D : pinHeight(p.level, s.ringHeight, D - 9);
  }
  const pr = pylons.map((p) => ({ x: p.x, y: p.y, rad: Math.hypot(p.w, p.d) / 2 }));
  out.distance = (x, y) => {
    let best = Infinity;
    for (const p of pr) best = Math.min(best, Math.hypot(x - p.x, y - p.y) - p.rad - 4 + CLEARANCE);
    return best;
  };
  out.under = (x, y) => {
    for (let i = 0; i < n - 1; i++) if (segDist(x, y, even[i]!, even[i + 1]!) < W / 2 + 6) return true;
    return false;
  };
  const halo = W / 2 + s.corridor;
  out.along = [...offsetPath(even, -halo), ...offsetPath(even, halo).reverse()];
  return out;
}

function nearestIdx(pts: P[], q: P): number {
  let best = 0;
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i]![0] - q[0], pts[i]![1] - q[1]) < Math.hypot(pts[best]![0] - q[0], pts[best]![1] - q[1])) best = i;
  return best;
}
