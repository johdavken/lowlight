/**
 * Lightning: when strikes come (from the rain level) and what each one looks and sounds like.
 * The maths is pure (seeded); the flash's display lives with the effects layer.
 */
import type { Weather } from '../../../../shared/types';

/** Rain at or above this level brings strikes. */
export const STORM_LEVEL = 0.7;
/** Mean seconds between strikes at STORM_LEVEL and at 1.0. */
const SLOWEST = 30;
const FASTEST = 8;
/** ±40 % around the mean. */
const JITTER = 0.4;
/** The longest step the scheduler takes (a resumed tab can't fire a burst). */
const MAX_DT = 1;

/** A small seeded PRNG (mulberry32), so a room's effects repeat from visit to visit. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seconds until the next strike at this rain level. */
export function strikeInterval(level: number, rng: () => number): number {
  const k = Math.min(1, Math.max(0, (level - STORM_LEVEL) / (1 - STORM_LEVEL)));
  const mean = SLOWEST - k * (SLOWEST - FASTEST);
  return mean * (1 - JITTER + 2 * JITTER * rng());
}

export interface StrikeShape {
  /** Flash brightness at its peak (0..1). */
  peak: number;
  /** 3 for a near strike, 1 for a far one. */
  flickers: number;
  /** Seconds the flash lasts. */
  duration: number;
  /** Seconds before the thunder. */
  delay: number;
  /** Added to the room's ambient light at the flash's peak. */
  lift: number;
}

/** A strike `d` away (0 near … 1 far). */
export function strikeShape(d: number, strength: number): StrikeShape {
  const peak = strength * (1 - 0.6 * d);
  return { peak, flickers: d < 1 / 3 ? 3 : d < 2 / 3 ? 2 : 1, duration: 0.5 - 0.35 * d, delay: 1 + 3 * d, lift: 0.15 * peak };
}

/**
 * The flash's brightness `t` s into a strike (0 outside it): it starts at its peak, as lightning
 * does, then `flickers` pulses decaying to dark.
 */
export function flashAt(t: number, shape: StrikeShape): number {
  if (t < 0 || t >= shape.duration) return 0;
  const p = t / shape.duration;
  return shape.peak * Math.abs(Math.cos(Math.PI * shape.flickers * p)) * (1 - p);
}

/** When strikes happen: arms on entering a storm with a full interval, never on the crossing. */
export class StrikeScheduler {
  private timer: number | null = null;

  update(dt: number, weather: Weather, level: number, rng: () => number): { distance: number } | null {
    if (weather !== 'rain' || level < STORM_LEVEL) {
      this.timer = null;
      return null;
    }
    if (this.timer === null) {
      this.timer = strikeInterval(level, rng);
      return null;
    }
    this.timer -= Math.min(dt, MAX_DT);
    if (this.timer > 0) return null;
    this.timer = strikeInterval(level, rng);
    return { distance: rng() };
  }

  reset(): void {
    this.timer = null;
  }
}
