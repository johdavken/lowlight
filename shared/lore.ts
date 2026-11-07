/**
 * The lore book (spec 2026-10-08 lore book): Lowlight's setting as short entries in
 * `world/lore/<id>.md`, and their category templates in `world/lore/categories/<id>.md`. Pure: the
 * game server, Studio and their tests share these rules.
 */
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import type { CityMapData } from './map-schema';

export const LORE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const LORE_ID_MAX = 40;
export const LORE_TITLE_MAX = 60;
export const LORE_CATEGORY_MAX = 30;
export const LORE_KEYS_MAX = 12;
export const LORE_KEY_MIN = 2;
export const LORE_KEY_MAX = 40;
export const LORE_BODY_MAX = 1200;
/** The lore block's size cap, in characters (~1,500 tokens): raised from 3,000 once the book outgrew it (2026-10-10). */
export const LORE_BUDGET = 6000;
export const LORE_WINDOW = 4;
export const LORE_TEMPLATE_MAX = 2000;

export const LORE_ONLY = ['book', 'model'] as const;
export type LoreOnly = (typeof LORE_ONLY)[number];

export interface LoreEntry {
  id: string;
  title: string;
  category?: string;
  /** A fold inside the category, in the BOOK and on Studio's list. */
  section?: string;
  /** Who reads it, when not both: `book`, the player alone (selectLore and the ST export skip it); `model`, the characters alone (the BOOK and hover cards skip it). */
  only?: LoreOnly;
  keys: string[];
  districts: string[];
  places: string[];
  always: boolean;
  body: string;
}
export interface LoreProblem {
  field: string;
  message: string;
}
/** The map's district and place ids, which an entry's `districts` and `places` must come from. */
export interface MapIds {
  districts: ReadonlySet<string>;
  places: ReadonlySet<string>;
}
export interface LoreCategory {
  id: string;
  category: string;
  template: string;
}

/** Studio's GET /api/lore: every entry file (null, with its problems, when the game would skip it) and the category templates. */
export interface LoreListing {
  /** `loose`: for a file the game would skip, what of it can be read (so the form can open it). */
  entries: { id: string; entry: LoreEntry | null; problems: LoreProblem[]; loose?: LoreEntry }[];
  categories: LoreCategory[];
  /** Each place's room as its art shows it, by place id (COPY FOR OPUS asks for lore that fits). */
  rooms?: Record<string, string>;
}

export function mapIds(map: CityMapData | null): MapIds | null {
  return map ? { districts: new Set(map.districts.map((d) => d.id)), places: new Set(map.places.map((p) => p.id)) } : null;
}

export const oneLine = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), 'must be one line');

const entrySchema = z.strictObject({
  title: oneLine(LORE_TITLE_MAX),
  category: oneLine(LORE_CATEGORY_MAX).optional(),
  section: oneLine(LORE_CATEGORY_MAX).optional(),
  only: z.enum(LORE_ONLY).optional(),
  keys: z.array(oneLine(LORE_KEY_MAX, LORE_KEY_MIN)).max(LORE_KEYS_MAX).default([]),
  districts: z.array(z.string()).default([]),
  places: z.array(z.string()).default([]),
  always: z.boolean().default(false),
});
const categorySchema = z.strictObject({ category: oneLine(LORE_CATEGORY_MAX) });

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

/** Plain YAML scalars a human writes unquoted (a number, say) read back as strings. */
function stringsOnly(v: unknown): unknown {
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(stringsOnly);
  return v;
}

/** The front matter (as an object) and the trimmed body; or a problem. Gig briefs (shared/gig/brief.ts) share it. */
export function splitFrontMatter(text: string): { front: Record<string, unknown>; body: string } | LoreProblem {
  const m = FRONT.exec(text.replace(/^﻿/, ''));
  if (!m) return { field: 'file', message: 'needs front matter between --- lines' };
  let front: unknown;
  try {
    front = parseYaml(m[1]) ?? {};
  } catch (err) {
    return { field: 'file', message: `front matter isn't valid: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}` };
  }
  if (typeof front !== 'object' || front === null || Array.isArray(front)) return { field: 'file', message: 'front matter must be key: value lines' };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(front)) out[k] = stringsOnly(v);
  return { front: out, body: (m[2] ?? '').replace(/\r\n/g, '\n').trim() };
}

const idProblems = (id: string): LoreProblem[] =>
  LORE_ID.test(id) && id.length <= LORE_ID_MAX ? [] : [{ field: 'id', message: `must be lowercase letters, digits and dashes, at most ${LORE_ID_MAX}` }];

export function zodProblems(err: z.ZodError): LoreProblem[] {
  return err.issues.map((i) => ({ field: i.code === 'unrecognized_keys' ? String(i.keys[0]) : String(i.path[0] ?? 'file'), message: i.message }));
}

export function parseLoreFile(id: string, text: string, ids: MapIds | null): { ok: true; entry: LoreEntry } | { ok: false; problems: LoreProblem[] } {
  const problems = idProblems(id);
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [...problems, s] };
  const parsed = entrySchema.safeParse(s.front);
  if (!parsed.success) problems.push(...zodProblems(parsed.error));
  if (s.body.length === 0) problems.push({ field: 'body', message: 'needs some text' });
  if (s.body.length > LORE_BODY_MAX) problems.push({ field: 'body', message: `at most ${LORE_BODY_MAX} characters (this is ${s.body.length})` });
  if (!parsed.success) return { ok: false, problems };
  const f = parsed.data;
  const seen = new Set<string>();
  const keys = f.keys.filter((k) => !seen.has(k.toLowerCase()) && Boolean(seen.add(k.toLowerCase())));
  // A book-only entry can just sit in the book: nothing has to bring it in.
  if (keys.length === 0 && f.districts.length === 0 && f.places.length === 0 && !f.always && f.only !== 'book') problems.push({ field: 'keys', message: 'needs keys, a district, a place or always' });
  if (f.always && f.only === 'book') problems.push({ field: 'only', message: 'a book-only entry never reaches the model, so it can\'t be always' });
  if (ids) {
    for (const d of f.districts) if (!ids.districts.has(d)) problems.push({ field: 'districts', message: `no district '${d}' on the map` });
    for (const p of f.places) if (!ids.places.has(p)) problems.push({ field: 'places', message: `no place '${p}' on the map` });
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    entry: { id, title: f.title, ...(f.category !== undefined ? { category: f.category } : {}), ...(f.section !== undefined ? { section: f.section } : {}), ...(f.only !== undefined ? { only: f.only } : {}), keys, districts: f.districts, places: f.places, always: f.always, body: s.body },
  };
}

/** A YAML scalar: plain when it reads back as the same string, else double-quoted (JSON is valid YAML). */
export function yamlScalar(s: string, inFlow = false): string {
  const plain = /^[\p{L}\p{N}][\p{L}\p{N} '.!?&()/-]*$/u.test(s) && !s.endsWith(' ') && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && !/^[-+.]?\d/.test(s);
  return plain && !(inFlow && /[,[\]{}]/.test(s)) ? s : JSON.stringify(s);
}
const list = (xs: string[]) => `[${xs.map((x) => yamlScalar(x, true)).join(', ')}]`;

/**
 * What can be read from an entry file, even one the game would skip: every field that parses,
 * without the districts and places the map doesn't have, and the whole text as the body.
 */
export function looseEntry(id: string, text: string, ids: MapIds | null): LoreEntry {
  const strict = parseLoreFile(id, text, null);
  const keep = (xs: string[], on: ReadonlySet<string> | undefined) => (on ? xs.filter((x) => on.has(x)) : xs);
  if (strict.ok) return { ...strict.entry, districts: keep(strict.entry.districts, ids?.districts), places: keep(strict.entry.places, ids?.places) };
  const s = splitFrontMatter(text);
  if ('field' in s) return { id, title: id, keys: [], districts: [], places: [], always: false, body: text.trim() };
  const f = s.front;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []);
  const category = str(f.category);
  const section = str(f.section);
  const only = LORE_ONLY.find((o) => o === f.only);
  return {
    id,
    title: str(f.title) ?? id,
    ...(category ? { category } : {}),
    ...(section ? { section } : {}),
    ...(only ? { only } : {}),
    keys: strs(f.keys),
    districts: keep(strs(f.districts), ids?.districts),
    places: keep(strs(f.places), ids?.places),
    always: f.always === true,
    body: s.body,
  };
}

export function loreFile(e: LoreEntry): string {
  const lines = [`title: ${yamlScalar(e.title)}`];
  if (e.category !== undefined) lines.push(`category: ${yamlScalar(e.category)}`);
  if (e.section !== undefined) lines.push(`section: ${yamlScalar(e.section)}`);
  if (e.only !== undefined) lines.push(`only: ${e.only}`);
  lines.push(`keys: ${list(e.keys)}`, `districts: ${list(e.districts)}`, `places: ${list(e.places)}`, `always: ${e.always}`);
  return `---\n${lines.join('\n')}\n---\n${e.body}\n`;
}

/** An id for a title: lowercase words joined by dashes, at most 40, made unique against `taken` with -2, -3… */
export function loreId(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, LORE_ID_MAX)
      .replace(/-+$/, '') || 'entry';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const id = `${base.slice(0, LORE_ID_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(id)) return id;
  }
}

export const categoryId = (name: string): string => loreId(name, new Set());

/** A title or id as compared for repeats: lowercase letters and digits only ("Hae's Noodles" = `haes-noodles`). */
const bareName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The existing entry a pasted draft may rewrite; null when it's new. By `name`: the same title or
 * id (ignoring case and punctuation), most likely a rewrite. By `place`: only the same single place,
 * which may be a rewrite or another entry about that place (a faction based there).
 */
export function findRepeat(
  draft: { title: string; places: readonly string[] },
  book: ReadonlyArray<{ id: string; title: string; places: readonly string[] }>,
): { id: string; by: 'name' | 'place' } | null {
  const name = bareName(draft.title);
  if (name) {
    const same = book.find((e) => bareName(e.title) === name || bareName(e.id) === name);
    if (same) return { id: same.id, by: 'name' };
  }
  if (draft.places.length === 1) {
    const place = draft.places[0];
    const here = book.find((e) => e.places.length === 1 && e.places[0] === place);
    if (here) return { id: here.id, by: 'place' };
  }
  return null;
}

export function parseCategoryFile(id: string, text: string): { ok: true; category: LoreCategory } | { ok: false; problems: LoreProblem[] } {
  const problems = idProblems(id);
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [...problems, s] };
  const parsed = categorySchema.safeParse(s.front);
  if (!parsed.success) problems.push(...zodProblems(parsed.error));
  if (s.body.length === 0) problems.push({ field: 'template', message: 'needs some text' });
  if (s.body.length > LORE_TEMPLATE_MAX) problems.push({ field: 'template', message: `at most ${LORE_TEMPLATE_MAX} characters (this is ${s.body.length})` });
  if (!parsed.success || problems.length > 0) return { ok: false, problems };
  return { ok: true, category: { id, category: parsed.data.category, template: s.body } };
}

export function categoryFile(c: LoreCategory): string {
  return `---\ncategory: ${yamlScalar(c.category)}\n---\n${c.template}\n`;
}

/** The `[lore: …]` block's first line. */
export const LORE_HEADER = "[lore: what everyone in Lowlight knows. Use it when it fits; don't recite it]";

/** The map's place for a room's scene, and that place's district (nulls when the room isn't on the map). */
export function locate(map: CityMapData | null, sceneId: string): { placeId: string | null; districtId: string | null } {
  const place = map?.places.find((p) => p.scene === sceneId);
  return place ? { placeId: place.id, districtId: place.district } : { placeId: null, districtId: null };
}

export interface LorePick {
  /** The entry as sent: a short pick's body is its first two sentences. */
  entry: LoreEntry;
  /** 'gig': forced in by a finished run (Papers spec §4.2). */
  why: 'always' | 'gig' | 'place' | 'district' | 'key';
  /** The key that matched (`why: 'key'`). */
  key?: string;
  /** How it ranked (lore picking spec §4); always entries have none. */
  score?: number;
  /** Whole, or its first two sentences (spec §5); absent is whole. */
  size?: 'full' | 'short';
}
/** A line the lore reads, and who wrote it: `you` (the player, the turn's text) or `them` (the contact, anyone else). */
export interface LoreLine {
  text: string;
  by: 'you' | 'them';
}
/** A plain string reads as yours. */
export type RecentLine = string | LoreLine;
const asLine = (l: RecentLine): LoreLine => (typeof l === 'string' ? { text: l, by: 'you' } : l);
export interface LoreSelection {
  picks: LorePick[];
  dropped: LoreEntry[];
  /** The block's length, header included (0 with no picks). */
  chars: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Curly apostrophes (which models often write) read as the plain one, in keys and in text alike. */
const plainQuotes = (s: string) => s.replace(/[\u2018\u2019\u02BC]/g, "'");
/** A key as a case-insensitive, whole-word pattern: no letter or digit right before or after it. */
const keyPattern = (key: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(plainQuotes(key.trim())).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');

/** Whether any of `keys` appears in `text` as whole words, any case (lore's and leads' rule). */
export function mentionsKeys(text: string, keys: readonly string[]): boolean {
  return keys.some((k) => keyPattern(k).test(text));
}

/**
 * A lore key in a line (lore picking spec §1): whole words, plain quotes, any spacing. `strict` (her lines): the key's
 * capitalised words keep their capitals, its lowercase words match any case, and a leading "the" matches either case.
 * Not strict (your lines): any case, as `mentionsKeys`.
 */
export function loreKeyMatches(key: string, text: string, strict: boolean): boolean {
  return lorePattern(key, strict).test(plainQuotes(text));
}
const lorePatterns = new Map<string, RegExp>();
function lorePattern(key: string, strict: boolean): RegExp {
  const plain = plainQuotes(key.trim());
  if (!strict || plain === plain.toLowerCase()) return keyPattern(key);
  const id = `${plain}\u0000strict`;
  let re = lorePatterns.get(id);
  if (!re) {
    const anyCase = (w: string) => [...w].map((c) => (c.toLowerCase() !== c.toUpperCase() ? `[${c.toLowerCase()}${c.toUpperCase()}]` : escapeRe(c))).join('');
    const words = plain.split(/\s+/).map((w, i) => (w === w.toLowerCase() || (i === 0 && /^the$/i.test(w)) ? anyCase(w) : escapeRe(w)));
    re = new RegExp(`(?<![\\p{L}\\p{N}])${words.join('\\s+')}(?![\\p{L}\\p{N}])`, 'u');
    lorePatterns.set(id, re);
  }
  return re;
}

/** Whether any of the entry's keys appears in `text`, by the same rule as selectLore (whole words, any case). */
export function loreMentions(text: string, entry: LoreEntry): boolean {
  return mentionsKeys(text, entry.keys);
}

const byTitle = (a: Pick<LoreEntry, 'id' | 'title'>, b: Pick<LoreEntry, 'id' | 'title'>) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
/** One entry's lines in the block; a line starting with `[` gets a space, so lore never passes as a control line. */
const entryText = (e: LoreEntry) => `${e.title}: ${e.body}`.split('\n').map((l, i) => (i > 0 && l.startsWith('[') ? ` ${l}` : l)).join('\n');
const defuseFirst = (e: LoreEntry) => (e.body.startsWith('[') ? { ...e, body: ` ${e.body}` } : e);

export function loreBlock(entries: LoreEntry[]): string | null {
  if (entries.length === 0) return null;
  return [LORE_HEADER, ...entries.map((e) => entryText(defuseFirst(e)))].join('\n');
}

/** Lore picking spec §4: what each way in scores, and the score from which an entry goes in whole. */
export const LORE_SCORE = { gig: 100, place: 90, yourNewest: 80, yourOlder: 60, olderStep: 10, olderFloor: 10, herNewest: 50, district: 20, full: 45 } as const;
/** A key of one lowercase word (`deck`, `paste`) counts for this much of its route (spec §4). */
export const LORE_COMMON_WORD = 0.6;

/** A key's weight: whole for a phrase or a name, less for one common word. */
const keyWeight = (key: string) => (/\s/.test(key.trim()) || /\p{Lu}/u.test(key) ? 1 : LORE_COMMON_WORD);

/**
 * The first `n` sentences of `text`, from its start: a sentence ends at . ! or ? (and any closing quote or bracket)
 * followed by a space and a capital, a digit or an opening quote, or at the end. "P.I. is", "3.5 creds" and
 * "U.S." mid-sentence don't end one.
 */
export function leadSentences(text: string, n: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const end = /[.!?]+["'\u201D\u2019)\]]*(?= ["'\u201C\u2018(\[]?[\p{Lu}\p{N}])/gu;
  let cut = flat.length;
  let found = 0;
  for (let m = end.exec(flat); m; m = end.exec(flat)) {
    if (++found === n) {
      cut = m.index + m[0].length;
      break;
    }
  }
  return flat.slice(0, cut).trim();
}

/** An entry's first two sentences (spec §5), or null when that's all of it. */
export function loreShort(body: string): string | null {
  const flat = body.replace(/\s+/g, ' ').trim();
  const two = leadSentences(flat, 2);
  return two !== '' && two.length < flat.length ? two : null;
}

/**
 * The entries for a turn (lore picking spec 2026-11-07). Always entries first, whole. Then every other way in is
 * scored: a finished gig's entries, the room's place, keys in your lines (newest highest), a key in her newest line
 * (her older lines don't count), the room's district; a one-word lowercase key counts less, and a key that is only
 * the name of someone present is no way in. Highest first: whole from LORE_SCORE.full, else its first two sentences;
 * a whole one that won't fit goes short, and a short one that won't fit is dropped. Book-only entries are never read.
 * `recent` is newest first; a plain string is your line. In her lines a capitalised key must keep its capitals.
 */
export function selectLore(
  whole: LoreEntry[],
  at: { placeId: string | null; districtId: string | null; recent: readonly RecentLine[]; force?: readonly string[]; present?: readonly string[] },
): LoreSelection {
  const book = whole.filter((e) => e.only !== 'book');
  const lines = at.recent.slice(0, LORE_WINDOW + 1).map(asLine);
  const names = new Set((at.present ?? []).flatMap((n) => [n, ...n.trim().split(/\s+/)]).map(nameForm));
  const sorted = [...book].sort(byTitle);
  type Cand = { entry: LoreEntry; why: LorePick['why']; key?: string; score: number; at: number };
  const best = new Map<string, Cand>();
  const offer = (c: Cand) => {
    const was = best.get(c.entry.id);
    if (!was || c.score > was.score || (c.score === was.score && c.at < was.at)) best.set(c.entry.id, c);
  };
  for (const id of at.force ?? []) for (const entry of book.filter((e) => e.id === id)) offer({ entry, why: 'gig', score: LORE_SCORE.gig, at: -1 });
  if (at.placeId) for (const entry of sorted.filter((e) => e.places.includes(at.placeId!))) offer({ entry, why: 'place', score: LORE_SCORE.place, at: -1 });
  if (at.districtId) for (const entry of sorted.filter((e) => e.districts.includes(at.districtId!))) offer({ entry, why: 'district', score: LORE_SCORE.district, at: Infinity });
  // Each line's route score: your k-th newest line, her newest only.
  let yours = 0;
  // Her newest reply may come as several lines (a scene split by speaker, as DRAW reads it): the whole first run of
  // theirs counts as her newest; any of theirs after a line of yours is older.
  let herRun: 'before' | 'in' | 'past' = 'before';
  const route = lines.map((l) => {
    if (l.by === 'you') {
      if (herRun === 'in') herRun = 'past';
      const k = yours++;
      return k === 0 ? LORE_SCORE.yourNewest : Math.max(LORE_SCORE.olderFloor, LORE_SCORE.yourOlder - LORE_SCORE.olderStep * (k - 1));
    }
    if (herRun === 'past') return 0;
    herRun = 'in';
    return LORE_SCORE.herNewest;
  });
  for (const entry of sorted) {
    if (entry.always) continue;
    for (const key of entry.keys) {
      if (names.has(nameForm(key))) continue;
      lines.forEach((l, i) => {
        if (route[i] === 0 || !loreKeyMatches(key, l.text, l.by === 'them')) return;
        offer({ entry, why: 'key', key, score: Math.round(route[i] * keyWeight(key)), at: i });
      });
    }
  }
  const ranked = [...best.values()].filter((c) => !c.entry.always).sort((a, b) => b.score - a.score || a.at - b.at || byTitle(a.entry, b.entry));

  const picks: LorePick[] = [];
  const dropped: LoreEntry[] = [];
  let chars = 0;
  const fits = (e: LoreEntry) => {
    const len = entryText(defuseFirst(e)).length;
    const next = chars === 0 ? LORE_HEADER.length + 1 + len : chars + 1 + len;
    return next <= LORE_BUDGET ? next : null;
  };
  const take = (p: LorePick) => {
    const next = fits(p.entry);
    if (next === null) return false;
    picks.push(p);
    chars = next;
    return true;
  };
  for (const entry of sorted.filter((e) => e.always)) if (!take({ entry, why: 'always', size: 'full' })) dropped.push(entry);
  for (const c of ranked) {
    const short = loreShort(c.entry.body);
    const base = { why: c.why, ...(c.key !== undefined ? { key: c.key } : {}), score: c.score };
    const shortPick: LorePick | null = short ? { ...base, entry: { ...c.entry, body: short }, size: 'short' } : null;
    const placed = c.score >= LORE_SCORE.full || !shortPick ? take({ ...base, entry: c.entry, size: 'full' }) || (shortPick !== null && take(shortPick)) : take(shortPick);
    if (!placed) dropped.push(c.entry);
  }
  return { picks, dropped, chars };
}

/** The dev log's line for a turn's lore. */
export function loreLogLine(sel: LoreSelection): string {
  if (sel.picks.length === 0 && sel.dropped.length === 0) return 'lore: none';
  const head = `lore: ${sel.picks.map((p) => `${p.entry.id}${p.size === 'short' ? '~' : ''}`).join(', ') || 'none'} (${sel.picks.length} · ${sel.chars.toLocaleString('en-US')} chars)`;
  return sel.dropped.length > 0 ? `${head} · dropped: ${sel.dropped.map((e) => e.id).join(', ')}` : head;
}

/** COPY FOR OPUS's first line: how a model must answer for IMPORT to read it. */
export const LORE_DRAFT_INSTRUCTION =
  'Write lore entries for Lowlight, a cyberpunk city, in exactly this format. Use only the district and place ids listed below. Plain text only, no Markdown in the body. One entry per --- block. Put all the entries inside one ``` code block, with nothing outside it.';

/** The prompt COPY FOR OPUS puts on the clipboard: format, an example, the category's template, the map's ids, the setting's facts and the category's titles. */
export function loreDraftPrompt(o: { book: LoreEntry[]; map: CityMapData | null; category: string; template: string | null; rooms?: Readonly<Record<string, string>> }): string {
  const inCategory = o.book.filter((e) => e.category === o.category).sort((a, b) => a.title.localeCompare(b.title));
  const shape = inCategory.find((e) => !e.only) ?? inCategory[0];
  const example = shape
    ? loreFile(shape).trim()
    : ['---', 'title: <Title>', `category: ${o.category}`, 'keys: [<key>, <another key>]', 'districts: []', 'places: []', 'always: false', '---', '<One to three short paragraphs, plain text.>'].join('\n');
  const parts = [
    LORE_DRAFT_INSTRUCTION,
    [
      `Format: title at most ${LORE_TITLE_MAX} characters; category at most ${LORE_CATEGORY_MAX}; up to ${LORE_KEYS_MAX} keys, each ${LORE_KEY_MIN}–${LORE_KEY_MAX} characters (words or short phrases people would say); body plain text, at most ${LORE_BODY_MAX.toLocaleString('en-US')} characters. Each entry needs keys, a district, a place, or always: true. Use category: ${o.category}. Example:`,
      example,
    ].join('\n'),
  ];
  const sections = [...new Set(inCategory.flatMap((e) => e.section ?? []))].sort((a, b) => a.localeCompare(b));
  if (sections.length > 0) parts.push(`Give each entry a section line, after category: ${sections.join(', ')}.`);
  if (o.template) parts.push(`Template for ${o.category} entries (what each should cover):\n${o.template}`);
  if (o.map) {
    parts.push(`Districts (id — name (area)):\n${o.map.districts.map((d) => `${d.id} — ${d.name}${d.area ? ` (${d.area})` : ''}`).join('\n')}`);
    parts.push(`Places (id — name (district)):\n${o.map.places.map((p) => `${p.id} — ${p.name} (${p.district})`).join('\n')}`);
    // What each place's room shows (its art): new lore must fit what players see there.
    const looks = o.map.places.filter((p) => o.rooms?.[p.id]).map((p) => `${p.id} — ${p.name}: ${o.rooms![p.id]}`);
    if (looks.length > 0) parts.push(`What each place's room looks like (the art players see; write to fit it):\n${looks.join('\n')}`);
  }
  const always = o.book.filter((e) => e.always);
  if (always.length > 0) parts.push(`Setting facts everyone knows:\n${always.map((e) => `${e.title}: ${e.body}`).join('\n')}`);
  if (inCategory.length > 0) {
    parts.push(`Existing ${o.category} entries (these are true; don't contradict or repeat them):\n${inCategory.map((e) => `${e.title}: ${e.body}`).join('\n')}`);
  }
  parts.push('Request: <your request>');
  parts.push('Answer with only one ``` code block holding the entries as --- blocks in the format above. No headings, no lists, and no text outside the block.');
  return `${parts.join('\n\n')}\n`;
}

const FRONT_LINE = /^[A-Za-z_][\w-]*\s*:/;

/** The entries in a pasted model answer: each `---` front matter `---` plus its body. Prose and code fences around them are ignored. */
export function splitDrafts(text: string): string[] {
  let lines = text.replace(/\r\n?/g, '\n').split('\n');
  // In a fenced answer, only what's inside the fences counts.
  if (lines.some((l) => l.trim().startsWith('```'))) {
    const inside: string[] = [];
    let open = false;
    for (const l of lines) {
      if (l.trim().startsWith('```')) open = !open;
      else if (open) inside.push(l);
    }
    lines = inside;
  }
  const opensAt = (i: number) => lines[i]?.trim() === '---' && FRONT_LINE.test(lines[i + 1] ?? '');
  if (!lines.some((_, i) => opensAt(i))) return headingDrafts(lines);
  const drafts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!opensAt(i)) {
      i++;
      continue;
    }
    let close = i + 1;
    while (close < lines.length && lines[close].trim() !== '---') close++;
    if (close >= lines.length) break;
    let end = close + 1;
    while (end < lines.length && !opensAt(end)) end++;
    drafts.push(`---\n${lines.slice(i + 1, close).join('\n')}\n---\n${lines.slice(close + 1, end).join('\n').trim()}\n`);
    i = end;
  }
  return drafts;
}

/** A heading line: `## Title`, `**Title**`, `**1. Title**`, `1. **Title**`. Its title, without numbering or markup. */
function headingTitle(line: string): string | null {
  const m = /^\s*(?:#{1,6}\s+(.+?)|\*\*(.+?)\*\*|\d+[.)]\s+\*\*(.+?)\*\*)\s*:?\s*$/.exec(line);
  const raw = m ? (m[1] ?? m[2] ?? m[3]) : null;
  return raw ? raw.replace(/\*\*/g, '').replace(/^\d+[.)]\s*/, '').trim() || null : null;
}
const FIELD_LINE = /^\s*\**\s*(places?|districts?|keys?|category|section|only|always)\s*\**\s*:\s*\**\s*(.*?)\s*$/i;

/** A model's answer in headings ("**1. Title**", then "Place: …", "Keys: …" lines, then the text), turned into --- drafts. */
function headingDrafts(lines: string[]): string[] {
  const drafts: string[] = [];
  const q = (s: string) => JSON.stringify(s);
  const list = (s: string) => `[${s.split(',').map((x) => x.trim()).filter(Boolean).map(q).join(', ')}]`;
  let i = 0;
  while (i < lines.length) {
    const title = headingTitle(lines[i]);
    if (!title) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < lines.length && !headingTitle(lines[end])) end++;
    const front = [`title: ${q(title)}`];
    const body: string[] = [];
    for (const l of lines.slice(i + 1, end)) {
      const f = FIELD_LINE.exec(l);
      if (f && body.every((b) => b.trim() === '')) {
        const key = f[1].toLowerCase();
        if (key.startsWith('place')) front.push(`places: ${list(f[2])}`);
        else if (key.startsWith('district')) front.push(`districts: ${list(f[2])}`);
        else if (key.startsWith('key')) front.push(`keys: ${list(f[2])}`);
        else if (key === 'category') front.push(`category: ${q(f[2])}`);
        else if (key === 'section') front.push(`section: ${q(f[2])}`);
        else if (key === 'only') front.push(`only: ${q(f[2].toLowerCase())}`);
        else front.push(`always: ${/^(yes|true)$/i.test(f[2])}`);
      } else body.push(l);
    }
    drafts.push(`---\n${front.join('\n')}\n---\n${body.join('\n').trim()}\n`);
    i = end;
  }
  return drafts;
}

/** One pasted draft, checked like a saved entry: its id from its title (unique against `taken`), and the existing entry's title when that id was taken. */
export function parseDraft(
  text: string,
  o: { taken: ReadonlySet<string>; titles: ReadonlyMap<string, string>; ids: MapIds | null; category?: string },
): { id: string; clash: string | null; result: ReturnType<typeof parseLoreFile>; loose: LoreEntry } {
  const s = splitFrontMatter(text);
  const title = 'field' in s || typeof s.front.title !== 'string' ? '' : s.front.title;
  const base = loreId(title, new Set());
  const id = loreId(title, o.taken);
  const clash = o.taken.has(base) ? (o.titles.get(base) ?? base) : null;
  // A draft without a category takes the one IMPORT was opened from.
  const withCategory = !('field' in s) && s.front.category === undefined && o.category ? text.replace(/^---\r?\n/, `---\ncategory: ${yamlScalar(o.category)}\n`) : text;
  return { id, clash, result: parseLoreFile(id, withCategory, o.ids), loose: looseEntry(id, withCategory, o.ids) };
}

/** A lore word's hover card (feedback 2026-10-19): the entry's title and keys, and its first two sentences. */
export interface GlossaryEntry {
  id: string;
  title: string;
  keys: string[];
  text: string;
}

const STREET = '-on-the-street';
/** Keys shorter than this aren't marked (too many false hits in ordinary prose). */
export const GLOSSARY_KEY_MIN = 4;
const GLOSSARY_TEXT_MAX = 240;

/** The first two sentences of `body`, cut at a word with an ellipsis past GLOSSARY_TEXT_MAX. */
function firstSentences(body: string): string {
  const two = leadSentences(body, 2);
  if (two.length <= GLOSSARY_TEXT_MAX) return two;
  const cut = two.slice(0, GLOSSARY_TEXT_MAX);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}

/** What the player can read: everything but the model's own entries. */
const playerSide = (book: readonly LoreEntry[]) => book.filter((e) => e.only !== 'model');

/**
 * Every lore entry the player reads, as a hover card. An entry with an on-the-street twin shows the
 * twin's words (what anyone in Lowlight knows), so insider lore never spoils; the twin's keys mark it
 * too. A key on a book-only entry is that entry's alone: "carts" opens the word, not Cortex.
 */
export function loreGlossary(whole: readonly LoreEntry[]): GlossaryEntry[] {
  const book = playerSide(whole);
  const byId = new Map(book.map((e) => [e.id, e]));
  const taken = new Set(book.filter((e) => e.only === 'book').flatMap((e) => e.keys.map((k) => k.toLowerCase())));
  return book
    .filter((e) => !(e.id.endsWith(STREET) && byId.has(e.id.slice(0, -STREET.length))))
    .map((e) => {
      const street = byId.get(`${e.id}${STREET}`);
      const keys = [...new Set([...e.keys, ...(street?.keys ?? [])])].filter((k) => k.trim().length >= GLOSSARY_KEY_MIN && (e.only === 'book' || !taken.has(k.toLowerCase())));
      return { id: e.id, title: e.title, keys, text: firstSentences((street ?? e).body) };
    })
    .filter((g) => g.keys.length > 0 && g.text !== '')
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The lines of chat the drawer reads, as selectLore reads LORE_WINDOW + 1. */
export const BOOK_LINES = 5;

/** An entry as the player reads it (lore drawer spec §5): the main entry's words then its street twin's, under the main title, on both entries' keys. */
export interface BookEntry {
  id: string;
  title: string;
  category: string | null;
  section: string | null;
  keys: string[];
  places: string[];
  districts: string[];
  always: boolean;
  body: string;
  /** A picture at the top of the open entry, served at /api/lore/art/<id> (world/lore/<id>.webp): a corp's logo. */
  art?: true;
}
/** GET /api/lore/book: the player's book, and each room's place and district. */
export interface BookPage {
  entries: BookEntry[];
  rooms: Record<string, { placeId: string | null; districtId: string | null }>;
}
export interface BookHit {
  entry: BookEntry;
  key: string;
}
/** What the conversation has touched: the drawer's three groups (spec §2) and the bar's count (§4). */
export interface BookNow {
  said: BookHit[];
  who: BookHit[];
  here: BookEntry[];
  count: number;
}

/** The book for the player, without the model's own entries. Unlike loreGlossary, short keys stay and a street twin's main entry is shown too: it says what the thing is. */
export function bookEntries(whole: readonly LoreEntry[]): BookEntry[] {
  const book = playerSide(whole);
  const byId = new Map(book.map((e) => [e.id, e]));
  return book
    .filter((e) => !(e.id.endsWith(STREET) && byId.has(e.id.slice(0, -STREET.length))))
    .map((e) => {
      const street = byId.get(`${e.id}${STREET}`);
      const both = (pick: (x: LoreEntry) => string[]) => [...new Set([...pick(e), ...(street ? pick(street) : [])])];
      return {
        id: e.id,
        title: e.title,
        category: e.category ?? null,
        section: e.section ?? null,
        keys: both((x) => x.keys),
        places: both((x) => x.places),
        districts: both((x) => x.districts),
        always: e.always,
        body: street ? `${e.body}\n\n${street.body}` : e.body,
      };
    });
}

/** A key or a name, compared: any case, curly quotes plain, no possessive. */
const nameForm = (s: string) => plainQuotes(s.trim()).toLowerCase().replace(/'s$/, '');

/**
 * What the conversation touches right now. `lines` is newest first (a plain string is yours); the draft reads as newer
 * still, and is yours. In her lines a capitalised key must keep its capitals (lore picking spec §1). Each entry
 * lands in one place, room first: an entry of this room is `here`, one that matched only on the name of someone
 * present is `who`, any other match is `said`, the count's rows. `always` entries are in none of them.
 */
export function bookNow(entries: readonly BookEntry[], at: { lines: readonly RecentLine[]; draft: string; placeId: string | null; districtId: string | null; present: readonly string[] }): BookNow {
  const texts: LoreLine[] = [{ text: at.draft, by: 'you' }, ...at.lines.slice(0, BOOK_LINES).map(asLine)];
  const names = new Set(at.present.flatMap((n) => [n, ...n.trim().split(/\s+/)]).map(nameForm));
  const newest = (keys: readonly string[]): { at: number; key: string } | null => {
    let best: { at: number; key: string } | null = null;
    for (const key of keys) {
      const i = texts.findIndex((t) => t.text !== '' && loreKeyMatches(key, t.text, t.by === 'them'));
      if (i >= 0 && (best === null || i < best.at)) best = { at: i, key };
    }
    return best;
  };
  const place: BookEntry[] = [];
  const district: BookEntry[] = [];
  const said: (BookHit & { at: number })[] = [];
  const who: BookHit[] = [];
  for (const entry of entries) {
    if (entry.always) continue;
    if (at.placeId !== null && entry.places.includes(at.placeId)) place.push(entry);
    else if (at.districtId !== null && entry.districts.includes(at.districtId)) district.push(entry);
    else {
      const other = newest(entry.keys.filter((k) => !names.has(nameForm(k))));
      const name = other ? null : newest(entry.keys.filter((k) => names.has(nameForm(k))));
      if (other) said.push({ entry, ...other });
      else if (name) who.push({ entry, key: name.key });
    }
  }
  said.sort((a, b) => a.at - b.at || byTitle(a.entry, b.entry));
  return {
    said: said.map(({ entry, key }) => ({ entry, key })),
    who: who.sort((a, b) => byTitle(a.entry, b.entry)),
    here: [...place.sort(byTitle), ...district.sort(byTitle)],
    count: said.length,
  };
}

/** The book's search (spec §3): plain text, any case, title hits first, then keys, then bodies; a blank query finds nothing. */
export function searchBook(entries: readonly BookEntry[], query: string): BookEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const rank = (e: BookEntry) => (e.title.toLowerCase().includes(q) ? 0 : e.keys.some((k) => k.toLowerCase().includes(q)) ? 1 : e.body.toLowerCase().includes(q) ? 2 : 3);
  return entries
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter((h) => h.rank < 3)
    .sort((a, b) => a.rank - b.rank || byTitle(a.entry, b.entry))
    .map((h) => h.entry);
}
