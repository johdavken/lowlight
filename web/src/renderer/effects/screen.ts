/**
 * A working CRT: how bright it is moment to moment, and its power-off squeeze and warm-up.
 * Pure; the display lives with the effects layer.
 */

const OFF_SECONDS = 0.4;
/** The first part of power-off squeezes to a line; the rest to a dot. */
const SQUEEZE_SECONDS = 0.25;
const ON_SECONDS = 0.6;
const MIN_SCALE = 0.02;

export interface PowerState {
  scaleX: number;
  scaleY: number;
  brightness: number;
  on: boolean;
}

type Phase = 'unknown' | 'on' | 'off' | 'turning-off' | 'turning-on';

/**
 * Follows a light's *intensity* (not its flicker): power-off starts when it reaches 0, warm-up when
 * it leaves 0. A screen starts in whatever state its light is in, without a transition.
 */
export class ScreenPower {
  private phase: Phase = 'unknown';
  private t = 0;

  constructor(private readonly reduced = false) {}

  update(dt: number, intensity: number): PowerState {
    const wantOn = intensity > 0;
    if (this.phase === 'unknown' || this.reduced) this.phase = wantOn ? 'on' : 'off';
    else if (wantOn && (this.phase === 'off' || this.phase === 'turning-off')) this.begin('turning-on', dt);
    else if (!wantOn && (this.phase === 'on' || this.phase === 'turning-on')) this.begin('turning-off', dt);
    else this.t += dt;

    if (this.phase === 'turning-off' && this.t >= OFF_SECONDS) this.phase = 'off';
    if (this.phase === 'turning-on' && this.t >= ON_SECONDS) this.phase = 'on';

    switch (this.phase) {
      case 'on':
        return { scaleX: 1, scaleY: 1, brightness: 1, on: true };
      case 'off':
        return { scaleX: MIN_SCALE, scaleY: MIN_SCALE, brightness: 0, on: false };
      case 'turning-on':
        return { scaleX: 1, scaleY: 1, brightness: this.t / ON_SECONDS, on: true };
      default: {
        // turning-off: squeeze to a bright line, then to a dot that fades.
        if (this.t < SQUEEZE_SECONDS) return { scaleX: 1, scaleY: 1 - (1 - MIN_SCALE) * (this.t / SQUEEZE_SECONDS), brightness: 1, on: true };
        const k = Math.min(1, (this.t - SQUEEZE_SECONDS) / (OFF_SECONDS - SQUEEZE_SECONDS));
        return { scaleX: 1 - (1 - MIN_SCALE) * k, scaleY: MIN_SCALE, brightness: 1 - k, on: true };
      }
    }
  }

  /** The change happened during this step, so its time already counts. */
  private begin(phase: Phase, dt: number): void {
    this.phase = phase;
    this.t = dt;
  }
}

const fract = (v: number) => v - Math.floor(v);

/**
 * The CRT's breathe (±3 % over ~6 s) plus a faint flicker (±1 %), and a soft refresh bar running
 * down the screen for 0.8 s once per 6–12 s period (`bar` 0..1 while it runs). Reduced motion: still.
 */
export function crt(t: number, seed: number, reduced: boolean): { brightness: number; bar: number | null } {
  if (reduced) return { brightness: 1, bar: null };
  const breathe = 0.03 * Math.sin((2 * Math.PI * t) / 6 + seed * 6.283);
  const flicker = 0.01 * Math.sin(t * 37.1 + seed * 91.7) * Math.sin(t * 11.3 + seed * 13.1);
  const period = 6 + 6 * fract(seed * 7.13 + 0.31);
  const phase = (t + seed * period) % period;
  return { brightness: 1 + breathe + flicker, bar: phase < 0.8 ? phase / 0.8 : null };
}

/** Noise frames a static screen flips between. */
export const STATIC_FRAMES = 6;
const STATIC_FPS = 15;
const BAND_SECONDS = 1.2;

const hash = (n: number, seed: number) => fract(Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453);

/**
 * A static screen at time `t`: which noise frame shows, where it starts (0..1 of the tile, so a
 * frame never lines up with its last showing), and a brighter band rolling down for 1.2 s once per
 * 4–9 s period (`band` 0..1 while it runs). Reduced motion: one still frame.
 */
export function snow(t: number, seed: number, reduced: boolean): { frame: number; ox: number; oy: number; band: number | null } {
  if (reduced) return { frame: 0, ox: 0, oy: 0, band: null };
  const step = Math.floor(t * STATIC_FPS);
  // Even steps pick from the first half of the frames, odd from the second: never the same twice running.
  const half = STATIC_FRAMES / 2;
  const frame = (step & 1) * half + Math.floor(hash(step, seed) * half);
  const period = 4 + 5 * fract(seed * 3.71 + 0.17);
  const phase = (t + seed * period) % period;
  return { frame, ox: hash(step + 0.5, seed), oy: hash(step + 0.25, seed), band: phase < BAND_SECONDS ? phase / BAND_SECONDS : null };
}

/** One frame of snow: `w`×`h` opaque grey RGBA pixels. */
export function snowPixels(w: number, h: number, rng: () => number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.round(255 * rng());
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  return px;
}
