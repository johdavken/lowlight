import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_STATS, parseStats, type Stats } from '../../shared/stats';
import { DEFAULT_SETTINGS, type DiceSettings } from '../../shared/dice/opponent';
import { blocksOverlap, parseDays, parseHhmm, type Block } from '../../shared/clock';
import type { Crop } from '../../shared/types';
import { WEARS_MAX, capAtWordBoundary } from '../../shared/persona';
import { oneLine } from './persona';
import { parseStandingConfig, STANDING, type StandingConfig, type StandingValues } from '../../shared/standing';

/** A character folder's id (and a roster id). */
export const AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** A tie's line (knows), as she reads it: at most this many characters. */
export const TIE_MAX = 600;

const unit = () => z.number().min(0).max(1);

/** A sprite file plus the band of it the stage shows (default: head to waist). */
export const spriteSchema = z.object({
  src: z.string().min(1),
  crop: z
    .object({ top: unit(), bottom: unit() })
    .refine((c) => c.top < c.bottom, { message: 'sprite crop must have 0 ≤ top < bottom ≤ 1' })
    .optional(),
  // Checked on its own (resolveSprite), so a bad height costs only the height, not the sprite.
  height: z.unknown().optional(),
  // Studio's SNAP: the art is on the cast's pixel grid, so the game draws it with hard pixels.
  pixel: z.unknown().optional(),
});
export const DEFAULT_CROP = { top: 0, bottom: 0.5 };
/** How tall she stands on stage, as a share of the full figure height (the tallest are 1). */
export const SPRITE_HEIGHT_MIN = 0.5;

/** `characters/<id>/character.json`: who she is, how she looks, and (with a backend) the model she runs on. */
const characterSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  /** She, he or they (spec 2026-10-12 character pronouns); unset reads as the character she extends, else they. */
  pronoun: z.enum(['she', 'he', 'they']).optional(),
  accent: z.string().min(1).optional(),
  portrait: z.string().min(1).optional(),
  /** Where she belongs on the select screen: a district id. Absent: her first room's district. */
  group: z.string().regex(AGENT_ID_RE).optional(),
  /** Her rooms (`<district>/<folder>`), in order; the first is where she starts. */
  rooms: z.array(z.string().min(1)).optional(),
  /** Before rooms: one district, read as all of its rooms (with a warning). */
  scenePack: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
  ooc: z.string().min(1).optional(),
  /** The face she shows when locked in at character select: one of her expressions, or `neutral`. Unset: `happy` if she has it. */
  selectExpression: z.string().min(1).optional(),
  /** `fixed`: a place's resident (see residents.ts), never in the roster or at character select. Default: a contact. */
  kind: z.enum(['contact', 'fixed']).optional(),
  /** A fixed character's voice sheet: a file in her folder, read into the contact's prompt at her place. */
  voice: z.string().min(1).optional(),
  // Checked on its own (resolveSprite), so a bad sprite costs only the sprite, not the whole file.
  sprite: z.unknown().optional(),
  // Checked on its own (resolveExpressions), so a bad entry costs only that expression.
  expressions: z.unknown().optional(),
  // Checked on their own (resolveOutfits, resolveOutfitByScene, resolveOutfitWears), so a bad entry costs only that entry.
  outfits: z.unknown().optional(),
  outfitByScene: z.unknown().optional(),
  outfitWears: z.unknown().optional(),
  // The following four are checked on their own (resolveProfile), so a bad value costs only that field.
  tagline: z.unknown().optional(),
  bio: z.unknown().optional(),
  facts: z.unknown().optional(),
  face: z.unknown().optional(),
  /** Stats (missions spec §1): six whole numbers 1–10 (statsOf), checked on their own. */
  stats: z.unknown().optional(),
  /** The deck she starts with: an id in world/gear/decks.md (deckOf), checked on its own. */
  deck: z.unknown().optional(),
  /** Liar's dice play settings (diceSettings): checked on their own, so a bad value costs only that value. */
  dice: z.unknown().optional(),
  /** Contacts this character knows from his background (resolveKnows): checked on their own, so a bad entry costs only that entry. */
  knows: z.unknown().optional(),
  /** Standing (spec 2026-10-13): her start, want, secret and words (parseStandingConfig), checked on their own. */
  standing: z.unknown().optional(),
  /** Photos she can send by text (photos spec §1, resolvePhotos): checked entry by entry. */
  photos: z.unknown().optional(),
  /** Where she is through the day (resolveSchedule): checked block by block. */
  schedule: z.unknown().optional(),
  /** Another character folder whose look and room come along (one level). */
  extends: z.string().min(1).optional(),
  /** A direct character's personality: a file in her folder (identity.md). */
  identity: z.string().min(1).optional(),
  /** Present → a direct character: she runs on this model. */
  backend: z
    .object({
      provider: z.enum(['openrouter', 'openai-compatible']),
      model: z.string().min(1),
      baseUrl: z.string().url().optional(),
      keyName: z.string().min(1).optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(4000).optional(),
    })
    .refine((b) => b.provider !== 'openai-compatible' || b.baseUrl !== undefined, { message: 'baseUrl is required for openai-compatible', path: ['baseUrl'] })
    .optional(),
});
export type Character = z.infer<typeof characterSchema>;

/** Reads a character file; null when absent. Throws a readable error when it's malformed. */
export function loadCharacter(dir: string): Character | null {
  const file = path.join(dir, 'character.json');
  if (!fs.existsSync(file)) return null;
  const parsed = characterSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return parsed.data;
}

/**
 * A `sprite` entry from a character or persona file, validated and confined to `dir`. Anything
 * wrong (bad shape, bad crop, missing or escaping file) warns once and gives null, so the stage
 * falls back while the rest of the file still loads.
 */
/** Her stats (missions spec §1): bad or missing ones warn (bad only) and play at 3s. */
export function statsOf(c: Pick<Character, 'stats'> | null, warn: (m: string) => void): Stats {
  if (c?.stats === undefined) return { ...DEFAULT_STATS };
  const s = parseStats(c.stats);
  if (s) return s;
  warn('stats: needs body, reflex, tech, cool, wits and edge, each a whole number 1–10; she plays at 3s');
  return { ...DEFAULT_STATS };
}

/** Her starting deck: a catalog id (any id when no catalog is given); null when none, or (with a warning) unknown. */
export function deckOf(c: Pick<Character, 'deck'> | null, decks: ReadonlySet<string> | undefined, warn: (m: string) => void): string | null {
  const d = c?.deck;
  if (d === undefined || d === null) return null;
  if (typeof d === 'string' && (!decks || decks.has(d))) return d;
  warn(`deck: '${String(d)}' isn't in world/gear/decks.md; she starts with none`);
  return null;
}

/** Her liar's dice settings (spec §2): each 0..1, clamped; a missing or bad value takes the default. */
export function diceSettings(c: Pick<Character, 'dice'> | null): DiceSettings {
  const raw = (c?.dice ?? {}) as Record<string, unknown>;
  const pick = (k: keyof DiceSettings) => {
    const v = raw && typeof raw === 'object' ? raw[k] : undefined;
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SETTINGS[k];
  };
  return { bluff: pick('bluff'), nerve: pick('nerve'), suspicion: pick('suspicion') };
}

/**
 * Who a player character knows from his background (ties, spec 2026-10-10): roster id → a line
 * written from her side. Each entry is checked on its own; a bad one warns and is dropped.
 */
export function resolveKnows(raw: unknown, selfId: string, warn: (m: string) => void): Record<string, string> {
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn('knows: must be an object of contact id → line; ignored');
    return {};
  }
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(raw)) {
    // A line, or `{ line, trust?, warmth? }` (a tie with a standing start, resolveKnowsStarts).
    const line = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as { line?: unknown }).line : v;
    const text = typeof line === 'string' ? line.trim() : null;
    if (!AGENT_ID_RE.test(id)) warn(`knows.${id}: not a character id; dropped`);
    else if (id === selfId) warn(`knows.${id}: a character can't know himself; dropped`);
    else if (text === null || text.length === 0) warn(`knows.${id}: needs a line; dropped`);
    else if (text.length > TIE_MAX) warn(`knows.${id}: longer than ${TIE_MAX} characters; dropped`);
    else out[id] = text;
  }
  return out;
}

/**
 * The standing starts on a player character's ties (spec 2026-10-13 §7): roster id → the start
 * values its object entry gives. A bad number warns and is dropped; string entries give none.
 */
export function resolveKnowsStarts(raw: unknown, selfId: string, warn: (m: string) => void): Record<string, Partial<StandingValues>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, Partial<StandingValues>> = {};
  for (const [id, v] of Object.entries(raw)) {
    if (!AGENT_ID_RE.test(id) || id === selfId || typeof v !== 'object' || v === null || Array.isArray(v)) continue;
    const start: Partial<StandingValues> = {};
    for (const k of ['trust', 'warmth'] as const) {
      const n = (v as Record<string, unknown>)[k];
      if (n === undefined) continue;
      if (typeof n === 'number' && Number.isInteger(n) && n >= STANDING.min && n <= STANDING.max) start[k] = n;
      else warn(`knows.${id}.${k}: must be a whole number from ${STANDING.min} to ${STANDING.max}; dropped`);
    }
    if (Object.keys(start).length > 0) out[id] = start;
  }
  return out;
}

/** `resolveKnows` of the character file in `dir`; none when there's no file, or (with a warning) a bad one. */
export function characterKnows(dir: string, selfId: string, warn: (m: string) => void): Record<string, string> {
  let c: Character | null;
  try {
    c = loadCharacter(dir);
  } catch (err) {
    warn(`knows: ${err instanceof Error ? err.message : String(err)}`);
    return {};
  }
  return resolveKnows(c?.knows, selfId, warn);
}

/**
 * `read(<charactersDir>/<id>)` per character, done again only when her character.json changes on
 * disk (the world asks on every contacts read and every turn). An id that isn't one gets `none`.
 */
function cachedByFile<T>(charactersDir: string, none: T, read: (dir: string, id: string) => T): (id: string) => T {
  const cache = new Map<string, { stamp: string; value: T }>();
  return (id) => {
    if (!AGENT_ID_RE.test(id)) return none;
    const dir = path.join(charactersDir, id);
    let stamp = 'none';
    try {
      const st = fs.statSync(path.join(dir, 'character.json'));
      stamp = `${st.mtimeMs}:${st.size}`;
    } catch {
      // No file: nothing (cached as such until one appears).
    }
    const hit = cache.get(id);
    if (hit && hit.stamp === stamp) return hit.value;
    const value = stamp === 'none' ? none : read(dir, id);
    cache.set(id, { stamp, value });
    return value;
  };
}

/** `characterKnows` of `<charactersDir>/<id>`, cached by file. */
export function knowsReader(charactersDir: string, warn: (m: string) => void): (id: string) => Record<string, string> {
  return cachedByFile(charactersDir, {}, (dir, id) => characterKnows(dir, id, warn));
}

/** `resolveKnowsStarts` of `<charactersDir>/<id>`, cached by file. */
export function knowsStartsReader(charactersDir: string, warn: (m: string) => void): (id: string) => Record<string, Partial<StandingValues>> {
  return cachedByFile(charactersDir, {}, (dir, id) => resolveKnowsStarts(readOrWarn(dir, 'knows', warn)?.knows, id, warn));
}

/** Her `standing` block (parseStandingConfig) from `<charactersDir>/<id>`, cached by file; null without one. */
export function standingConfigReader(charactersDir: string, warn: (m: string) => void): (id: string) => StandingConfig | null {
  return cachedByFile<StandingConfig | null>(charactersDir, null, (dir, id) => parseStandingConfig(readOrWarn(dir, 'standing', warn)?.standing, (m) => warn(`${id}: ${m}`)));
}

/** Her character file, or null (with a warning naming `what` when it's malformed). */
function readOrWarn(dir: string, what: string, warn: (m: string) => void): Character | null {
  try {
    return loadCharacter(dir);
  } catch (err) {
    warn(`${what}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Her day (spec 2026-10-10 schedules): `{ from, to, room, days? }` blocks as minutes of day, `days`
 * the weekdays it runs (spec 2026-10-20 weekdays; none: every day). Each is checked on its own:
 * HH:MM ends, from ≠ to, a room the city has, known days, no overlap with one kept before it on a
 * shared day. A bad one warns and is dropped.
 */
export function resolveSchedule(raw: unknown, hasRoom: (id: string) => boolean, warn: (m: string) => void): Block[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warn('schedule: must be a list of { from, to, room } blocks; ignored');
    return [];
  }
  const kept: Block[] = [];
  raw.forEach((b, i) => {
    const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    const from = typeof o.from === 'string' ? parseHhmm(o.from) : null;
    const to = typeof o.to === 'string' ? parseHhmm(o.to) : null;
    const room = typeof o.room === 'string' ? o.room : null;
    if (from === null || to === null) return warn(`schedule[${i}]: from and to must be HH:MM; dropped`);
    if (from === to) return warn(`schedule[${i}]: starts and ends at the same time; dropped`);
    if (!room || !hasRoom(room)) return warn(`schedule[${i}]: no room '${String(o.room)}'; dropped`);
    const { days, bad } = parseDays(o.days);
    if (bad !== undefined) return warn(`schedule[${i}]: unknown day '${bad}'; dropped`);
    if (days?.length === 0) return warn(`schedule[${i}]: no days; dropped`);
    const block: Block = days ? { from, to, room, days } : { from, to, room };
    if (kept.some((k) => blocksOverlap(k, block))) return warn(`schedule[${i}]: overlaps an earlier block; dropped`);
    kept.push(block);
  });
  return kept;
}

/** `resolveSchedule` of each character's file, cached by file. */
export function scheduleReader(charactersDir: string, hasRoom: (id: string) => boolean, warn: (m: string) => void): (id: string) => Block[] {
  return cachedByFile<Block[]>(charactersDir, [], (dir) => {
    let c: Character | null;
    try {
      c = loadCharacter(dir);
    } catch (err) {
      warn(`schedule: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
    return resolveSchedule(c?.schedule, hasRoom, (m) => warn(`${path.basename(dir)}: ${m}`));
  });
}

export function resolveSprite(dir: string, raw: unknown, warn: (msg: string) => void, fallback: string): { file: string; crop: Crop; height?: number; pixel?: true } | null {
  if (raw === undefined) return null;
  const parsed = spriteSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    warn(`sprite.${issue.path.join('.') || '(root)'}: ${issue.message}; ${fallback}`.replace('sprite.(root)', 'sprite'));
    return null;
  }
  const file = characterFile(dir, parsed.data.src);
  if (!file) {
    warn(`sprite '${parsed.data.src}' is missing or outside its folder; ${fallback}`);
    return null;
  }
  const h = parsed.data.height;
  const height = h === undefined ? undefined : typeof h === 'number' && h >= SPRITE_HEIGHT_MIN && h <= 1 ? h : null;
  if (height === null) warn(`sprite.height must be a number from ${SPRITE_HEIGHT_MIN} to 1; standing her at full height`);
  // Full height (1) is the default and isn't carried.
  return {
    file,
    crop: parsed.data.crop ?? DEFAULT_CROP,
    ...(typeof height === 'number' && height < 1 ? { height } : {}),
    ...(parsed.data.pixel === true ? { pixel: true as const } : {}),
  };
}

const EXPRESSION_NAME_RE = /^[a-z0-9-]{1,24}$/;

/**
 * An `expressions` entry from a character file: name → file, validated and confined to `dir` like
 * `resolveSprite`. Each bad entry (name or file) warns once and is left out; the rest still load.
 * `{}` for `undefined` (no expressions) or anything that isn't a plain object (warns once).
 */
export function resolveExpressions(dir: string, raw: unknown, warn: (msg: string) => void): Record<string, string> {
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn('expressions must be an object of name → file; ignoring them');
    return {};
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!EXPRESSION_NAME_RE.test(name) || name === 'neutral') {
      warn(`expression name '${name}' is invalid; leaving it out`);
      continue;
    }
    const src = typeof value === 'string' ? value : String(value);
    const file = characterFile(dir, src);
    if (!file) {
      warn(`expression '${name}' file '${src}' is missing or outside its folder; leaving it out`);
      continue;
    }
    out[name] = file;
  }
  return out;
}

const isPlainObject = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null && !Array.isArray(raw);

/**
 * An `outfits` entry from a character file: name → file, checked like `resolveExpressions` (same
 * name rule, but `neutral` is allowed). Each bad entry warns once and is left out.
 */
export function resolveOutfits(dir: string, raw: unknown, warn: (msg: string) => void): Record<string, string> {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) {
    warn('outfits must be an object of name → file; ignoring them');
    return {};
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!EXPRESSION_NAME_RE.test(name)) {
      warn(`outfit name '${name}' is invalid; leaving it out`);
      continue;
    }
    const src = typeof value === 'string' ? value : String(value);
    const file = characterFile(dir, src);
    if (!file) {
      warn(`outfit '${name}' file '${src}' is missing or outside its folder; leaving it out`);
      continue;
    }
    out[name] = file;
  }
  return out;
}

/**
 * An `outfitByScene` entry: scene id → outfit name, keeping only entries that name one of the
 * resolved `outfits`. Scene ids aren't checked against the pack (a scene may not exist yet).
 */
export function resolveOutfitByScene(raw: unknown, outfits: Record<string, string>, warn: (msg: string) => void): Record<string, string> {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) {
    warn('outfitByScene must be an object of scene id → outfit name; ignoring it');
    return {};
  }
  const out: Record<string, string> = {};
  for (const [scene, name] of Object.entries(raw)) {
    if (typeof name !== 'string' || !Object.hasOwn(outfits, name)) {
      warn(`outfitByScene '${scene}' names no outfit '${String(name)}'; leaving it out`);
      continue;
    }
    out[scene] = name;
  }
  return out;
}

export { WEARS_MAX };

/**
 * An `outfitWears` entry: outfit name → what she has on in it, one line for her model (outfit wears
 * spec §3). Keeps only lines for resolved `outfits`, on one line and capped at `WEARS_MAX`; a blank line is none.
 */
export function resolveOutfitWears(raw: unknown, outfits: Record<string, string>, warn: (msg: string) => void): Record<string, string> {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) {
    warn('outfitWears must be an object of outfit name → line; ignoring it');
    return {};
  }
  const out: Record<string, string> = {};
  for (const [name, line] of Object.entries(raw)) {
    if (typeof line !== 'string' || !Object.hasOwn(outfits, name)) {
      warn(`outfitWears '${name}' names no outfit or isn't a line; leaving it out`);
      continue;
    }
    const text = capAtWordBoundary(oneLine(line.trim()), WEARS_MAX);
    if (text) out[name] = text;
  }
  return out;
}

/** Resolves a path from a character file inside its folder, or null if it escapes or is absent. */
export function characterFile(dir: string, rel: string): string | null {
  const full = path.resolve(dir, rel);
  const inside = path.relative(path.resolve(dir), full);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return fs.existsSync(full) ? full : null;
}
