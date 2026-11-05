/**
 * Extras (stranger faces spec §2): background people's portraits in world/extras/, cut from sheets in
 * Studio EXTRAS, named by quests with `face:` under a stranger.
 */
import { z } from 'zod';

export const EXTRA_ID_MAX = 40;
export const EXTRA_NOTE_MAX = 80;
/** A face is scaled down (whole steps, nearest-neighbour) until it is at most this tall. */
export const EXTRA_MAX_H = 480;
export const EXTRA_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Extra {
  id: string;
  file: string;
  tags: string[];
  note?: string;
}

const id = z.string().regex(EXTRA_ID, 'lowercase letters, digits and dashes').max(EXTRA_ID_MAX);
const extraSchema = z
  .strictObject({
    id,
    file: z.string(),
    tags: z.array(id).min(1).max(8),
    note: z.string().max(EXTRA_NOTE_MAX).regex(/^[^\n]*$/, 'one line').optional(),
  })
  .refine((e) => e.file === `${e.id}.png`, { message: 'file must be <id>.png' });

/** world/extras/extras.json, checked: every face's shape, and no id twice. */
export function parseExtras(json: unknown): { ok: true; extras: Extra[] } | { ok: false; message: string } {
  const r = z.array(extraSchema).safeParse(json);
  if (!r.success) return { ok: false, message: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const seen = new Set<string>();
  for (const e of r.data) {
    if (seen.has(e.id)) return { ok: false, message: `'${e.id}' appears twice` };
    seen.add(e.id);
  }
  return { ok: true, extras: r.data };
}

/** What a quest's `face:` can name: the ids, and the tags with at least one face. */
export function extrasKnown(extras: readonly Extra[]): { ids: Set<string>; tags: Set<string> } {
  return { ids: new Set(extras.map((e) => e.id)), tags: new Set(extras.flatMap((e) => e.tags)) };
}

/** Each tag and how many faces carry it, by tag (COPY FOR OPUS lists them). */
export function tagCounts(extras: readonly Extra[]): { tag: string; count: number }[] {
  const n = new Map<string, number>();
  for (const e of extras) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].sort(([a], [b]) => a.localeCompare(b)).map(([tag, count]) => ({ tag, count }));
}

/**
 * A face for a DRAW stranger (the narrator's gender and age): a `local` from the district or from no
 * district in particular if there's one (only one or two fit each, so both), else from anywhere, then
 * any age, then anyone. "middle" has no tag (neither young nor old). Null with no locals at all.
 */
export function pickStrangerFace(
  extras: Extra[],
  who: { gender?: string; age?: string; district?: string | null },
  r: () => number = Math.random,
): string | null {
  const locals = extras.filter((e) => e.tags.includes('local'));
  const age = (e: Extra) => (who.age === 'middle' ? !e.tags.includes('young') && !e.tags.includes('old') : !who.age || e.tags.includes(who.age));
  const gender = (e: Extra) => !who.gender || e.tags.includes(who.gender);
  const DISTRICTLESS = new Set(['local', 'man', 'woman', 'young', 'old']);
  const district = (e: Extra) => !who.district || e.tags.includes(who.district) || e.tags.every((t) => DISTRICTLESS.has(t));
  const tries = [
    (e: Extra) => gender(e) && age(e) && district(e),
    (e: Extra) => gender(e) && age(e),
    (e: Extra) => gender(e),
    () => true,
  ];
  for (const t of tries) {
    const pool = locals.filter(t);
    if (pool.length > 0) return pool[Math.floor(r() * pool.length)]!.id;
  }
  return null;
}
