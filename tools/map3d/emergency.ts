// What survives a blackout (spec 2026-10-28, phase 2 §2), from each district style's `blackout` block: a share of its
// buildings on generators, a steady red light on the roofs of the tallest, and fires lit in the dark: half in empty
// lots (on the rubble), the rest on low roofs. Everything here draws from its own `blackout:<district>:…` streams, so
// it moves nothing that was placed before it. Emergency lights keep their reach inside the border, so their pools stop
// short of a lit neighbour instead of at its line.
import type { DistrictStyle } from '../../shared/city-schema';
import { BACKUP, type Box, type Geometry } from './geometry';
import { inside, toBorder } from '../../shared/district-lookup';
import { rng } from './rng';

/** Their own power: never blacked out, so nothing survives in them either. */
const OWN_GRID = new Set(['spine', 'ribbon']);
const BACKED = new Set<Box['kind']>(['building', 'tower', 'tier']);
const ROOF_LIGHT = { color: '#ff3b3b', power: 3000, radius: 0.5, reach: 20 };
const FIRE = { color: '#ff7a2a', power: 25000, radius: 1, reach: 40 };

/** Picks up to `n` of `items` in a seeded order (a partial Fisher–Yates). */
function pickSome<T>(items: T[], n: number, r: () => number): T[] {
  const a = items.slice();
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(r() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

/** Boxes by 32 px cell, to ask which boxes stand over a point. */
function boxGrid(boxes: Box[]): (x: number, y: number) => Box[] {
  const C = 32, cells = new Map<string, Box[]>();
  for (const b of boxes) {
    const r = Math.hypot(b.w, b.d) / 2;
    for (let i = Math.floor((b.x - r) / C); i <= Math.floor((b.x + r) / C); i++)
      for (let j = Math.floor((b.y - r) / C); j <= Math.floor((b.y + r) / C); j++) (cells.get(`${i},${j}`) ?? cells.set(`${i},${j}`, []).get(`${i},${j}`)!).push(b);
  }
  return (x, y) => cells.get(`${Math.floor(x / C)},${Math.floor(y / C)}`) ?? [];
}

/** Whether a box's footprint covers (x, y). */
function covers(b: Box, x: number, y: number): boolean {
  const dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
  return Math.abs(dx * c + dy * s) < b.w / 2 && Math.abs(-dx * s + dy * c) < b.d / 2;
}

export function placeEmergency(g: Geometry, styles: Record<string, DistrictStyle>): void {
  const near = boxGrid(g.buildings);
  // Something standing at (x, y, z) would be inside a box: a lamp under a tier, a fire in a building.
  const buried = (x: number, y: number, z: number) => near(x, y).some((b) => covers(b, x, y) && z >= b.z0 - 0.01 && z < b.z0 + b.h - 0.01);
  // The top of whatever stands on (x, y): a tower's crown, above its base and tiers.
  const stackTop = (x: number, y: number) => Math.max(0, ...near(x, y).filter((b) => covers(b, x, y)).map((b) => b.z0 + b.h));
  for (const d of g.districts) {
    const bo = styles[d.id]?.blackout;
    if (!bo || OWN_GRID.has(d.id)) continue;
    const id = d.id;
    const bordered = d.border.length >= 3;
    const fits = (x: number, y: number, reach: number) => !bordered || (inside([x, y], d.border) && toBorder([x, y], d.border) >= reach);

    // Generators.
    const free = g.buildings.filter((b) => b.district === id && BACKED.has(b.kind) && b.backup === undefined);
    for (const b of pickSome(free, Math.round(bo.backup * free.length), rng(`blackout:${id}:backup`))) b.backup = BACKUP;

    // Roof lights on the tallest, one per tower, on the top of its stacked tiers (not under them).
    const top = (b: Box) => b.z0 + b.h;
    const tall = g.buildings
      .map((b, i) => ({ b, i, z: stackTop(b.x, b.y) }))
      .filter(({ b }) => b.district === id && (b.kind === 'building' || b.kind === 'tower'))
      .sort((p, q) => q.z - p.z || p.i - q.i);
    const lit: Box[] = [];
    for (const { b, z } of tall) {
      if (lit.length >= bo.roofLights) break;
      if (!fits(b.x, b.y, ROOF_LIGHT.reach) || lit.some((o) => Math.hypot(o.x - b.x, o.y - b.y) < 0.5) || buried(b.x, b.y, z)) continue;
      lit.push(b);
      g.props.push({ kind: 'lamp', x: b.x, y: b.y, z0: z, w: 0.7, d: 0.7, h: 0.7, a: 0, color: ROOF_LIGHT.color, supply: 'emergency', district: id });
      g.lights.push({ ...ROOF_LIGHT, x: b.x, y: b.y, z: z + 1.5, supply: 'emergency' });
    }

    // Fires: half on the rubble of empty lots, the rest on low roofs.
    const r = rng(`blackout:${id}:fires`);
    const rubble = g.props.filter((p) => p.kind === 'rubble' && p.district === id && fits(p.x, p.y, FIRE.reach) && !buried(p.x, p.y, p.z0));
    const ground = pickSome(rubble, Math.ceil(bo.fires / 2), r).map((p) => ({ x: p.x, y: p.y, z0: p.z0 }));
    const roofs = g.buildings.filter((b) => b.district === id && (b.kind === 'building' || b.kind === 'shack') && b.h < 20 && fits(b.x, b.y, FIRE.reach) && !buried(b.x, b.y, top(b)));
    const high = pickSome(roofs, bo.fires - ground.length, r).map((b) => ({ x: b.x, y: b.y, z0: top(b) }));
    for (const f of [...ground, ...high]) {
      g.props.push({ kind: 'barrel', x: f.x, y: f.y, z0: f.z0, w: 1, d: 1, h: 1.2, a: 0, color: FIRE.color, supply: 'emergency', district: id });
      g.lights.push({ ...FIRE, x: f.x, y: f.y, z: f.z0 + 3, supply: 'emergency' });
    }
  }
}

/** The mask holds 31 districts, and every item must name one of them (or none): stop before a render goes wrong. */
export function checkDistricts(g: Geometry): void {
  if (g.districts.length > 31) throw new Error('more than 31 districts');
  const ids = new Set(['', ...g.districts.map((d) => d.id)]);
  for (const list of [g.buildings, g.props, g.strips, g.curves] as { district?: string }[][])
    for (const it of list) if (!ids.has(it.district ?? '')) throw new Error(`unknown district ${it.district}`);
}
