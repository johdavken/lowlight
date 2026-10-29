import { describe, expect, it } from 'vitest';
import { tileRect } from '../../shared/map-tiles';
import { generate } from './generate';
import { loadCity } from './load';
import { fingerprints, tilesNeeded } from './tiles';

const city = loadCity('.');
const border = (id: string) => city.map.districts.find((d) => d.id === id)!.border!;
const bounds = (id: string) => {
  const b = border(id);
  return { x0: Math.min(...b.map((a) => a.x)), x1: Math.max(...b.map((a) => a.x)), y0: Math.min(...b.map((a) => a.y)), y1: Math.max(...b.map((a) => a.y)) };
};
const hits = (r: { x: number; y: number; w: number; h: number }, b: ReturnType<typeof bounds>, grow = 0) =>
  r.x < b.x1 + grow && r.x + r.w > b.x0 - grow && r.y < b.y1 + grow && r.y + r.h > b.y0 - grow;

describe('tiles', () => {
  const needed = tilesNeeded(city.render, [border('karasu')]);
  it('8x only near Karasu', () => {
    const eight = needed.find((n) => n.scale === 8)!;
    expect(eight.keys.length).toBeGreaterThan(0);
    expect(eight.keys).not.toContain('0_0');
    for (const k of eight.keys) {
      const [c, r] = k.split('_').map(Number);
      expect(hits(tileRect(8, c!, r!), bounds('karasu'), 3)).toBe(true);
    }
    expect(needed.find((n) => n.scale === 4)!.keys).toHaveLength(36 * 24);
  });
  it('moving a Velvet building changes no tile far from Velvet', () => {
    const g = generate(city).geometry;
    const before = fingerprints(g, city.render, needed, 'salt');
    const i = g.buildings.findIndex((b) => b.district === 'velvet');
    const changed = { ...g, buildings: g.buildings.map((b, k) => (k === i ? { ...b, h: b.h + 10 } : b)) };
    const after = fingerprints(changed, city.render, needed, 'salt');
    const diff = [...after.keys()].filter((k) => after.get(k) !== before.get(k));
    expect(diff.length).toBeGreaterThan(0);
    for (const k of diff) {
      const [s, key] = k.split('/');
      const [c, r] = key!.split('_').map(Number);
      expect(hits(tileRect(Number(s), c!, r!), bounds('velvet'), 6), k).toBe(true);
    }
    // Generating the whole city twice over takes a while with every district built out.
  }, 60_000);
});

describe('fingerprint bounds reach shadows and reflections', () => {
  it("a tall box's bounds reach its moon shadow and its reflection below", async () => {
    const { itemBounds } = await import('./tiles');
    const box = { x: 2000, y: 1500, w: 10, d: 10, h: 100, z0: 0 };
    const b = itemBounds(box, city.render);
    const plain = { x0: (1990 / 4608) * 100, x1: (2010 / 4608) * 100, y1: (1510 / 3072) * 100 };
    // The moon (66°, 0, −38°) throws shadows ~2.25·h long; the reflection drops z·cos(52°) below the base.
    expect(Math.max(plain.x0 - b.x0, b.x1 - plain.x1) * 46.08).toBeGreaterThan(100);
    expect((b.y1 - plain.y1) * 30.72).toBeGreaterThan(55);
  });
});

describe('8x along the Spine', () => {
  it('8x tiles follow the Spine\'s corridor, not its bounding box', async () => {
    const { generate } = await import('./generate');
    const areas = generate(city).deepAreas;
    expect(areas.length).toBe(1);
    const withSpine = tilesNeeded(city.render, [border('karasu')], areas).find((n) => n.scale === 8)!.keys;
    const karasuOnly = tilesNeeded(city.render, [border('karasu')]).find((n) => n.scale === 8)!.keys;
    expect(withSpine.length).toBeGreaterThan(karasuOnly.length + 100);
    // The corridor, not the box: far fewer than every tile in its bounds.
    const xs = areas[0]!.map((p) => p[0]), ys = areas[0]!.map((p) => p[1]);
    const boxTiles = ((Math.max(...xs) - Math.min(...xs)) / 100) * 72 * (((Math.max(...ys) - Math.min(...ys)) / 100) * 48);
    expect(withSpine.length - karasuOnly.length).toBeLessThan(boxTiles * 0.6);
    // Iron Reach's end of the Spine is deep; a tile far from it (the bay) isn't.
    expect(withSpine).toContain(`${Math.floor(0.12 * 72)}_${Math.floor(0.275 * 48)}`);
    expect(withSpine).not.toContain(`${Math.floor(0.45 * 72)}_${Math.floor(0.62 * 48)}`);
    // Generating the city takes a while under a full parallel run.
  }, 60_000);
});

// Blackouts phase 2 §5: fingerprints follow what the generator made, so the city-wide tables are hashed too.
describe('fingerprints cover the city-wide tables', () => {
  const g = generate(city).geometry;
  const needed = tilesNeeded(city.render, [border('karasu')]);
  const base = fingerprints(g, city.render, needed, 'salt');
  const changedKeys = (h: Map<string, string>) => [...h.keys()].filter((k) => h.get(k) !== base.get(k));

  it('every Geometry key is hashed or listed as not rendered', async () => {
    const { HASHED_KEYS, NOT_RENDERED_KEYS } = await import('./tiles');
    const known = new Set<string>([...HASHED_KEYS, ...NOT_RENDERED_KEYS]);
    for (const k of Object.keys(g)) expect(known.has(k), k).toBe(true);
  });
  it('a change to the district table changes every tile', () => {
    const districts = g.districts.map((d, i) => (i === 0 ? { ...d, border: d.border.map((p, j) => (j === 0 ? ([p[0] + 1, p[1]] as [number, number]) : p)) } : d));
    expect(changedKeys(fingerprints({ ...g, districts }, city.render, needed, 'salt')).length).toBe(base.size);
  });
  it('a mask floor change changes only the tiles near its band', () => {
    const f = g.maskFloor!;
    const i = f.runs.findIndex((r) => r[0] === 10);
    expect(i).toBeGreaterThanOrEqual(0);
    const runs = f.runs.map((r, k) => (k === i ? ([r[0], r[1], r[2] + 1, r[3]] as [number, number, number, number]) : r));
    const diff = changedKeys(fingerprints({ ...g, maskFloor: { ...f, runs } }, city.render, needed, 'salt'));
    expect(diff.length).toBeGreaterThan(0);
    for (const k of diff) {
      const [s, key] = k.split('/');
      const r = Number(key!.split('_')[1]);
      // Rows 0–255 of the map (one 32-row band at step 8), plus the tile margin.
      expect(tileRect(Number(s), 0, r).y, k).toBeLessThan(((256 + city.render.margin) / 3072) * 100 + 1);
    }
  });
  it('land district ids are hashed with their polygon', () => {
    const i = g.landDistricts.findIndex((id) => id !== g.landDistricts[0]);
    const landDistricts = g.landDistricts.map((id, k) => (k === i ? g.landDistricts[0]! : id));
    const diff = changedKeys(fingerprints({ ...g, landDistricts }, city.render, needed, 'salt'));
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.length).toBeLessThan(base.size);
  });
});

describe('the salt still covers the code that makes pixels (final review)', () => {
  it('render.ts salts with the pixel code, not the generator', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('tools/map3d/render.ts', 'utf8');
    expect(src).toMatch(/`\$\{v\.render\}:\$\{pixelVersion\(root\)\}:\$\{blenderVersion\}`/);
    const { pixelVersion } = await import('./versions');
    expect(pixelVersion('.')).toMatch(/^[0-9a-f]{16}$/);
  });
});
