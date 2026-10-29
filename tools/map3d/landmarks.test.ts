import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const cat = city.landmarks.find((l) => l.kind === 'tower-sign' && l.shape === 'cat') as Extract<(typeof city.landmarks)[number], { kind: 'tower-sign' }>;

describe('the Cat ("up on the cliff face", as the rooms show it)', () => {
  const g = generate(city).geometry;
  const t = g.terrain!;
  const height = (x: number, y: number) => {
    const i = Math.round((x - t.x0) / t.step), j = Math.round((y - t.y0) / t.step);
    return i >= 0 && j >= 0 && i < t.cols && j < t.rows ? t.heights[j * t.cols + i]! : -1;
  };
  const neon = g.curves.filter((c) => c.color === cat.color && c.material === 'neon' && c.bevel >= 1);
  const pts = neon.flatMap((c) => c.points);
  it('a seated cat in neon, big: most of the cliff high', () => {
    expect(neon.length).toBeGreaterThanOrEqual(3);
    const zs = pts.map((p) => p[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(city.terrain!.height * 0.5);
  });
  it('hung on the cliff face, not on a tower: rock below it, the top of the cliff behind it', () => {
    expect(g.buildings.some((b) => b.kind === 'tower' && b.tint === '#ffb347')).toBe(false);
    const base = pts.reduce((a, p) => (p[2] < a[2] ? p : a));
    expect(height(base[0], base[1] - 3)).toBeGreaterThan(base[2] - 12);
    const mid = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    expect(height(mid, base[1] - 40)).toBeGreaterThan(city.terrain!.height * 0.8);
  });
  it('scaffolding behind it', () => {
    const [cx, cy] = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    expect(g.props.filter((p) => p.kind === 'lattice' && Math.hypot(p.x - cx, p.y - cy) < 40).length).toBeGreaterThan(10);
  });
});

describe('the Shelf', () => {
  const g = generate(city).geometry;
  const t = g.terrain!;
  const H = city.terrain!.height;
  it('a lit balustrade runs along the cliff top above the face', () => {
    // The balustrade's pieces (1.2 high on the top's own height; the Shelf's paving and walls are other sizes).
    const rail = g.strips.filter((s) => s.material === 'concrete' && s.z0 === H && s.h === 1.2 && s.d === 0.8);
    expect(rail.length).toBeGreaterThan(40);
    const lamps = g.props.filter((p) => p.kind === 'lamp' && p.z0 > H);
    expect(lamps.length).toBeGreaterThan(15);
    // On the edge: the ground just south of each piece is far below the top.
    const at = (x: number, y: number) => {
      const i = Math.round((x - t.x0) / t.step), j = Math.round((y - t.y0) / t.step);
      return i >= 0 && j >= 0 && i < t.cols && j < t.rows ? t.heights[j * t.cols + i]! : -1;
    };
    for (const s of rail) expect(at(s.x, s.y + 24)).toBeLessThan(H * 0.6);
  });
});
describe('the Cat is slender', () => {
  const g = generate(city).geometry;
  it('taller than wide by well over 2 to 1', () => {
    const body = g.curves.find((c) => c.color === cat.color && c.bevel >= 1 && c.points.length > 10)!;
    const xs = body.points.map((p) => p[0]), zs = body.points.map((p) => p[2]);
    expect((Math.max(...zs) - Math.min(...zs)) / (Math.max(...xs) - Math.min(...xs))).toBeGreaterThan(1.7);
  });
});
