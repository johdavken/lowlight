import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';
import { spineGeometry } from './spine';

const city = loadCity('.');
const spine = city.spines.find((s) => s.id === 'spine')!;
const ribbon = city.structures.find((s) => s.id === 'ribbon')!;
const g = spineGeometry(spine, city.map.places, null);
const px = (p: readonly number[]) => [(p[0]! / 100) * MAP_W, (p[1]! / 100) * MAP_H] as const;

describe('the Spine', () => {
  it('same data, same Spine', () => {
    const again = spineGeometry(spine, city.map.places, null);
    expect({ ...again, distance: null, under: null, along: null }).toEqual({ ...g, distance: null, under: null, along: null });
  });
  it('a deck at its height the whole way, Iron Reach to the Marsh', () => {
    const deck = g.strips.filter((s) => s.material === 'road');
    expect(deck.length).toBeGreaterThan(30);
    for (const d of deck) expect(d.z0 + d.h).toBe(120);
    const xs = deck.map((d) => (d.x / MAP_W) * 100);
    expect(Math.min(...xs)).toBeLessThan(13);
    expect(Math.max(...xs)).toBeGreaterThan(97);
  });
  it('pylons hold it up: spaced along the route, up to the deck, Pylon Forty the biggest', () => {
    const pylons = g.buildings.filter((b) => b.kind === 'pylon');
    expect(pylons.length).toBeGreaterThan(40);
    for (const p of pylons) {
      expect(p.z0 + p.h).toBeCloseTo(120 - 4 - 7, 6);
      expect(p.lit).toBe(0);
    }
    expect(g.strips.filter((s) => s.material === 'concrete').length).toBe(pylons.length);
    expect(g.props.filter((p) => p.kind === 'ring').length).toBeGreaterThanOrEqual(pylons.length);
    const forty = pylons.reduce((a, b) => (b.w * b.d > a.w * a.d ? b : a));
    const [ox, oy] = px(city.map.places.find((p) => p.id === 'oksanas-counter')!.pin);
    expect(Math.hypot(forty.x - ox, forty.y - oy)).toBeLessThan(80);
  });
  it('habs crowd the foot of every pylon and line the street under the deck, low and lit', () => {
    const habs = g.buildings.filter((b) => b.kind === 'building' && b.district === 'spine');
    const pylons = g.buildings.filter((b) => b.kind === 'pylon');
    for (const p of pylons) {
      const around = habs.filter((h) => Math.hypot(h.x - p.x, h.y - p.y) < Math.hypot(p.w, p.d) / 2 + 20);
      expect(around.length, `pylon at ${p.x},${p.y}`).toBeGreaterThanOrEqual(4);
    }
    for (const h of habs) {
      expect(h.z0 + h.h).toBeLessThanOrEqual(120 - 40);
      expect(h.lit).toBeGreaterThan(0);
    }
    expect(habs.length).toBeGreaterThan(pylons.length * 8);
  });
  it('hangers hang under the deck between pylons', () => {
    const hangers = g.buildings.filter((b) => b.kind === 'shack');
    expect(hangers.length).toBeGreaterThan(20);
    for (const h of hangers) expect(h.z0 + h.h).toBeLessThan(120 - 4);
  });
  it('places on it stand at their ring, the deck places on the deck', () => {
    const h = g.pinHeights;
    expect(h['soren-hab']!).toBeGreaterThan(h['rue-hab']!);
    expect(h['rue-hab']!).toBeGreaterThan(h['listening-post']!);
    expect(h['listening-post']!).toBeGreaterThan(h['oksanas-counter']!);
    expect(h['long-haul']).toBe(120);
    expect(h['catwalk']).toBe(120);
  });
  it('pylons keep out of the Ribbon\'s canyon', async () => {
    const { ribbonGeometry } = await import('./structure');
    const rg = ribbonGeometry(ribbon, city.map.places);
    const g2 = spineGeometry(spine, city.map.places, rg.distance);
    for (const p of g2.buildings.filter((b) => b.kind === 'pylon')) expect(rg.distance(p.x, p.y)).toBeGreaterThan(-(ribbon.depth));
  });
});

describe('the Spine in the city', () => {
  const all = generate(city);
  it('nothing in the city stands taller than the deck beneath it', () => {
    for (const b of all.geometry.buildings.filter((x) => x.kind === 'building' || x.kind === 'stack' || x.kind === 'tier')) {
      if (all.spineUnder(b.x, b.y)) expect(b.z0 + b.h, `${b.kind} ${b.x},${b.y}`).toBeLessThanOrEqual(120 - 22 + 1e-6);
    }
  });
  it('the old highway posts are gone: the Spine carries those roads', () => {
    expect(all.geometry.strips.filter((s) => s.material === 'road' && s.z0 + s.h !== 120)).toHaveLength(0);
  });
});
