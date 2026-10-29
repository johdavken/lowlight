import { describe, expect, it } from 'vitest';
import type { CityMapData, MapPlume, MapSign, MapTraffic } from '../../shared/map-schema';
import { MAX_DT, PlumeRun, TrafficRun, pathLength, pointAlong, puffLook, scatterWindows, signLevel, windowLevel, windowShown } from '../src/ui/map/ambience';

const box = (x0: number, x1: number) => [
  { x: x0, y: 0, i: null, o: null },
  { x: x1, y: 0, i: null, o: null },
  { x: x1, y: 100, i: null, o: null },
  { x: x0, y: 100, i: null, o: null },
];
const map = (windows?: number): CityMapData => ({
  version: 1,
  image: '/map/x.webp',
  districts: [{ id: 'a', name: 'A', label: [10, 10], border: box(0, 60), ...(windows !== undefined && { windows }) }],
  places: [],
});

/** A dark 40 × 40 picture: a 1-px lit window at (20,20), one outside the border at (32,20), a flat bright block at (2–14, 24–36). */
function picture() {
  const width = 40;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  const set = (x: number, y: number, v: number) => data.set([v, v, v * 0.8, 255], (y * width + x) * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, 20);
  for (let y = 24; y <= 36; y++) for (let x = 2; x <= 14; x++) set(x, y, 230);
  set(20, 20, 240);
  set(32, 20, 240);
  return { data, width, height };
}

describe('scatterWindows', () => {
  it('finds the lit window inside a border, in map %', () => {
    const found = scatterWindows(picture(), map());
    expect(found.filter((w) => w.y < 55)).toEqual([expect.objectContaining({ x: 50, y: 50, district: 'a' })]);
  });

  it('skips the inside of a flat bright area', () => {
    const inside = scatterWindows(picture(), map()).filter((w) => w.x > 15 && w.x < 30 && w.y > 65 && w.y < 85);
    expect(inside).toEqual([]);
  });

  it('is the same on two runs', () => {
    expect(scatterWindows(picture(), map())).toEqual(scatterWindows(picture(), map()));
  });
});

describe('windowShown and windowLevel', () => {
  const w = (seed: number, dims = false) => ({ x: 1, y: 1, district: 'a', color: 'rgb(1,1,1)', seed, dims });
  it('windows: 0 shows none; absent shows seeds under 0.55', () => {
    expect([0.01, 0.3, 0.9].some((s) => windowShown(w(s), map(0)))).toBe(false);
    expect(windowShown(w(0.5), map())).toBe(true);
    expect(windowShown(w(0.6), map())).toBe(false);
  });
  it("the Ribbon's windows follow Karasu's WINDOWS (the render tags them 'ribbon', which has no district of its own)", () => {
    const ribbon = { ...w(0.3), district: 'ribbon' };
    const karasu = (windows: number): CityMapData => ({ ...map(), districts: [{ id: 'karasu', name: 'Karasu', label: [90, 30], windows }] });
    expect(windowShown(ribbon, karasu(0))).toBe(false);
    expect(windowShown(ribbon, karasu(1))).toBe(true);
  });
  it('stays within 0–1, brightening or dimming', () => {
    for (let t = 0; t < 30; t += 0.05) {
      for (const x of [w(0.2), w(0.4, true)]) {
        const v = windowLevel(x, t);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('signLevel', () => {
  const sign = (mode: MapSign['mode']): MapSign => ({ at: [1, 1], color: '#ff0000', mode, size: 1 });
  it.each(['pulse', 'blink', 'flicker'] as const)('%s stays within 0–1', (mode) => {
    for (let t = 0; t < 20; t += 0.01) {
      const v = signLevel(sign(mode), t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('blink is on for 12 % of a 2 s cycle', () => {
    let on = 0;
    for (let i = 0; i < 2000; i++) if (signLevel(sign('blink'), i / 1000) === 1) on++;
    expect(on / 2000).toBeCloseTo(0.12, 2);
  });
});

describe('paths', () => {
  it('counts y at 1/1.5 for the 3:2 frame', () => {
    expect(pathLength([[0, 0], [10, 0], [10, 15]])).toBeCloseTo(20);
  });
  it('walks from end to end, and past the end is null', () => {
    const p: [number, number][] = [[0, 0], [10, 0], [10, 15]];
    expect(pointAlong(p, 0)).toMatchObject({ x: 0, y: 0 });
    expect(pointAlong(p, 20)).toMatchObject({ x: 10, y: 15 });
    expect(pointAlong(p, 20.5)).toBeNull();
  });
  it('steps over a zero-length segment without NaN (Review Focus 5)', () => {
    const q = pointAlong([[5, 5], [5, 5], [9, 5]], 2)!;
    expect(q.x).toBeCloseTo(7);
    expect(Number.isNaN(q.x) || Number.isNaN(q.y) || Number.isNaN(q.dx)).toBe(false);
  });
});

describe('TrafficRun', () => {
  const cars: MapTraffic = { kind: 'cars', path: [[0, 0], [50, 0]], every: 2, speed: 10 };
  it('spawns about every `every` seconds', () => {
    const run = new TrafficRun([cars], () => 0.5);
    let spawned = 0;
    let seen = 0;
    for (let i = 0; i < 200; i++) {
      run.step(0.05);
      if (run.movers.length > seen) spawned += run.movers.length - seen;
      seen = run.movers.length;
    }
    expect(spawned).toBeGreaterThanOrEqual(4);
    expect(spawned).toBeLessThanOrEqual(6);
  });
  it('a mover is gone after the length over the speed', () => {
    const run = new TrafficRun([{ ...cars, every: 120 }], () => 0.01);
    for (let i = 0; i < 2000 && !run.movers.length; i++) run.step(0.05);
    expect(run.movers).toHaveLength(1);
    for (let i = 0; i < 5 / 0.05 + 2; i++) run.step(0.05);
    expect(run.movers).toHaveLength(0);
  });
  it('a long step moves no further than MAX_DT', () => {
    const run = new TrafficRun([{ ...cars, every: 0.5 }], () => 0.01);
    for (let i = 0; i < 40 && !run.movers.length; i++) run.step(0.05);
    const d0 = run.movers[0].d;
    run.step(5);
    expect(run.movers[0].d - d0).toBeCloseTo(cars.speed * MAX_DT);
  });
});

describe('PlumeRun', () => {
  const plume = (p: Partial<MapPlume> = {}): MapPlume => ({ at: [50, 50], style: 'smoke', amount: 1, lean: 0.5, ...p });
  it('puffs rise and drift with the lean, then go', () => {
    const run = new PlumeRun([plume()], () => 0.5);
    for (let i = 0; i < 20; i++) run.step(0.05);
    const p = run.puffs[0];
    expect(p.y).toBeLessThan(50);
    expect(p.x).toBeGreaterThan(50);
    const run2 = new PlumeRun([plume({ amount: 0 })], () => 0.5);
    run2.puffs.push({ plume: plume(), x: 50, y: 50, age: 0, life: 1, r0: 0.3, wob: 0 });
    for (let i = 0; i < 30; i++) run2.step(0.05);
    expect(run2.puffs).toHaveLength(0);
  });
  it('smoke is a light grey that reads on dark art; steam paler; a tint wins', () => {
    const at = (p: MapPlume) => puffLook({ plume: p, x: 0, y: 0, age: 0.15 * 5, life: 5, r0: 0.3, wob: 0 });
    expect(at(plume())).toMatchObject({ color: '#9a94a6' });
    expect(at(plume()).alpha).toBeCloseTo(0.42);
    expect(at(plume({ style: 'steam' }))).toMatchObject({ color: '#d8e4f0' });
    expect(at(plume({ style: 'steam' })).alpha).toBeCloseTo(0.22);
    expect(at(plume({ tint: '#7a3a9a' })).color).toBe('#7a3a9a');
  });
});

describe('trains', () => {
  const train: MapTraffic = { kind: 'train', path: [[0, 0], [50, 0]], every: 120, speed: 10 };
  it('a train stays until its last car has left the path, and lights before the start are not on it', () => {
    const run = new TrafficRun([train], () => 0.01);
    for (let i = 0; i < 2000 && !run.movers.length; i++) run.step(0.05);
    const m = run.movers[0];
    expect(run.at(m, m.d - 0.9)).toBeNull(); // the second car hasn't reached the path yet
    for (let i = 0; i < 50 / 10 / 0.05 + 2; i++) run.step(0.05); // the head has passed the end
    expect(run.movers).toHaveLength(1);
    for (let i = 0; i < (6 * 0.9) / 10 / 0.05 + 2; i++) run.step(0.05);
    expect(run.movers).toHaveLength(0);
  });
});
