/**
 * Figure normal maps on disk (figure lighting spec §1): made on first request, then served from
 * `<dir>/<hash>.png`, the hash covering the source's path, size and mtime, the options and the
 * generator's version, so changed art or a changed generator makes a new map. Requests for a map
 * still being made share its promise.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NORMAL_MAP_DEFAULTS, NORMAL_MAP_VERSION, normalMapPng, type NormalMapOptions } from './normal-map';

export interface NormalCache {
  /** The cached map's path (made now if need be), or null when `src` doesn't exist. */
  file(src: string, opts: NormalMapOptions): Promise<string | null>;
}

export function createNormalCache(dir: string, make: typeof normalMapPng = normalMapPng): NormalCache {
  const pending = new Map<string, Promise<string>>();
  return {
    async file(src, opts) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(src);
      } catch {
        return null;
      }
      const full = { ...NORMAL_MAP_DEFAULTS, ...opts };
      const key = crypto
        .createHash('sha1')
        .update(JSON.stringify([path.resolve(src), stat.size, stat.mtimeMs, full, NORMAL_MAP_VERSION]))
        .digest('hex');
      const dest = path.join(dir, `${key}.png`);
      if (fs.existsSync(dest)) return dest;
      let job = pending.get(key);
      if (!job) {
        job = (async () => {
          const png = await make(fs.readFileSync(src), full);
          fs.mkdirSync(dir, { recursive: true });
          // Written aside, then renamed: a crash never leaves half a map under the real name.
          const tmp = `${dest}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, png);
          fs.renameSync(tmp, dest);
          return dest;
        })().finally(() => pending.delete(key));
        pending.set(key, job);
      }
      return job;
    },
  };
}
