import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const marsh = city.map.districts.find((d) => d.id === 'marsh')!;
const cfg = city.styles['marsh']!.flooded!;
const inMarsh = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], marsh.border!);
const out = generate(city);
const g = out.geometry;

describe('the Marsh, the part of Lowlight that went under (2026-10-26)', () => {
  it('is water: no land slab under it, the bay runs in', () => {
    expect(g.land.length).toBe(city.map.districts.filter((d) => d.border && d.border.length >= 3 && !city.styles[d.id]?.flooded && !city.styles[d.id]?.isle).length);
    const [lx, ly] = [(marsh.label[0] / 100) * MAP_W, (marsh.label[1] / 100) * MAP_H];
    const c = out.land;
    const i = Math.floor(ly / c.step) * c.cols + Math.floor(lx / c.step);
    expect(c.cells[i]).toBe(0);
  });
  it('its blocks stand in the water, lower floors drowned behind a dark waterline', () => {
    // Every block's base is in the water (a broken roof's standing half sits on its block, above).
    const blocks = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'building' && b.z0 < cfg.waterline);
    expect(blocks.length).toBeGreaterThan(200);
    for (const b of blocks) expect(b.z0).toBeLessThan(0);
    const stains = g.strips.filter((s) => s.material === 'soffit' && s.z0 < 0 && inMarsh(s.x, s.y));
    expect(stains.length).toBeGreaterThan(blocks.length * 0.8);
    for (const s of stains) expect(s.z0 + s.h).toBeCloseTo(cfg.waterline, 0);
  });
  it('canals: boats with lanterns, plank bridges between the roofs', () => {
    const boats = g.strips.filter((s) => s.material === 'concrete' && s.z0 < 0 && s.h < 1 && inMarsh(s.x, s.y));
    expect(boats.length).toBeGreaterThan(30);
    const bridges = g.strips.filter((s) => s.material === 'walkway' && s.z0 > 2 && inMarsh(s.x, s.y));
    expect(bridges.length).toBeGreaterThan(30);
  });
  it('the failed defences: a broken seawall on the bay side, dead pump towers', () => {
    const wall = g.strips.filter((s) => s.material === 'concrete' && s.h >= 2 && s.z0 < 0);
    expect(wall.length).toBeGreaterThan(20);
    const towers = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'tower');
    expect(towers.length).toBe(cfg.pumps);
  });
  it("the Counting House: a drowned bank in its lagoon at Mother Rot's place, broth fire and lanterns on the roof", () => {
    const pin = city.map.places.find((p) => p.id === cfg.bank.near)!.pin;
    const [px, py] = [(pin[0] / 100) * MAP_W, (pin[1] / 100) * MAP_H];
    const bank = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'building' && b.w >= cfg.bank.w - 0.01 && Math.hypot(b.x - px, b.y - py) < 40);
    expect(bank.length).toBe(1);
    const top = bank[0]!.z0 + bank[0]!.h;
    expect(g.props.filter((p) => p.kind === 'lamp' && p.z0 >= top - 0.5 && Math.hypot(p.x - bank[0]!.x, p.y - bank[0]!.y) < cfg.bank.w).length).toBeGreaterThan(6);
    // The lagoon: no other block close round it.
    const others = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'building' && b !== bank[0]);
    for (const b of others) expect(Math.hypot(b.x - bank[0]!.x, b.y - bank[0]!.y)).toBeGreaterThan(cfg.bank.w / 2 + 12);
  });
  it('the Drowned Choir: candlelit gatherings on the rooftops', () => {
    const candles = g.props.filter((p) => p.kind === 'lamp' && p.color === '#ffd27a' && inMarsh(p.x, p.y) && p.z0 > cfg.waterline);
    expect(candles.length).toBeGreaterThan(cfg.choir * 6);
  });
  it('settled, not a tidy grid: blocks turned their own way', () => {
    const angles = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'building' && b.z0 < 0).map((b) => b.a.toFixed(2));
    expect(new Set(angles).size).toBeGreaterThan(20);
  });
  it('deep zoom over the Marsh', () => {
    expect(city.styles['marsh']!.deepZoom).toBe(true);
  });
});

describe('Marsh pass 5: lit windows, rooftop settlements, bridges across the roofs', () => {
  const blocks = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'building' && b.z0 < 0);
  const tops = blocks.map((b) => ({ x: b.x, y: b.y, top: b.z0 + b.h }));
  it('more windows lit', () => {
    expect(city.styles['marsh']!.windowLit).toBeGreaterThanOrEqual(0.4);
  });
  it('settlements on the roofs: several shacks a roof on many blocks', () => {
    const shacks = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'shack');
    expect(shacks.length).toBeGreaterThan(blocks.length * 1.2);
  });
  it('bridges run roof to roof between neighbouring blocks', () => {
    const bridges = g.strips.filter((s) => s.material === 'walkway' && s.ends && inMarsh(s.x, s.y));
    expect(bridges.length).toBeGreaterThan(150);
    for (const s of bridges) {
      const [a, b] = s.ends!;
      expect(a[2]).toBeCloseTo(b[2], 3);
      // Each end on a roof at or above the bridge.
      for (const e of [a, b]) expect(tops.some((t) => Math.hypot(t.x - e[0], t.y - e[1]) < 1 && t.top >= e[2] - 0.5)).toBe(true);
    }
  });
});

describe('the ridge between the Marsh and Drownworks ("misty mountains with tall trees", as painted)', () => {
  const dw = city.map.districts.find((d) => d.id === 'drownworks')!;
  const inDw = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], dw.border!);
  const crags = g.props.filter((p) => p.kind === 'crag');
  it('rocky crags on the ground between them, in neither district', () => {
    expect(crags.length).toBeGreaterThan(20);
    for (const c of crags) expect(inMarsh(c.x, c.y) || inDw(c.x, c.y), `${c.x},${c.y}`).toBe(false);
    expect(Math.max(...crags.map((c) => c.h))).toBeGreaterThan(25);
  });
  it('tall trees among the crags', () => {
    const tall = g.props.filter((p) => p.kind === 'pine' && p.h >= 10 && crags.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 60));
    expect(tall.length).toBeGreaterThan(60);
  });
  it('mist lies over it', () => {
    const mist = g.volumes.filter((v) => v.kind === 'mist');
    expect(mist.length).toBeGreaterThan(3);
  });
});
