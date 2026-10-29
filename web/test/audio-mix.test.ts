import { describe, expect, it } from 'vitest';
import type { Atmosphere, LightDef, RoomState, SceneDef } from '../../shared/types';
import { SCENE_MUSIC_LEVEL, SILENT, songUrl, soundMix } from '../src/audio/mix';
import { idSeed } from '../src/renderer/glow-alpha';

const light = (o: Partial<LightDef> & { id: string }): LightDef => ({ label: o.id, pos: [0, 0], color: '#ffffff', intensity: 0.5, radius: 50, flicker: 0, ...o });
const atmo = (o: Partial<Atmosphere> = {}): Atmosphere => ({ ambient: '#000000', ambientLevel: 0.3, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night', ...o });
const scene = (o: Partial<SceneDef> = {}): SceneDef => ({
  id: 'room', name: 'Room', description: '', resolution: [480, 270], layers: [], lights: [], defaults: atmo(), presets: {}, ...o,
});
const state = (s: SceneDef, a: Partial<Atmosphere> = {}, lights = s.lights): RoomState => ({ sceneId: s.id, lights, atmosphere: atmo(a) });
const mix = (s: SceneDef, a: Partial<Atmosphere> = {}, lights?: LightDef[]) => soundMix(state(s, a, lights ?? s.lights), s, '/scenes/pack/');

describe('songUrl', () => {
  it("builds the pack's _music url", () => {
    expect(songUrl('/scenes/p/', 'a b.ogg')).toBe('/scenes/p/_music/a%20b.ogg');
    expect(SCENE_MUSIC_LEVEL).toBe(0.3);
  });
});

describe('soundMix: weather', () => {
  it('rain follows weatherLevel^0.8 outdoors, ×0.6 and muffled indoors; no rain otherwise', () => {
    expect(mix(scene(), { weather: 'rain', weatherLevel: 0.7 }).rain).toMatchObject({ level: 0.7 ** 0.8, indoor: false });
    expect(mix(scene({ sound: { indoor: true } }), { weather: 'rain', weatherLevel: 0.7 }).rain).toMatchObject({ level: 0.6 * 0.7 ** 0.8, indoor: true });
    expect(mix(scene(), { weather: 'snow', weatherLevel: 0.9 }).rain.level).toBe(0);
  });

  it('outdoors always carries a faint wind; dust, snow and ash set their own', () => {
    expect(mix(scene()).wind).toEqual({ level: 0.15, gust: 0.3, crackle: 0, indoor: false });
    expect(mix(scene(), { weather: 'dust', weatherLevel: 0.8 }).wind).toMatchObject({ level: 0.8, gust: 1 });
    expect(mix(scene(), { weather: 'snow', weatherLevel: 0.5 }).wind.level).toBeCloseTo(0.15);
    expect(mix(scene(), { weather: 'snow', weatherLevel: 1 }).wind.level).toBeCloseTo(0.3);
    expect(mix(scene(), { weather: 'ash', weatherLevel: 0.6 }).wind).toMatchObject({ crackle: 0.6 });
    expect(mix(scene(), { weather: 'ash', weatherLevel: 0.6 }).wind.level).toBeCloseTo(0.24);
  });

  it('indoors has no wind floor, and weather wind comes through at 30%', () => {
    expect(mix(scene({ sound: { indoor: true } })).wind.level).toBe(0);
    expect(mix(scene({ sound: { indoor: true } }), { weather: 'snow', weatherLevel: 0.5 }).wind).toMatchObject({ indoor: true });
    expect(mix(scene({ sound: { indoor: true } }), { weather: 'snow', weatherLevel: 0.5 }).wind.level).toBeCloseTo(0.3 * 0.15);
  });

  it('fog cuts the highs up to 9 dB', () => {
    expect(mix(scene()).fogDb).toBe(-0);
    expect(mix(scene(), { fog: 0.5 }).fogDb).toBeCloseTo(-4.5);
    expect(mix(scene(), { fog: 1 }).fogDb).toBeCloseTo(-9);
  });
});

describe('soundMix: recorded rain blend', () => {
  it('heavy weight rises smoothly from light (≤0.3) to heavy (≥0.8) rain', () => {
    const heavy = (weatherLevel: number) => mix(scene(), { weather: 'rain', weatherLevel }).rain.heavy;
    expect(heavy(0.2)).toBe(0);
    expect(heavy(0.3)).toBe(0);
    expect(heavy(0.55)).toBeCloseTo(0.5);
    expect(heavy(0.8)).toBe(1);
    expect(heavy(1)).toBe(1);
    expect(mix(scene(), { weather: 'snow', weatherLevel: 1 }).rain.heavy).toBe(0);
  });
});

describe('soundMix: room tone', () => {
  it('hum is the scene level with no bed; a bed silences it and keeps a fallback', () => {
    expect(mix(scene({ sound: { hum: 0.3 } })).hum).toEqual({ level: 0.3, fallback: 0.3 });
    expect(mix(scene({ sound: { hum: 0.3 } })).bed).toBeNull();
    const withBed = mix(scene({ id: 'lowlight intake', sound: { bed: { src: 'sound/tone.ogg' } } }));
    expect(withBed.bed).toEqual({ url: '/scenes/pack/lowlight%20intake/sound/tone.ogg', level: 0.5 });
    expect(withBed.hum).toEqual({ level: 0, fallback: 0.3 });
    expect(mix(scene({ sound: { hum: 0.2, bed: { src: 'a.ogg', level: 0.8 } } })).hum).toEqual({ level: 0, fallback: 0.2 });
    expect(mix(scene()).hum).toEqual({ level: 0, fallback: 0.3 });
  });
});

describe('soundMix: neon', () => {
  const sign = light({ id: 'sign', pos: [0, 50], intensity: 0.5, flicker: 0.2, sound: 'neon' });
  const lamp = light({ id: 'lamp', pos: [240, 50], intensity: 0.9 });
  const far = light({ id: 'far', pos: [480, 50], intensity: 1, sound: 'neon' });

  it('only tagged lights buzz, at 0.12 × the current intensity, panned by position, seeded like the glow', () => {
    const s = scene({ lights: [sign, lamp, far] });
    const now = [{ ...sign, intensity: 0.25 }, lamp, far]; // the state's current intensity, not the scene default
    const neon = mix(s, {}, now).neon;
    expect(neon).toEqual([
      { id: 'sign', level: 0.12 * 0.25, flicker: 0.2, seed: idSeed('sign'), pan: -0.6 },
      { id: 'far', level: 0.12, flicker: 0, seed: idSeed('far'), pan: 0.6 },
    ]);
  });

  it('caps the neon voices at 8', () => {
    const many = Array.from({ length: 9 }, (_, i) => light({ id: `s${i}`, sound: 'neon' }));
    expect(mix(scene({ lights: many })).neon).toHaveLength(8);
  });
});

describe('SILENT', () => {
  it('is all quiet', () => {
    expect(SILENT.rain.level + SILENT.wind.level + SILENT.hum.level).toBe(0);
    expect(SILENT.bed).toBeNull();
    expect(SILENT.neon).toEqual([]);
  });
});
