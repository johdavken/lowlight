import { describe, expect, it } from 'vitest';
import { lightGlowAlpha } from '../src/renderer/glow-alpha';

describe('lightGlowAlpha (per-light glow follows its light)', () => {
  it('a light at intensity 0 has a dark glow map (the lamp-bulb fix)', () => {
    expect(lightGlowAlpha({ id: 'desk_lamp', intensity: 0, flicker: 0 }, 3)).toBe(0);
  });

  it('a steady light at full intensity glows fully', () => {
    expect(lightGlowAlpha({ id: 'desk_lamp', intensity: 1, flicker: 0 }, 3)).toBe(1);
  });

  it('flicker 0.5 keeps the glow within [0.5, 1] and it varies over time', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 10; t += 0.05) {
      const a = lightGlowAlpha({ id: 'sign', intensity: 1, flicker: 0.5 }, t);
      expect(a).toBeGreaterThanOrEqual(0.5);
      expect(a).toBeLessThanOrEqual(1);
      seen.add(Math.round(a * 100));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('scales with intensity', () => {
    expect(lightGlowAlpha({ id: 'monitor', intensity: 0.35, flicker: 0 }, 1)).toBeCloseTo(0.35);
  });
});
