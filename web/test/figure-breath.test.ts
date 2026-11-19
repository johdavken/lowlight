import { describe, expect, it } from 'vitest';
import { BREATH, breathAt, mouthAt } from '../src/ui/figure-breath';

const sample = (speaking: boolean, phase = 0) => Array.from({ length: 200 }, (_, i) => breathAt((i / 200) * 10, phase, speaking));

describe('breathAt', () => {
  it('never moves her: breath is light (the chest swell) and fog, no lift', () => {
    for (const speaking of [false, true]) for (const b of sample(speaking)) expect(b).not.toHaveProperty('lift');
    expect(BREATH.listen).toEqual({ period: 4.8 });
    expect(BREATH.speak).toEqual({ period: 3.4 });
  });

  it('repeats every period', () => {
    for (const t of [0.3, 1.7, 2.9]) {
      for (const [speaking, period] of [
        [false, BREATH.listen.period],
        [true, BREATH.speak.period],
      ] as const) {
        const a = breathAt(t, 0.2, speaking);
        const b = breathAt(t + period, 0.2, speaking);
        expect(b.level).toBeCloseTo(a.level, 9);
        expect(b.puff).toBeCloseTo(a.puff, 9);
      }
    }
  });

  it('puffs only on the out-breath, running 0 → 1, and her breath level falls as it does', () => {
    const p = BREATH.listen.period;
    const inBreath = breathAt(p * (1 - BREATH.exhale) * 0.5, 0, false);
    expect(inBreath.puff).toBe(-1);
    const start = breathAt(p * (1 - BREATH.exhale) + 0.001, 0, false);
    const mid = breathAt(p * (1 - BREATH.exhale / 2), 0, false);
    const end = breathAt(p - 0.001, 0, false);
    expect(start.puff).toBeGreaterThanOrEqual(0);
    expect(start.puff).toBeLessThan(0.05);
    expect(mid.puff).toBeCloseTo(0.5, 1);
    expect(end.puff).toBeGreaterThan(0.95);
    expect(end.level).toBeLessThan(0.01);
  });

  it('her breath level runs smoothly 0 → 1 through the in-breath and back', () => {
    const p = BREATH.listen.period;
    expect(breathAt(0, 0, false).level).toBeCloseTo(0, 5);
    expect(breathAt(p * (1 - BREATH.exhale) - 0.0001, 0, false).level).toBeCloseTo(1, 2);
    const mid = breathAt(p * (1 - BREATH.exhale) * 0.5, 0, false);
    expect(mid.level).toBeGreaterThan(0.3);
    expect(mid.level).toBeLessThan(0.7);
    for (const b of sample(false)) {
      expect(b.level).toBeGreaterThanOrEqual(0);
      expect(b.level).toBeLessThanOrEqual(1);
    }
  });

  it('two figures out of phase breathe apart', () => {
    const a = sample(false, 0);
    const b = sample(false, 0.37);
    expect(a.some((x, i) => Math.abs(x.level - b[i].level) > 0.1)).toBe(true);
  });
});

describe('mouthAt', () => {
  it('is a little below her face point, or a default under the master head', () => {
    expect(mouthAt(null)).toEqual({ x: 0.5, y: 0.115 });
    const m = mouthAt({ x: 0.48, y: 0.1 });
    expect(m.x).toBe(0.48);
    expect(m.y).toBeCloseTo(0.135);
  });
});
