import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityMapData } from '../../shared/map-schema';
import { AmbienceLayer } from '../src/ui/map/ambience-layer';

/** A 2D context that records the calls it gets (jsdom has no canvas). */
function fakeContext() {
  const calls: string[] = [];
  const target: Record<string, unknown> = { createRadialGradient: () => ({ addColorStop() {} }) };
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => void calls.push(k, ...args.map(String).slice(0, 0))),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const map = (over: Partial<NonNullable<CityMapData['ambience']>> = {}): CityMapData => ({
  version: 1,
  image: '/map/x.webp',
  ambience: {
    signs: [{ at: [10, 10], color: '#ff0000', mode: 'pulse', size: 1 }],
    plumes: [{ at: [20, 20], style: 'steam', amount: 1, lean: 0 }],
    traffic: [{ kind: 'cars', path: [[5, 30], [40, 30]], every: 0.5, speed: 4 }],
    ...over,
  },
  districts: [{ id: 'a', name: 'A', label: [10, 10], border: [{ x: 0, y: 0, i: null, o: null }, { x: 100, y: 0, i: null, o: null }, { x: 100, y: 100, i: null, o: null }] }],
  places: [],
});
const loadedImage = () => Object.assign(document.createElement('img'), {}) as HTMLImageElement;
const CITY = { scale: 1, tx: 0, ty: 0 };

/** A requestAnimationFrame we drive by hand. */
let pending: Map<number, FrameRequestCallback>;
let nextId: number;
beforeEach(() => {
  pending = new Map();
  nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (pending.set(nextId, cb), nextId++));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

function run(layer: AmbienceLayer, seconds: number) {
  let n = 0;
  for (let t = 0; t < seconds; t += 0.05) n = layer.drawFrame(t, 0.05);
  return n;
}

describe('AmbienceLayer', () => {
  it('draws nothing under reduced motion, and never asks for a frame', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ reducedMotion: true, context: ctx, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    expect(layer.drawFrame(1, 0.05)).toBe(0);
    layer.start();
    expect(pending.size).toBe(0);
  });

  it('backs its canvas at the game stage’s zoom too, so it is sharp on big windows (final review)', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    Object.defineProperty(layer.canvas, 'currentCSSZoom', { configurable: true, value: 1.6 });
    layer.setMap(map(), loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    expect([layer.canvas.width, layer.canvas.height]).toEqual([1920, 1280]);
    expect(layer.canvas.style.width).toBe('1200px');
    // A resize that changes only the zoom rebuilds it.
    Object.defineProperty(layer.canvas, 'currentCSSZoom', { configurable: true, value: 1 });
    layer.setView(CITY, { w: 1200, h: 800 });
    expect(layer.canvas.width).toBe(1200);
  });

  it('draws signs, plumes and traffic from the map', () => {
    const { ctx, calls } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, rand: () => 0.3, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    expect(run(layer, 2)).toBeGreaterThan(2);
    expect(calls).toContain('arc');
  });

  it('draws the windows it found in the picture', () => {
    const { ctx } = fakeContext();
    const w = 40;
    const data = new Uint8ClampedArray(w * w * 4).fill(20);
    data.set([250, 250, 200, 255], (20 * w + 20) * 4);
    const empty = map({ signs: [], plumes: [], traffic: [] });
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => ({ data, width: w, height: w }) });
    layer.setMap(empty, loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    expect(layer.windowCount).toBe(1);
  });

  it('skips effects outside the view', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map({ signs: [{ at: [10, 10], color: '#ff0000', mode: 'pulse', size: 1 }, { at: [90, 90], color: '#ff0000', mode: 'pulse', size: 1 }], plumes: [], traffic: [] }), loadedImage());
    // 3× on the top-left corner: (90, 90) is far off screen.
    layer.setView({ scale: 3, tx: 0, ty: 0 }, { w: 1200, h: 800 });
    expect(layer.drawFrame(1, 0.05)).toBe(1);
  });

  it('has no windows when the picture can’t be read, and still draws the rest (Review Focus 1)', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({
      context: ctx,
      readPixels: () => {
        throw new Error('tainted');
      },
    });
    layer.setMap(map(), loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    expect(layer.windowCount).toBe(0);
    expect(layer.drawFrame(1, 0.05)).toBeGreaterThan(0);
  });

  it('waits for a picture still loading, then reads it', () => {
    const { ctx } = fakeContext();
    const read = vi.fn(() => null);
    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { configurable: true, value: false });
    const layer = new AmbienceLayer({ context: ctx, readPixels: read });
    layer.setMap(map(), img);
    expect(read).not.toHaveBeenCalled();
    img.dispatchEvent(new Event('load'));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('runs one loop however often it starts (Review Focus 2)', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    layer.start();
    layer.start();
    layer.stop();
    layer.start();
    expect(pending.size).toBe(1);
    const [cb] = pending.values();
    pending.clear();
    cb(16);
    expect(pending.size).toBe(1);
  });

  it('stop() asks for no more frames', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    layer.start();
    const [cb] = pending.values();
    layer.stop();
    pending.clear();
    cb(16);
    expect(pending.size).toBe(0);
  });

  it('skips drawing while the tab is hidden', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    const draw = vi.spyOn(layer, 'drawFrame');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    layer.start();
    const [cb] = pending.values();
    cb(16);
    expect(draw).not.toHaveBeenCalled();
  });

  it('sizes the canvas to the screen at the device pixel ratio', () => {
    const { ctx } = fakeContext();
    vi.stubGlobal('devicePixelRatio', 2);
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setView(CITY, { w: 600, h: 400 });
    expect(layer.canvas.width).toBe(1200);
    expect(layer.canvas.style.width).toBe('600px');
  });
});

describe('AmbienceLayer review fixes', () => {
  it('redraws at once when the camera moves, so it never trails the picture', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    layer.start();
    const draw = vi.spyOn(layer, 'drawFrame');
    layer.setView({ scale: 2, tx: -100, ty: -50 }, { w: 1200, h: 800 });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0][1]).toBe(0);
  });

  it('clears the whole canvas in device pixels, so glows never pile up at a fractional edge', () => {
    vi.stubGlobal('devicePixelRatio', 1.25);
    const calls: unknown[][] = [];
    const ctx = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => void calls.push([k, ...a])),
      set: (t, k: string, v) => ((t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    layer.setView(CITY, { w: 1279, h: 853 });
    calls.length = 0;
    layer.drawFrame(1, 0.05);
    const i = calls.findIndex((c) => c[0] === 'clearRect');
    expect(calls[i - 1]).toEqual(['setTransform', 1, 0, 0, 1, 0, 0]);
    expect(calls[i]).toEqual(['clearRect', 0, 0, layer.canvas.width, layer.canvas.height]);
  });

  it('keeps running state for the same map: no second scan, traffic carries on', () => {
    const { ctx } = fakeContext();
    const read = vi.fn(() => null);
    const layer = new AmbienceLayer({ context: ctx, rand: () => 0.3, readPixels: read });
    const m = map();
    const img = loadedImage();
    layer.setMap(m, img);
    layer.setView(CITY, { w: 1200, h: 800 });
    for (let i = 0; i < 20; i++) layer.drawFrame(i * 0.05, 0.05);
    const before = layer.drawFrame(1, 0);
    layer.setMap(structuredClone(m), img);
    expect(read).toHaveBeenCalledTimes(1);
    expect(layer.drawFrame(1, 0)).toBe(before);
  });

  it('a new map starts with smoke already rising and traffic on the road', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, rand: () => 0.3, readPixels: () => null });
    layer.setMap(map({ signs: [] }), loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    // dt 0: nothing new spawns, so what's drawn was there from the start
    expect(layer.drawFrame(0, 0)).toBeGreaterThan(3);
  });
});

describe('AmbienceLayer minors', () => {
  it('a pixel-ratio change alone resizes the backing store (a monitor switch)', () => {
    const { ctx } = fakeContext();
    vi.stubGlobal('devicePixelRatio', 1);
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setView(CITY, { w: 600, h: 400 });
    expect(layer.canvas.width).toBe(600);
    vi.stubGlobal('devicePixelRatio', 2);
    layer.setView(CITY, { w: 600, h: 400 });
    expect(layer.canvas.width).toBe(1200);
  });

  it('clearMap stops drawing the last map', () => {
    const { ctx } = fakeContext();
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map(), loadedImage());
    layer.setView(CITY, { w: 1200, h: 800 });
    layer.clearMap();
    expect(layer.drawFrame(1, 0.05)).toBe(0);
  });
});

describe('AmbienceLayer with a windows list (rendered map)', () => {
  it('a windows list skips the pixel scan', async () => {
    const readPixels = vi.fn(() => null);
    const layer = new AmbienceLayer({ readPixels });
    const map = JSON.parse(readFileSync('map/lowlight.json', 'utf8'));
    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { value: true });
    layer.setMap(map, img, [{ x: 50, y: 50, z: 10, district: 'karasu', color: '#ffb347', seed: 0.5, dims: false }]);
    expect(readPixels).not.toHaveBeenCalled();
  });
});

describe('AmbienceLayer traffic heights (rendered map spec §5)', () => {
  const carYs = (lift: boolean) => {
    const ys: number[] = [];
    const target: Record<string, unknown> = { createRadialGradient: (_x: number, y: number) => (ys.push(y), { addColorStop() {} }) };
    const ctx = new Proxy(target, { get: (t, k: string) => (k in t ? t[k] : () => undefined), set: (t, k: string, v) => ((t[k] = v), true) }) as unknown as CanvasRenderingContext2D;
    const layer = new AmbienceLayer({ context: ctx, readPixels: () => null });
    layer.setMap(map({ signs: [], plumes: [], traffic: [{ kind: 'cars', path: [[5, 30], [40, 30]], every: 0.5, speed: 4, z: 100 }] }), loadedImage());
    layer.setLift(lift);
    layer.setView(CITY, { w: 1200, h: 800 });
    for (let t = 0; t < 2; t += 0.05) layer.drawFrame(t, 0.05);
    return ys;
  };
  it('painting mode: elevated traffic stays on the ground', () => {
    const ys = carYs(false);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(Math.abs(y - 240)).toBeLessThan(15);
  });
  it('with lift on, highway cars draw at road height', async () => {
    const { liftPct } = await import('../../shared/map-projection');
    const road = 240 - (liftPct(100) / 100) * 800;
    for (const y of carYs(true)) expect(Math.abs(y - road)).toBeLessThan(15);
  });

  // Blackouts phase 2 §3: windows and signs go out with their district; what moves keeps moving.
  describe('in a blackout', () => {
    const dark = (ids: string[]) => ({ any: () => true, at: (id: string) => (ids.includes(id) ? 1 : 0) });
    const city = () => map({ signs: [{ at: [60, 20], color: '#ff0000', mode: 'pulse', size: 1 }], plumes: [], traffic: [{ kind: 'cars', path: [[5, 30], [95, 30]], every: 0.2, speed: 4 }] });
    const win = { x: 70, y: 20, district: 'a', color: '#ffcc66', seed: 0.1, dims: false };
    const layerFor = () => {
      const { ctx } = fakeContext();
      const layer = new AmbienceLayer({ context: ctx, rand: () => 0.3, readPixels: () => null });
      layer.setMap(city(), loadedImage(), [win]);
      layer.setView(CITY, { w: 1200, h: 800 });
      return layer;
    };
    it("a dark district's sign and windows aren't drawn; the cars still are", () => {
      const lit = run(layerFor(), 2);
      const layer = layerFor();
      layer.setDarkness(dark(['a']));
      const out = run(layer, 2);
      expect(out).toBe(lit - 2);
      expect(out).toBeGreaterThan(0);
    });
    it('another district going dark leaves these alone', () => {
      const lit = run(layerFor(), 2);
      const layer = layerFor();
      layer.setDarkness(dark(['b']));
      expect(run(layer, 2)).toBe(lit);
    });
    it('with nothing dark, nothing is looked up', () => {
      const layer = layerFor();
      layer.setDarkness({ any: () => false, at: () => { throw new Error('looked up'); } });
      expect(() => run(layer, 1)).not.toThrow();
    });
  });
});
