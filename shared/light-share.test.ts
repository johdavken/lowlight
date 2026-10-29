import { describe, expect, it } from 'vitest';
import type { LightDef } from './types';
import { AMBIENT_FLOOR, dimmedAmbientLevel, lightShare, withBase } from './light-share';

const light = (id: string, intensity: number, extra: Partial<LightDef> = {}): LightDef => ({
  id,
  label: id,
  pos: [0, 0],
  color: '#ffffff',
  intensity,
  radius: 100,
  flicker: 0,
  ...extra,
});

describe('lightShare', () => {
  it('is 1 with the lights as the room set them', () => {
    expect(lightShare([light('lamp', 0.6, { base: 0.6 }), light('tv', 0.4, { base: 0.4 })])).toBe(1);
  });

  it('is 0 with every indoor light off', () => {
    expect(lightShare([light('lamp', 0, { base: 0.6 }), light('tv', 0, { base: 0.4 })])).toBe(0);
  });

  it('is the indoor light still on, as a share of the room\'s own', () => {
    expect(lightShare([light('lamp', 0, { base: 0.6 }), light('tv', 0.4, { base: 0.4 })])).toBeCloseTo(0.4);
  });

  it('caps at 1 when a light is turned up past its own level', () => {
    expect(lightShare([light('lamp', 1, { base: 0.5 }), light('tv', 0.4, { base: 0.4 })])).toBe(1);
  });

  it('leaves window light out: it neither dims nor brightens the room', () => {
    const lights = [light('lamp', 0, { base: 0.6 }), light('window', 0.8, { base: 0.8, outside: true })];
    expect(lightShare(lights)).toBe(0);
    expect(lightShare([light('lamp', 0.6, { base: 0.6 }), light('window', 0, { base: 0.8, outside: true })])).toBe(1);
  });

  it('is 1 in a room with no indoor light, or none lit to begin with', () => {
    expect(lightShare([light('window', 0, { base: 0.8, outside: true })])).toBe(1);
    expect(lightShare([light('lamp', 0, { base: 0 })])).toBe(1);
    expect(lightShare([])).toBe(1);
  });

  it('reads a light with no base (an old save) as at its own level', () => {
    expect(lightShare([light('lamp', 0.3), light('tv', 0, { base: 0.4 })])).toBeCloseTo(0.3 / 0.7);
  });
});

describe('dimmedAmbientLevel', () => {
  it('keeps the ambient with the lights on, and drops it to the floor with them off', () => {
    expect(AMBIENT_FLOOR).toBe(0.25);
    const on = [light('lamp', 0.6, { base: 0.6 })];
    const off = [light('lamp', 0, { base: 0.6 })];
    expect(dimmedAmbientLevel(0.5, on)).toBe(0.5);
    expect(dimmedAmbientLevel(0.5, off)).toBeCloseTo(0.125);
  });
});

describe('withBase', () => {
  it("records each light's intensity as its base", () => {
    expect(withBase([light('lamp', 0.6), light('tv', 0, { base: 0.4 })]).map((l) => l.base)).toEqual([0.6, 0]);
  });
});
