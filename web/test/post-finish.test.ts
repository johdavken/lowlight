/** What the room is finished with, as the figures read it (the room's finish on the figures, 2026-11-17). */
import { describe, expect, it } from 'vitest';
import { CRT, FOG_STOPS, crtLineWidth, tintRgb } from '../src/renderer/post';
import { FIGURE_FS } from '../src/ui/figure-light';

describe('the room finish', () => {
  it('scanline width per view scale is what the CRT pass has always used', () => {
    // Today's maths: whole art rows per scanline period, the period ≈ 5.24 · lineWidth / 2 screen px.
    const today = (scale: number) => Math.max(1, (2 * Math.max(1, Math.ceil(5.24 / scale)) * scale) / 5.24);
    for (const s of [1, 2, 2.5, 3, 6]) expect(crtLineWidth(s)).toBeCloseTo(today(s));
    expect(crtLineWidth(0.5)).toBeCloseTo(today(1));
  });

  it('the CRT pass keeps its settings', () => {
    expect(CRT).toEqual({ lineContrast: 0.15, vignetting: 0.35, vignettingAlpha: 0.8, vignettingBlur: 0.35 });
  });

  it('the fog ramp is faint at the top and dense at the bottom, and the figure shader is built from the same stops', () => {
    expect(FOG_STOPS).toEqual([
      [0, 0.05],
      [0.45, 0.3],
      [0.8, 0.75],
      [1, 1],
    ]);
    for (let i = 0; i + 1 < FOG_STOPS.length; i++) {
      const [t0, a0] = FOG_STOPS[i];
      const [t1, a1] = FOG_STOPS[i + 1];
      expect(FIGURE_FS).toContain(`mix(${a0.toFixed(4)}, ${a1.toFixed(4)}, (t - ${t0.toFixed(4)}) / ${(t1 - t0).toFixed(4)})`);
    }
  });

  it('a sprite tint is rgb 0..1', () => {
    expect(tintRgb(0xff8000).map((c) => Math.round(c * 1000) / 1000)).toEqual([1, 0.502, 0]);
  });
});
