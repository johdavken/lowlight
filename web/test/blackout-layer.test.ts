// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { TileManifest } from '../../shared/map-tiles';
import { BlackoutLayer } from '../src/ui/map/blackout-layer';

// Blackouts phase 1 (spec 2026-10-27): the dark tiles split per district, one opacity per district.
const W = 4, H = 4;
const manifest = (dark = true): TileManifest => ({
  version: 1,
  size: [4608, 3072],
  tile: 512,
  levels: [
    { scale: 1, cols: 9, rows: 6, tiles: 'all' },
    { scale: 2, cols: 18, rows: 12, tiles: 'all' },
  ],
  deep: [],
  dataHash: 'x',
  blender: '5.2',
  pinHeights: {},
  rendered: 'now',
  ...(dark && { dark: { levels: [1, 2] }, mask: { districts: ['a', 'b', 'spine'] } }),
});

/** Dark tiles are black; masks are district a (index 1) on the left half, b (index 2) on the right. */
async function loadPixels(url: string) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4 + 3] = 255;
    if (url.includes('tiles-mask')) data[i * 4] = i % W < W / 2 ? 8 : 16;
  }
  return { data, width: W, height: H };
}
function makeCanvas() {
  const c = document.createElement('canvas');
  const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData: () => {} };
  (c as unknown as { getContext: () => unknown }).getContext = () => ctx;
  return c;
}

let t = 0;
let frames: (() => void)[] = [];
const raf = (f: () => void) => frames.push(f);
const step = (ms: number) => {
  for (let k = 0; k < ms; k += 16) {
    t += 16;
    const due = frames;
    frames = [];
    for (const f of due) f();
  }
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const map = { w: 900, h: 600 }, screen = { w: 450, h: 300 };
const view = { scale: 1, tx: 0, ty: 0 };

let world: HTMLElement;
const make = (m: TileManifest, cacheSize = 48) => {
  const l = new BlackoutLayer(world, { base: '/map/', cacheSize, loadPixels, makeCanvas, raf, now: () => t });
  l.setManifest(m);
  return l;
};
const box = (l: BlackoutLayer, index: number) => l.el.querySelector<HTMLElement>(`.map-blackout-d[data-index="${index}"]`);
const canvases = (l: BlackoutLayer, index: number) => [...(box(l, index)?.querySelectorAll('canvas') ?? [])];

beforeEach(() => {
  document.body.innerHTML = '';
  world = document.createElement('div');
  document.body.append(world);
  t = 0;
  frames = [];
});

describe('BlackoutLayer', () => {
  it('without a dark set it does nothing and stays hidden (Review Focus 4)', async () => {
    const l = make(manifest(false));
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    expect(l.el.hidden).toBe(true);
    expect(l.el.querySelectorAll('canvas').length).toBe(0);
  });

  it("reduced motion: a's tiles end fully dark, b stays lit", async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    expect(l.el.hidden).toBe(false);
    expect(canvases(l, 1).length).toBeGreaterThan(1);
    expect(box(l, 1)!.style.opacity).toBe('1');
    expect(box(l, 2)?.hidden ?? true).toBe(true);
  });

  it('every tile of a district shares one opacity mid-animation (Review Focus 1)', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], false);
    await flush();
    step(160);
    const cs = canvases(l, 1);
    expect(cs.length).toBeGreaterThan(1);
    expect(new Set(cs.map((c) => c.parentElement)).size).toBe(1);
    const op = Number(box(l, 1)!.style.opacity);
    expect(op).toBeGreaterThan(0);
    expect(op).toBeLessThan(1);
    expect(cs.every((c) => !c.style.opacity)).toBe(true);
    step(1200);
    expect(box(l, 1)!.style.opacity).toBe('1');
  });

  it('a tile coming into view while a district is dark arrives dark (Review Focus 3)', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    const before = new Set(canvases(l, 1));
    l.update({ scale: 1, tx: -400, ty: 0 }, map, screen, 1);
    await flush();
    const fresh = canvases(l, 1).filter((c) => !before.has(c));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((c) => c.parentElement === box(l, 1))).toBe(true);
    expect(box(l, 1)!.style.opacity).toBe('1');
    expect(frames.length).toBe(0);
  });

  it('coming back sweeps across the district, then hides it', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    l.set([], false);
    step(1200);
    expect(box(l, 1)!.style.getPropertyValue('mask-image')).toContain('linear-gradient');
    step(1600);
    expect(box(l, 1)!.hidden).toBe(true);
    expect(box(l, 1)!.style.getPropertyValue('mask-image')).toBe('');
  });

  it('the cache stays at or under its cap after panning away (Review Focus 5)', async () => {
    const l = make(manifest(), 6);
    l.set(['a'], true);
    for (let x = 0; x <= 450; x += 150) {
      l.update({ scale: 1, tx: -x, ty: 0 }, map, screen, 1);
      await flush();
    }
    l.update({ scale: 1, tx: -450, ty: -300 }, map, screen, 1);
    await flush();
    expect(l.cachedTiles()).toBeLessThanOrEqual(6 + 15);
    const visible = l.cachedTiles();
    l.update({ scale: 1, tx: 0, ty: 0 }, map, screen, 1);
    await flush();
    expect(l.cachedTiles()).toBeLessThanOrEqual(Math.max(visible, 15) + 6);
  });

  it('nothing loads while every district is lit', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    await flush();
    expect(l.cachedTiles()).toBe(0);
  });

  it('going dark again during the sweep back ends fully dark, no sweep left (final review)', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    l.set([], false);
    step(1000);
    l.set(['a'], false);
    step(1400);
    expect(box(l, 1)!.style.opacity).toBe('1');
    expect(box(l, 1)!.style.getPropertyValue('mask-image')).toBe('');
  });

  it('reopening the map on the same render keeps the dark tiles (no lit flash, final review)', async () => {
    const m = manifest();
    const l = make(m);
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    const before = canvases(l, 1);
    l.setManifest(JSON.parse(JSON.stringify(m)));
    expect(canvases(l, 1)).toEqual(before);
    expect(box(l, 1)!.style.opacity).toBe('1');
  });

  it('a new render with a different district table starts with every district lit', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    l.setManifest({ ...manifest(), mask: { districts: ['b', 'a', 'spine'] }, rendered: 'later' });
    expect(l.el.querySelectorAll('canvas').length).toBe(0);
    expect(box(l, 1)?.hidden ?? true).toBe(true);
  });

  it('the lower level under a sharper one hides once the sharper tiles are in (no blocky edge, final review)', async () => {
    const l = make(manifest());
    l.set(['a'], true);
    l.update({ scale: 6, tx: -1200, ty: -600 }, map, screen, 1);
    await flush();
    step(400);
    const cs = canvases(l, 1);
    const low = cs.filter((c) => c.style.zIndex === '1'), sharp = cs.filter((c) => c.style.zIndex === '2');
    expect(low.length).toBeGreaterThan(0);
    expect(sharp.length).toBeGreaterThan(0);
    expect(low.every((c) => c.hidden)).toBe(true);
    expect(sharp.every((c) => !c.hidden)).toBe(true);
  });

  // Blackouts phase 2 §3–4: the live layer reads how dark each district is; the tiles go once all is lit again.
  it('darkness is 0 at rest and 1 inside a dark district', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    expect(l.any()).toBe(false);
    expect(l.at('a', 10)).toBe(0);
    l.set(['a'], true);
    await flush();
    step(400);
    expect(l.any()).toBe(true);
    expect(l.at('a', 10)).toBe(1);
    expect(l.at('b', 10)).toBe(0);
    expect(l.at('nowhere', 10)).toBe(0);
  });

  it('darkness follows the sweep front', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], false);
    await flush();
    step(1400);
    l.set([], false);
    step(1200);
    const m = /transparent ([\d.]+)%/.exec(box(l, 1)!.style.getPropertyValue('mask-image'));
    expect(m).not.toBeNull();
    const front = Number(m![1]) + 3;
    expect(l.at('a', front - 10)).toBe(0);
    expect(l.at('a', front + 10)).toBe(1);
  });

  it('tiles are dropped once everything is lit again', async () => {
    const l = make(manifest());
    l.update(view, map, screen, 1);
    l.set(['a'], true);
    await flush();
    step(400);
    expect(l.cachedTiles()).toBeGreaterThan(0);
    l.set([], false);
    step(3000);
    expect(l.any()).toBe(false);
    expect(l.cachedTiles()).toBe(0);
  });
});
