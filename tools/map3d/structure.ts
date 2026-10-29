// The Ribbon (spec 2026-10-25 §3), ported from the test's render5.py: a canyon of two stacks with a walkway street on every
// level, tapering from the top of Old Town down to the Strand, stepping down into the blocks around it, its gap full of
// cables, laundry, girders, ceilings, stairs, shopfronts and signs, its low levels dark.
import { MAP_H, MAP_W, pinHeight } from '../../shared/map-projection';
import type { RibbonStructure } from '../../shared/city-schema';

type DeltaEnd = Exclude<NonNullable<RibbonStructure['delta']>['end'], unknown[]>;
import type { Place } from '../../shared/map-schema';
import type { Box, Curve, Light, Prop, Strip, Volume } from './geometry';
import { between, pick, rng } from './rng';
import { CLEARANCE } from './lots';

type P = [number, number];
const HANG_COLORS = ['#ff4f8b', '#7fe9ff', '#ffb347', '#ff4fd8'];
const BOARD_COLORS = ['#ff4f8b', '#7fe9ff', '#ffb347', '#c45cff'];
const STREET_COLORS = ['#ff9a3c', '#ff4f8b', '#ffcf7a'];
const LAUNDRY = ['#7a5a5a', '#4a5a7a', '#8a7a5a', '#6a3a4a', '#9a9a8a'];
const GAP_LIGHT_COLORS = ['#ff9a3c', '#ffb347', '#ff4f8b', '#7fe9ff'];

/** Catmull-Rom through the points, n steps a span (the test's smooth()). */
export function smooth(pts: P[], n = 8): P[] {
  const out: P[] = [];
  const ext = [pts[0]!, ...pts, pts.at(-1)!];
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1]!, ext[i]!, ext[i + 1]!, ext[i + 2]!];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j]! + (-p0[j]! + p2[j]!) * t + (2 * p0[j]! - 5 * p1[j]! + 4 * p2[j]! - p3[j]!) * t2 + (-p0[j]! + 3 * p1[j]! - 3 * p2[j]! + p3[j]!) * t3)) as P);
    }
  }
  out.push(pts.at(-1)!);
  return out;
}

/** Evenly spaced points along a polyline. */
export function resample(path: P[], step: number): P[] {
  const out: P[] = [path[0]!];
  let carry = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i]!, path[i + 1]!];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= seg) {
      out.push([a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg]);
      t += step;
    }
    carry = seg - (t - step);
  }
  return out;
}

/** The polyline moved sideways by d (its left normal). */
export function offsetPath(pts: P[], d: number): P[] {
  return pts.map(([x, y], i) => {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [x - (dy / L) * d, y + (dx / L) * d];
  });
}

function segDist(px: number, py: number, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

export interface StructureGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
  volumes: Volume[];
  pinHeights: Record<string, number>;
  /** From a point to the stacks' outer face (map px; negative inside the stacks or the canyon). */
  distance: (x: number, y: number) => number;
  /** The delta's branch centrelines (map px), from each end of the Ribbon outwards. */
  branches: P[][];
  /** The Ribbon at the segment nearest a point: its middle, angle, left normal, the point's side, that side's stack height and the levels there. */
  frame: (x: number, y: number) => RibbonFrame;
}
export interface RibbonFrame {
  mx: number;
  my: number;
  ang: number;
  nx: number;
  ny: number;
  side: 1 | -1;
  stackHeight: number;
  levels: number;
  levelHeight: number;
  gap: number;
  depth: number;
}

/** `clip`: whether a point (map px) is land, and inside district `within` when given: a fan's boulevards stop where it fails. */
export function ribbonGeometry(s: RibbonStructure, places: Place[], clip?: (x: number, y: number, within?: string) => boolean): StructureGeometry {
  const r = rng(`structure:${s.id}`);
  const LH = s.levelHeight;
  const route = smooth(s.route.map(([x, y]) => [(x / 100) * MAP_W, (y / 100) * MAP_H] as P));
  const even = resample(route, s.resample);
  const n = even.length;
  const nearestSeg = (px: number, py: number) => {
    let best = 0;
    for (let i = 1; i < n - 1; i++) if (Math.hypot(even[i]![0] - px, even[i]![1] - py) < Math.hypot(even[best]![0] - px, even[best]![1] - py)) best = i;
    return Math.min(best, n - 2);
  };
  // Levels taper from the top end to the bottom end, but rise around each place to at least its level.
  const levels = even.map((_, i) => Math.max(s.levels[1], Math.round(s.levels[0] - ((s.levels[0] - s.levels[1]) * i) / (n - 1))));
  const mine = places.filter((p) => p.on === s.id && !p.side);
  for (const p of mine) {
    const need = p.level === 'roof' || p.level === undefined ? 0 : p.level;
    const i = nearestSeg((p.pin[0] / 100) * MAP_W, (p.pin[1] / 100) * MAP_H);
    for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 4); k++) levels[k] = Math.max(levels[k]!, need);
  }

  const out: StructureGeometry = { buildings: [], props: [], strips: [], curves: [], lights: [], volumes: [], pinHeights: {}, distance: () => 0, frame: () => ({}) as RibbonFrame, branches: [] };
  const stackH: Record<number, number[]> = { [-1]: [], [1]: [] };
  const box = (b: Omit<Box, 'district' | 'seed'>) => out.buildings.push({ ...b, district: 'karasu', seed: r() });
  const { details: D, tiers: T } = s;

  /** Builds one run of canyon along `pts`: the main Ribbon, or one of its delta's branches (narrower, lower, sparser). */
  const runs: { pts: P[]; gapAt: (i: number) => number; depthAt: (i: number) => number }[] = [];
  const buildRun = (pts: P[], lvls: number[], gapAt: (i: number) => number, depthAt: (i: number) => number, detail: number, main: boolean, lightEvery = s.gapLights.every) => {
    runs.push({ pts, gapAt, depthAt });
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i]!, pts[i + 1]!];
      const gap = gapAt(i), dep = depthAt(i);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -Math.sin(ang), ny = Math.cos(ang), tx = Math.cos(ang), ty = Math.sin(ang);
      const lv = lvls[i]!;
      const at = (o: number, t = 0): P => [mx + nx * o + tx * t, my + ny * o + ty * t];
      for (const side of [-1, 1]) {
        // Level 0: a plain street, no stacks (where a delta's branch shrinks into a road).
        if (lv < 1) continue;
        // The stack: one building a segment, jagged, now and then a tower.
        const h = lv * LH + between(r, s.stackJitter[0], s.stackJitter[1]) * LH + (r() < s.towerShare ? s.towerLevels * LH : 0);
        if (main) stackH[side]![i] = h;
        const [sx, sy] = at(side * (gap / 2 + dep / 2));
        box({ x: sx, y: sy, w: seg * 1.04, d: dep, h, z0: 0, a: ang, tint: pick(r, s.wallColors), lit: 0.75, brick: r() < s.brickShare ? 1 : 0, kind: 'stack' });
        if (r() < 0.35) out.props.push({ kind: 'tank', x: sx + between(r, -seg / 4, seg / 4), y: sy, z0: h, w: 2.8, d: 2.8, h: 2.6, a: 0 });
        for (let k = Math.floor(r() * 4); k > 0; k--) out.props.push({ kind: 'ac', x: sx + between(r, -seg / 3, seg / 3), y: sy + between(r, -dep / 3, dep / 3), z0: h, w: 1.4, d: 1.1, h: 0.9, a: ang });
        if (r() < D.shacks * detail) {
          const [hx, hy] = at(side * (gap / 2 + between(r, 3, dep - 3)));
          box({ x: hx, y: hy, w: between(r, 3, 5), d: between(r, 2.5, 4), h: between(r, 2.5, 4), z0: h, a: ang + between(r, -0.3, 0.3), tint: pick(r, s.wallColors), lit: 0.9, brick: r() < 0.3 ? 1 : 0, kind: 'shack' });
        }
        // The blocks outside step down against the stack.
        if (r() < T.first.share * detail) {
          const d1 = between(r, T.first.depth[0], T.first.depth[1]);
          const h1 = h * between(r, T.first.height[0], T.first.height[1]);
          const [ax, ay] = at(side * (gap / 2 + dep + d1 / 2));
          box({ x: ax, y: ay, w: seg * between(r, 0.8, 1.05), d: d1, h: h1, z0: 0, a: ang, tint: pick(r, s.wallColors), lit: 0.5, brick: r() < 0.65 ? 1 : 0, kind: 'tier' });
          if (r() < T.second.share * detail) {
            const d2 = between(r, T.second.depth[0], T.second.depth[1]);
            const [bx, by] = at(side * (gap / 2 + dep + d1 + d2 / 2));
            box({ x: bx, y: by, w: seg * between(r, 0.7, 1), d: d2, h: h1 * between(r, T.second.height[0], T.second.height[1]), z0: 0, a: ang, tint: pick(r, s.wallColors), lit: 0.4, brick: r() < 0.7 ? 1 : 0, kind: 'tier' });
          }
        }
        // On the gap face: pipes, air-con by the walkways, shopfronts (busier higher up), hanging signs, stairs.
        if (r() < D.pipes * detail) {
          const [px, py] = at(side * (gap / 2 + 0.25), between(r, -0.4, 0.4) * seg);
          out.strips.push({ x: px, y: py, w: 0.4, d: 0.4, h, z0: 0, a: ang, material: 'pipe' });
        }
        for (let L = 1; L <= lv; L++) {
          if (r() < D.aircon * detail) {
            const [qx, qy] = at(side * (gap / 2 - 0.3), between(r, -0.4, 0.4) * seg);
            out.props.push({ kind: 'ac', x: qx, y: qy, z0: (L - 1) * LH + 3.6, w: 1.2, d: 0.6, h: 0.9, a: ang });
          }
          if (r() < D.shopfrontBase + D.shopfrontPerLevel * L) {
            const [qx, qy] = at(side * (gap / 2 - 0.2));
            out.props.push({ kind: 'shopfront', x: qx, y: qy, z0: (L - 1) * LH + 0.4, w: seg * 0.7, d: 0.4, h: 2.4, a: ang, color: pick(r, s.shopColors) });
          }
        }
        if (r() < D.hangingSigns * detail && lv >= 2) {
          const [qx, qy] = at(side * (gap / 2 - 1.5));
          out.props.push({ kind: 'hanging-sign', x: qx, y: qy, z0: (2 + Math.floor(r() * (lv - 1))) * LH - 7.5, w: 0.4, d: 3, h: 7, a: ang + Math.PI / 2, color: pick(r, HANG_COLORS) });
        }
        if (r() < D.stairs * detail && lv > 1) {
          const L = 1 + Math.floor(r() * (lv - 1));
          const o = side * (gap / 2 - 1.6);
          out.strips.push({ x: mx, y: my, w: seg, d: 1.6, h: 0.4, z0: (L - 1) * LH, a: ang, material: 'stair', ends: [[a[0] + nx * o, a[1] + ny * o, (L - 1) * LH], [b[0] + nx * o, b[1] + ny * o, L * LH]] });
        }
        if (r() < D.billboards * detail) {
          const [qx, qy] = at(side * (gap / 2 + dep * 0.6));
          const z = h + LH * 0.4;
          out.props.push({ kind: 'board-frame', x: qx, y: qy, z0: z, w: 7.4, d: 0.5, h: 4.4, a: ang });
          out.props.push({ kind: 'billboard', x: qx - ny * 0.3, y: qy + nx * 0.3, z0: z + 0.3, w: 6.8, d: 0.2, h: 3.8, a: ang, color: pick(r, BOARD_COLORS) });
        }
      }
      // The canyon itself: its floor and Level 1's street lights, girders and ceilings across it, cables, bridges, lamps.
      out.strips.push({ x: mx, y: my, w: seg * 1.05, d: gap, h: 0.3, z0: 0.05, a: ang, material: 'floor' });
      for (const side of [-1, 1]) {
        if (r() < 0.6) {
          const [qx, qy] = at(side * between(r, 1.5, gap / 2 - 3.5));
          out.strips.push({ x: qx, y: qy, w: between(r, 1.5, 3.5), d: 1.2, h: 0.5, z0: 0.4, a: ang, material: 'street-light', color: pick(r, STREET_COLORS) });
        }
      }
      if (lv >= 1 && r() < D.girders * detail) out.strips.push({ x: mx, y: my, w: 1, d: gap + 2, h: 0.8, z0: (1 + Math.floor(r() * lv)) * LH - 0.6, a: ang, material: 'girder' });
      if (r() < D.ceilings * detail && lv >= 2) {
        const L = 2 + Math.floor(r() * (lv - 1));
        out.strips.push({ x: mx, y: my, w: seg * 0.95, d: gap, h: 0.7, z0: L * LH - 1.2, a: ang, material: 'slab' });
        out.props.push({ kind: 'fan', x: mx, y: my, z0: L * LH - 2.1, w: 4.8, d: 4.8, h: 0.2, a: 0 });
      }
      const cables = lv < 1 ? 0 : D.cables[0] + Math.floor(r() * (D.cables[1] - D.cables[0] + 1));
      for (let c = 0; c < cables; c++) {
        const z = between(r, 2, lv * LH - 1), t = between(r, -0.5, 0.5) * seg, sag = between(r, D.cableSag[0], D.cableSag[1]);
        const p0 = at(-gap / 2, t), p1 = at(gap / 2, t + between(r, -2, 2));
        const pts: [number, number, number][] = Array.from({ length: 7 }, (_, k) => {
          const u = k / 6;
          return [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, z - 4 * u * (1 - u) * sag];
        });
        out.curves.push({ points: pts, bevel: 0.07, material: 'cable' });
        if (z < D.laundryBelowLevel * LH && r() < D.laundry * detail) {
          for (let k = 1; k < 7; k++) {
            if (r() >= 0.7) continue;
            const u = k / 7;
            out.props.push({ kind: 'laundry', x: p0[0] + (p1[0] - p0[0]) * u, y: p0[1] + (p1[1] - p0[1]) * u, z0: z - 4 * u * (1 - u) * sag - 1, w: 0.8, d: 0.08, h: 0.9, a: ang, color: pick(r, LAUNDRY) });
          }
        }
      }
      if (lv >= D.bridgeFromLevel && r() < D.bridges * detail) {
        const L = D.bridgeFromLevel + Math.floor(r() * (lv - D.bridgeFromLevel + 1));
        box({ x: mx, y: my, w: 4.5, d: gap + 1, h: 3.6, z0: (L - 1) * LH + 1.2, a: ang, tint: pick(r, s.wallColors), lit: 0.9, brick: 0, kind: 'bridge' });
      }
      if (i % lightEvery === 0) {
        const L = 1 + Math.floor(r() * lv);
        out.lights.push({ x: mx, y: my, z: (L - 0.4) * LH, color: pick(r, GAP_LIGHT_COLORS), power: (s.gapLights.base + s.gapLights.perLevel * L) * s.gapLights.gain, radius: 3, reach: 80 });
      }
      // Walkways, rails, and under each the dark underside with its brackets, on every level there is here.
      for (const side of [-1, 1]) {
        for (let L = 1; L <= lv; L++) {
          const z = (L - 1) * LH;
          const [wx, wy] = at(side * (gap / 2 - 1.6));
          out.strips.push({ x: wx, y: wy, w: seg * 1.02, d: 3.2, h: 0.5, z0: z, a: ang, material: 'walkway' });
          const [rx, ry] = at(side * (gap / 2 - 3.1));
          out.strips.push({ x: rx, y: ry, w: seg * 1.02, d: 0.15, h: 1.1, z0: z + 0.5, a: ang, material: 'rail' });
          if (L > 1) {
            out.strips.push({ x: wx, y: wy, w: seg * 1.02, d: 3.4, h: 0.6, z0: z - 1.1, a: ang, material: 'soffit' });
            for (const t of [-0.3, 0.2]) {
              const [bx, by] = at(side * (gap / 2 - 1.7), t * seg);
              out.strips.push({ x: bx, y: by, w: 0.35, d: 3, h: 1.9, z0: z - 2.4, a: ang, material: 'girder' });
              const [ex, ey] = at(side * (gap / 2 - 3), t * seg);
              out.strips.push({ x: ex, y: ey, w: 0.3, d: 0.3, h: 3, z0: z - 3.4, a: ang, material: 'girder' });
            }
          }
        }
      }
    }
  };
  buildRun(even, levels, () => s.gap, () => s.depth, 1, true);

  // The delta: both ends fan out into smaller canyons, each narrowing and dropping to street level
  // as it spreads into the blocks around it, like a river's mouth.
  const delta = s.delta;
  if (delta) {
    // The sketch (2026-10-25): every branch is joined to the Ribbon at its root and shrinks into a smaller road. A
    // `fork` end splits into channels that carry on outward; a `comb` end keeps going with short channels peeling off both
    // sides. A branch is a narrowing canyon for its first part, dropping to street level, then a plain lit road.
    const toMain = (x: number, y: number) => {
      let best = Infinity;
      for (let i = 0; i < n - 1; i++) best = Math.min(best, segDist(x, y, even[i]!, even[i + 1]!));
      return best;
    };
    /** The roads of the branches built so far: a later branch's blocks keep off them too. */
    const earlier: ((x: number, y: number) => number)[] = [];
    /** Builds a branch, joined, not stacked over: its own blocks never stand in the Ribbon's canyon or an earlier branch's,
     * and the walls it cuts through (and what's on them) open where it leaves. */
    const joined = (bp: P[], gapAt: (i: number) => number, build: () => void) => {
      const b0 = out.buildings.length, pr0 = out.props.length;
      build();
      const branchGap = (x: number, y: number) => {
        let best = Infinity;
        for (let i = 0; i < bp.length - 1; i++) best = Math.min(best, segDist(x, y, bp[i]!, bp[i + 1]!) - gapAt(i) / 2);
        return best;
      };
      out.buildings = out.buildings.filter((b, i) => {
        const wall = b.kind === 'stack' || b.kind === 'tier' || b.kind === 'shack' || b.kind === 'bridge';
        if (!wall) return true;
        if (i >= b0) return toMain(b.x, b.y) > s.gap / 2 + 1 && earlier.every((g) => g(b.x, b.y) > 0.5);
        return branchGap(b.x, b.y) > 0.5;
      });
      earlier.push(branchGap);
      out.props = out.props.filter((p, i) => i >= pr0 || p.z0 <= 0.5 || branchGap(p.x, p.y) > 0.5);
    };
    const fan = (atEnd: boolean, cfg: DeltaEnd) => {
      if (cfg.style === 'fan') return boulevards(atEnd, cfg);
      const comb = (cfg.style ?? 'comb') === 'comb';
      const along = Math.max(cfg.branches, cfg.along ?? 30);
      for (let k = 0; k < cfg.branches; k++) {
        const step = comb ? Math.round(((k + 1) * along) / cfg.branches) : 0;
        const idx = atEnd ? Math.max(1, n - 1 - step) : Math.min(n - 2, step);
        const p0 = even[idx]!, p1 = even[atEnd ? idx - 1 : idx + 1]!;
        const dl = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) || 1;
        const dx = (p0[0] - p1[0]) / dl, dy = (p0[1] - p1[1]) / dl;
        const spread = (cfg.spread * Math.PI) / 180;
        const turn =
          ((cfg.turn ?? 0) * Math.PI) / 180 +
          (comb
            ? (k % 2 === 0 ? 1 : -1) * (spread / 2) // ribs: off to alternating sides
            : cfg.branches === 1 ? 0 : spread * (k / (cfg.branches - 1) - 0.5)) + // a fork: evenly across the spread
          between(r, -0.1, 0.1);
        const ca = Math.cos(turn), sa = Math.sin(turn);
        const bx = dx * ca - dy * sa, by = dx * sa + dy * ca;
        const L = between(r, cfg.length[0], cfg.length[1]);
        const wig = (r() < 0.5 ? -1 : 1) * between(r, 0.04, 0.12);
        const ctrl: P[] = [p0, ...[0.25, 0.5, 0.75, 1].map((t): P => [p0[0] + bx * L * t - by * Math.sin(t * Math.PI) * L * wig, p0[1] + by * L * t + bx * Math.sin(t * Math.PI) * L * wig])];
        const bp = resample(smooth(ctrl), s.resample);
        if (bp.length < 5) continue;
        const m = bp.length;
        const f = (i: number) => (m > 1 ? i / (m - 1) : 1);
        const top = Math.max(1, levels[idx]! - 1);
        const CANYON = 0.55;
        const lv = bp.map((_, i) => (f(i) > CANYON ? 0 : Math.max(1, Math.round(top - (top - 1) * (f(i) / CANYON)))));
        const g0 = s.gap * (comb ? 0.6 : 0.8), d0 = s.depth * (comb ? 0.55 : 0.75);
        const gapAt = (i: number) => (f(i) > CANYON ? Math.max(3, g0 * 0.45 * (1 - (f(i) - CANYON))) : g0 * (1 - 0.45 * (f(i) / CANYON)));
        const depthAt = (i: number) => d0 * (1 - 0.5 * Math.min(1, f(i) / CANYON));
        joined(bp, gapAt, () => buildRun(bp, lv, gapAt, depthAt, 0.5, false));
      }
    };
    // A `fan` end (the Strand): long boulevards from the very end, spread evenly, each bending a little,
    // running at street level after a short canyon, and stopping a little short of the coast (or `within`'s border).
    const boulevards = (atEnd: boolean, cfg: DeltaEnd) => {
      const idx = atEnd ? n - 1 : 0;
      const p0 = even[idx]!, p1 = even[atEnd ? n - 2 : 1]!;
      const head = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]) + ((cfg.turn ?? 0) * Math.PI) / 180;
      const spread = (cfg.spread * Math.PI) / 180;
      const width = cfg.width ?? s.gap * 0.8;
      const bend = cfg.bend ?? 0;
      const ok = (x: number, y: number) => !clip || clip(x, y, cfg.within);
      const STEP = 20;
      /** A meandering centreline: sets off on bearing a0, swings toward a1, swaying as it goes; cut where it leaves land
       * (or the district), a quay's width short. */
      const meander = (from: P, a0: number, a1: number, L: number, sway: number, phase: number): P[] => {
        const ctrl: P[] = [from];
        for (let d = STEP; d <= L; d += STEP) {
          const t = d / L, g = t * t * (3 - 2 * t);
          const a = a0 + (a1 - a0) * g + sway * Math.sin(t * Math.PI * 2.2 + phase) * Math.min(1, t * 4);
          const q = ctrl.at(-1)!;
          ctrl.push([q[0] + Math.cos(a) * STEP, q[1] + Math.sin(a) * STEP]);
        }
        let bp = resample(smooth(ctrl), s.resample);
        const inAt = bp.findIndex((q) => ok(q[0], q[1]));
        if (inAt < 0 || inAt > 12) return [];
        const cut = bp.findIndex((q, i) => i > inAt && !ok(q[0], q[1]));
        // Run on to the boardwalk at the shore.
        if (cut >= 0) bp = bp.slice(0, Math.max(0, cut - 1));
        return bp.length < 8 ? [] : bp;
      };
      /** Whether a road runs on to the shore (it stopped at the water, not at the district's edge or short). */
      const reachesShore = (bp: P[]) => {
        const [a, b] = [bp.at(-2)!, bp.at(-1)!];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        for (let t = 4; t <= 30; t += 4) if (clip && !clip(b[0] + ((b[0] - a[0]) / d) * t, b[1] + ((b[1] - a[1]) / d) * t)) return true;
        return false;
      };
      /** The roads laid so far: a new one may not run within a road's width of them past its own root. */
      const laid: P[][] = [];
      const clear = (bp: P[], skip: number) =>
        bp.slice(skip).every((q) => laid.every((o) => o.every((u) => Math.hypot(u[0] - q[0], u[1] - q[1]) > width * 1.6)));
      // (2026-10-26): like a river's mouth, not spokes. A few trunk boulevards leave the Ribbon's end and meander
      // across the district; branches peel off them partway and wander to the coast, so the blocks sit between curving
      // roads.
      const trunks: P[][] = [];
      for (let k = 0; k < cfg.branches; k++) {
        const a0 = head + (cfg.branches === 1 ? 0 : spread * (k / (cfg.branches - 1) - 0.5)) + between(r, -0.08, 0.08);
        const bp = meander(p0, a0, a0 + (head - a0) * bend, between(r, cfg.length[0], cfg.length[1]), between(r, 0.06, 0.14), between(r, 0, 6.3));
        if (!bp.length) continue;
        trunks.push(bp);
        laid.push(bp);
        street(bp, width, true);
      }
      for (const trunk of trunks) {
        for (let b = 0; b < (cfg.offshoots ?? 0); b++) {
          const at = Math.round(between(r, 0.22, 0.75) * (trunk.length - 1));
          const q0 = trunk[at]!, q1 = trunk[Math.min(trunk.length - 1, at + 1)]!;
          const along = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
          const side = r() < 0.5 ? -1 : 1;
          const a0 = along + side * between(r, 0.45, 0.8);
          const bp = meander(q0, a0, a0 + (head - a0) * bend * 0.5, between(r, cfg.length[0] * 0.4, cfg.length[1] * 0.6), between(r, 0.15, 0.28), between(r, 0, 6.3));
          // No dead ends: a branch runs from its trunk all the way to the shore, or isn't built.
          if (!bp.length || !reachesShore(bp) || !clear(bp, 12)) continue;
          laid.push(bp);
          street(bp, width * 0.55, true);
        }
      }
    };
    /** A street-level road: lamps, neon shopfronts along both sides, and the blocks right up to it. */
    const street = (bp: P[], width: number, boulevard: boolean) => {
      const m = bp.length;
      // Street level all the way: the Ribbon's end and its ribs are the canyon here.
      const lv = bp.map(() => 0);
      // At street level the blocks come right up to the road: a negative depth cancels the lots' clearance there.
      joined(bp, () => width, () => buildRun(bp, lv, () => width, (i) => (lv[i]! > 0 ? 2 : -CLEARANCE + 3), 0.4, false, boulevard ? 9 : 1000));
      for (let i = 0; i < m - 1; i++) {
        if (lv[i]! > 0) continue;
        const [a0, a1] = [bp[i]!, bp[i + 1]!];
        const ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2;
        for (const side of [-1, 1]) {
          if (r() < (boulevard ? 0.55 : 0.3)) {
            const o = side * (width / 2 + 0.4);
            out.props.push({ kind: 'shopfront', x: mx + nx * o, y: my + ny * o, z0: 0.4, w: s.resample * 0.8, d: 0.4, h: 2.2, a: ang, color: pick(r, s.shopColors) });
          }
          // Lamp posts along the kerbs, staggered.
          if (boulevard && i % 4 === (side > 0 ? 0 : 2)) {
            const o = side * (width / 2 - 1);
            out.strips.push({ x: mx + nx * o, y: my + ny * o, w: 0.25, d: 0.25, h: 4, z0: 0.3, a: ang, material: 'girder' });
            out.props.push({ kind: 'lamp', x: mx + nx * (o - side * 0.8), y: my + ny * (o - side * 0.8), z0: 4.1, w: 1.2, d: 0.5, h: 0.3, a: ang, color: '#ffe2b0' });
          }
        }
        // A planted median down the boulevards' middles, every few segments.
        if (boulevard && i % 3 === 1) out.props.push({ kind: 'pine', x: mx, y: my, z0: 0.3, w: 2.2, d: 2.2, h: 3.4, a: 0 });
      }
    };
    for (const cfg of [delta.start].flat()) fan(false, cfg);
    for (const cfg of [delta.end].flat()) fan(true, cfg);
  }
  // Darkness over the low levels.
  const left = offsetPath(even, -s.gap / 2 + 0.3), right = offsetPath(even, s.gap / 2 - 0.3);
  out.volumes.push({ kind: 'canyon-dark', outline: [...left, ...right.reverse()], z0: 0.1, z1: s.darkness.levels * LH, density: s.darkness.density });
  // Each place's pin height: its level's walkway, or above the stack's roof on its side.
  for (const p of mine) {
    if (p.level === undefined) continue;
    const px = (p.pin[0] / 100) * MAP_W, py = (p.pin[1] / 100) * MAP_H;
    const i = nearestSeg(px, py);
    const [a, b] = [even[i]!, even[i + 1]!];
    const nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const side = (px - a[0]) * nx + (py - a[1]) * ny > 0 ? 1 : -1;
    out.pinHeights[p.id] = pinHeight(p.level, LH, stackH[side]![i] ?? levels[i]! * LH);
  }
  out.distance = (x, y) => {
    let best = Infinity;
    for (const run of runs)
      for (let i = 0; i < run.pts.length - 1; i++) best = Math.min(best, segDist(x, y, run.pts[i]!, run.pts[i + 1]!) - (run.gapAt(i) / 2 + run.depthAt(i)));
    return best;
  };
  out.branches = runs.slice(1).map((run) => run.pts);
  out.frame = (x, y) => {
    const i = nearestSeg(x, y);
    const [a, b] = [even[i]!, even[i + 1]!];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const side: 1 | -1 = (x - a[0]) * nx + (y - a[1]) * ny > 0 ? 1 : -1;
    return { mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, ang, nx, ny, side, stackHeight: stackH[side]![i] ?? levels[i]! * LH, levels: levels[i]!, levelHeight: LH, gap: s.gap, depth: s.depth };
  };
  return out;
}
