import { parseHex } from '../../../shared/color';
import type { LightDef, Weather } from '../../../shared/types';

/** One drawable weather particle, in render-texture px. `len` is the streak length (≤ 1 draws a dot). */
export interface Particle {
  x: number;
  y: number;
  len: number;
  /** 0xRRGGBB */
  color: number;
  alpha: number;
}

/** Rain streak color far from every light. */
export const RAIN_BASE_COLOR = 0x96b4ff;

/** Without a region, particles may sit this far outside the frame (so streaks enter and leave smoothly). */
const MARGIN = 8;

/** `[x, y, w, h]` in render-texture px. */
export type Region = [number, number, number, number];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Clips the segment (x0,y0)→(x1,y1) to `r` (Liang–Barsky). Returns the parameter range [t0, t1]
 * of the visible part, or null when nothing is inside.
 */
function clipSegment(x0: number, y0: number, x1: number, y1: number, r: Rect): [number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, x0 - r.x],
    [dx, r.x + r.w - x0],
    [-dy, y0 - r.y],
    [dy, r.y + r.h - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

interface KindSpec {
  max: number;
  color: number;
  /** Fall speed range, px/s (scaled by depth). */
  vy: [number, number];
  /** Constant horizontal wind, px/s (scaled by depth). */
  wind: number;
  /** Horizontal sway amplitude (px/s) and rate (rad/s). */
  sway: number;
  swayRate: number;
  /** Streak length range in px (scaled by depth). */
  len: [number, number];
  alpha: number;
  /** How strongly a nearby light pulls the particle color (0..1) and brightens it. */
  catchLight: number;
}

const KINDS: Record<Exclude<Weather, 'none'>, KindSpec> = {
  rain: { max: 400, color: RAIN_BASE_COLOR, vy: [260, 340], wind: -55, sway: 0, swayRate: 0, len: [7, 13], alpha: 0.32, catchLight: 0.85 },
  snow: { max: 250, color: 0xe6ecff, vy: [16, 30], wind: -6, sway: 10, swayRate: 1.3, len: [1, 1], alpha: 0.55, catchLight: 0.5 },
  ash: { max: 180, color: 0x9a8f96, vy: [8, 18], wind: 5, sway: 7, swayRate: 0.8, len: [1, 1], alpha: 0.5, catchLight: 0.6 },
  dust: { max: 120, color: 0xc8b494, vy: [-3, 4], wind: 9, sway: 4, swayRate: 0.5, len: [1, 1], alpha: 0.3, catchLight: 0.7 },
};

/** Direction of a rain streak's tail, per px of length: streaks lean along the wind. */
export function streakSlope(kind: Weather): number {
  if (kind === 'none') return 0;
  const k = KINDS[kind];
  const vy = (k.vy[0] + k.vy[1]) / 2;
  return k.wind / vy;
}

interface Drop {
  x: number;
  y: number;
  /** 0.4..1: farther drops are slower, shorter and fainter. */
  depth: number;
  vy: number;
  phase: number;
  len: number;
  out: Particle;
}

/** mulberry32: small seeded PRNG in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LitLight {
  x: number;
  y: number;
  r: number;
  rgb: [number, number, number];
  intensity: number;
}

function mixColor(base: number, rgb: [number, number, number], w: number, gain: number): number {
  const ch = (shift: number, target: number) => {
    const b = ((base >> shift) & 0xff) / 255;
    const v = (b + (target - b) * w) * gain;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  };
  return (ch(16, rgb[0]) << 16) | (ch(8, rgb[1]) << 8) | ch(0, rgb[2]);
}

/**
 * Weather particle simulation at native resolution. Holds no Pixi state: `step` advances the
 * particles and returns them (the same objects each frame, mutated) for a thin draw layer.
 * Count eases toward `max(kind) * level`; particles near a light take on its color.
 */
export class WeatherSystem {
  private drops: Drop[] = [];
  private kind: Weather = 'none';
  private readonly rand: () => number;
  private t = 0;
  private spawnDebt = 0;
  private region: Rect | null = null;

  constructor(
    private readonly w: number,
    private readonly h: number,
    seed: number,
  ) {
    this.rand = rng(seed);
  }

  /**
   * Confines weather to `[x, y, w, h]` (e.g. a window's glass), or the whole frame when null.
   * Particles live, move and are clipped inside it (a streak never crosses its edge), and the
   * count scales with its area so density matches the full-frame weather.
   */
  setRegion(region: Region | null | undefined): void {
    const next = region ? { x: region[0], y: region[1], w: region[2], h: region[3] } : null;
    const same =
      next === this.region ||
      (next && this.region && next.x === this.region.x && next.y === this.region.y && next.w === this.region.w && next.h === this.region.h);
    if (same) return;
    this.region = next;
    this.drops = [];
    this.spawnDebt = 0;
  }

  step(dt: number, kind: Weather, level: number, lights: LightDef[]): Particle[] {
    this.t += dt;
    if (kind !== this.kind) {
      this.drops = [];
      this.kind = kind;
      this.spawnDebt = 0;
    }
    if (kind === 'none') return [];
    const spec = KINDS[kind];
    const dom = this.domain();
    const areaShare = this.region ? (this.region.w * this.region.h) / (this.w * this.h) : 1;
    const max = spec.max * areaShare;
    const target = Math.round(max * Math.max(0, Math.min(1, level)));

    // Fill toward the target at up to 2× max per second, scattered over the whole domain so a
    // rising level thickens the weather everywhere instead of sending a front down from the top.
    if (this.drops.length < target) {
      this.spawnDebt += Math.max(1, max) * 2 * dt;
      while (this.drops.length < target && this.spawnDebt >= 1) {
        this.drops.push(this.spawn(spec, dom, dom.y + 1 + this.rand() * (dom.h - 2)));
        this.spawnDebt -= 1;
      }
    } else {
      this.spawnDebt = 0;
    }

    const lit: LitLight[] = lights
      .filter((l) => l.intensity > 0 && l.radius > 0)
      .map((l) => ({ x: l.pos[0], y: l.pos[1], r: l.radius, rgb: parseHex(l.color) ?? [1, 1, 1], intensity: l.intensity }));

    const keep: Drop[] = [];
    const visible: Particle[] = [];
    let excess = this.drops.length - target;
    // Heads wrap within [left, right - 1] so a dot's pixel (and a streak's head) is always inside.
    const left = dom.x;
    const right = dom.x + dom.w - 1;
    const slope = streakSlope(kind);
    for (const d of this.drops) {
      d.y += d.vy * dt;
      d.x += (spec.wind + spec.sway * Math.sin(this.t * spec.swayRate + d.phase)) * d.depth * dt;
      if (d.x < left) d.x += right - left;
      else if (d.x > right) d.x -= right - left;
      // Recycle once less than a pixel of it would still show: a falling streak when its tail nears
      // the bottom edge, a rising particle at the top edge.
      const bottom = dom.y + dom.h - 1;
      const exited = (d.len <= 1 ? d.y : d.y - d.len) > bottom || d.y < dom.y;
      if (exited) {
        // Over target: let it go. Otherwise recycle it at the opposite edge.
        if (excess > 0) {
          excess--;
          continue;
        }
        // Re-enter with the head just inside the edge, so the streak slides in already visible.
        this.reset(d, spec, dom, d.vy >= 0 ? dom.y + 1 : dom.y + dom.h - 1);
      }
      keep.push(d);
      if (this.clip(d, slope, dom)) {
        this.shade(d, spec, lit);
        visible.push(d.out);
      }
    }
    this.drops = keep;
    return visible;
  }

  /** The area particles live in: the region, or the frame plus its margin. */
  private domain(): Rect {
    return this.region ?? { x: -MARGIN, y: -MARGIN, w: this.w + MARGIN * 2, h: this.h + MARGIN * 2 };
  }

  /** Writes the visible part of the drop into `d.out`; false when none of it is inside `dom`. */
  private clip(d: Drop, slope: number, dom: Rect): boolean {
    const o = d.out;
    if (d.len <= 1) {
      // A dot covers the pixel [x, x+1) × [y, y+1).
      if (d.x < dom.x || d.x > dom.x + dom.w - 1 || d.y < dom.y || d.y > dom.y + dom.h - 1) return false;
      o.x = d.x;
      o.y = d.y;
      o.len = d.len;
      return true;
    }
    // Segment from the head (t = 0) back to the tail (t = 1).
    const range = clipSegment(d.x, d.y, d.x - slope * d.len, d.y - d.len, dom);
    if (!range) return false;
    const [t0, t1] = range;
    const len = (t1 - t0) * d.len;
    if (len < 0.5) return false;
    o.x = d.x - slope * d.len * t0;
    o.y = d.y - d.len * t0;
    o.len = len;
    return true;
  }

  private spawn(spec: KindSpec, dom: Rect, y: number): Drop {
    const d: Drop = { x: 0, y: 0, depth: 1, vy: 0, phase: 0, len: 1, out: { x: 0, y: 0, len: 1, color: spec.color, alpha: 0 } };
    this.reset(d, spec, dom, y);
    return d;
  }

  private reset(d: Drop, spec: KindSpec, dom: Rect, y: number): void {
    const r = this.rand;
    d.depth = 0.4 + 0.6 * r();
    d.x = dom.x + r() * (dom.w - 1);
    d.y = Math.max(dom.y, Math.min(dom.y + dom.h - 1, y));
    d.vy = (spec.vy[0] + (spec.vy[1] - spec.vy[0]) * r()) * d.depth;
    d.phase = r() * Math.PI * 2;
    d.len = spec.len[0] === spec.len[1] ? spec.len[0] : Math.max(2, (spec.len[0] + (spec.len[1] - spec.len[0]) * r()) * d.depth);
  }

  private shade(d: Drop, spec: KindSpec, lights: LitLight[]): void {
    // Strongest light at this particle: intensity × (1 − d/r), the weight of its color. Linear (not the
    // shader's squared falloff) so streaks catch a light's color across most of its radius.
    let best: LitLight | null = null;
    let bestW = 0;
    for (const l of lights) {
      const dist = Math.hypot(d.out.x - l.x, d.out.y - l.y);
      if (dist >= l.r) continue;
      const wgt = Math.min(1, l.intensity * (1 - dist / l.r) * 1.5);
      if (wgt > bestW) {
        bestW = wgt;
        best = l;
      }
    }
    const o = d.out;
    const baseAlpha = spec.alpha * (0.45 + 0.55 * d.depth);
    if (best) {
      const w = bestW * spec.catchLight;
      o.color = mixColor(spec.color, best.rgb, w, 1 + 0.4 * w);
      o.alpha = Math.min(1, baseAlpha * (1 + 1.6 * bestW));
    } else {
      o.color = spec.color;
      o.alpha = baseAlpha;
    }
  }
}
