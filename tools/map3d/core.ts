// Nexus, the Central Core (the painting for reference): glass towers on plots between avenues, rising to
// the Sentinel Tower, SDG's tower with its magenta triangle. Some towers step back at the crown, some carry a spire; light
// strips run up their corners and neon traces their crowns. A second tower beside the Sentinel wears a diamond, and a
// round plaza at the Sentinel's foot holds lit rings round a blue spire. Warmer, lower blocks at the edges.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor, type Place } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { EMERGENCY_LIGHT, LANDMARK_BACKUP, type Box, type Curve, type Light, type Prop, type Strip } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];
type P3 = [number, number, number];
export interface CoreGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
  pinHeights: Record<string, number>;
}

/** Neon emission for the core: dim, so the bloom keeps inside a tile's margin. */
const STRIP = 12;
const CROWN = 8;
const EMBLEM = 18;
const RING = 10;
/** The Sentinel's tiers: a tall slab carrying its sign, two short setbacks to the crown. */
const SENTINEL = [0.78, 0.14, 0.08];

function corners(x: number, y: number, w: number, d: number, a: number): P[] {
  const c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [x + (sx! * w * c) / 2 - (sy! * d * s) / 2, y + (sx! * w * s) / 2 + (sy! * d * c) / 2]);
}

/** A ring on the ground, `k` as deep as it is wide. */
const ellipse = (x: number, y: number, r: number, k: number, z: number, n = 32): P3[] =>
  Array.from({ length: n + 1 }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * r * k, z]);

export function coreGeometry(
  district: string,
  s: DistrictStyle,
  border: Anchor[],
  places: Place[],
  others: Anchor[][],
  keepOut: (x: number, y: number) => number,
  clearance: number,
  /** The neighbours its edges blend into, with their borders and styles. */
  blends: { border: Anchor[]; style: DistrictStyle; reach: number; step: string; lanterns?: string[] }[] = [],
): CoreGeometry {
  const cfg = s.core!;
  const out: CoreGeometry = { buildings: [], props: [], strips: [], curves: [], lights: [], pinHeights: {} };
  const r = rng(`core:${district}`);
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const mine = (x: number, y: number) => inside(x, y) && !others.some((o) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], o));
  // The tower stands at a place (the Sentinel, at its pin) or at a point of its own (Helios's, where the painting has it).
  const place = cfg.tower.near ? places.find((p) => p.id === cfg.tower.near) : undefined;
  const anchor = place?.pin ?? cfg.tower.at;
  if (!anchor) throw new Error(`core: no place ${cfg.tower.near ?? '(and no at)'}`);
  const tx = (anchor[0] / 100) * MAP_W, ty = (anchor[1] / 100) * MAP_H;
  // The streets' light: Nexus's cold white-blue unless the core names its own (Helios's sodium gold).
  const KERB = cfg.streetLight?.kerb ?? '#9fd0ff', LAMP = cfg.streetLight?.lamp ?? '#d8ecff', GLOW = cfg.streetLight?.glow ?? '#bfe0ff';
  const a = ((s.angleDeg ?? 0) * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const pts = border.map((p): P => [(p.x / 100) * MAP_W, (p.y / 100) * MAP_H]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // From a point to each blended neighbour's border: how far its look carries in (1 at the line, 0 at its reach).
  const blendRings = blends.map((b) => ({ ...b, ring: b.border.map((p): P => [(p.x / 100) * MAP_W, (p.y / 100) * MAP_H]) }));
  const segDist = (ring: P[], x: number, y: number) =>
    Math.min(...ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length]!, dx = q[0] - p[0], dy = q[1] - p[1];
      const u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - p[0] - u * dx, y - p[1] - u * dy);
    }));
  const blendAt = (x: number, y: number) => {
    let best: { style: DistrictStyle; p: number; step: string; lanterns?: string[] } | null = null;
    for (const b of blendRings) {
      const p = Math.max(0, 1 - segDist(b.ring, x, y) / b.reach);
      if (p > 0 && (!best || p > best.p)) best = { style: b.style, p, step: b.step, lanterns: b.lanterns };
    }
    return best;
  };
  /** From a point to the district's border (map px). */
  const edge = (x: number, y: number) =>
    Math.min(...pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length]!, dx = q[0] - p[0], dy = q[1] - p[1];
      const u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - p[0] - u * dx, y - p[1] - u * dy);
    }));

  // The plaza in front of the Sentinel (map +y, toward the camera), and the two towers' footprints: no plot on any of them.
  const sq = cfg.plaza.squash;
  const plaza: P = [tx, ty + cfg.tower.d / 2 + cfg.plaza.radius * sq + cfg.plaza.gap];
  // Elliptical distance from the plaza's middle: 1 on its rim.
  const onPlaza = (x: number, y: number, pad: number) => Math.hypot((x - plaza[0]) / (cfg.plaza.radius + pad), (y - plaza[1]) / (cfg.plaza.radius * sq + pad)) < 1;
  const second: P = [tx + cfg.second.offset[0], ty + cfg.second.offset[1]];
  const reserved = (x: number, y: number, half: number) =>
    onPlaza(x, y, half + 6) ||
    (Math.abs(x - tx) < cfg.tower.w / 2 + half + 6 && Math.abs(y - ty) < cfg.tower.d / 2 + half + 6) ||
    (Math.abs(x - second[0]) < cfg.second.w / 2 + half + 6 && Math.abs(y - second[1]) < cfg.second.d / 2 + half + 6);

  const tower = (x: number, y: number, w: number, d: number, h: number, tint: string, lit: number, opts: { tiers: number; crown: boolean; spire: boolean; strip: string | null; ang?: number; shares?: number[]; glass?: boolean }) => {
    const ang = opts.ang ?? a;
    const base = { tint, lit, brick: 0 as const, district, kind: 'building' as const, a: ang, ...(opts.glass ? { glass: 1 as const } : {}) };
    // Setbacks: each tier narrower, standing on the one below; the base takes most of the height.
    let z = 0, tw = w, td = d;
    const shares = opts.shares ?? (opts.tiers === 1 ? [1] : opts.tiers === 2 ? [0.72, 0.28] : [0.6, 0.25, 0.15]);
    for (let k = 0; k < shares.length; k++) {
      const th = h * shares[k]!;
      out.buildings.push({ ...base, x, y, w: tw, d: td, h: th, z0: z, seed: r() });
      z += th;
      if (k < shares.length - 1) {
        tw *= between(r, 0.62, 0.8);
        td *= between(r, 0.62, 0.8);
      }
    }
    if (opts.crown) {
      const cs = corners(x, y, tw - 0.6, td - 0.6, ang);
      out.curves.push({ points: [...cs, cs[0]!].map(([px, py]): P3 => [px, py, z + 0.3]), bevel: 0.16, material: 'neon', color: pick(r, cfg.neon), strength: CROWN });
    }
    if (opts.strip) {
      // Up the base's corners toward the camera (the two with the larger map y).
      const cs = corners(x, y, w + 0.3, d + 0.3, ang).sort((p, q) => q[1] - p[1]).slice(0, r() < 0.5 ? 1 : 2);
      const top = h * shares[0]!;
      for (const [px, py] of cs) out.curves.push({ points: [[px, py, top * 0.08], [px, py, top - 0.5]], bevel: 0.32, material: 'neon', color: opts.strip, strength: STRIP });
    }
    if (opts.spire) {
      const sh = between(r, 12, 34);
      out.props.push({ kind: 'mast', x, y, z0: z, w: 0.6, d: 0.6, h: sh, a: 0 });
      out.props.push({ kind: 'lamp', x, y, z0: z + sh, w: 0.7, d: 0.7, h: 0.7, a: 0, color: '#d8ecff' });
    }
    return z;
  };

  // The plots: one tower each on a rotated grid, avenues between every few.
  const [cw, ch] = s.lot;
  const [ec, er] = s.streetEvery;
  const n0 = Math.ceil(R / Math.min(cw, ch));
  let lamps = 0;
  // Avenues unevenly spaced (no comb of identical gaps): each a few plots on from the last.
  const lines = (every: number, seed: string) => {
    const lr2 = rng(seed), set = new Set<number>();
    for (let k = -n0 - every; k <= n0 + every; k += Math.max(2, every - 1 + Math.floor(lr2() * 3))) set.add(k);
    return set;
  };
  const colSet = lines(ec, `core-cols:${district}`), rowSet = lines(er, `core-rows:${district}`);
  // The boulevard: across the grid through the plaza (break the comb).
  const ba = (cfg.boulevard.angleDeg * Math.PI) / 180, bw = cfg.boulevard.width;
  const toBoulevard = (x: number, y: number) => Math.abs((x - plaza[0]) * Math.sin(ba) - (y - plaza[1]) * Math.cos(ba));
  // Quarters: centres scattered over the district, each with its palette (weighted), so colour runs by neighbourhood.
  const qr = rng(`core-quarters:${district}`);
  const totalW = cfg.quarters.reduce((sum, q) => sum + q.weight, 0);
  const centres: { x: number; y: number; q: (typeof cfg.quarters)[number] }[] = [];
  for (let tries = 0; centres.length < cfg.quarterCount && tries < 5000; tries++) {
    const x = between(qr, Math.min(...xs), Math.max(...xs)), y = between(qr, Math.min(...ys), Math.max(...ys));
    if (!mine(x, y) || centres.some((c) => Math.hypot(c.x - x, c.y - y) < cfg.falloff * 0.6)) continue;
    // The first few take each palette once, so every quarter shows; the rest by weight.
    let q = cfg.quarters[centres.length];
    if (!q) {
      let w = qr() * totalW;
      q = cfg.quarters.find((c) => (w -= c.weight) < 0) ?? cfg.quarters[0]!;
    }
    centres.push({ x, y, q });
  }
  const quarterAt = (x: number, y: number) => centres.reduce((best, c) => (Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best)).q;
  const lean = cfg.quarters.find((q) => q.name === cfg.lean) ?? cfg.quarters[0]!;
  const taken = new Set<string>();
  for (let i = -n0; i <= n0; i++)
    for (let j = -n0; j <= n0; j++) {
      const col = colSet.has(i), row = rowSet.has(j);
      const u = i * cw, v = j * ch;
      const x = tx + u * ca - v * sa, y = ty + u * sa + v * ca;
      const roll = Array.from({ length: 12 }, r);
      if (col || row) {
        // An avenue piece, both ends on the district's ground and clear of the Spine and roads.
        if (!mine(x, y) || keepOut(x, y) < 1) continue;
        for (const [on, len, ang2] of [[col, ch, a + Math.PI / 2], [row, cw, a]] as const) {
          if (!on) continue;
          const ex = (Math.cos(ang2) * len) / 2, ey = (Math.sin(ang2) * len) / 2;
          if (![[x + ex, y + ey], [x - ex, y - ey]].every(([qx, qy]) => mine(qx!, qy!) && keepOut(qx!, qy!) > 0)) continue;
          if (onPlaza(x, y, 2) || toBoulevard(x, y) < bw / 2 + 1) continue;
          out.strips.push({ x, y, w: len + 0.5, d: cfg.avenue.width, h: 0.2, z0: 0.06, a: ang2, material: 'street' });
          // Streetlights as close-set as Velvet's lanterns: every `lampEvery` px, the two sides staggered,
          // and now and then a pool of light on the paving.
          // Near Velvet its paper lanterns, strung across the avenue eaves to eaves, take over from the streetlights.
          const vb = blendAt(x, y);
          if (vb?.lanterns && r() < Math.min(1, vb.p * 1.5)) {
            const nx = -Math.sin(ang2), ny = Math.cos(ang2), halfW = cfg.avenue.width / 2 + 1.2;
            for (const along of [-len / 4, len / 4]) {
              const mx = x + Math.cos(ang2) * along, my = y + Math.sin(ang2) * along, z = between(r, 5, 7.5), color = pick(r, vb.lanterns);
              const pt = (u: number): [number, number, number] => [mx + nx * (u * 2 - 1) * halfW, my + ny * (u * 2 - 1) * halfW, z - 4 * u * (1 - u) * 1.1];
              out.curves.push({ points: [0, 0.2, 0.4, 0.6, 0.8, 1].map(pt), bevel: 0.06, material: 'neon', color, strength: 4 });
              for (const u of [0.25, 0.5, 0.75]) {
                const [lx, ly, lz] = pt(u);
                out.props.push({ kind: 'lamp', x: lx, y: ly, z0: lz - 1.1, w: 0.9, d: 0.9, h: 1.1, a: 0, color });
              }
            }
            if (r() < 0.3) out.lights.push({ x, y, z: 5, color: pick(r, vb.lanterns), power: 9000, radius: 1, reach: 30 });
            lamps++;
            continue;
          }
          const n = Math.max(1, Math.round(len / cfg.avenue.lampEvery));
          for (let k = 0; k < n; k++) {
            const side = (k + lamps) % 2 === 0 ? -1 : 1, along = ((k + 0.5) / n - 0.5) * len;
            const lx = x + Math.cos(ang2) * along - Math.sin(ang2) * side * (cfg.avenue.width / 2 + 0.7), ly = y + Math.sin(ang2) * along + Math.cos(ang2) * side * (cfg.avenue.width / 2 + 0.7);
            out.props.push({ kind: 'lamp', x: lx, y: ly, z0: 3.4, w: 1.1, d: 1.1, h: 0.5, a: 0, color: LAMP });
          }
          lamps++;
          if (roll[0]! < 0.25) out.lights.push({ x, y, z: 4, color: GLOW, power: 9000, radius: 1, reach: 30 });
        }
        continue;
      }
      if (roll[1]! > cfg.fill || taken.has(`${i},${j}`)) continue;
      // Low along every side of the district, tallest deep inside it, a little extra round the Sentinel.
      const t = Math.min(1, edge(x, y) / cfg.falloff);
      const nearSentinel = Math.max(0, 1 - Math.hypot(x - tx, y - ty) / 260) ** 2;
      // Not a regular grid: each plot its own way — one tower set off its plot's centre, twins side by side, or a tower
      // with a lower wing to one side; now and then turned off the grid.
      const kind = roll[9]! < 0.22 ? 'twin' : roll[9]! < 0.4 ? 'wing' : 'one';
      const turn = roll[10]! < 0.14 ? between(r, -0.4, 0.4) : 0;
      const slack = (1 - t * 0.15);
      const pieces: { x: number; y: number; w: number; d: number; k: number }[] = [];
      // Now and then a broad, heavy tower takes this plot and the next one along.
      const broad = t > 0.3 && roll[11]! < cfg.broad && !colSet.has(i + 1) && !taken.has(`${i + 1},${j}`);
      if (broad) {
        taken.add(`${i + 1},${j}`);
        pieces.push({ x: x + (ca * cw) / 2, y: y + (sa * cw) / 2, w: cw * between(r, 1.45, 1.75), d: ch * between(r, 0.62, 0.82), k: between(r, 0.75, 0.95) });
      } else if (kind === 'twin') {
        const gap = between(r, 2, 4), w2 = (cw * between(r, 0.66, 0.86) - gap) / 2, d2 = ch * between(r, 0.42, 0.72) * slack;
        const shift = between(r, -2.5, 2.5);
        for (const sgn of [-1, 1]) pieces.push({ x: x + ca * sgn * (w2 + gap) / 2 - sa * shift, y: y + sa * sgn * (w2 + gap) / 2 + ca * shift, w: w2, d: d2, k: sgn < 0 ? 1 : between(r, 0.55, 0.9) });
      } else {
        const w = cw * between(r, 0.45, 0.72) * slack, d = ch * between(r, 0.45, 0.72) * slack;
        const ou = between(r, -1, 1) * (cw - w) * 0.4, ov = between(r, -1, 1) * (ch - d) * 0.4;
        const px0 = x + ou * ca - ov * sa, py0 = y + ou * sa + ov * ca;
        pieces.push({ x: px0, y: py0, w, d, k: 1 });
        if (kind === 'wing') {
          // The wing on the side with more room, low, square to the tower.
          const sgn = ou > 0 ? -1 : 1, ww = (cw - w) * between(r, 0.55, 0.85), wd = d * between(r, 0.5, 0.9);
          if (ww > 4) pieces.push({ x: px0 + ca * sgn * (w + ww) / 2, y: py0 + sa * sgn * (w + ww) / 2, w: ww, d: wd, k: between(r, 0.15, 0.35) });
        }
      }
      const lo = s.height[0] + (s.height[1] - s.height[0]) * roll[2]!;
      // A few stand well above their neighbours, so the skyline breaks.
      const h0 = Math.min(cfg.second.h * 0.92, (lo + (cfg.peak - lo) * (t ** 1.3 * between(r, 0.6, 1.1) + nearSentinel * 0.25)) * (1 + roll[3]! ** 8 * 1.2));
      // Colour by quarter; the tallest lean violet.
      const quarter = h0 > cfg.peak * 0.6 && roll[4]! < 0.6 ? lean : quarterAt(x, y);
      const tint = pick(r, quarter.colors);
      for (const q of pieces) {
        const half = Math.max(q.w, q.d) / 2;
        if (reserved(q.x, q.y, half) || toBoulevard(q.x, q.y) < bw / 2 + half + 2) continue;
        const ang = a + turn;
        const cs = corners(q.x, q.y, q.w, q.d, ang);
        if (!cs.every(([qx, qy]) => mine(qx, qy))) continue;
        if (keepOut(q.x, q.y) < clearance || cs.some(([qx, qy]) => keepOut(qx, qy) < clearance * 0.5)) continue;
        let h = Math.max(s.height[0] * 0.6, h0 * q.k);
        // A valley along the boulevard's south side (toward the camera), so the street shows through the skyline.
        const south = -((q.x - plaza[0]) * Math.sin(ba) - (q.y - plaza[1]) * Math.cos(ba));
        if (south > 0 && south < 70 + half) h = Math.min(h, 18 + Math.max(0, south - half) * 0.55);
        // A low forecourt in front of the plaza (toward the camera), so no tower stands in the way of it.
        if (Math.abs(q.x - plaza[0]) < cfg.plaza.radius + half && q.y > plaza[1] && q.y - plaza[1] < 160 + half) h = Math.min(h, between(r, 8, 18));
        // And in front of the second tower, low enough to leave its diamond in view.
        if (Math.abs(q.x - second[0]) < cfg.second.w + half && q.y > second[1] && q.y - second[1] < 140 + half) h = Math.min(h, between(r, 20, 42));
        // Near a blended neighbour (Helios), more and more of the plots are its kind of block: warm windows, brick now and
        // then, its heights.
        const bl = blendAt(q.x, q.y);
        if (bl && r() < Math.min(1, bl.p * 1.4)) {
          const ns = bl.style, nh = between(r, ns.height[0], ns.height[1]);
          h = Math.min(h, nh * (1 + (1 - bl.p) * 1.5));
          // A neighbour of row houses (Velvet) lends its lit walls and a shopfront at the door; others their windows.
          const rows = ns.streets;
          out.buildings.push({ x: q.x, y: q.y, w: q.w, d: q.d, h, z0: 0, a: ang, tint: pick(r, rows?.wallColors ?? ns.windowColors), lit: rows ? 0.85 : Math.max(ns.windowLit, 0.5), brick: r() < ns.brick ? 1 : 0, seed: r(), district, kind: 'building' });
          if (rows && r() < 0.75) out.props.push({ kind: 'shopfront', x: q.x - Math.sin(ang) * (q.d / 2 + 0.6), y: q.y + Math.cos(ang) * (q.d / 2 + 0.6), z0: 2.4, w: q.w * 0.7, d: 1.2, h: 0.5, a: ang, color: pick(r, ns.signColors) });
          continue;
        }
        // The step between: amber glass, fewer panes lit, so the glow builds toward the middle instead of switching on.
        const step = bl ? bl.p : 0;
        const stepQuarter = bl ? cfg.quarters.find((qq) => qq.name === bl.step) ?? lean : null;
        const warmGlass = stepQuarter && r() < 0.7 ? stepQuarter : null;
        const tiers = h > 60 ? (r() < 0.35 ? 3 : r() < 0.7 ? 2 : 1) : r() < 0.25 ? 2 : 1;
        // Every quarter is glass; a warm quarter's glass is amber, its panes lit gold.
        tower(q.x, q.y, q.w, q.d, h, warmGlass ? pick(r, warmGlass.colors) : tint, s.windowLit * 1.1 * (1 - step * 0.6), {
          tiers,
          crown: h > 40 && r() < cfg.crowns,
          spire: h > 70 && r() < cfg.spires,
          strip: h > 45 && r() < cfg.strips ? pick(r, cfg.neon) : null,
          glass: true,
          ang,
        });
        // Its lobby: a lit glass front at street level on the face toward the camera.
        if (r() < 0.8) {
          const fx = q.x - Math.sin(ang) * (q.d / 2 + 0.2), fy = q.y + Math.cos(ang) * (q.d / 2 + 0.2);
          out.props.push({ kind: 'shopfront', x: fx, y: fy, z0: 0.4, w: q.w * between(r, 0.4, 0.8), d: 0.3, h: 2.6, a: ang, color: quarter.warm ? pick(r, ['#ffcf7a', '#ffb347']) : pick(r, ['#d8ecff', '#bfe0ff', '#c9b6ff']) });
        }
      }
    }

  // The boulevard's paving and streetlights, out from the plaza both ways to the district's edge.
  for (const dir of [-1, 1]) {
    for (let k = 0; ; k++) {
      const along = dir * (cfg.plaza.radius + 6 + k * 10);
      const x = plaza[0] + Math.cos(ba) * along, y = plaza[1] + Math.sin(ba) * along;
      if (!mine(x, y) || keepOut(x, y) < 1) break;
      if (reserved(x, y, -5)) continue;
      out.strips.push({ x, y, w: 10.6, d: bw, h: 0.2, z0: 0.07, a: ba, material: 'street' });
      // A line of light down each kerb, so the boulevard reads through the gaps between towers.
      for (const side of [-1, 1]) out.strips.push({ x: x - Math.sin(ba) * side * (bw / 2 - 0.6), y: y + Math.cos(ba) * side * (bw / 2 - 0.6), w: 10.6, d: 0.35, h: 0.12, z0: 0.3, a: ba, material: 'street-light', color: KERB });
      if (k % 2 === 0) for (const side of [-1, 1]) out.props.push({ kind: 'lamp', x: x - Math.sin(ba) * side * (bw / 2 + 0.8), y: y + Math.cos(ba) * side * (bw / 2 + 0.8), z0: 3.6, w: 1.1, d: 1.1, h: 0.5, a: 0, color: LAMP });
      if (k % 6 === 3) out.lights.push({ x, y, z: 4, color: GLOW, power: 9000, radius: 1, reach: 30 });
    }
  }

  // The Sentinel Tower: the tallest, magenta edges, its triangle high on the face toward the camera.
  const em = cfg.tower.emblem;
  const sentinel0 = out.buildings.length;
  tower(tx, ty, cfg.tower.w, cfg.tower.d, cfg.tower.h, cfg.tower.tint ?? '#c9b6ff', 0.55, { tiers: 3, crown: true, spire: true, strip: em, ang: 0, shares: SENTINEL, glass: true });
  // SDG keeps its lights on when the grid goes (blackouts phase 2): the tower on backup, its foot lit.
  for (let i = sentinel0; i < out.buildings.length; i++) out.buildings[i]!.backup = LANDMARK_BACKUP;
  out.lights.push({ ...EMERGENCY_LIGHT, x: tx, y: ty + cfg.tower.d / 2 + 6, z: 6 });
  if (cfg.tower.near) out.pinHeights[cfg.tower.near] = cfg.tower.h * 0.6;
  const face = ty + cfg.tower.d / 2 + 0.4;
  const zc = cfg.tower.h * SENTINEL[0]! * 0.8, sz = cfg.tower.w * 0.36;
  out.curves.push({ points: [[tx - sz, face, zc - sz * 0.6], [tx + sz, face, zc - sz * 0.6], [tx, face, zc + sz * 0.95], [tx - sz, face, zc - sz * 0.6]], bevel: 0.45, material: 'neon', color: em, strength: EMBLEM });
  // The eye inside it.
  const eye: P3[] = Array.from({ length: 17 }, (_, k) => {
    const q = (k / 16) * Math.PI * 2;
    return [tx + Math.cos(q) * sz * 0.32, face, zc + Math.sin(q) * sz * 0.2];
  });
  out.curves.push({ points: eye, bevel: 0.3, material: 'neon', color: em, strength: EMBLEM });
  // A panel of light behind the emblem, faint, so the face reads as a lit sign from far out.
  out.props.push({ kind: 'billboard', x: tx, y: face - 0.25, z0: zc - sz * 1.0, w: sz * 2.6, d: 0.2, h: sz * 2.3, a: 0, color: cfg.tower.panel ?? '#2a0c30' });
  out.lights.push({ x: tx, y: face + 14, z: zc, color: em, power: 160000, radius: 2, reach: 90 });

  // The second tower, with a diamond and a line through it.
  const [sx, sy] = second;
  const sf = sy + cfg.second.d / 2 + 0.4, szc = cfg.second.h * 0.72 * 0.75, ss = cfg.second.w * 0.3;
  tower(sx, sy, cfg.second.w, cfg.second.d, cfg.second.h, cfg.second.tint ?? '#bfe0ff', 0.5, { tiers: 2, crown: true, spire: false, strip: cfg.second.emblem, ang: 0, glass: true });
  out.curves.push({ points: [[sx, sf, szc + ss * 1.3], [sx + ss, sf, szc], [sx, sf, szc - ss * 1.3], [sx - ss, sf, szc], [sx, sf, szc + ss * 1.3]], bevel: 0.4, material: 'neon', color: cfg.second.emblem, strength: EMBLEM });
  out.curves.push({ points: [[sx, sf, szc - ss * 2.2], [sx, sf, szc + ss * 0.8]], bevel: 0.3, material: 'neon', color: cfg.second.emblem, strength: EMBLEM });

  // The plaza: two lit rings, lamps round the rim, the blue spire in the middle with its pool of light.
  const [qx, qy] = plaza, pr = cfg.plaza.radius;
  out.curves.push({ points: ellipse(qx, qy, pr, sq, 0.3, 48), bevel: 0.5, material: 'neon', color: cfg.plaza.ring, strength: RING });
  out.curves.push({ points: ellipse(qx, qy, pr * 0.5, sq, 0.35, 32), bevel: 0.4, material: 'neon', color: cfg.plaza.spire, strength: RING });
  // Its paving: an oval of slabs under the rings.
  for (let k = -3; k <= 3; k++) {
    const v = (k / 3.5) * pr * sq, half = pr * Math.sqrt(1 - (k / 3.5) ** 2);
    out.strips.push({ x: qx, y: qy + v, w: half * 2, d: (pr * sq * 2) / 7 + 0.2, h: 0.15, z0: 0.05, a: 0, material: 'concrete' });
  }
  for (let k = 0; k < 16; k++) {
    const q = (k / 16) * Math.PI * 2;
    out.props.push({ kind: 'lamp', x: qx + Math.cos(q) * (pr - 1.5), y: qy + Math.sin(q) * (pr - 1.5) * sq, z0: 2.4, w: 0.8, d: 0.8, h: 0.6, a: 0, color: cfg.plaza.ring });
  }
  out.props.push({ kind: 'sign', x: qx, y: qy, z0: 0, w: 1.6, d: 1.6, h: 26, a: 0, color: cfg.plaza.spire });
  out.lights.push({ x: qx, y: qy, z: 12, color: cfg.plaza.spire, power: 120000, radius: 2, reach: 80 });
  // An avenue from the plaza to the tower's door.
  out.strips.push({ x: tx, y: (ty + cfg.tower.d / 2 + qy - pr * sq) / 2, w: cfg.plaza.gap + 2, d: cfg.avenue.width * 1.2, h: 0.2, z0: 0.06, a: Math.PI / 2, material: 'street' });

  // Light pools over the core, toward its middle.
  const lr = rng(`core-pools:${district}`);
  for (let k = 0, tries = 0; k < s.pools.count && tries < 5000; tries++) {
    const x = between(lr, Math.min(...xs), Math.max(...xs)), y = between(lr, Math.min(...ys), Math.max(...ys));
    if (!mine(x, y) || edge(x, y) < cfg.falloff * 0.4) continue;
    out.lights.push({ x, y, z: between(lr, 80, 120), color: pick(lr, s.pools.colors), power: s.pools.power, radius: s.pools.radius, reach: s.pools.reach });
    k++;
  }
  return out;
}
