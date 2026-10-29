import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const mi = city.map.districts.find((d) => d.id === 'mirage')!;
const cfg = city.styles['mirage']!.enclave!;
const inM = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], mi.border!);
const g = generate(city).geometry;
const own = g.buildings.filter((b) => b.district === 'mirage');
const z = city.terrain!.height;

describe('Mirage Heights, the Shelf: brutalism meets cyberpunk', () => {
  it('everything stands on the plateau top, inside the Shelf', () => {
    // The enclave's own blocks (the cliff's shacks and the funicular car are the terrain's, down the face).
    const top = own.filter((b) => ['building', 'tier', 'wall', 'bridge'].includes(b.kind));
    expect(top.length).toBeGreaterThan(200);
    for (const b of top) {
      expect(inM(b.x, b.y)).toBe(true);
      expect(b.z0).toBeGreaterThanOrEqual(z - 1);
    }
  });
  it('a mall with its reflecting pool, the Chamber at its head, the spire tower the tallest on the Shelf', () => {
    expect(g.strips.some((s) => s.material === 'bay-dim' && inM(s.x, s.y))).toBe(true);
    const tallest = Math.max(...own.map((b) => b.z0 + b.h));
    expect(tallest - z).toBeGreaterThan(cfg.tower.h * 0.9);
  });
  it('brutalist massing: cantilevers and inverted pyramids (blocks wider above than below), slot windows', () => {
    const bases = own.filter((b) => b.kind === 'building' && b.z0 === z);
    const wider = bases.filter((b) => own.some((t) => t.kind === 'tier' && Math.hypot(t.x - b.x, t.y - b.y) < 8 && t.w * t.d > b.w * b.d * 1.2));
    expect(wider.length).toBeGreaterThan(10);
    expect(bases.filter((b) => b.lit === cfg.slots).length).toBeGreaterThan(bases.length * 0.4);
  });
  it('cyberpunk dressing: neon edges in clashing colours on some blocks, lit ad boards', () => {
    const neon = g.strips.filter((s) => s.material === 'street-light' && cfg.neon.includes(s.color!) && inM(s.x, s.y));
    expect(new Set(neon.map((s) => s.color)).size).toBeGreaterThanOrEqual(3);
    expect(g.props.filter((p) => p.kind === 'billboard' && inM(p.x, p.y) && cfg.neon.includes(p.color!)).length).toBeGreaterThan(20);
  });
  it('officials homes, a wooded park, SDG posts', () => {
    expect(own.filter((b) => b.kind === 'building' && b.h < 12).length).toBeGreaterThan(20);
    expect(g.props.filter((p) => p.kind === 'pine' && inM(p.x, p.y)).length).toBeGreaterThan(100);
    expect(own.filter((b) => b.kind === 'shack' && b.tint === '#d8ecff').length).toBeGreaterThanOrEqual(4);
  });
});
