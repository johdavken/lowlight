import { describe, expect, it } from 'vitest';
import { figureBox } from '../src/ui/figure';

describe('figureBox', () => {
  it('head to waist of a 2:3 sprite at 400px tall', () => {
    const b = figureBox({ top: 0, bottom: 0.5 }, 400);
    expect(b.bgHeight).toBeCloseTo(800);
    expect(b.bgWidth).toBeCloseTo(533.33, 1);
    expect(b.width).toBeCloseTo(533.33, 1);
    expect(b.bgY).toBeCloseTo(0);
  });

  it('shifts up for a band lower down', () => {
    const b = figureBox({ top: 0.1, bottom: 0.6 }, 400);
    expect(b.bgHeight).toBeCloseTo(800);
    expect(b.bgY).toBeCloseTo(-80);
  });

  it('never zooms past a 10% band, and keeps the band inside the image (Review Focus 4)', () => {
    const thin = figureBox({ top: 0.3, bottom: 0.31 }, 400);
    expect(thin.bgHeight).toBeCloseTo(4000); // band widened to 0.1
    const low = figureBox({ top: 0.95, bottom: 1 }, 400);
    expect(low.bgHeight).toBeCloseTo(4000);
    expect(low.bgY).toBeCloseTo(-0.9 * 4000); // top pulled back so the band ends at the bottom
  });

  it('respects another aspect ratio', () => {
    expect(figureBox({ top: 0, bottom: 1 }, 300, 1).width).toBeCloseTo(300);
  });
});
