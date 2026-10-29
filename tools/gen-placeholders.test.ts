import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';
import { SceneRegistry } from '../server/src/scenes';
import type { SceneDef } from '../shared/types';
import { generateScenes } from './gen-placeholders';
import { PixelCanvas, mulberry32 } from './pixel';
import { tempDir } from '../server/test/fixtures/temp-dir';

describe('PixelCanvas', () => {
  it('writes set/fillRect pixels into a PNG and clips out-of-bounds writes', () => {
    const c = new PixelCanvas(4, 3);
    c.fillRect(-2, -2, 4, 4, [10, 20, 30, 255]);
    c.set(3, 2, [200, 100, 50, 128]);
    c.set(99, 99, [1, 2, 3, 4]);
    const png = PNG.sync.read(c.toPNG());
    expect([png.width, png.height]).toEqual([4, 3]);
    const at = (x: number, y: number) => [...png.data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
    expect(at(0, 0)).toEqual([10, 20, 30, 255]);
    expect(at(1, 1)).toEqual([10, 20, 30, 255]);
    expect(at(2, 0)).toEqual([0, 0, 0, 0]);
    expect(at(3, 2)).toEqual([200, 100, 50, 128]);
  });
});

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(8)()).not.toBe(xs[0]);
  });
});

describe('generateScenes', () => {
  let dirA: string;
  let dirB: string;

  beforeAll(async () => {
    dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-gen-a-'));
    dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-gen-b-'));
    await generateScenes(dirA);
    await generateScenes(dirB);
  });

  afterAll(() => {
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  });

  const readPng = (dir: string, id: string, file: string) =>
    PNG.sync.read(fs.readFileSync(path.join(dir, id, file)));

  it('produces exactly the three launch scenes, all valid', async () => {
    const { registry, errors } = await SceneRegistry.load(dirA);
    expect(errors).toEqual([]);
    expect(registry.list().map((s) => s.id)).toEqual([
      'lowlight-intake',
      'noodle-stall',
      'ribbon-rooftop',
    ]);
  });

  it('sizes every layer 270 tall and 480 + ceil(parallax*48) wide, emissive matching its layer', async () => {
    const { registry } = await SceneRegistry.load(dirA);
    for (const scene of registry.list()) {
      for (const layer of scene.layers) {
        const png = readPng(dirA, scene.id, layer.src);
        const expectedWidth = layer.parallax > 0 ? 480 + Math.ceil(layer.parallax * 48) : 480;
        expect(png.height, `${scene.id}/${layer.src}`).toBe(270);
        expect(png.width, `${scene.id}/${layer.src}`).toBe(expectedWidth);
        if (layer.emissive) {
          const em = readPng(dirA, scene.id, layer.emissive);
          expect([em.width, em.height], `${scene.id}/${layer.emissive}`).toEqual([png.width, png.height]);
        }
      }
    }
  });

  it('keeps emissive maps sparse: some self-lit pixels, mostly transparent', async () => {
    const { registry } = await SceneRegistry.load(dirA);
    for (const scene of registry.list()) {
      for (const layer of scene.layers.filter((l) => l.emissive)) {
        const em = readPng(dirA, scene.id, layer.emissive!);
        let opaque = 0;
        for (let i = 3; i < em.data.length; i += 4) if (em.data[i] > 0) opaque++;
        const total = em.width * em.height;
        expect(opaque, `${scene.id}/${layer.emissive}`).toBeGreaterThan(0);
        expect(opaque / total, `${scene.id}/${layer.emissive}`).toBeLessThan(0.25);
      }
    }
  });

  it('uses the specified lights, defaults and presets', async () => {
    const { registry } = await SceneRegistry.load(dirA);
    const brief = (id: string) => registry.get(id) as SceneDef;
    const lights = (s: SceneDef) => s.lights.map((l) => [l.id, l.color, l.intensity, l.flicker]);

    const intake = brief('lowlight-intake');
    expect(intake.name).toBe('Lowlight Intake');
    // Rain only through the window glass; the outdoor scenes rain over the whole frame.
    // (generated as weatherRegion; the schema loads it as one shape)
    expect(intake.weatherArea).toEqual([[[266, 67], [430, 67], [430, 157], [266, 157]]]);
    expect(brief('noodle-stall').weatherArea).toBeUndefined();
    expect(brief('ribbon-rooftop').weatherArea).toBeUndefined();
    expect(intake.layers.map((l) => [l.id, l.parallax])).toEqual([['back', 0.1], ['room', 0.4], ['fg', 1]]);
    expect(lights(intake)).toEqual([
      ['desk_lamp', '#ffb347', 0.6, 0],
      ['window_neon', '#ff3c8a', 0.8, 0.15],
      ['monitor', '#7fe9ff', 0.35, 0.05],
    ]);
    expect(intake.defaults).toEqual({
      ambient: '#1a1030', ambientLevel: 0.35, weather: 'rain', weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night',
    });
    expect(Object.keys(intake.presets)).toEqual(['after-hours', 'storm', 'closing', 'late', 'quiet', 'tense']);

    const stall = brief('noodle-stall');
    expect(stall.name).toBe('Noodle Stall');
    expect(stall.layers.map((l) => [l.id, l.parallax])).toEqual([['back', 0.15], ['mid', 0.5], ['fg', 1]]);
    expect(lights(stall)).toEqual([
      ['stall_lantern', '#ff8a3c', 0.7, 0.05],
      ['sign_noodles', '#ff2d4a', 0.9, 0.2],
      ['sign_upper', '#3ff0ff', 0.6, 0.1],
    ]);
    expect(stall.defaults).toEqual({
      ambient: '#241020', ambientLevel: 0.4, weather: 'rain', weatherLevel: 0.4, fog: 0.4, timeOfDay: 'late-night',
    });
    expect(Object.keys(stall.presets)).toEqual(['rush', 'last-call', 'late', 'quiet', 'tense']);

    const roof = brief('ribbon-rooftop');
    expect(roof.name).toBe('Ribbon Rooftop');
    expect(roof.layers.map((l) => [l.id, l.parallax])).toEqual([
      ['sky', 0.02], ['far', 0.15], ['mid', 0.4], ['fg', 1],
    ]);
    expect(lights(roof)).toEqual([
      ['billboard', '#9b5cff', 0.7, 0.1],
      ['sign_below', '#ff3c8a', 0.6, 0.15],
      ['beacon', '#ff2020', 0.5, 0],
    ]);
    expect(roof.defaults).toEqual({
      ambient: '#0d0c24', ambientLevel: 0.3, weather: 'rain', weatherLevel: 0.8, fog: 0.3, timeOfDay: 'night',
    });
    expect(roof.presets.dawn).toEqual({ timeOfDay: 'dawn', ambient: '#3a2a4a', ambientLevel: 0.5 });

    for (const scene of registry.list()) {
      for (const light of scene.lights) {
        expect(light.radius).toBeGreaterThanOrEqual(80);
        expect(light.radius).toBeLessThanOrEqual(200);
      }
    }
  });

  it('is deterministic: two runs give byte-identical files', () => {
    const list = (dir: string) =>
      fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
        .sort();
    const files = list(dirA);
    expect(files).toEqual(list(dirB));
    expect(files.filter((f) => f.endsWith('.png')).length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      expect(fs.readFileSync(path.join(dirA, f)).equals(fs.readFileSync(path.join(dirB, f))), f).toBe(true);
    }
  });
});

describe('generateScenes default pack', () => {
  it('writes workspace and rooftop, valid, with mood presets and no names from the Ribbon', async () => {
    const out = tempDir('gen-default-');
    await generateScenes(out, 'default');
    expect(fs.readdirSync(out).sort()).toEqual(['rooftop', 'workspace']);
    const { registry, errors } = await SceneRegistry.load(out);
    expect(errors).toEqual([]);
    for (const scene of registry.list()) {
      for (const p of ['late', 'quiet', 'tense']) expect(Object.keys(scene.presets)).toContain(p);
      const text = fs.readFileSync(path.join(out, scene.id, 'scene.json'), 'utf8');
      expect(text).not.toMatch(/halcyon|ribbon|nix|lowlight|noodle/i);
    }
  });
});

describe('generateScenes lowlight pack', () => {
  it("generates the lowlight pack's splash: four layers, outdoor rain defaults, no presets", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splash-'));
    await generateScenes(dir, 'lowlight');
    const { registry, errors } = await SceneRegistry.load(dir);
    expect(errors).toEqual([]);
    const s = registry.get('splash')!;
    expect(s.layers.map((l) => l.id)).toEqual(['sky', 'far', 'mid', 'fg']);
    expect(s.lights.map((l) => l.id).sort()).toEqual(['spire_beacon', 'street_signs', 'tower_sign']);
    expect(s.defaults).toMatchObject({ weather: 'rain', weatherLevel: 0.35, fog: 0.25, timeOfDay: 'late-night' });
    expect(s.presets).toEqual({});
    expect(s.sound?.indoor).not.toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
