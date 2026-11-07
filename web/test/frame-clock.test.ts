import { afterEach, describe, expect, it, vi } from 'vitest';
import { framePace, frameTick, setFramePace, stepCssLoops } from '../src/ui/frame-clock';

/** Enough of an Animation for the clock. */
function loop(o: { iterations?: number; playState?: string; startTime?: number | null; frames?: { computedOffset: number; easing: string }[] } = {}) {
  const a = {
    effect: { getTiming: () => ({ iterations: o.iterations ?? Infinity, duration: 1000, delay: 0 }), getKeyframes: () => o.frames ?? [] },
    playState: o.playState ?? 'running',
    startTime: o.startTime === undefined ? 100 : o.startTime,
    currentTime: null as number | null,
    pause: vi.fn(),
    play: vi.fn(),
  };
  return a;
}
const asAnims = (...a: ReturnType<typeof loop>[]) => a as unknown as Animation[];

afterEach(() => {
  setFramePace(0);
  Reflect.deleteProperty(document, 'getAnimations');
});

describe('frame clock', () => {
  it('has no clock to begin with: every frame is its own tick', () => {
    expect(framePace()).toBe(0);
    expect(frameTick(1000)).not.toBe(frameTick(1004));
  });

  it('holds one tick across the monitor frames between ticks at 60', () => {
    setFramePace(60);
    expect(frameTick(1000)).toBe(frameTick(1004));
    expect(frameTick(1000)).toBe(frameTick(1012));
    expect(frameTick(1000)).not.toBe(frameTick(1017));
  });

  it('gives two loops the same tick whenever they start', () => {
    setFramePace(30);
    expect(frameTick(5000)).toBe(frameTick(5020));
  });

  it('takes over a running loop, pausing it where it had got to', () => {
    const a = loop({ startTime: 100 });
    stepCssLoops(asAnims(a), 400);
    expect(a.pause).toHaveBeenCalledTimes(1);
    expect(a.currentTime).toBe(300);
  });

  it('moves a loop it has on every step, pausing it only the once', () => {
    const a = loop({ startTime: 100 });
    stepCssLoops(asAnims(a), 400);
    a.playState = 'paused';
    a.startTime = null;
    stepCssLoops(asAnims(a), 500);
    expect(a.pause).toHaveBeenCalledTimes(1);
    expect(a.currentTime).toBe(400);
  });

  it('writes a held loop only when its value changes, as the flicker rebuilds the whole map', () => {
    const step = 'steps(1, end)';
    const frames = [0, 0.41, 0.42, 1].map((computedOffset) => ({ computedOffset, easing: step }));
    const a = loop({ startTime: 0, frames });
    const writes: number[] = [];
    Object.defineProperty(a, 'currentTime', { set: (v: number) => writes.push(v) });
    for (const t of [0, 100, 200, 400, 415, 425, 900, 1000, 1100]) stepCssLoops(asAnims(a), t);
    // Its first value, the dip, the way back up, and the next pass.
    expect(writes).toEqual([0, 415, 425, 1000]);
  });

  it('writes a smooth loop every step', () => {
    const frames = [0, 1].map((computedOffset) => ({ computedOffset, easing: 'linear' }));
    const a = loop({ startTime: 0, frames });
    const writes: number[] = [];
    Object.defineProperty(a, 'currentTime', { set: (v: number) => writes.push(v) });
    for (const t of [0, 16, 33]) stepCssLoops(asAnims(a), t);
    expect(writes).toEqual([0, 16, 33]);
  });

  it('leaves one-shot animations and ones a stylesheet paused alone', () => {
    const once = loop({ iterations: 1 });
    const held = loop({ playState: 'paused' });
    stepCssLoops(asAnims(once, held), 400);
    expect(once.pause).not.toHaveBeenCalled();
    expect(held.currentTime).toBeNull();
  });

  it('hands its loops back when the clock goes, and only those', () => {
    const a = loop();
    const other = loop();
    stepCssLoops(asAnims(a), 400);
    Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => [a, other] });
    setFramePace(0);
    expect(a.play).toHaveBeenCalledTimes(1);
    expect(other.play).not.toHaveBeenCalled();
  });
});
