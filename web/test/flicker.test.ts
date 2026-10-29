import { describe, expect, it } from 'vitest';
import { flickerFactor } from '../src/renderer/flicker';

describe('flickerFactor', () => {
  it('is exactly 1 when flicker is 0', () => {
    for (let t = 0; t < 10; t += 0.01) {
      expect(flickerFactor(t, 0, 7)).toBe(1);
    }
  });

  it('stays in [1 - flicker, 1] and actually varies', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 10; t += 1 / 60) {
      const f = flickerFactor(t, 0.5, 3);
      expect(f).toBeGreaterThanOrEqual(0.5);
      expect(f).toBeLessThanOrEqual(1);
      seen.add(f);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('differs between seeds', () => {
    let differs = false;
    for (let t = 0; t < 5; t += 0.1) {
      if (flickerFactor(t, 1, 1) !== flickerFactor(t, 1, 2)) differs = true;
    }
    expect(differs).toBe(true);
  });
});
