/**
 * Photos on the deck (spec 2026-10-23): a character's pool of photos she can send by text, which of them fit her
 * right now, the `[photo: id]` line in her reply, and how the model reads a sent photo. Pure.
 */

export type HourBand = 'night' | 'dawn' | 'day' | 'evening';
export const HOUR_BANDS: readonly HourBand[] = ['night', 'dawn', 'day', 'evening'];

export interface Photo {
  id: string;
  /** In her folder: `photos/<id>.webp`. */
  file: string;
  /** What it shows, from her side: all she ever sees of it. */
  caption: string;
  /** The scenes it can be sent from; absent: anywhere. */
  at?: string[];
  /** The outfit it shows; absent: any. */
  outfit?: string;
  /** The hours it can be sent in; absent: any. */
  hours?: HourBand[];
}

export const PHOTO_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PHOTOS_MAX = 40;
export const PHOTOS_OFFERED = 6;
export const PHOTO_CAPTION_MAX = 160;

/** night 20:00–04:00, dawn 04:00–07:00, day 07:00–17:00, evening 17:00–20:00; starts inclusive. */
export function bandOf(minuteOfDay: number): HourBand {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  if (m >= 240 && m < 420) return 'dawn';
  if (m >= 420 && m < 1020) return 'day';
  if (m >= 1020 && m < 1200) return 'evening';
  return 'night';
}

const tagCount = (p: Photo) => Number(p.at !== undefined) + Number(p.outfit !== undefined) + Number(p.hours !== undefined);

/**
 * The photos she could send now (spec §2). `scene` is where her schedule has her and `outfit` what she wears there;
 * both null when she's free, and then only photos with neither `at` nor `outfit` fit. Most tags first, then by id; at most six.
 */
export function fittingPhotos(pool: readonly Photo[], now: { scene: string | null; outfit: string | null; minuteOfDay: number }): Photo[] {
  const band = bandOf(now.minuteOfDay);
  return pool
    .filter((p) => (p.at === undefined || (now.scene !== null && p.at.includes(now.scene))) && (p.outfit === undefined || (now.outfit !== null && p.outfit === now.outfit)) && (p.hours === undefined || p.hours.includes(band)))
    .sort((a, b) => tagCount(b) - tagCount(a) || a.id.localeCompare(b.id))
    .slice(0, PHOTOS_OFFERED);
}

/** The text turn's line (spec §3); null when nothing fits. The rule lives here, so a turn without photos pays nothing. */
export function photosLine(offered: readonly Photo[]): string | null {
  if (offered.length === 0) return null;
  const items = offered.map((p) => `${p.id} "${p.caption.replace(/\s+/g, ' ').trim()}"`).join(' · ');
  return `[photos you could send: ${items} — to send one, put [photo: id] on its own line; at most one; only these]`;
}

const WHOLE = /^\s*\[\s*photo\s*:\s*([^\]]*?)\s*\]\s*$/i;
const COPIED = /^\s*[*_]*\(\s*sent a photo\b[^)]*\)[*_.]*\s*$/i;
const ANY = /\[\s*photo\s*:\s*([^\]]*?)\s*\]/gi;

/** The id of a line that is exactly a photo marker; null otherwise. */
export function photoIdOf(line: string): string | null {
  const m = WHOLE.exec(line);
  return m ? m[1].toLowerCase() : null;
}

/** Her reply → the text kept (at most one offered photo, as `[photo: id]` on its own line) and the ids dropped. */
export function parsePhotoReply(text: string, offered: ReadonlySet<string>): { text: string; photo: string | null; dropped: string[] } {
  let photo: string | null = null;
  const dropped: string[] = [];
  // A line that was only a dropped marker goes; every other line is kept as written.
  const out: string[] = [];
  for (const line of text.split('\n')) {
    // Her history reads her photos as `(sent a photo: …)`; copying that form isn't sending one (mid review I3).
    if (COPIED.test(line)) continue;
    const id = photoIdOf(line);
    if (id !== null) {
      if (photo === null && offered.has(id)) {
        photo = id;
        out.push(`[photo: ${id}]`);
      } else dropped.push(id);
      continue;
    }
    let found = false;
    const kept = line.replace(ANY, (_m, raw: string) => {
      found = true;
      dropped.push(raw.toLowerCase());
      return ' ';
    });
    if (!found) out.push(line);
    else if (kept.trim() !== '') out.push(kept.replace(/\s+/g, ' ').trim());
  }
  return { text: out.join('\n').trim(), photo, dropped };
}

/** A row's text as the model reads it (spec §4): marker lines become `(sent a photo: caption)`, or `(sent a photo)` when it's gone. */
export function photoForModel(text: string, caption: (id: string) => string | null): string {
  if (!/\[\s*photo\s*:/i.test(text)) return text;
  return text
    .split('\n')
    .map((l) => {
      const id = photoIdOf(l);
      if (id === null) return l;
      const c = caption(id);
      return c ? `(sent a photo: ${c})` : '(sent a photo)';
    })
    .join('\n');
}

/** The thread list's preview of a text (spec §5): `PHOTO`, or `PHOTO · <her words>`. */
export function photoPreview(text: string): string {
  const lines = text.split('\n');
  if (!lines.some((l) => photoIdOf(l) !== null)) return text;
  const words = lines.filter((l) => photoIdOf(l) === null && l.trim() !== '').join(' ').trim();
  return words ? `PHOTO · ${words}` : 'PHOTO';
}
