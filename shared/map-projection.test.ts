import { describe, expect, it } from 'vitest';
import { groundStretch, pinHeight, toScreen } from './map-projection';

describe('map projection', () => {
  it('a ground point lands on its own map %', () => {
    expect(toScreen([40, 30])).toEqual([40, 30]);
  });
  it('height raises a point by z·cos(52°)', () => {
    expect(toScreen([40, 30], 100)[1]).toBeCloseTo(30 - (100 * Math.cos((52 * Math.PI) / 180)) / 3072 * 100, 6);
  });
  it('Level 4 stands above Level 2; Level 1 is the walkway', () => {
    expect(pinHeight(4, 8.5, 0)).toBeGreaterThan(pinHeight(2, 8.5, 0));
    expect(pinHeight(1, 8.5, 0)).toBe(1.2);
  });
  it('a roof place sits 9 above the stack', () => {
    expect(pinHeight('roof', 8.5, 51)).toBe(60);
  });
  it('the ground stretch undoes the tilt', () => {
    expect(groundStretch()).toBeCloseTo(1.269, 3);
  });
});
