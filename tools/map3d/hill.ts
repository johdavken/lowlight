// Cloudridge (lore: cloudridge, the-ridge-families; the painting for reference): old money in the hills on the north
// side. The ground rises from the district's edge to ridges (a heightfield, drawn on the same mesh as the isles), roads
// follow the contours between them with switchbacks joining the levels, lit warm; mansions line the roads behind walls
// and gates, terraces and the odd lit pool looking down on the city; some of the last real trees fill everything else;
// gatehouses with cold lights where the roads come in (private security stops anyone on foot).
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Curve, Light, Prop, Strip, TerrainGrid } from './geometry';
import { between, pick, rng } from './rng';
import { noise2 } from './terrain';

type P = [number, number];
type Hill = NonNullable<DistrictStyle['hill']>;
export interface HillGeometry {
  grid: TerrainGrid & { id: string; forest?: 1 };
  heightAt: (x: number, y: number) => number;
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
  /** From a point to the nearest road or plot (map px): blocks keep off (the district has none of its own). */
  distance: (x: number, y: number) => number;
}

const LAMP = '#ffcf8a';
const CELL = 8;

export function hillGeometry(district: string, cfg: Hill, border: Anchor[], blocked: (x: number, y: number) => number = () => Infinity): HillGeometry {
  const r = rng(`hill:${district}`);
  const inside = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const pts = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);
  const toEdge = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!, dx = q[0] - p[0], dy = q[1] - p[1];
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy));
    }
    return best;
  };
  // The ground: rising from the edge over `falloff` px to the ridges, higher toward the north, ridges and valleys
  // across it from two octaves of noise.
  const n1 = noise2(`${district}:ridge`), n2 = noise2(`${district}:rough`);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const y0b = Math.min(...ys), y1b = Math.max(...ys);
  const ground = (x: number, y: number) => {
    if (!inside(x, y)) return -1;
    const e = Math.min(1, toEdge(x, y) / cfg.falloff), rise = e * e * (3 - 2 * e);
    const north = 1 - ((y - y0b) / (y1b - y0b)) * cfg.northTilt;
    const ridges = 0.7 + 0.3 * n1(x / cfg.ridgeScale, y / cfg.ridgeScale) + 0.08 * n2(x / 30, y / 30);
    return Math.max(0, cfg.peak * rise * north * ridges);
  };
  const step = 4;
  const x0 = Math.min(...xs) - step, y0 = y0b - step;
  const cols = Math.ceil((Math.max(...xs) + step - x0) / step) + 2, rows = Math.ceil((y1b + step - y0) / step) + 2;
  const hs: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) hs.push(ground(x0 + i * step, y0 + j * step));
  // A few blurs, so the slopes are smooth (the edge distance creases along the border's corners).
  for (let pass = 0; pass < 4; pass++) {
    const src = hs.slice();
    for (let j = 1; j < rows - 1; j++)
      for (let i = 1; i < cols - 1; i++) {
        const k = j * cols + i;
        if (src[k]! < 0) continue;
        let sum = 0, n = 0;
        for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) {
          const q = src[k + v * cols + u]!;
          if (q >= 0) { sum += q; n++; }
        }
        hs[k] = sum / n;
      }
  }
  const hAt = (x: number, y: number) => {
    const fi = (x - x0) / step, fj = (y - y0) / step, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return -1;
    const q = [hs[j * cols + i]!, hs[j * cols + i + 1]!, hs[(j + 1) * cols + i]!, hs[(j + 1) * cols + i + 1]!];
    if (q.some((h) => h < 0)) return Math.max(...q) < 0 ? -1 : Math.max(0, Math.min(...q.filter((h) => h >= 0)));
    const u = fi - i, v = fj - j;
    return (q[0]! * (1 - u) + q[1]! * u) * (1 - v) + (q[2]! * (1 - u) + q[3]! * u) * v;
  };
  const out: HillGeometry = { grid: { id: district, x0, y0, step, cols, rows, heights: hs, forest: 1 }, heightAt: hAt, buildings: [], props: [], strips: [], curves: [], lights: [], distance: () => Infinity };
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;

  // The top of the hill.
  const top = Math.max(...hs);

  // A road is draped on the ground.
  const drape = (a: P, b: P, w: number) => {
    const za = Math.max(0, hAt(...a)) + 0.25, zb = Math.max(0, hAt(...b)) + 0.25;
    out.strips.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w: 0, d: w, h: 0.3, z0: 0, a: 0, material: 'street', ends: [[a[0], a[1], za], [b[0], b[1], zb]] });
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= L; t += CELL / 2) taken.add(key(a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L));
  };
  // Roads that wind along the slopes: from seeds spread over the hill, walk along the contour both ways (across the
  // slope), drifting slowly up or down, until the road nears another, the edge or a structure. Where two roads at
  // different heights come near, a switchback joins them.
  const grad = (x: number, y: number): P => [(hAt(x + 6, y) - hAt(x - 6, y)) / 12, (hAt(x, y + 6) - hAt(x, y - 6)) / 12];
  const roads: P[][] = [];
  const nearRoad = (x: number, y: number, own: Set<string>) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const k = `${cx + i}:${cy + j}`;
      if (taken.has(k) && !own.has(k)) return true;
    }
    return false;
  };
  const seeds: P[] = [];
  for (let y = y0b + cfg.roadApart / 2; y < y1b; y += cfg.roadApart * 0.8)
    for (let x = Math.min(...xs) + cfg.roadApart / 2; x < Math.max(...xs); x += cfg.roadApart) {
      const sx = x + between(r, -cfg.roadApart / 3, cfg.roadApart / 3), sy = y + between(r, -cfg.roadApart / 4, cfg.roadApart / 4);
      const g = hAt(sx, sy);
      if (g > top * 0.1 && g < top * 0.95 && toEdge(sx, sy) > 30 && blocked(sx, sy) > 6) seeds.push([sx, sy]);
    }
  // Shuffled with Fisher–Yates (a sort with a random comparator depends on the engine's sort).
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [seeds[i], seeds[j]] = [seeds[j]!, seeds[i]!];
  }
  for (const sd of seeds) {
    if (taken.has(key(...sd))) continue;
    const own = new Set<string>();
    const halves: P[][] = [];
    for (const dir of [1, -1]) {
      const path: P[] = [sd];
      let [x, y] = sd, target = hAt(x, y), drift = between(r, -1, 1) * cfg.climb;
      let [hx, hy] = (() => { const [gx, gy] = grad(x, y), L = Math.hypot(gx, gy) || 1; return [(-gy / L) * dir, (gx / L) * dir]; })();
      for (let st = 0; st < cfg.roadLength / 6; st++) {
        const [gx, gy] = grad(x, y), L = Math.hypot(gx, gy) || 1;
        // Across the slope, steering back toward the target height, the heading turning only gently.
        let tx = (-gy / L) * dir, ty = (gx / L) * dir;
        if (tx * hx + ty * hy < 0) [tx, ty] = [-tx, -ty];
        const err = target - hAt(x, y);
        tx += (gx / L) * Math.max(-0.5, Math.min(0.5, err * 0.15));
        ty += (gy / L) * Math.max(-0.5, Math.min(0.5, err * 0.15));
        const tl = Math.hypot(tx, ty) || 1;
        hx = hx * 0.6 + (tx / tl) * 0.4;
        hy = hy * 0.6 + (ty / tl) * 0.4;
        const hl = Math.hypot(hx, hy) || 1;
        const nx = x + (hx / hl) * 6, ny = y + (hy / hl) * 6;
        if (!inside(nx, ny) || toEdge(nx, ny) < 14 || blocked(nx, ny) < 5 || nearRoad(nx, ny, own)) break;
        [x, y] = [nx, ny];
        target += drift * 6;
        if (st % 20 === 19) drift = between(r, -1, 1) * cfg.climb;
        path.push([x, y]);
        own.add(key(x, y));
      }
      halves.push(path);
    }
    const road = [...halves[1]!.reverse(), ...halves[0]!.slice(1)];
    if (road.length * 6 < 60) continue;
    // Thin to every other point for the drape, keeping the ends.
    const thin = road.filter((_, k) => k % 2 === 0 || k === road.length - 1);
    for (let k = 0; k < thin.length - 1; k++) drape(thin[k]!, thin[k + 1]!, cfg.road);
    roads.push(thin);
  }
  // Switchbacks: between the ends of a road and the nearest point of another, a little above or below it.
  const joined = new Set<string>();
  // Over the winding roads only (a snapshot): the switchbacks added here are not joined again.
  const winding = roads.slice();
  for (const [i, ra] of winding.entries())
    for (const end of [ra[0]!, ra[ra.length - 1]!]) {
      let best: { p: P; d: number; j: number } | null = null;
      for (const [j, rb] of winding.entries()) {
        if (j === i) continue;
        for (const p of rb) {
          const d = Math.hypot(p[0] - end[0], p[1] - end[1]);
          if (d > 20 && d < 90 && (!best || d < best.d)) best = { p, d, j };
        }
      }
      if (!best || joined.has([i, best.j].sort().join(':'))) continue;
      joined.add([i, best.j].sort().join(':'));
      const a = end, b = best.p, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const nx = -dy / L, ny = dx / L, wob = Math.min(16, L * 0.3);
      const legs: P[] = [a, [a[0] + dx / 3 + nx * wob, a[1] + dy / 3 + ny * wob], [a[0] + (2 * dx) / 3 - nx * wob, a[1] + (2 * dy) / 3 - ny * wob], b];
      if (!legs.every(([x, y]) => inside(x, y) && blocked(x, y) > 4)) continue;
      for (let q = 0; q < 3; q++) drape(legs[q]!, legs[q + 1]!, cfg.road);
      roads.push(legs);
    }
  // The ways in: from the lowest points of the roads straight downhill to the district's edge, a gatehouse at each.
  const entries: P[] = [];
  const lows = roads.flat().filter((p) => toEdge(...p) < 120).sort((p, q) => hAt(...p) - hAt(...q));
  for (const a of lows) {
    if (entries.length >= cfg.entries) break;
    if (entries.some((e) => Math.hypot(e[0] - a[0], e[1] - a[1]) < 200)) continue;
    let [x, y] = a;
    for (let st = 0; st < 80; st++) {
      const [gx, gy] = grad(x, y), L = Math.hypot(gx, gy) || 1;
      const nx = x - (gx / L) * 4, ny = y - (gy / L) * 4;
      if (!inside(nx, ny)) break;
      [x, y] = [nx, ny];
    }
    const b: P = [x, y];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 10 || blocked(...b) < 4) continue;
    drape(a, b, cfg.road);
    entries.push(b);
    const dx = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), dy = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    // The gatehouse: a booth, a barrier across, a cold light.
    const z = Math.max(0, hAt(...b));
    out.buildings.push({ x: b[0] - dy * 6, y: b[1] + dx * 6, w: 5, d: 4, h: 3.4, z0: z, a: Math.atan2(dy, dx), tint: '#d8ecff', lit: 0.9, brick: 0, seed: r(), district, kind: 'shack' });
    out.strips.push({ x: b[0], y: b[1], w: cfg.road + 2, d: 0.4, h: 0.4, z0: z + 1.2, a: Math.atan2(dy, dx) + Math.PI / 2, material: 'street-light', color: '#ff3b3b' });
    out.lights.push({ x: b[0], y: b[1], z: z + 10, color: '#d8ecff', power: 14000, radius: 0.6, reach: 40 });
    roads.push([a, b]);
  }
  // Lamps down every road, warm, a pool of light now and then.
  let n = 0;
  for (const road of roads)
    for (let k = 0; k < road.length - 1; k++) {
      const [a, b] = [road[k]!, road[k + 1]!];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < L; t += cfg.lampEvery) {
        const x = a[0] + ((b[0] - a[0]) * t) / L, y = a[1] + ((b[1] - a[1]) * t) / L, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        const side = n++ % 2 ? 1 : -1, lx = x + nx * side * (cfg.road / 2 + 0.8), ly = y + ny * side * (cfg.road / 2 + 0.8);
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: Math.max(0, hAt(lx, ly)) + 3.2, w: 0.8, d: 0.8, h: 0.5, a: 0, color: LAMP });
        if (n % 5 === 0) out.lights.push({ x: lx, y: ly, z: Math.max(0, hAt(lx, ly)) + 18, color: LAMP, power: 22000, radius: 0.6, reach: 60 });
      }
    }

  // Estates along the roads (they must read as mansions): a walled plot well back from the road, the
  // house at the back of it — a long main block of two or three floors with two wings forward in a U or one in an L,
  // ridges along the roofs, chimneys — every window warm; a lit drive from the gate posts to a paved forecourt with a
  // fountain; trees in the grounds; a terrace behind with a lit balustrade, sometimes a pool; warm light on the front.
  const estate = (x: number, y: number, a: number, W: number) => {
    const D = W * 0.85;
    const c = Math.cos(a), s2 = Math.sin(a);
    const at = (u: number, v: number): P => [x + u * c - v * s2, y + u * s2 + v * c];
    // The plot: u along the road, v back from it (the gate at v = −D/2).
    const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [0, 0]].map(([u, v]) => at(u!, v!));
    if (!corners.every(([px, py]) => inside(px, py) && blocked(px, py) > 3 && !taken.has(key(px, py)))) return false;
    for (let u = -W / 2; u <= W / 2; u += 8) for (let v = -D / 2; v <= D / 2; v += 8) if (taken.has(key(...at(u, v)))) return false;
    const hsx = corners.map(([px, py]) => hAt(px, py));
    if (Math.min(...hsx) < 0) return false;
    const zTop = Math.max(...hsx), zLow = Math.min(...hsx);
    // The plinth the house and forecourt stand on, level, down to the ground on the low side.
    const [hx, hy] = at(0, D * 0.12);
    out.buildings.push({ x: hx, y: hy, w: W * 0.86, d: D * 0.66, h: Math.max(0.8, zTop - zLow + 0.8), z0: zLow - 0.4, a, tint: LAMP, lit: 0, brick: 1, seed: r(), district, kind: 'wall' });
    const z = zTop + 0.4;
    const tint = pick(r, cfg.windows), brick = r() < 0.5 ? 1 : 0;
    const house = (u: number, v: number, w: number, d: number, h: number, ridge: boolean) => {
      const [bx, by] = at(u, v);
      out.buildings.push({ x: bx, y: by, w, d, h, z0: z, a, tint, lit: 0.8, brick, seed: r(), district, kind: 'building' });
      if (ridge) out.buildings.push({ x: bx, y: by, w: w - 1.5, d: d * 0.42, h: 2.6, z0: z + h, a, tint, lit: 0, brick, seed: r(), district, kind: 'tier' });
    };
    // The main block across the back, and its wings forward.
    const mw = W * 0.62, md = Math.max(10, D * 0.2), mh = between(r, 10, 14), mv = D * 0.3;
    house(0, mv, mw, md, mh, true);
    const wings = r() < 0.65 ? [-1, 1] : [r() < 0.5 ? -1 : 1];
    const ww = Math.max(9, mw * 0.24), wd = D * 0.34;
    for (const sd of wings) house(sd * (mw / 2 - ww / 2), mv - md / 2 - wd / 2 + 1, ww, wd, mh * 0.8, true);
    // Chimneys on the main roof.
    for (const cu of [-mw * 0.3, mw * 0.3]) {
      const [cx2, cy2] = at(cu, mv);
      out.buildings.push({ x: cx2, y: cy2, w: 1.6, d: 1.6, h: 4.5, z0: z + mh, a, tint, lit: 0, brick: 1, seed: r(), district, kind: 'stack' });
    }
    // The forecourt and its fountain, lit.
    const fv = mv - md / 2 - wd * 0.55;
    const [fx, fy] = at(0, fv);
    out.strips.push({ x: fx, y: fy, w: mw * 0.6, d: wd * 0.8, h: 0.2, z0: z, a, material: 'concrete' });
    out.curves.push({ points: Array.from({ length: 17 }, (_, q): [number, number, number] => [fx + Math.cos((q / 16) * Math.PI * 2) * 3, fy + Math.sin((q / 16) * Math.PI * 2) * 2, z + 0.6]), bevel: 0.3, material: 'neon', color: '#ffe2a0', strength: 8 });
    // The drive from the gate to the forecourt, lamps along it, trees either side.
    const [g0x, g0y] = at(0, -D / 2), [g1x, g1y] = at(0, fv - wd * 0.4);
    const dl = Math.hypot(g1x - g0x, g1y - g0y), da = Math.atan2(g1y - g0y, g1x - g0x);
    out.strips.push({ x: (g0x + g1x) / 2, y: (g0y + g1y) / 2, w: 0, d: 3, h: 0.25, z0: 0, a: 0, material: 'street', ends: [[g0x, g0y, Math.max(0, hAt(g0x, g0y)) + 0.3], [g1x, g1y, z + 0.1]] });
    for (let t = 4; t < dl - 2; t += 7)
      for (const sd of [-1, 1]) {
        const lx = g0x + Math.cos(da) * t - Math.sin(da) * sd * 3, ly = g0y + Math.sin(da) * t + Math.cos(da) * sd * 3;
        const lz = Math.max(0, hAt(g0x, g0y)) + ((z - Math.max(0, hAt(g0x, g0y))) * t) / dl;
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: lz + 1.8, w: 0.5, d: 0.5, h: 0.4, a: 0, color: LAMP });
        const tx = lx - Math.sin(da) * sd * 3, ty = ly + Math.cos(da) * sd * 3;
        out.props.push({ kind: 'pine', x: tx, y: ty, z0: Math.max(0, hAt(tx, ty)), w: 3.5, d: 3.5, h: 8, a: 0 });
      }
    // Gate posts with lamps, and the wall round the grounds.
    for (const sd of [-1, 1]) {
      const [px, py] = at(sd * 3.5, -D / 2);
      out.buildings.push({ x: px, y: py, w: 1.4, d: 1.4, h: 3, z0: Math.max(0, hAt(px, py)), a, tint: LAMP, lit: 0, brick: 1, seed: r(), district, kind: 'wall' });
      out.props.push({ kind: 'lamp', x: px, y: py, z0: Math.max(0, hAt(px, py)) + 3.2, w: 0.7, d: 0.7, h: 0.5, a: 0, color: LAMP });
    }
    for (const [u, v, w, d] of [[-W / 4 - 2.5, -D / 2, W / 2 - 5, 0.9], [W / 4 + 2.5, -D / 2, W / 2 - 5, 0.9], [0, D / 2, W, 0.9], [-W / 2, 0, 0.9, D], [W / 2, 0, 0.9, D]] as const) {
      const [qx, qy] = at(u, v);
      out.strips.push({ x: qx, y: qy, w, d, h: 1.8, z0: Math.max(0, hAt(qx, qy)) - 0.2, a, material: 'concrete' });
    }
    // The grounds' trees, outside the house and drive.
    for (let q = 0; q < 14; q++) {
      const u = between(r, -W / 2 + 3, W / 2 - 3), v = between(r, -D / 2 + 3, D / 2 - 3);
      if (Math.abs(u) < mw / 2 + 3 && v > fv - wd) continue;
      if (Math.abs(u) < 6) continue;
      const [tx, ty] = at(u, v), h = between(r, 7, 12);
      out.props.push({ kind: 'pine', x: tx, y: ty, z0: Math.max(0, hAt(tx, ty)), w: h * 0.5, d: h * 0.5, h, a: 0 });
    }
    // The terrace behind, lit, and sometimes a pool on it.
    const [bx, by] = at(0, mv + md / 2 + 3);
    out.strips.push({ x: bx, y: by, w: mw, d: 5, h: 0.3, z0: z, a, material: 'concrete' });
    const [rx, ry] = at(0, mv + md / 2 + 5.6);
    out.strips.push({ x: rx, y: ry, w: mw, d: 0.3, h: 0.3, z0: z + 0.9, a, material: 'street-light', color: LAMP });
    if (r() < cfg.pools) {
      const [px, py] = at(mw * 0.25, mv + md / 2 + 9);
      out.strips.push({ x: px, y: py, w: mw * 0.3, d: 4, h: 0.15, z0: Math.max(0, hAt(px, py)) + 0.1, a, material: 'street-light', color: '#4fd8ff' });
    }
    // Warm light on the front.
    const [lx, ly] = at(0, fv - 10);
    out.lights.push({ x: lx, y: ly, z: z + 16, color: LAMP, power: 26000, radius: 0.6, reach: 55 });
    for (let u = -W / 2; u <= W / 2; u += CELL / 2) for (let v = -D / 2; v <= D / 2; v += CELL / 2) taken.add(key(...at(u, v)));
    return true;
  };
  for (const road of roads)
    for (let k = 0; k < road.length - 1; k++) {
      const [a, b] = [road[k]!, road[k + 1]!];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 6) continue;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (let t = L / 2; t < L; t += cfg.villaEvery) {
        if (r() > cfg.villaShare) continue;
        // The biggest plot that fits, either side of the road; its gate on the road side (the plot's −v toward it).
        const first = r() < 0.5 ? 1 : -1, W0 = between(r, cfg.villa[0], cfg.villa[1]);
        let ok = false;
        for (const k of [1, 0.85, 0.72, 0.6])
          for (const side of [first, -first]) {
            if (ok) break;
            const W = W0 * k, set = cfg.road / 2 + 3 + (W * 0.85) / 2;
            const x = a[0] + ((b[0] - a[0]) * t) / L + nx * side * set, y = a[1] + ((b[1] - a[1]) * t) / L + ny * side * set;
            ok = estate(x, y, side > 0 ? ang : ang + Math.PI, W);
          }
      }
    }

  // Trees: some of the last real ones in the city, thick on every slope that holds nothing else.
  for (let t = 0, placed = 0; t < cfg.trees * 4 && placed < cfg.trees; t++) {
    const x = between(r, Math.min(...xs), Math.max(...xs)), y = between(r, y0b, y1b);
    if (!inside(x, y) || taken.has(key(x, y)) || blocked(x, y) < 3) continue;
    const g = hAt(x, y);
    if (g < 0) continue;
    const h = between(r, 7, 14);
    out.props.push({ kind: 'pine', x, y, z0: g, w: h * 0.5, d: h * 0.5, h, a: 0 });
    placed++;
  }

  out.distance = (x, y) => (inside(x, y) ? -10 : Infinity);
  return out;
}
