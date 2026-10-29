import { describe, expect, it } from 'vitest';
import type { RoomState } from '../../shared/types';
import { shadedAtmosphere } from '../src/renderer/lighting';

const room = (lamp: number, window: number): RoomState => ({
  sceneId: 'r',
  lights: [
    { id: 'lamp', label: 'lamp', pos: [0, 0], color: '#ffb347', intensity: lamp, radius: 100, flicker: 0, base: 0.6 },
    { id: 'window', label: 'window', pos: [0, 0], color: '#8a5cff', intensity: window, radius: 100, flicker: 0, base: 0.8, outside: true },
  ],
  atmosphere: { ambient: '#1a1030', ambientLevel: 0.5, weather: 'rain', weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night' },
});

describe('shadedAtmosphere', () => {
  it('is the room as it is with its own lights on', () => {
    expect(shadedAtmosphere(room(0.6, 0.8))).toEqual(room(0.6, 0.8).atmosphere);
  });

  it('dims the ambient to the floor with the indoor lights off, whatever the window does', () => {
    expect(shadedAtmosphere(room(0, 0.8)).ambientLevel).toBeCloseTo(0.125);
    expect(shadedAtmosphere(room(0, 0)).ambientLevel).toBeCloseTo(0.125);
    expect(shadedAtmosphere(room(0, 0.8)).fog).toBe(0.2);
  });
});
