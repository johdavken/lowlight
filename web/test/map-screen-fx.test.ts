import { describe, expect, it, vi } from 'vitest';
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
