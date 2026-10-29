/**
 * The district load screen's routes (spec 2026-10-11 district load screen): a map district's name,
 * subtitle (world/districts/districts.json) and lore (the entry titled like it), and its art
 * (world/districts/<id>.webp). Both read per request, so new art or subtitles show without a restart.
 * Only the map's own district ids ever become a path. A room asks by its scene id: the map place
 * that is that room says its district, else its folder (the folders are named for the districts).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { LoreEntry } from '../../shared/lore';
import { districtSubtitles, type DistrictInfo } from '../../shared/districts';

const NONE = { error: 'no such district' };

export function registerDistrictRoutes(
  app: FastifyInstance,
  o: {
    dir: string;
    districts: () => { id: string; name: string }[];
    places: () => { scene?: string; district: string }[];
    lore: () => LoreEntry[];
    warn: (m: string) => void;
  },
): void {
  const district = (id: string) => o.districts().find((d) => d.id === id);
  const artFile = (id: string) => path.join(o.dir, `${id}.webp`);

  function subtitle(id: string): string | undefined {
    const file = path.join(o.dir, 'districts.json');
    if (!fs.existsSync(file)) return undefined;
    try {
      const { subtitles, problems } = districtSubtitles(JSON.parse(fs.readFileSync(file, 'utf8')));
      for (const p of problems) o.warn(`districts: ${file}: ${p}`);
      return subtitles[id];
    } catch (err) {
      o.warn(`districts: ${file} isn't valid JSON (${(err as Error).message})`);
      return undefined;
    }
  }

  function loreFor(name: string): string | null {
    const key = name.trim().toLowerCase();
    const hits = o.lore().filter((e) => e.title.trim().toLowerCase() === key);
    if (hits.length > 1) o.warn(`districts: ${hits.length} lore entries are titled '${name}'; using '${hits[0].id}'`);
    return hits[0]?.body ?? null;
  }

  /** The district info for a map district id, or null (not on the map, no lore entry). */
  function info(id: string | undefined): DistrictInfo | null {
    const d = id === undefined ? undefined : district(id);
    const lore = d ? loreFor(d.name) : null;
    if (!d || lore === null) return null;
    const sub = subtitle(d.id);
    return { id: d.id, name: d.name, ...(sub !== undefined ? { subtitle: sub } : {}), lore, hasArt: fs.existsSync(artFile(d.id)) };
  }

  app.get<{ Querystring: { scene?: string | string[] } }>('/api/districts', async (req, reply) => {
    // A repeated ?scene= arrives as a list: no single room, so no district.
    const scene = typeof req.query.scene === 'string' ? req.query.scene : undefined;
    const id = scene ? (o.places().find((p) => p.scene === scene)?.district ?? scene.split('/')[0]) : undefined;
    // A room in no district (the default rooms) is normal, not an error: a 404 would be logged by the browser.
    return info(id) ?? reply.type('application/json').send('null');
  });

  // The select screen's group labels and 1P backdrop (spec 2026-10-25): every map district, lore or not.
  app.get('/api/district-list', async () => o.districts().map((d) => ({ id: d.id, name: d.name, hasArt: fs.existsSync(artFile(d.id)) })));

  app.get<{ Params: { id: string } }>('/api/districts/:id', async (req, reply) => info(req.params.id) ?? reply.code(404).send(NONE));

  app.get<{ Params: { id: string } }>('/api/district-art/:id', async (req, reply) => {
    const d = district(req.params.id);
    if (!d || !fs.existsSync(artFile(d.id))) return reply.code(404).send(NONE);
    return reply.type('image/webp').header('cache-control', 'no-cache').send(fs.readFileSync(artFile(d.id)));
  });
}
