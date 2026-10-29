import type { Transition } from '../../../shared/types';

/** Total duration of each scene transition, in seconds. */
export const TRANSITION_DURATION: Record<Transition, number> = { fade: 1.2, glitch: 0.6 };

/** What a transition drives each frame: a black overlay alpha, and a glitch strength (0..1). */
export interface TransitionTargets {
  setFade(alpha: number): void;
  setGlitch(amount: number): void;
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
 * Transitions run one at a time; a new one waits for the previous to finish.
 */
export class Transitions {
  private ramp: Ramp | null = null;
  private kind: Transition = 'fade';
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly targets: TransitionTargets) {}

  playTransition(kind: Transition, swap: () => Promise<void>): Promise<void> {
    const run = async () => {
      this.kind = kind;
      const half = TRANSITION_DURATION[kind] / 2;
      await this.animate(0, 1, half);
      try {
        await swap();
      } finally {
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
    if (this.kind === 'fade') {
      this.targets.setFade(v);
      this.targets.setGlitch(0);
    } else {
      this.targets.setGlitch(v);
      this.targets.setFade(0);
    }
  }
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
