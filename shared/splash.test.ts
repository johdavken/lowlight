import { describe, expect, it } from 'vitest';
import { BUILT_IN_THEME, checkSplash, readSplashTheme, songTitle, clampLogo, PROMPT_GAP_MAX, PROMPT_GAP_MIN, DEFAULT_LOGO_EFFECTS, logoEffects, defaultLogo, logoAspect, logoFits, readSplashEntry, readSplashLogo, splashId, splashLibrarySchema, splashLogoEntries, splashLogoId, SPLASH_LOGO_ASPECT, type SplashEntry } from './splash';

const seed: SplashEntry = { id: 'nix-wall', name: 'Nix against the wall', file: 'nix-wall.webp', width: 1531, height: 1027, on: true, logo: { x: 67, y: 117, width: 727 } };

describe('splash library schema', () => {
  it('accepts the seed and rejects a missing logo, another version, a negative width', () => {
    expect(splashLibrarySchema.safeParse({ version: 1, splashes: [seed] }).success).toBe(true);
    const { logo: _logo, ...noLogo } = seed;
    expect(splashLibrarySchema.safeParse({ version: 1, splashes: [noLogo] }).success).toBe(false);
    expect(splashLibrarySchema.safeParse({ version: 2, splashes: [seed] }).success).toBe(false);
    expect(splashLibrarySchema.safeParse({ version: 1, splashes: [{ ...seed, width: -1 }] }).success).toBe(false);
  });

  it("splashId never gives 'built-in' (the game's own fallback)", () => {
    expect(splashId('Built in', new Set())).toBe('built-in-2');
  });

  it('splashId slugs the name and adds -2 when taken', () => {
    expect(splashId('Nix against the wall', new Set())).toBe('nix-against-the-wall');
    expect(splashId('Nix against the wall', new Set(['nix-against-the-wall']))).toBe('nix-against-the-wall-2');
  });

  it('checkSplash: null for the seed; a message when the logo leaves the image or its width is out of 15–90%', () => {
    expect(checkSplash(seed)).toBeNull();
    expect(checkSplash({ ...seed, logo: { x: 900, y: 117, width: 727 } })).toMatch(/inside/);
    expect(checkSplash({ ...seed, logo: { x: 67, y: 1000, width: 727 } })).toMatch(/inside/);
    expect(checkSplash({ ...seed, logo: { x: 67, y: 117, width: 100 } })).toMatch(/15/);
    expect(checkSplash({ ...seed, logo: { x: 0, y: 0, width: 1500 } })).toMatch(/90/);
  });

  it('checkSplash refuses a placement that is not a number', () => {
    expect(checkSplash({ ...seed, logo: { x: Number.NaN, y: 117, width: 727 } })).toMatch(/number/);
  });

  it('defaultLogo is the seed spot, scaled to the image', () => {
    expect(defaultLogo(1531, 1027)).toEqual({ x: 67, y: 117, width: 727 });
    expect(defaultLogo(3062, 2054)).toEqual({ x: 135, y: 234, width: 1454 });
  });

  it('clampLogo keeps it inside the image and between 15% and 90% wide', () => {
    expect(clampLogo({ x: -50, y: 10, width: 727 }, 1531, 1027)).toEqual({ x: 0, y: 10, width: 727 });
    expect(clampLogo({ x: 1400, y: 10, width: 727 }, 1531, 1027).x).toBe(1531 - 727);
    const tall = clampLogo({ x: 0, y: 1020, width: 727 }, 1531, 1027);
    expect(tall.y + tall.width / SPLASH_LOGO_ASPECT).toBeLessThanOrEqual(1027);
    expect(clampLogo({ x: 0, y: 0, width: 10 }, 1531, 1027).width).toBe(Math.round(1531 * 0.15));
    expect(clampLogo({ x: 0, y: 0, width: 5000 }, 1531, 1027).width).toBe(Math.round(1531 * 0.9));
  });
});

describe('splash logos', () => {
  const emblem = { id: 'emblem', name: 'Eye emblem', file: 'emblem.png', width: 900, height: 900 };

  it("today's splashes.json parses; logos and logo.id are accepted", () => {
    expect(splashLibrarySchema.safeParse({ version: 1, splashes: [seed] }).success).toBe(true);
    expect(splashLibrarySchema.safeParse({ version: 1, logos: [emblem], splashes: [{ ...seed, logo: { ...seed.logo, id: 'emblem' } }] }).success).toBe(true);
  });

  it("refuses the reserved 'lowlight' id (logo entry and logo.id) and a bad logo file", () => {
    expect(readSplashLogo(emblem).entry).toEqual(emblem);
    expect(readSplashLogo({ ...emblem, id: 'lowlight' }).entry).toBeNull();
    expect(readSplashEntry({ ...seed, logo: { ...seed.logo, id: 'lowlight' } }).entry).toBeNull();
    expect(readSplashLogo({ ...emblem, file: '../x.png' }).entry).toBeNull();
  });

  it('splashLogoEntries: [] when logos is missing or not a list', () => {
    expect(splashLogoEntries({ version: 1, splashes: [] })).toEqual([]);
    expect(splashLogoEntries({ version: 1, logos: 'x', splashes: [] })).toEqual([]);
    expect(splashLogoEntries({ version: 1, logos: [emblem], splashes: [] })).toEqual([emblem]);
  });

  it("splashLogoId never gives 'lowlight'", () => {
    expect(splashLogoId('Lowlight', new Set())).toBe('lowlight-2');
    expect(splashLogoId('Eye emblem', new Set())).toBe('eye-emblem');
  });

  it('logoAspect: built-in for no id, the entry for a known one, null for unknown', () => {
    expect(logoAspect(undefined, [emblem])).toBe(SPLASH_LOGO_ASPECT);
    expect(logoAspect('emblem', [emblem])).toBe(1);
    expect(logoAspect('gone', [emblem])).toBeNull();
  });

  it('checkSplash and clampLogo use the aspect: a square logo is as tall as it is wide', () => {
    // y 400: 400 + 727 = 1127 > 1027.
    expect(checkSplash({ ...seed, logo: { x: 67, y: 400, width: 727 } }, 1)).toMatch(/inside/);
    expect(checkSplash({ ...seed, logo: { x: 67, y: 400, width: 727 } })).toBeNull();
    expect(clampLogo({ id: 'emblem', x: 0, y: 900, width: 727 }, 1531, 1027, 1)).toEqual({ id: 'emblem', x: 0, y: 300, width: 727 });
  });

  it('clampLogo shrinks a logo too tall for the image until it fits (review: Task 4, 1)', () => {
    const c = clampLogo({ id: 'x', x: 50, y: 50, width: 800 }, 1000, 500, 1);
    expect(c).toEqual({ id: 'x', x: 50, y: 0, width: 500 });
    expect(checkSplash({ ...seed, width: 1000, height: 500, logo: c }, 1)).toBeNull();
  });

  it('logoFits: false when the logo at 15% width is taller than the image', () => {
    expect(logoFits(1, 1531, 1027)).toBe(true);
    expect(logoFits(0.1, 1531, 1027)).toBe(false);
  });
});

describe('logo effects (spec 2026-10-11 logo effects §3)', () => {
  const emblem = { id: 'emblem', name: 'Eye emblem', file: 'emblem.png', width: 900, height: 900 };

  it('logo effects: the eight are accepted, others refused', () => {
    expect(readSplashLogo({ ...emblem, effects: ['glow', 'fringe', 'scanlines', 'shine', 'glitch', 'pulse', 'hologram', 'power-on'] }).entry).not.toBeNull();
    expect(readSplashLogo({ ...emblem, effects: ['glitch', 'power-on'] }).entry).toEqual({ ...emblem, effects: ['glitch', 'power-on'] });
    expect(readSplashLogo({ ...emblem, effects: ['sparkle'] }).entry).toBeNull();
  });

  it('logoEffects: the five for a missing list or no entry, [] for empty, ordered and unrepeated', () => {
    expect(DEFAULT_LOGO_EFFECTS).toEqual(['glow', 'fringe', 'scanlines', 'shine', 'glitch']);
    expect(logoEffects()).toEqual(DEFAULT_LOGO_EFFECTS);
    expect(logoEffects({})).toEqual(DEFAULT_LOGO_EFFECTS);
    expect(logoEffects({ effects: [] })).toEqual([]);
    expect(logoEffects({ effects: ['power-on', 'glitch', 'glitch'] })).toEqual(['glitch', 'power-on']);
  });
});

describe('prompt gap (2026-10-11)', () => {
  const emblem = { id: 'emblem', name: 'Eye emblem', file: 'emblem.png', width: 900, height: 900 };
  it('a logo may carry a promptGap from -120 to 200', () => {
    expect(readSplashLogo({ ...emblem, promptGap: 15 }).entry).toEqual({ ...emblem, promptGap: 15 });
    expect(readSplashLogo({ ...emblem, promptGap: -120 }).entry).not.toBeNull();
    expect(readSplashLogo({ ...emblem, promptGap: 201 }).entry).toBeNull();
    expect(readSplashLogo({ ...emblem, promptGap: 'x' }).entry).toBeNull();
    expect([PROMPT_GAP_MIN, PROMPT_GAP_MAX]).toEqual([-120, 200]);
  });
});

describe('menu theme', () => {
  it('reads a pack song or a menu-only song; a missing theme is the built-in', () => {
    expect(readSplashTheme({ version: 1, splashes: [] })).toEqual({ theme: null, problem: null });
    expect(readSplashTheme({ version: 1, splashes: [], theme: { pack: 'karasu', file: 'Nix.ogg' } })).toEqual({ theme: { pack: 'karasu', file: 'Nix.ogg' }, problem: null });
    expect(readSplashTheme({ version: 1, splashes: [], theme: { file: 'Neon Rain (2).ogg' } })).toEqual({ theme: { file: 'Neon Rain (2).ogg' }, problem: null });
    expect(splashLibrarySchema.safeParse({ version: 1, splashes: [], theme: { pack: 'karasu', file: 'Nix.ogg' } }).success).toBe(true);
  });

  it('refuses a path, a dot file, a non-ogg, a bad pack', () => {
    for (const theme of [{ file: '../x.ogg' }, { file: 'a/b.ogg' }, { file: '.converting-1.ogg' }, { file: 'x.mp3' }, { pack: '../scenes', file: 'Nix.ogg' }, { pack: 'karasu' }, 'Nix.ogg']) {
      const r = readSplashTheme({ version: 1, splashes: [], theme });
      expect(r.theme).toBeNull();
      expect(r.problem).toMatch(/theme/);
    }
  });

  it('the built-in theme is the game’s own file, and a song’s title is its file name', () => {
    expect(BUILT_IN_THEME).toEqual({ title: 'Lost in Lowlight', url: '/sound/music/Lost%20in%20Lowlight.ogg' });
    expect(songTitle('Neon Rain (2).ogg')).toBe('Neon Rain (2)');
  });
});
