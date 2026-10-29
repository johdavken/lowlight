import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';
import { coastEdges, landGrid } from './water';
import { insideBorder } from '../../shared/map-schema';
import { spineGeometry } from './spine';

const city = loadCity('.');
describe('water and land', () => {
  const g = generate(city).geometry;
  it('every district with a border is land; the rest is water', () => {
    expect(g.land.length).toBe(city.map.districts.filter((d) => d.border && d.border.length >= 3 && !city.styles[d.id]?.flooded && !city.styles[d.id]?.isle).length);
  });
  it("the Strand's waterfront faces the bay: coast edges on its south side, none on edges shared with Karasu", () => {
    const spine = spineGeometry(city.spines[0]!, city.map.places, null);
    const edges = coastEdges(city.map, landGrid(city.map, [spine.along]), 'strand');
    expect(edges.length).toBeGreaterThan(2);
    const midY = edges.map(([a, b]) => ((a[1] + b[1]) / 2 / MAP_H) * 100);
    expect(Math.max(...midY)).toBeGreaterThan(48);
    // Its north edge runs along Karasu and Velvet: not coast.
    for (const [a, b] of edges) expect(((a[1] + b[1]) / 2 / MAP_H) * 100).toBeGreaterThan(36);
    void MAP_W;
  });
});

describe('the water has its own starting point', () => {
  it("moving or dropping the Bay's name leaves the water as it is", () => {
    const at = (label: [number, number] | null) => {
      const map = structuredClone(city.map);
      const bay = map.districts.find((d) => d.id === 'bay')!;
      if (label) bay.label = label;
      else map.districts = map.districts.filter((d) => d.id !== 'bay');
      return landGrid(map).cells;
    };
    const base = at([45.5, 60.5]);
    expect(base.includes(0)).toBe(true);
    expect(at([10, 10])).toEqual(base);
    expect(at(null)).toEqual(base);
  });
});

describe('natural shores on every coast', () => {
  const out = generate(city);
  const g2 = out.geometry;
  const isLand = (x: number, y: number) => { const c = out.land; const i = Math.floor(y / c.step) * c.cols + Math.floor(x / c.step); return c.cells[i] === 1; };
  const strand = city.map.districts.find((d) => d.id === 'strand')!;
  const sx = (strand.border![0]!.x / 100) * MAP_W, sy = (strand.border![0]!.y / 100) * MAP_H;
  const poly = g2.land.find((p) => p.some(([x, y]) => Math.hypot(x - sx, y - sy) < 1)) ?? g2.land.find((p) => p.length > strand.border!.length * 3)!;
  it("a coast wanders: the Strand's shore has many points, some out past its drawn border", () => {
    expect(poly.length).toBeGreaterThan(strand.border!.length * 10);
    const outside = poly.filter(([x, y]) => !insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], strand.border!));
    expect(outside.length).toBeGreaterThan(20);
  });
  it('never cuts into a district: every point of its drawn border is still on its land', () => {
    const inPoly = (x: number, y: number, pl: [number, number][]) => {
      let c = false;
      for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
        const [xi, yi] = pl[i]!, [xj, yj] = pl[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (const d of city.map.districts.filter((q) => q.border && q.border.length >= 3 && !city.styles[q.id]?.flooded && !city.styles[q.id]?.isle)) {
      const pts = d.border!.map((a) => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H] as [number, number]);
      const cx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length, cy = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
      const slab = g2.land.find((pl) => inPoly(cx, cy, pl) && pl.some(([x, y]) => Math.hypot(x - pts[1]![0], y - pts[1]![1]) < 20))!;
      expect(slab, d.id).toBeDefined();
      // Each border point is inside its slab or on its outline.
      const onLine = (x: number, y: number) => slab.some((q, k) => {
        const r2 = slab[(k + 1) % slab.length]!, dx = r2[0] - q[0], dy = r2[1] - q[1];
        const u = Math.max(0, Math.min(1, ((x - q[0]) * dx + (y - q[1]) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x - q[0] - u * dx, y - q[1] - u * dy) < 0.5;
      });
      for (const [x, y] of pts) expect(inPoly(x, y, slab) || onLine(x, y), `${d.id} ${x},${y}`).toBe(true);
    }
  });
});
