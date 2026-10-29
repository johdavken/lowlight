// The publish guard (spec 2026-10-23 §2): the public package never ships a restricted sound (Sonniss, Bleeoop,
// JDSherbert: their licenses forbid redistributing the raw files) or anything outside its allowlist.
import path from 'node:path';

const AUDIO = /\.(ogg|mp3|wav|opus|flac|m4a)$/i;

/**
 * One key per audio path, the same for a credits row and the package file it clears: songs by `_music/<name>` (a
 * district's songs sit flat in the package's rooms/_music/), everything else by its path under sound/ (credits rows
 * written relative to web/public/sound/ or as web/public/sound/…). A restricted file never borrows a cleared one's name.
 */
export function audioKey(p: string): string {
  const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.includes('_music/')) return `_music/${path.basename(rel)}`;
  const sound = rel.replace(/^web\/public\//, '');
  return sound.startsWith('sound/') || sound.startsWith('rooms/') ? sound : `sound/${sound}`;
}

/** Audio paths (audioKey) a credits file marks public: Suno songs (Farban's) or CC0, and no restricted source. */
export function publicAudio(credits: string): Set<string> {
  const out = new Set<string>();
  for (const line of credits.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|');
    const names = [...(cells[1] ?? '').matchAll(/`([^`]+\.(?:ogg|mp3|wav|opus|flac|m4a))`/gi)].map((m) => audioKey(m[1]));
    if (!names.length) continue;
    const source = cells.slice(2).join('|').toLowerCase();
    const restricted = /gdc|sonniss|bleeoop|interface bleeps|sherbert/.test(source);
    const open = /suno|cc0|glitch noises|zharkov/.test(source);
    if (open && !restricted) for (const n of names) out.add(n);
  }
  return out;
}

/** What the package may hold: these root files, and anything under these folders. */
export const PACKAGE_ALLOW = {
  rootFiles: /^(?:[\w.-]+\.(?:js|css|json)|LICENSE|CONTENT-LICENSE|README\.md|CHANGELOG\.md|CREDITS\.md|THIRD-PARTY-LICENSES\.md|\.gitignore)$/,
  folders: ['rooms/', 'map/', 'sound/', 'cast/', 'assets/'],
};

/** The files that may not ship: audio not marked public, and anything outside the allowlist. Empty: clean. */
export function checkShipList(files: string[], allowedAudio: Set<string>, allow: typeof PACKAGE_ALLOW): string[] {
  return files.filter((f) => {
    const rel = f.replace(/\\/g, '/').replace(/^\.\//, '');
    if (AUDIO.test(rel) && !allowedAudio.has(audioKey(rel))) return true;
    return !(allow.rootFiles.test(rel) || allow.folders.some((d) => rel.startsWith(d)));
  });
}
