import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { audioStatus } from '../../tools/release/credits';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';
import { loadPacks, SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { sceneSchema } from '../../shared/scene-schema';
import type { SceneDef } from '../../shared/types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-scenes-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writePng(filePath: string, width: number, height: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width, height });
  png.data.fill(255);
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function writeCorrupt(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from('not actually a png'));
}

function writeScene(folder: string, scene: unknown): string {
  const sceneDir = path.join(tmpDir, folder);
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.writeFileSync(path.join(sceneDir, 'scene.json'), JSON.stringify(scene, null, 2));
  return sceneDir;
}

function validScene(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'forest',
    name: 'Forest',
    description: 'A quiet forest clearing',
    resolution: [480, 270],
    layers: [
      { id: 'bg', src: 'bg.png', parallax: 0 },
      { id: 'mid', src: 'mid.png', parallax: 0.5 },
    ],
    lights: [
      {
        id: 'l1',
        label: 'Light 1',
        pos: [10, 10],
        color: '#FFAA00',
        intensity: 0.5,
        radius: 50,
        flicker: 0,
      },
    ],
    defaults: {
      ambient: '#222222',
      ambientLevel: 0.5,
      weather: 'none',
      weatherLevel: 0,
      fog: 0,
      timeOfDay: 'night',
    },
    presets: {
      storm: { weather: 'rain', weatherLevel: 0.8, lights: { l1: { intensity: 1 } } },
    },
    ...overrides,
  };
}

function writeValidSceneFiles(sceneDir: string): void {
  writePng(path.join(sceneDir, 'bg.png'), 480, 270);
  writePng(path.join(sceneDir, 'mid.png'), 600, 270);
}

describe('SceneRegistry.load', () => {
  it('loads a valid scene with no errors', async () => {
    const sceneDir = writeScene('forest', validScene());
    writeValidSceneFiles(sceneDir);

    const { registry, errors } = await SceneRegistry.load(tmpDir);

    expect(errors).toEqual([]);
    const scene = registry.get('forest');
    expect(scene).toBeDefined();
    expect(scene?.name).toBe('Forest');
    expect(scene?.defaults.ambient).toBe('#222222');
  });

  it('loads venue hours (story moods spec §5)', async () => {
    writeValidSceneFiles(writeScene('forest', validScene({ hours: { open: '20:00', close: '04:00' } })));
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(errors).toEqual([]);
    expect(registry.get('forest')?.hours).toEqual({ open: '20:00', close: '04:00' });
  });

  it('keeps a scene whose hours are not HH:MM, without its hours, and says so (story moods minors)', async () => {
    writeValidSceneFiles(writeScene('forest', validScene({ hours: { open: '8pm', close: '04:00' } })));
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('forest')).toBeDefined();
    expect(registry.get('forest')!.hours).toBeUndefined();
    expect(errors.some((e) => e.includes('forest') && e.includes('hours'))).toBe(true);
  });

  it('normalizes hex colors to lowercase', async () => {
    const sceneDir = writeScene('forest', validScene());
    writeValidSceneFiles(sceneDir);

    const { registry } = await SceneRegistry.load(tmpDir);
    const scene = registry.get('forest') as SceneDef;
    expect(scene.lights[0].color).toBe('#ffaa00');
  });

  it('defaults resolution and presets when omitted', async () => {
    const scene = validScene();
    delete (scene as Record<string, unknown>).resolution;
    delete (scene as Record<string, unknown>).presets;
    const sceneDir = writeScene('forest', scene);
    writeValidSceneFiles(sceneDir);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(errors).toEqual([]);
    const loaded = registry.get('forest') as SceneDef;
    expect(loaded.resolution).toEqual([480, 270]);
    expect(loaded.presets).toEqual({});
  });

  it('ignores folders starting with underscore', async () => {
    writeScene('_draft', { not: 'valid at all' });
    const sceneDir = writeScene('forest', validScene());
    writeValidSceneFiles(sceneDir);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(errors).toEqual([]);
    expect(registry.list().map((s) => s.id)).toEqual(['forest']);
  });

  it('loads a scene with a weatherRegion inside its resolution, as one weatherArea shape', async () => {
    const sceneDir = writeScene('forest', validScene({ weatherRegion: [10, 20, 100, 50] }));
    writeValidSceneFiles(sceneDir);

    const { registry, errors } = await SceneRegistry.load(tmpDir);

    expect(errors).toEqual([]);
    expect(registry.get('forest')?.weatherArea).toEqual([[[10, 20], [110, 20], [110, 70], [10, 70]]]);
    expect(registry.get('forest')?.weatherRegion).toBeUndefined();
  });

  it('leaves weatherRegion unset when omitted', async () => {
    const sceneDir = writeScene('forest', validScene());
    writeValidSceneFiles(sceneDir);
    const { registry } = await SceneRegistry.load(tmpDir);
    expect(registry.get('forest')?.weatherRegion).toBeUndefined();
    expect(registry.get('forest')?.weatherArea).toBeUndefined();
  });

  describe('invalid weatherRegion', () => {
    for (const [label, rect] of [
      ['extends past the right edge', [400, 0, 100, 50]],
      ['extends past the bottom edge', [0, 250, 50, 30]],
      ['has a negative origin', [-1, 0, 50, 50]],
      ['has zero width', [0, 0, 0, 50]],
      ['has a non-integer size', [0, 0, 10.5, 50]],
    ] as const) {
      it(`errors and skips a scene whose weatherRegion ${label}`, async () => {
        const good = writeScene('forest', validScene());
        writeValidSceneFiles(good);
        const brokenDir = writeScene('broken', validScene({ id: 'broken', weatherRegion: rect }));
        writeValidSceneFiles(brokenDir);

        const { registry, errors } = await SceneRegistry.load(tmpDir);
        expect(registry.get('broken')).toBeUndefined();
        expect(registry.get('forest')).toBeDefined();
        expect(errors.some((e) => e.includes('broken') && e.includes('weatherRegion'))).toBe(true);
      });
    }
  });

  describe('invalid scene.json', () => {
    it('errors and skips a scene missing name', async () => {
      const good = writeScene('forest', validScene());
      writeValidSceneFiles(good);
      const scene = validScene({ id: 'broken' });
      delete (scene as Record<string, unknown>).name;
      const brokenDir = writeScene('broken', scene);
      writeValidSceneFiles(brokenDir);

      const { registry, errors } = await SceneRegistry.load(tmpDir);
      expect(registry.get('broken')).toBeUndefined();
      expect(errors.some((e) => e.includes('broken'))).toBe(true);
    });

    it('errors and skips a scene with a 9th light', async () => {
      const good = writeScene('forest', validScene());
      writeValidSceneFiles(good);
      const lights = Array.from({ length: 9 }, (_, i) => ({
        id: `l${i}`,
        label: `Light ${i}`,
        pos: [0, 0] as [number, number],
        color: '#ffffff',
        intensity: 0.5,
        radius: 10,
        flicker: 0,
      }));
      const brokenDir = writeScene('broken', validScene({ id: 'broken', lights }));
      writeValidSceneFiles(brokenDir);

      const { registry, errors } = await SceneRegistry.load(tmpDir);
      expect(registry.get('broken')).toBeUndefined();
      expect(errors.some((e) => e.includes('broken'))).toBe(true);
    });

    it('errors and skips a scene with duplicate light ids', async () => {
      const good = writeScene('forest', validScene());
      writeValidSceneFiles(good);
      const lights = [
        { id: 'dup', label: 'A', pos: [0, 0], color: '#ffffff', intensity: 0.5, radius: 10, flicker: 0 },
        { id: 'dup', label: 'B', pos: [1, 1], color: '#000000', intensity: 0.5, radius: 10, flicker: 0 },
      ];
      const brokenDir = writeScene('broken', validScene({ id: 'broken', lights }));
      writeValidSceneFiles(brokenDir);

      const { registry, errors } = await SceneRegistry.load(tmpDir);
      expect(registry.get('broken')).toBeUndefined();
      expect(errors.some((e) => e.includes('broken'))).toBe(true);
    });

    it('errors and skips a scene with parallax out of range', async () => {
      const good = writeScene('forest', validScene());
      writeValidSceneFiles(good);
      const layers = [
        { id: 'bg', src: 'bg.png', parallax: 0 },
        { id: 'mid', src: 'mid.png', parallax: 1.5 },
      ];
      const brokenDir = writeScene('broken', validScene({ id: 'broken', layers }));
      writeValidSceneFiles(brokenDir);

      const { registry, errors } = await SceneRegistry.load(tmpDir);
      expect(registry.get('broken')).toBeUndefined();
      expect(errors.some((e) => e.includes('broken'))).toBe(true);
    });

    it('errors and skips a scene with an invalid weather value', async () => {
      const good = writeScene('forest', validScene());
      writeValidSceneFiles(good);
      const scene = validScene({ id: 'broken' });
      (scene.defaults as Record<string, unknown>).weather = 'fire';
      const brokenDir = writeScene('broken', scene);
      writeValidSceneFiles(brokenDir);

      const { registry, errors } = await SceneRegistry.load(tmpDir);
      expect(registry.get('broken')).toBeUndefined();
      expect(errors.some((e) => e.includes('broken'))).toBe(true);
    });

    it('errors and skips a scene with a bad hex color', async () => {
      const good = writeScene('forest', validScene());
      writeValidSceneFiles(good);
      const scene = validScene({ id: 'broken' });
      (scene.defaults as Record<string, unknown>).ambient = 'not-a-color';
      const brokenDir = writeScene('broken', scene);
      writeValidSceneFiles(brokenDir);

      const { registry, errors } = await SceneRegistry.load(tmpDir);
      expect(registry.get('broken')).toBeUndefined();
      expect(errors.some((e) => e.includes('broken'))).toBe(true);
    });
  });

  it('errors when a preset references an unknown light', async () => {
    const good = writeScene('forest', validScene());
    writeValidSceneFiles(good);
    const scene = validScene({
      id: 'x',
      presets: { storm: { weather: 'rain', lights: { ghost: { intensity: 1 } } } },
    });
    const sceneDir = writeScene('x', scene);
    writeValidSceneFiles(sceneDir);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('x')).toBeUndefined();
    expect(errors).toContain("scene 'x': preset 'storm' references unknown light 'ghost'");
  });

  it('keeps a scene with a missing layer file, and reports the error', async () => {
    const sceneDir = writeScene('forest', validScene());
    // only write bg.png, not mid.png
    writePng(path.join(sceneDir, 'bg.png'), 480, 270);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('forest')).toBeDefined();
    expect(errors.some((e) => e.includes('missing layer file'))).toBe(true);
  });

  it('errors and skips a scene with a wrongly sized layer', async () => {
    const good = writeScene('forest', validScene());
    writeValidSceneFiles(good);
    const brokenDir = writeScene('broken', validScene({ id: 'broken' }));
    writePng(path.join(brokenDir, 'bg.png'), 100, 100);
    writePng(path.join(brokenDir, 'mid.png'), 600, 270);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('broken')).toBeUndefined();
    expect(errors.some((e) => e.includes('broken'))).toBe(true);
  });

  it('errors and skips a scene with a corrupt (non-PNG) layer file, without affecting other scenes', async () => {
    const good = writeScene('forest', validScene());
    writeValidSceneFiles(good);
    const brokenDir = writeScene('broken', validScene({ id: 'broken' }));
    writeCorrupt(path.join(brokenDir, 'bg.png'));
    writePng(path.join(brokenDir, 'mid.png'), 600, 270);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('forest')).toBeDefined();
    expect(registry.get('broken')).toBeUndefined();
    expect(errors.some((e) => e.includes('broken'))).toBe(true);
  });

  it('errors and skips a scene with a wrongly sized emissive layer', async () => {
    const good = writeScene('forest', validScene());
    writeValidSceneFiles(good);
    const layers = [
      { id: 'bg', src: 'bg.png', parallax: 0, emissive: 'bg-em.png' },
      { id: 'mid', src: 'mid.png', parallax: 0.5 },
    ];
    const brokenDir = writeScene('broken', validScene({ id: 'broken', layers }));
    writePng(path.join(brokenDir, 'bg.png'), 480, 270);
    writePng(path.join(brokenDir, 'bg-em.png'), 100, 100);
    writePng(path.join(brokenDir, 'mid.png'), 600, 270);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('broken')).toBeUndefined();
    expect(errors.some((e) => e.includes('broken'))).toBe(true);
  });

  it('keeps a scene with a missing emissive layer, and reports "missing layer file"', async () => {
    const layers = [
      { id: 'bg', src: 'bg.png', parallax: 0, emissive: 'bg-em.png' },
      { id: 'mid', src: 'mid.png', parallax: 0.5 },
    ];
    const sceneDir = writeScene('forest', validScene({ layers }));
    writeValidSceneFiles(sceneDir);
    // bg-em.png intentionally not written

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('forest')).toBeDefined();
    expect(errors.some((e) => e.includes('missing layer file') && e.includes('bg-em.png'))).toBe(
      true,
    );
  });

  it('checks a wrongly sized emissive against resolution when the main layer file is missing', async () => {
    const layers = [
      { id: 'bg', src: 'bg.png', parallax: 0, emissive: 'bg-em.png' },
      { id: 'mid', src: 'mid.png', parallax: 0.5 },
    ];
    const good = writeScene('forest', validScene());
    writeValidSceneFiles(good);
    const brokenDir = writeScene('broken', validScene({ id: 'broken', layers }));
    // bg.png intentionally missing; bg-em.png is the wrong size for the scene's 480x270 resolution
    writePng(path.join(brokenDir, 'bg-em.png'), 100, 100);
    writePng(path.join(brokenDir, 'mid.png'), 600, 270);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('broken')).toBeUndefined();
    expect(
      errors.some((e) => e.includes('broken') && e.includes('bg-em.png') && e.includes('100x100')),
    ).toBe(true);
  });

  for (const [label, layerOverride] of [
    ['a ../ layer src', { src: '../forest/bg.png' }],
    ['an absolute layer src', { src: '/etc/passwd' }],
    ['a ../ emissive path', { src: 'bg.png', emissive: '../../outside.png' }],
    ['a nested ../ that climbs out', { src: 'sub/../../forest/bg.png' }],
  ] as const) {
    it(`errors and skips a scene with ${label} (paths are confined to the scene folder)`, async () => {
      const good = writeScene('forest', validScene());
      writeValidSceneFiles(good);
      writePng(path.join(tmpDir, 'outside.png'), 480, 270);
      const brokenDir = writeScene(
        'broken',
        validScene({ id: 'broken', layers: [{ id: 'bg', parallax: 0, ...layerOverride }] }),
      );
      writeValidSceneFiles(brokenDir);

      const { registry, errors } = await SceneRegistry.load(tmpDir);
      expect(registry.get('broken')).toBeUndefined();
      expect(registry.get('forest')).toBeDefined();
      expect(errors.some((e) => e.startsWith("scene 'broken'") && e.includes('outside the scene folder'))).toBe(true);
    });
  }

  it('allows layer paths in a subfolder of the scene folder', async () => {
    const sceneDir = writeScene('forest', validScene({ layers: [{ id: 'bg', src: 'layers/bg.png', parallax: 0 }] }));
    writePng(path.join(sceneDir, 'layers', 'bg.png'), 480, 270);
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(errors).toEqual([]);
    expect(registry.get('forest')).toBeDefined();
  });

  it('errors and skips a scene whose id does not match its folder name', async () => {
    const good = writeScene('forest', validScene());
    writeValidSceneFiles(good);
    const brokenDir = writeScene('mismatched', validScene({ id: 'something-else' }));
    writeValidSceneFiles(brokenDir);

    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('something-else')).toBeUndefined();
    expect(registry.get('mismatched')).toBeUndefined();
    expect(errors.some((e) => e.includes('mismatched'))).toBe(true);
  });

  it('throws when there are zero valid scenes', async () => {
    writeScene('broken', { not: 'a scene' });

    await expect(SceneRegistry.load(tmpDir)).rejects.toThrow(`no valid scenes in ${tmpDir}`);
  });
});

describe('SceneRegistry', () => {
  it('list() returns scenes sorted by id', async () => {
    const b = writeScene('bravo', validScene({ id: 'bravo' }));
    writeValidSceneFiles(b);
    const a = writeScene('alpha', validScene({ id: 'alpha' }));
    writeValidSceneFiles(a);

    const { registry } = await SceneRegistry.load(tmpDir);
    expect(registry.list().map((s) => s.id)).toEqual(['alpha', 'bravo']);
  });

  it('first() returns the first scene in sorted order', async () => {
    const b = writeScene('bravo', validScene({ id: 'bravo' }));
    writeValidSceneFiles(b);
    const a = writeScene('alpha', validScene({ id: 'alpha' }));
    writeValidSceneFiles(a);

    const { registry } = await SceneRegistry.load(tmpDir);
    expect(registry.first().id).toBe('alpha');
  });
});

describe('SceneRegistry emissiveLights (per-light glow maps)', () => {
  const sibling = () => writeValidSceneFiles(writeScene('alpha', validScene({ id: 'alpha' })));
  const withGlow = (emissiveLights: Record<string, string>) => [
    { id: 'bg', src: 'bg.png', parallax: 0, emissiveLights },
    { id: 'mid', src: 'mid.png', parallax: 0.5 },
  ];

  it('loads a scene whose per-light map matches its layer', async () => {
    const dir = writeScene('forest', validScene({ layers: withGlow({ l1: 'bg_e_l1.png' }) }));
    writeValidSceneFiles(dir);
    writePng(path.join(dir, 'bg_e_l1.png'), 480, 270);
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(errors).toEqual([]);
    expect(registry.get('forest')!.layers[0].emissiveLights).toEqual({ l1: 'bg_e_l1.png' });
  });

  it('rejects an emissiveLights entry for an unknown light', async () => {
    const dir = writeScene('forest', validScene({ layers: withGlow({ lamp: 'bg_e_lamp.png' }) }));
    writeValidSceneFiles(dir);
    writePng(path.join(dir, 'bg_e_lamp.png'), 480, 270);
    const { registry, errors } = (sibling(), await SceneRegistry.load(tmpDir));
    expect(registry?.get('forest')).toBeUndefined();
    expect(errors.some((e) => e.includes("emissiveLights references unknown light 'lamp'"))).toBe(true);
  });

  it('rejects a wrongly sized per-light map', async () => {
    const dir = writeScene('forest', validScene({ layers: withGlow({ l1: 'bg_e_l1.png' }) }));
    writeValidSceneFiles(dir);
    writePng(path.join(dir, 'bg_e_l1.png'), 10, 10);
    const { errors } = (sibling(), await SceneRegistry.load(tmpDir));
    expect(errors.some((e) => e.includes("emissive 'bg_e_l1.png' is 10x10, expected 480x270"))).toBe(true);
  });

  it('rejects a per-light path that escapes the scene folder', async () => {
    const dir = writeScene('forest', validScene({ layers: withGlow({ l1: '../../x.png' }) }));
    writeValidSceneFiles(dir);
    const { errors } = (sibling(), await SceneRegistry.load(tmpDir));
    expect(errors.some((e) => e.includes("emissiveLights.l1 '../../x.png' points outside the scene folder"))).toBe(true);
  });

  it('keeps the scene when a per-light map is missing, reporting "missing layer file"', async () => {
    const dir = writeScene('forest', validScene({ layers: withGlow({ l1: 'bg_e_l1.png' }) }));
    writeValidSceneFiles(dir);
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('forest')).toBeDefined();
    expect(errors.some((e) => e.includes("missing layer file 'bg_e_l1.png'"))).toBe(true);
  });
});

describe('committed scene packs', () => {
  for (const pack of ['karasu', 'default']) {
    it(`scenes/${pack} loads with zero errors and every scene offers late, quiet and tense`, async () => {
      const { registry, errors } = await SceneRegistry.load(path.join(__dirname, '..', '..', 'scenes', pack));
      expect(errors).toEqual([]);
      for (const scene of registry.list()) {
        for (const name of ['late', 'quiet', 'tense']) expect(Object.keys(scene.presets)).toContain(name);
      }
    });
  }

  it('loadPacks returns every pack folder with its registry', async () => {
    const packs = await loadPacks(path.join(__dirname, '..', '..', 'scenes'));
    expect([...packs.keys()].sort()).toEqual(['default', 'drownworks', 'karasu', 'lowlight', 'marsh', 'nexus', 'spine', 'strand', 'tidal', 'velvet']);
    expect(packs.get('karasu')!.registry.get('lowlight-intake')).toBeDefined();
    expect(packs.get('lowlight')!.registry.get('splash')).toBeDefined();
  });
});

describe('scene sound fields', () => {
  const lightWith = (sound: unknown) => [
    { id: 'l1', label: 'Light 1', pos: [10, 10], color: '#FFAA00', intensity: 0.5, radius: 50, flicker: 0, ...(sound === undefined ? {} : { sound }) },
  ];
  async function load(scene: Record<string, unknown>) {
    writeValidSceneFiles(writeScene('forest', validScene())); // the loader needs one good scene
    const dir = writeScene(String(scene.id), scene);
    writeValidSceneFiles(dir);
    return SceneRegistry.load(tmpDir);
  }

  it('loads indoor, hum, a bed and a neon light into the SceneDef', async () => {
    const { registry, errors } = await load(
      validScene({ id: 'snd', sound: { indoor: true, hum: 0.3, bed: { src: 'sound/tone.ogg', level: 0.5 } }, lights: lightWith('neon') }),
    );
    expect(errors).toEqual([]);
    const s = registry.get('snd')!;
    expect(s.sound).toEqual({ indoor: true, hum: 0.3, bed: { src: 'sound/tone.ogg', level: 0.5 } });
    expect(s.lights[0].sound).toBe('neon');
  });

  it('loads room sounds into the SceneDef', async () => {
    const sounds = [{ name: 'kettle', src: 'sound/keep/k.ogg', level: 0.4, agent: { about: 'the kettle clicking off' }, timer: { min: 3, max: 8 }, onEntry: true }];
    const { registry, errors } = await load(validScene({ id: 'snd2', sound: { sounds } }));
    expect(errors).toEqual([]);
    expect(registry.get('snd2')!.sound!.sounds).toEqual(sounds);
  });

  it('a scene without sound fields still loads, with none', async () => {
    const { registry } = await load(validScene({ id: 'plain' }));
    expect(registry.get('plain')!.sound).toBeUndefined();
    expect(registry.get('plain')!.lights[0].sound).toBeUndefined();
  });

  it.each([
    ['hum above 1', { hum: 1.2 }, 'hum'],
    ['negative bed level', { bed: { src: 'a.ogg', level: -1 } }, 'level'],
    ['non-boolean indoor', { indoor: 'yes' }, 'indoor'],
    ['a bed escaping its folder', { bed: { src: '../x.ogg' } }, 'bed'],
    ['a room sound named badly', { sounds: [{ name: 'Kettle', src: 'k.ogg' }] }, 'name'],
    ['a room sound escaping its folder', { sounds: [{ name: 'kettle', src: '../x.ogg' }] }, "sound 'kettle' points outside the scene folder"],
  ])('rejects %s with an error naming the field', async (_label, sound, field) => {
    const { registry, errors } = await load(validScene({ id: 'badsnd', sound }));
    expect(registry.get('badsnd')).toBeUndefined();
    expect(errors.some((e) => e.includes('badsnd') && e.includes(field))).toBe(true);
  });

  describe('scene music', () => {
    const music = (file: string) => {
      fs.mkdirSync(path.join(tmpDir, '_music'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '_music', file), 'ogg');
    };

    it('accepts sound.music naming a file in the pack _music folder; _music is not a scene', async () => {
      music('theme.ogg');
      const { registry, errors } = await load(validScene({ id: 'room', sound: { music: { src: 'theme.ogg', level: 0.4 } } }));
      expect(errors).toEqual([]);
      expect(registry.get('room')!.sound!.music).toEqual({ songs: ['theme.ogg'], level: 0.4 });
      expect(registry.list().map((s) => s.id).sort()).toEqual(['forest', 'room']);
    });

    it.each([
      ['a missing file', 'nope.ogg', /music 'nope\.ogg' is not in .*_music/],
      ['a path', 'sub/theme.ogg', /music 'sub\/theme\.ogg' must be a file name/],
      ['a backslash path', 'sub\\theme.ogg', /must be a file name/],
      ['climbing out', '../theme.ogg', /must be a file name/],
      ['dot-dot itself', '..', /must be a file name/],
      ['empty', '', /must be a file name/],
    ])('rejects %s', async (_label, src, message) => {
      music('theme.ogg');
      const { registry, errors } = await load(validScene({ id: 'badmusic', sound: { music: { src } } }));
      expect(registry.get('badmusic')).toBeUndefined();
      expect(errors.some((e) => e.includes('badmusic') && message.test(e))).toBe(true);
    });

    it('allows dots inside a name (Review Focus 3)', async () => {
      music('a..b.ogg');
      const { errors } = await load(validScene({ id: 'dots', sound: { music: { src: 'a..b.ogg' } } }));
      expect(errors).toEqual([]);
    });

    it('rejects a level outside 0..1', async () => {
      music('theme.ogg');
      const { registry, errors } = await load(validScene({ id: 'loud', sound: { music: { src: 'theme.ogg', level: 1.5 } } }));
      expect(registry.get('loud')).toBeUndefined();
      expect(errors.some((e) => e.includes('loud') && e.includes('level'))).toBe(true);
    });

    it('loads a song list', async () => {
      music('a.ogg');
      music('b.ogg');
      const { registry, errors } = await load(validScene({ id: 'room', sound: { music: { songs: ['a.ogg', 'b.ogg'], level: 0.5 } } }));
      expect(errors).toEqual([]);
      expect(registry.get('room')!.sound!.music).toEqual({ songs: ['a.ogg', 'b.ogg'], level: 0.5 });
    });

    it('the old single song loads as a one-song list', async () => {
      music('a.ogg');
      const { registry } = await load(validScene({ id: 'room', sound: { music: { src: 'a.ogg' } } }));
      expect(registry.get('room')!.sound!.music).toEqual({ songs: ['a.ogg'] });
    });

    for (const [label, songs] of [
      ['an empty list', []],
      ['17 songs', Array.from({ length: 17 }, (_, i) => `s${i}.ogg`)],
      ['a duplicate', ['a.ogg', 'a.ogg']],
    ] as const) {
      it(`rejects ${label}`, async () => {
        music('a.ogg');
        for (let i = 0; i < 17; i++) music(`s${i}.ogg`);
        const { registry, errors } = await load(validScene({ id: 'many', sound: { music: { songs } } }));
        expect(registry.get('many')).toBeUndefined();
        expect(errors.some((e) => e.includes('many') && e.includes('music'))).toBe(true);
      });
    }

    it('checks every song of a list: a path and a missing file are refused', async () => {
      music('a.ogg');
      const bad = await load(validScene({ id: 'bad', sound: { music: { songs: ['a.ogg', '../x.ogg'] } } }));
      expect(bad.errors.some((e) => /music '\.\.\/x\.ogg' must be a file name/.test(e))).toBe(true);
      const missing = await load(validScene({ id: 'gone', sound: { music: { songs: ['a.ogg', 'nope.ogg'] } } }));
      expect(missing.errors.some((e) => /music 'nope\.ogg' is not in/.test(e))).toBe(true);
    });

    it('the committed rooms load their song as a one-song list (Review Focus 5)', async () => {
      const packs = await loadPacks(path.join(__dirname, '..', '..', 'scenes'));
      for (const id of ['lowlight-intake', 'nix-apartment']) {
        expect(packs.get('karasu')!.registry.get(id)!.sound!.music!.songs).toEqual(['Nix.ogg']);
      }
    });
  });

  it('rejects an unknown light sound', async () => {
    const { registry, errors } = await load(validScene({ id: 'badlight', lights: lightWith('lamp') }));
    expect(registry.get('badlight')).toBeUndefined();
    expect(errors.some((e) => e.includes('badlight') && e.includes('sound'))).toBe(true);
  });

  it('the shipped scenes carry their indoor, hum and neon defaults', async () => {
    const packs = await loadPacks(path.join(__dirname, '..', '..', 'scenes'));
    const get = (pack: string, id: string) => packs.get(pack)!.registry.get(id)!;
    const neon = (pack: string, id: string) => get(pack, id).lights.filter((l) => l.sound === 'neon').map((l) => l.id).sort();
    expect(get('karasu', 'lowlight-intake').sound).toMatchObject({ indoor: true, hum: 0.3 });
    expect(get('default', 'workspace').sound).toMatchObject({ indoor: true, hum: 0.3 });
    for (const [pack, id] of [['karasu', 'noodle-stall'], ['karasu', 'ribbon-rooftop'], ['default', 'rooftop']]) {
      expect(get(pack, id).sound?.indoor ?? false).toBe(false);
    }
    expect(neon('karasu', 'lowlight-intake')).toEqual(['window_neon']);
    expect(neon('karasu', 'noodle-stall')).toEqual(['sign_noodles']);
    expect(neon('karasu', 'ribbon-rooftop')).toEqual(['sign_below']);
    expect(neon('default', 'rooftop')).toEqual(['billboard', 'signs']);
    expect(neon('default', 'workspace')).toEqual([]);
  });

  it('each shipped scene has its recorded bed, and the file is there', async () => {
    const restricted = audioStatus(fs.readFileSync(path.join(__dirname, '..', '..', 'sounds', 'CREDITS.md'), 'utf8'));
    const root = path.join(__dirname, '..', '..', 'scenes');
    const packs = await loadPacks(root);
    const beds: Array<[string, string, string]> = [
      ['karasu', 'lowlight-intake', 'sound/office-heater.ogg'],
      ['karasu', 'noodle-stall', 'sound/street-crowd-sizzle.ogg'],
      ['karasu', 'ribbon-rooftop', 'sound/industry-night.ogg'],
      ['default', 'rooftop', 'sound/industry-night.ogg'],
      ['default', 'workspace', 'sound/overhead-fan.ogg'],
    ];
    for (const [pack, id, src] of beds) {
      expect(packs.get(pack)!.registry.get(id)!.sound?.bed?.src).toBe(src);
      // The public repo holds the restricted beds back (spec 2026-10-28 open-source release); here every one is on disk.
      const file = `scenes/${pack}/${id}/${src}`;
      expect(fs.existsSync(path.join(root, pack, id, src)) || restricted(file) === 'restricted', file).toBe(true);
    }
  });
});

describe('flat rooms', () => {
  const flatScene = (overrides: Record<string, unknown> = {}) =>
    validScene({
      id: 'flat',
      resolution: [1536, 864],
      layers: [{ id: 'room', src: 'room.png', parallax: 0, emissive: 'room_e.png', emissiveLights: { l1: 'room_e_l1.png' } }],
      ...overrides,
    });
  const writeFlatFiles = (dir: string, w = 1536, h = 864) => {
    writePng(path.join(dir, 'room.png'), w, h);
    writePng(path.join(dir, 'room_e.png'), w, h);
    writePng(path.join(dir, 'room_e_l1.png'), w, h);
  };
  // A second, valid room so the pack still loads when the flat one is refused.
  const writeOk = () => writeValidSceneFiles(writeScene('ok', validScene({ id: 'ok' })));

  it('loads a flat room: one 1536×864 layer at parallax 0 with 1536×864 glow maps', async () => {
    writeFlatFiles(writeScene('flat', flatScene()));
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(errors).toEqual([]);
    expect(registry.get('flat')?.resolution).toEqual([1536, 864]);
  });

  it('refuses a flat room with two layers', async () => {
    const dir = writeScene('flat', flatScene({ layers: [{ id: 'room', src: 'room.png', parallax: 0 }, { id: 'fg', src: 'fg.png', parallax: 0 }] }));
    writeFlatFiles(dir);
    writePng(path.join(dir, 'fg.png'), 1536, 864);
    writeOk();
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('flat')).toBeUndefined();
    expect(errors.join('\n')).toMatch(/layers/);
  });

  it('refuses a flat room whose layer has parallax', async () => {
    writeFlatFiles(writeScene('flat', flatScene({ layers: [{ id: 'room', src: 'room.png', parallax: 0.4 }] })));
    writeOk();
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('flat')).toBeUndefined();
    expect(errors.join('\n')).toMatch(/parallax/);
  });

  it('refuses a flat room at any size other than 1536×864', async () => {
    writeFlatFiles(writeScene('flat', flatScene({ resolution: [1280, 720] })), 1280, 720);
    writeOk();
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('flat')).toBeUndefined();
    expect(errors.join('\n')).toMatch(/1536×864/);
  });

  it('refuses a flat layer image of the wrong size', async () => {
    const dir = writeScene('flat', flatScene());
    writeFlatFiles(dir);
    writePng(path.join(dir, 'room.png'), 1536, 800);
    writeOk();
    const { registry, errors } = await SceneRegistry.load(tmpDir);
    expect(registry.get('flat')).toBeUndefined();
    expect(errors.join('\n')).toContain("layer 'room' is 1536x800, expected 1536x864");
  });

  it('a 480 room without resolution still defaults to 480×270', async () => {
    const { resolution: _r, ...noRes } = validScene();
    writeValidSceneFiles(writeScene('forest', noRes));
    const { registry } = await SceneRegistry.load(tmpDir);
    expect(registry.get('forest')?.resolution).toEqual([480, 270]);
  });
});

describe('shared frame', () => {
  it('knows flat from 480 and the frame unit', async () => {
    const { isFlat, frameUnit } = await import('../../shared/frame');
    expect(isFlat([480, 270])).toBe(false);
    expect(isFlat([1536, 864])).toBe(true);
    expect(frameUnit([1536, 864])).toBe(3.2);
  });
});

describe('effects', () => {
  const withFx = (over: Record<string, unknown> = {}) =>
    validScene({
      resolution: [1536, 864],
      layers: [{ id: 'room', src: 'room.png', parallax: 0 }],
      weatherHidden: true,
      lights: [{ id: 'l1', label: 'Light 1', pos: [10, 10], color: '#FFAA00', intensity: 0.5, radius: 50, flicker: 0, dust: true }],
      effects: [
        { kind: 'screen', rect: [10, 10, 40, 30], light: 'l1', scroll: 12 },
        { kind: 'leds', rect: [100, 10, 20, 60], rate: 2 },
        { kind: 'lightning', strength: 0.8 },
      ],
      ...over,
    });
  const load = async (scene: Record<string, unknown>) => {
    const dir = writeScene('forest', scene);
    if ((scene.resolution as number[])[0] === 1536) writePng(path.join(dir, 'room.png'), 1536, 864);
    else writeValidSceneFiles(dir);
    writeValidSceneFiles(writeScene('ok', validScene({ id: 'ok' })));
    return SceneRegistry.load(tmpDir);
  };

  it('loads a room with screen, leds and lightning effects, weatherHidden and a dusty light', async () => {
    const { registry, errors } = await load(withFx());
    expect(errors).toEqual([]);
    const s = registry.get('forest')!;
    expect(s.effects!.map((e) => e.kind)).toEqual(['screen', 'leds', 'lightning']);
    expect(s.weatherHidden).toBe(true);
    expect(s.lights[0].dust).toBe(true);
  });

  it('dust can be an amount from 0 to 3; true stays 100%', async () => {
    const lit = (dust: unknown) => [{ id: 'l1', label: 'Light 1', pos: [10, 10], color: '#FFAA00', intensity: 0.5, radius: 50, flicker: 0, dust }];
    const ok = await load(withFx({ lights: lit(2.5) }));
    expect(ok.errors).toEqual([]);
    expect(ok.registry.get('forest')!.lights[0].dust).toBe(2.5);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir);
    const over = await load(withFx({ lights: lit(4) }));
    expect(over.registry.get('forest')).toBeUndefined();
  });

  it('refuses effects and dust in a layered 480 room (its layers move with the camera)', async () => {
    const layered = { resolution: [480, 270], layers: [{ id: 'bg', src: 'bg.png', parallax: 0 }, { id: 'mid', src: 'mid.png', parallax: 0.5 }] };
    const fx = await load(withFx({ ...layered, lights: [{ id: 'l1', label: 'L', pos: [10, 10], color: '#FFAA00', intensity: 0.5, radius: 50, flicker: 0 }] }));
    expect(fx.registry.get('forest')).toBeUndefined();
    expect(fx.errors.join('\n')).toMatch(/effects need a flat room/);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir);
    const dust = await load(withFx({ ...layered, effects: undefined }));
    expect(dust.registry.get('forest')).toBeUndefined();
    expect(dust.errors.join('\n')).toMatch(/dust needs a flat room/);
  });

  it('weatherHidden works in a layered room', async () => {
    const { registry } = await load(validScene({ weatherHidden: true }));
    expect(registry.get('forest')!.weatherHidden).toBe(true);
  });

  it('refuses an effect rect outside the frame', async () => {
    const { registry, errors } = await load(withFx({ effects: [{ kind: 'leds', rect: [1530, 10, 20, 20] }] }));
    expect(registry.get('forest')).toBeUndefined();
    expect(errors.join('\n')).toMatch(/effects\.0\.rect/);
  });

  it('refuses a screen naming an unknown light', async () => {
    const { registry, errors } = await load(withFx({ effects: [{ kind: 'screen', rect: [10, 10, 20, 20], light: 'ghost' }] }));
    expect(registry.get('forest')).toBeUndefined();
    expect(errors.join('\n')).toMatch(/effects\.0\.light/);
  });

  it('refuses more than 16 effects', async () => {
    const many = Array.from({ length: 17 }, () => ({ kind: 'leds', rect: [10, 10, 5, 5] }));
    const { registry, errors } = await load(withFx({ effects: many }));
    expect(registry.get('forest')).toBeUndefined();
    expect(errors.join('\n')).toMatch(/effects/);
  });

  it('refuses leds.rate 5 and lightning.strength 1.5', async () => {
    const rate = await load(withFx({ effects: [{ kind: 'leds', rect: [10, 10, 5, 5], rate: 5 }] }));
    expect(rate.registry.get('forest')).toBeUndefined();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir);
    const strength = await load(withFx({ effects: [{ kind: 'lightning', strength: 1.5 }] }));
    expect(strength.registry.get('forest')).toBeUndefined();
  });

  it('a room without effects loads unchanged', async () => {
    const { registry } = await load(validScene());
    const s = registry.get('forest')!;
    expect(s.effects).toBeUndefined();
    expect(s.weatherHidden).toBeUndefined();
  });
});

describe('weatherArea', () => {
  const flat = (over: Record<string, unknown> = {}) =>
    validScene({ resolution: [1536, 864], layers: [{ id: 'room', src: 'room.png', parallax: 0 }], ...over });
  const sq = (x: number, y: number, w = 50, h = 50) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const load = async (scene: Record<string, unknown>) => {
    writePng(path.join(writeScene('forest', scene), 'room.png'), 1536, 864);
    writeValidSceneFiles(writeScene('ok', validScene({ id: 'ok' })));
    return SceneRegistry.load(tmpDir);
  };
  const refused = async (scene: Record<string, unknown>, msg: RegExp) => {
    const { registry, errors } = await load(scene);
    expect(registry.get('forest')).toBeUndefined();
    expect(errors.join('\n')).toMatch(msg);
  };

  it('converts weatherRegion to one shape', async () => {
    const { registry, errors } = await load(flat({ weatherRegion: [704, 54, 512, 258] }));
    expect(errors).toEqual([]);
    expect(registry.get('forest')!.weatherArea).toEqual([[[704, 54], [1216, 54], [1216, 312], [704, 312]]]);
    expect(registry.get('forest')!.weatherRegion).toBeUndefined();
  });

  it('rejects both fields', () => refused(flat({ weatherRegion: [0, 0, 10, 10], weatherArea: [sq(0, 0)] }), /use weatherArea or weatherRegion, not both/));
  it('rejects 9 shapes', () => refused(flat({ weatherArea: Array.from({ length: 9 }, (_, i) => sq(i * 60, 0)) }), /weatherArea/));
  it('rejects a 2-point shape', () => refused(flat({ weatherArea: [[[0, 0], [10, 10]]] }), /weatherArea/));
  it('rejects a 33-point shape', () =>
    refused(flat({ weatherArea: [Array.from({ length: 33 }, (_, i) => [Math.round(400 + 300 * Math.cos(i / 5.25)), Math.round(400 + 300 * Math.sin(i / 5.25))])] }), /weatherArea/));
  it('rejects a point outside the frame', () => refused(flat({ weatherArea: [[[1537, 10], [1500, 10], [1500, 60]]] }), /weather shape point must lie inside the frame/));
  it('rejects a shape under 4 px²', () => refused(flat({ weatherArea: [[[0, 0], [10, 0], [20, 0]]] }), /weather shape is too small/));

  it('rejects a self-crossing shape (task 2 review: Pixi fills only simple polygons)', () =>
    refused(flat({ weatherArea: [[[0, 0], [100, 100], [100, 0], [0, 60]]] }), /weather shape crosses itself/));

  it('accepts overlapping shapes', async () => {
    const { registry, errors } = await load(flat({ weatherArea: [sq(10, 10, 100, 100), sq(50, 50, 100, 100)] }));
    expect(errors).toEqual([]);
    expect(registry.get('forest')!.weatherArea).toHaveLength(2);
  });

  it('rejects a lightning rect', () => refused(flat({ effects: [{ kind: 'lightning', rect: [0, 0, 10, 10] }] }), /effects/));
  it('rejects two lightning effects', () => refused(flat({ effects: [{ kind: 'lightning' }, { kind: 'lightning' }] }), /a room has at most one lightning/));

  it('accepts lightning with only strength', async () => {
    const { registry, errors } = await load(flat({ effects: [{ kind: 'lightning', strength: 0.5 }] }));
    expect(errors).toEqual([]);
    expect(registry.get('forest')!.effects).toEqual([{ kind: 'lightning', strength: 0.5 }]);
  });

  it('accepts a passing light on a path; refuses an unknown source, every under 5 s or no box', async () => {
    const pass = { kind: 'passing', rect: [10, 10, 200, 60], source: 'police', every: 40, strength: 0.6 };
    const { registry, errors } = await load(flat({ effects: [pass] }));
    expect(errors).toEqual([]);
    expect(registry.get('forest')!.effects).toEqual([pass]);
    await refused(flat({ effects: [{ ...pass, source: 'tram' }] }), /effects/);
    await refused(flat({ effects: [{ ...pass, every: 2 }] }), /effects/);
    await refused(flat({ effects: [{ kind: 'passing', source: 'car' }] }), /effects/);
  });

  it('accepts a steam or smoke plume in a box; refuses an unknown style, lean over 1 or no box', async () => {
    const plume = { kind: 'plume', rect: [10, 10, 20, 60], style: 'smoke', amount: 2, lean: -0.5 };
    const { registry, errors } = await load(flat({ effects: [plume, { kind: 'plume', rect: [40, 10, 20, 60] }] }));
    expect(errors).toEqual([]);
    expect(registry.get('forest')!.effects).toEqual([plume, { kind: 'plume', rect: [40, 10, 20, 60] }]);
    await refused(flat({ effects: [{ ...plume, style: 'fire' }] }), /effects/);
    await refused(flat({ effects: [{ ...plume, lean: 1.5 }] }), /effects/);
    await refused(flat({ effects: [{ kind: 'plume', style: 'steam' }] }), /effects/);
  });

  it('accepts glass with an amount, refuses two or an amount over 3', async () => {
    const { registry, errors } = await load(flat({ effects: [{ kind: 'glass', amount: 2 }] }));
    expect(errors).toEqual([]);
    expect(registry.get('forest')!.effects).toEqual([{ kind: 'glass', amount: 2 }]);
    await refused(flat({ effects: [{ kind: 'glass' }, { kind: 'glass' }] }), /a room has at most one glass/);
    await refused(flat({ effects: [{ kind: 'glass', amount: 4 }] }), /effects/);
    await refused(flat({ effects: [{ kind: 'glass', rect: [0, 0, 10, 10] }] }), /effects/);
  });
});

describe('a scene resident', () => {
  const stall = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scenes', 'karasu', 'noodle-stall', 'scene.json'), 'utf8'));

  it('the noodle stall names Hae, at 0.78', () => {
    expect(sceneSchema.parse(stall()).resident).toEqual({ character: 'hae', scale: 0.78 });
  });

  it('defaults the scale to 0.78', () => {
    expect(sceneSchema.parse({ ...stall(), resident: { character: 'hae' } }).resident).toEqual({ character: 'hae', scale: 0.78 });
  });

  it('refuses a scale outside 0.3–1', () => {
    expect(sceneSchema.safeParse({ ...stall(), resident: { character: 'hae', scale: 2 } }).success).toBe(false);
  });

  it('a scene without one has none', () => {
    const { resident: _r, ...rest } = stall();
    expect(sceneSchema.parse(rest).resident).toBeUndefined();
  });
});

describe('loadPacks with a district that has no rooms yet', () => {
  it('keeps the others, and reports the empty one instead of failing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-packs-empty-'));
    try {
      await generateScenes(path.join(dir, 'default'), 'default');
      fs.mkdirSync(path.join(dir, 'velvet', '_music'), { recursive: true });
      const packs = await loadPacks(dir);
      expect(packs.get('default')!.registry.list().length).toBeGreaterThan(0);
      expect(packs.get('velvet')!.registry.list()).toEqual([]);
      expect(packs.get('velvet')!.errors.join(' ')).toMatch(/no valid scenes/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
