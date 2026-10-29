import fs from 'node:fs';
import path from 'node:path';
import type { CityMapData } from '../../shared/map-schema';
import { mapIds, parseLoreFile, type LoreEntry } from '../../shared/lore';

/**
 * The lore book: each `.md` file directly in `dir` (not `categories/`, which holds Studio's
 * templates). A file that fails the schema, or names a district or place the map doesn't have,
 * warns once and is skipped; a missing folder is an empty book.
 */
export function loadLoreBook(dir: string, map: CityMapData | null, warn: (m: string) => void, exitPlaces: Iterable<string> = []): LoreEntry[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  // Rooms reached by an exit are places too (room exits spec §4).
  const onMap = mapIds(map);
  const ids = onMap ? { ...onMap, places: new Set([...onMap.places, ...exitPlaces]) } : null;
  const book: LoreEntry[] = [];
  for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue;
    const r = parseLoreFile(d.name.slice(0, -3), fs.readFileSync(path.join(dir, d.name), 'utf8'), ids);
    if (r.ok) book.push(r.entry);
    else warn(`lore ${d.name}: ${r.problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  }
  return book;
}
