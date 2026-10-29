/**
 * Dust in a lamp's light: how many motes, and how they drift. Pure; the display lives with the
 * effects layer.
 */
import { seededRng } from './lightning';

/** Motes at full brightness and 100% dust. */
const MAX_MOTES = 30;
const MAX_AMOUNT = 3;
const MIN_SPEED = 3;
const MAX_SPEED = 8;
/** A mote's alpha at the pool's centre, fading to 0 at its edge. */
const PEAK_ALPHA = 0.9;

/** A light's `dust` as an amount: true is 100% (1), off is 0, capped at 300%. */
export function dustAmount(dust: boolean | number | undefined): number {
  if (dust === true) return 1;
  if (typeof dust !== 'number') return 0;
  return Math.max(0, Math.min(MAX_AMOUNT, dust));
}

export function dustCount(brightness: number, reduced: boolean, amount = 1): number {
  return reduced ? 0 : Math.round(MAX_MOTES * amount * Math.max(0, Math.min(1, brightness)));
}

/** How bright a mote shows in a light at this brightness: fades with it, but a lamp at half still shows its dust. */
export function dustFade(brightness: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, brightness)));
}

/** How much of the light's radius the motes fill: 60% at 100%, more as the dust thickens. */
export function dustSpread(amount: number): number {
  return Math.min(0.9, 0.5 + 0.1 * amount);
}

interface Mote {
  /** Offset from the pool's centre, in px. */
  dx: number;
  dy: number;
  heading: number;
  speed: number;
  size: number;
}

export interface MoteView {
  x: number;
  y: number;
  /** Fades toward the pool's edge. */
  alpha: number;
  size: number;
}

/** A light's motes: kept between frames so they drift instead of jumping. */
export class Motes {
  private readonly motes: Mote[] = [];
  private readonly rng: () => number;

  constructor(seed: number) {
    this.rng = seededRng(seed);
  }

  step(dt: number, center: [number, number], radius: number, count: number): MoteView[] {
    while (this.motes.length < count) this.motes.push(this.spawn(radius));
    this.motes.length = Math.min(this.motes.length, count);
    const out: MoteView[] = [];
    for (const m of this.motes) {
      m.heading += (this.rng() - 0.5) * 0.6 * dt;
      m.dx += Math.cos(m.heading) * m.speed * dt;
      m.dy += Math.sin(m.heading) * m.speed * dt;
      if (Math.hypot(m.dx, m.dy) > radius) Object.assign(m, this.spawn(radius));
      const edge = Math.hypot(m.dx, m.dy) / radius;
      out.push({ x: center[0] + m.dx, y: center[1] + m.dy, alpha: PEAK_ALPHA * (1 - edge * edge), size: m.size });
    }
    return out;
  }

  private spawn(radius: number): Mote {
    const r = radius * 0.9 * Math.sqrt(this.rng());
    const a = this.rng() * Math.PI * 2;
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, heading: this.rng() * Math.PI * 2, speed: MIN_SPEED + (MAX_SPEED - MIN_SPEED) * this.rng(), size: moteSize(this.rng()) };
  }
}

/** 2 px mostly, some 3, a few 4: big enough to read in a 1536 room. */
function moteSize(r: number): number {
  return r < 0.6 ? 2 : r < 0.9 ? 3 : 4;
}
