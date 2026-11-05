/**
 * GET /api/map: the city map's data, validated on every read so a Studio save shows the next time the map opens. Each
 * place's readout (world/readouts/<id>.md) rides along on it, read fresh too, so an edit shows the same way.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { parseMap, parseReadout, type ReadoutLine } from '../../shared/map-schema';

export const DEFAULT_READOUTS_DIR = './world/readouts';

/** Every place's readout lines by place id; a missing folder or file is no readout. */
export function loadReadouts(dir: string): Record<string, ReadoutLine[]> {
  const out: Record<string, ReadoutLine[]> = {};
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return out;
  }
  for (const f of files) {
    const lines = parseReadout(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (lines.length) out[f.slice(0, -3)] = lines;
  }
  return out;
}

export function registerMapRoute(app: FastifyInstance, mapFile: string, readoutsDir = DEFAULT_READOUTS_DIR): void {
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
    const readouts = loadReadouts(readoutsDir);
    const places = (raw as { places: { id: string }[] }).places;
    return { ...(raw as object), places: places.map((p) => (readouts[p.id] ? { ...p, readout: readouts[p.id] } : p)) };
  });
}
