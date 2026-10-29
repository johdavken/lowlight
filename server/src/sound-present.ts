import fs from 'node:fs';
import path from 'node:path';

const AUDIO = /\.(ogg|mp3|wav|flac)$/i;

/** Audio files under `dir` (dot-files skipped: a sound still converting), as forward-slash paths relative to it. */
function audioIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && AUDIO.test(e.name) && !e.name.startsWith('.'))
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

/**
 * The sounds on disk, as the decoded urls the game asks for (`/sound/…`, `/scenes/…`), sorted. A build
 * without the restricted sounds (the public repo, spec 2026-10-28 open-source release §3) skips the rest.
 */
export function soundPresent(webSoundDir: string, scenesDir: string): string[] {
  return [...audioIn(webSoundDir).map((f) => `/sound/${f}`), ...audioIn(scenesDir).map((f) => `/scenes/${f}`)].sort();
}
