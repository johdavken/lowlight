// The generator's and render script's versions: hashes of their own source, so changing either re-renders the city and
// marks an older render out of date (spec 2026-10-25 §4). Shared by the CLI, Studio and the release stage.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cityDataHash } from '../../shared/city-hash';
import { loadCity, type CityData } from './load';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function renderVersions(root: string): { generator: string; render: string } {
  const dir = path.join(root, 'tools', 'map3d');
  const gen = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !['render.ts', 'versions.ts'].includes(f))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  const shared = ['map-projection.ts', 'city-schema.ts'].map((f) => fs.readFileSync(path.join(root, 'shared', f), 'utf8')).join('\n');
  return { generator: sha(gen + shared).slice(0, 16), render: sha(fs.readFileSync(path.join(dir, 'blender', 'render.py'), 'utf8')).slice(0, 16) };
}

/**
 * The code between the generated city and the tiles on disk (the projection, the tile grid, the crops). Tile
 * fingerprints salt with it and `render`, not with `generator`: a generator change re-renders only the tiles its output
 * touches (blackouts phase 2 §5).
 */
export function pixelVersion(root: string): string {
  const files = [path.join(root, 'tools', 'map3d', 'jobs.ts'), path.join(root, 'tools', 'map3d', 'tiles.ts'), path.join(root, 'shared', 'map-projection.ts'), path.join(root, 'shared', 'map-tiles.ts')];
  return sha(files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')).slice(0, 16);
}

/** The current data's hash, as a render's manifest records it. */
export function currentDataHash(root: string, city: CityData = loadCity(root)): string {
  const mapJson = JSON.parse(fs.readFileSync(path.join(root, 'map', 'lowlight.json'), 'utf8')) as unknown;
  return cityDataHash(mapJson, city.files, renderVersions(root), sha);
}
