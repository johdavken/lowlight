import { describe, expect, it } from 'vitest';
import type { CityMapData } from '../../shared/map-schema';
import { cityView, clampView, coverSize, districtFrame, pinchView, zoomAt } from '../src/ui/map/camera';

const map = (): CityMapData => ({
  version: 1,
  image: '/map/x.webp',
  districts: [
    { id: 'k', name: 'Karasu', label: [80, 30] },
    { id: 'v', name: 'Velvet', label: [70, 20] },
    { id: 'e', name: 'Empty', label: [10, 10] },
  ],
  places: [
    { id: 'k1', name: 'One', district: 'k', pin: [79, 29] },
    { id: 'k2', name: 'Two', district: 'k', pin: [89, 41] },
    { id: 'v1', name: 'Orchid', district: 'v', pin: [73.6, 19.8] },
  ],
});

describe('districtFrame', () => {
  it("is the pins' box plus 3 each side", () => {
    expect(districtFrame(map(), 'k')).toEqual({ x0: 76, y0: 26, x1: 92, y1: 44 });
  });

  it('grows a one-place district to 14 × 14 around its pin (Review Focus 1)', () => {
    const f = districtFrame(map(), 'v')!;
    expect(f.x1 - f.x0).toBeCloseTo(14);
    expect(f.y1 - f.y0).toBeCloseTo(14);
    expect((f.x0 + f.x1) / 2).toBeCloseTo(73.6);
    expect((f.y0 + f.y1) / 2).toBeCloseTo(19.8);
  });

  it('is null for a district without places', () => {
    expect(districtFrame(map(), 'e')).toBeNull();
  });
});

describe('the cover-fit map', () => {
  const screen = { w: 1600, h: 900 };
  const map = coverSize(screen, 3 / 2);

  it('covers a 16:9 screen with a 3:2 picture, cropping top and bottom', () => {
    expect(map).toEqual({ w: 1600, h: 1600 / 1.5 });
  });

  it('the city view is 1×, centred top to bottom', () => {
    const v = cityView(map, screen);
    expect(v.scale).toBe(1);
    expect(v.tx).toBe(0);
    expect(v.ty).toBeCloseTo((900 - 1600 / 1.5) / 2);
  });

  it("drags the city's edge as far as the screen's middle (spec 2026-10-28 §2)", () => {
    expect(clampView({ scale: 1, tx: 9999, ty: 9999 }, map, screen)).toEqual({ scale: 1, tx: 800, ty: 450 });
    expect(clampView({ scale: 2, tx: -9999, ty: -9999 }, map, screen)).toEqual({ scale: 2, tx: 800 - 3200, ty: 450 - map.h * 2 });
    expect(clampView({ scale: 1, tx: 300, ty: -100 }, map, screen)).toEqual({ scale: 1, tx: 300, ty: -100 });
  });

  it('the city view is inside the new bounds and unchanged', () => {
    expect(cityView(map, screen)).toEqual({ scale: 1, tx: 0, ty: (900 - map.h) / 2 });
  });

  it('zooms about the pointer, which stays over the same spot, between 1× and the cap', () => {
    const v0 = cityView(map, screen);
    const at = { x: 800, y: 450 };
    const v = zoomAt(v0, 2, at, map, screen, 5);
    expect(v.scale).toBe(2);
    expect((at.x - v.tx) / v.scale).toBeCloseTo((at.x - v0.tx) / v0.scale);
    expect((at.y - v.ty) / v.scale).toBeCloseTo((at.y - v0.ty) / v0.scale);
    expect(zoomAt(v, 100, at, map, screen, 5).scale).toBe(5);
    expect(zoomAt(v, 0.01, at, map, screen, 5)).toEqual(v0);
  });

});

describe('pinchView (spec 2026-10-28 §4)', () => {
  const screen = { w: 1600, h: 900 };
  const map = coverSize(screen, 3 / 2);
  const start = cityView(map, screen);
  const from = { mid: { x: 400, y: 300 }, dist: 100 };

  it('keeps the map point under the fingers under their midpoint', () => {
    const v = pinchView(start, from, { mid: { x: 500, y: 350 }, dist: 200 }, map, screen, 5);
    expect(v.scale).toBe(2);
    expect((500 - v.tx) / 2).toBeCloseTo((400 - start.tx) / 1);
    expect((350 - v.ty) / 2).toBeCloseTo((300 - start.ty) / 1);
  });

  it('clamps the scale to 1× and to the max', () => {
    expect(pinchView(start, from, { mid: from.mid, dist: 10 }, map, screen, 5).scale).toBe(1);
    expect(pinchView(start, from, { mid: from.mid, dist: 10000 }, map, screen, 5).scale).toBe(5);
  });

  it('pans with two fingers at a steady distance', () => {
    const v = pinchView(start, from, { mid: { x: 460, y: 340 }, dist: 100 }, map, screen, 5);
    expect(v.tx).toBeCloseTo(start.tx + 60);
    expect(v.ty).toBeCloseTo(start.ty + 40);
  });

  it('the result is clamped', () => {
    expect(pinchView(start, from, { mid: { x: 5400, y: 300 }, dist: 100 }, map, screen, 5).tx).toBe(screen.w / 2);
  });
});
