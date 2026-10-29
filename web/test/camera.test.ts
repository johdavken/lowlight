import { describe, expect, it } from 'vitest';
import { cameraFor, cameraOffset } from '../src/renderer/camera';

describe('cameraOffset', () => {
  it('stays within ±24 x / ±6 y over 10 minutes, for any mouse position', () => {
    const mice = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 5, y: -5 }, // out-of-range input is clamped
    ];
    for (const mouse of mice) {
      for (let t = 0; t <= 600; t += 0.05) {
        const o = cameraOffset(t, mouse);
        expect(Math.abs(o.x)).toBeLessThanOrEqual(24);
        expect(Math.abs(o.y)).toBeLessThanOrEqual(6);
      }
    }
  });

  it('responds to the mouse', () => {
    const left = cameraOffset(12.3, { x: -1, y: 0 });
    const right = cameraOffset(12.3, { x: 1, y: 0 });
    expect(left.x).not.toBeCloseTo(right.x, 3);
  });

  it('drifts over time with the mouse still', () => {
    const a = cameraOffset(0, { x: 0, y: 0 });
    const b = cameraOffset(5, { x: 0, y: 0 });
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });
});

describe('cameraFor', () => {
  it('holds a flat room perfectly still, whatever the mouse does', () => {
    expect(cameraFor([1536, 864], 12.3, { x: 1, y: -1 })).toEqual({ x: 0, y: 0 });
  });

  it('drifts a 480 room exactly as before', () => {
    expect(cameraFor([480, 270], 12.3, { x: 1, y: -1 })).toEqual(cameraOffset(12.3, { x: 1, y: -1 }));
  });
});
