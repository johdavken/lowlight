/**
 * SYS → RENDER SCALE, EFFECTS, BLUR, POST EFFECTS and FIGURE LIGHT (2026-11-16), kept per browser like FRAME RATE.
 * BLUR off: the bars beside the room go black, and the panels' frosted glass keeps its darkening without the blur.
 * POST EFFECTS off: no scanlines or vignette over the room (glitches and signal drops still play).
 * RENDER SCALE draws the room's canvas at a share of the screen's pixel density: on a high-DPI screen 100 % is
 * about 4× the pixels of a 1080p one, and pixel art shows little of the drop. EFFECTS leaves out the room's
 * costliest ambient effects: LOW the particles (dust, rain on the glass), OFF steam, smoke and passing lights too.
 * Screens, LEDs and lightning stay at every level (they're the room's own lights, and lightning's thunder).
 */
export const RENDER_SCALES = ['100', '75', '50'] as const;
export type RenderScale = (typeof RENDER_SCALES)[number];
export const EFFECTS_LEVELS = ['full', 'low', 'off'] as const;
export type EffectsLevel = (typeof EFFECTS_LEVELS)[number];

const SCALE_KEY = 'lowlight.renderScale';
const EFFECTS_KEY = 'lowlight.effects';
const FIGURE_LIGHT_KEY = 'lowlight.figureLight';
const BLUR_KEY = 'lowlight.blur';
const POST_KEY = 'lowlight.post';

function load<T extends string>(key: string, all: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return all.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // Storage off: the pick holds for this page only.
  }
}

/** The saved scale; 100 when none is saved, it isn't one, or storage is off. */
export const loadRenderScale = (): RenderScale => load(SCALE_KEY, RENDER_SCALES, '100');
export const saveRenderScale = (s: RenderScale): void => save(SCALE_KEY, s);
/** The saved level; FULL when none is saved, it isn't one, or storage is off. */
export const loadEffects = (): EffectsLevel => load(EFFECTS_KEY, EFFECTS_LEVELS, 'full');
export const saveEffects = (l: EffectsLevel): void => save(EFFECTS_KEY, l);

/** BLUR and POST EFFECTS: on unless saved off. */
export const loadBlur = (): boolean => load(BLUR_KEY, ['on', 'off'], 'on') === 'on';
export const saveBlur = (on: boolean): void => save(BLUR_KEY, on ? 'on' : 'off');
export const loadPost = (): boolean => load(POST_KEY, ['on', 'off'], 'on') === 'on';
export const savePost = (on: boolean): void => save(POST_KEY, on ? 'on' : 'off');

/** FIGURE LIGHT (figure lighting spec §2): on unless saved off; off, the figures take the flat tint. */
export const loadFigureLight = (): boolean => load(FIGURE_LIGHT_KEY, ['on', 'off'], 'on') === 'on';
export const saveFigureLight = (on: boolean): void => save(FIGURE_LIGHT_KEY, on ? 'on' : 'off');

/** BLUR on the page: every panel's backdrop blur is a multiple of `--ui-blur` (0 with BLUR off). */
export function applyUiBlur(on: boolean, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ui-blur', on ? '1' : '0');
}

/** What the renderer's density takes: 1, 0.75 or 0.5. */
export function renderScaleFactor(s: RenderScale): number {
  return Number(s) / 100;
}

/** The effect kinds a level leaves out (`dust` is the lights' dust; the rest are scene effect kinds). */
export function effectsLeftOut(l: EffectsLevel): ReadonlySet<string> {
  if (l === 'low') return new Set(['dust', 'glass']);
  if (l === 'off') return new Set(['dust', 'glass', 'plume', 'passing']);
  return new Set();
}
