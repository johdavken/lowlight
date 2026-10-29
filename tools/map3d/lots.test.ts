import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { loadCity, type CityData } from './load';
import { cityLots } from './lots';

const city = loadCity('.');
// A stand-in structure: a line through Karasu (map px), its distance as the keep-out.
const A: [number, number] = [0.84 * MAP_W, 0.31 * MAP_H];
const B: [number, number] = [0.92 * MAP_W, 0.37 * MAP_H];
function toLine(x: number, y: number): number {
  const [ax, ay] = A, [bx, by] = B, dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
const of = (c: CityData) => cityLots(c, toLine);
const inDistrict = (id: string) => (b: { district: string }) => b.district === id;

describe('cityLots', () => {
  const a = of(city);
  it('same data, same buildings', () => {
    expect(of(city)).toEqual(a);
  });
  it("Velvet's style leaves Karasu alone", () => {
    const changed: CityData = { ...city, styles: { ...city.styles, velvet: { ...city.styles.velvet!, height: [30, 90] } } };
    const b = of(changed);
    expect(b.buildings.filter(inDistrict('karasu'))).toEqual(a.buildings.filter(inDistrict('karasu')));
    expect(b.buildings.filter(inDistrict('velvet'))).not.toEqual(a.buildings.filter(inDistrict('velvet')));
  });
  it('buildings stand inside their district', () => {
    for (const b of a.buildings) {
      const d = city.map.districts.find((x) => x.id === b.district)!;
      expect(insideBorder([(b.x / MAP_W) * 100, (b.y / MAP_H) * 100], d.border!), `${b.district} ${b.x},${b.y}`).toBe(true);
    }
  });
  it('nothing within 26 of a structure', () => {
    for (const b of a.buildings) expect(toLine(b.x, b.y)).toBeGreaterThanOrEqual(26);
  });
  it('Karasu rises toward the structure', () => {
    const k = a.buildings.filter((b) => b.district === 'karasu' && b.kind === 'building');
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const near = mean(k.filter((b) => toLine(b.x, b.y) < 60).map((b) => b.h));
    const far = mean(k.filter((b) => toLine(b.x, b.y) > 140).map((b) => b.h));
    expect(near).toBeGreaterThan(2 * far);
  });
  it('ruins have no roof and no lit windows', () => {
    const walls = a.buildings.filter((b) => b.kind === 'wall');
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) expect(w.lit).toBe(0);
  });
  it('pools stay in their district', () => {
    const velvet = city.map.districts.find((d) => d.id === 'velvet')!;
    const style = city.styles.velvet!;
    const pools = a.lights.filter((l) => l.power === style.pools.power && style.pools.colors.includes(l.color));
    expect(pools.length).toBe(style.pools.count);
    for (const l of pools) expect(insideBorder([(l.x / MAP_W) * 100, (l.y / MAP_H) * 100], velvet.border!)).toBe(true);
  });
});

describe('the Strand details pass', () => {
  const a = of(city);
  const inStrand = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], city.map.districts.find((d) => d.id === 'strand')!.border!);
  it('neon roof outlines, rooftop billboards and lit marquees on Strand blocks', () => {
    const roofs = a.curves.filter((c) => c.material === 'neon' && inStrand(c.points[0]![0], c.points[0]![1]));
    expect(roofs.length).toBeGreaterThan(15);
    for (const c of roofs) expect(c.strength).toBeLessThanOrEqual(14);
    expect(a.props.filter((p) => p.kind === 'billboard' && inStrand(p.x, p.y)).length).toBeGreaterThan(8);
    expect(a.props.filter((p) => p.kind === 'shopfront' && inStrand(p.x, p.y)).length).toBeGreaterThan(30);
  });
  it("the Strand's grid streets are roads, inside the district; only districts with gridRoads draw their grid", () => {
    const roads = a.strips.filter((s) => s.material === 'street');
    expect(roads.filter((r) => inStrand(r.x, r.y)).length).toBeGreaterThan(100);
    const withGrid = city.map.districts.filter((d) => d.border && city.styles[d.id]?.gridRoads);
    for (const r of roads) expect(withGrid.some((d) => insideBorder([(r.x / MAP_W) * 100, (r.y / MAP_H) * 100], d.border!))).toBe(true);
  });
  it('only districts with a details pass get them', () => {
    const withDetails = city.map.districts.filter((d) => d.border && city.styles[d.id]?.details);
    const inAny = (x: number, y: number) => withDetails.some((d) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], d.border!));
    expect(a.curves.every((c) => inAny(c.points[0]![0], c.points[0]![1]))).toBe(true);
  });
});
