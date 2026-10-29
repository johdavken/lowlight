import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCityFile, type CityFileKind } from './city-schema';

const kindOf = (rel: string): CityFileKind =>
  rel.startsWith('districts/') ? 'district' : rel.startsWith('structures/') ? 'structure' : (rel.replace('.json', '') as CityFileKind);
function cityFiles(dir = 'map/city', pre = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? cityFiles(path.join(dir, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`]));
}

describe('city schema', () => {
  it('every file in map/city parses', () => {
    const files = cityFiles();
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const rel of files) {
      const r = parseCityFile(kindOf(rel), JSON.parse(fs.readFileSync(path.join('map/city', rel), 'utf8')));
      expect(r.ok, `${rel}: ${JSON.stringify(!r.ok && r.errors)}`).toBe(true);
    }
  });
  it('a share above 1 fails at its path', () => {
    const raw = JSON.parse(fs.readFileSync('map/city/districts/karasu.json', 'utf8'));
    const r = parseCityFile('district', { ...raw, brick: 1.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.path)).toContain('brick');
  });
  it('an unknown landmark kind fails at kind', () => {
    const r = parseCityFile('landmarks', [{ kind: 'statue', at: [10, 10] }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.path.endsWith('kind'))).toBe(true);
  });
});
