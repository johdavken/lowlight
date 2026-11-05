import type { Transition } from '../../../shared/types';

/** The renderer's transitions: the room's two, and the signal drop a room move shows for a `glitch`. */
export type SceneTransition = Transition | 'signal';

/** Total duration of each scene transition, in seconds. */
export const TRANSITION_DURATION: Record<SceneTransition, number> = { fade: 1.2, glitch: 0.6, signal: 1 };
/** How long a signal drop stays black after the swap, on top of its duration. */
const SIGNAL_HOLD = 0.3;

/** What a transition drives each frame: a black overlay alpha, a glitch strength and a signal drop (0..1). */
export interface TransitionTargets {
  setFade(alpha: number): void;
  setGlitch(amount: number): void;
  setSignal(amount: number): void;
}

interface Ramp {
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  done: () => void;
}

/**
 * Scene transitions, advanced by the renderer's frame clock (`update(dt)`).
 * `fade`: black overlay 0→1 over half the duration, `swap()`, then 1→0.
 * `glitch`: glitch strength 0→1, `swap()`, then 1→0 (the grade ramps RGB split and slice tearing).
 * `signal`: the picture collapses to a line and out, `swap()` on black, a held beat, then opens again.
 * Transitions run one at a time; a new one waits for the previous to finish.
 */
export class Transitions {
  private ramp: Ramp | null = null;
  private kind: SceneTransition = 'fade';
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly targets: TransitionTargets) {}

  playTransition(kind: SceneTransition, swap: () => Promise<void>): Promise<void> {
    const run = async () => {
      this.kind = kind;
      const half = TRANSITION_DURATION[kind] / 2;
      await this.animate(0, 1, half);
      try {
        await swap();
      } finally {
        if (kind === 'signal') await this.animate(1, 1, SIGNAL_HOLD);
        await this.animate(1, 0, half);
      }
    };
    const p = this.chain.then(run);
    this.chain = p.catch(() => {});
    return p;
  }

  update(dt: number): void {
    const r = this.ramp;
    if (!r) return;
    r.elapsed += dt;
    const p = Math.min(1, r.elapsed / r.duration);
    this.set(r.from + (r.to - r.from) * easeInOut(p));
    if (p >= 1) {
      this.ramp = null;
      r.done();
    }
  }

  private animate(from: number, to: number, duration: number): Promise<void> {
    this.set(from);
    return new Promise((done) => {
      this.ramp = { from, to, elapsed: 0, duration, done };
    });
  }

  private set(v: number): void {
    this.targets.setFade(this.kind === 'fade' ? v : 0);
    this.targets.setGlitch(this.kind === 'glitch' ? v : 0);
    this.targets.setSignal(this.kind === 'signal' ? v : 0);
  }
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
