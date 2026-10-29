import { describe, expect, it } from 'vitest';
import { lerpOklab } from '../../shared/color';
import type { RoomState } from '../../shared/types';
import { TweenedState } from '../src/renderer/tween';

function state(over: {
  intensity?: number;
  color?: string;
  ambient?: string;
  ambientLevel?: number;
  weather?: RoomState['atmosphere']['weather'];
  weatherLevel?: number;
  timeOfDay?: RoomState['atmosphere']['timeOfDay'];
  sceneId?: string;
} = {}): RoomState {
  return {
    sceneId: over.sceneId ?? 'lowlight-intake',
    lights: [
      {
        id: 'lamp',
        label: 'lamp',
        pos: [10, 20],
        color: over.color ?? '#ff0000',
        intensity: over.intensity ?? 0,
        radius: 100,
        flicker: 0,
      },
    ],
    atmosphere: {
      ambient: over.ambient ?? '#000000',
      ambientLevel: over.ambientLevel ?? 0,
      weather: over.weather ?? 'rain',
      weatherLevel: over.weatherLevel ?? 0.5,
      fog: 0,
      timeOfDay: over.timeOfDay ?? 'night',
    },
  };
}

describe('TweenedState', () => {
  it('returns the initial state before any retarget and is settled', () => {
    const s = new TweenedState(state({ intensity: 0.3 }));
    expect(s.sample(0).lights[0].intensity).toBe(0.3);
    expect(s.settled(0)).toBe(true);
  });

  it('eases from start to target with ease-in-out', () => {
    const s = new TweenedState(state({ intensity: 0, ambientLevel: 0 }));
    s.retarget(state({ intensity: 1, ambientLevel: 1 }), 2, 10);
    expect(s.sample(10).lights[0].intensity).toBe(0);
    expect(s.sample(12).lights[0].intensity).toBe(1);
    expect(s.sample(13).lights[0].intensity).toBe(1);
    const mid = s.sample(11).lights[0].intensity;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // ease-in-out: slow at both ends
    expect(s.sample(10.5).lights[0].intensity).toBeLessThan(0.25);
    expect(s.sample(11.5).lights[0].intensity).toBeGreaterThan(0.75);
    expect(s.sample(11).atmosphere.ambientLevel).toBeCloseTo(0.5, 6);
    expect(s.settled(11)).toBe(false);
    expect(s.settled(12)).toBe(true);
  });

  it('interpolates colors through OKLab', () => {
    const s = new TweenedState(state({ color: '#ff0000', ambient: '#000000' }));
    s.retarget(state({ color: '#0000ff', ambient: '#ffffff' }), 2, 0);
    expect(s.sample(1).lights[0].color).toBe(lerpOklab('#ff0000', '#0000ff', 0.5));
    expect(s.sample(1).atmosphere.ambient).toBe(lerpOklab('#000000', '#ffffff', 0.5));
    expect(s.sample(2).lights[0].color).toBe('#0000ff');
  });

  it('snaps immediately with duration 0', () => {
    const s = new TweenedState(state({ intensity: 0 }));
    s.retarget(state({ intensity: 0.8 }), 0, 5);
    expect(s.sample(5).lights[0].intensity).toBe(0.8);
    expect(s.settled(5)).toBe(true);
  });

  it('retargets mid-tween from the current sampled value, not the old start or end', () => {
    const s = new TweenedState(state({ intensity: 0 }));
    s.retarget(state({ intensity: 1 }), 2, 0);
    const mid = s.sample(1).lights[0].intensity;
    s.retarget(state({ intensity: 0.2 }), 2, 1);
    const after = s.sample(1).lights[0].intensity;
    expect(after).toBeCloseTo(mid, 6);
    expect(after).not.toBe(0);
    expect(after).not.toBe(1);
    expect(s.sample(3).lights[0].intensity).toBeCloseTo(0.2, 6);
  });

  it('switches weather at the start of the tween and fades its level in from 0', () => {
    const s = new TweenedState(state({ weather: 'rain', weatherLevel: 0.6 }));
    s.retarget(state({ weather: 'snow', weatherLevel: 0.8 }), 2, 0);
    expect(s.sample(0).atmosphere.weather).toBe('snow');
    expect(s.sample(0).atmosphere.weatherLevel).toBe(0);
    const mid = s.sample(1).atmosphere.weatherLevel;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.8);
    expect(s.sample(2).atmosphere.weatherLevel).toBeCloseTo(0.8, 6);
  });

  it('tweens weather level normally when the weather kind is unchanged', () => {
    const s = new TweenedState(state({ weather: 'rain', weatherLevel: 0.6 }));
    s.retarget(state({ weather: 'rain', weatherLevel: 0.8 }), 2, 0);
    expect(s.sample(0).atmosphere.weatherLevel).toBeCloseTo(0.6, 6);
  });

  it('switches timeOfDay at the start and fades its tint level in from 0', () => {
    const s = new TweenedState(state({ timeOfDay: 'night' }));
    expect(s.timeOfDayLevel(0)).toBe(1);
    s.retarget(state({ timeOfDay: 'dawn' }), 2, 0);
    expect(s.sample(0).atmosphere.timeOfDay).toBe('dawn');
    expect(s.timeOfDayLevel(0)).toBe(0);
    const mid = s.timeOfDayLevel(1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(s.timeOfDayLevel(2)).toBe(1);
  });

  it('keeps the timeOfDay level at 1 when timeOfDay does not change', () => {
    const s = new TweenedState(state({ timeOfDay: 'night' }));
    s.retarget(state({ timeOfDay: 'night', intensity: 1 }), 2, 0);
    expect(s.timeOfDayLevel(0)).toBe(1);
  });

  it('continues a timeOfDay fade smoothly when retargeted mid-fade', () => {
    const s = new TweenedState(state({ timeOfDay: 'night' }));
    s.retarget(state({ timeOfDay: 'dawn' }), 2, 0);
    const mid = s.timeOfDayLevel(1);
    s.retarget(state({ timeOfDay: 'dawn', intensity: 1 }), 2, 1);
    expect(s.timeOfDayLevel(1)).toBeCloseTo(mid, 6);
    expect(s.timeOfDayLevel(3)).toBe(1);
  });

  it('does not tween across a sceneId change (the renderer reloads the scene)', () => {
    const s = new TweenedState(state({ intensity: 0, sceneId: 'a' }));
    s.retarget(state({ intensity: 1, sceneId: 'b' }), 2, 0);
    expect(s.sample(0).sceneId).toBe('b');
    expect(s.sample(0).lights[0].intensity).toBe(1);
    expect(s.settled(0)).toBe(true);
  });

  it('fades in lights that did not exist in the previous state', () => {
    const from = state({ intensity: 0.5 });
    const to = state({ intensity: 0.5 });
    to.lights.push({ ...to.lights[0], id: 'new', intensity: 1 });
    const s = new TweenedState(from);
    s.retarget(to, 2, 0);
    const now = s.sample(0);
    expect(now.lights.map((l) => l.id)).toEqual(['lamp', 'new']);
    expect(now.lights[1].intensity).toBe(0);
    expect(s.sample(2).lights[1].intensity).toBe(1);
  });

  it('does not mutate the states it was given', () => {
    const target = state({ intensity: 1 });
    const snapshot = JSON.stringify(target);
    const s = new TweenedState(state({ intensity: 0 }));
    s.retarget(target, 2, 0);
    s.sample(1);
    expect(JSON.stringify(target)).toBe(snapshot);
  });

  it("eases a light's base with its level, so a brighter preset doesn't dip the room on the way up", () => {
    const from = state({ intensity: 0.2 });
    from.lights[0].base = 0.2;
    const to = state({ intensity: 0.8 });
    to.lights[0].base = 0.8;
    const s = new TweenedState(from);
    s.retarget(to, 2, 10);
    const mid = s.sample(11).lights[0];
    expect(mid.base).toBeCloseTo(mid.intensity);
    expect(s.sample(12).lights[0].base).toBe(0.8);
  });
});
