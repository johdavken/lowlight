// Reads what the rendered map is built from (spec 2026-10-25 §2): the gameplay map and the city's 3D description.
import fs from 'node:fs';
import path from 'node:path';
import { parseCityFile, type CityFileKind, type DistrictStyle, type Landmark, type RenderSettings, type RibbonStructure, type SpineStructure, type Terrain } from '../../shared/city-schema';
import { parseMap, type CityMapData } from '../../shared/map-schema';

export interface CityData {
  map: CityMapData;
  /** Every district on the map, with its own style or the defaults. */
  styles: Record<string, DistrictStyle>;
  structures: RibbonStructure[];
  /** Raised highways people live in (the Spine). */
  spines: SpineStructure[];
  landmarks: Landmark[];
  terrain: Terrain | null;
  render: RenderSettings;
  /** Every map/city file's text (the render's data hash covers them). */
  files: { name: string; text: string }[];
}

function walk(dir: string, pre = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${pre}${e.name}/`) : e.name.endsWith('.json') ? [`${pre}${e.name}`] : []));
}

const kindOf = (rel: string): CityFileKind | null =>
  rel.startsWith('districts/') ? 'district' : rel.startsWith('structures/') ? 'structure' : (['landmarks.json', 'terrain.json', 'render.json'].includes(rel) ? (rel.slice(0, -5) as CityFileKind) : null);

/** Throws an Error naming each bad file (`file: path: message`). */
export function loadCity(root: string): CityData {
  const mapFile = path.join(root, 'map', 'lowlight.json');
  const parsed = parseMap(JSON.parse(fs.readFileSync(mapFile, 'utf8')));
  if (!parsed.ok) throw new Error(`map/lowlight.json: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  const dir = path.join(root, 'map', 'city');
  const files: { name: string; text: string }[] = [];
  const values = new Map<string, unknown>();
  const problems: string[] = [];
  for (const rel of walk(dir)) {
    const text = fs.readFileSync(path.join(dir, rel), 'utf8');
    files.push({ name: rel, text });
    const kind = kindOf(rel);
    if (!kind) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      problems.push(`map/city/${rel}: ${(e as Error).message}`);
      continue;
    }
    const r = parseCityFile(kind, raw);
    if (r.ok) values.set(rel, r.value);
    else problems.push(...r.errors.map((e) => `map/city/${rel}: ${e.path || 'file'}: ${e.message}`));
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const def = values.get('districts/_default.json') as DistrictStyle | undefined;
  if (!def) throw new Error('map/city/districts/_default.json is missing');
  const render = values.get('render.json') as RenderSettings | undefined;
  if (!render) throw new Error('map/city/render.json is missing');
  const styles: Record<string, DistrictStyle> = {};
  for (const d of parsed.map.districts) styles[d.id] = (values.get(`districts/${d.id}.json`) as DistrictStyle | undefined) ?? def;
  return {
    map: parsed.map,
    styles,
    structures: [...values.entries()].filter(([k, v]) => k.startsWith('structures/') && (v as { kind: string }).kind === 'canyon').map(([, v]) => v as RibbonStructure),
    spines: [...values.entries()].filter(([k, v]) => k.startsWith('structures/') && (v as { kind: string }).kind === 'spine').map(([, v]) => v as SpineStructure),
    landmarks: (values.get('landmarks.json') as Landmark[] | undefined) ?? [],
    terrain: (values.get('terrain.json') as Terrain | undefined) ?? null,
    render,
    files,
  };
}
