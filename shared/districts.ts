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

/** world/districts/districts.json: `{ <district id>: { subtitle } }`. Keeps the text subtitles; the rest become problem lines. */
export function districtSubtitles(json: unknown): { subtitles: Record<string, string>; problems: string[] } {
  const subtitles: Record<string, string> = {};
  const problems: string[] = [];
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return { subtitles, problems: ['not an object of districts'] };
  for (const [id, v] of Object.entries(json)) {
    const sub = v !== null && typeof v === 'object' ? (v as { subtitle?: unknown }).subtitle : undefined;
    if (typeof sub === 'string') subtitles[id] = sub;
    else problems.push(`'${id}' has no text subtitle`);
  }
  return { subtitles, problems };
}
