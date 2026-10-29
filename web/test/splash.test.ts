import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN, coverBox, groupHeight, SPLASH_GROUP_H, markScale, markSplashSeen, mountSplash, PROMPT_TUCK, promptTop, sessionSplashArt, shouldShowSplash, SPLASH_KEY, type SplashArt } from '../src/landing/splash';
import { SPLASH_LOGO_ASPECT } from '../../shared/splash';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('splash: once per session, and on every reload', () => {
  it('shows when the flag is missing, not once it is set, and always when storage throws', () => {
    expect(shouldShowSplash({ getItem: () => null })).toBe(true);
    expect(shouldShowSplash({ getItem: () => '1' })).toBe(false);
    expect(shouldShowSplash({ getItem: () => '1' }, 'navigate')).toBe(false);
    expect(shouldShowSplash({ getItem: () => '1' }, 'back_forward')).toBe(false);
    expect(shouldShowSplash({ getItem: () => { throw new Error('blocked'); } })).toBe(true);
    expect(() => markSplashSeen({ setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });

  it('a reload shows it even once seen', () => {
    expect(shouldShowSplash({ getItem: () => '1' }, 'reload')).toBe(true);
  });

  it('defaults to sessionStorage under lowlight.splashSeen', () => {
    expect(SPLASH_KEY).toBe('lowlight.splashSeen');
    expect(shouldShowSplash()).toBe(true);
    markSplashSeen();
    expect(sessionStorage.getItem('lowlight.splashSeen')).toBe('1');
    expect(shouldShowSplash()).toBe(false);
  });
});

describe('splash: overlay', () => {
  it('mounts the art, the logo layers and [ ENTER TO CONTINUE ]; dismiss glitches out over 0.6 s then removes it', async () => {
    const s = mountSplash(document.body, { reducedMotion: false });
    expect(s.el.querySelector('img.splash-art')!.getAttribute('src')).toBe('/splash/nix-wall.webp');
    const logo = s.el.querySelector<HTMLElement>('.splash-stage .splash-logo')!;
    expect(logo.getAttribute('role')).toBe('img');
    expect(logo.getAttribute('aria-label')).toBe('Lowlight');
    expect(logo.querySelector('img.base')!.getAttribute('src')).toBe('/lowlight-logo.webp');
    expect(logo.querySelectorAll('img.fringe')).toHaveLength(2);
    // Not .ghost: the room UI's style.css hides .ghost globally.
    expect(logo.querySelector('.ghost')).toBeNull();
    expect(logo.querySelectorAll('.slice img')).toHaveLength(2);
    expect(logo.querySelector('.crt')).not.toBeNull();
    expect(logo.querySelector('.shine')).not.toBeNull();
    // Not the tile band's class: band.css (TileBand) would move it off the logo.
    expect(logo.querySelector('.band')).toBeNull();
    expect(logo.style.getPropertyValue('--logo')).toBe('url("/lowlight-logo.webp")');
    expect(s.el.querySelector('.splash-stage .splash-prompt')!.textContent).toBe('[ ENTER TO CONTINUE ]');
    const done = s.dismiss();
    expect(s.el.classList.contains('out')).toBe(true);
    expect(s.el.classList.contains('glitch-out')).toBe(true);
    await vi.advanceTimersByTimeAsync(599);
    expect(document.querySelector('.splash')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(document.querySelector('.splash')).toBeNull();
  });

  it('a logo that fails to load becomes a LOWLIGHT wordmark', () => {
    const s = mountSplash(document.body, { reducedMotion: false });
    s.el.querySelector('.splash-logo img.base')!.dispatchEvent(new Event('error'));
    expect(s.el.querySelector('.splash-logo')).toBeNull();
    expect(s.el.querySelector('.splash-stage .splash-wordmark')!.textContent).toBe('LOWLIGHT');
  });

  it('the built-in art failing: .no-art, and the logo and prompt stay', () => {
    const s = mountSplash(document.body, { reducedMotion: false });
    expect(s.el.querySelector('img.splash-art')!.getAttribute('src')).toBe('/splash/nix-wall.webp');
    s.el.querySelector('img.splash-art')!.dispatchEvent(new Event('error'));
    expect(s.el.classList.contains('no-art')).toBe(true);
    expect(s.el.querySelector('.splash-logo')).not.toBeNull();
    expect(s.el.querySelector('.splash-prompt')).not.toBeNull();
  });

  const other: SplashArt = { id: 'other', src: '/api/splash-art/other.png', width: 2000, height: 1000, logo: { x: 1200, y: 100, width: 600 } };

  it('coverBox and markScale follow a different art', () => {
    const b = coverBox(900, 900, other);
    expect(b.scale).toBeCloseTo(0.9);
    expect(b.left + other.logo.x * b.scale).toBeGreaterThanOrEqual(24 - 0.0001);
    // A wide window: the group scales to this logo's width (600 of the drawn 727), no shrink.
    expect(markScale(1600, 900, other)).toBeCloseTo(600 / 727);
  });

  it("the stage is the art's size and the mark sits at its logo", () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: other });
    expect(s.el.querySelector<HTMLElement>('.splash-stage')!.style.width).toBe('2000px');
    expect(s.el.querySelector<HTMLElement>('.splash-stage')!.style.height).toBe('1000px');
    const mark = s.el.querySelector<HTMLElement>('.splash-mark')!;
    expect([mark.style.left, mark.style.top]).toEqual(['1200px', '100px']);
    expect(s.el.querySelector('img.splash-art')!.getAttribute('src')).toBe('/api/splash-art/other.png');
    expect(s.art.id).toBe('other');
  });

  it('a picked art that fails to load swaps to the built-in; the built-in failing marks no-art', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: other });
    s.el.querySelector('img.splash-art')!.dispatchEvent(new Event('error'));
    expect(s.art.id).toBe('built-in');
    expect(s.el.querySelector('img.splash-art')!.getAttribute('src')).toBe('/splash/nix-wall.webp');
    expect(s.el.querySelector<HTMLElement>('.splash-stage')!.style.width).toBe('1531px');
    expect(s.el.classList.contains('no-art')).toBe(false);
    s.el.querySelector('img.splash-art')!.dispatchEvent(new Event('error'));
    expect(s.el.classList.contains('no-art')).toBe(true);
  });

  it('viewport() drives the fit, refit() re-reads it, and place(logo) moves the mark', () => {
    let size = { width: 800, height: 450 };
    const s = mountSplash(document.body, { reducedMotion: true, art: other, viewport: () => size });
    const stage = s.el.querySelector<HTMLElement>('.splash-stage')!;
    const at800 = stage.style.transform;
    expect(at800).toContain(`scale(${coverBox(800, 450, other).scale})`);
    size = { width: 1600, height: 900 };
    s.refit();
    expect(stage.style.transform).not.toBe(at800);
    s.place({ x: 300, y: 50, width: 500 });
    const mark = s.el.querySelector<HTMLElement>('.splash-mark')!;
    expect([mark.style.left, mark.style.top]).toEqual(['300px', '50px']);
    expect(s.art.logo).toEqual({ x: 300, y: 50, width: 500 });
    expect(mark.style.transform).toBe(`scale(${markScale(1600, 900, s.art)})`);
  });

  it('without a viewport it covers the 1600×900 game stage, whatever the window (fixed stage §4)', () => {
    vi.stubGlobal('innerWidth', 900);
    vi.stubGlobal('innerHeight', 2000);
    expect(coverBox(900, 2000, other).scale).not.toBe(coverBox(1600, 900, other).scale);
    const s = mountSplash(document.body, { reducedMotion: true, art: other });
    const stage = s.el.querySelector<HTMLElement>('.splash-stage')!;
    expect(stage.style.transform).toContain(`scale(${coverBox(1600, 900, other).scale})`);
    s.destroy();
    vi.unstubAllGlobals();
  });

  it('destroy() removes it at once and stops listening for resizes', () => {
    let calls = 0;
    const s = mountSplash(document.body, { reducedMotion: true, viewport: () => (calls++, { width: 800, height: 450 }) });
    s.destroy();
    expect(document.querySelector('.splash')).toBeNull();
    const before = calls;
    window.dispatchEvent(new Event('resize'));
    expect(calls).toBe(before);
  });

  it('a 0×0 viewport gives no NaN in any transform (Review Focus 5)', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: other, viewport: () => ({ width: 0, height: 0 }) });
    for (const e of s.el.querySelectorAll<HTMLElement>('.splash-stage, .splash-mark')) expect(e.style.transform).not.toMatch(/NaN|Infinity/);
  });

  it('coverBox: the art covers the window, centred across and 30% down, like object-position 50% 30%', () => {
    // Wide: the width decides; the art overflows top and bottom.
    const wide = coverBox(1600, 900, BUILT_IN);
    expect(wide.scale).toBeCloseTo(1600 / BUILT_IN.width);
    expect(wide.left).toBeCloseTo(0);
    expect(wide.top).toBeCloseTo((900 - BUILT_IN.height * (1600 / BUILT_IN.width)) * 0.3);
    // Tall: the height decides; the art overflows left and right (centred, unless that would cut the logo).
    const tall = coverBox(1450, 1000, BUILT_IN);
    expect(tall.scale).toBeCloseTo(1000 / BUILT_IN.height);
    expect(tall.left).toBeCloseTo((1450 - BUILT_IN.width * (1000 / BUILT_IN.height)) * 0.5);
    expect(tall.top).toBeCloseTo(0);
  });

  it('coverBox keeps the logo at least 24 px inside the window: the crop shifts, the logo stays on the art', () => {
    for (const [w, h] of [[1100, 900], [700, 1000], [1600, 700], [2400, 900]]) {
      const b = coverBox(w, h, BUILT_IN);
      expect(b.scale).toBeCloseTo(Math.max(w / BUILT_IN.width, h / BUILT_IN.height)); // still covers
      expect(b.left).toBeLessThanOrEqual(0.0001);
      expect(b.left).toBeGreaterThanOrEqual(w - BUILT_IN.width * b.scale - 0.0001);
      expect(b.top).toBeLessThanOrEqual(0.0001);
      expect(b.top).toBeGreaterThanOrEqual(h - BUILT_IN.height * b.scale - 0.0001);
      expect(b.left + BUILT_IN.logo.x * b.scale).toBeGreaterThanOrEqual(24 - 0.0001);
      expect(b.top + BUILT_IN.logo.y * b.scale).toBeGreaterThanOrEqual(24 - 0.0001);
    }
  });

  it('on a very short, wide window the group shrinks so the prompt stays 24 px inside the bottom', () => {
    for (const [w, h] of [[2560, 400], [1920, 500]]) {
      const b = coverBox(w, h, BUILT_IN);
      const k = markScale(w, h, BUILT_IN);
      expect(b.top + (BUILT_IN.logo.y + SPLASH_GROUP_H * k) * b.scale).toBeLessThanOrEqual(h - 24 + 0.0001);
    }
    expect(markScale(1600, 900, BUILT_IN)).toBe(1);
  });

  it('markScale shrinks the logo and prompt only when the logo would not fit the window', () => {
    expect(markScale(1600, 900, BUILT_IN)).toBe(1);
    expect(markScale(1100, 900, BUILT_IN)).toBe(1);
    for (const [w, h] of [[375, 812], [600, 900]]) {
      const b = coverBox(w, h, BUILT_IN);
      const k = markScale(w, h, BUILT_IN);
      expect(k).toBeLessThan(1);
      expect(b.left + BUILT_IN.logo.x * b.scale).toBeGreaterThanOrEqual(24 - 0.0001);
      expect(b.left + (BUILT_IN.logo.x + BUILT_IN.logo.width * k) * b.scale).toBeLessThanOrEqual(w - 24 + 0.0001);
    }
  });

  it('the logo and prompt are one group on the art, scaled by markScale', () => {
    vi.stubGlobal('innerWidth', 375);
    vi.stubGlobal('innerHeight', 812);
    const s = mountSplash(document.body, { reducedMotion: true });
    const mark = s.el.querySelector<HTMLElement>('.splash-stage .splash-mark')!;
    expect(mark.querySelector('.splash-logo')).not.toBeNull();
    expect(mark.querySelector('.splash-prompt')).not.toBeNull();
    // On the game stage the fit is always 1600×900's, whatever the window.
    expect(mark.style.transform).toBe(`scale(${markScale(1600, 900, BUILT_IN)})`);
    vi.unstubAllGlobals();
  });

  it('the logo and prompt sit on the art (same stage), so they keep their place on it at any window shape; resizing stops once dismissed', async () => {
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 1000);
    const s = mountSplash(document.body, { reducedMotion: true });
    const stage = s.el.querySelector<HTMLElement>('.splash-stage')!;
    expect(stage.querySelector('img.splash-art')).not.toBeNull();
    expect(stage.querySelector('.splash-logo')).not.toBeNull();
    expect(stage.style.width).toBe(`${BUILT_IN.width}px`);
    expect(stage.style.height).toBe(`${BUILT_IN.height}px`);
    const b = coverBox(1600, 900, BUILT_IN);
    expect(stage.style.transform).toBe(`translate(${b.left}px, ${b.top}px) scale(${b.scale})`);
    await s.dismiss();
    vi.stubGlobal('innerWidth', 1600);
    window.dispatchEvent(new Event('resize'));
    expect(stage.style.transform).toBe(`translate(${b.left}px, ${b.top}px) scale(${b.scale})`);
    vi.unstubAllGlobals();
  });

  it('reduced motion: still, and dismiss is instant with no glitch', async () => {
    const s = mountSplash(document.body, { reducedMotion: true });
    expect(s.el.classList.contains('still')).toBe(true);
    const done = s.dismiss();
    expect(s.el.classList.contains('glitch-out')).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(document.querySelector('.splash')).toBeNull();
  });

  it('needing sound: a quiet "for sound" prompt until armed, then the blinking [ ENTER TO CONTINUE ]', () => {
    const s = mountSplash(document.body, { reducedMotion: false, needsSound: true });
    const prompt = s.el.querySelector('.splash-prompt')!;
    expect(prompt.textContent).toBe('▶ CLICK OR PRESS ANY KEY FOR SOUND');
    expect(prompt.classList.contains('quiet')).toBe(true);
    expect(s.el.classList.contains('sounding')).toBe(false);
    s.arm();
    expect(prompt.textContent).toBe('[ ENTER TO CONTINUE ]');
    expect(prompt.classList.contains('quiet')).toBe(false);
    expect(s.el.classList.contains('sounding')).toBe(true);
  });

  it('already sounding (autoplay allowed, or no audio): [ ENTER TO CONTINUE ] from the start', () => {
    const s = mountSplash(document.body, { reducedMotion: false, needsSound: false });
    expect(s.el.querySelector('.splash-prompt')!.textContent).toBe('[ ENTER TO CONTINUE ]');
  });

  it('dismissing twice is harmless', async () => {
    const s = mountSplash(document.body, { reducedMotion: false });
    const a = s.dismiss();
    const b = s.dismiss();
    await vi.advanceTimersByTimeAsync(600);
    await Promise.all([a, b]);
    expect(document.querySelector('.splash')).toBeNull();
  });
});

describe('splash: any logo shape (spec 2026-10-11 splash logos §3, §5)', () => {
  const square: SplashArt = { id: 'sq', src: '/api/splash-art/sq.png', width: 1600, height: 900, logo: { id: 'emblem', x: 67, y: 117, width: 400, src: '/api/splash-logo-art/emblem.png', aspect: 1 } };
  const prompt = (s: { el: HTMLElement }) => s.el.querySelector<HTMLElement>('.splash-prompt')!;
  const logoEl = (s: { el: HTMLElement }) => s.el.querySelector<HTMLElement>('.splash-logo')!;

  it('with the built-in logo the prompt sits at 210 px and the group is 245 tall', () => {
    const s = mountSplash(document.body, { reducedMotion: true });
    expect(prompt(s).style.top).toBe('210px');
    expect(parseFloat(logoEl(s).style.height)).toBeCloseTo((727 * 670) / 2000);
    expect(SPLASH_GROUP_H).toBe(245);
    expect(promptTop(SPLASH_LOGO_ASPECT)).toBeCloseTo(210);
    expect(groupHeight(SPLASH_LOGO_ASPECT)).toBeCloseTo(245);
  });

  it('a square logo: drawn 727 tall from its own src, the prompt under its bottom edge', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: square });
    expect(logoEl(s).querySelector('img.base')!.getAttribute('src')).toBe('/api/splash-logo-art/emblem.png');
    expect(logoEl(s).style.getPropertyValue('--logo')).toBe('url("/api/splash-logo-art/emblem.png")');
    expect(logoEl(s).style.height).toBe('727px');
    expect(parseFloat(prompt(s).style.top)).toBeCloseTo(727 - PROMPT_TUCK);
  });

  it('place() with another logo swaps the image and the prompt', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: { ...square, logo: { x: 67, y: 117, width: 400 } } });
    expect(logoEl(s).querySelector('img.base')!.getAttribute('src')).toBe('/lowlight-logo.webp');
    s.place(square.logo);
    expect(logoEl(s).querySelector('img.base')!.getAttribute('src')).toBe('/api/splash-logo-art/emblem.png');
    expect(parseFloat(prompt(s).style.top)).toBeCloseTo(727 - PROMPT_TUCK);
    expect(s.el.querySelectorAll('.splash-logo')).toHaveLength(1);
    s.place({ x: 67, y: 117, width: 400 });
    expect(logoEl(s).querySelector('img.base')!.getAttribute('src')).toBe('/lowlight-logo.webp');
    expect(prompt(s).style.top).toBe('210px');
  });

  it("markScale keeps a tall logo's prompt inside the window", () => {
    const tall: SplashArt = { ...square, logo: { x: 50, y: 300, width: 300, src: '/x.png', aspect: 0.5 } };
    const b = coverBox(1600, 900, tall);
    const k = markScale(1600, 900, tall);
    expect(k).toBeLessThan(300 / 727);
    expect(b.top + (tall.logo.y + groupHeight(0.5) * k) * b.scale).toBeLessThanOrEqual(900 - 24 + 0.0001);
  });

  it('a session pick from before logos (no src/aspect) shows the built-in logo at 210 px', () => {
    sessionStorage.setItem('lowlight.splashPick', JSON.stringify({ id: 'old', src: '/api/splash-art/old.png', width: 1600, height: 900, logo: { x: 70, y: 70, width: 700 } }));
    const art = sessionSplashArt();
    expect(art).not.toBeNull();
    const s = mountSplash(document.body, { reducedMotion: true, art: art! });
    expect(logoEl(s).querySelector('img.base')!.getAttribute('src')).toBe('/lowlight-logo.webp');
    expect(prompt(s).style.top).toBe('210px');
  });

  it("Studio's logoSrc override still draws the built-in from its own route", () => {
    const s = mountSplash(document.body, { reducedMotion: true, logoSrc: '/api/splash-logo' });
    expect(logoEl(s).querySelector('img.base')!.getAttribute('src')).toBe('/api/splash-logo');
  });
});

describe('splash: logo effects (spec 2026-10-11 logo effects §4)', () => {
  const fx = (s: { el: HTMLElement }) => [...s.el.querySelector<HTMLElement>('.splash-logo')!.classList].filter((c) => c.startsWith('fx-'));
  const FIVE = ['fx-glow', 'fx-fringe', 'fx-scanlines', 'fx-shine', 'fx-glitch'];
  const own = { x: 67, y: 117, width: 400, src: '/api/splash-logo-art/l.png', aspect: 3 };

  it('the built-in logo has exactly the five fx- classes', () => {
    expect(fx(mountSplash(document.body, { reducedMotion: true }))).toEqual(FIVE);
  });

  it('a session pick from before effects (no list) has the five', () => {
    sessionStorage.setItem('lowlight.splashPick', JSON.stringify({ id: 'old', src: '/a.png', width: 1600, height: 900, logo: { x: 70, y: 70, width: 700 } }));
    expect(fx(mountSplash(document.body, { reducedMotion: true, art: sessionSplashArt()! }))).toEqual(FIVE);
  });

  it('a logo with glitch and power-on has only those two', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: { id: 'a', src: '/a.png', width: 1600, height: 900, logo: { ...own, effects: ['glitch', 'power-on'] } } });
    expect(fx(s)).toEqual(['fx-glitch', 'fx-power-on']);
  });

  it('place() with other effects swaps the classes, keeping the same logo element', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: { id: 'a', src: '/a.png', width: 1600, height: 900, logo: { ...own, effects: ['glitch'] } } });
    const before = s.el.querySelector('.splash-logo');
    s.place({ ...own, effects: ['pulse', 'hologram'] });
    expect(s.el.querySelector('.splash-logo')).toBe(before);
    expect(fx(s)).toEqual(['fx-pulse', 'fx-hologram']);
    s.place({ ...own, effects: [] });
    expect(fx(s)).toEqual([]);
  });

  const ended = (el: Element, name: string) => {
    const e = new Event('animationend');
    Object.defineProperty(e, 'animationName', { value: name });
    el.dispatchEvent(e);
  };

  it("power-on runs as the logo's intro class, cleared when it ends; a later glitch-in can't replay it (review: Task 2, 2)", () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: { id: 'a', src: '/a.png', width: 1600, height: 900, logo: { ...own, effects: ['power-on'] } } });
    const logo = s.el.querySelector<HTMLElement>('.splash-logo')!;
    expect(logo.classList.contains('intro')).toBe(true);
    ended(logo, 'glitch-in');
    expect(logo.classList.contains('intro')).toBe(true);
    ended(logo, 'logo-poweron');
    expect(logo.classList.contains('intro')).toBe(false);
    expect(logo.classList.contains('fx-power-on')).toBe(true);
    s.place({ ...own, effects: ['power-on', 'pulse'] });
    expect(logo.classList.contains('intro')).toBe(false);
    s.place({ ...own, effects: ['pulse'] });
    s.place({ ...own, effects: ['pulse', 'power-on'] });
    expect(logo.classList.contains('intro')).toBe(true);
  });

  it('replayIntro() restarts power-on; with power-on off it leaves the classes alone', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: { id: 'a', src: '/a.png', width: 1600, height: 900, logo: { ...own, effects: ['power-on'] } } });
    const logo = s.el.querySelector<HTMLElement>('.splash-logo')!;
    ended(logo, 'logo-poweron');
    const remove = vi.spyOn(logo.classList, 'remove');
    s.replayIntro();
    expect(remove).toHaveBeenCalledWith('intro');
    expect(logo.classList.contains('intro')).toBe(true);
    s.place({ ...own, effects: ['glitch'] });
    remove.mockClear();
    s.replayIntro();
    expect(remove).not.toHaveBeenCalled();
    expect(fx(s)).toEqual(['fx-glitch']);
  });

  it('the wordmark fallback has no fx- classes', () => {
    const s = mountSplash(document.body, { reducedMotion: true });
    s.el.querySelector('.splash-logo img.base')!.dispatchEvent(new Event('error'));
    const mark = s.el.querySelector<HTMLElement>('.splash-wordmark')!;
    expect([...mark.classList].filter((c) => c.startsWith('fx-'))).toEqual([]);
    s.place({ x: 67, y: 117, width: 727, effects: ['pulse'] });
    expect([...s.el.querySelector<HTMLElement>('.splash-wordmark')!.classList].filter((c) => c.startsWith('fx-'))).toEqual([]);
  });

  it('the halo and band layers are always built', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: { id: 'a', src: '/a.png', width: 1600, height: 900, logo: { ...own, effects: [] } } });
    const logo = s.el.querySelector('.splash-logo')!;
    expect(logo.firstElementChild!.matches('img.halo')).toBe(true);
    expect(logo.querySelector('img.halo')!.getAttribute('src')).toBe('/api/splash-logo-art/l.png');
    expect(logo.querySelector('.holo-band')).not.toBeNull();
  });
});

describe('splash: prompt gap (2026-10-11)', () => {
  const art = (promptGap?: number): SplashArt => ({ id: 'a', src: '/a.png', width: 1600, height: 900, logo: { x: 67, y: 117, width: 727, src: '/l.png', aspect: 3, ...(promptGap === undefined ? {} : { promptGap }) } });
  const top = (s: { el: HTMLElement }) => parseFloat(s.el.querySelector<HTMLElement>('.splash-prompt')!.style.top);

  it('no gap: as today (the built-in still at 210 px); a gap puts the prompt that far under the logo', () => {
    expect(mountSplash(document.body, { reducedMotion: true }).el.querySelector<HTMLElement>('.splash-prompt')!.style.top).toBe('210px');
    expect(top(mountSplash(document.body, { reducedMotion: true, art: art() }))).toBeCloseTo(727 / 3 - PROMPT_TUCK);
    expect(top(mountSplash(document.body, { reducedMotion: true, art: art(15) }))).toBeCloseTo(727 / 3 + 15);
    expect(promptTop(3, 15)).toBeCloseTo(727 / 3 + 15);
    expect(groupHeight(3, 15)).toBeCloseTo(727 / 3 + 15 + 35);
  });

  it('place() with another gap moves the prompt', () => {
    const s = mountSplash(document.body, { reducedMotion: true, art: art() });
    s.place({ ...art().logo, promptGap: 100 });
    expect(top(s)).toBeCloseTo(727 / 3 + 100);
  });

  it('markScale keeps a prompt with a big gap inside the window', () => {
    const a = { ...art(200), logo: { ...art(200).logo, y: 400 } };
    const b = coverBox(1600, 900, a);
    const k = markScale(1600, 900, a);
    expect(b.top + (a.logo.y + groupHeight(3, 200) * k) * b.scale).toBeLessThanOrEqual(900 - 24 + 0.0001);
  });
});
