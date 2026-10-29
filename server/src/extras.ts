/**
 * The extras library (stranger faces spec §2): world/extras/extras.json and its PNGs, read once at
 * startup with the quest book that checks against it (restart after adding faces).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseExtras, type Extra } from '../../shared/extras';

export const DEFAULT_EXTRAS_DIR = './world/extras';

/** The faces in `dir` whose pictures are there; an empty library (said once) when extras.json is missing or bad. */
export function loadExtras(dir: string, warn: (m: string) => void): Extra[] {
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(path.join(dir, 'extras.json'), 'utf8'));
  } catch (err) {
    warn(`extras: can't read ${path.join(dir, 'extras.json')} (${(err as Error).message}); no stranger faces`);
    return [];
  }
  const r = parseExtras(json);
  if (!r.ok) {
    warn(`extras: ${r.message}; no stranger faces`);
    return [];
  }
  return r.extras.filter((e) => {
    if (fs.existsSync(path.join(dir, e.file))) return true;
    warn(`extras: ${e.id}: no ${e.file}; skipping it`);
    return false;
  });
}

/** Each face's bytes and ETag, for GET /api/extras/:id. */
export function extraImages(dir: string, extras: readonly Extra[]): Map<string, { png: Buffer; etag: string }> {
  const out = new Map<string, { png: Buffer; etag: string }>();
  for (const e of extras) {
    const png = fs.readFileSync(path.join(dir, e.file));
    out.set(e.id, { png, etag: `"${crypto.createHash('sha1').update(png).digest('hex')}"` });
  }
  return out;
}
