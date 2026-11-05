/**
 * The splash library (spec 2026-10-09 splash library §2): world/splash/splashes.json, one entry per
 * image with its own size and logo placement. Studio writes it; the game server reads it.
 */
import { z } from 'zod';
import { loreId } from './lore';

/** The built-in logo's width over its height (the art is 2000×670). */
export const SPLASH_LOGO_ASPECT = 2000 / 670;
/** The built-in logo's id (web/public/lowlight-logo.webp): a splash with no logo id uses it; never stored. */
export const BUILT_IN_LOGO_ID = 'lowlight';
/** The logo's width as the splash draws its group (the prompt sits under it at this scale). */
export const SPLASH_GROUP_LOGO_W = 727;
/** The logo's width, as a share of the image's: at least / at most. */
const LOGO_MIN = 0.15;
const LOGO_MAX = 0.9;
/** A new image's logo, as shares of the image: the seed's spot on the Nix image (67, 117, 727 of 1531×1027). */
const DEFAULT = { x: 0.044, y: 0.114, width: 0.475 };

export interface SplashLogo {
  /** A library logo's id; missing means the built-in. */
  id?: string;
  x: number;
  y: number;
  width: number;
}
export interface SplashEntry {
  id: string;
  name: string;
  file: string;
  width: number;
  height: number;
  on: boolean;
  logo: SplashLogo;
  /** Where the notice sits on this image; missing: defaultPanel. */
  panel?: SplashPanel;
}
/** The notice's box on a splash, in the image's pixels, like the logo. */
export interface SplashPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** The message shown on the splash at launch: one for every splash, placed by each splash's panel. */
export interface SplashNotice {
  on: boolean;
  title: string;
  /** The small line beside the title (PREVIEW 5); may be empty. */
  tag: string;
  /** Plain text, read by parseNotice. */
  text: string;
}
/** A logo's effects (spec 2026-10-11 logo effects §2), in the order Studio lists them. */
export const LOGO_EFFECTS = ['glow', 'fringe', 'scanlines', 'shine', 'glitch', 'pulse', 'hologram', 'power-on'] as const;
export type LogoEffect = (typeof LOGO_EFFECTS)[number];
/** A logo with no effects list (and the built-in) has today's five. */
export const DEFAULT_LOGO_EFFECTS: readonly LogoEffect[] = ['glow', 'fringe', 'scanlines', 'shine', 'glitch'];

/** A logo in the library (spec 2026-10-11 splash logos §2): its file in world/splash/logos/, its size and its effects. */
export interface SplashLogoEntry {
  id: string;
  name: string;
  file: string;
  width: number;
  height: number;
  /** Missing: DEFAULT_LOGO_EFFECTS; empty: none. */
  effects?: LogoEffect[];
  /** Px from the logo's bottom to the prompt's top, the logo drawn 727 wide; missing: as the built-in (tucked under). */
  promptGap?: number;
}

/** A logo's prompt gap, at least / at most. */
export const PROMPT_GAP_MIN = -120;
export const PROMPT_GAP_MAX = 200;

/** A logo's effects with the default applied, in LOGO_EFFECTS order, each once. */
export function logoEffects(entry?: { effects?: readonly LogoEffect[] }): LogoEffect[] {
  const on = entry?.effects ?? DEFAULT_LOGO_EFFECTS;
  return LOGO_EFFECTS.filter((e) => on.includes(e));
}
/**
 * The splash and dial-in's theme (spec 2026-10-12 menu theme): a song in a pack's `_music/`, or a
 * menu-only song in world/splash/music/ (no pack). Missing from the library: BUILT_IN_THEME.
 */
export interface SplashTheme {
  pack?: string;
  file: string;
}
/** The game's own theme (web/public/sound/music), played when the library names none or its song is gone. */
export const BUILT_IN_THEME = { title: 'Lost in Lowlight', url: '/sound/music/Lost%20in%20Lowlight.ogg' } as const;
/** A song's title: its file name without `.ogg`. */
export const songTitle = (file: string): string => file.replace(/\.ogg$/, '');

export interface SplashLibrary {
  version: 1;
  logos?: SplashLogoEntry[];
  theme?: SplashTheme;
  notice?: SplashNotice;
  splashes: SplashEntry[];
}

const px = z.number().finite();
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(png|jpe?g|webp)$/;
/** The fallbacks' ids: the built-in logo's and the built-in splash's, never given to a library logo. */
const LOGO_RESERVED = [BUILT_IN_LOGO_ID, 'built-in'];
const logoIdSchema = z.string().regex(SLUG).refine((id) => !LOGO_RESERVED.includes(id), { message: 'reserved for the built-in logo' });
export const splashLogoEntrySchema = z.object({
  id: logoIdSchema,
  name: z.string().min(1).max(80),
  file: z.string().regex(IMAGE_FILE),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  effects: z.array(z.enum(LOGO_EFFECTS)).optional(),
  promptGap: z.number().finite().min(PROMPT_GAP_MIN).max(PROMPT_GAP_MAX).optional(),
});
export const splashEntrySchema = z.object({
  id: z.string().regex(SLUG),
  name: z.string().min(1).max(80),
  file: z.string().regex(IMAGE_FILE),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  on: z.boolean(),
  logo: z.object({ id: logoIdSchema.optional(), x: px.min(0), y: px.min(0), width: px.positive() }),
  panel: z.object({ x: px, y: px, width: px, height: px }).optional(),
});
/** A song keeps the name it was added with (spaces, brackets): one `.ogg` file name, never a path or a dot file. */
const SONG_FILE = /^[^./\\\0][^/\\\0]*\.ogg$/;
export const splashThemeSchema = z.object({ pack: z.string().regex(SLUG).optional(), file: z.string().max(255).regex(SONG_FILE) }).strict();
export const splashNoticeSchema = z.object({ on: z.boolean(), title: z.string().max(60), tag: z.string().max(30), text: z.string().max(40000) }).strict();
export const splashLibrarySchema: z.ZodType<SplashLibrary> = z.object({
  version: z.literal(1),
  logos: z.array(splashLogoEntrySchema).optional(),
  theme: splashThemeSchema.optional(),
  notice: splashNoticeSchema.optional(),
  splashes: z.array(splashEntrySchema),
});

type Read<T> = { entry: T; problem: null } | { entry: null; problem: string };
function readWith<T>(schema: z.ZodType<T>, raw: unknown): Read<T> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    return { entry: null, problem: `${i?.path.join('.') || 'entry'}: ${i?.message ?? 'invalid'}` };
  }
  return { entry: r.data, problem: null };
}

/** One entry as the manifest has it: the entry when it's valid, else what's wrong (a hand edit). */
export const readSplashEntry = (raw: unknown): Read<SplashEntry> => readWith(splashEntrySchema, raw);

/** One logo as the manifest has it: the entry when it's valid, else what's wrong. */
export const readSplashLogo = (raw: unknown): Read<SplashLogoEntry> => readWith(splashLogoEntrySchema, raw);

/** The manifest's theme: null when it names none, else the theme, or what's wrong with it (a hand edit). */
export function readSplashTheme(json: unknown): { theme: SplashTheme | null; problem: string | null } {
  const raw = (json as { theme?: unknown } | null)?.theme;
  if (raw === undefined) return { theme: null, problem: null };
  const r = readWith(splashThemeSchema, raw);
  return r.entry ? { theme: r.entry, problem: null } : { theme: null, problem: `theme: ${r.problem}` };
}

/** The manifest's notice: null when it has none, else the notice, or what's wrong with it (a hand edit). */
export function readSplashNotice(json: unknown): { notice: SplashNotice | null; problem: string | null } {
  const raw = (json as { notice?: unknown } | null)?.notice;
  if (raw === undefined) return { notice: null, problem: null };
  const r = readWith(splashNoticeSchema, raw);
  return r.entry ? { notice: r.entry, problem: null } : { notice: null, problem: `notice: ${r.problem}` };
}

/** The manifest's logos, each as it is; none when the list is missing (a library from before logos). */
export function splashLogoEntries(json: unknown): unknown[] {
  const logos = (json as { logos?: unknown } | null)?.logos;
  return Array.isArray(logos) ? logos : [];
}

/** The manifest's entries, each as it is (one bad entry never hides the rest); null when the file itself isn't a library. */
export function splashEntries(json: unknown): unknown[] | null {
  const lib = json as { version?: unknown; splashes?: unknown } | null;
  return lib && typeof lib === 'object' && lib.version === 1 && Array.isArray(lib.splashes) ? lib.splashes : null;
}

/** The game's own fallback's id (web/src/landing/splash.ts BUILT_IN): never given to a library image. */
const RESERVED = 'built-in';

/** An id for a name, never the fallback's. */
export const splashId = (name: string, taken: ReadonlySet<string>): string => loreId(name, new Set([...taken, RESERVED]));

/** A logo's id for a name, never a fallback's. */
export const splashLogoId = (name: string, taken: ReadonlySet<string>): string => loreId(name, new Set([...taken, ...LOGO_RESERVED]));

/** A splash's logo aspect (width over height): the built-in's for no id, null for an id the library doesn't have. */
export function logoAspect(id: string | undefined, logos: readonly SplashLogoEntry[]): number | null {
  if (id === undefined) return SPLASH_LOGO_ASPECT;
  const l = logos.find((x) => x.id === id);
  return l ? l.width / l.height : null;
}

const logoHeight = (width: number, aspect: number) => width / aspect;

/** Whether a logo of this aspect fits a width×height image at all: at its smallest (15%), no taller than the image. */
export const logoFits = (aspect: number, width: number, height: number): boolean => logoHeight(width * LOGO_MIN, aspect) <= height + 0.5;

/** What's wrong with an entry's placement, or null: the logo sits inside the image, 15–90% of its width. */
export function checkSplash(e: SplashEntry, aspect: number = SPLASH_LOGO_ASPECT): string | null {
  const { x, y, width } = e.logo;
  if (![x, y, width].every(Number.isFinite)) return 'the logo placement must be numbers';
  if (width < e.width * LOGO_MIN - 0.5) return `the logo must be at least 15% of the image's width`;
  if (width > e.width * LOGO_MAX + 0.5) return `the logo must be at most 90% of the image's width`;
  if (x < 0 || y < 0 || x + width > e.width + 0.5 || y + logoHeight(width, aspect) > e.height + 0.5) return 'the logo must sit inside the image';
  return null;
}

/** A new image's logo: the Nix splash's spot, scaled to this image. */
export function defaultLogo(width: number, height: number): SplashLogo {
  return { x: Math.round(width * DEFAULT.x), y: Math.round(height * DEFAULT.y), width: Math.round(width * DEFAULT.width) };
}

/** The logo pulled back inside a width×height image, shrunk to fit its height, and to 15–90% of its width (its id kept). */
export function clampLogo(logo: SplashLogo, width: number, height: number, aspect: number = SPLASH_LOGO_ASPECT): SplashLogo {
  // No wider than 90%, nor than lets it fit the image's height; never under 15% (logoFits says when that can't fit).
  const w = Math.round(Math.max(width * LOGO_MIN, Math.min(width * LOGO_MAX, height * aspect, logo.width)));
  const clamp = (v: number, hi: number) => Math.round(Math.min(Math.max(0, hi), Math.max(0, v)));
  const placed = { x: clamp(logo.x, width - w), y: clamp(logo.y, Math.floor(height - logoHeight(w, aspect))), width: w };
  return logo.id === undefined ? placed : { id: logo.id, ...placed };
}

/** The notice's width, at least / at most, and its height, at least (in the image's pixels). */
export const PANEL_W_MIN = 360;
export const PANEL_W_MAX = 560;
export const PANEL_H_MIN = 260;
/** A splash with no panel: bottom left, as shares of the image (under the logo on the Nix splash, over the song line). */
const PANEL_DEFAULT = { x: 0.04, y: 0.54, width: 0.287, height: 0.31 };

/** The panel pulled back inside a width×height image, at a size it allows. */
export function clampPanel(p: SplashPanel, width: number, height: number): SplashPanel {
  const w = Math.round(Math.min(width, Math.max(PANEL_W_MIN, Math.min(PANEL_W_MAX, p.width))));
  const h = Math.round(Math.min(height, Math.max(PANEL_H_MIN, p.height)));
  const clamp = (v: number, hi: number) => Math.round(Math.min(hi, Math.max(0, v)));
  return { x: clamp(p.x, width - w), y: clamp(p.y, height - h), width: w, height: h };
}

/** A splash's panel when it has none. */
export function defaultPanel(width: number, height: number): SplashPanel {
  const d = PANEL_DEFAULT;
  return clampPanel({ x: width * d.x, y: height * d.y, width: width * d.width, height: height * d.height }, width, height);
}

export interface NoticeEntry {
  head?: string;
  body?: string;
}
export interface NoticeSection {
  /** Null for entries before the first section line. */
  title: string | null;
  entries: NoticeEntry[];
}

/** A section line is at most this long; a lone sentence over this reads as body, not a head. */
const SECTION_MAX = 40;
const HEAD_MAX = 60;

/**
 * The notice's text, as it's pasted: blank lines split blocks. A short line with no end
 * punctuation is a section; one straight over another goes, so a pasted heading doesn't show twice,
 * and the last block is never one, so a short closing line stays. Any other block is an entry: its
 * first sentence the head, the rest the body.
 */
export function parseNotice(text: string): NoticeSection[] {
  const sections: NoticeSection[] = [];
  let at: NoticeSection | null = null;
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
  const isSection = (b: string | undefined) => b !== undefined && b.length <= SECTION_MAX && !/[.!?…:;,"')]$/.test(b);
  for (const [i, block] of blocks.entries()) {
    const next = blocks[i + 1];
    if (isSection(block) && next !== undefined) {
      if (isSection(next) && i + 1 < blocks.length - 1) continue;
      at = { title: block, entries: [] };
      sections.push(at);
      continue;
    }
    if (!at) {
      at = { title: null, entries: [] };
      sections.push(at);
    }
    const m = block.match(/^(.+?[.!?…])\s+(.*)$/);
    const head = (m ? m[1]! : block).replace(/\.$/, '');
    if (m) at.entries.push({ head, body: m[2]! });
    else at.entries.push(block.length <= HEAD_MAX ? { head } : { body: block });
  }
  return sections;
}
