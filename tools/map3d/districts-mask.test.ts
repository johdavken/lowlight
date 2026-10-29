import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { loadCity } from './load';
import { insideBorder } from '../../shared/map-schema';
import { toBorder } from '../../shared/district-lookup';

// Rolling blackouts phase 1 (spec 2026-10-27): the mask pass needs every item's district.
const city = loadCity('.');
const g = generate(city).geometry;
const pct = (x: number, y: number): [number, number] => [(x / 4608) * 100, (y / 3072) * 100];

describe('districts for the blackout mask', () => {
  it('the geometry lists every bordered district, then spine and ribbon', () => {
    expect(g.districts.map((d) => d.id)).toEqual([...city.map.districts.filter((d) => d.border && d.border.length >= 3).map((d) => d.id), 'spine', 'ribbon']);
    expect(g.districts.length).toBeLessThanOrEqual(31);
  });
  it('every item has a district id that is in the table or empty', () => {
    const ids = new Set(['', ...g.districts.map((d) => d.id)]);
    for (const list of [g.buildings, g.props, g.strips, g.curves] as { district?: string }[][]) for (const it of list) expect(ids.has(it.district!)).toBe(true);
  });
  it("the Spine's items count as spine, the Ribbon's as ribbon, whatever they stand over", () => {
    const deck = city.spines[0]!.deckHeight;
    const decks = g.strips.filter((s) => s.material === 'road' && s.z0 >= deck - 10);
    expect(decks.length).toBeGreaterThan(0);
    expect(decks.every((s) => s.district === 'spine')).toBe(true);
    expect(g.buildings.some((b) => b.district === 'ribbon')).toBe(true);
  });
  it('a curve inside Velvet (and no other border) that is not the Spine or the Ribbon is velvet', () => {
    const velvet = city.map.districts.find((d) => d.id === 'velvet')!.border!;
    const others = city.map.districts.filter((d) => d.id !== 'velvet' && d.border).map((d) => d.border!);
    const only = (p: [number, number]) => insideBorder(p, velvet) && !others.some((b) => insideBorder(p, b));
    const inside = g.curves.filter((c) => c.district !== 'spine' && c.district !== 'ribbon' && only(pct(c.points[0]![0], c.points[0]![1])));
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every((c) => c.district === 'velvet')).toBe(true);
  });
  it('items just outside every border (the Strand boardwalk on its natural shore) take the nearest district within reach', () => {
    const bordered = g.districts.filter((d) => d.border.length >= 3);
    const near = (x: number, y: number) => bordered.some((d) => toBorder([x, y], d.border) < 170);
    const orphans = g.props.filter((p) => p.district === '' && near(p.x, p.y));
    expect(orphans.length).toBe(0);
    expect(g.maskFloor!.runs.length).toBeGreaterThan(0);
  });
  it('land polygons name their district', () => {
    expect(g.landDistricts.length).toBe(g.land.length);
    expect(g.landDistricts.every((id) => g.districts.some((d) => d.id === id))).toBe(true);
  });
});
