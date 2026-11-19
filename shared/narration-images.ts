/**
 * Images in the narration (spec 2026-11-18, faces first): a job's prose marks the paragraph that introduces someone with
 * `{img <id>}`, and the image shows there the first time the run reaches one of its markers. Pure pieces: finding,
 * stripping and placing markers, and drawing `any` faces at a run's start.
 */

/** A face that never drifts: a stranger portrait, or a contact's own art (a head crop of their figure). */
export type CastFace = { kind: 'extra'; id: string } | { kind: 'character'; id: string };

/**
 * Where a job's image comes from: the shared cast list, a fixed face, a draw from the portraits with every tag, or a
 * scene picture (a moment, an object: `world/quests/art/<file>`, shown as a band across the column).
 */
export type ImageSource = { kind: 'cast' } | CastFace | { kind: 'any'; tags: string[] } | { kind: 'scene'; file: string };

/** A scene picture's file name in world/quests/art (the quest art route serves it). */
export const SCENE_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:webp|png|jpg)$/;

export interface JobImage {
  id: string;
  source: ImageSource;
}

/** An image id: lowercase letters, digits and dashes (`who` is reserved: `{who}` fills a name). */
export const IMAGE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** A marker as the first thing in a paragraph, optionally just inside its opening `*`. Group 1: the `*`; 2: the id. */
const LEAD = /^(\*?)\{img ([a-z0-9-]+)\}[ \t]*/;
const ANY = /\{img [a-z0-9-]+\}[ \t]*/g;
const PARA = /\n[ \t]*\n/;

/** A recruit's portrait: never anyone else's face. */
export const isCrewFace = (id: string): boolean => id.startsWith('crew-');

/** The markers that head a paragraph, with that paragraph's index in `text`. */
export function imageMarkers(text: string): { id: string; para: number }[] {
  const out: { id: string; para: number }[] = [];
  text.split(PARA).forEach((p, para) => {
    const m = LEAD.exec(p.trimStart());
    if (m) out.push({ id: m[2], para });
  });
  return out;
}

/** Every marker, wherever it sits, and the space after it, gone. */
export function stripImageMarkers(text: string): string {
  return text.includes('{img ') ? text.replace(ANY, '') : text;
}

/**
 * Strips the markers from a row's sections and places each image not in `shown` at its first marker. `para` is the
 * paragraph's index in the sections joined as a row joins them (empty sections dropped, `\n\n` between).
 */
export function placeImages(texts: readonly string[], shown: ReadonlySet<string>): { texts: string[]; placed: { id: string; para: number }[] } {
  const placed: { id: string; para: number }[] = [];
  const done = new Set(shown);
  let base = 0;
  const out = texts.map((t) => {
    if (t === '') return t;
    for (const m of imageMarkers(t)) {
      if (done.has(m.id)) continue;
      done.add(m.id);
      placed.push({ id: m.id, para: base + m.para });
    }
    const s = stripImageMarkers(t);
    base += s.split(PARA).length;
    return s;
  });
  return { texts: out, placed };
}

/**
 * One portrait for each `any` image, drawn when a run starts: never a crew portrait, never a face another image of the
 * job has (fixed or from the cast), never one an earlier draw took. An image with nothing left gets none.
 */
export function drawImages(images: readonly JobImage[], cast: ReadonlyMap<string, CastFace>, extras: readonly { id: string; tags: readonly string[] }[], rand: () => number): Record<string, string> {
  const used = new Set<string>();
  for (const i of images) {
    const f = i.source.kind === 'cast' ? cast.get(i.id) : i.source.kind === 'extra' ? i.source : null;
    if (f?.kind === 'extra') used.add(f.id);
  }
  const out: Record<string, string> = {};
  for (const i of images) {
    if (i.source.kind !== 'any') continue;
    const tags = i.source.tags;
    const pool = extras.filter((e) => !isCrewFace(e.id) && !used.has(e.id) && tags.every((t) => e.tags.includes(t)));
    if (!pool.length) continue;
    const pick = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))].id;
    used.add(pick);
    out[i.id] = pick;
  }
  return out;
}
