/** A character's photo pool (photos spec §1): `photos` in her character.json, checked entry by entry, each file in her `photos/` folder. */
import fs from 'node:fs';
import path from 'node:path';
import { bandOf, HOUR_BANDS, PHOTO_CAPTION_MAX, PHOTO_ID, PHOTOS_MAX, type HourBand, type Photo } from '../../shared/photos';
import { minuteOfDay as minuteOfDayOf } from '../../shared/clock';

/** Her pool, resolved in `dir`; a bad entry costs only that entry, with a warning. `file` is the full path. */
export function resolvePhotos(dir: string, raw: unknown, outfits: readonly string[], scenes: ReadonlySet<string> | { has(id: string): boolean }, warn: (m: string) => void): Photo[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warn('photos: not a list; ignored');
    return [];
  }
  const out: Photo[] = [];
  const seen = new Set<string>();
  raw.forEach((e: unknown, i) => {
    const drop = (why: string) => warn(`photos[${i}]: ${why}; dropped`);
    if (typeof e !== 'object' || e === null || Array.isArray(e)) return drop('not an object');
    const o = e as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    if (!PHOTO_ID.test(id)) return drop(`bad id '${String(o.id)}' (lower-case words joined by -)`);
    if (seen.has(id)) return drop(`'${id}' appears twice`);
    const file = path.join(dir, 'photos', `${id}.webp`);
    if (!fs.existsSync(file)) return drop(`no file ${id}.webp`);
    const caption = typeof o.caption === 'string' ? o.caption.replace(/\s+/g, ' ').trim() : '';
    if (caption === '') return drop('no caption');
    if (caption.length > PHOTO_CAPTION_MAX) return drop(`caption over ${PHOTO_CAPTION_MAX} characters`);
    if (/["[\]]/.test(caption)) return drop('caption has " [ or ] (they would break her photos line)');
    const at = o.at === undefined ? undefined : Array.isArray(o.at) ? o.at.map(String) : [String(o.at)];
    const badScene = at?.find((s) => !scenes.has(s));
    if (badScene !== undefined) return drop(`unknown scene '${badScene}'`);
    const outfit = o.outfit === undefined || o.outfit === null ? undefined : String(o.outfit);
    if (outfit !== undefined && !outfits.includes(outfit)) return drop(`'${outfit}' isn't one of her outfits`);
    const hours = o.hours === undefined ? undefined : Array.isArray(o.hours) ? o.hours.map((h) => String(h).toLowerCase()) : [String(o.hours).toLowerCase()];
    const badHour = hours?.find((h) => !HOUR_BANDS.includes(h as HourBand));
    if (badHour !== undefined) return drop(`unknown hours '${badHour}' (${HOUR_BANDS.join(', ')})`);
    if (out.length >= PHOTOS_MAX) return drop(`past the ${PHOTOS_MAX}th`);
    seen.add(id);
    out.push({ id, file, caption, ...(at && at.length > 0 ? { at } : {}), ...(outfit ? { outfit } : {}), ...(hours && hours.length > 0 ? { hours: hours as HourBand[] } : {}) });
  });
  return out;
}

/**
 * Where she is for her photos (spec §2): her scheduled scene and the outfit she wears there (its outfitByScene entry,
 * else her default outfit); both null when she's free. The hour from the story clock.
 */
export function photoMoment(
  sprite: { file: string; outfits: Record<string, string>; outfitByScene: Record<string, string> } | null,
  scene: string | null,
  clock: number,
): { scene: string | null; outfit: string | null; band: HourBand; minuteOfDay: number } {
  const minuteOfDay = minuteOfDayOf(clock);
  if (scene === null) return { scene: null, outfit: null, band: bandOf(minuteOfDay), minuteOfDay };
  const fallback = sprite ? (Object.entries(sprite.outfits).find(([, f]) => f === sprite.file)?.[0] ?? null) : null;
  return { scene, outfit: sprite?.outfitByScene[scene] ?? fallback, band: bandOf(minuteOfDay), minuteOfDay };
}
