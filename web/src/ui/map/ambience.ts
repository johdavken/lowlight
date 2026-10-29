/**
 * The city map's ambience, without drawing: lit windows found in the picture, sign brightness over time,
 * walking a path, and the traffic and puff runners. Positions are map %; sizes are a % of the map's width.
 * The canvas that draws it is ambience-layer.ts.
 */
import type { CityMapData, MapPlume, MapSign, MapTraffic, Pt } from '../../../../shared/map-schema';

/** The longest step anything takes: a hidden tab coming back doesn't jump the traffic along. */
export const MAX_DT = 0.05;
const SMOKE = '#9a94a6';
const STEAM = '#d8e4f0';

/** A small seeded LCG, so the same windows twinkle every time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export interface LitWindow {
  x: number;
  y: number;
  /** Map px up (a rendered window on a wall); absent: on the picture. */
  z?: number;
  district: string;
  color: string;
  seed: number;
  /** Goes dark now and then (a dimmer), rather than brightening. */
  dims: boolean;
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Lit windows in the picture (already scaled down, e.g. to 768 × 512): small spots brighter than around them, inside a border. */
export function scatterWindows(px: { data: Uint8ClampedArray; width: number; height: number }, map: CityMapData): LitWindow[] {
  const { data, width: w, height: h } = px;
  const lum = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
  };
  const polys = map.districts.filter((d) => d.border?.length).map((d) => ({ id: d.id, poly: d.border!.map((a): Pt => [a.x, a.y]) }));
  const rand = rng(7);
  const out: LitWindow[] = [];
  for (let y = 2; y < h - 2; y += 2)
    for (let x = 2; x < w - 2; x += 2) {
      const L = lum(x, y);
      if (L < 150) continue;
      const around = (lum(x - 2, y) + lum(x + 2, y) + lum(x, y - 2) + lum(x, y + 2)) / 4;
      if (L - around < 35) continue;
      const X = (x / w) * 100;
      const Y = (y / h) * 100;
      const d = polys.find((p) => inside(p.poly, X, Y));
      if (!d) continue;
      const i = (y * w + x) * 4;
      out.push({ x: X, y: Y, district: d.id, color: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`, seed: rand(), dims: rand() < 0.35 });
    }
  return out;
}

/** Whether this window is one of its district's share (`windows`, absent 1). The render tags the Ribbon's windows
 * 'ribbon' (its own power, for blackouts), which is no district on the map: they take Karasu's share. */
export function windowShown(w: LitWindow, map: CityMapData): boolean {
  const id = w.district === 'ribbon' ? 'karasu' : w.district;
  const amount = map.districts.find((d) => d.id === id)?.windows ?? 1;
  return w.seed < amount * 0.55;
}

/** 0–1: a brightener's flash strength now, or how dark a dimmer is now. */
export function windowLevel(w: LitWindow, t: number): number {
  const ph = t * (0.15 + w.seed * 0.5) + w.seed * 97;
  const cyc = ph - Math.floor(ph);
  if (w.dims) return cyc > 0.82 ? Math.min(1, (cyc - 0.82) * 12, (1 - cyc) * 25) : 0;
  return cyc > 0.9 ? Math.sin((cyc - 0.9) * 10 * Math.PI) : 0.12 + 0.08 * Math.sin(ph * 6.3);
}

/** 0–1 at time `t` (s): a slow swell, an aviation flash, or neon that stutters now and then. */
export function signLevel(s: MapSign, t: number): number {
  const speed = s.speed ?? 1;
  const phase = s.phase ?? 0;
  if (s.mode === 'blink') return (t * 0.5 * speed + phase) % 1 < 0.12 ? 1 : 0;
  if (s.mode === 'pulse') return 0.35 + 0.35 * (0.5 + 0.5 * Math.sin((t * speed + phase) * Math.PI * 2));
  const r = rng(Math.floor(t * 14) * 31 + 5)();
  const burst = Math.sin(t * 0.7 * speed + phase * 6) > 0.86;
  return burst ? (r < 0.5 ? 0.05 : 0.7) : 0.55 + 0.1 * r;
}

/** A segment's length, y counted at 1/1.5 (the map is 3:2, so a map % across is longer than one down). */
const seg = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], (b[1] - a[1]) / 1.5);

export function pathLength(path: Pt[]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += seg(path[i - 1], path[i]);
  return L;
}

/** The point `d` along the path, with its heading; null past the end. */
export function pointAlong(path: Pt[], d: number): { x: number; y: number; dx: number; dy: number } | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const L = seg(a, b);
    if (L === 0) continue;
    if (d <= L) {
      const k = d / L;
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: b[0] - a[0], dy: b[1] - a[1] };
    }
    d -= L;
  }
  if (path.length && Math.abs(d) < 1e-9) {
    const b = path[path.length - 1];
    return { x: b[0], y: b[1], dx: 0, dy: 0 };
  }
  return null;
}

/** A train's lights, and the gap between them along the path (map %). */
export const TRAIN_CARS = 7;
export const TRAIN_GAP = 0.9;

export interface Mover {
  traffic: MapTraffic;
  d: number;
  /** Runs the path backwards (cars only). */
  back: boolean;
}

/** Spawns lights along each path every `every` × (0.6–1.4) s and walks them to the end. */
export class TrafficRun {
  readonly movers: Mover[] = [];
  private readonly acc: number[];
  private readonly next: number[];
  private readonly lens: number[];

  constructor(
    private readonly traffic: MapTraffic[],
    private readonly rand: () => number,
  ) {
    this.acc = traffic.map(() => 0);
    this.next = traffic.map((t) => this.gap(t));
    this.lens = traffic.map((t) => pathLength(t.path));
  }

  private gap(t: MapTraffic): number {
    return t.every * (0.6 + this.rand() * 0.8);
  }

  step(dt: number): void {
    dt = Math.min(MAX_DT, dt);
    this.traffic.forEach((t, i) => {
      this.acc[i] += dt;
      if (this.acc[i] >= this.next[i] - 1e-9) {
        this.acc[i] = 0;
        this.next[i] = this.gap(t);
        this.movers.push({ traffic: t, d: 0, back: t.kind === 'cars' && this.rand() < 0.5 });
      }
    });
    for (let i = this.movers.length - 1; i >= 0; i--) {
      const m = this.movers[i];
      m.d += dt * m.traffic.speed;
      // A train goes once its last car has left the path, not its head.
      const tail = m.traffic.kind === 'train' ? (TRAIN_CARS - 1) * TRAIN_GAP : 0;
      if (m.d > this.lens[this.traffic.indexOf(m.traffic)] + tail) this.movers.splice(i, 1);
    }
  }

  /** Where a mover is now (or `back` along its path), or null when it's off the end. */
  at(m: Mover, d = m.d): ReturnType<typeof pointAlong> {
    if (d < 0) return null;
    const len = this.lens[this.traffic.indexOf(m.traffic)];
    return pointAlong(m.traffic.path, m.back ? len - d : d);
  }
}

export interface Puff {
  plume: MapPlume;
  x: number;
  y: number;
  age: number;
  life: number;
  /** Starting radius, % of the map's width. */
  r0: number;
  wob: number;
}

/** Puffs from each stack (3 a second at amount 1): they rise, drift with the lean and wobble, then go. */
export class PlumeRun {
  readonly puffs: Puff[] = [];
  private readonly acc: number[];

  constructor(
    private readonly plumes: MapPlume[],
    private readonly rand: () => number,
  ) {
    this.acc = plumes.map(() => 0);
  }

  step(dt: number): void {
    dt = Math.min(MAX_DT, dt);
    this.plumes.forEach((p, i) => {
      this.acc[i] += dt * 3 * p.amount;
      while (this.acc[i] > 1) {
        this.acc[i] -= 1;
        this.puffs.push({ plume: p, x: p.at[0] + (this.rand() - 0.5) * 0.2, y: p.at[1], age: 0, life: 4 + this.rand() * 3, r0: 0.25 + this.rand() * 0.2, wob: this.rand() * 6 });
      }
    });
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i];
      q.age += dt;
      if (q.age > q.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      const k = q.age / q.life;
      q.y -= dt * 0.9 * (1 - k * 0.5);
      q.x += dt * (q.plume.lean * 0.6 + Math.sin(q.age * 1.3 + q.wob) * 0.05);
    }
  }
}

/** A puff's look now: radius (% of the map's width), alpha and colour. Smoke is a light grey so it reads on dark art. */
export function puffLook(q: Puff): { r: number; alpha: number; color: string } {
  const k = q.age / q.life;
  const smoke = q.plume.style === 'smoke';
  const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
  return {
    r: (q.r0 + k * 1.1) * (smoke ? 1.3 : 1),
    alpha: Math.max(0, fade) * (smoke ? 0.42 : 0.22),
    color: q.plume.tint ?? (smoke ? SMOKE : STEAM),
  };
}
