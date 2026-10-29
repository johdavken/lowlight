// Mirage Heights, the Shelf (lore: mirage-heights; the painting for reference): Lowlight's government on its plateau
// above Velvet — council chambers, ministries, courts and the homes of the officials who staff them, a guarded enclave
// with a view over the whole bay. A grand mall down the plateau with a reflecting pool and lamps, the domed Council
// Chamber at its head and the spire tower beside it (red lamps, as painted), ministries lining the mall behind lit
// colonnades, the courts across a square; officials' homes with gardens on quiet streets over the rest; a wooded park;
// SDG security posts round the edge. All on the plateau's top, `z` px up.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box, Curve, Light, Prop, Strip } from './geometry';
import { between, pick, rng } from './rng';

type P = [number, number];
type Enclave = NonNullable<DistrictStyle['enclave']>;
export interface EnclaveGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  curves: Curve[];
  lights: Light[];
  /** From a point to the enclave's ground (negative inside): blocks keep off (the district has none of its own). */
  distance: (x: number, y: number) => number;
}

const WARM = '#ffe2a0';
const CELL = 8;

export function enclaveGeometry(district: string, cfg: Enclave, border: Anchor[], z: number, blocked: (x: number, y: number) => number = () => Infinity): EnclaveGeometry {
  const r = rng(`enclave:${district}`);
  const out: EnclaveGeometry = { buildings: [], props: [], strips: [], curves: [], lights: [], distance: () => Infinity };
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
  // Where the enclave may build: inside, set back from the rim, clear of structures (the stair, the funicular).
  const ok = (x: number, y: number, m = 0) => inside(x, y) && toEdge(x, y) > cfg.rim + m && blocked(x, y) > 4;
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
  type F = { at: (u: number, v: number) => P; a: number };
  const frame = (c: P, a: number): F => ({ a, at: (u, v) => [c[0] + u * Math.cos(a) - v * Math.sin(a), c[1] + u * Math.sin(a) + v * Math.cos(a)] });
  const fits = (f: F, u: number, v: number, w: number, d: number) => {
    for (let du = -w / 2; du <= w / 2; du += 6) for (let dv = -d / 2; dv <= d / 2; dv += 6) {
      const [x, y] = f.at(u + du, v + dv);
      if (!ok(x, y) || taken.has(key(x, y))) return false;
    }
    return true;
  };
  const claim = (f: F, u: number, v: number, w: number, d: number) => {
    for (let du = -w / 2; du <= w / 2; du += CELL / 2) for (let dv = -d / 2; dv <= d / 2; dv += CELL / 2) taken.add(key(...f.at(u + du, v + dv)));
  };
  const box = (f: F, u: number, v: number, w: number, d: number, h: number, z0: number, o: Partial<Box> = {}) => {
    const [x, y] = f.at(u, v);
    // Every enclave block is raw concrete except the officials' homes (brick ones stay brick).
    out.buildings.push({ x, y, w, d, h, z0, a: f.a, tint: pick(r, cfg.windows), lit: 0.6, brick: 0, seed: r(), district, kind: 'building', concrete: 1, ...o });
  };

  // Brutalist massing, cyberpunk dressing ("a clash of cyberpunk style with brutalist design"): raw
  // concrete in heavy stacked slabs — a narrow plinth, a cantilevered block wider than it above, sometimes stepped back
  // again or an inverted pyramid of widening slabs — with few, narrow slot windows; then neon run along its edges and a
  // lit ad board on a blank face, in colours that clash with the concrete and each other.
  const neonC = () => pick(r, cfg.neon);
  const edge = (f: F, u: number, v: number, w: number, d: number, zz: number, color: string) => {
    for (const [du, dv, ew, ed] of [[0, -d / 2 - 0.2, w, 0.3], [0, d / 2 + 0.2, w, 0.3], [-w / 2 - 0.2, 0, 0.3, d], [w / 2 + 0.2, 0, 0.3, d]] as const) {
      const [x, y] = f.at(u + du, v + dv);
      out.strips.push({ x, y, w: ew, d: ed, h: 0.4, z0: zz, a: f.a, material: 'street-light', color });
    }
  };
  const brutal = (f: F, u: number, v: number, w: number, d: number, h: number) => {
    // Neon on some blocks only, so the concrete reads between them.
    const lit = r() < cfg.neonShare;
    const edgeIf = (f2: F, u2: number, v2: number, w2: number, d2: number, zz: number, c: string) => lit && edge(f2, u2, v2, w2, d2, zz, c);
    // Floodlit from below: a cold wash up the face toward the camera, so the mass shows.
    const [lx, ly] = f.at(u, v + d / 2 + 8);
    out.lights.push({ x: lx, y: ly, z: z + 2, color: cfg.flood, power: 30000, radius: 0.6, reach: Math.max(40, h * 1.4) });
    const form = pick(r, ['cantilever', 'ziggurat', 'inverted', 'slab'] as const);
    const slot = { lit: cfg.slots, tint: pick(r, cfg.windows), brick: 0 as const };
    const top = h;
    if (form === 'cantilever') {
      box(f, u, v, w * 0.55, d * 0.6, h * 0.45, z, slot);
      box(f, u + w * 0.08, v, w * 1.1, d * 1.05, h * 0.55, z + h * 0.45, { ...slot, kind: 'tier' });
      edgeIf(f, u + w * 0.08, v, w * 1.1, d * 1.05, z + h * 0.45, neonC());
    } else if (form === 'ziggurat') {
      let zz = z, ww = w, dd = d;
      for (let k = 0; k < 4; k++) {
        box(f, u, v, ww, dd, h / 4, zz, { ...slot, kind: k ? 'tier' : 'building' });
        zz += h / 4;
        if (k === 1) edgeIf(f, u, v, ww, dd, zz, neonC());
        ww *= 0.78;
        dd *= 0.78;
      }
    } else if (form === 'inverted') {
      let zz = z, ww = w * 0.5, dd = d * 0.55;
      for (let k = 0; k < 4; k++) {
        box(f, u, v, ww, dd, h / 4, zz, { ...slot, kind: k ? 'tier' : 'building' });
        zz += h / 4;
        ww *= 1.22;
        dd *= 1.18;
      }
      edgeIf(f, u, v, ww / 1.22, dd / 1.18, z + h, neonC());
    } else {
      box(f, u, v, w, d, h, z, slot);
      // Fins down the face: deep concrete ribs.
      for (let k = -w / 2 + 3; k <= w / 2 - 3; k += 5) box(f, u + k, v - d / 2 - 1, 1, 2, h - 2, z + 1, { ...slot, lit: 0, kind: 'wall' });
      edgeIf(f, u, v, w, d, z + h, neonC());
    }
    // A lit ad board on the blank face toward the camera, sometimes.
    if (r() < cfg.boards) {
      const [bx, by] = f.at(u, v + d / 2 + 0.6);
      const bw = Math.min(w * 0.7, 18), bh = Math.min(h * 0.35, 10);
      out.props.push({ kind: 'billboard', x: bx, y: by, z0: z + h * 0.35, w: bw, d: 0.3, h: bh, a: f.a, color: neonC() });
    }
    // A red lamp on the roof.
    const [rx, ry] = f.at(u, v);
    out.props.push({ kind: 'lamp', x: rx, y: ry, z0: z + top + 0.4, w: 0.7, d: 0.7, h: 0.5, a: 0, color: '#ff3b3b' });
  };

  // The plateau's top: its centroid and long axis (from a sample grid of the ground the enclave may use).
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const S: P[] = [];
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 10) for (let y = Math.min(...ys); y < Math.max(...ys); y += 10) if (ok(x, y, 20)) S.push([x, y]);
  const mx = S.reduce((s, p) => s + p[0], 0) / S.length, my = S.reduce((s, p) => s + p[1], 0) / S.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of S) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const M = frame([mx, my], axis);
  // How far the mall can run each way along the axis while the ground holds.
  const reach = (dir: number) => {
    let t = 0;
    while (t < 2000 && ok(...M.at(dir * (t + 8), 0), 30)) t += 8;
    return t;
  };
  const uA = -reach(-1) * 0.85, uB = reach(1) * 0.85;

  // The mall: a wide paved avenue, a reflecting pool down its middle, double rows of lamps and trees.
  const W = cfg.mall;
  const len = uB - uA, mid = (uA + uB) / 2;
  {
    const [x, y] = M.at(mid, 0);
    out.strips.push({ x, y, w: len, d: W, h: 0.2, z0: z + 0.05, a: axis, material: 'concrete' });
    out.strips.push({ x, y, w: len * 0.7, d: W * 0.28, h: 0.15, z0: z + 0.2, a: axis, material: 'bay-dim' });
    for (const s of [-1, 1]) {
      const [kx, ky] = M.at(mid, s * W * 0.15);
      out.strips.push({ x: kx, y: ky, w: len * 0.7, d: 0.3, h: 0.15, z0: z + 0.3, a: axis, material: 'street-light', color: WARM });
    }
    for (let u = uA + 6; u < uB - 4; u += 10)
      for (const s of [-1, 1]) {
        const [lx, ly] = M.at(u, s * (W / 2 - 2));
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: z + 3.6, w: 0.8, d: 0.8, h: 0.5, a: 0, color: WARM });
        const [tx, ty] = M.at(u + 5, s * (W / 2 - 5));
        out.props.push({ kind: 'pine', x: tx, y: ty, z0: z, w: 3.6, d: 3.6, h: 7, a: 0 });
      }
    for (let u = uA + 40; u < uB; u += 90) {
      const [lx, ly] = M.at(u, 0);
      out.lights.push({ x: lx, y: ly, z: z + 22, color: WARM, power: 40000, radius: 0.6, reach: 90 });
    }
    claim(M, mid, 0, len, W);
  }

  // The Council Chamber at the mall's head: a broad hall, a drum and dome lit from within, a lit portico toward the
  // mall, flags with red lamps.
  {
    const cu = uB + cfg.chamber / 2 - 6;
    const C = frame(M.at(cu, 0), axis);
    const w = cfg.chamber, d = cfg.chamber * 0.8;
    // The Chamber: an inverted pyramid of concrete slabs on a narrow plinth, its top ringed in neon, a slab of light
    // across its face (the Shelf's seal), a mast.
    {
      let zz = z, ww = w * 0.45, dd = d * 0.45;
      box(C, 0, 0, ww, dd, 8, zz, { lit: cfg.slots, brick: 0 });
      zz += 8;
      for (let k = 0; k < 4; k++) {
        ww *= 1.24;
        dd *= 1.24;
        box(C, 0, 0, ww, dd, 7, zz, { lit: cfg.slots, brick: 0, kind: 'tier' });
        zz += 7;
      }
      edge(C, 0, 0, ww, dd, zz, cfg.neon[0]!);
      edge(C, 0, 0, ww, dd, zz - 7, cfg.neon[1 % cfg.neon.length]!);
      const [fx, fy] = C.at(0, dd / 2 + 0.5);
      out.props.push({ kind: 'billboard', x: fx, y: fy, z0: zz - 18, w: ww * 0.5, d: 0.3, h: 9, a: axis, color: cfg.neon[0]! });
    }
    const [dx, dy] = C.at(0, 0);
    out.props.push({ kind: 'mast', x: dx, y: dy, z0: z + 36, w: 0.8, d: 0.8, h: 14, a: 0 });
    // The portico: columns of light across the front toward the mall.
    for (let u = -d / 2 + 4; u <= d / 2 - 4; u += 4) {
      const [px, py] = C.at(-w / 2 - 0.4, u);
      out.strips.push({ x: px, y: py, w: 0.5, d: 0.9, h: 16, z0: z + 2, a: axis, material: 'street-light', color: WARM });
    }
    for (const s of [-1, 1]) {
      const [fx, fy] = C.at(-w / 2 - 10, s * d * 0.3);
      out.props.push({ kind: 'mast', x: fx, y: fy, z0: z, w: 0.5, d: 0.5, h: 14, a: 0 });
      out.props.push({ kind: 'lamp', x: fx, y: fy, z0: z + 14, w: 0.7, d: 0.7, h: 0.5, a: 0, color: '#ff3b3b' });
    }
    const [lx, ly] = C.at(-w / 2 - 20, 0);
    out.lights.push({ x: lx, y: ly, z: z + 30, color: WARM, power: 90000, radius: 0.6, reach: 120 });
    claim(C, 0, 0, w + 24, d + 8);

    // The spire tower beside it: the tallest on the Shelf, warm windows, a needle with red lamps.
    const T = frame(C.at(cfg.chamber * 0.2, d / 2 + cfg.tower.w), axis);
    const th = cfg.tower.h;
    // A concrete shaft, a cantilevered crown block wider than it, a narrower cap; neon round the crown.
    box(T, 0, 0, cfg.tower.w * 0.7, cfg.tower.w * 0.6, th * 0.7, z, { lit: cfg.slots, brick: 0 });
    box(T, 0, 0, cfg.tower.w * 1.15, cfg.tower.w * 0.95, th * 0.18, z + th * 0.7, { kind: 'tier', lit: cfg.slots + 0.15, brick: 0 });
    edge(T, 0, 0, cfg.tower.w * 1.15, cfg.tower.w * 0.95, z + th * 0.7, cfg.neon[1 % cfg.neon.length]!);
    edge(T, 0, 0, cfg.tower.w * 1.15, cfg.tower.w * 0.95, z + th * 0.88, cfg.neon[0]!);
    box(T, 0, 0, cfg.tower.w * 0.5, cfg.tower.w * 0.42, th * 0.12, z + th * 0.88, { kind: 'tier', lit: cfg.slots, brick: 0 });
    const [vx, vy] = T.at(0, cfg.tower.w * 0.3 + 0.5);
    out.props.push({ kind: 'billboard', x: vx, y: vy, z0: z + th * 0.35, w: cfg.tower.w * 0.5, d: 0.3, h: th * 0.25, a: axis, color: cfg.neon[2 % cfg.neon.length]! });
    const [sx, sy] = T.at(0, 0);
    out.props.push({ kind: 'mast', x: sx, y: sy, z0: z + th, w: 1.2, d: 1.2, h: th * 0.18, a: 0 });
    for (const zz of [th * 0.6, th * 0.88, th * 1.18]) out.props.push({ kind: 'lamp', x: sx, y: sy, z0: z + zz, w: 0.9, d: 0.9, h: 0.6, a: 0, color: '#ff3b3b' });
    claim(T, 0, 0, cfg.tower.w + 10, cfg.tower.w + 10);
    // More towers round the Chamber, lower than the spire: the ministries that outgrew the mall.
    for (let k = 0, t2 = 0; k < cfg.towers && t2 < 60; t2++) {
      const tu = between(r, -cfg.chamber * 1.6, cfg.chamber * 0.6), tv = between(r, -cfg.chamber * 1.8, cfg.chamber * 1.8);
      const tw = between(r, 18, 26), h2 = between(r, cfg.tower.h * 0.5, cfg.tower.h * 0.8);
      if (!fits(C, tu, tv, tw + 8, tw + 8)) continue;
      brutal(C, tu, tv, tw, tw * 0.85, h2);
      const [rx, ry] = C.at(tu, tv);
      out.props.push({ kind: 'lamp', x: rx, y: ry, z0: z + h2 + 0.4, w: 0.8, d: 0.8, h: 0.6, a: 0, color: '#ff3b3b' });
      out.lights.push({ x: rx, y: ry + tw, z: z + h2 * 0.4, color: WARM, power: 40000, radius: 0.6, reach: 80 });
      claim(C, tu, tv, tw + 8, tw + 8);
      k++;
    }
  }

  // Ministries along both sides of the mall: long classical blocks, a lit colonnade on the face toward the mall.
  for (const s of [-1, 1]) {
    let u = uA + 10;
    while (u < uB - 20) {
      const w = between(r, cfg.ministry[0], cfg.ministry[1]), d = between(r, 24, 34), h = between(r, 24, 42);
      const v = s * (W / 2 + 10 + d / 2);
      if (fits(M, u + w / 2, v, w, d)) {
        brutal(M, u + w / 2, v, w, d, h);
        for (let k = -w / 2 + 3; k <= w / 2 - 3; k += 3.6) {
          const [cx2, cy2] = M.at(u + w / 2 + k, s * (W / 2 + 9.6));
          out.strips.push({ x: cx2, y: cy2, w: 0.6, d: 0.5, h: h * 0.7, z0: z + 1.5, a: axis, material: 'street-light', color: WARM });
        }
        claim(M, u + w / 2, v, w + 6, d + 6);
      }
      u += w + between(r, 8, 18);
    }
  }

  // The courts: across a lit square off the mall's foot, a hall behind a colonnade, steps down to the square.
  {
    const s = r() < 0.5 ? 1 : -1;
    const sqU = uA + 30, sqV = s * (W / 2 + 60);
    if (fits(M, sqU, sqV, 50, 40)) {
      const [qx, qy] = M.at(sqU, sqV);
      out.strips.push({ x: qx, y: qy, w: 50, d: 40, h: 0.2, z0: z + 0.05, a: axis, material: 'concrete' });
      for (const [a2, b2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as P[]) {
        const [lx, ly] = M.at(sqU + a2 * 22, sqV + b2 * 17);
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: z + 3.6, w: 0.9, d: 0.9, h: 0.5, a: 0, color: WARM });
      }
      claim(M, sqU, sqV, 50, 40);
      const cv = sqV + s * 42;
      if (fits(M, sqU, cv, 56, 34)) {
        brutal(M, sqU, cv, 56, 34, 26);
        for (let k = -24; k <= 24; k += 4) {
          const [cx2, cy2] = M.at(sqU + k, cv - s * 17.4);
          out.strips.push({ x: cx2, y: cy2, w: 0.7, d: 0.5, h: 15, z0: z + 1.5, a: axis, material: 'street-light', color: WARM });
        }
        claim(M, sqU, cv, 60, 38);
      }
      out.lights.push({ x: qx, y: qy, z: z + 24, color: WARM, power: 50000, radius: 0.6, reach: 80 });
    }
  }

  // A wooded park on the far side of the plateau: trees, a lamp-lit path.
  const parkC = M.at(uA - 60, 0);
  for (let q = 0; q < cfg.parkTrees; q++) {
    const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * cfg.parkRadius;
    const x = parkC[0] + Math.cos(ang) * d, y = parkC[1] + Math.sin(ang) * d * 0.8;
    if (!ok(x, y) || taken.has(key(x, y))) continue;
    const h = between(r, 7, 13);
    out.props.push({ kind: 'pine', x, y, z0: z, w: h * 0.5, d: h * 0.5, h, a: 0 });
    if (q % 9 === 0) out.props.push({ kind: 'lamp', x: x + 2, y, z0: z + 2.4, w: 0.5, d: 0.5, h: 0.4, a: 0, color: WARM });
    taken.add(key(x, y));
  }

  // Officials' homes on quiet streets over the rest: a grid squared to the mall, a house and garden per plot, lamps.
  const H = cfg.homes;
  for (let i = -60; i <= 60; i++)
    for (let j = -60; j <= 60; j++) {
      const u = mid + i * H.slot, v = j * H.slot;
      const [x, y] = M.at(u, v);
      if (!ok(x, y) || taken.has(key(x, y))) continue;
      // (Checked and claimed a cell short of the plot, so neighbours on the 8 px grid don't refuse each other.)
      if (!fits(M, u, v, H.slot - 16, H.slot - 16)) continue;
      if (r() < 0.15) continue;
      // Near the mall, the government quarter: office blocks, taller toward the mall, warm-lit, a pool of light.
      if (Math.abs(v) < cfg.quarter) {
        const k2 = 1 - Math.abs(v) / cfg.quarter;
        const bh = between(r, 16, 24) + k2 * between(r, 10, 30);
        brutal(M, u, v, H.slot - 8, H.slot - 10, bh);
        if ((i + j) % 3 === 0) out.lights.push({ x, y: y + H.slot / 2, z: z + 26, color: WARM, power: 36000, radius: 0.6, reach: 70 });
        const [sx, sy] = M.at(u, v - H.slot / 2);
        out.strips.push({ x: sx, y: sy, w: H.slot, d: 4, h: 0.2, z0: z + 0.05, a: axis, material: 'street' });
        claim(M, u, v, H.slot - 14, H.slot - 14);
        continue;
      }
      const w = between(r, H.size[0], H.size[1]), d = w * between(r, 0.6, 0.85);
      // Half the homes brick (not concrete), half concrete.
      box(M, u, v - 3, w, d, between(r, 6, 10), z, r() < 0.5 ? { lit: 0.6, brick: 1, concrete: undefined } : { lit: 0.6 });
      box(M, u, v - 3, w - 1.5, d * 0.4, 2.2, z + 8, { kind: 'tier', lit: 0 });
      for (let q = 0; q < 3; q++) {
        const [tx, ty] = M.at(u + between(r, -H.slot / 2 + 3, H.slot / 2 - 3), v + H.slot / 2 - 4);
        out.props.push({ kind: 'pine', x: tx, y: ty, z0: z, w: 3, d: 3, h: between(r, 5, 8), a: 0 });
      }
      if ((i + j) % 2 === 0) {
        const [lx, ly] = M.at(u - H.slot / 2, v - H.slot / 2);
        out.props.push({ kind: 'lamp', x: lx, y: ly, z0: z + 3.2, w: 0.7, d: 0.7, h: 0.5, a: 0, color: WARM });
      }
      // The street along the plot's front.
      const [sx, sy] = M.at(u, v - H.slot / 2);
      out.strips.push({ x: sx, y: sy, w: H.slot, d: 4, h: 0.2, z0: z + 0.05, a: axis, material: 'street' });
      claim(M, u, v, H.slot - 14, H.slot - 14);
    }

  // SDG posts round the rim: a booth with a cold light every so often (the Shelf rents its security).
  let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!, L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (let s = (cfg.posts - (t % cfg.posts)); s < L; s += cfg.posts) {
      const ex = p[0] + ((q[0] - p[0]) * s) / L, ey = p[1] + ((q[1] - p[1]) * s) / L;
      // Step in from the rim to the enclave's ground.
      const nx = mx - ex, ny = my - ey, nl = Math.hypot(nx, ny);
      const x = ex + (nx / nl) * (cfg.rim + 4), y = ey + (ny / nl) * (cfg.rim + 4);
      if (!inside(x, y) || blocked(x, y) < 4 || x > MAP_W - 20 || y < 20) continue;
      out.buildings.push({ x, y, w: 4, d: 4, h: 3.4, z0: z, a: 0, tint: '#d8ecff', lit: 0.9, brick: 0, seed: r(), district, kind: 'shack' });
      out.props.push({ kind: 'lamp', x, y, z0: z + 3.6, w: 0.9, d: 0.9, h: 0.5, a: 0, color: '#e8f4ff' });
      out.lights.push({ x, y, z: z + 10, color: '#d8ecff', power: 12000, radius: 0.6, reach: 35 });
    }
    t += L;
  }

  out.distance = (x, y) => (inside(x, y) ? -10 : Infinity);
  return out;
}
