/**
 * One clock for what moves outside the room's renderer: the map's canvases and camera, and the looping CSS animations.
 * While anything animates, Firefox composites the whole page on every monitor frame, 240 a second on a 240 Hz screen,
 * even when a CSS animation only changes a few times a second. So the loops wait for this clock's ticks, and the CSS
 * loops are paused and moved by hand on them: they look as written, and the page has nothing to composite between ticks.
 */

/** Ticks a second; 0 is no clock, every loop on the monitor's frames and the CSS running by itself. */
let pace = 0;
/** A CSS loop this clock has taken over. */
interface Loop {
  /** When it began. */
  from: number;
  /** Where a loop that holds each value changes, as fractions of a pass; null for one that changes all the time. */
  marks: number[] | null;
  /** The held value it was last moved to. */
  held: number | null;
}
const loops = new WeakMap<Animation, Loop>();
let lastTick = -1;
let pacing = false;

export function framePace(): number {
  return pace;
}

/** Sets the clock; 0 hands the CSS loops back to the browser. */
export function setFramePace(fps: number): void {
  pace = fps;
  if (fps) return;
  for (const a of document.getAnimations?.() ?? []) {
    if (!loops.has(a)) continue;
    loops.delete(a);
    a.play();
  }
}

/** The same number until the next tick, so loops on one clock draw on the same frame; without a clock, `now` itself. */
export function frameTick(now: number): number {
  return pace ? Math.floor((now * pace) / 1000) : now;
}

/** A loop's marks, if every step of it holds its value: `steps(1)`, as the CRT's flicker and fuzz are. */
function holdMarks(a: Animation): number[] | null {
  const frames = (a.effect as KeyframeEffect).getKeyframes?.() ?? [];
  const holds = frames.length > 0 && frames.slice(0, -1).every((k) => /^(steps\(1[,)]|step-(end|start))/.test(k.easing ?? ''));
  return holds ? frames.map((k) => Number(k.computedOffset)) : null;
}

/** Which held value a loop is on at `elapsed` ms, counted through a pass. */
function heldAt(marks: number[], elapsed: number, duration: number): number {
  const pass = (((elapsed % duration) + duration) % duration) / duration;
  return marks.filter((m) => m <= pass).length;
}

/**
 * Moves every looping CSS animation to `t` (ms on the document timeline), taking over any new one still running. A write
 * makes the browser rebuild what's under the element, the whole map for the flicker, so a held value is only written
 * when it changes: a few times in five seconds instead of 60 times a second.
 */
export function stepCssLoops(animations: Animation[], t: number): void {
  for (const a of animations) {
    const timing = a.effect?.getTiming();
    if (timing?.iterations !== Infinity) continue;
    let loop = loops.get(a);
    if (!loop) {
      // One a stylesheet paused stays paused.
      if (a.playState !== 'running') continue;
      loop = { from: Number(a.startTime ?? t), marks: holdMarks(a), held: null };
      loops.set(a, loop);
      a.pause();
    }
    const elapsed = t - loop.from;
    if (loop.marks) {
      const held = heldAt(loop.marks, elapsed - Number(timing.delay ?? 0), Number(timing.duration));
      if (held === loop.held) continue;
      loop.held = held;
    }
    a.currentTime = elapsed;
  }
}

/** Starts moving the CSS loops on the clock's ticks, for as long as the page lives. */
export function paceCssLoops(): void {
  if (pacing) return;
  pacing = true;
  const frame = (now: number) => {
    const tick = frameTick(now);
    if (pace && tick !== lastTick) {
      lastTick = tick;
      stepCssLoops(document.getAnimations(), Number(document.timeline.currentTime));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
