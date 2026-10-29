import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateScenes } from '../gen-placeholders';
import { SceneRegistry } from '../../server/src/scenes';
import type { SceneDef } from '../../shared/types';
import { blank } from './image';
import { buildSceneJson, installScene, promoteScene, sceneSoundFiles } from './install';
import type { ArtSpec } from './spec';
import { cached } from './cache';
import { tempDir } from '../../server/test/fixtures/temp-dir';

let root: string;
let scenesDir: string;
let source: SceneDef;
const spec = { scene: 'lowlight-intake', target: 'lowlight-intake-art' } as ArtSpec;

beforeEach(async () => {
  root = tempDir('art-install-');
  scenesDir = path.join(root, 'scenes');
  await generateScenes(scenesDir);
  source = (await SceneRegistry.load(scenesDir)).registry.get('lowlight-intake')!;
});

const snapshot = (dir: string) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(d.parentPath, d.name)).sort()
    .map((f) => [f, fs.readFileSync(f).toString('base64')]);

const layerFiles = (w: (p: number) => number) =>
  Object.fromEntries(source.layers.map((l) => [l.src, blank(w(l.parallax), 270)]));

describe('buildSceneJson', () => {
  it('copies lights, presets, defaults and the weather area, suffixes the name, keeps layer ids/parallax', () => {
    const json = buildSceneJson(source, spec, source.layers.map((def) => ({ def, emissive: def.id === 'room' ? 'room_e.png' : undefined, emissiveLights: def.id === 'room' ? { desk_lamp: 'room_e_desk_lamp.png' } : undefined })));
    expect(json.id).toBe('lowlight-intake-art');
    expect(json.name).toBe(`${source.name} (art)`);
    expect(json.lights).toEqual(source.lights);
    expect(json.presets).toEqual(source.presets);
    expect(json.defaults).toEqual(source.defaults);
    expect(json.weatherArea).toEqual(source.weatherArea);
    expect(json.weatherRegion).toBeUndefined();
    expect(json.layers.map((l) => [l.id, l.parallax])).toEqual(source.layers.map((l) => [l.id, l.parallax]));
    const room = json.layers.find((l) => l.id === 'room')!;
    expect(room.emissive).toBe('room_e.png');
    expect(room.emissiveLights).toEqual({ desk_lamp: 'room_e_desk_lamp.png' });
    expect(json.layers.find((l) => l.id === 'back')!.emissive).toBeUndefined();
  });

  it('an art-spec weatherRegion overrides the source scene one', () => {
    const json = buildSceneJson(source, { ...spec, weatherRegion: [250, 60, 190, 100] } as ArtSpec, source.layers.map((def) => ({ def })));
    expect(json.weatherRegion).toEqual([250, 60, 190, 100]);
    expect(json.weatherArea).toBeUndefined();
  });

  it('buildSceneJson keeps the source weatherArea', () => {
    const area: [number, number][][] = [[[10, 10], [60, 10], [60, 40]]];
    const json = buildSceneJson({ ...source, weatherArea: area, weatherRegion: undefined }, spec, source.layers.map((def) => ({ def })));
    expect(json.weatherArea).toEqual(area);
    expect(json.weatherRegion).toBeUndefined();
  });

  it('carries the source scene sound (indoor, bed, music)', () => {
    const withSound: SceneDef = { ...source, sound: { indoor: true, bed: { src: 'sound/bed.ogg', level: 0.4 }, music: { songs: ['nix-theme.ogg'] } } };
    expect(buildSceneJson(withSound, spec, withSound.layers.map((def) => ({ def }))).sound).toEqual(withSound.sound);
    expect(buildSceneJson({ ...source, sound: undefined }, spec, source.layers.map((def) => ({ def }))).sound).toBeUndefined();
  });
});

describe('sceneSoundFiles', () => {
  it("copies the bed so the rebuilt room isn't left on the hum fallback (Review Focus 5)", () => {
    const dir = path.join(root, 'src-room');
    fs.mkdirSync(path.join(dir, 'sound'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sound', 'bed.ogg'), 'BED');
    const withBed: SceneDef = { ...source, sound: { bed: { src: 'sound/bed.ogg' } } };
    expect(sceneSoundFiles(withBed, dir)).toEqual({ 'sound/bed.ogg': Buffer.from('BED') });
  });

  it("copies the room's one-off sounds too, so new art keeps them (final review)", () => {
    const dir = path.join(root, 'src-room');
    fs.mkdirSync(path.join(dir, 'sound', 'keep'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sound', 'bed.ogg'), 'BED');
    fs.writeFileSync(path.join(dir, 'sound', 'keep', 'door.ogg'), 'DOOR');
    const withSounds: SceneDef = {
      ...source,
      sound: {
        bed: { src: 'sound/bed.ogg' },
        sounds: [
          { name: 'door', src: 'sound/keep/door.ogg', onEntry: true },
          { name: 'door-loud', src: 'sound/keep/door.ogg', level: 0.9 },
          { name: 'gone', src: 'sound/keep/gone.ogg' },
        ],
      },
    };
    expect(sceneSoundFiles(withSounds, dir)).toEqual({ 'sound/bed.ogg': Buffer.from('BED'), 'sound/keep/door.ogg': Buffer.from('DOOR') });
  });

  it('nothing to copy without a bed, or when the bed file is missing', () => {
    expect(sceneSoundFiles({ ...source, sound: undefined }, root)).toEqual({});
    expect(sceneSoundFiles({ ...source, sound: { bed: { src: 'sound/missing.ogg' } } }, root)).toEqual({});
  });
});

describe('installScene (Review Focus 5)', () => {
  it('a scene that fails validation returns errors and leaves scenes/ byte-identical', async () => {
    const before = snapshot(scenesDir);
    const json = buildSceneJson(source, spec, source.layers.map((def) => ({ def })));
    const files = layerFiles(() => 100); // wrong sizes
    const errors = await installScene(scenesDir, path.join(root, 'staging'), 'lowlight-intake-art', files, json);
    expect(errors.length).toBeGreaterThan(0);
    expect(snapshot(scenesDir)).toEqual(before);
  });

  it('a valid scene is installed and loads with no errors', async () => {
    const json = buildSceneJson(source, spec, source.layers.map((def) => ({ def })));
    const files = layerFiles((p) => (p > 0 ? 480 + Math.ceil(p * 48) : 480));
    expect(await installScene(scenesDir, path.join(root, 'staging'), 'lowlight-intake-art', files, json)).toEqual([]);
    const { registry, errors } = await SceneRegistry.load(scenesDir);
    expect(errors).toEqual([]);
    expect(registry.get('lowlight-intake-art')).toBeDefined();
  });

  const sized = () => layerFiles((p) => (p > 0 ? 480 + Math.ceil(p * 48) : 480));
  const withSong = () => buildSceneJson({ ...source, sound: { music: { songs: ['nix-theme.ogg'] } } }, spec, source.layers.map((def) => ({ def })));

  it("a room with a song installs when the pack's _music has it (final review: Critical 1)", async () => {
    fs.mkdirSync(path.join(scenesDir, '_music'), { recursive: true });
    fs.writeFileSync(path.join(scenesDir, '_music', 'nix-theme.ogg'), 'ogg');
    expect(await installScene(scenesDir, path.join(root, 'staging'), 'lowlight-intake-art', sized(), withSong())).toEqual([]);
    const { registry, errors } = await SceneRegistry.load(scenesDir);
    expect(errors).toEqual([]);
    expect(registry.get('lowlight-intake-art')!.sound!.music).toEqual({ songs: ['nix-theme.ogg'] });
    expect(fs.existsSync(path.join(scenesDir, 'lowlight-intake-art', '_music'))).toBe(false);
  });

  it('a song missing from the pack is refused with the reason, not just "no valid scenes"', async () => {
    const before = snapshot(scenesDir);
    const errors = await installScene(scenesDir, path.join(root, 'staging'), 'lowlight-intake-art', sized(), withSong());
    expect(errors.some((e) => e.includes("music 'nix-theme.ogg' is not in"))).toBe(true);
    expect(snapshot(scenesDir)).toEqual(before);
  });
});

describe('promoteScene', () => {
  it('moves the original aside, renames the target to the source id, and removes the target folder', async () => {
    const json = buildSceneJson(source, spec, source.layers.map((def) => ({ def })));
    await installScene(scenesDir, path.join(root, 'staging'), 'lowlight-intake-art', layerFiles((p) => (p > 0 ? 480 + Math.ceil(p * 48) : 480)), json);
    const work = path.join(root, 'work');
    const { replacedTo } = promoteScene(scenesDir, work, 'lowlight-intake', 'lowlight-intake-art');
    expect(fs.existsSync(path.join(replacedTo, 'scene.json'))).toBe(true);
    expect(replacedTo.startsWith(path.join(work, 'replaced-'))).toBe(true);
    expect(fs.existsSync(path.join(scenesDir, 'lowlight-intake-art'))).toBe(false);
    const promoted = JSON.parse(fs.readFileSync(path.join(scenesDir, 'lowlight-intake', 'scene.json'), 'utf8'));
    expect(promoted.id).toBe('lowlight-intake');
    expect(promoted.name).toBe(source.name);
    expect((await SceneRegistry.load(scenesDir)).errors).toEqual([]);
  });
});

describe('cached', () => {
  it('runs once for the same inputs, re-runs for changed inputs or force', async () => {
    const work = tempDir('art-cache-');
    let runs = 0;
    const run = async () => (++runs, Buffer.from('x'));
    await cached(work, 'depth', ['a'], run, { force: false });
    await cached(work, 'depth', ['a'], run, { force: false });
    expect(runs).toBe(1);
    await cached(work, 'depth', ['b'], run, { force: false });
    expect(runs).toBe(2);
    await cached(work, 'depth', ['b'], run, { force: true });
    expect(runs).toBe(3);
  });
});
