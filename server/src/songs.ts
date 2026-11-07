import fs from 'node:fs';
import path from 'node:path';
import { districtSongs } from '../../shared/districts';

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

/**
 * Tracks made for one quest beat, in a pack's `_beats/` folder: a `song:` line finds them, and the dial-in,
 * the rooms and Studio's song lists don't, because they're cut and worn for that moment. They loop.
 */
export function beatSongs(scenesDir: string): GameSong[] {
  const songs: GameSong[] = [];
  const packs = fs.existsSync(scenesDir) ? fs.readdirSync(scenesDir, { withFileTypes: true }) : [];
  for (const pack of packs) {
    const dir = path.join(scenesDir, pack.name, '_beats');
    if (!pack.isDirectory() || pack.name.startsWith('.') || !fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.ogg') || file.startsWith('.')) continue;
      songs.push({ title: file.slice(0, -'.ogg'.length), url: `/scenes/${encodeURIComponent(pack.name)}/_beats/${encodeURIComponent(file)}` });
    }
  }
  return songs.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Each district's default song (world/districts/districts.json), read at startup with the rooms. One that
 * isn't in the district's `_music/` is warned about and dropped: its rooms stay silent, they still load.
 */
export function districtSongFiles(districtsDir: string, scenesDir: string, warn: (m: string) => void): Record<string, string> {
  const file = path.join(districtsDir, 'districts.json');
  if (!fs.existsSync(file)) return {};
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    warn(`districts: ${file} isn't valid JSON (${(err as Error).message})`);
    return {};
  }
  const { songs, problems } = districtSongs(json);
  for (const p of problems) warn(`districts: ${file}: ${p}`);
  return Object.fromEntries(
    Object.entries(songs).filter(([id, song]) => {
      const there = path.basename(song) === song && fs.existsSync(path.join(scenesDir, id, '_music', song));
      if (!there) warn(`districts: ${id}'s song '${song}' is not in its _music folder`);
      return there;
    }),
  );
}
