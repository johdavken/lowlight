import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';
import { districtStreets } from './streets';

const city = loadCity('.');
const velvet = city.map.districts.find((d) => d.id === 'velvet')!;
const cfg = city.styles['velvet']!.streets!;
const inVelvet = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], velvet.border!);
const gen = () => districtStreets('velvet', cfg, velvet.border!, city.map.places, city.styles['velvet']!);

describe("Velvet's streets (2026-10-26)", () => {
  const s = gen();
  it('same data, same streets', () => {
    expect({ ...gen(), distance: null }).toEqual({ ...s, distance: null });
  });
  it('the Row winds through the quarter, lanes off it, all inside Velvet', () => {
    const roads = s.strips.filter((t) => t.material === 'street');
    expect(roads.filter((t) => t.d >= cfg.width - 0.01).length).toBeGreaterThan(40);
    expect(s.lanes.length).toBeGreaterThanOrEqual(8);
    for (const t of roads) expect(inVelvet(t.x, t.y), `${t.x},${t.y}`).toBe(true);
  });
  it('lanes start on the Row or another lane, and end on another street or the quarter\'s edge: no dead ends', () => {
    const others = (lane: [number, number][], x: number, y: number) =>
      [s.row, ...s.lanes].filter((o) => o !== lane).some((o) => o.some((q) => Math.hypot(q[0] - x, q[1] - y) < cfg.lanes.width + cfg.width));
    for (const lane of s.lanes) {
      expect(s.distance(lane[0]![0], lane[0]![1])).toBeLessThan(1);
      const [ex, ey] = lane.at(-1)!;
      const atEdge = !inVelvet(ex + (ex - lane.at(-2)![0]) * 1.5, ey + (ey - lane.at(-2)![1]) * 1.5);
      expect(atEdge || others(lane, ex, ey), `lane ending ${ex},${ey}`).toBe(true);
    }
  });
  it('paper lanterns strung across the streets, dim: discreet, not a neon strip', () => {
    const strings = s.curves.filter((c) => c.material === 'neon' && c.color !== cfg.house!.glass);
    expect(strings.length).toBeGreaterThan(30);
    for (const c of strings) expect(c.strength ?? 38).toBeLessThanOrEqual(8);
    expect(s.props.filter((p) => p.kind === 'lamp').length).toBeGreaterThan(60);
  });
  it('the Glass Orchid: a house at its pin with a glowing glass roof', () => {
    const pin = city.map.places.find((p) => p.id === cfg.house!.near)!.pin;
    const [px, py] = [(pin[0] / 100) * MAP_W, (pin[1] / 100) * MAP_H];
    const house = s.buildings.filter((b) => Math.hypot(b.x - px, b.y - py) < 30);
    expect(house.length).toBeGreaterThanOrEqual(1);
    expect(s.curves.some((c) => c.color === cfg.house!.glass && Math.hypot(c.points[0]![0] - px, c.points[0]![1] - py) < 40)).toBe(true);
  });
  it('blocks stand off the streets and the house', () => {
    const g = generate(city).geometry;
    const pin = city.map.places.find((p) => p.id === cfg.house!.near)!.pin;
    const [px, py] = [(pin[0] / 100) * MAP_W, (pin[1] / 100) * MAP_H];
    const blocks = g.buildings.filter((b) => b.district === 'velvet' && b.kind === 'building' && Math.hypot(b.x - px, b.y - py) > 30);
    expect(blocks.length).toBeGreaterThan(50);
    for (const b of blocks) expect(s.distance(b.x, b.y), `${b.x},${b.y}`).toBeGreaterThan(4);
  }, 60_000);
  it('low and old: no Velvet block over 40', () => {
    const g = generate(city).geometry;
    for (const b of g.buildings.filter((q) => q.district === 'velvet')) expect(b.z0 + b.h).toBeLessThan(40);
  });
});

describe('Velvet quality pass 1: the streets are lined, like the Ribbon', () => {
  const s = districtStreets('velvet', cfg, velvet.border!, city.map.places, city.styles['velvet']!);
  const front = s.buildings.filter((b) => b.kind === 'stack');
  it('row houses face every street, square to it, low', () => {
    expect(front.length).toBeGreaterThan(250);
    for (const b of front) {
      expect(b.z0 + b.h).toBeLessThan(40);
      expect(inVelvet(b.x, b.y)).toBe(true);
    }
  });
  it('shopfronts, hanging blade signs, cables and laundry across the lanes', () => {
    expect(s.props.filter((p) => p.kind === 'shopfront').length).toBeGreaterThan(120);
    expect(s.props.filter((p) => p.kind === 'hanging-sign').length).toBeGreaterThan(25);
    expect(s.curves.filter((c) => c.material === 'cable').length).toBeGreaterThan(50);
    expect(s.props.filter((p) => p.kind === 'laundry').length).toBeGreaterThan(20);
  });
  it('no row house stands in a street', () => {
    for (const b of front) expect(s.distance(b.x, b.y)).toBeGreaterThan(1);
  });
});

describe('Velvet pass 5', () => {
  const s = districtStreets('velvet', cfg, velvet.border!, city.map.places, city.styles['velvet']!);
  it('the Row opens into a lantern square at the cliff foot, under the Cat', () => {
    const end = s.row.at(-1)!;
    const R = cfg.square!.radius;
    // Lantern strings radiate from a pole in its middle.
    const spokes = s.curves.filter((c) => c.material === 'neon' && Math.hypot(c.points[0]![0] - end[0], c.points[0]![1] - end[1]) < 3 && c.points.length >= 5);
    expect(spokes.length).toBeGreaterThanOrEqual(8);
    // Open: no row house stands in it.
    for (const b of s.buildings.filter((q) => q.kind === 'stack' || q.kind === 'tier')) expect(Math.hypot(b.x - end[0], b.y - end[1])).toBeGreaterThan(R);
    expect(s.distance(end[0], end[1])).toBeLessThan(0);
    // Right below the Cat: a stair climbs from it to the Cat's scaffold.
    const C = cfg.square!.climb!;
    const stair = s.strips.find((t) => t.material === 'stair' && t.ends && Math.hypot(t.ends[1][0] - (C.to[0] / 100) * MAP_W, t.ends[1][1] - (C.to[1] / 100) * MAP_H) < 1);
    expect(stair).toBeDefined();
    expect(Math.hypot(end[0] - (C.to[0] / 100) * MAP_W, end[1] - (C.to[1] / 100) * MAP_H)).toBeLessThan(90);
  });
  it('the Glass Orchid is big enough to find', () => {
    expect(cfg.house!.w).toBeGreaterThanOrEqual(30);
    const pin = city.map.places.find((p) => p.id === cfg.house!.near)!.pin;
    const [px, py] = [(pin[0] / 100) * MAP_W, (pin[1] / 100) * MAP_H];
    expect(s.props.filter((p) => p.kind === 'hanging-sign' && p.color === cfg.house!.glass && Math.hypot(p.x - px, p.y - py) < 40).length).toBeGreaterThanOrEqual(1);
  });
  it('a red-light stretch: along its lane, red lanterns hung closer, red walls, signs and shopfronts, a red glow', () => {
    const R = cfg.redLight!;
    const a = [(R.from[0] / 100) * MAP_W, (R.from[1] / 100) * MAP_H], b = [(R.to[0] / 100) * MAP_W, (R.to[1] / 100) * MAP_H];
    const along = (x: number, y: number) => {
      const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, u = Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a[0]! - u * dx, y - a[1]! - u * dy);
    };
    const inZone = (x: number, y: number) => along(x, y) < R.width / 2;
    const red = new Set(R.colors), walls = new Set(R.walls);
    const strings = s.curves.filter((c) => c.material === 'neon' && c.points.length === 6 && inZone(c.points[2]![0], c.points[2]![1]));
    expect(strings.length).toBeGreaterThan(8);
    for (const c of strings) expect(red.has(c.color!)).toBe(true);
    // Hung closer than anywhere else: more strings per length of the zone than the quarter's lanes get.
    const len = s.strips.filter((t) => t.material === 'street' && inZone(t.x, t.y)).reduce((sum, t) => sum + t.w, 0);
    // The quarter's lanes get one every 0.8 × lanternEvery px; the stretch well over that.
    expect(strings.length / len).toBeGreaterThan((1 / (cfg.lanternEvery * 0.8)) * 1.3);
    const houses = s.buildings.filter((h) => h.kind === 'stack' && inZone(h.x, h.y));
    expect(houses.length).toBeGreaterThan(6);
    for (const h of houses) expect(walls.has(h.tint)).toBe(true);
    const fronts = s.props.filter((p) => (p.kind === 'shopfront' || p.kind === 'hanging-sign') && inZone(p.x, p.y));
    expect(fronts.length).toBeGreaterThan(houses.length * 0.8);
    expect(fronts.filter((p) => red.has(p.color!) || walls.has(p.color!)).length).toBe(fronts.length);
    expect(s.lights.filter((l) => inZone(l.x, l.y) && red.has(l.color)).length).toBeGreaterThanOrEqual(4);
    // Outside it, the quarter keeps its own colours.
    expect(s.buildings.filter((h) => h.kind === 'stack' && !inZone(h.x, h.y) && along(h.x, h.y) > R.width).some((h) => !walls.has(h.tint))).toBe(true);
  });
  it('the red-light stretch changes colours and lights only: every lane and block stands where it did without it', () => {
    const { redLight: _, ...plain } = cfg;
    const p = districtStreets('velvet', plain, velvet.border!, city.map.places, city.styles['velvet']!);
    expect(s.lanes).toEqual(p.lanes);
    const shape = (b: { x: number; y: number; w: number; d: number; h: number; brick: number; kind: string }) => [b.x, b.y, b.w, b.d, b.h, b.brick, b.kind];
    expect(s.buildings.map(shape)).toEqual(p.buildings.map(shape));
  });
});
