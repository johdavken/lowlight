/**
 * The splash library for the game (spec 2026-10-09 splash library §4.1): the entries switched on,
 * read from world/splash/splashes.json on every request (Studio's edits show without a restart),
 * and their image files. Only files the manifest names are ever served. Each splash brings its logo
 * (spec 2026-10-11 splash logos §5): the built-in, or one from world/splash/logos/. The library's
 * theme (spec 2026-10-12 menu theme) is the splash and dial-in's first song: a pack's, one from
 * world/splash/music/, or the built-in.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { BUILT_IN_THEME, checkSplash, readSplashTheme, songTitle, clampLogo, DEFAULT_LOGO_EFFECTS, logoAspect, logoEffects, readSplashEntry, readSplashLogo, splashEntries, splashLogoEntries, SPLASH_LOGO_ASPECT, type LogoEffect, type SplashEntry, type SplashLogoEntry } from '../../shared/splash';

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export interface GameSplash {
  id: string;
  url: string;
  width: number;
  height: number;
  /** Where the logo sits, and which: its image, aspect (width over height) and effects. */
  logo: { x: number; y: number; width: number; src: string; aspect: number; effects: LogoEffect[]; promptGap?: number };
}

/** The game's own logo (web/public). */
const BUILT_IN_SRC = '/lowlight-logo.webp';

export function registerSplashRoutes(app: FastifyInstance, dir: string, warn: (m: string) => void, scenesDir: string): void {
  /** Every entry and logo the manifest has (none when it's missing or invalid, with a warning for invalid). */
  function library(): { splashes: SplashEntry[]; logos: SplashLogoEntry[] } {
    const file = path.join(dir, 'splashes.json');
    const none = { splashes: [], logos: [] };
    if (!fs.existsSync(file)) return none;
    try {
      const json: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      const raw = splashEntries(json);
      if (!raw) {
        warn(`splash: ${file} isn't a splash library (version 1, a splashes list)`);
        return none;
      }
      // Each entry on its own: a hand-broken one is skipped, the rest still rotate.
      const splashes: SplashEntry[] = [];
      raw.forEach((r, i) => {
        const e = readSplashEntry(r);
        if (e.entry) splashes.push(e.entry);
        else warn(`splash: skipping entry ${i + 1}: ${e.problem}`);
      });
      const logos: SplashLogoEntry[] = [];
      splashLogoEntries(json).forEach((r, i) => {
        const l = readSplashLogo(r);
        if (l.entry) logos.push(l.entry);
        else warn(`splash: skipping logo ${i + 1}: ${l.problem}`);
      });
      return { splashes, logos };
    } catch (err) {
      warn(`splash: couldn't read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return none;
  }
  const entries = () => library().splashes;

  /** A splash's logo for the game; a logo that's gone becomes the built-in, clamped to fit (with a warning). */
  function logoFor(e: SplashEntry, logos: SplashLogoEntry[]): GameSplash['logo'] {
    const { x, y, width } = e.logo;
    const builtIn = { src: BUILT_IN_SRC, aspect: SPLASH_LOGO_ASPECT, effects: [...DEFAULT_LOGO_EFFECTS] };
    if (e.logo.id === undefined) return { x, y, width, ...builtIn };
    const l = logos.find((o) => o.id === e.logo.id);
    if (l && fs.existsSync(path.join(dir, 'logos', l.file))) return { x, y, width, src: `/api/splash-logo-art/${l.file}`, aspect: l.width / l.height, effects: logoEffects(l), ...(l.promptGap === undefined ? {} : { promptGap: l.promptGap }) };
    warn(`splash: '${e.id}' names the logo '${e.logo.id}', which ${l ? 'has no file' : "isn't in the library"}: showing the built-in`);
    return { ...clampLogo({ x, y, width }, e.width, e.height), ...builtIn };
  }

  app.get('/api/splashes', async (): Promise<{ splashes: GameSplash[] }> => {
    const splashes: GameSplash[] = [];
    const lib = library();
    for (const e of lib.splashes) {
      if (!e.on) continue;
      // An unknown logo isn't measured: logoFor clamps the built-in that stands in for it.
      const aspect = logoAspect(e.logo.id, lib.logos);
      const problem = (aspect === null ? null : checkSplash(e, aspect)) ?? (fs.existsSync(path.join(dir, e.file)) ? null : `no file ${e.file}`);
      if (problem) {
        warn(`splash: skipping '${e.id}': ${problem}`);
        continue;
      }
      splashes.push({ id: e.id, url: `/api/splash-art/${e.file}`, width: e.width, height: e.height, logo: logoFor(e, lib.logos) });
    }
    return { splashes };
  });

  app.get<{ Params: { file: string } }>('/api/splash-art/:file', async (req, reply) => {
    // The file must be one the manifest names: no path from the URL ever reaches the disk.
    const e = entries().find((x) => x.file === req.params.file);
    const file = e ? path.join(dir, e.file) : null;
    if (!file || !fs.existsSync(file)) return reply.code(404).send({ error: 'no such splash' });
    return reply.type(TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream').header('cache-control', 'no-cache').send(fs.readFileSync(file));
  });

  app.get<{ Params: { file: string } }>('/api/splash-logo-art/:file', async (req, reply) => {
    // As above: only a file the manifest's logos name.
    const l = library().logos.find((x) => x.file === req.params.file);
    const file = l ? path.join(dir, 'logos', l.file) : null;
    if (!file || !fs.existsSync(file)) return reply.code(404).send({ error: 'no such logo' });
    return reply.type(TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream').header('cache-control', 'no-cache').send(fs.readFileSync(file));
  });

  /** The theme's file, title and the URL the game fetches it from; null for the built-in (none named, or its song gone: with a warning). */
  function theme(): { file: string; url: string; title: string } | null {
    const manifest = path.join(dir, 'splashes.json');
    let json: unknown;
    try {
      json = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : null;
    } catch {
      return null; // /api/splashes warns about an unreadable manifest.
    }
    const { theme: t, problem } = readSplashTheme(json);
    if (problem) warn(`splash: ${problem}: playing the built-in theme`);
    if (!t) return null;
    const file = t.pack ? path.join(scenesDir, t.pack, '_music', t.file) : path.join(dir, 'music', t.file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      warn(`splash: the theme ${t.pack ? `${t.pack}/_music/` : 'music/'}${t.file} has no file: playing the built-in theme`);
      return null;
    }
    const url = t.pack ? `/scenes/${encodeURIComponent(t.pack)}/_music/${encodeURIComponent(t.file)}` : `/api/splash-music/${encodeURIComponent(t.file)}`;
    return { file, url, title: songTitle(t.file) };
  }

  app.get('/api/menu-theme', async (): Promise<{ title: string; url: string }> => {
    const t = theme();
    return t ? { title: t.title, url: t.url } : { ...BUILT_IN_THEME };
  });

  app.get<{ Params: { file: string } }>('/api/splash-music/:file', async (req, reply) => {
    // Only the menu-only song the theme names: no path from the URL ever reaches the disk.
    const t = theme();
    if (!t || !t.url.startsWith('/api/splash-music/') || path.basename(t.file) !== req.params.file) return reply.code(404).send({ error: 'no such song' });
    return reply.type('audio/ogg').header('cache-control', 'no-cache').send(fs.readFileSync(t.file));
  });
}
