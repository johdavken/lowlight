import { describe, expect, it } from 'vitest';
import { weatherBoundsFor, weatherLightsFor, weatherRegionFor } from '../src/renderer/weather-frame';

describe('weatherRegionFor', () => {
  it('turns a flat room region into whole 480 px, never shrinking it', () => {
    expect(weatherRegionFor([1536, 864], [698, 16, 563, 285])).toEqual([218, 5, 176, 90]);
  });

  it('leaves no region as the whole frame (Review Focus 4)', () => {
    expect(weatherRegionFor([1536, 864], undefined)).toBeUndefined();
  });

  it('passes a 480 room region through', () => {
    expect(weatherRegionFor([480, 270], [218, 5, 176, 89])).toEqual([218, 5, 176, 89]);
  });

  it('stays inside the 480 frame', () => {
    expect(weatherRegionFor([1536, 864], [1500, 800, 36, 64])).toEqual([468, 250, 12, 20]);
  });
});

describe('weatherLightsFor', () => {
  it('moves flat room lights into 480 px for the rain tint', () => {
    const [l] = weatherLightsFor([1536, 864], [{ id: 'lamp', pos: [320, 160] as [number, number] }]);
    expect(l.pos).toEqual([100, 50]);
    expect(l.id).toBe('lamp');
  });

  it('leaves 480 room lights alone', () => {
    const lights = [{ pos: [10, 20] as [number, number] }];
    expect(weatherLightsFor([480, 270], lights)).toEqual(lights);
  });
});

describe('weatherBoundsFor', () => {
  it("takes the shapes' bounds into 480 px", () => {
    expect(weatherBoundsFor([1536, 864], [[[698, 16], [1261, 16], [1261, 301], [698, 301]]])).toEqual([218, 5, 176, 90]);
  });

  it('no area is the whole frame', () => {
    expect(weatherBoundsFor([1536, 864], undefined)).toBeUndefined();
  });
});
