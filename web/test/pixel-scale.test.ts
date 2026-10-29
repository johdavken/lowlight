import { describe, expect, it } from 'vitest';
import { backdropBlurStrength, backdropView, devicePixels, fitScale, frameView, integerScale, parallaxTarget, stageView } from '../src/renderer/stage';
import { stageRect } from '../src/ui/game-stage';

describe('fitScale', () => {
  it('fits a flat room to the tighter axis, unrounded, centred on the other', () => {
    const v = fitScale(2000, 977, 1536, 864);
    expect(v.scale).toBeCloseTo(977 / 864, 6);
    expect(v.x).toBe(131);
    expect(v.y).toBe(0);
  });

  it('fills 4K at 2.5x', () => {
    expect(fitScale(3840, 2160, 1536, 864)).toEqual({ scale: 2.5, x: 0, y: 0 });
  });
});

describe('frameView', () => {
  it('keeps whole steps and hard pixels for a 480 room', () => {
    expect(frameView([480, 270], 1920, 1080)).toEqual({ scale: 4, x: 0, y: 0, smooth: false });
  });

  it('fits a flat room smoothly', () => {
    expect(frameView([1536, 864], 1920, 1080)).toEqual({ scale: 1.25, x: 0, y: 0, smooth: true });
  });

  it('uses the frame it is given when the window changes (Review Focus 2)', () => {
    expect(frameView([1536, 864], 3840, 2160).scale).toBe(2.5);
    expect(frameView([480, 270], 3840, 2160).scale).toBe(8);
  });
});

describe('integerScale', () => {
  it('fills 1080p exactly at 4x', () => {
    expect(integerScale(1920, 1080)).toEqual({ scale: 4, x: 0, y: 0 });
  });

  it('letterboxes 1366x768 at 2x, centered', () => {
    expect(integerScale(1366, 768)).toEqual({ scale: 2, x: 203, y: 114 });
  });

  it('never goes below 1x for tiny windows', () => {
    expect(integerScale(300, 200).scale).toBe(1);
  });

  it('honours a custom base size', () => {
    expect(integerScale(1000, 1000, 100, 100)).toEqual({ scale: 10, x: 0, y: 0 });
  });
});

describe('devicePixels', () => {
  it('scales a CSS length by the device pixel ratio', () => {
    expect(devicePixels(1920, 2)).toBe(3840);
  });

  it('rounds rather than floors, so a dpr just under 1 (seen in some headless browsers) does not lose a pixel', () => {
    expect(devicePixels(1920, 0.9999999962747097)).toBe(1920);
    expect(devicePixels(1080, 0.9999999962747097)).toBe(1080);
  });

  it('never returns less than 1', () => {
    expect(devicePixels(0, 1)).toBe(1);
  });
});

describe('stageView (fixed stage §3)', () => {
  it('fits a flat room into a 21:9 window’s stage, offset by its bars', () => {
    expect(stageView([1536, 864], stageRect(2560, 1080), 1)).toEqual({ scale: 1.25, x: 320, y: 0, smooth: true });
  });

  it('puts a 480 room in whole steps inside the stage', () => {
    expect(stageView([480, 270], stageRect(1600, 900), 1)).toEqual({ scale: 3, x: 80, y: 45, smooth: false });
  });

  it('works in device pixels at dpr 1.25, landing within a css px of the stage (Review Focus 2)', () => {
    const v = stageView([480, 270], stageRect(1600, 900), 1.25);
    expect(v).toEqual({ scale: 4, x: 40, y: 22, smooth: false });
    // The room's centre in css px sits on the stage's centre.
    expect(Math.abs((v.x + 240 * v.scale) / 1.25 - 800)).toBeLessThanOrEqual(1);
  });

  it('letterboxes a flat room in a 16:10 window', () => {
    const v = stageView([1536, 864], stageRect(1440, 900), 1);
    expect(v.scale).toBeCloseTo(1440 / 1536, 6);
    expect([v.x, v.y]).toEqual([0, 45]);
  });
});

describe('backdropView', () => {
  it('covers the whole canvas with the frame, centred', () => {
    expect(backdropView([1536, 864], 2560, 1080)).toEqual({ scale: 2560 / 1536, x: 0, y: (1080 - 864 * (2560 / 1536)) / 2, show: true });
  });

  it('is off where the renderer has no bars to fill (Studio): Task 5 review I2', () => {
    expect(backdropView([480, 270], 1000, 600, { scale: 2, x: 20, y: 30 }, false).show).toBe(false);
    expect(backdropView([480, 270], 1000, 600, { scale: 2, x: 20, y: 30 }, true).show).toBe(true);
  });

  it('hides for a gap of a device px or two (1366×768: the stage rounds to 1365 wide)', () => {
    const v = stageView([1536, 864], stageRect(1366, 768), 1);
    expect(backdropView([1536, 864], 1366, 768, v).show).toBe(false);
    expect(backdropView([1536, 864], 1440, 900, stageView([1536, 864], stageRect(1440, 900), 1)).show).toBe(true);
  });

  it('blurs by its radius in device px, whatever resolution the filter runs at (Pixi counts strength in filter texels)', () => {
    expect(backdropBlurStrength(24, 0.5)).toBe(12);
    expect(backdropBlurStrength(24, 1)).toBe(24);
  });

  it('hides when the room already covers the canvas', () => {
    expect(backdropView([1536, 864], 1920, 1080, { scale: 1.25, x: 0, y: 0 }).show).toBe(false);
    expect(backdropView([1536, 864], 2560, 1080, { scale: 1.25, x: 320, y: 0 }).show).toBe(true);
  });
});

describe('parallaxTarget (Task 5 review I1)', () => {
  it('is −1…1 across the rect the room fits, wherever it sits in the window', () => {
    // Studio's preview pane: 800×450 at (600, 100).
    const pane = { left: 600, top: 100, width: 800, height: 450 };
    expect(parallaxTarget(1000, 325, pane)).toEqual({ x: 0, y: 0 });
    expect(parallaxTarget(600, 100, pane)).toEqual({ x: -1, y: -1 });
    expect(parallaxTarget(1400, 550, pane)).toEqual({ x: 1, y: 1 });
  });

  it('stays at the edge for a pointer out in the bars', () => {
    expect(parallaxTarget(0, 0, { left: 320, top: 0, width: 1920, height: 1080 })).toEqual({ x: -1, y: -1 });
  });
});
