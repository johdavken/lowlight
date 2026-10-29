/**
 * Papers' data on the server (spec §6, §2.8): world/papers/ read fresh on every request, the face
 * photos, and the first-night marker. The hub regenerates boards from the same loader, so the
 * browser and the check never disagree about what a seed deals.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { parseFaces, parseNames, parseOrigins, parseReasons, DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from '../../shared/papers/data';

/** A face's file name: band prefix, two or three digits. */
const FACE_FILE = /^(u25|mid|o40)-\d{2,3}\.jpg$/;
export const FIRST_NIGHT_MARKER = 'papers-first-night-seen';

/** A file's JSON, `undefined` when it isn't there, or `null` (with a warning) when it can't be read. */
function readJson(file: string, warn: (m: string) => void): unknown {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    warn(`papers ${path.basename(file)}: not valid JSON; using the defaults`);
    return null;
  }
}

export function loadPapersData(dir: string, loreIds: ReadonlySet<string>, warn: (m: string) => void): PapersData {
  const quiet = () => {};
  const origins = readJson(path.join(dir, 'origins.json'), warn);
  const names = readJson(path.join(dir, 'names.json'), warn);
  const faces = readJson(path.join(dir, 'faces.json'), warn);
  const reasons = readJson(path.join(dir, 'reasons.json'), warn);
  let files: string[] = [];
  try {
    const jpgs = fs.readdirSync(path.join(dir, 'faces')).filter((n) => n.endsWith('.jpg')).sort();
    // Only names the face route serves: anything else would deal a photo that never loads.
    for (const n of jpgs) if (!FACE_FILE.test(n)) warn(`papers face ${n}: name it u25-, mid- or o40- and two or three digits (o40-07.jpg); skipping it`);
    files = jpgs.filter((n) => FACE_FILE.test(n)).map((n) => n.slice(0, -4));
  } catch {
    files = [];
  }
  return {
    // A missing or unreadable file is that part's default, without a second warning.
    origins: origins === undefined || origins === null ? [...DEFAULT_ORIGINS] : parseOrigins(origins, warn),
    names: names === undefined || names === null ? { given: { f: [], m: [], x: [] }, family: [] } : parseNames(names, warn),
    faces: parseFaces(files, faces ?? [], faces === undefined || faces === null ? quiet : warn),
    reasons: reasons === undefined || reasons === null ? [...DEFAULT_REASONS] : parseReasons(reasons, loreIds, warn),
  };
}

export const firstNightSeen = (dataDir: string): boolean => fs.existsSync(path.join(dataDir, FIRST_NIGHT_MARKER));

export function markFirstNightSeen(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, FIRST_NIGHT_MARKER), `${new Date().toISOString()}\n`);
}

export function registerPapersRoutes(app: FastifyInstance, opts: { papersDir: string; dataDir: string; loreIds: () => ReadonlySet<string> }): void {
  app.get('/api/papers', async () => ({ ...loadPapersData(opts.papersDir, opts.loreIds(), (m) => app.log.warn(m)), firstNight: !firstNightSeen(opts.dataDir) }));
  app.get<{ Params: { file: string } }>('/api/papers/faces/:file', async (req, reply) => {
    const file = path.join(opts.papersDir, 'faces', req.params.file);
    if (!FACE_FILE.test(req.params.file) || !fs.existsSync(file)) return reply.code(404).send({ error: 'no such face' });
    return reply.type('image/jpeg').send(fs.readFileSync(file));
  });
}
