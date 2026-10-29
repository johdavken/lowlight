/**
 * The splash before the title (spec 2026-10-09 front-end restyle §2): Nix against the wall, the
 * logo to her left with a CRT scan and a light glitch, and a blinking prompt. Once per session, and
 * again on every reload; back from a room skips it.
 */
import { DEFAULT_LOGO_EFFECTS, LOGO_EFFECTS, SPLASH_GROUP_LOGO_W, SPLASH_LOGO_ASPECT, type LogoEffect, type SplashLogo } from '../../../shared/splash';
import { glitchOut } from './stage';
import { STAGE_H, STAGE_W } from '../ui/game-stage';
import './splash.css';

export const SPLASH_KEY = 'lowlight.splashSeen';

/** How this page was reached ('reload', 'navigate', 'back_forward'); '' when the browser can't say. */
function navigationType(): string {
  try {
    return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? '';
  } catch {
    return '';
  }
}

/** True on a reload, or unless this session already dismissed the splash. Blocked storage shows it every time. */
export function shouldShowSplash(storage: Pick<Storage, 'getItem'> = sessionStorage, navType: string = navigationType()): boolean {
  if (navType === 'reload') return true;
  try {
    return storage.getItem(SPLASH_KEY) === null;
  } catch {
    return true;
  }
}

export function markSplashSeen(storage: Pick<Storage, 'setItem'> = sessionStorage): void {
  try {
    storage.setItem(SPLASH_KEY, '1');
  } catch {
    // Private window or blocked storage: the splash just shows again next load.
  }
}

export interface Splash {
  el: HTMLElement;
  /** False when the skyline can't be drawn: the overlay brings its own dark gradient. */
  setSceneOk(ok: boolean): void;
  /** The theme is playing: the logo brightens and the prompt becomes PRESS ANY KEY. */
  arm(): void;
  /** Glitches the logo and prompt out (0.6 s; instantly with reduced motion), then removes the overlay. */
  dismiss(): Promise<void>;
  /** The art it shows now (the built-in when the picked one failed to load). */
  readonly art: SplashArt;
  /** Re-reads the viewport and fits again (Studio's preview frame changed size). */
  refit(): void;
  /** Moves and scales the logo-and-prompt group to `logo` (Studio's drag), and swaps the logo when its src changes. */
  place(logo: ArtLogo): void;
  /** Plays the logo's power-on again (Studio's REPLAY); nothing when the logo hasn't got it. */
  replayIntro(): void;
  /** Removes it at once, no glitch, and stops listening (Studio's preview, the landing's dispose). */
  destroy(): void;
}

export const SOUND_PROMPT = '▶ CLICK OR PRESS ANY KEY FOR SOUND';
const ENTER_PROMPT = '[ ENTER TO CONTINUE ]';
const LOGO_SRC = '/lowlight-logo.webp';

/** Where the logo sits, and which logo: its image and aspect (spec 2026-10-11 splash logos §5); missing means the built-in. */
export type ArtLogo = SplashLogo & { src?: string; aspect?: number; effects?: LogoEffect[]; promptGap?: number };

/** A splash image: its file, its own size (the splash's stage), and where the logo sits on it, in its pixels. */
export interface SplashArt {
  id: string;
  src: string;
  width: number;
  height: number;
  logo: ArtLogo;
}

/** The game's own splash, used whenever the library gives nothing (spec 2026-10-09 splash library §4.1). */
export const BUILT_IN: SplashArt = { id: 'built-in', src: '/splash/nix-wall.webp', width: 1531, height: 1027, logo: { x: 67, y: 117, width: 727 } };

const LAST_KEY = 'lowlight.lastSplash';
const PICK_KEY = 'lowlight.splashPick';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const read = (s: Store | undefined, k: string): string | null => {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const write = (s: Store | undefined, k: string, v: string): void => {
  try {
    s?.setItem(k, v);
  } catch {
    // Blocked storage: the next load just picks again.
  }
};
const isArt = (v: unknown): v is SplashArt => {
  const a = v as SplashArt | null;
  return !!a && typeof a.id === 'string' && typeof a.src === 'string' && a.width > 0 && a.height > 0 && !!a.logo && typeof a.logo.x === 'number';
};

/** The last pick this session, without fetching (the splash coming back after Esc on a visit that skipped it); null when none. */
export function sessionSplashArt(session: Store | undefined = globalThis.sessionStorage): SplashArt | null {
  try {
    const v: unknown = JSON.parse(read(session, PICK_KEY) ?? 'null');
    return isArt(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The splash for this showing (spec 2026-10-09 splash library §4.1): one of the library's images
 * switched on, at random, never the last one shown when there are two or more. Kept in the session
 * for Esc back to it. The built-in on an error, an empty list, or no answer within `timeoutMs`.
 */
export async function splashArt(
  o: { fetchImpl?: typeof fetch; timeoutMs?: number; random?: () => number; local?: Store; session?: Store } = {},
): Promise<SplashArt> {
  const local = o.local ?? globalThis.localStorage;
  const session = o.session ?? globalThis.sessionStorage;
  let list: SplashArt[] = [];
  try {
    const res = await (o.fetchImpl ?? fetch)('/api/splashes', { signal: AbortSignal.timeout(o.timeoutMs ?? 1000) });
    if (res.ok) {
      const body = (await res.json()) as { splashes?: { id: string; url: string; width: number; height: number; logo: ArtLogo }[] };
      list = (body.splashes ?? []).map((s) => ({ id: s.id, src: s.url, width: s.width, height: s.height, logo: s.logo })).filter(isArt);
    }
  } catch {
    // Down, slow or garbled: the built-in below.
  }
  if (list.length === 0) return BUILT_IN;
  const last = read(local, LAST_KEY);
  const pool = list.length > 1 ? list.filter((a) => a.id !== last) : list;
  const art = pool[Math.min(pool.length - 1, Math.floor((o.random ?? Math.random)() * pool.length))]!;
  write(local, LAST_KEY, art.id);
  write(session, PICK_KEY, JSON.stringify(art));
  return art;
}

/** How far the prompt tucks up under the logo's bottom edge: the built-in's prompt starts 210 px down. */
export const PROMPT_TUCK = SPLASH_GROUP_LOGO_W / SPLASH_LOGO_ASPECT - 210;
/** The prompt's top in the group, `gap` under a logo of this aspect drawn SPLASH_GROUP_LOGO_W wide (default: tucked as the built-in's). */
export const promptTop = (aspect: number, gap: number = -PROMPT_TUCK): number => SPLASH_GROUP_LOGO_W / aspect + gap;
/** The logo-and-prompt group's height as drawn (the prompt's top, then 29 px type; splash.css). */
export const groupHeight = (aspect: number, gap?: number): number => promptTop(aspect, gap) + 35;
/** The group's height with the built-in logo. */
export const SPLASH_GROUP_H = groupHeight(SPLASH_LOGO_ASPECT);

/** How far inside the window the logo's corner stays, at least. */
const LOGO_MARGIN = 24;

/**
 * Where the art sits to cover a w×h window: centred across and 30% down (CSS `cover` at 50% 30%),
 * except that the crop shifts so the logo's corner stays LOGO_MARGIN inside the window. It never
 * uncovers the window. A 0-sized window gives a 0 scale (nothing to fit yet).
 */
export function coverBox(w: number, h: number, art: SplashArt): { scale: number; left: number; top: number } {
  if (!(w > 0 && h > 0)) return { scale: 0, left: 0, top: 0 };
  const scale = Math.max(w / art.width, h / art.height);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const left = clamp(Math.max((w - art.width * scale) * 0.5, LOGO_MARGIN - art.logo.x * scale), w - art.width * scale, 0);
  const top = clamp(Math.max((h - art.height * scale) * 0.3, LOGO_MARGIN - art.logo.y * scale), h - art.height * scale, 0);
  return { scale, left, top };
}

/**
 * The logo-and-prompt group's scale: the art's logo width over the group's drawn width, shrunk
 * further only when the logo wouldn't end LOGO_MARGIN inside the window.
 */
export function markScale(w: number, h: number, art: SplashArt): number {
  const base = art.logo.width / SPLASH_GROUP_LOGO_W;
  const b = coverBox(w, h, art);
  if (b.scale === 0) return base;
  // Across: the logo ends LOGO_MARGIN inside the window. Down: so does the prompt under it.
  const across = (w - LOGO_MARGIN - (b.left + art.logo.x * b.scale)) / (art.logo.width * b.scale);
  const down = (h - LOGO_MARGIN - (b.top + art.logo.y * b.scale)) / (groupHeight(art.logo.aspect ?? SPLASH_LOGO_ASPECT, art.logo.promptGap) * base * b.scale);
  return base * Math.max(0.05, Math.min(1, across, down));
}

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const img = (cls: string, src: string) => {
  const i = el('img', cls) as HTMLImageElement;
  i.alt = '';
  i.src = src;
  return i;
};

/**
 * The logo and every effect's layers (spec 2026-10-11 logo effects §4): the pulse's halo, colour
 * fringe, the logo, two glitch slices, then scanlines, the shine and the hologram's band (masked to
 * the logo). splash.css shows each layer only while its effect's fx- class is on.
 */
function buildLogo(src: string): HTMLElement {
  const logo = el('div', 'splash-logo');
  logo.setAttribute('role', 'img');
  logo.setAttribute('aria-label', 'Lowlight');
  logo.style.setProperty('--logo', `url("${src}")`);
  const slice = (cls: string) => {
    const s = el('div', cls);
    s.append(img('', src));
    return s;
  };
  logo.append(img('halo', src), img('fringe pk', src), img('fringe cy', src), img('base', src), slice('slice'), slice('slice b'), el('div', 'crt'), el('div', 'shine'), el('div', 'holo-band'));
  return logo;
}

/**
 * The key art over the canvas (which still draws the skyline underneath, for when the art can't
 * load), with the logo and prompt on the art's own stage, scaled to cover the window: they stay
 * put on the picture whatever the window's shape. A logo that won't
 * load becomes a LOWLIGHT wordmark. With `needsSound` (the browser blocked the theme until a
 * gesture) it first asks for sound quietly; `arm()` switches to the blinking prompt.
 */
export function mountSplash(
  host: HTMLElement,
  opts: {
    reducedMotion: boolean;
    needsSound?: boolean;
    logoSrc?: string;
    /** The picked image (default: the built-in). */
    art?: SplashArt;
    /** False: no power-on intro on this first showing (Esc back: landing's glitch-in is the entrance). */
    intro?: boolean;
    /** The size to cover (default: the 1600×900 game stage): Studio's preview passes its frame. */
    viewport?: () => { width: number; height: number };
  },
): Splash {
  const root = el('div', `splash${opts.reducedMotion ? ' still' : ''}`);
  let current: SplashArt = opts.art ?? BUILT_IN;
  const artImg = img('splash-art', current.src);
  const stage = el('div', 'splash-stage');
  // The logo and prompt, one group on the art at its logo spot: it shrinks only when the logo wouldn't fit.
  const mark = el('div', 'splash-mark');
  const size = () => opts.viewport?.() ?? { width: STAGE_W, height: STAGE_H };
  const fit = () => {
    const { width, height } = size();
    const b = coverBox(width, height, current);
    stage.style.transform = `translate(${b.left}px, ${b.top}px) scale(${b.scale})`;
    mark.style.transform = `scale(${markScale(width, height, current)})`;
  };
  const prompt = el('div', '');
  /** The logo drawn now (or its wordmark), and the src it was built from. */
  let logo: HTMLElement | null = null;
  let logoSrc = '';
  /** Whether power-on, newly on, plays its intro: not on a first showing that asked for none. */
  let introOk = opts.intro !== false;
  const showLogo = (l: ArtLogo) => {
    const src = l.src ?? opts.logoSrc ?? LOGO_SRC;
    const aspect = l.aspect ?? SPLASH_LOGO_ASPECT;
    if (src !== logoSrc || !logo) {
      logoSrc = src;
      const next = buildLogo(src);
      // A logo that won't load becomes the LOWLIGHT wordmark.
      next.querySelector('img.base')!.addEventListener(
        'error',
        () => {
          if (logo !== next) return;
          logo = el('div', 'splash-wordmark', 'LOWLIGHT');
          next.replaceWith(logo);
        },
        { once: true },
      );
      // The power-on intro runs once: its class goes when it ends, so nothing (e.g. landing's glitch-in) replays it.
      next.addEventListener('animationend', (e) => {
        if (e.target === next && e.animationName === 'logo-poweron') next.classList.remove('intro');
      });
      if (logo) logo.replaceWith(next);
      else mark.prepend(next);
      logo = next;
    }
    logo.style.height = `${SPLASH_GROUP_LOGO_W / aspect}px`;
    prompt.style.top = `${promptTop(aspect, l.promptGap)}px`;
    // One class per effect that's on; the wordmark takes none.
    if (logo.classList.contains('splash-logo')) {
      const on = l.effects ?? DEFAULT_LOGO_EFFECTS;
      // Power-on newly on (a new logo, or switched on): its intro plays.
      if (introOk && on.includes('power-on') && !logo.classList.contains('fx-power-on')) logo.classList.add('intro');
      for (const e of LOGO_EFFECTS) logo.classList.toggle(`fx-${e}`, on.includes(e));
    }
  };
  const show = (a: SplashArt) => {
    current = a;
    stage.style.width = `${a.width}px`;
    stage.style.height = `${a.height}px`;
    mark.style.left = `${a.logo.x}px`;
    mark.style.top = `${a.logo.y}px`;
    showLogo(a.logo);
    fit();
  };
  // A picked image that won't load: the built-in instead; the built-in failing leaves the skyline (no-art).
  artImg.addEventListener('error', () => {
    if (current.id === BUILT_IN.id) {
      root.classList.add('no-art');
      return;
    }
    artImg.src = BUILT_IN.src;
    show(BUILT_IN);
  });
  mark.append(prompt);
  show(current);
  introOk = true;
  window.addEventListener('resize', fit);
  const armed = () => {
    prompt.className = 'splash-prompt';
    prompt.textContent = ENTER_PROMPT;
    root.classList.add('sounding');
  };
  if (opts.needsSound) {
    prompt.className = 'splash-prompt quiet';
    prompt.textContent = SOUND_PROMPT;
  } else armed();
  stage.append(artImg, mark);
  root.append(stage);
  host.append(root);

  let leaving: Promise<void> | null = null;
  return {
    el: root,
    get art() {
      return current;
    },
    refit: fit,
    place(logo) {
      show({ ...current, logo });
    },
    replayIntro() {
      if (!logo?.classList.contains('fx-power-on')) return;
      // Off, a reflow, on again: the animation starts over.
      logo.classList.remove('intro');
      void logo.offsetWidth;
      logo.classList.add('intro');
    },
    destroy() {
      window.removeEventListener('resize', fit);
      root.remove();
    },
    setSceneOk(ok) {
      root.classList.toggle('no-scene', !ok);
    },
    arm: armed,
    dismiss() {
      leaving ??= new Promise<void>((resolve) => {
        window.removeEventListener('resize', fit);
        root.classList.add('out');
        const out = opts.reducedMotion ? Promise.resolve() : glitchOut(root, { reducedMotion: false });
        void out.then(() => {
          root.remove();
          resolve();
        });
      });
      return leaving;
    },
  };
}
