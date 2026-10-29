/**
 * Steam and smoke: puffs that leave a box's bottom edge, rise to its top, swell and fade on the way.
 * Steam is pale, quick and billowy; smoke thinner, slower and curling. Pure (seeded); the display
 * lives with the effects layer.
 */
import { seededRng } from './lightning';

/** The art's own pixel size: every puff sits on this grid and is drawn in cells this big. */
export const PUFF_PX = 2;
/** The puffs' diameters in room px: one soft-disc texture each. */
export const PUFF_SIZES = [4, 6, 8, 12, 16, 20, 24, 32, 40, 48] as const;
const MAX_AMOUNT = 3;
const MAX_PUFFS = 80;
/** A puff fades in over this share of its life. */
const FADE_IN = 0.12;
/** Simulated on the first frame, so a room opens on a plume already going. */
const PREWARM_STEP = 0.1;

export type PlumeStyle = 'steam' | 'smoke';
type Range = [number, number];

interface StyleSpec {
  /** Puffs per second per px of source width, and at least this many per second. */
  rate: number;
  minRate: number;
  life: Range;
  /** Radius at birth. */
  r0: Range;
  /** Radius at the top, as a share of the box's height, kept within `r1Clamp`. */
  r1Share: number;
  r1Clamp: Range;
  peak: Range;
  /** Side-to-side sway: px at the top, and cycles per second. */
  sway: number;
  swayRate: number;
  /** How much of the box's width the puffs start across (1 = all of it). */
  spread: number;
}

const STYLES: Record<PlumeStyle, StyleSpec> = {
  steam: { rate: 0.15, minRate: 3, life: [1.8, 2.8], r0: [2, 4], r1Share: 0.14, r1Clamp: [6, 24], peak: [0.5, 0.75], sway: 3, swayRate: 0.3, spread: 1 },
  smoke: { rate: 0.06, minRate: 1.5, life: [3.5, 5.5], r0: [2, 3], r1Share: 0.08, r1Clamp: [4, 16], peak: [0.45, 0.65], sway: 6, swayRate: 0.18, spread: 0.5 },
};

/** A plume's `amount`: 1 by default, 0–3. */
export function plumeAmount(amount: number | undefined): number {
  if (typeof amount !== 'number') return 1;
  return Math.max(0, Math.min(MAX_AMOUNT, amount));
}

/** A plume's `lean`: 0 by default, -1 (left) … 1 (right). */
export function plumeLean(lean: number | undefined): number {
  if (typeof lean !== 'number') return 0;
  return Math.max(-1, Math.min(1, lean));
}

/** The puff size nearest a diameter, within the sizes there are. */
export function puffSize(d: number): number {
  return PUFF_SIZES.reduce((best, s) => (Math.abs(s - d) < Math.abs(best - d) ? s : best), PUFF_SIZES[0]);
}

/** A soft disc `cells` wide (RGBA, white): alpha falls off from the centre in a few hard steps, like the art's own shading. */
export function puffPixels(cells: number): Uint8Array {
  const px = new Uint8Array(cells * cells * 4);
  const c = cells / 2;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      const a = d >= 1 ? 0 : Math.round(Math.pow(1 - d, 0.5) * 4) / 4;
      const i = (y * cells + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

export interface PuffView {
  /** Top left, in room px, on the grid. */
  x: number;
  y: number;
  /** Diameter: one of PUFF_SIZES. */
  size: number;
  alpha: number;
}

interface Puff {
  x0: number;
  age: number;
  life: number;
  r0: number;
  r1: number;
  peak: number;
  phase: number;
}

/** One plume: kept between frames so its puffs carry on rising. */
export class Plume {
  private readonly rng: () => number;
  private readonly spec: StyleSpec;
  private readonly puffs: Puff[] = [];
  private debt = 0;
  private warm = false;

  constructor(
    seed: number,
    private readonly rect: [number, number, number, number],
    style: PlumeStyle,
    private readonly amount: number,
    private readonly lean: number,
  ) {
    this.rng = seededRng(seed);
    this.spec = STYLES[style];
  }

  step(dt: number): PuffView[] {
    if (!this.warm) {
      this.warm = true;
      for (let t = 0; t < this.spec.life[1]; t += PREWARM_STEP) this.advance(PREWARM_STEP);
    }
    this.advance(dt);
    return this.puffs.map((p) => this.view(p));
  }

  private advance(dt: number): void {
    const [, , w] = this.rect;
    const s = this.spec;
    for (const p of this.puffs) p.age += dt;
    for (let i = this.puffs.length - 1; i >= 0; i--) if (this.puffs[i].age >= this.puffs[i].life) this.puffs.splice(i, 1);
    if (this.amount <= 0) return;
    this.debt += Math.max(s.minRate, s.rate * w) * this.amount * dt;
    while (this.debt >= 1) {
      this.debt--;
      if (this.puffs.length < MAX_PUFFS) this.puffs.push(this.spawn());
    }
  }

  private spawn(): Puff {
    const [x, , w, h] = this.rect;
    const s = this.spec;
    const r1 = Math.max(s.r1Clamp[0], Math.min(s.r1Clamp[1], h * s.r1Share)) * lerp([0.8, 1.2], this.rng());
    return {
      x0: x + w / 2 + (this.rng() - 0.5) * w * s.spread,
      age: 0,
      life: lerp(s.life, this.rng()),
      r0: lerp(s.r0, this.rng()),
      r1,
      peak: lerp(s.peak, this.rng()),
      phase: this.rng() * Math.PI * 2,
    };
  }

  private view(p: Puff): PuffView {
    const [, y, , h] = this.rect;
    const s = this.spec;
    const t = Math.min(1, p.age / p.life);
    // Quick off the source, slowing as it rises.
    const cy = y + h - h * (1 - Math.pow(1 - t, 1.6));
    const cx = p.x0 + this.lean * h * 0.5 * Math.pow(t, 1.4) + s.sway * t * Math.sin(p.age * s.swayRate * Math.PI * 2 + p.phase);
    const size = puffSize(2 * (p.r0 + (p.r1 - p.r0) * Math.pow(t, 0.7)));
    // Holds most of its density through the body, thinning out toward the top.
    const alpha = p.peak * Math.min(1, t / FADE_IN) * (1 - t * t);
    return { x: snap(cx - size / 2), y: snap(cy - size / 2), size, alpha };
  }
}

function snap(v: number): number {
  return Math.floor(v / PUFF_PX) * PUFF_PX;
}

function lerp([a, b]: Range, t: number): number {
  return a + (b - a) * t;
}
