/** The select screen's single DOM layer: a 1600×900 layer on the game stage. */
import { STAGE_H, STAGE_W, stageScale } from '../ui/game-stage';

export { STAGE_H, STAGE_W, stageScale };

/** How long `glitchOut` holds before resolving (matches the CSS animation's duration). */
const GLITCH_OUT_MS = 600;
/** Default spread for `glitchIn`'s random `animation-delay`, in seconds. */
const DEFAULT_MAX_DELAY = 0.45;

/** Mounts the `.select-stage` layer inside `host`: 1600×900 at the game stage's corner (the game stage scales it). */
export function mountStage(host: HTMLElement): { el: HTMLElement; dispose(): void } {
  const el = document.createElement('div');
  el.className = 'select-stage';
  el.style.width = `${STAGE_W}px`;
  el.style.height = `${STAGE_H}px`;
  el.style.position = 'absolute';
  el.style.left = '0';
  el.style.top = '0';
  host.append(el);
  return {
    el,
    dispose() {
      el.remove();
    },
  };
}

/** The `@keyframes` name behind `.glitch-in` in select.css. */
const GLITCH_IN_KEYFRAMES = 'glitch-in';
/** Each element's pending glitch-in cleanup, so a replay replaces rather than stacks it. */
const glitchInCleanups = new WeakMap<HTMLElement, (e: AnimationEvent) => void>();

/**
 * Plays the glitch-in print for each element: re-triggers `glitch-in` (removing it first and
 * forcing a reflow, so a repeat animates again) with a random stagger up to `maxDelay` seconds.
 * Once that element's own glitch-in ends, the class and delay come off: left on, any animation
 * that later replaces it (the refusal shake) would replay the glitch-in when it ends.
 * No-op under reduced motion.
 */
export function glitchIn(els: HTMLElement[], o: { reducedMotion: boolean; maxDelay?: number; rng?: () => number }): void {
  if (o.reducedMotion) return;
  const maxDelay = o.maxDelay ?? DEFAULT_MAX_DELAY;
  const rng = o.rng ?? Math.random;
  for (const el of els) {
    el.classList.remove('glitch-in');
    void el.offsetWidth; // force reflow so re-adding the class restarts the animation
    el.classList.add('glitch-in');
    el.style.animationDelay = `${(rng() * maxDelay).toFixed(2)}s`;
    const previous = glitchInCleanups.get(el);
    if (previous) el.removeEventListener('animationend', previous);
    const done = (e: AnimationEvent) => {
      if (e.target !== el || e.animationName !== GLITCH_IN_KEYFRAMES) return;
      el.removeEventListener('animationend', done);
      glitchInCleanups.delete(el);
      el.classList.remove('glitch-in');
      el.style.animationDelay = '';
    };
    glitchInCleanups.set(el, done);
    el.addEventListener('animationend', done);
  }
}

/** Plays the glitch-out print; resolves once it's done, or immediately under reduced motion. */
export function glitchOut(el: HTMLElement, o: { reducedMotion: boolean }): Promise<void> {
  el.classList.add('glitch-out');
  if (o.reducedMotion) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, GLITCH_OUT_MS));
}
