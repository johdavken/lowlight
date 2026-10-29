/**
 * Blackout rates per district (blackouts phase 3 §1): each district style's `blackout.outage` in
 * map/city/districts/, read once at start. A district without one takes `_default`'s. No folder: no
 * scheduled blackouts.
 */
import fs from 'node:fs';
import path from 'node:path';

const outageOf = (file: string): number | undefined => {
  try {
    const v = (JSON.parse(fs.readFileSync(file, 'utf8')) as { blackout?: { outage?: unknown } }).blackout?.outage;
    return typeof v === 'number' && v >= 0 && v <= 1 ? v : undefined;
  } catch {
    return undefined;
  }
};

/** `{ _default, <district>: rate }` for every district the map names; `{}` when map/city/districts/ is missing. */
export function outageRates(mapFile: string): Record<string, number> {
  const dir = path.join(path.dirname(mapFile), 'city', 'districts');
  if (!fs.existsSync(dir)) {
    console.warn(`[blackouts] no ${dir}: no scheduled blackouts`);
    return {};
  }
  const def = outageOf(path.join(dir, '_default.json')) ?? 0;
  let ids: string[] = [];
  try {
    ids = ((JSON.parse(fs.readFileSync(mapFile, 'utf8')) as { districts?: { id: string }[] }).districts ?? []).map((d) => d.id);
  } catch {
    // An unreadable map has no districts to darken.
  }
  const out: Record<string, number> = { _default: def };
  for (const id of ids) out[id] = outageOf(path.join(dir, `${id}.json`)) ?? def;
  return out;
}
