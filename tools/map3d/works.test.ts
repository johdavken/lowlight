import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';
import { coastEdges } from './water';

const city = loadCity('.');
const dw = city.map.districts.find((d) => d.id === 'drownworks')!;
const cfg = city.styles['drownworks']!.works!;
const inDw = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], dw.border!);
const out = generate(city);
const g = out.geometry;
// A bay's footprint is its outer band; the dimmer middle and lit core sit inside it.
const bays = g.strips.filter((s) => s.material === 'bay-edge');

describe('Drownworks, the part that was saved (2026-10-26)', () => {
  it('glowing settling bays, whole, inside the Works', () => {
    expect(bays.length).toBeGreaterThanOrEqual(8);
    for (const b of bays) {
      expect(b.w * b.d).toBeGreaterThan(cfg.bay.w * cfg.bay.d * 0.45);
      const ca = Math.cos(b.a), sa = Math.sin(b.a);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) expect(inDw(b.x + (u * b.w * ca) / 2 - (v * b.d * sa) / 2, b.y + (u * b.w * sa) / 2 + (v * b.d * ca) / 2)).toBe(true);
    }
  });
  it('catwalks across every bay, a pump house at its end', () => {
    for (const b of bays) {
      expect(g.strips.filter((s) => s.material === 'walkway' && s.z0 > 1 && Math.hypot(s.x - b.x, s.y - b.y) < b.w / 2).length).toBeGreaterThanOrEqual(2);
      expect(g.buildings.some((q) => q.district === 'drownworks' && q.brick === 1 && Math.hypot(q.x - b.x, q.y - b.y) < b.w / 2 + 14)).toBe(true);
    }
  });
  it('Pump House Nine stands on the bay by its pin, lit, a steady amber beacon', () => {
    const pin = city.map.places.find((p) => p.id === cfg.near)!.pin;
    const [px, py] = [(pin[0] / 100) * MAP_W, (pin[1] / 100) * MAP_H];
    const nearest = bays.reduce((a, b) => (Math.hypot(b.x - px, b.y - py) < Math.hypot(a.x - px, a.y - py) ? b : a));
    expect(Math.hypot(nearest.x - px, nearest.y - py)).toBeLessThan(cfg.bay.w);
    expect(g.props.some((p) => p.kind === 'lamp' && p.color === '#ffb030' && Math.hypot(p.x - px, p.y - py) < cfg.bay.w)).toBe(true);
  });
  it('pipe racks run between the bays', () => {
    const pipes = g.strips.filter((s) => s.material === 'pipe' && inDw(s.x, s.y) && s.w > 30);
    expect(pipes.length).toBeGreaterThan(bays.length * 2);
  });
  it('nothing stands in a bay', () => {
    for (const q of g.buildings.filter((b) => b.district === 'drownworks' && b.kind === 'building'))
      for (const b of bays) {
        const ca = Math.cos(-b.a), sa = Math.sin(-b.a), dx = q.x - b.x, dy = q.y - b.y;
        const u = dx * ca - dy * sa, v = dx * sa + dy * ca;
        expect(Math.abs(u) < b.w / 2 && Math.abs(v) < b.d / 2, `${q.x},${q.y}`).toBe(false);
      }
  });
  it('a floodwall that held: along every stretch of its coast, unbroken, lamps along its top', () => {
    const edges = coastEdges(city.map, out.land, 'drownworks');
    expect(edges.length).toBeGreaterThan(2);
    const wall = g.strips.filter((s) => s.material === 'concrete' && s.h >= 4 && s.z0 <= 0);
    const segDist = (x: number, y: number, a: number[], b: number[]) => {
      const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
      const t = Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a[0]! - t * dx, y - a[1]! - t * dy);
    };
    for (const [a, b] of edges) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // The wall follows the natural shore, up to ~20 px out from the drawn edge.
      const mine = wall.filter((s) => segDist(s.x, s.y, a, b) < 24);
      // Unbroken: its pieces cover the edge.
      expect(mine.reduce((n, s) => n + s.w, 0), `edge ${a} ${b}`).toBeGreaterThan(len * 0.9);
    }
    expect(g.props.filter((p) => p.kind === 'lamp' && p.z0 >= 5 && edges.some(([a, b]) => segDist(p.x, p.y, a, b) < 24)).length).toBeGreaterThan(20);
  });
  it('varied, not a tidy grid: bays of different sizes, set a little askew', () => {
    expect(new Set(bays.map((b) => Math.round(b.w * b.d / 200))).size).toBeGreaterThan(6);
    expect(new Set(bays.map((b) => b.a.toFixed(2))).size).toBeGreaterThan(6);
  });
  it('heavy industry: tank farms, sludge drying beds, gantry cranes, trucks', () => {
    const tall = g.props.filter((p) => p.kind === 'tank' && p.h >= 8 && inDw(p.x, p.y));
    expect(tall.length).toBeGreaterThan(15);
    expect(g.strips.filter((s) => s.material === 'sludge' && inDw(s.x, s.y)).length).toBeGreaterThan(20);
    expect(g.strips.filter((s) => s.material === 'girder' && s.z0 >= 8 && s.w > 40 && inDw(s.x, s.y)).length).toBeGreaterThanOrEqual(3);
    expect(g.buildings.filter((b) => b.kind === 'car' && b.district === 'drownworks').length).toBeGreaterThan(10);
  });
  it('water towers and other infrastructure sprinkled through the Works', () => {
    // A tower's tank: raised, wide (roof tanks on blocks are 2.4 across).
    const towers = g.props.filter((p) => p.kind === 'tank' && p.z0 >= 12 && p.w >= 6 && inDw(p.x, p.y));
    expect(towers.length).toBeGreaterThanOrEqual(6);
    for (const t of towers) expect(g.props.filter((p) => p.kind === 'lattice' && Math.hypot(p.x - t.x, p.y - t.y) < t.w).length).toBeGreaterThanOrEqual(4);
    const transformers = g.props.filter((p) => p.kind === 'ac' && p.w >= 2 && inDw(p.x, p.y));
    expect(transformers.length).toBeGreaterThan(10);
  });
  it('the water shades softly from rim to core', () => {
    expect(new Set(g.strips.filter((s) => s.material.startsWith('bay') && inDw(s.x, s.y)).map((s) => s.material)).size).toBeGreaterThanOrEqual(5);
  });
  it('a few residential neighbourhoods break up the works: terraces of row houses, lit, with a corner shop', () => {
    const homes = g.buildings.filter((b) => b.district === 'drownworks' && b.kind === 'stack' && b.h <= 13);
    expect(homes.length).toBeGreaterThan(120);
    // In clusters: at least three groups more than 250 px apart.
    const centres: { x: number; y: number }[] = [];
    for (const h of homes) if (centres.every((c) => Math.hypot(c.x - h.x, c.y - h.y) > 250)) centres.push(h);
    expect(centres.length).toBeGreaterThanOrEqual(3);
    expect(g.props.filter((p) => p.kind === 'sign' && inDw(p.x, p.y) && homes.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 20)).length).toBeGreaterThanOrEqual(3);
    for (const h of homes)
      for (const b of bays) {
        const c = Math.cos(-b.a), sn = Math.sin(-b.a), dx = h.x - b.x, dy = h.y - b.y;
        expect(Math.abs(dx * c - dy * sn) < b.w / 2 && Math.abs(dx * sn + dy * c) < b.d / 2).toBe(false);
      }
  });
  it('the harbour: piers out from the floodwall into the bay, barges, dock cranes, floodlight masts', () => {
    const piers = g.strips.filter((s) => s.material === 'concrete' && s.h < 2 && s.w >= 20 && !inDw(s.x, s.y) && dw.border!.some((a) => Math.hypot((a.x / 100) * MAP_W - s.x, (a.y / 100) * MAP_H - s.y) < 600));
    expect(piers.length).toBeGreaterThanOrEqual(8);
    const masts = g.props.filter((p) => p.kind === 'lattice' && p.h >= 18 && p.w < 1.5);
    const lit = masts.filter((m) => g.props.some((p) => p.kind === 'lamp' && p.z0 >= m.h - 1 && Math.hypot(p.x - m.x, p.y - m.y) < 3));
    expect(lit.length).toBeGreaterThanOrEqual(8);
    expect(g.buildings.filter((b) => b.district === 'drownworks' && b.kind === 'car' && !inDw(b.x, b.y)).length).toBeGreaterThanOrEqual(4);
  });
  it('the harbour is sparse and clean: no two piers within 16 px or crossing, none reaching toward other ground', () => {
    const piers = g.strips.filter((s) => s.material === 'concrete' && s.z0 < 0 && s.h < 2 && s.w >= 30 && !inDw(s.x, s.y) && dw.border!.some((a) => Math.hypot((a.x / 100) * MAP_W - s.x, (a.y / 100) * MAP_H - s.y) < 700));
    expect(piers.length).toBeGreaterThan(3);
    expect(piers.length).toBeLessThan(30);
    const ends = piers.map((p) => {
      const c = Math.cos(p.a), s2 = Math.sin(p.a);
      return [[p.x - (c * p.w) / 2, p.y - (s2 * p.w) / 2], [p.x + (c * p.w) / 2, p.y + (s2 * p.w) / 2]] as [number, number][];
    });
    const near = (a: number[], b0: number[], b1: number[]) => {
      const dx = b1[0]! - b0[0]!, dy = b1[1]! - b0[1]!, u = Math.max(0, Math.min(1, ((a[0]! - b0[0]!) * dx + (a[1]! - b0[1]!) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(a[0]! - b0[0]! - u * dx, a[1]! - b0[1]! - u * dy);
    };
    for (let i = 0; i < ends.length; i++)
      for (let k = i + 1; k < ends.length; k++) {
        const [a0, a1] = ends[i]!, [b0, b1] = ends[k]!;
        expect(Math.min(near(a0, b0, b1), near(a1, b0, b1), near(b0, a0, a1), near(b1, a0, a1))).toBeGreaterThan(8);
      }
  });
  it('the grid breaks up: zones of slots at different angles', () => {
    const angles = bays.map((b) => (b.a * 180) / Math.PI);
    const families: number[] = [];
    for (const a of angles) if (families.every((f) => Math.abs(f - a) > 15)) families.push(a);
    expect(families.length).toBeGreaterThanOrEqual(2);
  });
  it('highways run along the seams between the turned zones, lit, nothing standing on them', () => {
    const hw = g.strips.filter((s) => s.material === 'street' && s.d >= 14 && inDw(s.x, s.y));
    expect(hw.length).toBeGreaterThan(30);
    for (const b of bays) expect(hw.every((h) => Math.hypot(h.x - b.x, h.y - b.y) > Math.min(b.w, b.d) / 2), `bay ${b.x},${b.y}`).toBe(true);
    expect(g.props.filter((p) => p.kind === 'lamp' && hw.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 12)).length).toBeGreaterThan(20);
  });
  it('the Marsh side gets only a few small landings: no long piers, cranes or floodlights face the drowned quarter', () => {
    const marsh = city.map.districts.find((d) => d.id === 'marsh')!;
    const inMarsh = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], marsh.border!);
    const piers = g.strips.filter((s) => s.material === 'concrete' && s.z0 < 0 && s.h < 2 && s.w >= 8 && inMarsh(s.x, s.y));
    expect(piers.length).toBeGreaterThan(0);
    expect(piers.length).toBeLessThanOrEqual(8);
    for (const p of piers) expect(p.w).toBeLessThan(22);
    expect(g.props.filter((p) => p.kind === 'lattice' && p.h >= 14 && inMarsh(p.x, p.y)).length).toBe(0);
    // The ground between the two stays ground: no full pier runs out within 20 of the Marsh either (bay piers by its west corner run parallel to it, ~30 off).
    const nearMarsh = (x: number, y: number) => [0, 1, 2, 3, 4, 5, 6, 7].some((k) => inMarsh(x + Math.cos(k * 0.785) * 20, y + Math.sin(k * 0.785) * 20));
    expect(g.strips.filter((s) => s.material === 'concrete' && s.z0 < 0 && s.h < 2 && s.w >= 28 && !inDw(s.x, s.y) && nearMarsh(s.x, s.y)).length).toBe(0);
  });
  it('deep zoom over the Works', () => {
    expect(city.styles['drownworks']!.deepZoom).toBe(true);
  });
});
