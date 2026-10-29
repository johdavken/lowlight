import { describe, expect, it } from 'vitest';
import { parseManifest, tileGrid, tileRect } from './map-tiles';

describe('map tiles', () => {
  it('tile grids', () => {
    expect(tileGrid(1)).toEqual({ cols: 9, rows: 6 });
    expect(tileGrid(2)).toEqual({ cols: 18, rows: 12 });
    expect(tileGrid(4)).toEqual({ cols: 36, rows: 24 });
    expect(tileGrid(8)).toEqual({ cols: 72, rows: 48 });
  });
  it('tiles abut with no gap at every level', () => {
    for (const s of [1, 2, 4, 8]) {
      const { cols, rows } = tileGrid(s);
      for (let c = 0; c < cols - 1; c++) expect(tileRect(s, c, 0).x + tileRect(s, c, 0).w).toBeCloseTo(tileRect(s, c + 1, 0).x, 9);
      for (let r = 0; r < rows - 1; r++) expect(tileRect(s, 0, r).y + tileRect(s, 0, r).h).toBeCloseTo(tileRect(s, 0, r + 1).y, 9);
      const last = tileRect(s, cols - 1, rows - 1);
      expect(last.x + last.w).toBeCloseTo(100, 9);
      expect(last.y + last.h).toBeCloseTo(100, 9);
    }
  });
  it('parseManifest rejects a manifest missing levels', () => {
    const good = { version: 1, size: [4608, 3072], tile: 512, levels: [{ scale: 1, cols: 9, rows: 6, tiles: 'all' }], deep: ['karasu'], dataHash: 'x', blender: '5.2', pinHeights: { a: 1 }, rendered: '2026-10-25' };
    expect(parseManifest(good)).not.toBeNull();
    const { levels: _, ...bad } = good;
    expect(parseManifest(bad)).toBeNull();
    expect(parseManifest('nonsense')).toBeNull();
  });
});

describe('blackout fields in the manifest (spec 2026-10-27)', () => {
  const base = { version: 1, size: [4608, 3072], tile: 512, levels: [{ scale: 1, cols: 9, rows: 6, tiles: 'all' }], deep: [], dataHash: 'x', blender: '5.2', pinHeights: {}, rendered: 'now' };
  it('accepts a manifest with dark and mask, and one without', () => {
    expect(parseManifest({ ...base, dark: { levels: [1, 2, 4] }, mask: { districts: ['velvet', 'spine'] } })?.mask?.districts).toEqual(['velvet', 'spine']);
    expect(parseManifest(base)?.dark).toBeUndefined();
  });
  it('rejects mask districts that are not strings', () => {
    expect(parseManifest({ ...base, dark: { levels: [1] }, mask: { districts: [1, 2] } })).toBeNull();
  });
});
