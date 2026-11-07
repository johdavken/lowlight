/** The district load screen's data (spec 2026-10-11 district load screen): what the game shows for a map district. */

export interface DistrictInfo {
  id: string;
  /** The map's name for it. */
  name: string;
  subtitle?: string;
  /** The lore entry titled like the district, its body only. */
  lore: string;
  /** Whether world/districts/<id>.webp exists. */
  hasArt: boolean;
}

/** world/districts/districts.json: `{ <district id>: { subtitle, song? } }`. Keeps the text subtitles; the rest become problem lines (a district there only for its song has none to report). */
export function districtSubtitles(json: unknown): { subtitles: Record<string, string>; problems: string[] } {
  const subtitles: Record<string, string> = {};
  const problems: string[] = [];
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return { subtitles, problems: ['not an object of districts'] };
  for (const [id, v] of Object.entries(json)) {
    const entry = v !== null && typeof v === 'object' ? (v as { subtitle?: unknown; song?: unknown }) : undefined;
    if (typeof entry?.subtitle === 'string') subtitles[id] = entry.subtitle;
    else if (entry?.subtitle !== undefined || entry?.song === undefined) problems.push(`'${id}' has no text subtitle`);
  }
  return { subtitles, problems };
}

/** The same file's `song`s: the file in a district's `_music/` that its rooms play when they list none of their own. */
export function districtSongs(json: unknown): { songs: Record<string, string>; problems: string[] } {
  const songs: Record<string, string> = {};
  const problems: string[] = [];
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return { songs, problems: ['not an object of districts'] };
  for (const [id, v] of Object.entries(json)) {
    const song = v !== null && typeof v === 'object' ? (v as { song?: unknown }).song : undefined;
    if (typeof song === 'string' && song !== '') songs[id] = song;
    else if (song !== undefined) problems.push(`'${id}' has a song that isn't a file name`);
  }
  return { songs, problems };
}
