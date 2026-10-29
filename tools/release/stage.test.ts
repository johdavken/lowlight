import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { awkwardTemp, contentFixture } from './fixture';
import { resolveRelease } from './release-list';
import { stageContent } from './stage';

describe('stageContent', () => {
  let root: string;
  let out: string;
  beforeEach(() => {
    root = awkwardTemp('content root');
    contentFixture(root);
    out = path.join(awkwardTemp('stage'), 'content');
    stageContent(root, resolveRelease(root, { version: 1, packs: ['p'], characters: ['b', 'player'], defaultPlayer: 'player' }), 'player', out);
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });

  it('copies listed packs and characters with their bases, nothing else', () => {
    expect(fs.readdirSync(path.join(out, 'scenes'))).toEqual(['p']);
    expect(fs.existsSync(path.join(out, 'scenes/p/_music/Song (Remastered).ogg'))).toBe(true);
    expect(fs.readdirSync(path.join(out, 'characters')).sort()).toEqual(['a', 'b', 'player']);
    expect(fs.existsSync(path.join(out, 'characters/a/a.png'))).toBe(true);
  });

  it('leaves out history folders and art sources', () => {
    expect(fs.existsSync(path.join(out, 'world/lore/history'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'world/splash/history'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'map/history'))).toBe(false);
    expect(fs.readdirSync(path.join(out, 'map')).sort()).toEqual(['city', 'lowlight.json']);
    // The district styles carry blackout rates the game reads (blackouts phase 3); the rest of map/city is the renderer's.
    expect(fs.readdirSync(path.join(out, 'map/city'))).toEqual(['districts']);
    expect(fs.readdirSync(path.join(out, 'map/city/districts'))).toEqual(['marsh.json']);
    expect(fs.readdirSync(path.join(out, 'art/scenes'))).toEqual(['one.md']);
    expect(fs.readdirSync(path.join(out, 'art'))).toEqual(['scenes']);
    expect(fs.readdirSync(path.join(out, 'world/lore'))).toEqual(['city.md']);
    expect(fs.readdirSync(path.join(out, 'world/gigs'))).toEqual(['job.md']);
    // Papers' data and faces ship with the game (final review, Important 1).
    expect(fs.readdirSync(path.join(out, 'world/papers')).sort()).toEqual(['faces', 'origins.json']);
    expect(fs.readdirSync(path.join(out, 'world/papers/faces'))).toEqual(['o40-01.jpg']);
    expect(fs.readdirSync(path.join(out, 'world/districts'))).toEqual(['karasu.webp']);
    // Standing's shared words ship with the game (STANDING_FILE).
    expect(fs.existsSync(path.join(out, 'world/standing.json'))).toBe(true);
  });

  it('ships the jobs: quests with their art, leads, extras, gear and crew', () => {
    expect(fs.readdirSync(path.join(out, 'world/quests')).sort()).toEqual(['art', 'big.md', 'small.md']);
    expect(fs.readdirSync(path.join(out, 'world/quests/art'))).toEqual(['small.webp']);
    expect(fs.readdirSync(path.join(out, 'world/leads'))).toEqual(['lead.md']);
    expect(fs.readdirSync(path.join(out, 'world/extras'))).toEqual(['face.png']);
    expect(fs.readdirSync(path.join(out, 'world/gear'))).toEqual(['decks.md']);
    expect(fs.readdirSync(path.join(out, 'world/crew'))).toEqual(['names.md']);
  });

  it('leaves out the quests release.json holds back', () => {
    stageContent(root, resolveRelease(root, { version: 1, packs: ['p'], characters: ['b', 'player'], defaultPlayer: 'player', holdQuests: ['big'] }), 'player', out);
    expect(fs.readdirSync(path.join(out, 'world/quests')).sort()).toEqual(['art', 'small.md']);
  });

  it('writes the default player and the credits', () => {
    expect(JSON.parse(fs.readFileSync(path.join(out, 'persona/persona.json'), 'utf8'))).toEqual({ character: 'player' });
    expect(fs.readFileSync(path.join(out, 'CREDITS.md'), 'utf8')).toBe('# Credits');
  });

  it('replaces a previous stage instead of merging into it', () => {
    stageContent(root, resolveRelease(root, { version: 1, packs: ['q'], characters: ['c', 'player'], defaultPlayer: 'player' }), 'player', out);
    expect(fs.readdirSync(path.join(out, 'scenes'))).toEqual(['q']);
    expect(fs.readdirSync(path.join(out, 'characters')).sort()).toEqual(['c', 'player']);
  });
});

describe('stageContent bug relay', () => {
  it('writes report.json only when the list names a relay', () => {
    const root = awkwardTemp('content root');
    contentFixture(root);
    const out = path.join(awkwardTemp('stage'), 'content');
    const resolved = resolveRelease(root, { version: 1, packs: ['p'], characters: ['b', 'player'], defaultPlayer: 'player' });
    stageContent(root, resolved, 'player', out);
    expect(fs.existsSync(path.join(out, 'report.json'))).toBe(false);
    stageContent(root, resolved, 'player', out, 'https://r.workers.dev');
    expect(JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'))).toEqual({ bugRelay: 'https://r.workers.dev' });
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });
});

describe('the city map render in a build (rendered map spec §4)', () => {
  let repo: string;
  const pub = () => path.join(repo, 'web', 'public', 'map');
  beforeEach(() => {
    repo = awkwardTemp('render repo');
    for (const dir of ['map', 'tools/map3d']) fs.cpSync(dir, path.join(repo, dir), { recursive: true, filter: (p) => !p.includes('history') && !p.includes(`map3d${path.sep}out`) });
    fs.mkdirSync(path.join(repo, 'shared'), { recursive: true });
    for (const f of ['map-projection.ts', 'city-schema.ts']) fs.copyFileSync(path.join('shared', f), path.join(repo, 'shared', f));
    fs.mkdirSync(path.join(pub(), 'tiles', '1'), { recursive: true });
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));
  const writeManifest = async () => {
    const { currentDataHash } = await import('../map3d/versions');
    const m = { version: 1, size: [4608, 3072], tile: 512, levels: [{ scale: 1, cols: 9, rows: 6, tiles: 'all' }], deep: [], dataHash: currentDataHash(repo), blender: '5.2.2', pinHeights: {}, rendered: 'now' };
    fs.writeFileSync(path.join(pub(), 'tiles.json'), JSON.stringify(m));
    fs.writeFileSync(path.join(pub(), 'windows.json'), '[]');
    fs.writeFileSync(path.join(pub(), 'tiles', '1', '0_0.webp'), Buffer.from([1]));
  };

  it('renderCheck: none without a manifest, current when hashes match, stale after a pin moves', async () => {
    const { renderCheck } = await import('./stage');
    expect(renderCheck(repo, repo)).toBe('none');
    await writeManifest();
    expect(renderCheck(repo, repo)).toBe('current');
    const file = path.join(repo, 'map', 'lowlight.json');
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    m.places[0].pin[0] += 1;
    fs.writeFileSync(file, JSON.stringify(m));
    expect(renderCheck(repo, repo)).toBe('stale');
  });

  it('copyMapRender copies a current render into the build, refuses a stale one, and does nothing without one', async () => {
    const { copyMapRender } = await import('./stage');
    const work = awkwardTemp('render work');
    fs.cpSync(repo, work, { recursive: true });
    fs.rmSync(path.join(work, 'web'), { recursive: true, force: true });
    expect(copyMapRender(repo, work)).toBe('none');
    await writeManifest();
    expect(copyMapRender(repo, work)).toBe('current');
    expect(fs.existsSync(path.join(work, 'web', 'public', 'map', 'tiles', '1', '0_0.webp'))).toBe(true);
    expect(fs.existsSync(path.join(work, 'web', 'public', 'map', 'windows.json'))).toBe(true);
    // Without blackout tiles nothing else is staged; with them, both sets go too (spec 2026-10-27).
    expect(fs.existsSync(path.join(work, 'web', 'public', 'map', 'tiles-dark'))).toBe(false);
    for (const [dir, ext] of [['tiles-dark', 'webp'], ['tiles-mask', 'png']]) {
      fs.mkdirSync(path.join(pub(), dir, '1'), { recursive: true });
      fs.writeFileSync(path.join(pub(), dir, '1', `0_0.${ext}`), Buffer.from([1]));
    }
    expect(copyMapRender(repo, work)).toBe('current');
    expect(fs.existsSync(path.join(work, 'web', 'public', 'map', 'tiles-dark', '1', '0_0.webp'))).toBe(true);
    expect(fs.existsSync(path.join(work, 'web', 'public', 'map', 'tiles-mask', '1', '0_0.png'))).toBe(true);
    const file = path.join(work, 'map', 'lowlight.json');
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    m.places[0].pin[0] += 1;
    fs.writeFileSync(file, JSON.stringify(m));
    expect(() => copyMapRender(repo, work)).toThrow('the city map render is out of date — run npm run map-render');
    fs.rmSync(work, { recursive: true, force: true });
  });
});
