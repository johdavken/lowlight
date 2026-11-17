import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { loadCity } from './load';
import type { Box } from './geometry';

const city = loadCity('.');
const on = generate(city), off = generate(city, { joins: false });
const g = on.geometry, g0 = off.geometry;
const key = (x: unknown) => JSON.stringify(x);

describe('joins: what stands between the districts (2026-11-16)', () => {
  it('only adds: every building, prop, strip, curve, light, pin and lit window a district made is still there, unchanged', () => {
    for (const k of ['buildings', 'props', 'strips', 'curves', 'lights', 'volumes'] as const) {
      const now = new Set(g[k].map(key));
      expect(g0[k].filter((x) => !now.has(key(x))).length, k).toBe(0);
    }
    expect(g.pinHeights).toEqual(g0.pinHeights);
    expect(on.windows).toEqual(off.windows);
  });
  const infill = g.buildings.filter((b) => b.kind === 'infill');
  it('fills the gaps with low blocks, each owned by a district so it goes dark with it', () => {
    expect(infill.length).toBeGreaterThan(300);
    expect(g0.buildings.some((b) => b.kind === 'infill')).toBe(false);
    for (const b of infill) expect(b.district).not.toBe('');
    // Low: three quarters of the tallest district's blocks at most (the Strand's 64).
    for (const b of infill) expect(b.h).toBeLessThanOrEqual(48);
  });
  it('a block never stands in one a district built', () => {
    const covers = (b: Box, x: number, y: number) => {
      const dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
      return Math.abs(dx * c + dy * s) < b.w / 2 && Math.abs(-dx * s + dy * c) < b.d / 2;
    };
    const old = g0.buildings.filter((b) => b.z0 < 8);
    for (const b of infill) expect(old.some((o) => Math.abs(o.x - b.x) < 60 && Math.abs(o.y - b.y) < 60 && covers(o, b.x, b.y))).toBe(false);
  });
  it('lays streets along the borders and carries streets on to them, on the ground', () => {
    const before = new Set(g0.strips.map(key));
    const added = g.strips.filter((s) => !before.has(key(s)));
    const streets = added.filter((s) => s.material === 'street');
    expect(streets.length).toBeGreaterThan(500);
    for (const s of streets) expect(s.z0).toBeLessThan(1);
    // Everything else it adds is the raised highway's run-off, on the highway's own power.
    for (const s of added) if (s.material !== 'street') expect(s.district).toBe('spine');
  });
  it("the Spine doesn't stop in mid-air: its west end runs on off the map's edge, on pylons", () => {
    const D = city.spines[0]!.deckHeight;
    const deck = (gg: typeof g) => gg.strips.filter((s) => s.material === 'road' && Math.abs(s.z0 - (D - 4)) < 0.01);
    const west0 = Math.min(...deck(g0).map((s) => s.x)), west = Math.min(...deck(g).map((s) => s.x));
    expect(west0).toBeGreaterThan(300);
    expect(west).toBeLessThan(10);
    const pylons = g.buildings.filter((b) => b.kind === 'pylon' && b.x < west0 - 20);
    expect(pylons.length).toBeGreaterThan(3);
    for (const p of pylons) expect(p.district).toBe('spine');
  });
  it('nothing a district built stands up through the run-off, and its traffic keeps the highway\'s sides', () => {
    const D = city.spines[0]!.deckHeight;
    const before = new Set(g0.strips.map(key));
    const added = g.strips.filter((s) => !before.has(key(s)));
    const decks = added.filter((s) => s.material === 'road');
    const on = (s: (typeof decks)[0], x: number, y: number) => {
      const dx = x - s.x, dy = y - s.y, c = Math.cos(s.a), sn = Math.sin(s.a);
      return Math.abs(dx * c + dy * sn) < s.w / 2 && Math.abs(-dx * sn + dy * c) < s.d / 2;
    };
    const tall = [...g0.buildings, ...g0.props].filter((o) => o.z0 + o.h > D - 4 && o.z0 < D);
    for (const o of tall) expect(decks.some((s) => Math.abs(s.x - o.x) < 40 && Math.abs(s.y - o.y) < 40 && on(s, o.x, o.y)), `${o.kind} at ${o.x.toFixed(0)},${o.y.toFixed(0)}`).toBe(false);
    // Tail lights on the same side of the road's line as on the highway beside it (the line runs about west-east here).
    const side = (list: typeof added, mat: string) => {
      const cars = list.filter((s) => s.material === mat && s.district === 'spine');
      const road = decks[0]!;
      return cars.filter((s) => (s.x - road.x) * -Math.sin(road.a) + (s.y - road.y) * Math.cos(road.a) > 0).length / (cars.length || 1);
    };
    const near = g0.strips.filter((s) => s.x < 900);
    expect(side(added, 'car-red') > 0.5).toBe(side(near, 'car-red') > 0.5);
  });
});
