/**
 * Passing light: every so often a pool of light slides along a box, end to end (headlights through
 * a window, a police cruiser, a drone), lit like a room light while it passes. One at a time per
 * room, however many paths it has. Pure (seeded); the renderer adds the light after the room's own.
 */
import type { Hex } from '../../../../shared/types';
import { seededRng } from './lightning';

export type PassSource = 'car' | 'police' | 'drone';

export interface PassDef {
  rect: [number, number, number, number];
  source?: PassSource;
  /** Mean seconds between passes on this path. */
  every?: number;
  strength?: number;
}

export interface PassLight {
  pos: [number, number];
  color: Hex;
  intensity: number;
  radius: number;
}

const EVERY: [number, number] = [5, 300];
const DEFAULT_EVERY = 25;
/** ±40 % around `every`. */
const JITTER = 0.4;
/** The first pass comes this share of an interval after entering, never on the threshold. */
const FIRST: [number, number] = [0.3, 1];
/** A path due while another pass is still going waits this long and tries again. */
const WAIT: [number, number] = [2, 5];
/** The pool's radius, as a share of the box's height. */
const RADIUS = 0.75;

interface SourceSpec {
  colors: Hex[];
  peak: number;
  duration: [number, number];
  /** Colour swaps per second (police lights); 0 keeps the first. */
  swap: number;
  /** Up-and-down drift, as a share of the box's height, and its rate in cycles per second. */
  bob: number;
  bobRate: number;
}

const SOURCES: Record<PassSource, SourceSpec> = {
  car: { colors: ['#ffe9c4'], peak: 1.5, duration: [1.4, 2.2], swap: 0, bob: 0, bobRate: 0 },
  police: { colors: ['#ff2a3a', '#2a5bff'], peak: 1.2, duration: [2.2, 3.2], swap: 4, bob: 0, bobRate: 0 },
  drone: { colors: ['#7fe9ff'], peak: 1, duration: [3.5, 5], swap: 0, bob: 0.15, bobRate: 0.6 },
};

/** A path's `every`: 25 s by default, 5–300. */
export function passEvery(every: number | undefined): number {
  if (typeof every !== 'number') return DEFAULT_EVERY;
  return Math.max(EVERY[0], Math.min(EVERY[1], every));
}

/** A path's `strength`: 1 by default, 0–1. */
export function passStrength(strength: number | undefined): number {
  if (typeof strength !== 'number') return 1;
  return Math.max(0, Math.min(1, strength));
}

interface Pass {
  def: PassDef;
  spec: SourceSpec;
  age: number;
  duration: number;
  /** 1: left to right; -1: right to left. */
  dir: number;
  phase: number;
}

/** A room's passing lights: one timer per path, at most one pass lit at a time. */
export class Passing {
  private readonly rng: () => number;
  private readonly timers: number[];
  private active: Pass | null = null;

  constructor(
    seed: number,
    private readonly defs: PassDef[],
  ) {
    this.rng = seededRng(seed);
    this.timers = defs.map((d) => passEvery(d.every) * lerp(FIRST, this.rng()));
  }

  /** The passing light this frame, or null. */
  step(dt: number, reduced: boolean): PassLight | null {
    if (this.active) {
      this.active.age += dt;
      if (this.active.age >= this.active.duration) this.active = null;
    }
    this.defs.forEach((def, i) => {
      this.timers[i] -= dt;
      if (this.timers[i] > 0) return;
      if (this.active) {
        this.timers[i] = lerp(WAIT, this.rng());
        return;
      }
      const spec = SOURCES[def.source ?? 'car'];
      this.active = { def, spec, age: 0, duration: lerp(spec.duration, this.rng()), dir: this.rng() < 0.5 ? -1 : 1, phase: this.rng() * Math.PI * 2 };
      this.timers[i] = passEvery(def.every) * (1 - JITTER + 2 * JITTER * this.rng());
    });
    if (reduced || !this.active) return null;
    return light(this.active);
  }
}

function light(p: Pass): PassLight {
  const [x, y, w, h] = p.def.rect;
  const t = Math.min(1, p.age / p.duration);
  const s = p.spec;
  const along = p.dir > 0 ? t : 1 - t;
  const bob = s.bob * h * Math.sin(p.age * s.bobRate * Math.PI * 2 + p.phase);
  const color = s.swap > 0 ? s.colors[Math.floor(p.age * s.swap) % s.colors.length] : s.colors[0];
  return {
    pos: [x + w * along, y + h / 2 + bob],
    color,
    // Fades in from one end of the box and out at the other.
    intensity: passStrength(p.def.strength) * s.peak * Math.pow(Math.sin(Math.PI * t), 0.7),
    radius: h * RADIUS,
  };
}

function lerp([a, b]: [number, number], t: number): number {
  return a + (b - a) * t;
}
