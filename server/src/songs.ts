import fs from 'node:fs';
import path from 'node:path';

/** A song in the game: its title (the file name without `.ogg`) and where the browser fetches it. */
export interface GameSong {
  title: string;
  url: string;
}

/**
 * Every song in every pack's `_music/` folder, for the dial-in's shuffle. Read fresh on each call,
 * so a song Scene Studio adds is in the next page load. A file name two packs share is one song.
 */
export function gameSongs(scenesDir: string): GameSong[] {
  const byFile = new Map<string, GameSong>();
  const packs = fs.existsSync(scenesDir) ? fs.readdirSync(scenesDir, { withFileTypes: true }) : [];
  for (const pack of packs) {
    if (!pack.isDirectory() || pack.name.startsWith('.')) continue;
    const dir = path.join(scenesDir, pack.name, '_music');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      // A dot file is Scene Studio's song still converting.
      if (!file.endsWith('.ogg') || file.startsWith('.') || byFile.has(file)) continue;
      byFile.set(file, { title: file.slice(0, -'.ogg'.length), url: `/scenes/${encodeURIComponent(pack.name)}/_music/${encodeURIComponent(file)}` });
    }
  }
  return [...byFile.values()].sort((a, b) => a.title.localeCompare(b.title));
}
