// The city's ordinary blocks (spec 2026-10-25 §3), ported from the test's gen.py and render3.py: each district's lots on a
// rotated, jittered grid inside its border, styled by its map/city/districts file. Karasu rises toward the Ribbon and is
// brick, broken and gap-toothed in Old Town. Each district has its own seed, so restyling one never reshuffles another.
import { insideBorder, type Anchor, type District } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { DistrictStyle } from '../../shared/city-schema';
import type { Box, Curve, Light, Prop, Strip } from './geometry';
import type { CityData } from './load';
import { between, pick, rng } from './rng';

/** Lots closer than this to a structure, road or rail stay empty (map px). */
export const CLEARANCE = 26;

const inside = (x: number, y: number, border: Anchor[]) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
const px = (b: Anchor[]) => b.map((a) => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H] as const);

function corners(x: number, y: number, w: number, d: number, a: number): [number, number][] {
  const c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [x + (sx! * w * c) / 2 - (sy! * d * s) / 2, y + (sx! * w * s) / 2 + (sy! * d * c) / 2]);
}

interface Out {
  buildings: Box[];
  props: Prop[];
  lights: Light[];
  curves: Curve[];
  strips: Strip[];
}

/** The Strand's details pass: neon tracing a roof's edge, a billboard up on the roof, a lit marquee over
 * the street door. Blocks by the boulevards (front) get them most; the neon stays dim so its bloom keeps inside a tile. */
function strandDetails(r: () => number, out: Out, s: DistrictStyle, x: number, y: number, w: number, d: number, top: number, a: number, front: boolean) {
  const D = s.details!;
  const k = front ? 1 : 0.3;
  const ca = Math.cos(a), sa = Math.sin(a);
  if (r() < D.roofNeon * k) {
    const inset = 0.4;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([u, v]): [number, number, number] => {
      const lx = u! * (w / 2 - inset), ly = v! * (d / 2 - inset);
      return [x + lx * ca - ly * sa, y + lx * sa + ly * ca, top + 0.3];
    });
    out.curves.push({ points: pts, bevel: 0.14, material: 'neon', color: pick(r, s.signColors), strength: 12 });
  }
  if (r() < D.boards * k) {
    const bw = Math.min(w * 0.8, 9);
    out.props.push({ kind: 'board-frame', x, y, z0: top, w: bw + 0.6, d: 0.5, h: 5, a });
    out.props.push({ kind: 'billboard', x: x - sa * 0.3, y: y + ca * 0.3, z0: top + 0.8, w: bw, d: 0.2, h: 3.8, a, color: pick(r, s.signColors) });
  }
  if (r() < D.marquees * k) {
    // On the block's long face toward the camera (map +y, rotated).
    const fx = x - sa * (d / 2 + 0.6), fy = y + ca * (d / 2 + 0.6);
    out.props.push({ kind: 'shopfront', x: fx, y: fy, z0: 2.6, w: w * 0.7, d: 1.2, h: 0.5, a, color: pick(r, s.signColors) });
  }
}

/** A drowned block (the Marsh): a dark stain wrapping it to the waterline (the lower floors are under), now and then a fire
 * on the roof, and the Drowned Choir's candle ring. */
function drowned(r: () => number, out: Out, s: DistrictStyle, district: string, x: number, y: number, w: number, d: number, z0: number, top: number, a: number) {
  const F = s.flooded!;
  out.strips.push({ x, y, w: w + 0.25, d: d + 0.25, h: F.waterline - z0, z0, a, material: 'soffit' });
  // People live up top (bigger rooftop settlements): a cluster of shacks across the roof, now and then one
  // built on another, a lamp, a water tank.
  if (r() < 0.7) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const u = between(r, -w / 2 + 2.2, w / 2 - 2.2), v = between(r, -d / 2 + 2, d / 2 - 2);
      const sx = x + u * ca - v * sa, sy = y + u * sa + v * ca;
      const sw = between(r, 2.8, 5.2), sd = between(r, 2.4, 4), sh = between(r, 2.4, 3.8), sa2 = a + (r() < 0.5 ? 0 : between(r, -0.35, 0.35));
      out.buildings.push({ x: sx, y: sy, w: sw, d: sd, h: sh, z0: top, a: sa2, tint: pick(r, ['#ffb347', '#ff9a4a', '#ffcf7a']), lit: 0.9, brick: 0, seed: r(), district, kind: 'shack' });
      // Its lit doorway, so the settlement reads at night.
      out.props.push({ kind: 'shopfront', x: sx - Math.sin(sa2) * (sd / 2 + 0.15), y: sy + Math.cos(sa2) * (sd / 2 + 0.15), z0: top + 0.3, w: sw * 0.4, d: 0.2, h: 1.5, a: sa2, color: pick(r, ['#ffb347', '#ff9a4a', '#ffcf7a']) });
      if (r() < 0.25) out.buildings.push({ x: sx, y: sy, w: sw * 0.75, d: sd * 0.8, h: between(r, 2.2, 3), z0: top + sh, a: sa2, tint: '#ffb347', lit: 0.9, brick: 0, seed: r(), district, kind: 'shack' });
    }
    if (r() < 0.5) out.props.push({ kind: 'lamp', x: x + between(r, -w / 4, w / 4), y: y + between(r, -d / 4, d / 4), z0: top + 2.6, w: 0.6, d: 0.6, h: 0.6, a: 0, color: '#ffb347' });
    if (r() < 0.3) out.props.push({ kind: 'tank', x: x + between(r, -w / 3, w / 3), y: y + between(r, -d / 3, d / 3), z0: top, w: 2.2, d: 2.2, h: 2.4, a: 0 });
  }
  if (r() < 0.3) {
    const p0x = x - (Math.cos(a) * w) / 3, p0y = y - (Math.sin(a) * w) / 3;
    for (let k = 0; k < 4; k++) {
      const u = (k + 1) / 5;
      out.props.push({ kind: 'laundry', x: p0x + Math.cos(a) * (w * 0.66) * u, y: p0y + Math.sin(a) * (w * 0.66) * u, z0: top + 1.4, w: 0.8, d: 0.08, h: 0.8, a, color: pick(r, ['#8a6a6a', '#6a7a8a', '#a08a6a', '#c0b0a0']) });
    }
  }
  if (r() < F.roofFires) {
    out.props.push({ kind: 'barrel', x: x + between(r, -w / 4, w / 4), y: y + between(r, -d / 4, d / 4), z0: top, w: 1, d: 1, h: 1.2, a: 0, color: '#ff7a2a', supply: 'own' });
    if (r() < 0.35) out.lights.push({ x, y, z: top + 3, color: '#ff7a2a', power: 20000, radius: 1, reach: 35, supply: 'own' });
  }
}

function clutter(r: () => number, out: Out, x: number, y: number, w: number, d: number, top: number, a: number) {
  if (r() < 0.35) out.props.push({ kind: 'tank', x: x + between(r, -w / 4, w / 4), y: y + between(r, -d / 4, d / 4), z0: top, w: 2.8, d: 2.8, h: 2.6, a: 0 });
  const n = Math.floor(r() * 4);
  for (let k = 0; k < n; k++) out.props.push({ kind: 'ac', x: x + between(r, -w / 3, w / 3), y: y + between(r, -d / 3, d / 3), z0: top, w: 1.4, d: 1.1, h: 0.9, a });
  if (r() < 0.12) out.props.push({ kind: 'mast', x: x + between(r, -w / 3, w / 3), y, z0: top, w: 0.3, d: 0.3, h: between(r, 5, 12), a: 0 });
}

function rubble(r: () => number, out: Out, x: number, y: number, w: number, d: number, a: number, n: number) {
  for (let k = 0; k < n; k++)
    out.props.push({ kind: 'rubble', x: x + between(r, -w / 2, w / 2), y: y + between(r, -d / 2, d / 2), z0: 0, w: between(r, 0.6, 2.4), d: between(r, 0.6, 2), h: between(r, 0.3, 1.4), a: a + between(r, -0.6, 0.6) });
}

/** A ruined shell's walls: thin, broken to a few heights, now and then a hole. */
function ruinWalls(r: () => number, out: Out, cs: [number, number][], h: number, tint: string, district: string) {
  for (let i = 0; i < 4; i++) {
    if (r() >= 0.85) continue;
    const p = cs[i]!, q = cs[(i + 1) % 4]!;
    const k = 2 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      if (r() < 0.15) continue;
      const t0 = j / k, t1 = (j + 1) / k;
      const ax = p[0] + (q[0] - p[0]) * t0, ay = p[1] + (q[1] - p[1]) * t0, bx = p[0] + (q[0] - p[0]) * t1, by = p[1] + (q[1] - p[1]) * t1;
      out.buildings.push({ x: (ax + bx) / 2, y: (ay + by) / 2, w: Math.hypot(bx - ax, by - ay), d: 0.8, h: h * between(r, 0.35, 1), z0: 0, a: Math.atan2(by - ay, bx - ax), tint, lit: 0, brick: 1, seed: r(), district, kind: 'wall' });
    }
  }
}

/** `ground`: the district's own ground height (an isle on cliffs); each lot stands on it, and a lot across a step or a
 * cliff face is left empty. */
function districtLots(d: District, s: DistrictStyle, others: Anchor[][], keepOut: (x: number, y: number) => number, z0Base: number, out: Out, toNear: (x: number, y: number) => number, ground?: (x: number, y: number) => number) {
  const z0Flat = z0Base;
  const border = d.border!;
  const r = rng(`lots:${d.id}`);
  const pts = px(border);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const a = ((s.angleDeg ?? between(r, -18, 18)) * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const [cw, ch] = s.lot;
  const [ec, er] = s.streetEvery;
  const near = s.nearStructure;
  const mod = (v: number, n: number) => ((v % n) + n) % n;
  // The flooded district's extras draw from their own stream, so the blocks stay put.
  const fr = rng(`flooded:${d.id}`);
  const a0 = a;
  for (let i = Math.floor(-R / cw); i <= Math.ceil(R / cw); i++) {
    for (let j = Math.floor(-R / ch); j <= Math.ceil(R / ch); j++) {
      if (mod(i, ec) === 0 || mod(j, er) === 0) continue;
      let u = i * cw + between(r, -1, 1);
      const v = j * ch + between(r, -1, 1);
      // Draw every lot's randomness in the same order whether or not it's kept, so moving a road keeps the rest.
      const roll = Array.from({ length: 16 }, r);
      const big = roll[0]! < 0.22;
      if (big && mod(i, ec) !== 1) continue;
      if (big) u += cw / 2;
      // Gone under (the Marsh): each block settled its own way as the ground sank, turned a little and off its slot.
      const settle = s.flooded ? [between(fr, -0.17, 0.17), between(fr, -2.5, 2.5), between(fr, -2, 2)] : [0, 0, 0];
      const a = a0 + settle[0]!;
      const x = cx + u * ca - v * sa + settle[1]!, y = cy + u * sa + v * ca + settle[2]!;
      if (!inside(x, y, border) || others.some((o) => inside(x, y, o))) continue;
      const dist = keepOut(x, y);
      if (dist < CLEARANCE) continue;
      let z0 = z0Flat;
      if (ground) {
        const hs = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]) => ground(x + (u! * cw) / 2, y + (v! * ch) / 2));
        // Not on a face, and set back from the cliff edge: a lot's ring a little wider must be level too.
        const rim = [[-1.8, 0], [1.8, 0], [0, -1.8], [0, 1.8]].map(([u, v]) => ground(x + (u! * cw) / 2, y + (v! * ch) / 2));
        if (Math.min(...hs, ...rim) < 4 || Math.max(...hs) - Math.min(...hs) > 4) continue;
        z0 = Math.min(...hs);
      }
      if (roll[1]! < s.emptyLot) {
        rubble(r, out, x, y, cw - 2, ch - 2, a, 2 + Math.floor(roll[2]! * 5));
        if (roll[3]! < s.fireInLot) {
          out.props.push({ kind: 'barrel', x, y, z0, w: 1, d: 1, h: 1.2, a: 0, color: '#ff7a2a', supply: 'own' });
          out.lights.push({ x, y, z: z0 + 3, color: '#ff7a2a', power: 25000, radius: 1, reach: 40, supply: 'own' });
        }
        continue;
      }
      const boost = near ? Math.max(0, 1 - (toNear(x, y) - near.boostStart) / near.boostDistance) : 0;
      const front = boost > 0.35;
      const w = (big ? cw * 2 : cw) - between(r, 1.5, 4);
      const dd = ch - between(r, 1.5, 3.5);
      const h =
        (s.height[0] + (s.height[1] - s.height[0]) * roll[4]!) *
        (near ? 1 + near.boostGain * boost ** near.boostPower : 1) *
        (1 + roll[5]! ** 6 * s.tallGain) *
        (near && !front ? near.farScale : 1);
      const lit = Math.min(1, s.windowLit * (near ? 1 + near.litGain * boost : 1));
      const brickShare = near && front ? near.brickNear : s.brick;
      const brick: 0 | 1 = roll[6]! < brickShare ? 1 : 0;
      const tint = pick(r, s.windowColors);
      const cs = corners(x, y, w, dd, a);
      // Only whole footprints: a lot straddling the border stays empty (no wall or roof half pokes out).
      if (!cs.every(([qx, qy]) => inside(qx, qy, border))) continue;
      const base = { tint, lit, brick, seed: roll[7]!, district: d.id, kind: 'building' as const, a };
      if (!front && roll[8]! < s.ruin) {
        ruinWalls(r, out, cs, h, tint, d.id);
        rubble(r, out, x, y, w * 0.7, dd * 0.7, a, 3 + Math.floor(roll[9]! * 5));
        continue;
      }
      let top = h;
      // A broken roofline's standing half, on whichever side stays inside the district.
      const half = (roll[11]! < 0.5 ? [-1, 1] : [1, -1]).map((sgn) => sgn * (w / 4)).find((f) => inside(x + f * ca, y + f * sa, border));
      if (!front && roll[10]! < s.brokenRoof && half !== undefined) {
        // A broken roofline: the block lower, half of it standing to full height, sometimes fallen bits on the low half.
        out.buildings.push({ ...base, x, y, w, d: dd, h: h * 0.7, z0 });
        const fx = half;
        out.buildings.push({ ...base, x: x + fx * ca, y: y + fx * sa, w: w / 2, d: dd, h: h * between(r, 0.15, 0.4), z0: z0 + h * 0.7 });
        if (roll[12]! < 0.5) rubble(r, out, x - fx * ca, y - fx * sa, w / 2.5, dd / 2, a, 2);
        top = h * 0.7;
      } else if (front && roll[13]! < (near?.setbackNear ?? s.setback)) {
        out.buildings.push({ ...base, x, y, w, d: dd, h: h * 0.65, z0 });
        out.buildings.push({ ...base, x, y, w: w * 0.6, d: dd * 0.7, h: h * 0.45, z0: z0 + h * 0.65 });
      } else out.buildings.push({ ...base, x, y, w, d: dd, h, z0 });
      clutter(r, out, x, y, w, dd, z0 + top, a);
      if (s.flooded) drowned(fr, out, s, d.id, x, y, w, dd, z0, z0 + top, a);
      if (s.details) strandDetails(r, out, s, x, y, w, dd, z0 + top, a, front);
      if ((!near || front) && roll[14]! < (front ? near!.signShareNear : s.signShare)) {
        const [sx, sy] = cs[Math.floor(roll[15]! * 4)]!;
        out.props.push({ kind: 'sign', x: sx, y: sy, z0: z0 + h * between(r, 0.35, 0.6), w: 0.5, d: 1.6, h: Math.min(10, h * 0.35), a, color: pick(r, s.signColors) });
      }
    }
  }
  // The grid's streets as roads (the Strand: Atlantic City's grid squared to the shore, the boulevards
  // cutting across it): a paved strip down each street cell, stopping where a boulevard, structure or the boardwalk is,
  // dim lamps now and then. Their own random stream, so the blocks don't move.
  if (s.gridRoads) {
    const G = s.gridRoads;
    const gr = rng(`grid:${d.id}`);
    let n = 0;
    for (let i = Math.floor(-R / cw); i <= Math.ceil(R / cw); i++)
      for (let j = Math.floor(-R / ch); j <= Math.ceil(R / ch); j++) {
        const col = mod(i, ec) === 0, row = mod(j, er) === 0;
        if (!col && !row) continue;
        const u = i * cw, v = j * ch;
        const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
        if (!inside(x, y, border) || others.some((o) => inside(x, y, o)) || keepOut(x, y) < 1) continue;
        // A column runs along the grid's v axis, a row along u; a crossing gets both.
        for (const [on, len, ang] of [[col, ch, a + Math.PI / 2], [row, cw, a]] as const) {
          if (!on) continue;
          // Both ends on the district's ground, clear of boulevards and the boardwalk: nothing pokes past the shore.
          const ex = (Math.cos(ang) * len) / 2, ey = (Math.sin(ang) * len) / 2;
          if (![[x + ex, y + ey], [x - ex, y - ey]].every(([qx, qy]) => inside(qx!, qy!, border) && keepOut(qx!, qy!) > 0)) continue;
          out.strips.push({ x, y, w: len + 0.5, d: G.width, h: 0.2, z0: z0Flat + 0.06, a: ang, material: 'street' });
          if (++n % G.lampEvery === 0) {
            const side = gr() < 0.5 ? -1 : 1;
            const lx = x - Math.sin(ang) * side * (G.width / 2 + 0.6), ly = y + Math.cos(ang) * side * (G.width / 2 + 0.6);
            out.props.push({ kind: 'lamp', x: lx, y: ly, z0: z0Flat + 3.2, w: 1.3, d: 1.3, h: 0.6, a: 0, color: '#ffd38a' });
          }
        }
      }
  }
  // Canals (a flooded district's streets): boats with a lantern, plank bridges strung between the roofs; and the Choir's
  // candle rings on some roofs.
  if (s.flooded) {
    const F = s.flooded;
    const cr = rng(`canals:${d.id}`);
    for (let i = Math.floor(-R / cw); i <= Math.ceil(R / cw); i++)
      for (let j = Math.floor(-R / ch); j <= Math.ceil(R / ch); j++) {
        const col = mod(i, ec) === 0, row = mod(j, er) === 0;
        if (!col && !row) continue;
        const u = i * cw, v = j * ch;
        const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
        if (!inside(x, y, border) || others.some((o) => inside(x, y, o)) || keepOut(x, y) < 1) continue;
        // Along the canal: a column runs along v, a row along u.
        const along = col ? a + Math.PI / 2 : a;
        if (cr() < F.boats) {
          const t = between(cr, -3, 3);
          const bx = x + Math.cos(along) * t, by = y + Math.sin(along) * t;
          out.strips.push({ x: bx, y: by, w: between(cr, 3.5, 5.5), d: 1.5, h: 0.7, z0: -0.5, a: along, material: 'concrete' });
          out.props.push({ kind: 'lamp', x: bx, y: by, z0: 0.6, w: 0.5, d: 0.5, h: 0.6, a: 0, color: '#ffb347', supply: 'own' });
          // Some lit, so the canals carry their reflections.
          if (cr() < 0.3) out.lights.push({ x: bx, y: by, z: 1.5, color: '#ffb347', power: 9000, radius: 1, reach: 30, supply: 'own' });
        }
        if (cr() < F.bridges) {
          // Across the canal, roof to roof (or window to window).
          const span = col ? cw : ch;
          const bz = between(cr, 4, 11);
          out.strips.push({ x, y, w: span + 1, d: 1.1, h: 0.25, z0: bz, a: along + Math.PI / 2, material: 'walkway' });
          if (cr() < 0.35) out.props.push({ kind: 'lamp', x, y, z0: bz + 0.3, w: 0.5, d: 0.5, h: 0.6, a: 0, color: '#ffb347' });
        }
      }
    // Bridges across the roofs: each block strung to a near neighbour, roof to roof at the lower roof's
    // height, a lantern on some.
    const roofs = out.buildings.filter((q) => q.district === d.id && q.kind === 'building' && q.z0 < 0);
    const linked = new Set<string>();
    for (let i = 0; i < roofs.length; i++) {
      if (cr() > 0.65) continue;
      const A = roofs[i]!;
      let best = -1, bd = Infinity;
      for (let j = 0; j < roofs.length; j++) {
        if (j === i || linked.has(`${Math.min(i, j)}:${Math.max(i, j)}`)) continue;
        const dd = Math.hypot(roofs[j]!.x - A.x, roofs[j]!.y - A.y);
        if (dd >= 16 && dd <= 42 && dd < bd) [best, bd] = [j, dd];
      }
      if (best < 0) continue;
      const B = roofs[best]!;
      linked.add(`${Math.min(i, best)}:${Math.max(i, best)}`);
      const z = Math.min(A.z0 + A.h, B.z0 + B.h) + 0.2;
      out.strips.push({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, w: 0, d: 1.2, h: 0.3, z0: z, a: Math.atan2(B.y - A.y, B.x - A.x), material: 'walkway', ends: [[A.x, A.y, z], [B.x, B.y, z]] });
      // A rope of little lights along its rail: a faint amber line between the roofs.
      out.strips.push({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, w: 0, d: 0.18, h: 0.12, z0: z + 1, a: Math.atan2(B.y - A.y, B.x - A.x), material: 'street-light', color: '#ff9a4a', ends: [[A.x, A.y, z + 1], [B.x, B.y, z + 1]] });
      // Lanterns along most of them, so they read as lines of light.
      if (cr() < 0.7) {
        const n = Math.max(1, Math.round(bd / 10));
        for (let k = 1; k <= n; k++) {
          const u = k / (n + 1);
          out.props.push({ kind: 'lamp', x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u, z0: z + 0.3, w: 0.8, d: 0.8, h: 0.8, a: 0, color: '#ffb347' });
        }
      }
    }
    // The Drowned Choir: candle rings on a few roofs.
    const mine = out.buildings.filter((b) => b.district === d.id && b.kind === 'building');
    for (let k = 0; k < F.choir && mine.length; k++) {
      const b = mine[Math.floor(cr() * mine.length)]!;
      const top = b.z0 + b.h, rad = Math.min(b.w, b.d) * 0.3;
      for (let q = 0; q < 9; q++) {
        const t = (q / 9) * Math.PI * 2;
        out.props.push({ kind: 'lamp', x: b.x + Math.cos(t) * rad, y: b.y + Math.sin(t) * rad, z0: top, w: 0.35, d: 0.35, h: 0.5, a: 0, color: '#ffd27a', supply: 'own' });
      }
      out.lights.push({ x: b.x, y: b.y, z: top + 2, color: '#ffd27a', power: 7000, radius: 1, reach: 25, supply: 'own' });
    }
  }
  // Light pools over the district, kept inside its border.
  const pr = rng(`pools:${d.id}`);
  let made = 0;
  for (let tries = 0; made < s.pools.count && tries < 20000; tries++) {
    const x = between(pr, Math.min(...xs), Math.max(...xs)), y = between(pr, Math.min(...ys), Math.max(...ys));
    if (!inside(x, y, border)) continue;
    out.lights.push({ x, y, z: z0Flat + between(pr, 20, 50), color: pick(pr, s.pools.colors), power: s.pools.power, radius: s.pools.radius, reach: s.pools.reach });
    made++;
  }
}

/**
 * Every district's blocks. `keepOut` is the distance (map px) from a point to the nearest structure, road or rail: under
 * CLEARANCE nothing is built, and a district with `nearStructure` rises toward it.
 */
/** `toNear`: the distance a district's `nearStructure` boost reads (default: keepOut). */
export function cityLots(city: CityData, keepOut: (x: number, y: number) => number, toNear: (x: number, y: number) => number = keepOut, grounds: Record<string, (x: number, y: number) => number> = {}): Out {
  const out: Out = { buildings: [], props: [], lights: [], curves: [], strips: [] };
  const withBorder = city.map.districts.filter((d) => d.border && d.border.length >= 3);
  withBorder.forEach((d, i) => {
    const style = city.styles[d.id];
    if (!style) return;
    // A flooded district's blocks stand in the water (the water plane is at -0.6).
    const z0 = style.flooded ? -0.6 : city.terrain && city.terrain.plateau === d.id ? city.terrain.height : 0;
    // An isle places its own buildings on pads (Tidal Isle).
    if (style.isle) return;
    // A city core lays out its own towers (Nexus).
    if (style.core || style.industry || style.port || style.arcologies || style.hill || style.enclave) return;
    districtLots(d, style, withBorder.slice(0, i).map((o) => o.border!), keepOut, z0, out, toNear, grounds[d.id]);
  });
  return out;
}
