import { describe, expect, it } from 'vitest';
import type { RoomState } from './types';
import { applyPresetTo } from './presets';

const base: RoomState = {
  sceneId: 'r',
  atmosphere: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'rain', weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night' },
  lights: [
    { id: 'lamp', label: 'lamp', pos: [1, 1], color: '#ffb347', intensity: 0.6, radius: 100, flicker: 0 },
    { id: 'neon', label: 'neon', pos: [2, 2], color: '#ff3c8a', intensity: 0.8, radius: 100, flicker: 0.15 },
  ],
};

describe('applyPresetTo', () => {
  it('merges atmosphere fields and per-light overrides, leaving unnamed lights alone', () => {
    const next = applyPresetTo(base, { fog: 0.5, timeOfDay: 'late-night', lights: { neon: { color: '#ff2d4a', flicker: 0.5 } } });
    expect(next.atmosphere).toEqual({ ...base.atmosphere, fog: 0.5, timeOfDay: 'late-night' });
    expect(next.lights[0]).toEqual({ ...base.lights[0], base: 0.6 });
    expect(next.lights[1]).toEqual({ ...base.lights[1], color: '#ff2d4a', flicker: 0.5, base: 0.8 });
    expect(base.atmosphere.fog).toBe(0.2); // not mutated
  });

  it("sets each light's base to its level after the preset, so a lights-out mood isn't dimmed twice", () => {
    const dimmed = { ...base, lights: base.lights.map((l) => ({ ...l, base: 0.9 })) };
    const next = applyPresetTo(dimmed, { lights: { lamp: { intensity: 0.1 } } });
    expect(next.lights.map((l) => [l.intensity, l.base])).toEqual([[0.1, 0.1], [0.8, 0.8]]);
  });
});
