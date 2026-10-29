/**
 * Standing (spec 2026-10-13): how much a contact trusts and likes the player in a playthrough,
 * read as a fuzzy word from a 3×3 grid of bands. Pure rules and copy; the server stores it as a
 * story meta key in her database and the tool moves it.
 */

/** Every number Standing uses, in one place for the hand-check to tune. */
export const STANDING = {
  min: -10,
  max: 10,
  /** At or below: the low band. */
  lowMax: -5,
  /** At or above: the high band. */
  highMin: 5,
  /** The most one move changes either value (2 moved Nix to her top band in one night; 2026-10-16). */
  step: 1,
  /** Her replies after a Residual move before standing may move again: the next move is on the 4th. */
  cooldown: 4,
  /** Moves kept with the values. */
  history: 20,
  reasonMax: 80,
  wantMax: 200,
  secretMax: 300,
  hintMax: 120,
  wordMax: 32,
} as const;

export type Band = 'low' | 'mid' | 'high';
/** `<trust band>-<warmth band>`. */
export type Cell = `${Band}-${Band}`;

const BANDS: readonly Band[] = ['low', 'mid', 'high'];
export const CELLS: readonly Cell[] = BANDS.flatMap((t) => BANDS.map((w) => `${t}-${w}` as Cell));

export interface StandingValues {
  trust: number;
  warmth: number;
}

export interface StandingMove {
  trust: number;
  warmth: number;
  reason: string;
  at: number;
  /** The reply it belongs to, and which take of it (the write log's take: keep going writes the same one). */
  messageId: string;
  take: number;
  /** A job's stake (Intake board spec §2): stamped to the job's last row; the Residual's pace ignores it. */
  job?: true;
}

export interface StoredStanding extends StandingValues {
  moves: StandingMove[];
}

/** A character's `standing` block, as the game uses it. */
export interface StandingConfig {
  start: StandingValues | null;
  want: string | null;
  secret: string | null;
  hint: string | null;
  words: Partial<Record<Cell, string>>;
}

/** `world/standing.json`: the shared words and the band lines. */
export interface SharedStanding {
  words: Record<Cell, string>;
  trust: Record<Band, string>;
  warmth: Record<Band, string>;
}

export const DEFAULT_SHARED_STANDING: SharedStanding = {
  words: {
    'low-low': 'Hostile',
    'low-mid': 'Wary',
    'low-high': "Fond of you, doesn't trust you",
    'mid-low': 'Cold',
    'mid-mid': 'Sizing you up',
    'mid-high': 'Warming to you',
    'high-low': 'Respects you, keeps distance',
    'high-mid': 'Trusts you',
    'high-high': 'Close',
  },
  trust: {
    low: "you don't believe much of what they say, and you check it.",
    mid: "you take what they say with a pinch of salt until it's proven.",
    high: "you believe them, and you'd tell them things you keep from others.",
  },
  warmth: {
    low: "you don't like them, and it shows.",
    mid: "they're neither a friend nor a problem yet.",
    high: 'you like having them around and it shows.',
  },
};

export function bandOf(v: number): Band {
  return v <= STANDING.lowMax ? 'low' : v >= STANDING.highMin ? 'high' : 'mid';
}

export function cellOf(v: StandingValues): Cell {
  return `${bandOf(v.trust)}-${bandOf(v.warmth)}`;
}

/** Her word for where the player stands: her own for the cell, else the shared one. */
export function wordFor(v: StandingValues, cfg: StandingConfig | null, shared: SharedStanding): string {
  const cell = cellOf(v);
  return cfg?.words[cell] ?? shared.words[cell];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isValue = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= STANDING.min && v <= STANDING.max;
const isCell = (k: string): k is Cell => (CELLS as readonly string[]).includes(k);

/** A trimmed, non-empty string of at most `max` characters; null (with a warning when it was there but bad). */
function text(raw: unknown, max: number, what: string, warn: (m: string) => void): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    warn(`${what}: must be text; ignored`);
    return null;
  }
  const t = raw.trim();
  if (t.length === 0) return null;
  if (t.length > max) {
    warn(`${what}: longer than ${max} characters; ignored`);
    return null;
  }
  return t;
}

/** A character's `standing` block, each part checked on its own: a bad one warns and is dropped. Absent → null. */
export function parseStandingConfig(raw: unknown, warn: (m: string) => void): StandingConfig | null {
  if (raw === undefined) return null;
  if (!isObject(raw)) {
    warn('standing: must be an object; ignored');
    return null;
  }
  let start: StandingValues | null = null;
  if (raw.start !== undefined) {
    const s = raw.start;
    if (isObject(s) && isValue(s.trust) && isValue(s.warmth)) start = { trust: s.trust, warmth: s.warmth };
    else warn(`standing.start: trust and warmth must be whole numbers from ${STANDING.min} to ${STANDING.max}; ignored`);
  }
  const want = text(raw.want, STANDING.wantMax, 'standing.want', warn);
  const secret = text(raw.secret, STANDING.secretMax, 'standing.secret', warn);
  const hintText = text(raw.hint, STANDING.hintMax, 'standing.hint', warn);
  const words: Partial<Record<Cell, string>> = {};
  if (raw.words !== undefined) {
    if (!isObject(raw.words)) warn('standing.words: must be an object of cell → word; ignored');
    else
      for (const [k, v] of Object.entries(raw.words)) {
        if (!isCell(k)) {
          warn(`standing.words.${k}: not a cell (${CELLS.join(', ')}); dropped`);
          continue;
        }
        const w = text(v, STANDING.wordMax, `standing.words.${k}`, warn);
        if (w !== null) words[k] = w;
      }
  }
  return { start, want, secret, hint: secret === null ? null : hintText, words };
}

/** `world/standing.json`, each entry checked on its own: a missing or bad one falls back to the default with a warning. */
export function parseSharedStanding(raw: unknown, warn: (m: string) => void): SharedStanding {
  if (!isObject(raw)) {
    warn('standing.json: must be an object; using the defaults');
    return DEFAULT_SHARED_STANDING;
  }
  const section = <K extends string>(name: string, keys: readonly K[], defaults: Record<K, string>, max: number): Record<K, string> => {
    const src = isObject(raw[name]) ? (raw[name] as Record<string, unknown>) : {};
    const out = {} as Record<K, string>;
    for (const k of keys) {
      const v = src[k];
      const t = typeof v === 'string' ? v.trim() : '';
      if (t.length > 0 && t.length <= max) out[k] = t;
      else {
        warn(`standing.json: ${name}.${k} is missing or bad; using the default`);
        out[k] = defaults[k];
      }
    }
    return out;
  };
  return {
    words: section('words', CELLS, DEFAULT_SHARED_STANDING.words, STANDING.wordMax),
    trust: section('trust', BANDS, DEFAULT_SHARED_STANDING.trust, LINE_MAX),
    warmth: section('warmth', BANDS, DEFAULT_SHARED_STANDING.warmth, LINE_MAX),
  };
}

/** A band line's length limit. */
const LINE_MAX = 200;

/** Studio's strict check of a shared file: every cell and band line present, nothing unknown, within limits. */
export function sharedStandingErrors(raw: unknown): { path: string; message: string }[] {
  if (!isObject(raw)) return [{ path: '', message: 'must be an object' }];
  const errors: { path: string; message: string }[] = [];
  const check = (name: string, keys: readonly string[], max: number) => {
    const src = raw[name];
    if (!isObject(src)) {
      errors.push({ path: name, message: 'missing' });
      return;
    }
    for (const k of keys) {
      const v = src[k];
      if (typeof v !== 'string' || v.trim().length === 0) errors.push({ path: `${name}.${k}`, message: 'missing' });
      else if (v.trim().length > max) errors.push({ path: `${name}.${k}`, message: `at most ${max} characters` });
    }
    for (const k of Object.keys(src)) if (!keys.includes(k)) errors.push({ path: `${name}.${k}`, message: 'unknown' });
  };
  check('words', CELLS, STANDING.wordMax);
  check('trust', BANDS, LINE_MAX);
  check('warmth', BANDS, LINE_MAX);
  return errors;
}

/** Where standing starts: the tie's value, else her Studio start, else 0 — per value. */
export function startValues(tie: Partial<StandingValues> | null, cfg: StandingConfig | null): StandingValues {
  return {
    trust: tie?.trust ?? cfg?.start?.trust ?? 0,
    warmth: tie?.warmth ?? cfg?.start?.warmth ?? 0,
  };
}

/** The story meta key holding `player`'s standing in her database. */
export function standingKey(player: string): string {
  return `standing.${player}`;
}

/** A stored standing, or null when there's none or it doesn't read. */
export function parseStored(json: string | null): StoredStanding | null {
  if (json === null) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (!isObject(v) || typeof v.trust !== 'number' || typeof v.warmth !== 'number' || !Array.isArray(v.moves)) return null;
    // A move that doesn't read is dropped, so a hand-edited or older value can't break a turn.
    const moves = v.moves.filter(
      (m): m is StandingMove => isObject(m) && typeof m.messageId === 'string' && typeof m.take === 'number' && typeof m.trust === 'number' && typeof m.warmth === 'number' && typeof m.reason === 'string' && typeof m.at === 'number',
    );
    return { trust: clamp(v.trust), warmth: clamp(v.warmth), moves };
  } catch {
    return null;
  }
}

const clamp = (v: number) => Math.max(STANDING.min, Math.min(STANDING.max, v));

/** One move on top of the stored standing (or the start, before the first): clamped, the last moves kept. */
export function applyMove(cur: StoredStanding | null, start: StandingValues, move: StandingMove): StoredStanding {
  const from = cur ?? { ...start, moves: [] };
  return {
    trust: clamp(from.trust + move.trust),
    warmth: clamp(from.warmth + move.warmth),
    moves: [...from.moves, move].slice(-STANDING.history),
  };
}

/** Her system prompt's standing block on the player: the word, the band lines, her want and the secret by trust band. */
export function standingBlock(o: { player: string; values: StandingValues; cfg: StandingConfig | null; shared: SharedStanding }): string {
  const { cfg, shared, values } = o;
  const trust = bandOf(values.trust);
  const lines = [
    `[how you feel about ${o.player} — "${wordFor(values, cfg, shared)}":`,
    ` Trust: ${shared.trust[trust]}`,
    ` Warmth: ${shared.warmth[bandOf(values.warmth)]}`,
  ];
  if (cfg?.want) lines.push(` What you want from them: ${cfg.want}`);
  if (cfg?.secret) {
    if (trust === 'high') lines.push(` Your secret: ${/[.!?]$/.test(cfg.secret) ? cfg.secret : `${cfg.secret}.`} You may tell them if the moment's right.`);
    else {
      const slip = trust === 'mid' && cfg.hint ? ` If it comes near, you might let slip: ${cfg.hint.replace(/[.!?]+$/, '')}.` : '';
      lines.push(` There's something you don't talk about. If talk comes near it, deflect.${slip}`);
    }
  }
  lines.push(` Let this colour how you act; don't announce it.]`);
  return lines.join('\n');
}
