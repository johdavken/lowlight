import { describe, expect, it, vi } from 'vitest';
import { setFramePace } from '../src/ui/frame-clock';
import { rainCount, ScreenFx } from '../src/ui/map/screen-fx';

describe('map screen effects', () => {
  it('no rain in clear weather', () => {
    expect(rainCount('none', 1, 1e6)).toBe(0);
  });
  it('rain follows the level', () => {
    expect(Math.abs(rainCount('rain', 0.5, 1e6) - rainCount('rain', 1, 1e6) / 2)).toBeLessThanOrEqual(1);
    expect(rainCount('rain', 1, 1e6)).toBeGreaterThan(0);
  });
  it('snow is not rain', () => {
    expect(rainCount('snow', 1, 1e6)).toBe(0);
  });
  it('draws on the frame clock\'s ticks, not on every monitor frame', () => {
    const calls = vi.fn();
    const ctx = new Proxy({}, { get: () => calls, set: () => true }) as unknown as CanvasRenderingContext2D;
    let next: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((next = cb), 1));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const fx = new ScreenFx({ context: ctx });
    const draw = vi.spyOn(fx, 'drawFrame').mockReturnValue(0);
    setFramePace(60);
    fx.start();
    for (const now of [1000, 1004, 1008, 1012, 1017]) next!(now);
    setFramePace(0);
    fx.stop();
    vi.unstubAllGlobals();
    expect(draw).toHaveBeenCalledTimes(2);
  });
  it('nothing draws under reduced motion', () => {
    const calls = vi.fn();
    const ctx = new Proxy({}, { get: () => calls, set: () => true }) as unknown as CanvasRenderingContext2D;
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    const fx = new ScreenFx({ reducedMotion: true, context: ctx });
    fx.setWeather('rain', 1);
    fx.start();
    expect(fx.drawFrame(1)).toBe(0);
    expect(calls).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
