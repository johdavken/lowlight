/** GET /api/map: the city map's data, validated on every read so a Studio save shows the next time the map opens. */
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { parseMap } from '../../shared/map-schema';

export function registerMapRoute(app: FastifyInstance, mapFile: string): void {
  app.get('/api/map', async (_req, reply) => {
    let text: string;
    try {
      text = fs.readFileSync(mapFile, 'utf8');
    } catch {
      return reply.code(404).send({ error: 'no map' });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return reply.code(500).send({ error: 'map data is broken', errors: [{ path: '', message: (e as Error).message }] });
    }
    const parsed = parseMap(raw);
    if (!parsed.ok) return reply.code(500).send({ error: 'map data is broken', errors: parsed.errors });
    return raw;
  });
}
