import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const helios = city.map.districts.find((d) => d.id === 'helios')!;
const cfg = city.styles['helios']!.arcologies!;
const inH = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], helios.border!);
const g = generate(city).geometry;
const own = g.buildings.filter((b) => b.district === 'helios');

describe('Helios Towers: five eco superstructures', () => {
  // A tower's base tier: the broad box standing on the ground.
  const bases = own.filter((b) => b.kind === 'building' && b.z0 === 0 && b.h > cfg.height[0] * 0.25);
  it('five towers, the tallest where the painting has its golden tower, each standing inside Helios', () => {
    expect(bases.length).toBeGreaterThanOrEqual(cfg.count);
    const tops = own.filter((b) => b.kind === 'tier').map((b) => b.z0 + b.h);
    expect(Math.max(...tops)).toBeGreaterThan(cfg.height[0]);
    for (const b of bases) expect(inH(b.x, b.y)).toBe(true);
    const [fx, fy] = [(cfg.first[0] / 100) * MAP_W, (cfg.first[1] / 100) * MAP_H];
    expect(g.curves.some((c) => c.color === cfg.emblem && Math.hypot(c.points[0]![0] - fx, c.points[0]![1] - fy) < 80)).toBe(true);
  });
  it('sky gardens: trees on the setbacks high up, edged in green light', () => {
    const high = g.props.filter((p) => p.kind === 'pine' && p.z0 > 40 && inH(p.x, p.y));
    expect(high.length).toBeGreaterThan(cfg.count * 15);
    expect(g.strips.filter((s) => s.material === 'street-light' && s.color === '#8fe07a' && s.z0 > 40).length).toBeGreaterThan(cfg.count * 8);
  });
  it('skybridges join neighbours high up', () => {
    const bridges = own.filter((b) => b.kind === 'bridge');
    expect(bridges.length).toBeGreaterThanOrEqual(3);
    for (const b of bridges) expect(b.z0).toBeGreaterThan(cfg.height[0] * 0.3);
  });
  it('grounds below: parks, ring roads, lit service gates with security booths', () => {
    expect(g.props.filter((p) => p.kind === 'pine' && p.z0 === 0 && inH(p.x, p.y)).length).toBeGreaterThan(100);
    expect(own.filter((b) => b.kind === 'shack' && b.tint === '#d8ecff').length).toBeGreaterThanOrEqual(cfg.count * 2);
    expect(g.strips.filter((s) => s.material === 'street' && inH(s.x, s.y)).length).toBeGreaterThan(cfg.count * 20);
  });
  it("each tower's emblem lies flat on its front face, turned with the tower", () => {
    const tri = g.curves.filter((c) => c.color === cfg.emblem && c.points.length === 4);
    expect(tri.length).toBe(cfg.count);
    for (const t of tri) {
      // The triangle's two base corners at the same depth into the tower's frame: the face's plane.
      const top = own.filter((b) => Math.hypot(b.x - t.points[2]![0], b.y - t.points[2]![1]) < 40).sort((a, b) => b.z0 - a.z0)[0]!;
      const depth = (p: number[]) => -(p[0]! - top.x) * Math.sin(top.a) + (p[1]! - top.y) * Math.cos(top.a);
      expect(Math.abs(depth(t.points[0]!) - depth(t.points[1]!))).toBeLessThan(0.5);
    }
  });
});
