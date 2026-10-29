import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSplash, SPLASH_LOGO_ASPECT, type SplashEntry, type SplashLogoEntry } from '../../shared/splash';
import { registerSplashRoutes } from '../src/splash-routes';

let dir: string;
const png = () => PNG.sync.write(new PNG({ width: 16, height: 9 }));
const entry = (o: Partial<SplashEntry> & { id: string }): SplashEntry => ({ name: o.id, file: `${o.id}.png`, width: 1600, height: 900, on: true, logo: { x: 70, y: 70, width: 760 }, ...o });
function library(splashes: SplashEntry[], files = splashes.map((s) => s.file), logos?: SplashLogoEntry[], logoFiles = (logos ?? []).map((l) => l.file)) {
  fs.writeFileSync(path.join(dir, 'splashes.json'), JSON.stringify({ version: 1, ...(logos ? { logos } : {}), splashes }));
  for (const f of files) fs.writeFileSync(path.join(dir, f), png());
  fs.mkdirSync(path.join(dir, 'logos'), { recursive: true });
  for (const f of logoFiles) fs.writeFileSync(path.join(dir, 'logos', f), png());
}
const emblem: SplashLogoEntry = { id: 'emblem', name: 'Eye emblem', file: 'emblem.png', width: 900, height: 900 };
const FIVE = ['glow', 'fringe', 'scanlines', 'shine', 'glitch'];
const BUILT_IN = { src: '/lowlight-logo.webp', aspect: SPLASH_LOGO_ASPECT, effects: FIVE };
async function app() {
  const warn = vi.fn();
  const a = Fastify();
  registerSplashRoutes(a, dir, warn, path.join(dir, 'scenes-root'));
  await a.ready();
  return { a, warn };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splash-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('GET /api/splashes', () => {
  it('lists only the entries that are on, with url /api/splash-art/<file>', async () => {
    library([entry({ id: 'nix-wall' }), entry({ id: 'roof', on: false })]);
    const { a } = await app();
    const res = await a.inject('/api/splashes');
    expect(res.json()).toEqual({ splashes: [{ id: 'nix-wall', url: '/api/splash-art/nix-wall.png', width: 1600, height: 900, logo: { x: 70, y: 70, width: 760, ...BUILT_IN } }] });
  });

  it('skips (and warns about) an entry whose file is missing or whose placement is bad; the rest still list', async () => {
    library([entry({ id: 'ok' }), entry({ id: 'gone' }), entry({ id: 'off-edge', logo: { x: 1500, y: 70, width: 760 } })], ['ok.png', 'off-edge.png']);
    const { a, warn } = await app();
    expect((await a.inject('/api/splashes')).json().splashes.map((s: { id: string }) => s.id)).toEqual(['ok']);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('one hand-broken entry (a bad file name, no logo) is skipped with a warning; the rest still rotate (final review 1)', async () => {
    library([entry({ id: 'ok' })]);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'splashes.json'), 'utf8'));
    raw.splashes.push({ ...entry({ id: 'bad' }), file: 'My Pic.png' }, { id: 'nologo', name: 'x', file: 'nologo.png', width: 10, height: 10, on: true });
    fs.writeFileSync(path.join(dir, 'splashes.json'), JSON.stringify(raw));
    const { a, warn } = await app();
    expect((await a.inject('/api/splashes')).json().splashes.map((x: { id: string }) => x.id)).toEqual(['ok']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect((await a.inject('/api/splash-art/ok.png')).statusCode).toBe(200);
  });

  it('an invalid splashes.json lists nothing and warns; a missing dir lists nothing', async () => {
    fs.writeFileSync(path.join(dir, 'splashes.json'), '{ not json');
    const { a, warn } = await app();
    expect((await a.inject('/api/splashes')).json()).toEqual({ splashes: [] });
    expect(warn).toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
    expect((await a.inject('/api/splashes')).json()).toEqual({ splashes: [] });
  });

  it('reads the manifest per request: an edit shows without a restart', async () => {
    library([entry({ id: 'one' })]);
    const { a } = await app();
    expect((await a.inject('/api/splashes')).json().splashes).toHaveLength(1);
    library([entry({ id: 'one' }), entry({ id: 'two' })]);
    expect((await a.inject('/api/splashes')).json().splashes).toHaveLength(2);
  });
});

describe('GET /api/splash-art/:file', () => {
  it('serves a manifest file with its image type', async () => {
    library([entry({ id: 'nix-wall' })]);
    const { a } = await app();
    const res = await a.inject('/api/splash-art/nix-wall.png');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('refuses a path outside the library and a file the manifest does not name', async () => {
    library([entry({ id: 'nix-wall' })], ['nix-wall.png', 'stray.png']);
    fs.writeFileSync(path.join(path.dirname(dir), 'outside.png'), png());
    const { a } = await app();
    expect((await a.inject('/api/splash-art/..%2Foutside.png')).statusCode).toBe(404);
    expect((await a.inject('/api/splash-art/%2Fetc%2Fpasswd')).statusCode).toBe(404);
    expect((await a.inject('/api/splash-art/stray.png')).statusCode).toBe(404);
  });
});

describe('splash logos (spec 2026-10-11 splash logos §5)', () => {
  const list = async (a: Awaited<ReturnType<typeof app>>['a']) => (await a.inject('/api/splashes')).json().splashes as { id: string; logo: { x: number; y: number; width: number; src: string; aspect: number } }[];

  it('a splash with no logo id gets the built-in src and aspect', async () => {
    library([entry({ id: 'a' })], undefined, [emblem]);
    const { a } = await app();
    expect((await list(a))[0]!.logo).toEqual({ x: 70, y: 70, width: 760, ...BUILT_IN });
  });

  it('a splash with a library logo gets its art route and aspect', async () => {
    library([entry({ id: 'a', logo: { id: 'emblem', x: 70, y: 70, width: 400 } })], undefined, [emblem]);
    const { a, warn } = await app();
    expect((await list(a))[0]!.logo).toEqual({ x: 70, y: 70, width: 400, src: '/api/splash-logo-art/emblem.png', aspect: 1, effects: FIVE });
    expect(warn).not.toHaveBeenCalled();
  });

  it('an unknown logo id, or a logo whose file is gone, falls back to the built-in, clamped, with a warning', async () => {
    // At y 800 the built-in (760 wide → 255 tall) leaves the 900-tall image: it's clamped back in.
    library([entry({ id: 'unknown', logo: { id: 'nope', x: 70, y: 800, width: 760 } }), entry({ id: 'nofile', logo: { id: 'emblem', x: 70, y: 70, width: 400 } })], undefined, [emblem], []);
    const { a, warn } = await app();
    const got = await list(a);
    expect(got.map((s) => s.id)).toEqual(['unknown', 'nofile']);
    for (const s of got) {
      expect(s.logo.src).toBe(BUILT_IN.src);
      expect(s.logo.aspect).toBe(SPLASH_LOGO_ASPECT);
      expect(checkSplash({ ...entry({ id: s.id }), logo: s.logo })).toBeNull();
    }
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/unknown[\s\S]*nofile/);
  });

  it('a placement that fits the built-in but not its square logo is skipped with a warning', async () => {
    // 200 + 760 > 900: fine at 2000:670 (255 tall), off the bottom when square.
    library([entry({ id: 'ok' }), entry({ id: 'tall', logo: { id: 'emblem', x: 70, y: 200, width: 760 } })], undefined, [emblem]);
    const { a, warn } = await app();
    expect((await list(a)).map((s) => s.id)).toEqual(['ok']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a hand-broken logo entry is skipped with a warning; the splashes still list', async () => {
    library([entry({ id: 'a' })], undefined, [emblem]);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'splashes.json'), 'utf8'));
    raw.logos.push({ id: 'Bad Id' });
    fs.writeFileSync(path.join(dir, 'splashes.json'), JSON.stringify(raw));
    const { a, warn } = await app();
    expect(await list(a)).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('GET /api/splash-logo-art serves a manifest logo; refuses ../ and an unnamed file (404)', async () => {
    library([entry({ id: 'a' })], undefined, [emblem], ['emblem.png', 'stray.png']);
    const { a } = await app();
    const ok = await a.inject('/api/splash-logo-art/emblem.png');
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect((await a.inject('/api/splash-logo-art/stray.png')).statusCode).toBe(404);
    expect((await a.inject('/api/splash-logo-art/..%2Fa.png')).statusCode).toBe(404);
  });
});

describe('logo effects (spec 2026-10-11 logo effects §4)', () => {
  it("each splash's logo carries its effects (the five by default and for the built-in)", async () => {
    library(
      [entry({ id: 'plain' }), entry({ id: 'own', logo: { id: 'emblem', x: 70, y: 70, width: 400 } }), entry({ id: 'none', logo: { id: 'bare', x: 70, y: 70, width: 400 } })],
      undefined,
      [{ ...emblem, effects: ['power-on', 'glitch'] }, { ...emblem, id: 'bare', file: 'bare.png', effects: [] }],
    );
    const { a } = await app();
    const got = (await a.inject('/api/splashes')).json().splashes as { id: string; logo: { effects: string[] } }[];
    expect(got.map((s) => [s.id, s.logo.effects])).toEqual([
      ['plain', FIVE],
      ['own', ['glitch', 'power-on']],
      ['none', []],
    ]);
  });
});

describe('prompt gap (2026-10-11)', () => {
  it("a library logo's promptGap reaches the game; none when unset", async () => {
    library([entry({ id: 'a', logo: { id: 'emblem', x: 70, y: 70, width: 400 } }), entry({ id: 'b', logo: { id: 'plain', x: 70, y: 70, width: 400 } })], undefined, [{ ...emblem, promptGap: 15 }, { ...emblem, id: 'plain', file: 'plain.png' }]);
    const { a } = await app();
    const got = (await a.inject('/api/splashes')).json().splashes as { logo: { promptGap?: number } }[];
    expect(got[0]!.logo.promptGap).toBe(15);
    expect('promptGap' in got[1]!.logo).toBe(false);
  });
});

describe('menu theme (spec 2026-10-12 menu theme)', () => {
  const ogg = Buffer.from('OggS fake');
  const withTheme = (theme: unknown) => fs.writeFileSync(path.join(dir, 'splashes.json'), JSON.stringify({ version: 1, splashes: [], theme }));
  const packSong = (pack: string, file: string) => {
    fs.mkdirSync(path.join(dir, 'scenes-root', pack, '_music'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scenes-root', pack, '_music', file), ogg);
  };
  const menuSong = (file: string) => {
    fs.mkdirSync(path.join(dir, 'music'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'music', file), ogg);
  };
  const BUILT_IN_THEME = { title: 'Lost in Lowlight', url: '/sound/music/Lost%20in%20Lowlight.ogg' };

  it('is the built-in with no manifest or no theme', async () => {
    const { a, warn } = await app();
    expect((await a.inject('/api/menu-theme')).json()).toEqual(BUILT_IN_THEME);
    library([entry({ id: 'nix-wall' })]);
    expect((await a.inject('/api/menu-theme')).json()).toEqual(BUILT_IN_THEME);
    expect(warn).not.toHaveBeenCalled();
  });

  it("a pack song is played from the pack's _music", async () => {
    packSong('karasu', 'What Hae Serves.ogg');
    withTheme({ pack: 'karasu', file: 'What Hae Serves.ogg' });
    const { a } = await app();
    expect((await a.inject('/api/menu-theme')).json()).toEqual({ title: 'What Hae Serves', url: '/scenes/karasu/_music/What%20Hae%20Serves.ogg' });
  });

  it('a menu-only song is served from world/splash/music/, and only the one the theme names', async () => {
    menuSong('Neon Rain (2).ogg');
    menuSong('Other.ogg');
    withTheme({ file: 'Neon Rain (2).ogg' });
    const { a } = await app();
    const theme = (await a.inject('/api/menu-theme')).json() as { title: string; url: string };
    expect(theme).toEqual({ title: 'Neon Rain (2)', url: '/api/splash-music/Neon%20Rain%20(2).ogg' });
    const res = await a.inject(theme.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/ogg');
    expect(res.rawPayload.equals(ogg)).toBe(true);
    expect((await a.inject('/api/splash-music/Other.ogg')).statusCode).toBe(404);
    expect((await a.inject('/api/splash-music/..%2Fsplashes.json')).statusCode).toBe(404);
  });

  it("falls back to the built-in, with a warning, when the song's file is gone or the theme is hand-broken", async () => {
    withTheme({ pack: 'karasu', file: 'Gone.ogg' });
    const { a, warn } = await app();
    expect((await a.inject('/api/menu-theme')).json()).toEqual(BUILT_IN_THEME);
    expect(warn).toHaveBeenLastCalledWith(expect.stringMatching(/Gone\.ogg/));
    withTheme({ file: '../escape.ogg' });
    expect((await a.inject('/api/menu-theme')).json()).toEqual(BUILT_IN_THEME);
    expect(warn).toHaveBeenLastCalledWith(expect.stringMatching(/theme/));
  });
});
