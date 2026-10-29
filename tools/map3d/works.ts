// Drownworks (2026-10-26): the part of the lower city that was saved. Settling bays glowing teal in a grid, catwalks across
// them, concrete basins, a brick pump house at the end of each (Pump House Nine on the bay by its pin, a steady amber
// beacon on it); pipe racks along the corridors between; and a floodwall that held, whole along its coast with lamps on
// top: the Marsh's breached wall is next door.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor, type Place } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { EMERGENCY_LIGHT, LANDMARK_BACKUP, type Box, type Light, type Prop, type Strip } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];
type Works = NonNullable<DistrictStyle['works']>;
export interface WorksGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  lights: Light[];
  /** From a point to the nearest bay's basin (map px; negative inside one): blocks keep off the bays. */
  distance: (x: number, y: number) => number;
}

const SODIUM = ['#ffb060', '#ffc27a', '#ff9a4a'];

/** `drowned`: whether a point is in a flooded district (the Marsh): coast facing it gets only small landings. */
/** `solid`: whether a point is ground (any district, an isle): a pier's run and its clearance must be open water. */
export function worksGeometry(district: string, cfg: Works, border: Anchor[], places: Place[], coast: [P, P][], drowned: (x: number, y: number) => boolean = () => false, solid: (x: number, y: number) => boolean = () => false): WorksGeometry {
  const r = rng(`works:${district}`);
  const hr = rng(`homes:${district}`);
  const out: WorksGeometry = { buildings: [], props: [], strips: [], lights: [], distance: () => Infinity };
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const pts = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const R = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const a = (cfg.angleDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const B = cfg.bay;
  const pitchU = B.w + cfg.gap, pitchV = B.d + cfg.gap;
  const pin = places.find((p) => p.id === cfg.near);
  const [px, py] = pin ? [(pin.pin[0] / 100) * MAP_W, (pin.pin[1] / 100) * MAP_H] : [cx, cy];
  // The grid is anchored so one bay sits beside the pin (Pump House Nine's).
  const ou = (px - cx) * ca + (py - cy) * sa, ov = -(px - cx) * sa + (py - cy) * ca - B.d / 2 - 6;
  const at = (u: number, v: number): P => [cx + u * ca - v * sa, cy + u * sa + v * ca];
  const whole = (x: number, y: number, w: number, d: number, m: number, an = a) => {
    const c = Math.cos(an), sn = Math.sin(an);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([s, t]) => inside(x + (s! * (w / 2 + m)) * c - (t! * (d / 2 + m)) * sn, y + (s! * (w / 2 + m)) * sn + (t! * (d / 2 + m)) * c));
  };

  type Slot = { x: number; y: number; w: number; d: number; a: number };
  const bays: Slot[] = [];
  const halls: Slot[] = [];
  // Zones (the grid should break up in places, at different angles): the home zone round Pump House
  // Nine on the district's angle, a few more spread out, each turned its own way. A slot belongs to the zone whose centre
  // is nearest, and never overlaps a slot already laid.
  const zones: { c: P; a: number }[] = [{ c: [px, py], a }];
  const zr = rng(`zones:${district}`);
  for (let t = 0; t < 500 && zones.length < cfg.zones.count; t++) {
    const x = cx + between(zr, -R, R), y = cy + between(zr, -R, R);
    if (!inside(x, y) || zones.some((z) => Math.hypot(z.c[0] - x, z.c[1] - y) < cfg.zones.apart)) continue;
    zones.push({ c: [x, y], a: a + ((zr() < 0.5 ? -1 : 1) * between(zr, cfg.zones.turn[0], cfg.zones.turn[1]) * Math.PI) / 180 });
  }
  const zoneOf = (x: number, y: number) => zones.reduce((m, z, i) => (Math.hypot(z.c[0] - x, z.c[1] - y) < Math.hypot(zones[m]!.c[0] - x, zones[m]!.c[1] - y) ? i : m), 0);
  // Highways along the seams between zones: each pair of neighbouring zones meets along the line halfway
  // between their centres; the stretch where no third zone is nearer, inside the Works, carries a wide lit road.
  const highways: P[][] = [];
  for (let i = 0; i < zones.length; i++)
    for (let j = i + 1; j < zones.length; j++) {
      const [ci, cj] = [zones[i]!.c, zones[j]!.c];
      const mx = (ci[0] + cj[0]) / 2, my = (ci[1] + cj[1]) / 2, L = Math.hypot(cj[0] - ci[0], cj[1] - ci[1]) || 1;
      const dx = -(cj[1] - ci[1]) / L, dy = (cj[0] - ci[0]) / L;
      const onSeam = (x: number, y: number) => {
        const k = zoneOf(x, y);
        const di = Math.hypot(ci[0] - x, ci[1] - y);
        return (k === i || k === j) && zones.every((z, n) => n === i || n === j || Math.hypot(z.c[0] - x, z.c[1] - y) >= di - 1) && inside(x, y);
      };
      const run = (sgn: number) => {
        const pts: P[] = [];
        for (let t = 0; t < 2 * R; t += 8) {
          const x = mx + dx * t * sgn, y = my + dy * t * sgn;
          if (!onSeam(x, y)) break;
          pts.push([x, y]);
        }
        return pts;
      };
      const path = [...run(-1).reverse(), ...run(1).slice(1)];
      if (path.length * 8 >= cfg.highway.min) highways.push(path);
    }
  const toHighway = (x: number, y: number) => {
    let best = Infinity;
    for (const h of highways)
      for (let k = 0; k < h.length - 1; k++) {
        const [p0, p1] = [h[k]!, h[k + 1]!], ex = p1[0] - p0[0], ey = p1[1] - p0[1];
        const t = Math.max(0, Math.min(1, ((x - p0[0]) * ex + (y - p0[1]) * ey) / (ex * ex + ey * ey || 1)));
        best = Math.min(best, Math.hypot(x - p0[0] - t * ex, y - p0[1] - t * ey));
      }
    return best;
  };
  const slots: [number, number, boolean, number][] = [];
  for (const [zi, z] of zones.entries()) {
    const c = Math.cos(z.a), sn = Math.sin(z.a);
    // The home zone keeps the grid anchored beside the pin; the others centre on themselves.
    const [ox, oy] = zi === 0 ? at(ou, ov) : z.c;
    for (let i = -Math.ceil((2 * R) / pitchU) - 1; i <= Math.ceil((2 * R) / pitchU) + 1; i++)
      for (let j = -Math.ceil((2 * R) / pitchV) - 1; j <= Math.ceil((2 * R) / pitchV) + 1; j++) {
        const x = ox + i * pitchU * c - j * pitchV * sn, y = oy + i * pitchU * sn + j * pitchV * c;
        if (zoneOf(x, y) !== zi || !whole(x, y, B.w, B.d, 14, z.a)) continue;
        // Keep a slot's whole footprint off the highways.
        if (toHighway(x, y) < Math.hypot(B.w, B.d) / 2 + cfg.highway.width / 2 + 4) continue;
        if (slots.some((q) => Math.hypot(q[0] - x, q[1] - y) < pitchV * 0.95)) continue;
        slots.push([x, y, zi === 0 && i === 0 && j === 0, z.a]);
      }
  }
  // Varied: each slot set a little off the grid and turned a few degrees, each bay its own size; the
  // home bay (Pump House Nine's) stays full size and square.
  const vary = (x: number, y: number, home: boolean, za = a): Slot => {
    if (home) return { x, y, w: B.w, d: B.d, a: za };
    const k = between(r, 0.72, 1);
    return { x: x + between(r, -5, 5), y: y + between(r, -4, 4), w: B.w * k, d: B.d * between(r, 0.7, 1), a: za + between(r, -0.08, 0.08) };
  };
  // Neighbourhoods ("a few residential neighborhoods to break things up"): Works people live among the
  // works. A few centres spread apart; the slots round each are housing, not bays or halls.
  const centres: P[] = [];
  for (let t = 0; t < 400 && centres.length < cfg.neighbourhoods.count; t++) {
    const c = slots[Math.floor(r() * slots.length)]!;
    if (c[2] || centres.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < cfg.neighbourhoods.apart)) continue;
    centres.push([c[0], c[1]]);
  }
  const homeSlot = (x: number, y: number) => centres.some((c) => Math.hypot(c[0] - x, c[1] - y) <= cfg.neighbourhoods.radius);
  for (const [x, y, home, za] of slots) {
    if (!home && homeSlot(x, y)) continue;
    if (!home && r() > cfg.share) continue;
    bays.push(vary(x, y, home, za));
  }
  const frameOf = (q: Slot) => ({ c: Math.cos(q.a), s: Math.sin(q.a), at: (u: number, v: number): P => [q.x + u * Math.cos(q.a) - v * Math.sin(q.a), q.y + u * Math.sin(q.a) + v * Math.cos(q.a)] });

  // The other slots: filtration halls, clarifier pairs, tank farms, sludge drying beds.
  for (const [x, y, , za] of slots) {
    if (bays.some((b) => Math.hypot(b.x - x, b.y - y) < 12)) continue;
    if (homeSlot(x, y)) {
      // Terraces: rows of brick row houses along the slot, a lane between each pair of rows, lamps down it, washing
      // strung across, a tree or two, a corner shop or bar with its sign.
      const q: Slot = { x, y, w: B.w, d: B.d, a: za };
      const { at: qa } = frameOf(q);
      halls.push(q);
      const rows = 4, rowD = q.d / rows;
      for (let k = 0; k < rows; k++) {
        const v = -q.d / 2 + (k + 0.5) * rowD + (k % 2 ? -1.6 : 1.6);
        let u = -q.w / 2 + 1;
        while (u < q.w / 2 - 4) {
          const w = between(r, 5, 8), h = between(r, 6, 11.5), [hx, hy] = qa(u + w / 2, v);
          out.buildings.push({ x: hx, y: hy, w: w - 0.3, d: rowD - 4, h, z0: 0, a: q.a, tint: pick(r, ['#ffc27a', '#ffb060', '#ffd9a0']), lit: 0.85, brick: r() < 0.75 ? 1 : 0, seed: r(), district, kind: 'stack' });
          if (r() < 0.25) out.props.push({ kind: 'ac', x: hx, y: hy, z0: h, w: 1.2, d: 0.9, h: 0.7, a: q.a });
          // A lit door or front window on most.
          // (Its own stream, so the rest of the Works keeps its layout.)
          if (hr() < 0.7) {
            const face = (k % 2 ? 1 : -1) * ((rowD - 4) / 2 + 0.15);
            const [dx2, dy2] = qa(u + w / 2, v + face);
            out.props.push({ kind: 'shopfront', x: dx2, y: dy2, z0: 0.4, w: w * 0.4, d: 0.2, h: 1.6, a: q.a, color: pick(hr, ['#ffc27a', '#ffd9a0', '#ffb060']) });
          }
          u += w;
        }
        if (k % 2 === 1) {
          // The lane between this row and the last.
          const lv = -q.d / 2 + k * rowD, [lx, ly] = qa(0, lv);
          out.strips.push({ x: lx, y: ly, w: q.w, d: 3, h: 0.2, z0: 0.06, a: q.a, material: 'street' });
          for (let t = -q.w / 2 + 6; t < q.w / 2; t += 14) {
            const [px2, py2] = qa(t, lv);
            out.props.push({ kind: 'lamp', x: px2, y: py2, z0: 3.4, w: 1.1, d: 1.1, h: 0.6, a: 0, color: '#ffc27a' });
            if (r() < 0.4)
              for (let j = 0; j < 3; j++) {
                const [wx, wy] = qa(t + 4, lv - 1.5 + j * 1.5);
                out.props.push({ kind: 'laundry', x: wx, y: wy, z0: 3.2, w: 0.7, d: 0.08, h: 0.7, a: q.a + Math.PI / 2, color: pick(r, ['#8a6a6a', '#6a7a8a', '#a08a6a', '#c0b0a0']) });
              }
          }
          if (r() < 0.5) {
            const [tx, ty] = qa(between(r, -q.w / 3, q.w / 3), lv);
            out.props.push({ kind: 'pine', x: tx, y: ty, z0: 0.2, w: 2.4, d: 2.4, h: 4, a: 0 });
          }
        }
      }
      // The corner shop or bar, its sign lit.
      const [cx2, cy2] = qa(q.w / 2 - 4, -q.d / 2 + rowD / 2);
      out.props.push({ kind: 'sign', x: cx2, y: cy2, z0: 3, w: 0.5, d: 2.4, h: 3, a: q.a + Math.PI / 2, color: pick(r, ['#2ad6c8', '#ff9a4a', '#ff4f6a']) });
      out.props.push({ kind: 'shopfront', x: cx2, y: cy2 - Math.cos(q.a) * (rowD / 2 - 1.8), z0: 0.4, w: 5, d: 0.3, h: 2, a: q.a, color: '#ffc27a' });
      // Its warm wash: lamplight and windows, the homeliest light in the Works.
      out.lights.push({ x: q.x, y: q.y, z: 12, color: '#ffc27a', power: 42000, radius: 4, reach: 80 });
      continue;
    }
    if (r() > cfg.halls) continue;
    const q = vary(x, y, false, za);
    const { at: qa } = frameOf(q);
    halls.push(q);
    const kind = r();
    if (kind < cfg.clarifiers) {
      for (const sgn of [-1, 1]) {
        const rad = Math.min(q.d / 2 - 2, q.w / 4 - 3), [tx, ty] = qa(sgn * (q.w / 4), 0);
        out.props.push({ kind: 'tank', x: tx, y: ty, z0: 0, w: rad * 2 + 2, d: rad * 2 + 2, h: 1.4, a: 0 });
        out.props.push({ kind: 'clarifier-edge', x: tx, y: ty, z0: 1.3, w: rad * 2, d: rad * 2, h: 0.3, a: 0 });
        out.props.push({ kind: 'clarifier-mid', x: tx, y: ty, z0: 1.34, w: rad * 1.6, d: rad * 1.6, h: 0.3, a: 0 });
        out.props.push({ kind: 'clarifier', x: tx, y: ty, z0: 1.38, w: rad, d: rad, h: 0.3, a: 0 });
        out.strips.push({ x: tx, y: ty, w: rad * 2, d: 1.1, h: 0.4, z0: 2.2, a: between(r, 0, Math.PI), material: 'walkway' });
        out.props.push({ kind: 'lamp', x: tx, y: ty, z0: 2.7, w: 0.8, d: 0.8, h: 0.6, a: 0, color: pick(r, SODIUM) });
      }
      out.lights.push({ x: q.x, y: q.y, z: 9, color: cfg.bayColor, power: 16000, radius: 5, reach: q.w * 0.6 });
    } else if (kind < cfg.clarifiers + 0.12) {
      // Infrastructure yard: a water tower or two on lattice legs, a substation (transformers behind a fence, a lit gantry),
      // a vent stack.
      const towers = 1 + Math.floor(r() * 2);
      for (let t = 0; t < towers; t++) waterTower(...qa((t - (towers - 1) / 2) * q.w * 0.35, -q.d * 0.15));
      for (let u = -q.w * 0.3; u <= q.w * 0.3; u += 7) {
        const [tx, ty] = qa(u, q.d * 0.25);
        out.props.push({ kind: 'ac', x: tx, y: ty, z0: 0, w: 3, d: 2.2, h: 2.6, a: q.a });
      }
      for (const sgn of [-1, 1]) {
        const [gx, gy] = qa(sgn * q.w * 0.36, q.d * 0.25);
        out.props.push({ kind: 'lattice', x: gx, y: gy, z0: 0, w: 0.6, d: 0.6, h: 9, a: q.a });
      }
      const [bx, by] = qa(0, q.d * 0.25);
      out.strips.push({ x: bx, y: by, w: q.w * 0.75, d: 0.6, h: 0.6, z0: 9, a: q.a, material: 'girder' });
      out.props.push({ kind: 'lamp', x: bx, y: by, z0: 8.4, w: 1, d: 1, h: 0.6, a: 0, color: '#ffc27a' });
      const [vx, vy] = qa(q.w * 0.38, -q.d * 0.3);
      out.strips.push({ x: vx, y: vy, w: 2.4, d: 2.4, h: between(r, 18, 26), z0: 0, a: q.a, material: 'pipe' });
    } else if (kind < cfg.clarifiers + 0.32) {
      // A tank farm: tall tanks in rows, a lamp on each, a pipe bridge over them.
      const rad = between(r, 4.5, 6.5);
      for (let u = -q.w / 2 + rad + 2; u < q.w / 2 - rad; u += rad * 2 + 3)
        for (let v = -q.d / 2 + rad + 2; v < q.d / 2 - rad; v += rad * 2 + 3) {
          if (r() < 0.12) continue;
          const [tx, ty] = qa(u, v), h = between(r, 9, 16);
          out.props.push({ kind: 'tank', x: tx, y: ty, z0: 0, w: rad * 2, d: rad * 2, h, a: 0 });
          // A lamp on each tank's crown, and a lit ladder cage up the side of some.
          out.props.push({ kind: 'lamp', x: tx, y: ty, z0: h, w: 1.3, d: 1.3, h: 0.7, a: 0, color: '#ffb060' });
          if (r() < 0.4) out.props.push({ kind: 'shopfront', x: tx, y: ty + rad + 0.1, z0: 1, w: 0.8, d: 0.2, h: h - 2, a: 0, color: '#ffc27a' });
        }
      out.strips.push({ x: q.x, y: q.y, w: q.w, d: 1.2, h: 1.2, z0: 17, a: q.a, material: 'pipe' });
      out.lights.push({ x: q.x, y: q.y, z: 20, color: '#ffb060', power: 26000, radius: 3, reach: 55 });
    } else if (kind < cfg.clarifiers + 0.4) {
      // Sludge drying beds: dark wet strips in rows, low walls between, a lamp at the end of each row.
      const rows = Math.max(3, Math.floor(q.d / 7));
      for (let k = 0; k < rows; k++) {
        const v = -q.d / 2 + (k + 0.5) * (q.d / rows);
        const [bx, by] = qa(0, v);
        out.strips.push({ x: bx, y: by, w: q.w - 2, d: q.d / rows - 1.4, h: 0.25, z0: 0.15, a: q.a, material: 'sludge' });
        const [lx, ly] = qa(-q.w / 2 + 1, v);
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: 3, w: 0.8, d: 0.8, h: 0.6, a: 0, color: '#ff9a4a' });
      }
    } else {
      const hw = q.w * 0.9, hd = q.d * between(r, 0.35, 0.55), hh = between(r, 7, 13);
      out.buildings.push({ x: q.x, y: q.y, w: hw, d: hd, h: hh, z0: 0, a: q.a, tint: pick(r, SODIUM), lit: 0.6, brick: r() < 0.4 ? 1 : 0, seed: r(), district, kind: 'building' });
      for (let u = -hw / 2 + 4; u < hw / 2 - 2; u += 6) {
        const [sx, sy] = qa(u, 0);
        out.props.push({ kind: 'shopfront', x: sx, y: sy, z0: hh + 0.05, w: 3.4, d: 1.4, h: 0.2, a: q.a, color: '#ff9a4a' });
      }
      // A stack or two, and a loading yard with trucks along its front.
      if (r() < 0.5) {
        const [sx, sy] = qa(hw / 2 - 3, 0);
        out.strips.push({ x: sx, y: sy, w: 2, d: 2, h: hh + between(r, 10, 18), z0: 0, a: q.a, material: 'pipe' });
      }
      out.lights.push({ x: q.x, y: q.y, z: hh + 6, color: '#ffb060', power: 14000, radius: 3, reach: 45 });
    }
  }

  // A water tower: four lattice legs, braced, the tank up top, a steady warm lamp on its crown.
  function waterTower(x: number, y: number) {
    const h = between(r, 16, 22), rad = between(r, 3.2, 4.4);
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) out.props.push({ kind: 'lattice', x: x + dx * rad * 0.7, y: y + dy * rad * 0.7, z0: 0, w: 0.5, d: 0.5, h, a: 0 });
    for (let z = 4; z < h; z += 5) out.props.push({ kind: 'lattice', x, y, z0: z, w: rad * 1.5, d: rad * 1.5, h: 0.25, a: 0 });
    out.props.push({ kind: 'tank', x, y, z0: h, w: rad * 2, d: rad * 2, h: rad * 1.4, a: 0 });
    out.props.push({ kind: 'lamp', x, y, z0: h + rad * 1.4, w: 0.9, d: 0.9, h: 0.6, a: 0, color: '#ffb060' });
    out.lights.push({ x, y: y + 4, z: h + 2, color: '#ffb060', power: 9000, radius: 2, reach: 35 });
  }
  // A few water towers stand on their own by the service roads.
  for (let t = 0; t < cfg.towers; t++) {
    const s0 = slots[Math.floor(r() * slots.length)];
    if (!s0) break;
    const c = Math.cos(s0[3]), sn = Math.sin(s0[3]), u = B.w / 2 + cfg.gap / 2, v = -B.d / 2 - 6;
    const [x, y] = [s0[0] + u * c - v * sn, s0[1] + u * sn + v * c];
    if (inside(x, y)) waterTower(x, y);
  }

  const homeBay = bays.reduce((m, q2) => (Math.hypot(q2.x - px, q2.y - py) < Math.hypot(m.x - px, m.y - py) ? q2 : m), bays[0]!);
  for (const [k, b] of bays.entries()) {
    const { x, y, w: bw, d: bd, a: ba } = b;
    const { c: bc, s: bs, at: ba2 } = frameOf(b);
    // The water shaded rim to core: a dark band round the edge, a dim middle, the lit centre (a settling-dark bay stays dim).
    const settling = b !== homeBay && r() < 0.3;
    // Five bands, each a little inside the last and a little brighter: a slight gradient from rim to core.
    const bands: Strip['material'][] = settling ? ['bay-edge', 'bay-out', 'bay-dim'] : ['bay-edge', 'bay-out', 'bay-mid', 'bay-in', 'bay'];
    for (const [n, m] of bands.entries()) {
      const k = 1 - (n / 4) * 0.45;
      out.strips.push({ x, y, w: bw * k, d: bd * (1 - (n / 4) * 0.5), h: 0.3, z0: 0.3 + n * 0.03, a: ba, material: m });
    }
    for (const [w, d, u, v] of [[bw + 2, 1.4, 0, -bd / 2 - 0.7], [bw + 2, 1.4, 0, bd / 2 + 0.7], [1.4, bd, -bw / 2 - 0.7, 0], [1.4, bd, bw / 2 + 0.7, 0]] as const) {
      const [rx, ry] = ba2(u, v);
      out.strips.push({ x: rx, y: ry, w, d, h: 1.6, z0: 0, a: ba, material: 'concrete' });
    }
    const cw = 2 + Math.floor(r() * 3);
    for (let n = 1; n <= cw; n++) {
      const u = -bw / 2 + (n * bw) / (cw + 1);
      const [qx, qy] = ba2(u, 0);
      out.strips.push({ x: qx, y: qy, w: 1.6, d: bd + 3, h: 0.3, z0: 2.4, a: ba, material: 'walkway' });
      out.strips.push({ x: qx + 0.8 * bc, y: qy + 0.8 * bs, w: 0.15, d: bd + 3, h: 1, z0: 2.7, a: ba, material: 'rail' });
      if (r() < 0.5) out.props.push({ kind: 'lamp', x: qx, y: qy, z0: 5.2, w: 0.7, d: 0.7, h: 0.6, a: 0, color: pick(r, SODIUM) });
    }
    // A gantry crane over some bays: two legs on the rims, a beam across at height, its trolley lamp.
    if (b !== homeBay && r() < 0.35) {
      const u = between(r, -bw / 3, bw / 3), z = between(r, 10, 14);
      for (const sgn of [-1, 1]) {
        const [lx, ly] = ba2(u, sgn * (bd / 2 + 1));
        out.strips.push({ x: lx, y: ly, w: 1, d: 1, h: z, z0: 0, a: ba, material: 'girder' });
      }
      const [gx, gy] = ba2(u, 0);
      out.strips.push({ x: gx, y: gy, w: bd + 4, d: 1.4, h: 1.4, z0: z, a: ba + Math.PI / 2, material: 'girder' });
      out.props.push({ kind: 'lamp', x: gx, y: gy, z0: z - 0.8, w: 1.2, d: 1.2, h: 0.8, a: 0, color: '#ffc27a' });
    }
    const home = b === homeBay;
    const hw = home ? 16 : between(r, 9, 13), hd = home ? 20 : between(r, 11, 16), hh = home ? 16 : between(r, 9, 14);
    const [hx, hy] = ba2(-bw / 2 - 2.5 - hw / 2, 0);
    // Pump houses keep running when the grid goes (blackouts phase 2).
    out.buildings.push({ x: hx, y: hy, w: hw, d: hd, h: hh, z0: 0, a: ba, tint: pick(r, SODIUM), lit: 0.75, brick: 1, seed: r(), district, kind: 'building', backup: LANDMARK_BACKUP });
    out.lights.push({ ...EMERGENCY_LIGHT, x: hx, y: hy, z: hh + 4 });
    out.strips.push({ x: hx - (hw / 3) * bc, y: hy - (hw / 3) * bs, w: 1.6, d: 1.6, h: hh + 9, z0: 0, a: ba, material: 'pipe' });
    out.props.push({ kind: 'shopfront', x: hx + (hw / 2 + 0.2) * bc, y: hy + (hw / 2 + 0.2) * bs, z0: 2, w: hd * 0.8, d: 0.3, h: hh * 0.6, a: ba + Math.PI / 2, color: '#ffc27a' });
    if (home) out.props.push({ kind: 'lamp', x: hx, y: hy, z0: hh, w: 1.2, d: 1.2, h: 1, a: 0, color: '#ffb030' });
    out.lights.push({ x, y, z: 10, color: cfg.bayColor, power: 12000, radius: 6, reach: Math.max(bw, bd) * 0.7 });
    if (k % 2 === 0) out.lights.push({ x: hx, y: hy, z: hh + 4, color: '#ffb060', power: 16000, radius: 2, reach: 40 });
    for (const side of [-1, 1]) {
      if (r() < 0.3) continue;
      const v = side * (bd / 2 + cfg.gap / 2);
      const [rx, ry] = ba2(0, v);
      const n = 2 + Math.floor(r() * 2);
      for (let q = 0; q < n; q++) {
        const off = (q - (n - 1) / 2) * 1.6;
        out.strips.push({ x: rx - off * bs, y: ry + off * bc, w: bw + cfg.gap, d: 1.2, h: 1.2, z0: 3.2 + (q % 2) * 1.4, a: ba, material: 'pipe' });
      }
      for (let u = -bw / 2; u <= bw / 2; u += 12) {
        const [gx, gy] = ba2(u, v);
        out.strips.push({ x: gx, y: gy, w: 0.4, d: n * 1.6 + 0.6, h: 3.2, z0: 0, a: ba, material: 'girder' });
      }
    }
  }

  // Service roads round every bay, hall and tank pair: the Works' ordered grid at night, sodium lamps on posts along them.
  let lampN = 0;
  for (const s of [...bays, ...halls]) {
    for (const [len, w, u, v] of [[B.w + cfg.gap, 7, 0, -(B.d / 2 + cfg.gap / 2)], [B.d + cfg.gap, 7, -(B.w / 2 + cfg.gap / 2), 0]] as const) {
      const along = u === 0 ? s.a : s.a + Math.PI / 2;
      const sc = Math.cos(s.a), ss = Math.sin(s.a);
      const [rx, ry] = [s.x + u * sc - v * ss, s.y + u * ss + v * sc];
      if (!inside(rx, ry)) continue;
      out.strips.push({ x: rx, y: ry, w: len, d: w, h: 0.2, z0: 0.06, a: along, material: 'street' });
      // Now and then a tanker truck parked on it, its cab lit.
      if (r() < 0.35) {
        const t = between(r, -len / 3, len / 3), tx = rx + Math.cos(along) * t + Math.sin(along) * 2, ty = ry + Math.sin(along) * t - Math.cos(along) * 2;
        out.buildings.push({ x: tx, y: ty, w: 7, d: 2.4, h: 2.6, z0: 0.2, a: along, tint: '#ffc27a', lit: 0.3, brick: 0, seed: r(), district, kind: 'car' });
        out.props.push({ kind: 'tank', x: tx - Math.cos(along) * 1, y: ty - Math.sin(along) * 1, z0: 1.2, w: 2.2, d: 2.2, h: 1.8, a: 0 });
      }
      for (let t = -len / 2 + 6; t < len / 2; t += 20) {
        const side = lampN++ % 2 ? 1 : -1;
        const lx = rx + Math.cos(along) * t - Math.sin(along) * side * 4.2, ly = ry + Math.sin(along) * t + Math.cos(along) * side * 4.2;
        out.strips.push({ x: lx, y: ly, w: 0.3, d: 0.3, h: 5, z0: 0, a: along, material: 'girder' });
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: 5, w: 1.2, d: 1.2, h: 0.6, a: 0, color: '#ffb060' });
        if (lampN % 4 === 0) out.lights.push({ x: lx, y: ly, z: 6, color: '#ffb060', power: 11000, radius: 1, reach: 30 });
      }
    }
  }

  // The floodwall: unbroken along every stretch of coast, lamps along its top.
  let n = 0;
  for (const [p0, p1] of coast) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    for (let t = 0; t < len; t += 12) {
      const w = Math.min(12, len - t), mx = p0[0] + (dx / len) * (t + w / 2), my = p0[1] + (dy / len) * (t + w / 2);
      out.strips.push({ x: mx, y: my, w: w + 0.2, d: 2.6, h: 5.4, z0: -0.6, a: ang, material: 'concrete' });
      if (n++ % 3 === 0) out.props.push({ kind: 'lamp', x: mx, y: my, z0: 5.2, w: 0.7, d: 0.7, h: 0.6, a: 0, color: '#ffc27a' });
    }
  }

  // The highways themselves: wide paving, a concrete median, sodium lamps on tall posts down both sides.
  let hn = 0;
  for (const h of highways)
    for (let k = 0; k < h.length - 1; k++) {
      const [p0, p1] = [h[k]!, h[k + 1]!], ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, nx = -Math.sin(ang), ny = Math.cos(ang);
      out.strips.push({ x: mx, y: my, w: 8.6, d: cfg.highway.width, h: 0.22, z0: 0.07, a: ang, material: 'street' });
      out.strips.push({ x: mx, y: my, w: 8.6, d: 1, h: 0.6, z0: 0.1, a: ang, material: 'concrete' });
      if (k % 3 === 0)
        for (const s2 of [-1, 1]) {
          const lx = mx + nx * s2 * (cfg.highway.width / 2 + 0.8), ly = my + ny * s2 * (cfg.highway.width / 2 + 0.8);
          out.strips.push({ x: lx, y: ly, w: 0.35, d: 0.35, h: 8, z0: 0, a: ang, material: 'girder' });
          out.props.push({ kind: 'lamp', x: lx - nx * s2 * 1.2, y: ly - ny * s2 * 1.2, z0: 8, w: 1.4, d: 0.8, h: 0.5, a: ang, color: '#ffb060' });
          if (hn++ % 4 === 0) out.lights.push({ x: mx, y: my, z: 9, color: '#ffb060', power: 14000, radius: 1, reach: 34 });
        }
    }

  const toBorder = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a0 = pts[i]!, a1 = pts[(i + 1) % pts.length]!, dx = a1[0] - a0[0], dy = a1[1] - a0[1];
      const u = Math.max(0, Math.min(1, ((x - a0[0]) * dx + (y - a0[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - a0[0] - u * dx, y - a0[1] - u * dy));
    }
    return best;
  };
  const laid: [P, P][] = [];
  const segGap = (a0: P, a1: P, b0: P, b1: P) => {
    const d = (p: P, q0: P, q1: P) => {
      const dx = q1[0] - q0[0], dy = q1[1] - q0[1], u = Math.max(0, Math.min(1, ((p[0] - q0[0]) * dx + (p[1] - q0[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - q0[0] - u * dx, p[1] - q0[1] - u * dy);
    };
    const cross = (p: P, q: P, r2: P) => (q[0] - p[0]) * (r2[1] - p[1]) - (q[1] - p[1]) * (r2[0] - p[0]);
    if (Math.sign(cross(a0, a1, b0)) !== Math.sign(cross(a0, a1, b1)) && Math.sign(cross(b0, b1, a0)) !== Math.sign(cross(b0, b1, a1))) return 0;
    return Math.min(d(a0, b0, b1), d(a1, b0, b1), d(b0, a0, a1), d(b1, a0, a1));
  };
  // The harbour: piers out from the floodwall into the bay every so often, barges moored alongside, a
  // dock crane on some, and tall floodlight masts lighting the quays (steady, no blinking).
  const H = cfg.harbour;
  for (const [p0, p1] of coast) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy);
    if (len < H.every) continue;
    const tx = dx / len, ty = dy / len;
    let nx = -ty, ny = tx;
    const mx0 = (p0[0] + p1[0]) / 2, my0 = (p0[1] + p1[1]) / 2;
    if (inside(mx0 + nx * 10, my0 + ny * 10)) [nx, ny] = [-nx, -ny];
    // Facing the Marsh (the painting has no harbour there): a few small landing stages, a lamp on each.
    if (drowned(mx0 + nx * 20, my0 + ny * 20)) {
      for (let t = H.every * 1.5; t < len - 10; t += H.every * 4 * between(r, 0.8, 1.3)) {
        const bx = p0[0] + tx * t, by = p0[1] + ty * t, L = between(r, 10, 16);
        out.strips.push({ x: bx + nx * (L / 2 + 1), y: by + ny * (L / 2 + 1), w: L, d: 4, h: 1.2, z0: -0.6, a: Math.atan2(ny, nx), material: 'concrete' });
        out.props.push({ kind: 'lamp', x: bx + nx * L, y: by + ny * L, z0: 1.4, w: 0.7, d: 0.7, h: 0.6, a: 0, color: '#ffc27a' });
        if (r() < 0.5) out.strips.push({ x: bx + nx * (L / 2 + 1) + tx * 3.6, y: by + ny * (L / 2 + 1) + ty * 3.6, w: between(r, 3.5, 5), d: 1.5, h: 0.7, z0: -0.5, a: Math.atan2(ny, nx), material: 'concrete' });
      }
      continue;
    }
    for (let t = H.every / 2; t < len - 10; t += H.every * between(r, 0.8, 1.2)) {
      const bx = p0[0] + tx * t, by = p0[1] + ty * t, L = between(r, H.length[0], H.length[1]), ang = Math.atan2(ny, nx);
      // A pier whose own run reaches the Marsh is left off, even on an edge that mostly faces the bay.
      const nearDrowned = [0.25, 0.5, 0.75, 1, 1.3].some((u) => [-20, 0, 20].some((o) => drowned(bx + nx * L * u + tx * o, by + ny * L * u + ty * o)));
      if (nearDrowned) continue;
      // Open water all along it and beyond (no ground within 30 px of its run), and well clear of every pier already
      // laid (no crossing at the coast's corners).
      const run: P[] = [0.3, 0.6, 1, 1.4].map((u) => [bx + nx * (L * u + 4), by + ny * (L * u + 4)]);
      const foreign = (x: number, y: number) => solid(x, y) && !inside(x, y) && toBorder(x, y) > 12;
      if (run.some(([x, y]) => [0, 1, 2, 3, 4, 5, 6, 7].some((k) => foreign(x + Math.cos(k * 0.785) * 30, y + Math.sin(k * 0.785) * 30)))) continue;
      const e0: P = [bx, by], e1: P = [bx + nx * (L + 4), by + ny * (L + 4)];
      if (laid.some(([a0, a1]) => segGap(e0, e1, a0, a1) < 16)) continue;
      laid.push([e0, e1]);
      out.strips.push({ x: bx + nx * (L / 2 + 1), y: by + ny * (L / 2 + 1), w: L, d: 10, h: 1.4, z0: -0.6, a: ang, material: 'concrete' });
      // A faint lit kerb down each edge, so the pier reads against the black water.
      for (const s2 of [-1, 1]) out.strips.push({ x: bx + nx * (L / 2 + 1) + tx * s2 * 4.8, y: by + ny * (L / 2 + 1) + ty * s2 * 4.8, w: L - 1, d: 0.3, h: 0.12, z0: 0.8, a: ang, material: 'street-light', color: '#ffb060' });
      // Bollard lamps down its edge.
      for (let k = 6; k < L; k += 10) out.props.push({ kind: 'lamp', x: bx + nx * k + tx * 4.4, y: by + ny * k + ty * 4.4, z0: 0.9, w: 0.7, d: 0.7, h: 0.6, a: 0, color: '#ffc27a' });
      // A barge moored alongside.
      if (r() < 0.8) {
        const side = r() < 0.5 ? 1 : -1, bl = Math.min(L - 4, between(r, 16, 28)), big = r() < 0.25;
        const mx = bx + nx * (L / 2 + 1) + tx * side * (big ? 10.5 : 8.5), my = by + ny * (L / 2 + 1) + ty * side * (big ? 10.5 : 8.5);
        out.buildings.push({ x: mx, y: my, w: big ? bl + 10 : bl, d: big ? 9 : 6, h: big ? 3.2 : 1.8, z0: -0.6, a: ang, tint: '#ffb060', lit: 0.2, brick: 0, seed: r(), district, kind: 'car' });
        // Its cabin at the stern, lit.
        const sx = mx - nx * (bl / 2 - 2), sy = my - ny * (bl / 2 - 2);
        out.buildings.push({ x: sx, y: sy, w: 3.5, d: big ? 6 : 4, h: 2.6, z0: big ? 2.6 : 1.2, a: ang, tint: '#ffc27a', lit: 0.9, brick: 0, seed: r(), district, kind: 'shack' });
        out.props.push({ kind: 'lamp', x: sx, y: sy, z0: big ? 5.4 : 4, w: 0.6, d: 0.6, h: 0.5, a: 0, color: '#ffc27a' });
      }
      // A dock crane on some: legs either side of the pier, a boom out over the water.
      if (r() < 0.35) {
        const k = L * 0.6;
        for (const s2 of [-1, 1]) out.props.push({ kind: 'lattice', x: bx + nx * k + tx * s2 * 3, y: by + ny * k + ty * s2 * 3, z0: 0, w: 0.7, d: 0.7, h: 14, a: ang });
        out.strips.push({ x: bx + nx * (k + 6), y: by + ny * (k + 6), w: 22, d: 1.2, h: 1.2, z0: 14, a: ang, material: 'girder' });
        out.props.push({ kind: 'lamp', x: bx + nx * (k + 15), y: by + ny * (k + 15), z0: 13, w: 0.9, d: 0.9, h: 0.6, a: 0, color: '#ffc27a' });
      }
      // A floodlight mast at its root on most.
      if (r() < 0.7) {
        const fx = bx - nx * 4 + tx * 5, fy = by - ny * 4 + ty * 5, fh = between(r, 20, 26);
        out.props.push({ kind: 'lattice', x: fx, y: fy, z0: 0, w: 0.9, d: 0.9, h: fh, a: 0 });
        out.props.push({ kind: 'lamp', x: fx + nx * 0.8, y: fy + ny * 0.8, z0: fh, w: 2.4, d: 1, h: 1, a: ang + Math.PI / 2, color: '#fff1d6' });
        out.lights.push({ x: fx + nx * 14, y: fy + ny * 14, z: fh, color: '#fff1d6', power: 30000, radius: 2, reach: 60 });
      }
    }
  }

  out.distance = (x, y) => {
    // Blocks keep off the highways too.
    let best = toHighway(x, y) - cfg.highway.width / 2 - 20;
    for (const b of [...bays, ...halls]) {
      const c = Math.cos(b.a), sn = Math.sin(b.a), dx = x - b.x, dy = y - b.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      best = Math.min(best, Math.max(Math.abs(u) - b.w / 2 - 20, Math.abs(v) - b.d / 2 - 2));
    }
    return best;
  };
  return out;
}
