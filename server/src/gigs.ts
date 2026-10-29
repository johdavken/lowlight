/** Gig briefs: world/gigs/<id>.md, and GET /api/gigs?place= (read fresh each call, like /api/map). */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { mapIds } from '../../shared/lore';
import { parseMap, type CityMapData } from '../../shared/map-schema';
import { parseGigFile, type Brief } from '../../shared/gig/brief';

/** Each `.md` directly in `dir`. A file that fails warns once and is skipped; a missing folder has none. */
export function loadGigBriefs(dir: string, map: CityMapData | null, warn: (m: string) => void): Brief[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const ids = mapIds(map);
  const briefs: Brief[] = [];
  for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue;
    const r = parseGigFile(d.name.slice(0, -3), fs.readFileSync(path.join(dir, d.name), 'utf8'), ids);
    if (r.ok) briefs.push(r.brief);
    else warn(`gig ${d.name}: ${r.problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  }
  return briefs;
}

/** The map, or null when it can't be read. */
export function readMap(mapFile: string): CityMapData | null {
  try {
    const r = parseMap(JSON.parse(fs.readFileSync(mapFile, 'utf8')));
    return r.ok ? r.map : null;
  } catch {
    return null;
  }
}

export function registerGigRoute(app: FastifyInstance, opts: { gigsDir: string; mapFile: string }): void {
  app.get<{ Querystring: { place?: string } }>('/api/gigs', async (req, reply) => {
    const map = readMap(opts.mapFile);
    const place = map?.places.find((p) => p.id === req.query.place);
    if (!map || !place) return reply.code(404).send({ error: 'no such place' });
    if (!place.gigs) return { briefs: [] };
    return { briefs: loadGigBriefs(opts.gigsDir, map, (m) => app.log.warn(m)).filter((b) => b.place === place.id) };
  });
}
