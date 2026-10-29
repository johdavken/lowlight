import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawArea, isMasked, maskFor } from '../src/renderer/weather-mask';

const bounds = (g: Graphics) => {
  const b = g.getLocalBounds();
  return [b.x, b.y, b.width, b.height];
};

describe('weather mask', () => {
  it('mask bounds match the area in frame px (flat and legacy)', () => {
    const flat = drawArea(new Graphics(), [[[704, 54], [790, 54], [790, 312], [704, 312]], [[797, 54], [1110, 54], [1110, 312]]]);
    expect(bounds(flat)).toEqual([704, 54, 406, 258]);
    const legacy = drawArea(new Graphics(), [[[266, 67], [430, 67], [430, 157], [266, 157]]]);
    expect(bounds(legacy)).toEqual([266, 67, 164, 90]);
  });

  it('drawArea clears what was there', () => {
    const g = drawArea(new Graphics(), [[[0, 0], [10, 0], [10, 10]], [[500, 500], [600, 500], [600, 600]]]);
    drawArea(g, [[[100, 100], [200, 100], [200, 150]]]);
    expect(bounds(g)).toEqual([100, 100, 100, 50]);
  });

  it('a room without an area clears the mask', () => {
    expect(maskFor(undefined)).toBe(false);
    expect(maskFor([[[0, 0], [10, 0], [10, 10]]])).toBe(true);
  });

  it('isMasked follows the mask, which Pixi reports as undefined when there is none (task 2 review)', () => {
    const rain = new Graphics();
    expect(isMasked(rain)).toBe(false);
    rain.mask = drawArea(new Graphics(), [[[0, 0], [10, 0], [10, 10]]]);
    expect(isMasked(rain)).toBe(true);
    rain.mask = null;
    expect(isMasked(rain)).toBe(false);
  });
});
