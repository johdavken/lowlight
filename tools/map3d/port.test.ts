import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';
import { coastEdges, onLand } from './water';

const city = loadCity('.');
const dock = city.map.districts.find((d) => d.id === 'dockside')!;
const cfg = city.styles['dockside']!.port!;
const inDock = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], dock.border!);
const out = generate(city);
const g = out.geometry;
const isLand = onLand(out.land);
const coast = coastEdges(city.map, out.land, 'dockside');
const toCoast = (x: number, y: number) =>
  Math.min(
    ...coast.map(([a, b]) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
    }),
  );
// A ship's hull: the long dark box riding low in the water.
const hulls = g.buildings.filter((b) => b.district === 'dockside' && b.kind === 'car' && b.z0 === -1.4 && b.w > 40);
const cranes = g.strips.filter((s) => s.material === 'crane');
// Dockside's own: on its ground, or out on its piers and ships (Iron Reach's crates are its own colours).
const containers = g.props.filter((p) => p.kind === 'container' && cfg.containers.includes(p.color!));

describe('Dockside, the freight port (2026-10-27)', () => {
  it('ships berth at the quays and lie in open water, none overlapping', () => {
    expect(hulls.length).toBeGreaterThanOrEqual(12);
    expect(hulls.filter((h) => toCoast(h.x, h.y) < 30).length).toBeGreaterThanOrEqual(6);
    for (const h of hulls) {
      const c = Math.cos(h.a), s = Math.sin(h.a);
      for (const [u, v] of [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4], [0, 0]] as const) expect(isLand(h.x + u * h.w * c - v * h.d * s, h.y + u * h.w * s + v * h.d * c)).toBe(false);
    }
    for (let i = 0; i < hulls.length; i++)
      for (let j = i + 1; j < hulls.length; j++) expect(Math.hypot(hulls[i]!.x - hulls[j]!.x, hulls[i]!.y - hulls[j]!.y)).toBeGreaterThan((hulls[i]!.d + hulls[j]!.d) / 2);
  });
  it('red gantry cranes stand over the berthed ships', () => {
    expect(cranes.length).toBeGreaterThan(200);
    const berthed = hulls.filter((h) => toCoast(h.x, h.y) < 30);
    for (const h of berthed) expect(cranes.some((c) => c.z0 >= cfg.cranes.height - 2 && Math.hypot(c.x - h.x, c.y - h.y) < h.w / 2 + 30)).toBe(true);
    // Cranes are taller than anything else on the quay, short of the Spine's deck.
    expect(Math.max(...cranes.map((c) => c.z0 + c.h))).toBeLessThan(120);
  });
  it('what stands on a pier stands on its deck, not sunk into it', () => {
    const piers = g.strips.filter((s) => s.material === 'concrete' && s.w === cfg.piers.width);
    const onPier = (x: number, y: number) => piers.some((p) => {
      const c = Math.cos(p.a), sn = Math.sin(p.a), dx = x - p.x, dy = y - p.y;
      return Math.abs(dx * c + dy * sn) < p.w / 2 - 1 && Math.abs(-dx * sn + dy * c) < p.d / 2 - 1;
    });
    const stood = containers.filter((c) => c.z0 < 2 && onPier(c.x, c.y));
    expect(stood.length).toBeGreaterThan(20);
    for (const c of stood) expect(c.z0).toBeGreaterThanOrEqual(1);
  });
  it('container yards in every colour, stacked one to four high, on Dockside ground or a pier', () => {
    expect(containers.length).toBeGreaterThan(5000);
    expect(new Set(containers.map((c) => c.color))).toEqual(new Set(cfg.containers));
    const yard = containers.filter((c) => c.z0 < 2.5 && isLand(c.x, c.y));
    expect(yard.length).toBeGreaterThan(3000);
    // On Dockside ground — or in Iron Reach's yards along the shared border, where the two blend.
    const ir = city.map.districts.find((d) => d.id === 'ironreach')!;
    const inIr = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], ir.border!);
    // (or on the strip of ground between the two): never in any other district.
    const others = city.map.districts.filter((d) => d.border && !['dockside', 'ironreach'].includes(d.id));
    for (const c of yard) {
      if (inDock(c.x, c.y) || inIr(c.x, c.y)) continue;
      expect(others.some((d) => insideBorder([(c.x / MAP_W) * 100, (c.y / MAP_H) * 100], d.border!))).toBe(false);
    }
    expect(Math.max(...containers.map((c) => c.z0 + c.h))).toBeLessThan(12);
  });
  it('the docks run inland a ways: deep terminal yards and lit container yards among the blocks', () => {
    const yard = containers.filter((c) => c.z0 < 0.5 && isLand(c.x, c.y));
    expect(yard.filter((c) => toCoast(c.x, c.y) > cfg.yard[0] + 40).length).toBeGreaterThan(2000);
    // Inland yards: clusters well away from the coast, each with its floodlights.
    const inland = yard.filter((c) => toCoast(c.x, c.y) > cfg.yard[1] + 60);
    const cells = new Set(inland.map((c) => `${Math.floor(c.x / 150)}:${Math.floor(c.y / 150)}`));
    expect(cells.size).toBeGreaterThanOrEqual(cfg.inlandYards.count);
    const lights = g.lights.filter((l) => l.color === '#ffe2b0' && toCoast(l.x, l.y) > cfg.yard[1] + 60);
    expect(lights.length).toBeGreaterThanOrEqual(cfg.inlandYards.count * 2);
  });
  it('a railway: a trunk line behind the terminals, spurs into the yards, trains standing', () => {
    // Track is two faint rails; the trunk is the longest pair.
    const all = g.strips.filter((s) => s.material === 'street-light' && s.color === '#7a5a3c');
    const rails = all.filter((s) => inDock(s.x, s.y));
    expect(Math.max(...rails.map((s) => s.w))).toBeGreaterThan(800);
    // Every rail is in Dockside or Iron Reach (or the strip between): never in another district.
    const others = city.map.districts.filter((d) => d.border && !['dockside', 'ironreach'].includes(d.id));
    for (const s of all) expect(others.some((d) => insideBorder([(s.x / MAP_W) * 100, (s.y / MAP_H) * 100], d.border!))).toBe(false);
    // Spurs run square off the trunk.
    const trunk = rails.reduce((a, b) => (b.w > a.w ? b : a));
    const square = rails.filter((s) => Math.abs(Math.cos(s.a - trunk.a)) < 0.2 && s.w > 20);
    expect(square.length / 2).toBeGreaterThanOrEqual(6);
    const locos = g.buildings.filter((b) => b.district === 'dockside' && b.kind === 'car' && b.w === 14 && b.d === 3.2);
    expect(locos.length).toBeGreaterThanOrEqual(4);
  });
  it('every quay edge has a terminal with cranes, the inlet too', () => {
    for (const [a, b] of coast) {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 250) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      expect(cranes.some((c) => Math.hypot(c.x - mx, c.y - my) < L / 2 + 20 && c.z0 >= cfg.cranes.height - 2)).toBe(true);
    }
  });
  it('floodlight masts light the yards', () => {
    const masts = g.props.filter((p) => p.kind === 'lattice' && inDock(p.x, p.y) && p.h > 20);
    expect(masts.length).toBeGreaterThan(30);
    expect(g.lights.filter((l) => inDock(l.x, l.y) && l.color === '#ffe2b0').length).toBeGreaterThan(30);
  });
  it('the quays are straight: the natural shore leaves Dockside\'s coast on its line', () => {
    const near = g.land.flat().filter(([x, y]) => toCoast(x, y) < 40 && inDock(x - 1, y - 1));
    expect(near.length).toBeGreaterThan(0);
    for (const [x, y] of near) expect(toCoast(x, y)).toBeLessThan(2);
  });
  it("the rest of Dockside is warehouses: no generic blocks, lit loading doors, clear of the yards", () => {
    const own = g.buildings.filter((b) => b.district === 'dockside' && b.kind === 'building');
    expect(own.every((b) => b.lit !== city.styles['dockside']!.windowLit)).toBe(true);
    const warehouses = own.filter((b) => b.lit === 0.15);
    expect(warehouses.length).toBeGreaterThan(50);
    const doors = g.props.filter((p) => p.kind === 'shopfront' && inDock(p.x, p.y));
    expect(doors.length).toBeGreaterThan(warehouses.length * 2);
    const yard = containers.filter((c) => c.z0 < 0.5 && isLand(c.x, c.y));
    for (const w of warehouses) expect(yard.some((c) => Math.hypot(c.x - w.x, c.y - w.y) < 6)).toBe(false);
  });
  it('tugs and ships at anchor out in the bay, as many as asked', () => {
    const tugs = g.buildings.filter((b) => b.district === 'dockside' && b.kind === 'car' && b.w === 12 && b.d === 5);
    expect(tugs.length).toBe(cfg.tugs);
    expect(hulls.filter((h) => toCoast(h.x, h.y) > 70).length).toBeGreaterThanOrEqual(2);
  });
  it('container piers run out into open water, ships and cranes down both sides', () => {
    const piers = g.strips.filter((s) => s.material === 'concrete' && s.w === cfg.piers.width && inDock(s.x, s.y) === false);
    expect(piers.length).toBeGreaterThanOrEqual(2);
    expect(piers.length).toBeLessThanOrEqual(cfg.piers.count);
    for (const p of piers) expect(cranes.filter((c) => Math.hypot(c.x - p.x, c.y - p.y) < p.d / 2 + 40).length).toBeGreaterThan(20);
  });
  it('a pair of brick chimneys or more inland', () => {
    const stacks = g.buildings.filter((b) => b.district === 'dockside' && b.kind === 'stack' && b.h > 50);
    expect(stacks.length).toBeGreaterThanOrEqual(2);
    for (const s of stacks) expect(toCoast(s.x, s.y)).toBeGreaterThan(140);
  });
});
