import fs from 'node:fs';
import path from 'node:path';
import { creditRows } from './credit-rows';

const AUDIO = /\.(ogg|mp3|wav)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;

/** Files under `dir` matching `re`, as forward-slash paths relative to `dir`. */
function files(dir: string, re: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && re.test(e.name))
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

/**
 * What CREDITS.md credits (the rows as `creditRows` reads them): the full paths credited and the
 * (scene, path) pairs of the picks (ElevenLabs takes apart, in freePicks).
 */
function credits(text: string, restrictedOnly = false): { full: Set<string>; picks: Set<string>; freePicks: Set<string>; free: Set<string> } {
  const full = new Set<string>();
  const picks = new Set<string>();
  const freePicks = new Set<string>();
  // The full paths that may go public: a row in the Suno music section, or a CC0 Glitch Noises or generated ElevenLabs row with nothing restricted mixed in.
  const free = new Set<string>();
  for (const row of creditRows(text)) {
    if (row.kind === 'table') {
      for (const f of row.files) {
        if (restrictedOnly && row.free) continue;
        full.add(f);
        if (row.free) free.add(f);
      }
      continue;
    }
    if (row.pick) (row.pick.free ? freePicks : picks).add(`${row.pick.scene}/${row.pick.rel}`);
    for (const f of row.files) full.add(f);
  }
  return { full, picks, freePicks, free };
}

/** The uncredited files among scene audio (by pack folder), shared sounds, splash images and theme songs, and district art. */
function scan(packDirs: { pack: string; dir: string }[], soundDir: string, splashDir: string, districtsDir: string, creditsText: string, loreDir?: string): string[] {
  const { full, picks, freePicks } = credits(creditsText);
  const missing: string[] = [];
  for (const { pack, dir } of packDirs) {
    for (const rel of files(dir, AUDIO)) {
      // <scene>/<rest>: a Studio pick names it so; the full path is scenes/<pack>/<scene>/<rest>.
      if (!full.has(`scenes/${pack}/${rel}`) && !picks.has(rel) && !freePicks.has(rel)) missing.push(`scenes/${pack}/${rel}`);
    }
  }
  for (const rel of files(soundDir, AUDIO)) {
    if (!full.has(`web/public/sound/${rel}`)) missing.push(`web/sound/${rel}`);
  }
  // Splash images and logos, and a menu-only theme song in music/.
  for (const rel of files(splashDir, new RegExp(`${IMAGE.source}|${AUDIO.source}`, 'i'))) {
    if (rel.startsWith('history/') || (AUDIO.test(rel) && !rel.startsWith('music/'))) continue;
    if (!full.has(`world/splash/${rel}`)) missing.push(`world/splash/${rel}`);
  }
  for (const rel of files(districtsDir, IMAGE)) {
    if (!full.has(`world/districts/${rel}`)) missing.push(`world/districts/${rel}`);
  }
  // Lore pictures (corp logos), beside their entries.
  for (const rel of loreDir ? files(loreDir, IMAGE) : []) {
    if (!full.has(`world/lore/${rel}`)) missing.push(`world/lore/${rel}`);
  }
  return missing.sort();
}

const packsIn = (scenesDir: string) => (fs.existsSync(scenesDir) ? fs.readdirSync(scenesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => ({ pack: e.name, dir: path.join(scenesDir, e.name) })) : []);

/** Shipped audio and splash images with no entry in CREDITS.md (spec §3.3), from a stage and the built front end, sorted. */
export function uncredited(stageDir: string, webDistDir: string, creditsText: string): string[] {
  return scan(packsIn(path.join(stageDir, 'scenes')), path.join(webDistDir, 'sound'), path.join(stageDir, 'world', 'splash'), path.join(stageDir, 'world', 'districts'), creditsText, path.join(stageDir, 'world', 'lore'));
}

/** The same check read from the repo in place, for Studio's checks: the shipped packs, web/public/sound, world/splash. */
export function uncreditedSources(root: string, packs: string[], creditsText: string): string[] {
  return scan(packs.map((pack) => ({ pack, dir: path.join(root, 'scenes', pack) })), path.join(root, 'web', 'public', 'sound'), path.join(root, 'world', 'splash'), path.join(root, 'world', 'districts'), creditsText, path.join(root, 'world', 'lore'));
}

export type AudioStatus = 'public' | 'restricted' | 'unlisted';

/**
 * What CREDITS.md says an audio file may do: `public` (Suno songs, CC0 Glitch Noises cues, generated ElevenLabs sounds), `restricted`
 * (Sonniss, Bleeoop, JDSherbert, a mix with any of them, a Studio pick from the Sonniss bundles), or `unlisted`; an ElevenLabs pick is public.
 * `repoPath` is forward-slash and repo-relative. A pick names a scene, so it matches that scene in any pack.
 */
export function audioStatus(creditsText: string): (repoPath: string) => AudioStatus {
  const { full, picks, freePicks, free } = credits(creditsText);
  // Restricted wins: a file credited both ways (a free row and a restricted row or pick) stays private.
  const { full: restrictedRows } = credits(creditsText, true);
  return (repoPath) => {
    const scene = /^scenes\/[^/]+\/(.+)$/.exec(repoPath);
    if (restrictedRows.has(repoPath) || (scene && picks.has(scene[1]))) return 'restricted';
    if (free.has(repoPath) || (scene && freePicks.has(scene[1]))) return 'public';
    return full.has(repoPath) ? 'restricted' : 'unlisted';
  };
}
