import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCity } from './load';

describe('loadCity', () => {
  it('reads the city: Karasu and Velvet deep, a district without a file on the defaults', () => {
    const c = loadCity('.');
    expect(c.styles.karasu!.deepZoom).toBe(true);
    expect(c.styles.velvet!.deepZoom).toBe(true);
    const def = JSON.parse(fs.readFileSync('map/city/districts/_default.json', 'utf8'));
    // Every district without a file of its own reads the defaults.
    for (const d of c.map.districts.filter((x) => !fs.existsSync(`map/city/districts/${x.id}.json`))) expect(c.styles[d.id]!.height).toEqual(def.height);
    expect(c.structures.map((s) => s.id)).toEqual(['ribbon']);
    expect(c.terrain?.plateau).toBe('mirage');
    expect(c.files.some((f) => f.name === 'structures/ribbon.json')).toBe(true);
  });
  it('a malformed file names itself', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'city-'));
    fs.cpSync('map', path.join(root, 'map'), { recursive: true, filter: (p) => !p.includes('history') });
    fs.writeFileSync(path.join(root, 'map/city/terrain.json'), '{"plateau": 3}');
    expect(() => loadCity(root)).toThrow(/terrain\.json/);
  });
});
