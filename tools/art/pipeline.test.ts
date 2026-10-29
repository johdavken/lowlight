import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SceneRegistry } from '../../server/src/scenes';
import { blank, writePng } from './image';
import { runBuild, runGuide } from './pipeline';
import { buildsTimeout, fakeDepth, makeFixtureRoot } from './test-fixture';

let root: string;

beforeEach(async () => {
  root = await makeFixtureRoot();
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('art pipeline', { timeout: buildsTimeout(2) }, () => {
  it('guide stage writes guide.png, prompt.txt and guide.json', async () => {
    await runGuide({ scene: 'lowlight-intake', root, log: () => {} });
    for (const f of ['guide.png', 'prompt.txt', 'guide.json']) expect(fs.existsSync(path.join(root, 'art', 'work', 'lowlight-intake', f))).toBe(true);
  });

  it('build installs lowlight-intake-art, which loads with zero registry errors and has the lamp glow map', async () => {
    const depth = fakeDepth();
    await runBuild({ scene: 'lowlight-intake', root, depth, log: () => {} });
    const { registry, errors } = await SceneRegistry.load(path.join(root, 'scenes', 'karasu'));
    expect(errors).toEqual([]);
    const art = registry.get('lowlight-intake-art')!;
    expect(art.name).toMatch(/\(art\)$/);
    expect(art.layers.some((l) => l.emissiveLights?.desk_lamp)).toBe(true);
    expect(depth.calls).toBe(1);
  });

  it('a second build with unchanged inputs does not re-run depth', async () => {
    const depth = fakeDepth();
    await runBuild({ scene: 'lowlight-intake', root, depth, log: () => {} });
    await runBuild({ scene: 'lowlight-intake', root, depth, log: () => {} });
    expect(depth.calls).toBe(1);
  });

  it('a hand-edited glow map is kept on rebuild, with a warning (Review Focus 4)', async () => {
    const depth = fakeDepth();
    await runBuild({ scene: 'lowlight-intake', root, depth, log: () => {} });
    const art = (await SceneRegistry.load(path.join(root, 'scenes', 'karasu'))).registry.get('lowlight-intake-art')!;
    const layer = art.layers.find((l) => l.emissiveLights?.desk_lamp)!;
    const file = path.join(root, 'scenes', 'karasu', 'lowlight-intake-art', layer.emissiveLights!.desk_lamp);
    const edited = blank(layer.parallax > 0 ? 480 + Math.ceil(layer.parallax * 48) : 480, 270);
    edited.data.set([1, 2, 3, 255], 0);
    writePng(file, edited);
    const before = fs.readFileSync(file);
    const logs: string[] = [];
    await runBuild({ scene: 'lowlight-intake', root, depth, log: (m) => logs.push(m) });
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(logs.some((m) => m.includes('kept hand-edited') && m.includes('--overwrite-glow'))).toBe(true);
    // …and on every later rebuild too (the lock must not adopt the edit as "generated").
    for (let run = 0; run < 2; run++) {
      const more: string[] = [];
      await runBuild({ scene: 'lowlight-intake', root, depth, log: (m) => more.push(m) });
      expect(fs.readFileSync(file).equals(before)).toBe(true);
      expect(more.some((m) => m.includes('kept hand-edited'))).toBe(true);
    }
    // --overwrite-glow replaces it.
    await runBuild({ scene: 'lowlight-intake', root, depth, overwriteGlow: true, log: () => {} });
    expect(fs.readFileSync(file).equals(before)).toBe(false);
  }, buildsTimeout(5));

  it('the glow lock is committed next to the art spec and keyed by file name (survives a clone/move)', async () => {
    await runBuild({ scene: 'lowlight-intake', root, depth: fakeDepth(), log: () => {} });
    const lockFile = path.join(root, 'art', 'scenes', 'lowlight-intake.glow-lock.json');
    expect(fs.existsSync(lockFile)).toBe(true);
    const keys = Object.keys(JSON.parse(fs.readFileSync(lockFile, 'utf8')));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(path.isAbsolute(k)).toBe(false);
  });

  it('an installed glow map with no lock entry is treated as hand-made and kept', async () => {
    const depth = fakeDepth();
    await runBuild({ scene: 'lowlight-intake', root, depth, log: () => {} });
    fs.rmSync(path.join(root, 'art', 'scenes', 'lowlight-intake.glow-lock.json'));
    const art = (await SceneRegistry.load(path.join(root, 'scenes', 'karasu'))).registry.get('lowlight-intake-art')!;
    const layer = art.layers.find((l) => l.emissiveLights?.desk_lamp)!;
    const file = path.join(root, 'scenes', 'karasu', 'lowlight-intake-art', layer.emissiveLights!.desk_lamp);
    const before = fs.readFileSync(file);
    const logs: string[] = [];
    await runBuild({ scene: 'lowlight-intake', root, depth, log: (m) => logs.push(m) });
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(logs.some((m) => m.includes('kept hand-edited'))).toBe(true);
  });

  it('glow maps the build does not produce (e.g. one painted for a light with no candidates) are carried over and wired in', async () => {
    const depth = fakeDepth();
    await runBuild({ scene: 'lowlight-intake', root, depth, log: () => {} });
    const dir = path.join(root, 'scenes', 'karasu', 'lowlight-intake-art');
    const painted = blank(500, 270); // room layer width
    painted.data.set([0, 255, 255, 255], 0);
    writePng(path.join(dir, 'room_e_monitor.png'), painted);
    const logs: string[] = [];
    await runBuild({ scene: 'lowlight-intake', root, depth, log: (m) => logs.push(m) });
    expect(fs.existsSync(path.join(dir, 'room_e_monitor.png'))).toBe(true);
    const art = (await SceneRegistry.load(path.join(root, 'scenes', 'karasu'))).registry.get('lowlight-intake-art')!;
    expect(art.layers.find((l) => l.id === 'room')!.emissiveLights?.monitor).toBe('room_e_monitor.png');
    expect(logs.some((m) => m.includes('room_e_monitor.png'))).toBe(true);
  });

  it('a map an earlier build generated but this one does not produce is dropped, not carried over', async () => {
    const depth = fakeDepth();
    await runBuild({ scene: 'lowlight-intake', root, depth, log: () => {} });
    const dir = path.join(root, 'scenes', 'karasu', 'lowlight-intake-art');
    const load = async () => (await SceneRegistry.load(path.join(root, 'scenes', 'karasu'))).registry.get('lowlight-intake-art')!;
    const lamp = (await load()).layers.map((l) => l.emissiveLights?.desk_lamp).find(Boolean)!;
    expect(fs.existsSync(path.join(dir, lamp))).toBe(true);
    const specFile = path.join(root, 'art', 'scenes', 'lowlight-intake.md');
    // The lamp's box moves to an empty corner: no candidates there, so no map for it.
    fs.writeFileSync(specFile, fs.readFileSync(specFile, 'utf8').replace(/desk_lamp: \[[^\]]*\]/, 'desk_lamp: [0, 0, 4, 4]'));
    const logs: string[] = [];
    await runBuild({ scene: 'lowlight-intake', root, depth, log: (m) => logs.push(m) });
    expect(fs.existsSync(path.join(dir, lamp))).toBe(false);
    expect((await load()).layers.some((l) => l.emissiveLights?.desk_lamp)).toBe(false);
    expect(logs.some((m) => m.includes(`dropped ${lamp}`))).toBe(true);
  });

  it('npm run art refuses a flat room (it would rebuild it as layers)', async () => {
    const dir = path.join(root, 'scenes', 'karasu', 'lowlight-intake');
    const scene = JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8'));
    fs.rmSync(dir, { recursive: true });
    fs.mkdirSync(dir);
    writePng(path.join(dir, 'room.png'), blank(1536, 864));
    fs.writeFileSync(
      path.join(dir, 'scene.json'),
      JSON.stringify({ ...scene, resolution: [1536, 864], layers: [{ id: 'room', src: 'room.png', parallax: 0 }], weatherRegion: undefined, lights: [] , presets: {} }),
    );
    await expect(runGuide({ scene: 'lowlight-intake', root, log: () => {} })).rejects.toThrow("'lowlight-intake' is a flat room; rebuild it in Scene Studio");
    await expect(runBuild({ scene: 'lowlight-intake', root, log: () => {}, depth: fakeDepth() })).rejects.toThrow('is a flat room');
  });
});
