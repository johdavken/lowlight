import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, pinHeight } from '../../shared/map-projection';
import { loadCity } from './load';
import { ribbonGeometry } from './structure';
import { spineGeometry } from './spine';
import { landGrid, onLand } from './water';
import { insideBorder } from '../../shared/map-schema';

const city = loadCity('.');
const ribbon = city.structures.find((s) => s.id === 'ribbon')!;
const gen = () => ribbonGeometry(ribbon, city.map.places);
const pinPx = (id: string) => {
  const p = city.map.places.find((q) => q.id === id)!;
  return [(p.pin[0] / 100) * MAP_W, (p.pin[1] / 100) * MAP_H] as const;
};

describe('ribbonGeometry', () => {
  const g = gen();
  const walkways = g.strips.filter((s) => s.material === 'walkway');
  it('same route, same Ribbon', () => {
    const again = gen();
    expect({ ...again, distance: null, frame: null }).toEqual({ ...g, distance: null, frame: null });
  });
  it('tapers from 6 to 2', () => {
    const start = ribbon.route[0]!, end = ribbon.route.at(-1)!;
    const near = (p: readonly number[]) => (w: { x: number; y: number }) => Math.hypot(w.x - (p[0]! / 100) * MAP_W, w.y - (p[1]! / 100) * MAP_H) < 20;
    expect(new Set(walkways.filter(near(start)).map((w) => w.z0)).size).toBe(6);
    expect(new Set(walkways.filter(near(end)).map((w) => w.z0)).size).toBe(2);
  });
  it('every place on the Ribbon gets a walkway at its level, by the route point nearest its pin', () => {
    for (const p of city.map.places.filter((q) => q.on === 'ribbon' && typeof q.level === 'number')) {
      const [px, py] = pinPx(p.id);
      const nearest = walkways.reduce((best, w) => (Math.hypot(w.x - px, w.y - py) < Math.hypot(best.x - px, best.y - py) ? w : best));
      const z = ((p.level as number) - 1) * 8.5;
      expect(
        walkways.some((w) => w.z0 === z && Math.hypot(w.x - nearest.x, w.y - nearest.y) < 20),
        `${p.id} level ${p.level}`,
      ).toBe(true);
    }
  });
  it('pin heights: the Intake at Level 4, the Rooftop above six levels', () => {
    expect(g.pinHeights['lowlight-intake']).toBeCloseTo(pinHeight(4, 8.5, 0), 6);
    expect(g.pinHeights['lowlight-intake']).toBeCloseTo(26.7, 6);
    expect(g.pinHeights['ribbon-rooftop']!).toBeGreaterThan(6 * 8.5);
  });
  it('nothing stands in the canyon, the delta\'s branches included', () => {
    const toLine = (x: number, y: number, pts: [number, number][]) =>
      Math.min(...pts.slice(1).map((q, i) => {
        const p = pts[i]!, dx = q[0] - p[0], dy = q[1] - p[1];
        const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy);
      }));
    for (const b of g.buildings.filter((x) => x.kind === 'stack' || x.kind === 'tier')) {
      // a branch narrows to a 3 px road: no block stands on its middle anywhere along it
      for (const br of g.branches) expect(toLine(b.x, b.y, br)).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('both ends spread into a delta: branches joined to the Ribbon that shrink into roads', () => {
    expect(g.branches.length).toBeGreaterThanOrEqual(6);
    const near = (x: number, y: number, d: number) => (b: { x: number; y: number }) => Math.hypot(b.x - x, b.y - y) < d;
    for (const br of g.branches) {
      // Joined: its root is on the Ribbon's route (the canyon's middle), not out past its stacks.
      const [rx, ry] = br[0]!;
      expect(g.distance(rx, ry)).toBeLessThan(-(ribbon.gap / 2));
      // A road at its tip: a street floor, no walkways above it, no blocks standing on it.
      const [tx, ty] = br.at(-1)!;
      expect(g.strips.some((st) => st.material === 'floor' && near(tx, ty, 8)(st))).toBe(true);
      expect(walkways.some(near(tx, ty, 6))).toBe(false);
      expect(g.buildings.filter((b) => b.kind === 'stack' || b.kind === 'tier').some(near(tx, ty, 2))).toBe(false);
    }
  });
  it('the low levels are dark', () => {
    expect(g.volumes).toHaveLength(1);
    expect(g.volumes[0]).toMatchObject({ kind: 'canyon-dark', z0: 0.1 });
    expect(g.volumes[0]!.z1).toBeCloseTo(2.2 * 8.5, 6);
  });
});

describe('the Strand fan', () => {
  const land = landGrid(city.map, city.spines.map((sp) => spineGeometry(sp, city.map.places, null).along));
  const strand = city.map.districts.find((d) => d.id === 'strand')!;
  const clip = (x: number, y: number, within?: string) => onLand(land)(x, y) && (!within || insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], city.map.districts.find((d) => d.id === within)!.border!));
  const g = ribbonGeometry(ribbon, city.map.places, clip);
  const end = ribbon.route.at(-1)!;
  const endPx: [number, number] = [(end[0] / 100) * MAP_W, (end[1] / 100) * MAP_H];
  const fan = g.branches.filter((b) => Math.hypot(b[0]![0] - endPx[0], b[0]![1] - endPx[1]) < 20);
  const offshoots = g.branches.filter((b) => !fan.includes(b) && fan.some((t) => t.some((q) => Math.hypot(q[0] - b[0]![0], q[1] - b[0]![1]) < 1)));
  const length = (b: [number, number][]) => b.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1]), 0);
  it('a few trunk boulevards leave the Ribbon end, long, spread from east round to north-west', () => {
    expect(fan.length).toBeGreaterThanOrEqual(3);
    expect(fan.filter((b) => length(b) > 300).length).toBeGreaterThanOrEqual(3);
    const ends = fan.map((b) => ((Math.atan2(b.at(-1)![1] - endPx[1], b.at(-1)![0] - endPx[0]) * 180) / Math.PI + 360) % 360);
    expect(ends.some((a) => a < 60)).toBe(true);
    expect(ends.some((a) => a > 180)).toBe(true);
  });
  it('branches peel off the trunks partway, run on to the shore, and never run into another road', () => {
    expect(offshoots.length).toBeGreaterThanOrEqual(1);
    // No dead ends: each branch runs on to the water.
    for (const b of offshoots) {
      const [p, q] = [b.at(-2)!, b.at(-1)!], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      expect([8, 16, 24, 32].some((t) => !onLand(land)(q[0] + ((q[0] - p[0]) / d) * t, q[1] + ((q[1] - p[1]) / d) * t))).toBe(true);
    }
    const roads = [...fan, ...offshoots];
    for (const b of offshoots)
      for (const q of b.slice(12))
        for (const o of roads) if (o !== b) for (const u of o) expect(Math.hypot(u[0] - q[0], u[1] - q[1])).toBeGreaterThan(13);
  });
  it('stay on Strand land: none run into the bay', () => {
    for (const b of [...fan, ...offshoots]) for (const p of b.slice(3)) expect(insideBorder([(p[0] / MAP_W) * 100, (p[1] / MAP_H) * 100], strand.border!) && onLand(land)(p[0], p[1])).toBe(true);
  });
});

describe('the ribs at the Strand end ("a really strong element")', () => {
  const g = ribbonGeometry(ribbon, city.map.places);
  const end = ribbon.route.at(-1)!;
  const endPx: [number, number] = [(end[0] / 100) * MAP_W, (end[1] / 100) * MAP_H];
  it('short canyons peel off both sides of the last stretch, as well as the fan from the very end', () => {
    const ribs = g.branches.filter((b) => {
      const d = Math.hypot(b[0]![0] - endPx[0], b[0]![1] - endPx[1]);
      return d > 15 && d < 260 && g.distance(b[0]![0], b[0]![1]) < -(ribbon.gap / 2);
    });
    expect(ribs.length).toBeGreaterThanOrEqual(6);
    // Canyons, not plain roads: stacks stand along their first part.
    const stacks = g.buildings.filter((b) => b.kind === 'stack');
    for (const rib of ribs) expect(stacks.some((s) => Math.hypot(s.x - rib[2]![0], s.y - rib[2]![1]) < 25)).toBe(true);
  });
});
