import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TileManifest } from '../../shared/map-tiles';
import { TileLayer, tilesForView } from '../src/ui/map/tile-layer';

const manifest: TileManifest = {
  version: 1,
  size: [4608, 3072],
  tile: 512,
  levels: [
    { scale: 1, cols: 9, rows: 6, tiles: 'all' },
    { scale: 4, cols: 36, rows: 24, tiles: 'all' },
    { scale: 8, cols: 72, rows: 48, tiles: ['40_20'] },
  ],
  deep: ['karasu'],
  dataHash: 'x',
  blender: '5.2.2',
  pinHeights: {},
  rendered: 'now',
};
const screen = { w: 1600, h: 900 };
const map = { w: 1600, h: 1600 / 1.5 };
/** The view with map % (x, y) at the screen's centre, at `scale`. */
const viewAt = (scale: number, x: number, y: number) => ({ scale, tx: screen.w / 2 - (x / 100) * map.w * scale, ty: screen.h / 2 - (y / 100) * map.h * scale });

describe('tilesForView', () => {
  it('at 1x the 1x tiles show', () => {
    const t = tilesForView(manifest, { scale: 1, tx: 0, ty: 0 }, map, screen, 1);
    expect(new Set(t.map((x) => x.scale))).toEqual(new Set([1]));
    expect(t.length).toBe(54);
  });
  it('at 3x the 4x tiles show', () => {
    const t = tilesForView(manifest, viewAt(3, 50, 50), map, screen, 1);
    expect(t.some((x) => x.scale === 4 && !x.fallback)).toBe(true);
    expect(t.every((x) => x.scale !== 8)).toBe(true);
  });
  // 8x tiles are for high-density screens (a 1600 px stage at 7x needs 4x tiles; at device pixel ratio 2 it needs 8x).
  it('no 8x tile outside deepZoom: the 4x tile fills in', () => {
    const t = tilesForView(manifest, viewAt(7, 2, 2), map, screen, 2);
    expect(t.some((x) => x.scale === 4 && x.key === '0_0' && x.fallback)).toBe(true);
    expect(t.some((x) => x.scale === 8)).toBe(false);
  });
  it('at 7x over the 8x tile it shows', () => {
    // 8x tile 40_20 covers map x 55.6–56.9 %, y 41.7–43.75 %.
    const t = tilesForView(manifest, viewAt(7, 56.2, 42.7), map, screen, 2);
    expect(t.some((x) => x.scale === 8 && x.key === '40_20' && !x.fallback)).toBe(true);
  });
});

describe('TileLayer', () => {
  let world: HTMLElement;
  beforeEach(() => {
    world = document.createElement('div');
    document.body.append(world);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest })));
  });
  afterEach(() => {
    world.remove();
    vi.unstubAllGlobals();
  });
  const imgs = () => [...world.querySelectorAll<HTMLImageElement>('img.map-tile')];

  it('tiles abut with no gap at every level', async () => {
    const layer = new TileLayer(world, { base: '/map/' });
    await layer.load();
    layer.update({ scale: 1, tx: 0, ty: 0 }, map, screen, 1);
    const row0 = imgs().filter((i) => i.dataset.key!.startsWith('1/') && i.dataset.key!.endsWith('_0')).sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
    for (let k = 0; k < row0.length - 1; k++) expect(parseFloat(row0[k]!.style.left) + parseFloat(row0[k]!.style.width)).toBeCloseTo(parseFloat(row0[k + 1]!.style.left), 6);
    expect(row0[0]!.getAttribute('src')).toBe('/map/tiles/1/0_0.webp');
  });
  it('a scrolled-away tile stops loading', async () => {
    const layer = new TileLayer(world, { base: '/map/' });
    await layer.load();
    layer.update(viewAt(3, 10, 10), map, screen, 1);
    const far = imgs().find((i) => i.dataset.key!.startsWith('4/'))!;
    const key = far.dataset.key!;
    layer.update(viewAt(3, 90, 90), map, screen, 1);
    const still = imgs().find((i) => i.dataset.key === key);
    expect(still === undefined || still.getAttribute('src') === '').toBe(true);
  });
  it('the cache stays at its size', async () => {
    const layer = new TileLayer(world, { base: '/map/', cacheSize: 200 });
    await layer.load();
    let inView = 0;
    for (let x = 5; x <= 95; x += 3) for (let y = 5; y <= 95; y += 9) {
      layer.update(viewAt(4, x, y), map, screen, 1);
      for (const i of imgs()) i.dispatchEvent(new Event('load'));
      inView = tilesForView(manifest, viewAt(4, x, y), map, screen, 1).length + 54;
    }
    // Tiles in view (and the 1x underlay) are never dropped; everything else is held to the cache's size.
    expect(imgs().length).toBeLessThanOrEqual(200 + inView);
  });
});

describe('TileLayer on a slow or failing link (final review)', () => {
  let world: HTMLElement;
  beforeEach(() => {
    world = document.createElement('div');
    document.body.append(world);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest })));
  });
  afterEach(() => {
    world.remove();
    vi.unstubAllGlobals();
  });
  const imgs = () => [...world.querySelectorAll<HTMLImageElement>('img.map-tile')];
  const settled = async (p: Promise<boolean>) => Promise.race([p, new Promise<'pending'>((r) => setTimeout(() => r('pending'), 20))]);

  it('a tile cancelled as it scrolls away is not a failure', async () => {
    const layer = new TileLayer(world, { base: '/map/' });
    await layer.load();
    const first = layer.firstTileFailed();
    layer.update(viewAt(3, 10, 10), map, screen, 1);
    const sharp = imgs().filter((i) => i.dataset.key!.startsWith('4/'));
    layer.update(viewAt(3, 90, 90), map, screen, 1);
    // The browser fires error on an img whose src was cleared.
    for (const i of sharp) i.dispatchEvent(new Event('error'));
    expect(await settled(first)).toBe('pending');
  });
  it('only a 1x tile settles the first-tile check', async () => {
    const layer = new TileLayer(world, { base: '/map/' });
    await layer.load();
    const first = layer.firstTileFailed();
    layer.update(viewAt(3, 50, 50), map, screen, 1);
    imgs().find((i) => i.dataset.key!.startsWith('4/'))!.dispatchEvent(new Event('error'));
    expect(await settled(first)).toBe('pending');
    imgs().find((i) => i.dataset.key!.startsWith('1/'))!.dispatchEvent(new Event('error'));
    expect(await settled(first)).toBe(true);
  });
  it('a failed tile is tried again on the next update', async () => {
    const layer = new TileLayer(world, { base: '/map/' });
    await layer.load();
    layer.update({ scale: 1, tx: 0, ty: 0 }, map, screen, 1);
    const bad = imgs().find((i) => i.dataset.key === '1/0_0')!;
    bad.dispatchEvent(new Event('error'));
    layer.update({ scale: 1, tx: 0, ty: 0 }, map, screen, 1);
    const again = imgs().find((i) => i.dataset.key === '1/0_0')!;
    expect(again).not.toBe(bad);
    expect(again.getAttribute('src')).toBe('/map/tiles/1/0_0.webp');
  });
  it('load() starts a fresh first-tile check', async () => {
    const layer = new TileLayer(world, { base: '/map/' });
    await layer.load();
    const first = layer.firstTileFailed();
    layer.update({ scale: 1, tx: 0, ty: 0 }, map, screen, 1);
    imgs()[0]!.dispatchEvent(new Event('error'));
    expect(await first).toBe(true);
    await layer.load();
    expect(await settled(layer.firstTileFailed())).toBe('pending');
  });
});

describe('the map\'s CSS keeps hidden things hidden and the effects on top (final review)', () => {
  // Studio is private: the public repo has no studio/.
  it.skipIf(!existsSync('studio'))('Studio hides the painting under its tiles', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('studio/web/style.css', 'utf8')).toMatch(/\.map-canvas-img\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
  });
  it('the screen effects sit over the world', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('web/src/ui/map/map.css', 'utf8')).toMatch(/\.map-screen > \.map-fx\s*\{[^}]*z-index:\s*1/);
  });
});

describe('the tiles stay under the city layer (pins missing in-game, 2026-10-25)', () => {
  it('.map-tiles makes its own stacking context at the bottom, so tile z-indexes never cover borders, names and pins', async () => {
    const { readFileSync } = await import('node:fs');
    const rule = /\.map-tiles\s*\{([^}]*)\}/.exec(readFileSync('web/src/ui/map/map.css', 'utf8'))![1]!;
    expect(rule).toMatch(/z-index:\s*0/);
    expect(rule).toMatch(/isolation:\s*isolate/);
  });
});
