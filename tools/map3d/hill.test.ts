import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const cr = city.map.districts.find((d) => d.id === 'cloudridge')!;
const cfg = city.styles['cloudridge']!.hill!;
const inC = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], cr.border!);
const g = generate(city).geometry;
const own = g.buildings.filter((b) => b.district === 'cloudridge');
const grid = g.islands.find((i) => i.id === 'cloudridge')!;

describe('Cloudridge, old money in the hills (2026-10-27)', () => {
  it('the ground rises from the edge to ridges, highest toward the north', () => {
    expect(grid).toBeDefined();
    const top = Math.max(...grid.heights);
    expect(top).toBeGreaterThan(cfg.peak * 0.5);
    const at = (x: number, y: number) => grid.heights[Math.round((y - grid.y0) / grid.step) * grid.cols + Math.round((x - grid.x0) / grid.step)]!;
    const ys = cr.border!.map((p) => (p.y / 100) * MAP_H), xs = cr.border!.map((p) => (p.x / 100) * MAP_W);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const north = [], south = [];
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 20) {
      if (inC(x, y0 + (y1 - y0) * 0.35)) north.push(at(x, y0 + (y1 - y0) * 0.35));
      if (inC(x, y0 + (y1 - y0) * 0.8)) south.push(at(x, y0 + (y1 - y0) * 0.8));
    }
    expect(Math.max(...north)).toBeGreaterThan(Math.max(...south));
  });
  it('winding lit roads draped on the slopes, gatehouses where they come in', () => {
    const roads = g.strips.filter((s) => s.material === 'street' && s.ends && inC(s.x, s.y));
    expect(roads.length).toBeGreaterThan(300);
    expect(roads.some((s) => s.ends![0][2] > 20)).toBe(true);
    expect(own.filter((b) => b.kind === 'shack' && b.tint === '#d8ecff').length).toBeGreaterThanOrEqual(2);
  });
  it('estates read as mansions: a main block with wings, roof ridges, chimneys, a lit drive and fountain', () => {
    const fountains = g.curves.filter((c) => c.color === '#ffe2a0' && inC(c.points[0]![0], c.points[0]![1]));
    expect(fountains.length).toBeGreaterThanOrEqual(12);
    const mains = own.filter((b) => b.kind === 'building' && b.w > 25);
    expect(mains.length).toBeGreaterThanOrEqual(12);
    for (const m of mains) expect(own.some((b) => b.kind === 'stack' && Math.hypot(b.x - m.x, b.y - m.y) < m.w)).toBe(true);
  });
  it('the rest is trees, standing on the hill', () => {
    const trees = g.props.filter((p) => p.kind === 'pine' && inC(p.x, p.y));
    expect(trees.length).toBeGreaterThan(cfg.trees * 0.7);
    expect(trees.filter((p) => p.z0 > 10).length).toBeGreaterThan(trees.length * 0.3);
  });
});
