// Joins (2026-11-16): what stands between the districts. Each district's generator stops at its own border, so lit from
// above the city showed black bands between districts and streets that stopped dead at a line. This pass runs after every
// district is built and only adds: a street along the borders, the districts' own streets carried on to meet it, and low
// blocks on the empty ground between, in the nearest district's style. It reads the finished geometry (what is taken) and
// draws from its own streams, so nothing a district built moves.
import type { DistrictStyle } from '../../shared/city-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Geometry, Light, Prop, Strip, TerrainGrid } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];

export interface JoinDistrict {
  id: string;
  /** Map px. */
  border: P[];
  style?: DistrictStyle;
}
export interface JoinInput {
  districts: JoinDistrict[];
  isLand: (x: number, y: number) => boolean;
  /** From a point to the nearest structure, raised road's pylon, seafront, quarter street, bank, works or port (map px). */
  blocked: (x: number, y: number) => number;
  /** Raised highways, as their structure files have them: a deck that ends inside the map runs on off its edge. */
  spines?: { deckHeight: number; deckWidth: number; pylonEvery: number; pylon: { w: number; d: number }; lampEvery: number; ringHeight: number }[];
}
export interface JoinGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  lights: Light[];
}

/** The joins' street: its width, how far a district's street reaches for it, and how far from a border blocks fill in. */
const STREET_W = 5;
const STUB_REACH = 120;
const FILL_REACH = 140;
/** Inside a district, the strip along its border its own lots leave empty (a lot straddling the line isn't built). */
const MARGIN = 30;
const CELL = 4;
/** The pylons' hab rings (spine.ts's warm set). */
const RING = ['#ffb347', '#ff9a3c', '#ffcf7a', '#ff8c3a'];

/** Districts that bring their own ground or water: no join street on their line, no blocks inside them. */
const special = (s?: DistrictStyle) => !s || !!(s.flooded || s.isle || s.hill || s.enclave);
/** Districts whose insides aren't ordinary blocks (yards, works, grounds): blocks never fill in inside them. */
const ownGround = (s?: DistrictStyle) => special(s) || !!(s!.port || s!.industry || s!.arcologies || s!.works);

function inPoly(x: number, y: number, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function toPoly(x: number, y: number, poly: P[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!, b = poly[i]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return best;
}

/** A grid of marks over the map (CELL px): what is built on, and what is street. */
class Marks {
  readonly cols = Math.ceil(MAP_W / CELL);
  readonly rows = Math.ceil(MAP_H / CELL);
  readonly cells = new Uint8Array(this.cols * this.rows);
  at(x: number, y: number): boolean {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows && this.cells[cy * this.cols + cx] === 1;
  }
  /** Any mark within `r` px (a square's worth of cells). */
  near(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy += CELL) for (let dx = -r; dx <= r; dx += CELL) if (this.at(x + dx, y + dy)) return true;
    return false;
  }
  /** A rectangle w along `a`, d across it, grown by `grow`. */
  rect(x: number, y: number, w: number, d: number, a: number, grow = 0) {
    const c = Math.cos(a), s = Math.sin(a), hw = w / 2 + grow, hd = d / 2 + grow;
    const ex = Math.abs(c) * hw + Math.abs(s) * hd, ey = Math.abs(s) * hw + Math.abs(c) * hd;
    const x0 = Math.max(0, Math.floor((x - ex) / CELL)), x1 = Math.min(this.cols - 1, Math.floor((x + ex) / CELL));
    const y0 = Math.max(0, Math.floor((y - ey) / CELL)), y1 = Math.min(this.rows - 1, Math.floor((y + ey) / CELL));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const dx = (cx + 0.5) * CELL - x, dy = (cy + 0.5) * CELL - y;
        if (Math.abs(dx * c + dy * s) <= hw + CELL / 2 && Math.abs(-dx * s + dy * c) <= hd + CELL / 2) this.cells[cy * this.cols + cx] = 1;
      }
  }
}

const heightOn = (grids: TerrainGrid[]) => (x: number, y: number) => {
  let best = -1;
  for (const g of grids) {
    const i = Math.round((x - g.x0) / g.step), j = Math.round((y - g.y0) / g.step);
    if (i >= 0 && j >= 0 && i < g.cols && j < g.rows) best = Math.max(best, g.heights[j * g.cols + i]!);
  }
  return best;
};

export function joinGeometry(g: Geometry, input: JoinInput): JoinGeometry {
  const out: JoinGeometry = { buildings: [], props: [], strips: [], lights: [] };
  const { districts, isLand, blocked } = input;
  const height = heightOn([...(g.terrain ? [g.terrain] : []), ...g.islands]);
  // Flat ground at the water's level: not the bay, not a cliff, hill or isle.
  const flat = (x: number, y: number) => isLand(x, y) && height(x, y) < 0.5;
  const districtAt = (x: number, y: number) => districts.find((d) => inPoly(x, y, d.border));

  // What stands on the ground already, and where the streets are.
  const built = new Marks(), street = new Marks();
  for (const b of g.buildings) if (b.z0 < 8) built.rect(b.x, b.y, b.w, b.d, b.a, 1);
  for (const p of g.props) if (p.z0 < 8 && p.kind !== 'lamp') built.rect(p.x, p.y, p.w, p.d, p.a, 0.5);
  for (const st of g.strips) {
    if (st.z0 >= 8) continue;
    if (st.ends) {
      const [a, b] = st.ends;
      if (Math.min(a[2], b[2]) >= 8) continue;
      built.rect((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]), st.d, Math.atan2(b[1] - a[1], b[0] - a[0]), 0.5);
    } else (st.material === 'street' ? street : built).rect(st.x, st.y, st.w, st.d, st.a, st.material === 'street' ? 0 : 0.5);
  }

  const lay = (a: P, b: P, width: number) => {
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    out.strips.push({ x: mx, y: my, w: seg + 0.5, d: width, h: 0.2, z0: 0.06, a: ang, material: 'street' });
    street.rect(mx, my, seg, width, ang);
  };
  const lamp = (x: number, y: number, color: string) => out.props.push({ kind: 'lamp', x, y, z0: 3.2, w: 1.3, d: 1.3, h: 0.6, a: 0, color });

  // 0. A raised highway that ends inside the map runs on, straight, off the map's edge: the same deck, lamps and pylons.
  const sr = rng('joins:spine');
  (input.spines ?? []).forEach((cfg) => {
    const D = cfg.deckHeight, W = cfg.deckWidth;
    const decks = g.strips.filter((st) => st.material === 'road' && st.district === 'spine' && Math.abs(st.z0 - (D - 4)) < 0.01);
    if (decks.length < 2) return;
    for (const [st, sgn] of [[decks[0]!, -1], [decks.at(-1)!, 1]] as const) {
      const ux = Math.cos(st.a) * sgn, uy = Math.sin(st.a) * sgn;
      const ex = st.x + ux * (st.w / 2), ey = st.y + uy * (st.w / 2);
      // How far to the edge it heads for; one already at the edge, or heading nowhere near one, is left.
      const tx = ux > 0 ? (MAP_W - ex) / ux : ux < 0 ? -ex / ux : Infinity, ty = uy > 0 ? (MAP_H - ey) / uy : uy < 0 ? -ey / uy : Infinity;
      const reach = Math.min(tx, ty);
      if (reach < 40 || reach > 700) continue;
      const L = reach + 30, nx = -uy, ny = ux, ang = Math.atan2(uy, ux);
      // What stands up to the deck's height beside its line (a mast at the old end): the deck narrows past it on that
      // side; something in its middle, and the highway is left as it is.
      const tall = [...g.buildings, ...g.props].flatMap((o) => {
        const t = (o.x - ex) * ux + (o.y - ey) * uy, off = (o.x - ex) * nx + (o.y - ey) * ny, rad = Math.max(o.w, o.d) / 2;
        return t > -rad - 4 && t < L + rad + 4 && Math.abs(off) < W / 2 + rad + 4 && o.z0 + o.h > D - 12 ? [{ t, off, rad }] : [];
      });
      const span = (t: number): [number, number] => {
        let lo = -W / 2, hi = W / 2;
        for (const o of tall) {
          if (Math.abs(o.t - t) > o.rad + 7) continue;
          if (o.off > 0) hi = Math.min(hi, o.off - o.rad - 3);
          else lo = Math.max(lo, o.off + o.rad + 3);
        }
        return [lo, hi];
      };
      const spans: [number, number][] = [];
      for (let t = 0; t < L; t += 6) spans.push(span(t + 3));
      if (spans.some(([lo, hi]) => hi - lo < W * 0.5)) continue;
      const own = { district: 'spine' };
      let lampRun = 0;
      for (let t = 0, i = 0; t < L; t += 6, i++) {
        const [lo, hi] = spans[i]!, mid = (lo + hi) / 2, wd = hi - lo;
        const mx = ex + ux * (t + 3), my = ey + uy * (t + 3);
        const at = (o: number): P => [mx + nx * o, my + ny * o];
        const [cx0, cy0] = at(mid);
        out.strips.push({ x: cx0, y: cy0, w: 6.2, d: wd, h: 4, z0: D - 4, a: ang, material: 'road', ...own });
        out.strips.push({ x: cx0, y: cy0, w: 6.2, d: wd - 2, h: 0.6, z0: D - 5.2, a: ang, material: 'soffit', ...own });
        for (const side of [-1, 1]) {
          const edge = side < 0 ? lo : hi;
          const [bx, by] = at(edge - side * 0.5), [fx, fy] = at(edge + side * 0.4);
          out.strips.push({ x: bx, y: by, w: 6.2, d: 0.6, h: 1.4, z0: D, a: ang, material: 'rail', ...own });
          out.strips.push({ x: fx, y: fy, w: 6.2, d: 0.8, h: 7, z0: D - 7, a: ang, material: 'girder', ...own });
          for (const lane of [0.18, 0.32, 0.44]) {
            if (sr() > 0.22) continue;
            const o = side * W * lane;
            const len = between(sr, 2.5, 6);
            if (o < lo + 2 || o > hi - 2) continue;
            const [cx2, cy2] = at(o);
            // The highway's own sides: its normal is (-sin a, cos a) of its own heading, which this end runs against.
            out.strips.push({ x: cx2, y: cy2, w: len, d: 0.45, h: 0.2, z0: D + 0.1, a: ang, material: side * sgn < 0 ? 'car-red' : 'car-white', ...own });
          }
        }
        out.strips.push({ x: cx0, y: cy0, w: 6.2, d: 1.2, h: 1, z0: D, a: ang, material: 'rail', ...own });
        lampRun += 6;
        if (lampRun >= cfg.lampEvery) {
          lampRun = 0;
          const side = i % 2 === 0 ? 1 : -1;
          const [lx, ly] = at((side < 0 ? lo : hi) - side * 1.2);
          out.props.push({ kind: 'mast', x: lx, y: ly, z0: D, w: 0.3, d: 0.3, h: 6, a: 0, ...own });
          out.props.push({ kind: 'lamp', x: lx - nx * side * 1.2, y: ly - ny * side * 1.2, z0: D + 5.6, w: 0.9, d: 0.9, h: 0.5, a: 0, color: '#ffb347', ...own });
          out.lights.push({ x: lx, y: ly, z: D + 5, color: '#ffb347', power: 45000, radius: 1.2, reach: 70 });
        }
      }
      // Pylons at the highway's own spacing, stepped along where something stands in the way.
      for (let d = cfg.pylonEvery / 2; d < L; d += cfg.pylonEvery) {
        const spot = [0, 12, -12, 24, -24].map((sh): P => [ex + ux * (d + sh), ey + uy * (d + sh)]).find(([x, y]) => x > 4 && y > 4 && x < MAP_W - 4 && y < MAP_H - 4 && !built.near(x, y, 8) && !street.near(x, y, 8));
        if (!spot) continue;
        const CAP = 7;
        out.buildings.push({ x: spot[0], y: spot[1], w: cfg.pylon.w, d: cfg.pylon.d, h: D - 4 - CAP, z0: 0, a: ang, tint: '#ffb347', lit: 0, brick: 0, seed: sr(), district: 'spine', kind: 'pylon' });
        out.strips.push({ x: spot[0], y: spot[1], w: cfg.pylon.w * 0.9, d: W * 0.92, h: CAP, z0: D - 4 - CAP, a: ang, material: 'concrete', ...own });
        // Its hab rings, as the highway's other pylons have: glowing bands near the top.
        for (let ring = 0, rings = 1 + Math.floor(sr() * 3); ring < rings; ring++)
          out.props.push({ kind: 'ring', x: spot[0], y: spot[1], z0: D - 4 - CAP - 6 - ring * cfg.ringHeight, w: cfg.pylon.w + 0.6, d: cfg.pylon.d + 0.6, h: 1.4, a: ang, color: pick(sr, RING), ...own });
        built.rect(spot[0], spot[1], cfg.pylon.w, cfg.pylon.d, ang, 2);
      }
    }
  });

  // 1. A street along the borders: where a district's line runs over land (not its coast), clear of what is built. Two
  //    districts sharing a line get one street, the earlier district's.
  const laid: P[] = [];
  const HASH = 32, hash = new Map<number, P[]>();
  const key = (x: number, y: number) => Math.floor(x / HASH) * 4096 + Math.floor(y / HASH);
  const laidNear = (x: number, y: number, r: number) => {
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const q of hash.get(key(x + u * HASH, y + v * HASH)) ?? []) if (Math.hypot(q[0] - x, q[1] - y) < r) return true;
    return false;
  };
  const lampRng = rng('joins:lamps');
  for (const d of districts) {
    if (special(d.style)) continue;
    const mine: P[] = [];
    const n = d.border.length;
    // Outward is the side a step off the line that isn't in the district.
    let area = 0;
    for (let i = 0; i < n; i++) {
      const p = d.border[i]!, q = d.border[(i + 1) % n]!;
      area += p[0] * q[1] - q[0] * p[1];
    }
    const wind = area > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const p = d.border[i]!, q = d.border[(i + 1) % n]!;
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
      const nx = (dy / len) * wind, ny = (-dx / len) * wind;
      let run: P[] = [];
      const flush = () => {
        // A run under 60 px is a scrap between two buildings, not a street.
        if (run.length >= 10) {
          // Even the sideways steps out, then lay it.
          let pts = run;
          for (let pass = 0; pass < 3; pass++)
            pts = pts.map((pt, k): P => {
              const a = pts[Math.max(0, k - 1)]!, b = pts[Math.min(pts.length - 1, k + 1)]!;
              return [(a[0] + 2 * pt[0] + b[0]) / 4, (a[1] + 2 * pt[1] + b[1]) / 4];
            });
          for (let k = 0; k < pts.length - 1; k++) lay(pts[k]!, pts[k + 1]!, STREET_W);
          for (let k = 1; k < pts.length - 1; k += 3) {
            const side = lampRng() < 0.5 ? -1 : 1;
            lamp(pts[k]![0] + nx * side * (STREET_W / 2 + 0.6), pts[k]![1] + ny * side * (STREET_W / 2 + 0.6), '#ffd38a');
          }
          mine.push(...pts);
        }
        run = [];
      };
      // On the line, or a street's width or two outside it where the district's own blocks stand to the line; it keeps
      // the offset it has while that stays clear, so it runs straight.
      let last = 0;
      for (let t = 0; t < len; t += 6) {
        const bx = p[0] + (dx / len) * t, by = p[1] + (dy / len) * t;
        const clear = (o: number) => {
          const x = bx + nx * o, y = by + ny * o;
          return flat(x, y) && flat(x + nx * 14, y + ny * 14) && flat(x - nx * 14, y - ny * 14) && blocked(x, y) > 2 && !built.near(x, y, CELL) && !street.near(x, y, CELL);
        };
        // Only where something fronts it: a street past empty ground would draw the district's outline in lamps.
        const fronted = [-1, 1].some((sd) => [14, 24, 34].some((o) => built.at(bx + nx * o * sd, by + ny * o * sd) || built.at(bx + nx * o * sd + (dx / len) * 10, by + ny * o * sd + (dy / len) * 10)));
        const o = fronted ? [last, 0, 5, 10].find(clear) : undefined;
        if (o === undefined || laidNear(bx + nx * o, by + ny * o, 18)) flush();
        else {
          run.push([bx + nx * o, by + ny * o]);
          last = o;
        }
      }
      flush();
    }
    for (const pt of mine) {
      laid.push(pt);
      (hash.get(key(pt[0], pt[1])) ?? hash.set(key(pt[0], pt[1]), []).get(key(pt[0], pt[1]))!).push(pt);
    }
  }

  // 2. The districts' own streets carried on: a street piece whose end is open and near its district's line runs on
  //    until it meets another street, if one is within reach and the ground between is clear.
  // Each is laid as it is found, so of two open ends facing each other only the first reaches across.
  const carry = (sb: { a: P; b: P; w: number }) => {
    const L = Math.hypot(sb.b[0] - sb.a[0], sb.b[1] - sb.a[1]), ux = (sb.b[0] - sb.a[0]) / L, uy = (sb.b[1] - sb.a[1]) / L;
    // In short pieces: one that crosses a border goes dark half with each district.
    for (let t = 0; t < L; t += 12) lay([sb.a[0] + ux * t, sb.a[1] + uy * t], [sb.a[0] + ux * Math.min(L, t + 12), sb.a[1] + uy * Math.min(L, t + 12)], sb.w);
    for (let t = 9; t < L; t += 18) lamp(sb.a[0] + ux * t - uy * (sb.w / 2 + 0.6), sb.a[1] + uy * t + ux * (sb.w / 2 + 0.6), '#ffd38a');
  };
  for (const st of g.strips) {
    if (st.material !== 'street' || st.ends || st.z0 > 2) continue;
    const c = Math.cos(st.a), s = Math.sin(st.a);
    for (const sgn of [-1, 1]) {
      const ex = st.x + c * sgn * (st.w / 2), ey = st.y + s * sgn * (st.w / 2);
      const ux = c * sgn, uy = s * sgn;
      // Open: no street just past it.
      if (street.at(ex + ux * 5, ey + uy * 5) || street.at(ex + ux * 9, ey + uy * 9)) continue;
      const home = districtAt(ex, ey);
      if (!home || special(home.style) || toPoly(ex, ey, home.border) > 45) continue;
      for (let t = 10; t <= STUB_REACH; t += 3) {
        const x = ex + ux * t, y = ey + uy * t;
        if (!flat(x, y) || blocked(x, y) < 1 || built.at(x, y)) break;
        if (street.at(x, y)) {
          carry({ a: [ex, ey], b: [x, y], w: Math.min(st.d, 8) });
          break;
        }
      }
    }
  }

  // 3. Low blocks on the empty ground: the gaps between districts and the strip a district leaves along its own line, on
  //    each district's own grid and in its colours, lower and sparser the further from it.
  // Blocks on one district's grid can't overlap; `placed` keeps another district's blocks off them.
  const placed = new Marks();
  for (const d of districts) {
    const s = d.style;
    if (ownGround(s) || !s) continue;
    const r = rng(`joins:blocks:${d.id}`);
    const xs = d.border.map((p) => p[0]), ys = d.border.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    // The grid is turned by the district's angle: it must reach the border's corners and the fringe past them.
    const R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + FILL_REACH;
    const a = ((s.angleDeg ?? 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    // A tighter pitch than the district's own: small blocks read as the edge of town.
    const cw = Math.min(s.lot[0], 20), ch = Math.min(s.lot[1], 15);
    const others = districts.filter((o) => o !== d);
    for (let i = Math.floor(-R / cw); i <= Math.ceil(R / cw); i++)
      for (let j = Math.floor(-R / ch); j <= Math.ceil(R / ch); j++) {
        const roll = [r(), r(), r(), r(), r(), r(), r(), r(), r(), r(), r(), r()];
        const x = cx + i * cw * ca - j * ch * sa + (roll[0]! - 0.5) * 2, y = cy + i * cw * sa + j * ch * ca + (roll[1]! - 0.5) * 2;
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || !flat(x, y)) continue;
        const own = inPoly(x, y, d.border);
        const dist = toPoly(x, y, d.border);
        if (own ? dist > MARGIN : dist > FILL_REACH) continue;
        if (!own) {
          // In no district, and this one the nearest that builds blocks.
          if (others.some((o) => inPoly(x, y, o.border))) continue;
          if (others.some((o) => !ownGround(o.style) && toPoly(x, y, o.border) < dist)) continue;
        }
        const far = own ? 0 : dist / FILL_REACH;
        if (roll[2]! < 0.1 + far * 0.35) continue;
        const w = cw * between(() => roll[3]!, 0.62, 0.8), dd = ch * between(() => roll[4]!, 0.62, 0.8);
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]): P => [x + (u! * w * ca) / 2 - (v! * dd * sa) / 2, y + (u! * w * sa) / 2 + (v! * dd * ca) / 2]);
        if (!cs.every(([qx, qy]) => flat(qx, qy) && !built.near(qx, qy, CELL) && !placed.at(qx, qy) && !street.near(qx, qy, CELL) && blocked(qx, qy) > 8)) continue;
        const [lo, hi] = s.height;
        const h = (lo * 0.8 + (hi * 0.75 - lo * 0.8) * Math.pow(roll[5]!, 1.5)) * (1 - far * 0.35);
        out.buildings.push({ x, y, w, d: dd, h, z0: 0, a, tint: pick(() => roll[6]!, s.windowColors), lit: s.windowLit * (1 - far * 0.3), brick: roll[7]! < s.brick ? 1 : 0, seed: roll[11]!, district: '', kind: 'infill' });
        // A lit shopfront on the face toward the camera, a lamp at the corner: the ground between blocks is a street.
        if (roll[8]! < 0.3 && s.signColors.length) out.props.push({ kind: 'shopfront', x: x - sa * (dd / 2 + 0.6), y: y + ca * (dd / 2 + 0.6), z0: 2.6, w: w * 0.7, d: 1.2, h: 0.5, a, color: pick(() => roll[9]!, s.signColors) });
        if (roll[10]! < 0.35) lamp(cs[2]![0] + ca * 1.5, cs[2]![1] + sa * 1.5, '#ffd38a');
        placed.rect(x, y, w, dd, a, 1);
      }
  }
  return out;
}
