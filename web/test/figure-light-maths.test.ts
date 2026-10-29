import { describe, expect, it } from 'vitest';
import { ambientTerm, frameFor, LIGHT_GAIN, lightAt, MAX_LIGHTS, SHADER_LIGHTS, type LightingFrame } from '../src/renderer/lighting';
import { screenToRender } from '../src/renderer/stage';

const F = (lights: LightingFrame['lights'], ambient: [number, number, number] = [0.5, 0.4, 0.3]): LightingFrame => ({ ambient, lights });

describe('lightAt (the shader formula at one point)', () => {
  it('ambient only: the ambient everywhere', () => {
    expect(lightAt([10, 10], F([]))).toEqual([0.5, 0.4, 0.3]);
  });

  it('a light adds colour × falloff², full at its centre, none at or past its radius', () => {
    const f = F([{ pos: [100, 100], radius: 50, rgb: [1, 0.5, 0] }], [0, 0, 0]);
    expect(lightAt([100, 100], f)).toEqual([1, 0.5, 0]);
    expect(lightAt([150, 100], f)).toEqual([0, 0, 0]);
    expect(lightAt([400, 100], f)).toEqual([0, 0, 0]);
    // smoothstep(0, 50, 25) = 0.5, so (1 − 0.5)² = 0.25
    expect(lightAt([125, 100], f)[0]).toBeCloseTo(0.25, 5);
  });

  it('two lights add', () => {
    const f = F(
      [
        { pos: [0, 0], radius: 10, rgb: [0.2, 0, 0] },
        { pos: [0, 0], radius: 10, rgb: [0.1, 0.3, 0] },
      ],
      [0, 0, 0],
    );
    const v = lightAt([0, 0], f);
    expect(v[0]).toBeCloseTo(0.3, 5);
    expect(v[1]).toBeCloseTo(0.3, 5);
  });
});

describe('frameFor (what the filter shades with this frame)', () => {
  it('ambient term plus the lift; each light colour × intensity × LIGHT_GAIN at its position', () => {
    const atmo = { ambient: '#3060ff', ambientLevel: 0.5, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' } as const;
    const f = frameFor(atmo, [{ pos: [10, 20], color: '#ff8000', intensity: 0.5, radius: 40 }], 0.1);
    const amb = ambientTerm('#3060ff', 0.5);
    for (let i = 0; i < 3; i++) expect(f.ambient[i]).toBeCloseTo(amb[i] + 0.1, 6);
    expect(f.lights).toHaveLength(1);
    expect(f.lights[0].pos).toEqual([10, 20]);
    expect(f.lights[0].radius).toBe(40);
    expect(f.lights[0].rgb[0]).toBeCloseTo(0.5 * LIGHT_GAIN, 5);
    expect(f.lights[0].rgb[2]).toBeCloseTo(0, 5);
  });

  it("shades a room's 8 lights plus one more (a passing light), and no more", () => {
    expect(SHADER_LIGHTS).toBe(MAX_LIGHTS + 1);
    const atmo = { ambient: '#3060ff', ambientLevel: 0.5, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' } as const;
    const many = Array.from({ length: 12 }, (_, i) => ({ pos: [i, 0] as [number, number], color: '#ffffff', intensity: 1, radius: 10 }));
    expect(frameFor(atmo, many).lights).toHaveLength(MAX_LIGHTS + 1);
  });
});

describe('screenToRender', () => {
  it('undoes the view: device px, minus its offset, over its scale', () => {
    expect(screenToRender(100, 50, 2, { scale: 4, x: 40, y: 0 })).toEqual([40, 25]);
    expect(screenToRender(0, 0, 1, { scale: 2, x: 10, y: 6 })).toEqual([-5, -3]);
  });
});
