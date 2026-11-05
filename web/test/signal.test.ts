import { describe, expect, it } from 'vitest';
import { signalShape } from '../src/renderer/signal-shape';

describe('signalShape', () => {
  it('leaves the picture whole at 0', () => {
    expect(signalShape(0)).toEqual({ height: 1, width: 1, flash: 0 });
  });

  it('is a full-width white line at three quarters', () => {
    const s = signalShape(0.75);
    expect(s.height).toBeCloseTo(0.006);
    expect(s.width).toBe(1);
    expect(s.flash).toBe(1);
  });

  it('has shrunk to nothing at 1', () => {
    expect(signalShape(1).width).toBe(0);
  });

  it('only ever gets thinner on the way down', () => {
    const heights = [0, 0.2, 0.4, 0.6, 0.75].map((a) => signalShape(a).height);
    expect(heights).toEqual([...heights].sort((x, y) => y - x));
  });
});
