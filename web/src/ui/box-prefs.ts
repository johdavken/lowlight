/**
 * The subtitle box's own settings (the box's settings key, docs/mockups/box-settings.html), kept per browser like TEXT
 * SIZE: its colour (the speaker's, or a fixed swatch), how dark its glass is, whether a long reply turns its own pages,
 * the line to whoever speaks, and how her words come in (typed, or decoded out of glyph noise). TEXT, TEXT SIZE, FONT and
 * CHAT KEYS sit in the same panel but keep their own modules and keys.
 */
export const BOX_SWATCHES = { pink: '#ff4f8b', cyan: '#46e3fc', violet: '#b48cff', amber: '#ffc56b', green: '#3dff9a', white: '#e6eef7' } as const;
export type BoxSwatch = keyof typeof BOX_SWATCHES;
export type BoxColour = 'speaker' | BoxSwatch;
export type AutoPage = 'off' | 'slow' | 'fast';
export type TextEffect = 'type' | 'decode';

export interface BoxPrefs {
  colour: BoxColour;
  /** 0–100 in tens: how dark and solid the glass is (60 is the box as it shipped). */
  glass: number;
  autoPage: AutoPage;
  /** The line from the box to whoever speaks. */
  line: boolean;
  effect: TextEffect;
}

export const BOX_DEFAULTS: BoxPrefs = { colour: 'speaker', glass: 60, autoPage: 'off', line: true, effect: 'type' };

/** How long a finished page waits before it turns itself. */
export const AUTO_PAGE_MS: Record<Exclude<AutoPage, 'off'>, number> = { slow: 6000, fast: 3000 };

export const BOX_COLOURS: readonly BoxColour[] = ['speaker', ...(Object.keys(BOX_SWATCHES) as BoxSwatch[])];
export const AUTO_PAGES: readonly AutoPage[] = ['off', 'slow', 'fast'];
export const TEXT_EFFECTS: readonly TextEffect[] = ['type', 'decode'];

const KEY = 'lowlight.box';

/** The glass level kept to 0–100 in whole tens. */
export const clampGlass = (n: number): number => Math.min(100, Math.max(0, Math.round(n / 10) * 10));

/** The saved settings, each field checked on its own: anything missing, unknown or unreadable takes its default. */
export function loadBoxPrefs(): BoxPrefs {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    raw = null;
  }
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    colour: BOX_COLOURS.includes(o.colour as BoxColour) ? (o.colour as BoxColour) : BOX_DEFAULTS.colour,
    glass: typeof o.glass === 'number' && Number.isFinite(o.glass) ? clampGlass(o.glass) : BOX_DEFAULTS.glass,
    autoPage: AUTO_PAGES.includes(o.autoPage as AutoPage) ? (o.autoPage as AutoPage) : BOX_DEFAULTS.autoPage,
    line: typeof o.line === 'boolean' ? o.line : BOX_DEFAULTS.line,
    effect: TEXT_EFFECTS.includes(o.effect as TextEffect) ? (o.effect as TextEffect) : BOX_DEFAULTS.effect,
  };
}

export function saveBoxPrefs(p: BoxPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage off: the settings hold for this page only.
  }
}

/** The ms a finished page waits before turning itself, or null when AUTO PAGE is off. */
export const autoPageMs = (a: AutoPage): number | null => (a === 'off' ? null : AUTO_PAGE_MS[a]);

/**
 * On the feed's root (style.css reads them): `fixed-accent` and `--fixed-hc` for a swatch (the box takes it, the name
 * plate keeps the speaker's), `--box-glass` 0–1, `no-leader` with the speaker line off.
 */
export function applyBoxPrefs(root: HTMLElement, p: BoxPrefs): void {
  const fixed = p.colour !== 'speaker';
  root.classList.toggle('fixed-accent', fixed);
  if (fixed) root.style.setProperty('--fixed-hc', BOX_SWATCHES[p.colour as BoxSwatch]);
  else root.style.removeProperty('--fixed-hc');
  root.style.setProperty('--box-glass', String(clampGlass(p.glass) / 100));
  root.classList.toggle('no-leader', !p.line);
}
