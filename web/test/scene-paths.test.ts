import { describe, expect, it } from 'vitest';
import { soundMix } from '../src/audio/mix';
import { effectsSeed, musicDir, sceneDir } from '../src/scene-paths';
import { idSeed } from '../src/renderer/glow-alpha';
import type { SceneDef } from '../../shared/types';

const room = (o: Partial<SceneDef> = {}) =>
  ({ id: 'ribbon/noodle-stall', district: 'ribbon', folder: 'noodle-stall', name: 'Noodle Stall', description: '', resolution: [480, 270], layers: [], lights: [], presets: {}, defaults: {}, ...o }) as unknown as SceneDef;

describe('where a room\'s files are', () => {
  it('a city room: its own district and folder, whatever base was given', () => {
    expect(sceneDir(room(), '/scenes/')).toBe('/scenes/ribbon/noodle-stall/');
    expect(musicDir(room(), '/scenes/')).toBe('/scenes/ribbon/');
  });
  it('a scene from one district (the splash): the base it came with', () => {
    const splash = room({ id: 'splash', district: undefined, folder: undefined });
    expect(sceneDir(splash, '/scenes/lowlight/')).toBe('/scenes/lowlight/splash/');
    expect(musicDir(splash, '/scenes/lowlight/')).toBe('/scenes/lowlight/');
  });
  it('the sound bed comes from the room\'s own folder', () => {
    const r = room({ sound: { bed: { src: 'bed.ogg' } } } as never);
    const mix = soundMix({ sceneId: r.id, lights: [], atmosphere: { weather: 'none', weatherLevel: 0, fog: 0 } } as never, r, '/scenes/');
    expect(mix.bed!.url).toBe('/scenes/ribbon/noodle-stall/bed.ogg');
  });
  it('a room looks as it did: its effects are seeded from its folder (Review Focus 3)', () => {
    expect(effectsSeed(room())).toBe(idSeed('noodle-stall'));
  });
});
