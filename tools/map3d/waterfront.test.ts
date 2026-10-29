import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { loadCity } from './load';
import { spineGeometry } from './spine';
import { coastEdges, landGrid, onLand } from './water';
import { waterfrontGeometry } from './waterfront';

const city = loadCity('.');
const land = landGrid(city.map, city.spines.map((sp) => spineGeometry(sp, city.map.places, null).along));
const isLand = onLand(land);
const cfg = city.styles['strand']!.waterfront!;
const edges = coastEdges(city.map, land, 'strand');
const gen = () => waterfrontGeometry('strand', cfg, edges, city.map.places, isLand);
const pin = (id: string) => {
  const p = city.map.places.find((q) => q.id === id)!.pin;
  return [(p[0] / 100) * MAP_W, (p[1] / 100) * MAP_H] as const;
};
const segDist = (x: number, y: number, a: number[], b: number[]) => {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
  const t = Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0]! - t * dx, y - a[1]! - t * dy);
};

describe('the Strand waterfront', () => {
  const g = gen();
  it('same data, same waterfront', () => {
    expect(gen()).toEqual(g);
  });
  it('a boardwalk deck along every stretch of coast, with stalls on it', () => {
    const deck = g.strips.filter((s) => s.material === 'walkway');
    for (const [a, b] of edges) expect(deck.some((s) => segDist(s.x, s.y, a, b) < 20), `edge ${a} ${b}`).toBe(true);
    expect(g.buildings.filter((b) => b.kind === 'shack').length).toBeGreaterThan(20);
  });
  it('the Low Roller: a neon wheel about 80 high, standing on the boardwalk by its pin', () => {
    const rim = g.curves.filter((c) => c.material === 'neon' && c.color === cfg.wheel.color && c.points.length >= 40);
    expect(rim.length).toBeGreaterThanOrEqual(2);
    const top = Math.max(...rim[0]!.points.map((p) => p[2]));
    expect(top).toBeGreaterThan(cfg.wheel.height - 6);
    expect(top).toBeLessThan(cfg.wheel.height + 2);
    const hx = rim[0]!.points.reduce((s, p) => s + p[0], 0) / rim[0]!.points.length;
    const hy = rim[0]!.points.reduce((s, p) => s + p[1], 0) / rim[0]!.points.length;
    expect(Math.min(...edges.map(([a, b]) => segDist(hx, hy, a, b)))).toBeLessThan(30);
    // On the map the whole rim shows against land, not the bay: what's behind a point on screen is the ground north of
    // it by its height × cos(elevation).
    const lift = Math.cos((52 * Math.PI) / 180);
    for (const p of rim[0]!.points) expect(isLand(p[0], p[1] - p[2] * lift), `rim ${p}`).toBe(true);
    const [px, py] = pin(cfg.wheel.near);
    expect(Math.hypot(hx - px, hy - py)).toBeLessThan(160);
  });
  it('the old pier runs out over the water, the Breakwater at its far end', () => {
    const [px, py] = pin(cfg.pier.near);
    const pier = g.strips.filter((s) => s.material === 'concrete' && Math.hypot(s.x - px, s.y - py) < 260);
    expect(pier.length).toBeGreaterThan(0);
    const bw = g.buildings.filter((b) => b.kind === 'building');
    expect(bw.length).toBeGreaterThanOrEqual(2);
    for (const b of bw) expect(isLand(b.x, b.y)).toBe(false);
    // Out in open water, not across an inlet against the far shore.
    for (const b of bw) for (let k = 0; k < 12; k++) expect(isLand(b.x + Math.cos(k / 2) * 50, b.y + Math.sin(k / 2) * 50), `around the Breakwater ${k}`).toBe(false);
  });
  it('nothing blinks: lights are steady and few', () => {
    expect(g.lights.length).toBeLessThan(40);
  });
});
