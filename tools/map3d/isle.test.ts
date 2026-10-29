import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const tidal = city.map.districts.find((d) => d.id === 'tidal')!;
const cfg = city.styles['tidal']!.isle!;
const inTidal = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], tidal.border!);
const g = generate(city).geometry;
const isle = g.islands.find((t) => t.id === 'tidal')!;
const at = (x: number, y: number) => {
  const i = Math.round((x - isle.x0) / isle.step), j = Math.round((y - isle.y0) / isle.step);
  return i >= 0 && j >= 0 && i < isle.cols && j < isle.rows ? isle.heights[j * isle.cols + i]! : -1;
};
const px = (p: readonly number[]) => [(p[0]! / 100) * MAP_W, (p[1]! / 100) * MAP_H] as const;
const land = isle.heights.filter((h) => h >= 0);

describe('Tidal Isle, a rock in the bay (Alcatraz for reference)', () => {
  it('low at the water all round, high along its ridge, highest at the QDF end', () => {
    const coast = tidal.border!.map((a) => at(...px([a.x, a.y]))).sort((a, b) => a - b);
    expect(coast[Math.floor(coast.length / 2)]!).toBeLessThan(4);
    expect(at(...px(cfg.ridge.from))).toBeGreaterThan(cfg.ridge.high - 12);
    expect(at(...px(cfg.ridge.from))).toBeGreaterThan(at(...px(cfg.ridge.to)));
  });
  it('a quay apron at the water round much of it, cliffs where it gives out', () => {
    const quay = land.filter((h) => Math.abs(h - cfg.quay) < 0.2).length;
    // A band round the coast, not a plain: a few percent of the isle.
    expect(quay / land.length).toBeGreaterThan(0.01);
    expect(quay / land.length).toBeLessThan(0.05);
    let cliffs = 0;
    for (let j = 1; j < isle.rows - 1; j++)
      for (let i = 4; i < isle.cols - 4; i++) {
        const h = isle.heights[j * isle.cols + i]!;
        // A cliff: from the water to over 10 high within 8 px.
        if (h > 10 && [4, -4].some((u) => i + u >= 0 && i + u < isle.cols && isle.heights[j * isle.cols + i + u]! >= 0 && isle.heights[j * isle.cols + i + u]! < 1)) cliffs++;
      }
    expect(cliffs).toBeGreaterThan(20);
  });
  it('a natural shore, not the drawn border: rock past the line in places, water inside it in others', () => {
    let out = 0, cove = 0;
    for (let j = 0; j < isle.rows; j++)
      for (let i = 0; i < isle.cols; i++) {
        const x = isle.x0 + i * isle.step, y = isle.y0 + j * isle.step, h = isle.heights[j * isle.cols + i]!;
        if (h >= 0 && !inTidal(x, y)) out++;
        if (h < 0 && inTidal(x, y)) cove++;
      }
    expect(out).toBeGreaterThan(500);
    expect(cove).toBeGreaterThan(500);
    // No filler land in the channel, and the rock keeps at least 50 px off every other district.
    const others = city.map.districts.filter((d) => d.id !== 'tidal' && d.border && d.border.length >= 3).map((d) => d.border!.map((p) => [(p.x / 100) * MAP_W, (p.y / 100) * MAP_H] as [number, number]));
    const seg = (x: number, y: number, a: number[], b: number[]) => {
      const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, u = Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a[0]! - u * dx, y - a[1]! - u * dy);
    };
    let near = Infinity;
    for (let j = 0; j < isle.rows; j += 3)
      for (let i = 0; i < isle.cols; i += 3)
        if (isle.heights[j * isle.cols + i]! >= 0) for (const o of others) for (let k = 0; k < o.length; k++) near = Math.min(near, seg(isle.x0 + i * isle.step, isle.y0 + j * isle.step, o[k]!, o[(k + 1) % o.length]!));
    expect(near).toBeGreaterThan(50);
    const f = g.landFill!;
    const fillNear = f.runs.some(([row, c0, c1]) => {
      for (let c = c0; c <= c1; c++) { const x = (c + 0.5) * f.step, y = (row + 0.5) * f.step; if (x > isle.x0 && x < isle.x0 + isle.cols * isle.step && y > isle.y0 && y < isle.y0 + isle.rows * isle.step) return true; }
      return false;
    });
    expect(fillNear).toBe(false);
    // A channel of water kept between it and every other district.
    for (const o of city.map.districts.filter((d) => d.id !== 'tidal' && d.border && d.border.length >= 3))
      for (let j = 0; j < isle.rows; j += 2)
        for (let i = 0; i < isle.cols; i += 2) {
          const x = isle.x0 + i * isle.step, y = isle.y0 + j * isle.step;
          if (isle.heights[j * isle.cols + i]! >= 0) expect(insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], o.border!), `${o.id} ${x},${y}`).toBe(false);
        }
    // No flat slab shaped like the drawn border under it.
    const bx = (tidal.border![0]!.x / 100) * MAP_W, by = (tidal.border![0]!.y / 100) * MAP_H;
    expect(g.land.some((poly) => poly.some(([x, y]) => Math.abs(x - bx) < 0.5 && Math.abs(y - by) < 0.5))).toBe(false);
  });
  it('natural slopes, not flat tiers: heights spread across the range', () => {
    expect(new Set(land.map((h) => Math.round(h / 2))).size).toBeGreaterThan(18);
  });
  it('buildings stand one by one on pads cut into the slope, held up by retaining walls', () => {
    const blocks = g.buildings.filter((b) => b.district === 'tidal' && b.kind === 'building' && b.tint !== '#9fb4d8');
    expect(blocks.length).toBeGreaterThan(30);
    for (const b of blocks) {
      expect(inTidal(b.x, b.y)).toBe(true);
      // The pad is flat under it: the ground at its centre is its floor.
      expect(Math.abs(at(b.x, b.y) - b.z0)).toBeLessThan(0.6);
    }
    expect(new Set(blocks.map((b) => b.a.toFixed(2))).size).toBeGreaterThan(10);
    const walls = g.strips.filter((s) => s.material === 'concrete' && s.z0 > 0 && s.h >= 2.5 && inTidal(s.x, s.y));
    expect(walls.length).toBeGreaterThan(15);
  });
  it('switchback roads wind up from the apron to the ridge, lamps along them', () => {
    const road = g.strips.filter((s) => s.material === 'street' && s.ends && inTidal(s.x, s.y));
    expect(road.length).toBeGreaterThan(60);
    const zs = road.flatMap((s) => [s.ends![0][2], s.ends![1][2]]);
    expect(Math.min(...zs)).toBeLessThan(cfg.quay + 3);
    expect(Math.max(...zs)).toBeGreaterThan(cfg.ridge.low);
    expect(g.props.filter((p) => p.kind === 'lamp' && road.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 6)).length).toBeGreaterThan(30);
  });
  it('trees on the slopes', () => {
    expect(g.props.filter((p) => p.kind === 'pine' && inTidal(p.x, p.y)).length).toBeGreaterThan(300);
  });
  it('the QDF, a dark walled compound on the high end, watchtowers at its corners', () => {
    const q = g.buildings.find((b) => b.district === 'tidal' && b.tint === '#9fb4d8' && b.w >= cfg.qdf.w - 0.01)!;
    expect(q.lit).toBeLessThan(0.15);
    expect(q.z0).toBeGreaterThan(cfg.ridge.high - 14);
    expect(g.buildings.filter((b) => b.district === 'tidal' && b.kind === 'tower').length).toBe(4);
  });
  it('the Ferry Stairs climb from a landing at the water', () => {
    const [ppx, ppy] = px(city.map.places.find((p) => p.id === cfg.stairs.near)!.pin);
    const flights = g.strips.filter((s) => s.material === 'stair' && s.ends && Math.hypot(s.x - ppx, s.y - ppy) < 150);
    expect(flights.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...flights.map((s) => Math.min(s.ends![0][2], s.ends![1][2])))).toBeLessThan(2);
  });
  it('no harbour: a customs house and prison, not a port', () => {
    // Off the isle's own shore (Drownworks' bay piers across the water are theirs).
    const near = (x: number, y: number) => [0, 1, 2, 3, 4, 5, 6, 7].some((k) => inTidal(x + Math.cos(k * 0.785) * 40, y + Math.sin(k * 0.785) * 40));
    const piers = g.strips.filter((s) => s.material === 'concrete' && s.z0 < 0 && s.w >= 30 && !inTidal(s.x, s.y) && near(s.x, s.y));
    expect(piers.length).toBe(0);
    expect(g.props.filter((p) => p.kind === 'lamp' && p.color === '#ff3030').length).toBe(0);
  });
  it('deep zoom over the isle', () => {
    expect(city.styles['tidal']!.deepZoom).toBe(true);
  });
});
