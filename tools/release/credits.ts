import fs from 'node:fs';
import path from 'node:path';

const AUDIO = /\.(ogg|mp3|wav)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;
const FULL = /^(scenes|web\/public\/sound|world\/splash|world\/districts)\//;

/** Files under `dir` matching `re`, as forward-slash paths relative to `dir`. */
function files(dir: string, re: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && re.test(e.name))
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

/** A Source cell naming any of these can't go public (spec 2026-10-28 open-source release §2). */
const RESTRICTED_SOURCE = /GDC|Sonniss|Bleeoop|JDSherbert/i;

const backticked = (s: string) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());

/**
 * What CREDITS.md credits, read from its structure rather than its prose:
 * - a table row's first cell names files (backticked): a full path (`scenes/…`, `web/public/sound/…`,
 *   `world/splash/…`); a path under web/public/sound inside the section headed with it; or a path in a
 *   scene folder, credited for each `<pack>/<scene>` in the row's second cell (Used by);
 * - a list item `- <scene>: <path> ←` (Studio's picks) credits that path in that scene, in any pack;
 *   a list item with a backticked full path credits that path.
 * Nothing in the `## Patrons` section credits anything: those lines are names.
 * Returns the full paths credited and the (scene, path) pairs of the picks.
 */
function credits(text: string, restrictedOnly = false): { full: Set<string>; picks: Set<string>; free: Set<string> } {
  const full = new Set<string>();
  const picks = new Set<string>();
  // The full paths that may go public: a row in the Suno music section, or a CC0 Glitch Noises or generated ElevenLabs row with nothing restricted mixed in.
  const free = new Set<string>();
  let shared = false;
  let patrons = false;
  let suno = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) {
      if (/^##\s/.test(line)) {
        patrons = /^##\s+Patrons\b/i.test(line);
        suno = /^##\s+Music: Suno\b/i.test(line);
      }
      shared = line.includes('web/public/sound/');
      continue;
    }
    if (patrons) continue;
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1);
      if (cells.length < 2 || /^[\s:-]+$/.test(cells[0])) continue;
      const rooms = cells[1].match(/[\w-]+\/[\w-]+/g) ?? [];
      const source = cells[2] ?? '';
      const isFree = suno || (/Glitch Noises|ElevenLabs/.test(source) && !RESTRICTED_SOURCE.test(source));
      const add = (f: string) => {
        if (restrictedOnly && isFree) return;
        full.add(f);
        if (isFree) free.add(f);
      };
      for (const f of backticked(cells[0])) {
        if (FULL.test(f)) add(f);
        else if (shared) add(`web/public/sound/${f}`);
        else for (const room of rooms) add(`scenes/${room}/${f}`);
      }
      continue;
    }
    if (line.startsWith('- ')) {
      const pick = /^- ([\w-]+): (\S.*?) ←/.exec(line);
      if (pick) picks.add(`${pick[1]}/${pick[2]}`);
      for (const f of backticked(line)) if (FULL.test(f)) full.add(f);
    }
  }
  return { full, picks, free };
}

/** The uncredited files among scene audio (by pack folder), shared sounds, splash images and theme songs, and district art. */
function scan(packDirs: { pack: string; dir: string }[], soundDir: string, splashDir: string, districtsDir: string, creditsText: string): string[] {
  const { full, picks } = credits(creditsText);
  const missing: string[] = [];
  for (const { pack, dir } of packDirs) {
    for (const rel of files(dir, AUDIO)) {
      // <scene>/<rest>: a Studio pick names it so; the full path is scenes/<pack>/<scene>/<rest>.
      if (!full.has(`scenes/${pack}/${rel}`) && !picks.has(rel)) missing.push(`scenes/${pack}/${rel}`);
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
  return missing.sort();
}

const packsIn = (scenesDir: string) => (fs.existsSync(scenesDir) ? fs.readdirSync(scenesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => ({ pack: e.name, dir: path.join(scenesDir, e.name) })) : []);

/** Shipped audio and splash images with no entry in CREDITS.md (spec §3.3), from a stage and the built front end, sorted. */
export function uncredited(stageDir: string, webDistDir: string, creditsText: string): string[] {
  return scan(packsIn(path.join(stageDir, 'scenes')), path.join(webDistDir, 'sound'), path.join(stageDir, 'world', 'splash'), path.join(stageDir, 'world', 'districts'), creditsText);
}

/** The same check read from the repo in place, for Studio's checks: the shipped packs, web/public/sound, world/splash. */
export function uncreditedSources(root: string, packs: string[], creditsText: string): string[] {
  return scan(packs.map((pack) => ({ pack, dir: path.join(root, 'scenes', pack) })), path.join(root, 'web', 'public', 'sound'), path.join(root, 'world', 'splash'), path.join(root, 'world', 'districts'), creditsText);
}

export type AudioStatus = 'public' | 'restricted' | 'unlisted';

/**
 * What CREDITS.md says an audio file may do: `public` (Suno songs, CC0 Glitch Noises cues, generated ElevenLabs sounds), `restricted`
 * (Sonniss, Bleeoop, JDSherbert, a mix with any of them, every Studio library pick), or `unlisted`.
 * `repoPath` is forward-slash and repo-relative. A pick names a scene, so it matches that scene in any pack.
 */
export function audioStatus(creditsText: string): (repoPath: string) => AudioStatus {
  const { full, picks, free } = credits(creditsText);
  // Restricted wins: a file credited both ways (a free row and a restricted row or pick) stays private.
  const { full: restrictedRows } = credits(creditsText, true);
  return (repoPath) => {
    const scene = /^scenes\/[^/]+\/(.+)$/.exec(repoPath);
    if (restrictedRows.has(repoPath) || (scene && picks.has(scene[1]))) return 'restricted';
    if (free.has(repoPath)) return 'public';
    return full.has(repoPath) ? 'restricted' : 'unlisted';
  };
}
