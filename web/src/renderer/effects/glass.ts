/**
 * Rain on the glass: beads that gather on the window while it rains and dry slowly after, and now
 * and then one that runs down, gathering the beads in its way and leaving a fading trail. Pure
 * (seeded); the display lives with the effects layer.
 */
import type { Weather } from '../../../../shared/types';
import { areaBounds, inArea, shapeArea, type Shape } from '../../../../shared/weather-area';
import { seededRng } from './lightning';

/** The art's own pixel size: every drop sits on this grid. */
export const GLASS_PX = 2;
const MAX_AMOUNT = 3;
/** Beads per px² of glass at 100 % in full rain, and the most a room shows. */
const BEAD_DENSITY = 1 / 900;
const MAX_BEADS = 500;
/** Wetness gained per second while it rains harder than the glass is wet (wet in ~4 s). */
const WET_RISE = 0.25;
/** Seconds full wet glass takes to dry. */
const DRY_SECONDS = 30;
/** New beads per second while the glass is short of them (a share of the target, at least a few). */
const BEAD_SPAWN = 0.3;
const MIN_BEAD_SPAWN = 3;
/** Runners per second per 100 000 px² of glass, at 100 % in full rain. */
const RUNNER_RATE = 0.6;
const MAX_RUNNERS = 12;
/** A runner waits, then slides a short way, then waits again. */
const HOLD: [number, number] = [0.15, 0.8];
const SLIDE: [number, number] = [0.08, 0.35];
const SPEED: [number, number] = [50, 110];
/** Chance a slide starts one pixel to the side. */
const WOBBLE = 0.35;
/** Beads a runner gathers before it grows to two pixels (and runs on with shorter holds). */
const GROW_AT = 3;
const BEAD_ALPHA: [number, number] = [0.45, 0.85];
const RUNNER_ALPHA = 0.95;
const TRAIL_ALPHA = 0.3;
const TRAIL_LIFE = 2.5;
const MAX_TRAIL = 600;
/** Tries at finding a spot on the glass before giving up for this bead. */
const TRIES = 12;

/** A glass effect's `amount` as a number: 1 by default, 0–3. */
export function glassAmount(amount: number | undefined): number {
  if (typeof amount !== 'number') return 1;
  return Math.max(0, Math.min(MAX_AMOUNT, amount));
}

/** The glass's size in px²: its shapes, or the whole frame without any. */
export function glassAreaPx(area: Shape[] | undefined, frame: [number, number]): number {
  return area?.length ? area.reduce((sum, s) => sum + shapeArea(s), 0) : frame[0] * frame[1];
}

/** How many beads the glass holds at this wetness. */
export function beadTarget(areaPx: number, amount: number, wet: number): number {
  return Math.min(MAX_BEADS, Math.round(areaPx * BEAD_DENSITY * amount * Math.max(0, Math.min(1, wet))));
}

/** Runners per second: only in rain, more in harder rain. */
export function runnerRate(areaPx: number, amount: number, weather: Weather, level: number): number {
  if (weather !== 'rain') return 0;
  return (RUNNER_RATE * amount * Math.max(0, Math.min(1, level)) * areaPx) / 100_000;
}

/** The glass's wetness `dt` s on: up to the rain's level in a few seconds, down slowly. */
export function nextWetness(wet: number, dt: number, weather: Weather, level: number): number {
  const target = weather === 'rain' ? Math.max(0, Math.min(1, level)) : 0;
  if (wet < target) return Math.min(target, wet + WET_RISE * dt);
  return Math.max(target, wet - dt / DRY_SECONDS);
}

export interface GlassDrop {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

export interface GlassView {
  beads: GlassDrop[];
  runners: (GlassDrop & { id: number })[];
  trail: GlassDrop[];
}

interface Runner {
  id: number;
  x: number;
  y: number;
  size: number;
  gathered: number;
  sliding: boolean;
  timer: number;
  speed: number;
  /** The last grid row it left a trail on. */
  row: number;
}

/** One room's glass: kept between frames so the beads stay put and the runners carry on. */
export class Glass {
  private readonly rng: () => number;
  private readonly bounds: [number, number, number, number];
  private readonly areaPx: number;
  private readonly beads: GlassDrop[] = [];
  private readonly runners: Runner[] = [];
  private readonly trail: (GlassDrop & { age: number })[] = [];
  private wet = 0;
  private started = false;
  private spawnDebt = 0;
  private runnerDebt = 0;
  private nextId = 0;

  constructor(
    seed: number,
    private readonly area: Shape[] | undefined,
    frame: [number, number],
    private readonly amount: number,
  ) {
    this.rng = seededRng(seed);
    this.bounds = area?.length ? areaBounds(area) : [0, 0, frame[0], frame[1]];
    this.areaPx = glassAreaPx(area, frame);
  }

  step(dt: number, weather: Weather, level: number, reduced: boolean): GlassView {
    const raining = weather === 'rain' && level > 0;
    // Walking into a room in the rain, the glass is already wet.
    if (!this.started) {
      this.started = true;
      this.wet = raining ? Math.min(1, level) : 0;
      for (let n = beadTarget(this.areaPx, this.amount, this.wet); this.beads.length < n; ) if (!this.addBead()) break;
    } else {
      this.wet = nextWetness(this.wet, dt, weather, level);
    }

    const target = beadTarget(this.areaPx, this.amount, this.wet);
    // Drying: beads go one by one, from anywhere on the glass.
    while (this.beads.length > target) this.beads.splice(Math.floor(this.rng() * this.beads.length), 1);
    if (raining && this.beads.length < target) {
      this.spawnDebt += Math.max(MIN_BEAD_SPAWN, target * BEAD_SPAWN) * dt;
      while (this.spawnDebt >= 1 && this.beads.length < target) {
        this.spawnDebt--;
        if (!this.addBead()) break;
      }
    } else {
      this.spawnDebt = 0;
    }

    if (reduced) {
      this.runners.length = 0;
      this.trail.length = 0;
    } else {
      this.runnerDebt += runnerRate(this.areaPx, this.amount, weather, level) * dt;
      while (this.runnerDebt >= 1) {
        this.runnerDebt--;
        if (this.runners.length < MAX_RUNNERS) this.startRunner();
      }
      for (let i = this.runners.length - 1; i >= 0; i--) if (!this.moveRunner(this.runners[i], dt)) this.runners.splice(i, 1);
      for (const t of this.trail) t.age += dt;
      while (this.trail.length && this.trail[0].age >= TRAIL_LIFE) this.trail.shift();
    }

    return {
      beads: this.beads.map((b) => ({ ...b })),
      runners: this.runners.map((r) => ({ id: r.id, x: snap(r.x), y: snap(r.y), size: r.size, alpha: RUNNER_ALPHA })),
      trail: this.trail.map((t) => ({ x: t.x, y: t.y, size: t.size, alpha: TRAIL_ALPHA * (1 - t.age / TRAIL_LIFE) })),
    };
  }

  private onGlass(x: number, y: number): boolean {
    return this.area?.length ? inArea(this.area, x, y) : x >= this.bounds[0] && y >= this.bounds[1] && x < this.bounds[0] + this.bounds[2] && y < this.bounds[1] + this.bounds[3];
  }

  /** A grid spot on the glass for a drop `size` px wide, or null. */
  private spot(size: number): [number, number] | null {
    const [bx, by, bw, bh] = this.bounds;
    for (let i = 0; i < TRIES; i++) {
      const x = snap(bx + this.rng() * bw);
      const y = snap(by + this.rng() * bh);
      if (this.onGlass(x + size / 2, y + size / 2)) return [x, y];
    }
    return null;
  }

  private addBead(): boolean {
    const size = this.rng() < 0.15 ? 2 * GLASS_PX : GLASS_PX;
    const at = this.spot(size);
    if (!at) return false;
    this.beads.push({ x: at[0], y: at[1], size, alpha: lerp(BEAD_ALPHA, this.rng()) });
    return true;
  }

  /** A bead gets heavy and starts to run (or, on bare glass, a fresh drop does). */
  private startRunner(): void {
    let x: number, y: number;
    if (this.beads.length) {
      const b = this.beads.splice(Math.floor(this.rng() * this.beads.length), 1)[0];
      [x, y] = [b.x, b.y];
    } else {
      const at = this.spot(GLASS_PX);
      if (!at) return;
      [x, y] = at;
    }
    this.runners.push({ id: this.nextId++, x, y, size: GLASS_PX, gathered: 0, sliding: false, timer: lerp(HOLD, this.rng()), speed: lerp(SPEED, this.rng()), row: snap(y) });
  }

  /** Moves a runner on; false once it has run off the glass. */
  private moveRunner(r: Runner, dt: number): boolean {
    r.timer -= dt;
    if (r.timer <= 0) {
      r.sliding = !r.sliding;
      if (r.sliding) {
        r.timer = lerp(SLIDE, this.rng());
        if (this.rng() < WOBBLE) {
          const nx = r.x + (this.rng() < 0.5 ? -GLASS_PX : GLASS_PX);
          if (this.onGlass(nx + r.size / 2, r.y + r.size / 2)) r.x = nx;
        }
      } else {
        // A heavier runner waits less.
        r.timer = lerp(HOLD, this.rng()) / (r.size > GLASS_PX ? 2 : 1);
      }
    }
    if (!r.sliding) return true;
    const from = r.y;
    r.y += r.speed * dt;
    if (!this.onGlass(r.x + r.size / 2, r.y + r.size / 2)) return false;
    this.gather(r, from);
    for (let row = r.row + GLASS_PX; row <= snap(r.y); row += GLASS_PX) {
      this.trail.push({ x: snap(r.x), y: row - GLASS_PX, size: GLASS_PX, alpha: TRAIL_ALPHA, age: 0 });
      r.row = row;
    }
    if (this.trail.length > MAX_TRAIL) this.trail.splice(0, this.trail.length - MAX_TRAIL);
    return true;
  }

  /** Takes in the beads the runner slid over since `from`. */
  private gather(r: Runner, from: number): void {
    const left = r.x - GLASS_PX, right = r.x + r.size + GLASS_PX;
    for (let i = this.beads.length - 1; i >= 0; i--) {
      const b = this.beads[i];
      if (b.x + b.size <= left || b.x >= right || b.y + b.size <= from || b.y >= r.y + r.size) continue;
      this.beads.splice(i, 1);
      if (++r.gathered >= GROW_AT) r.size = 2 * GLASS_PX;
    }
  }
}

function snap(v: number): number {
  return Math.floor(v / GLASS_PX) * GLASS_PX;
}

function lerp([a, b]: [number, number], t: number): number {
  return a + (b - a) * t;
}
