import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const nexus = city.map.districts.find((d) => d.id === 'nexus')!;
const cfg = city.styles['nexus']!.core!;
const inNexus = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], nexus.border!);
const g = generate(city).geometry;
const place = city.map.places.find((p) => p.id === cfg.tower.near)!;
const [tx, ty] = [(place.pin[0] / 100) * MAP_W, (place.pin[1] / 100) * MAP_H];
const towers = g.buildings.filter((b) => b.district === 'nexus' && b.kind === 'building');
const top = (b: { z0: number; h: number }) => b.z0 + b.h;
// A base block's whole height, its setbacks included.
const tallest = (b: (typeof towers)[number]) => Math.max(...towers.filter((o) => Math.hypot(o.x - b.x, o.y - b.y) < 0.5).map(top));
const ring = nexus.border!.map((p) => [(p.x / 100) * MAP_W, (p.y / 100) * MAP_H] as [number, number]);
/** From a point to a neighbouring district's border (map px). */
const toDistrict = (id: string) => {
  const rr = city.map.districts.find((d) => d.id === id)!.border!.map((p) => [(p.x / 100) * MAP_W, (p.y / 100) * MAP_H] as [number, number]);
  return (x: number, y: number) => Math.min(...rr.map((a, i) => {
    const c = rr[(i + 1) % rr.length]!, dx = c[0] - a[0], dy = c[1] - a[1];
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
  }));
};
/** Within some blend's reach. */
const inBlend = (x: number, y: number) => cfg.blend.some((e) => toDistrict(e.with)(x, y) < e.reach);
/** From a point to the district's border (map px). */
const edge = (x: number, y: number) => Math.min(...ring.map((a, i) => {
  const c = ring[(i + 1) % ring.length]!, dx = c[0] - a[0], dy = c[1] - a[1];
  const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
}));

describe('Nexus, the Central Core (the painting for reference)', () => {
  it('the Sentinel Tower stands at its place, the tallest thing in the district', () => {
    const sentinel = towers.filter((b) => Math.hypot(b.x - tx, b.y - ty) < 2);
    expect(sentinel.some((b) => b.w >= cfg.tower.w - 0.01 && b.z0 === 0)).toBe(true);
    expect(Math.max(...sentinel.map(top))).toBeGreaterThanOrEqual(cfg.tower.h - 0.01);
    const tallest = Math.max(...towers.map(top));
    expect(Math.max(...towers.filter((b) => Math.hypot(b.x - tx, b.y - ty) < cfg.tower.w).map(top))).toBe(tallest);
    // Its pin is up on the tower, not on the street behind it.
    expect(g.pinHeights[cfg.tower.near!]).toBeGreaterThan(cfg.tower.h * 0.4);
  });
  it('towers rise toward the middle of the district: low along every side, tallest deep inside', () => {
    const inner = towers.filter((b) => b.z0 === 0 && edge(b.x, b.y) > cfg.falloff * 0.8 && Math.hypot(b.x - tx, b.y - ty) > cfg.tower.w);
    const sides = towers.filter((b) => b.z0 === 0 && edge(b.x, b.y) < cfg.falloff * 0.3);
    const mean = (bs: typeof towers) => bs.reduce((s, b) => s + tallest(b), 0) / bs.length;
    expect(inner.length).toBeGreaterThan(10);
    expect(sides.length).toBeGreaterThan(20);
    expect(mean(inner)).toBeGreaterThan(mean(sides) * 2.5);
    // The tallest dozen (the Sentinel aside) stand well in from the border.
    const top12 = towers.filter((b) => b.z0 === 0 && Math.hypot(b.x - tx, b.y - ty) > cfg.tower.w).sort((p, q) => tallest(q) - tallest(p)).slice(0, 12);
    for (const b of top12) expect(edge(b.x, b.y)).toBeGreaterThan(cfg.falloff * 0.5);
  });
  it('no dead side: the west of the district is built up as densely as the east', () => {
    const xs = nexus.border!.map((p) => (p.x / 100) * MAP_W);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), third = (x1 - x0) / 3;
    const west = towers.filter((b) => b.z0 === 0 && b.x < x0 + third).length;
    const east = towers.filter((b) => b.z0 === 0 && b.x > x1 - third).length;
    expect(west).toBeGreaterThan(east * 0.7);
    // And not all low: its middle rises too.
    expect(Math.max(...towers.filter((b) => b.x < x0 + third).map(tallest))).toBeGreaterThan(cfg.peak * 0.45);
  });
  it('not a regular grid: towers sit off their plot centres, some plots hold two, a few turned', () => {
    const bases = towers.filter((b) => b.z0 === 0);
    // Pairs standing close together (twins, L-shapes).
    const paired = bases.filter((b) => bases.some((o) => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < Math.max(b.w, b.d) * 0.95));
    expect(paired.length).toBeGreaterThan(20);
    const angles = new Set(bases.map((b) => b.a.toFixed(2)));
    expect(angles.size).toBeGreaterThan(5);
  });
  it('a skyline, not a wall: tower heights spread wide, some stepped back at the crown', () => {
    expect(new Set(towers.map((b) => Math.round(top(b) / 8))).size).toBeGreaterThan(12);
    // A setback: a narrower block standing on a wider one's roof.
    const stepped = towers.filter((b) => b.z0 > 4 && towers.some((o) => o !== b && Math.abs(top(o) - b.z0) < 0.01 && o.w > b.w && Math.hypot(o.x - b.x, o.y - b.y) < 1));
    expect(stepped.length).toBeGreaterThan(15);
  });
  it('every tower inside the border, none on the Spine', () => {
    for (const b of towers) expect(inNexus(b.x, b.y)).toBe(true);
  });
  it('light strips up the towers and neon at their crowns, dim enough to keep their bloom', () => {
    const neon = g.curves.filter((c) => c.material === 'neon' && c.points.every(([x, y]) => inNexus(x, y)));
    const vertical = neon.filter((c) => c.points.length === 2 && Math.abs(c.points[1]![2] - c.points[0]![2]) > 20);
    expect(vertical.length).toBeGreaterThan(20);
    expect(neon.length).toBeGreaterThan(vertical.length + 4);
    for (const c of neon) expect(c.strength ?? 38).toBeLessThanOrEqual(20);
  });
  it('spires on some towers', () => {
    expect(g.props.filter((p) => p.kind === 'mast' && inNexus(p.x, p.y) && p.h >= 10).length).toBeGreaterThan(8);
  });
  it("the Sentinel's emblem: a triangle in its colour high on the face toward the camera", () => {
    const tri = g.curves.find((c) => c.color === cfg.tower.emblem && c.points.length === 4 && Math.hypot(c.points[0]![0] - tx, c.points[0]![1] - ty) < cfg.tower.w);
    expect(tri).toBeTruthy();
    expect(Math.min(...tri!.points.map((q) => q[2]))).toBeGreaterThan(cfg.tower.h * 0.5);
    // On the south face (map +y), which the camera sees.
    expect(Math.min(...tri!.points.map((q) => q[1]))).toBeGreaterThan(ty + cfg.tower.d / 2 - 0.01);
  });
  it('a round plaza at its foot, drawn flattened as the view sees a circle on the ground, lit rings and a blue spire, nothing built on it', () => {
    const k = cfg.plaza.squash;
    const [px, py] = [tx, ty + cfg.tower.d / 2 + cfg.plaza.radius * k + cfg.plaza.gap];
    // Elliptical distance: 1 on the plaza's rim.
    const e = (x: number, y: number) => Math.hypot((x - px) / cfg.plaza.radius, (y - py) / (cfg.plaza.radius * k));
    const rings = g.curves.filter((c) => c.points.length > 16 && Math.abs(c.points[0]![2]) < 2 && c.points.every(([x, y]) => e(x, y) <= 1.02));
    expect(rings.length).toBeGreaterThanOrEqual(2);
    // Flattened: wider than it is deep.
    const outer = rings.reduce((a, b) => (Math.max(...a.points.map((q) => q[0])) > Math.max(...b.points.map((q) => q[0])) ? a : b));
    const span = (i: 0 | 1) => Math.max(...outer.points.map((q) => q[i])) - Math.min(...outer.points.map((q) => q[i]));
    expect(span(1) / span(0)).toBeCloseTo(k, 1);
    expect(g.props.some((p) => p.kind === 'sign' && p.color === cfg.plaza.spire && Math.hypot(p.x - px, p.y - py) < 2 && p.h > 15)).toBe(true);
    for (const b of towers) expect(e(b.x, b.y), `${b.x},${b.y}`).toBeGreaterThan(1);
    // Nothing tall in front of it (map +y, toward the camera) to hide it.
    const front = towers.filter((b) => Math.abs(b.x - px) < cfg.plaza.radius && b.y > py && b.y - py < 160);
    for (const b of front) expect(top(b)).toBeLessThanOrEqual(20);
  });
  it('glass towers: every tower in the core is curtain-walled glass, but for the blends into neighbours', () => {
    // Only the blends into neighbours are anything but glass.
    expect(towers.filter((b) => !b.glass).every((b) => inBlend(b.x, b.y))).toBe(true);
    expect(towers.filter((b) => b.glass === 1).length / towers.length).toBeGreaterThan(0.75);
  });
  it('crown neon on only a few towers', () => {
    const crowns = g.curves.filter((c) => c.material === 'neon' && c.points.length === 5 && c.points.every(([x, y]) => inNexus(x, y)));
    expect(crowns.length).toBeLessThan(towers.filter((b) => b.z0 === 0).length * 0.15);
  });
  it("nothing tall in front of the second tower's diamond", () => {
    const [sx, sy] = [tx + cfg.second.offset[0], ty + cfg.second.offset[1]];
    const front = towers.filter((b) => Math.abs(b.x - sx) < cfg.second.w && b.y > sy + cfg.second.d / 2 && b.y - sy < 140);
    for (const b of front) expect(top(b)).toBeLessThanOrEqual(45);
  });
  it('avenues between the plots, lamps along them', () => {
    const streets = g.strips.filter((s) => s.material === 'street' && inNexus(s.x, s.y));
    expect(streets.length).toBeGreaterThan(40);
    expect(g.props.filter((p) => p.kind === 'lamp' && inNexus(p.x, p.y)).length).toBeGreaterThan(20);
  });
  it('streets lit like Velvet\'s: a streetlight every 16 px or so of avenue, lit lobbies at the towers\' feet', () => {
    const streets = g.strips.filter((s) => s.material === 'street' && inNexus(s.x, s.y));
    const length = streets.reduce((sum, s) => sum + s.w, 0);
    const lamps = g.props.filter((p) => p.kind === 'lamp' && p.z0 < 6 && inNexus(p.x, p.y)).length;
    expect(lamps).toBeGreaterThan(length / 18);
    const bases = towers.filter((b) => b.z0 === 0);
    const lobbies = g.props.filter((p) => p.kind === 'shopfront' && p.z0 < 2 && inNexus(p.x, p.y)).length;
    expect(lobbies).toBeGreaterThan(bases.length * 0.5);
  });
  it('colour by quarter, not by height: warm-lit towers among the glass in the middle too, the tallest leaning violet', () => {
    const bases = towers.filter((b) => b.z0 === 0 && Math.hypot(b.x - tx, b.y - ty) > cfg.tower.w);
    const inner = bases.filter((b) => edge(b.x, b.y) > cfg.falloff * 0.5);
    const warmColors = new Set(cfg.quarters.filter((q) => q.warm).flatMap((q) => q.colors));
    // Amber glass (the warm windowed blocks near Helios are the blend, not a quarter).
    const warm = inner.filter((b) => warmColors.has(b.tint) && b.glass === 1);
    expect(warm.length / inner.length).toBeGreaterThan(0.15);
    expect(warm.length / inner.length).toBeLessThan(0.5);
    // Warm towers cluster: most have a warm neighbour close by.
    const clustered = warm.filter((b) => warm.some((o) => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < cfg.falloff * 0.35));
    expect(clustered.length / warm.length).toBeGreaterThan(0.8);
    const violet = new Set(cfg.quarters.find((q) => q.name === 'violet')!.colors);
    const top20 = bases.sort((p, q) => tallest(q) - tallest(p)).slice(0, 20);
    expect(top20.filter((b) => violet.has(b.tint)).length).toBeGreaterThanOrEqual(8);
  });
  it('no comb: a boulevard cuts across the grid to the plaza, and the avenues are unevenly spaced', () => {
    const streets = g.strips.filter((s) => s.material === 'street' && inNexus(s.x, s.y));
    const a = ((city.styles['nexus']!.angleDeg ?? 0) * Math.PI) / 180;
    const off = (ang: number) => Math.min(...[0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI].map((k) => Math.abs(((ang - a - k + Math.PI * 3) % (Math.PI * 2)) - Math.PI)));
    const diagonal = streets.filter((s) => off(s.a) > 0.3);
    expect(diagonal.length).toBeGreaterThan(15);
    // Nothing built on the boulevard.
    for (const s2 of diagonal) for (const b of towers) expect(Math.hypot(b.x - s2.x, b.y - s2.y), `${b.x},${b.y}`).toBeGreaterThan(cfg.boulevard.width / 2 + 2);
    // Its kerbs carry a continuous line of light, so it reads through the gaps between towers.
    const kerbs = g.strips.filter((s2) => s2.material === 'street-light' && inNexus(s2.x, s2.y) && off(s2.a) > 0.3);
    expect(kerbs.length).toBeGreaterThanOrEqual(diagonal.length * 1.5);
    // It reads as a valley through the skyline: what stands just south of it (toward the camera) is low.
    const bl = cfg.boulevard, ba = (bl.angleDeg * Math.PI) / 180, pyz = ty + cfg.tower.d / 2 + cfg.plaza.radius * cfg.plaza.squash + cfg.plaza.gap;
    const south = towers.filter((b) => {
      const d = (b.x - tx) * Math.sin(ba) - (b.y - pyz) * Math.cos(ba);
      return d < 0 && -d < 40 && Math.hypot(b.x - tx, b.y - pyz) < 600;
    });
    expect(south.length).toBeGreaterThan(5);
    for (const b of south) expect(tallest(b), `${b.x},${b.y}`).toBeLessThanOrEqual(55);
    // Column avenues: the gaps between them vary.
    const cols = streets.filter((s) => off(s.a - Math.PI / 2) < 0.05 && Math.abs(s.a - a - Math.PI / 2) < 0.05);
    const us = [...new Set(cols.map((s) => Math.round((s.x - tx) * Math.cos(a) + (s.y - ty) * Math.sin(a))))].sort((p, q) => p - q);
    const gaps = new Set(us.slice(1).map((u, i) => Math.round((u - us[i]!) / city.styles['nexus']!.lot[0])));
    expect(gaps.size).toBeGreaterThan(1);
  });
  it('some broad, heavy towers among the slim ones', () => {
    const broad = towers.filter((b) => b.z0 === 0 && b.w > city.styles['nexus']!.lot[0] * 1.3 && tallest(b) > 80);
    expect(broad.length).toBeGreaterThanOrEqual(4);
  });
  it('light pools few, high and soft: no bright blobs at street level', () => {
    const strong = g.lights.filter((l) => inNexus(l.x, l.y) && l.power >= 200000 && l.color !== cfg.tower.emblem);
    expect(strong.length).toBeLessThanOrEqual(6);
    for (const l of strong) expect(l.z).toBeGreaterThanOrEqual(70);
  });
  it('the west edge blends into Helios Towers: its warm windowed blocks near the line, fading into the glass', () => {
    const b0 = cfg.blend[0]!;
    const hel = city.map.districts.find((d) => d.id === b0.with)!;
    const hs = city.styles[b0.with]!;
    const hr = hel.border!.map((p) => [(p.x / 100) * MAP_W, (p.y / 100) * MAP_H] as [number, number]);
    const toHel = (x: number, y: number) => Math.min(...hr.map((a, i) => {
      const c = hr[(i + 1) % hr.length]!, dx = c[0] - a[0], dy = c[1] - a[1];
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
    }));
    const bases = towers.filter((b) => b.z0 === 0);
    const like = (b: (typeof towers)[number]) => !b.glass && hs.windowColors.includes(b.tint);
    const close = bases.filter((b) => toHel(b.x, b.y) < b0.reach * 0.3);
    const mid = bases.filter((b) => toHel(b.x, b.y) > b0.reach * 0.45 && toHel(b.x, b.y) < b0.reach * 0.8);
    const far = bases.filter((b) => toHel(b.x, b.y) > b0.reach * 1.1);
    expect(close.length).toBeGreaterThan(8);
    expect(close.filter(like).length / close.length).toBeGreaterThan(0.6);
    expect(mid.filter(like).length / mid.length).toBeGreaterThan(0.1);
    expect(mid.filter(like).length / mid.length).toBeLessThan(close.filter(like).length / close.length);
    expect(far.filter((b) => !b.glass && !inBlend(b.x, b.y)).length).toBe(0);
    // Close to the line they stand at Helios's heights.
    for (const b of close.filter(like)) expect(tallest(b)).toBeLessThanOrEqual(hs.height[1] * 1.6);
  });
  it('the east edge blends into Velvet: its pink-lit row-house blocks near the line, violet glass between, its lanterns strung over the avenues', () => {
    const b0 = cfg.blend.find((e) => e.with === 'velvet')!;
    expect(b0).toBeTruthy();
    const vel = city.map.districts.find((d) => d.id === 'velvet')!;
    const vs = city.styles['velvet']!;
    const vr = vel.border!.map((p) => [(p.x / 100) * MAP_W, (p.y / 100) * MAP_H] as [number, number]);
    const toVel = (x: number, y: number) => Math.min(...vr.map((a, i) => {
      const c = vr[(i + 1) % vr.length]!, dx = c[0] - a[0], dy = c[1] - a[1];
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
    }));
    const bases = towers.filter((b) => b.z0 === 0);
    const walls = new Set([...vs.windowColors, ...(vs.streets!.wallColors ?? [])]);
    const like = (b: (typeof towers)[number]) => !b.glass && walls.has(b.tint);
    const close = bases.filter((b) => toVel(b.x, b.y) < b0.reach * 0.3);
    const far = bases.filter((b) => toVel(b.x, b.y) > b0.reach * 1.1);
    expect(close.length).toBeGreaterThan(5);
    expect(close.filter(like).length / close.length).toBeGreaterThan(0.6);
    expect(far.filter((b) => !b.glass && !inBlend(b.x, b.y)).length).toBe(0);
    for (const b of close.filter(like)) expect(tallest(b)).toBeLessThanOrEqual(vs.height[1] * 1.6);
    // Lit like Velvet's row houses, with shopfronts at their doors.
    for (const b of close.filter(like)) expect(b.lit).toBeGreaterThanOrEqual(0.75);
    const fronts = g.props.filter((p) => p.kind === 'shopfront' && vs.signColors.includes(p.color!) && inNexus(p.x, p.y) && toVel(p.x, p.y) < b0.reach);
    expect(fronts.length).toBeGreaterThan(close.filter(like).length * 0.4);
    // The step between is violet glass.
    const step = new Set(cfg.quarters.find((q) => q.name === b0.step)!.colors);
    const mid = bases.filter((b) => b.glass === 1 && toVel(b.x, b.y) > b0.reach * 0.4 && toVel(b.x, b.y) < b0.reach);
    expect(mid.filter((b) => step.has(b.tint)).length / mid.length).toBeGreaterThan(0.5);
    // Velvet's lantern strings over the avenues near the line, none deep in the core.
    const lanterns = new Set(vs.streets!.lanternColors);
    const strings = g.curves.filter((c) => c.material === 'neon' && c.points.length === 6 && lanterns.has(c.color!) && c.points.every(([x, y]) => inNexus(x, y)));
    expect(strings.length).toBeGreaterThan(8);
    for (const c of strings) expect(toVel(c.points[0]![0], c.points[0]![1])).toBeLessThan(b0.reach);
  });
  it('deep zoom over the core', () => {
    expect(city.styles['nexus']!.deepZoom).toBe(true);
  });
});
