import fs from 'node:fs';
import path from 'node:path';
import type { ResolvedRelease } from './release-list';
import { parseManifest } from '../../shared/map-tiles';
import { currentDataHash } from '../map3d/versions';

/** Copies a folder, leaving out any `history/` folder inside it (Studio's backups never ship) and any top-level file in `skip`. */
function copyTree(src: string, dst: string, skip: readonly string[] = []): void {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(src, p);
      return !rel.split(path.sep).includes('history') && !skip.includes(rel);
    },
  });
}

/**
 * Writes the read-only content a build ships into `out` (spec §3.1), replacing whatever was there:
 * the resolved packs and characters, the map, lore and splash library, the jobs (quests less the held ones,
 * leads, extras, gear, crew), the room narration (.md only),
 * the default player, the credits and, when there is one, where bug reports go (report.json).
 */
export function stageContent(root: string, resolved: ResolvedRelease, defaultPlayer: string, out: string, bugRelay: string | null = null): void {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const pack of resolved.packs) copyTree(path.join(root, 'scenes', pack), path.join(out, 'scenes', pack));
  for (const id of resolved.characters) copyTree(path.join(root, 'characters', id), path.join(out, 'characters', id));
  fs.mkdirSync(path.join(out, 'map'));
  fs.copyFileSync(path.join(root, 'map', 'lowlight.json'), path.join(out, 'map', 'lowlight.json'));
  // The district styles' blackout rates (blackouts phase 3); the rest of map/city is only the renderer's.
  const districts = path.join(root, 'map', 'city', 'districts');
  if (fs.existsSync(districts)) copyTree(districts, path.join(out, 'map', 'city', 'districts'));
  for (const part of ['lore', 'gigs', 'papers', 'splash', 'districts', 'leads', 'extras', 'gear', 'crew']) copyTree(path.join(root, 'world', part), path.join(out, 'world', part));
  copyTree(path.join(root, 'world', 'quests'), path.join(out, 'world', 'quests'), resolved.holdQuests.map((id) => `${id}.md`));
  // Standing's shared words (STANDING_FILE); the game falls back to its defaults without it.
  const standing = path.join(root, 'world', 'standing.json');
  if (fs.existsSync(standing)) fs.copyFileSync(standing, path.join(out, 'world', 'standing.json'));
  const art = path.join(out, 'art', 'scenes');
  fs.mkdirSync(art, { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'art', 'scenes'))) {
    if (f.endsWith('.md')) fs.copyFileSync(path.join(root, 'art', 'scenes', f), path.join(art, f));
  }
  fs.mkdirSync(path.join(out, 'persona'));
  fs.writeFileSync(path.join(out, 'persona', 'persona.json'), `${JSON.stringify({ character: defaultPlayer })}\n`);
  fs.copyFileSync(path.join(root, 'sounds', 'CREDITS.md'), path.join(out, 'CREDITS.md'));
  if (bugRelay) fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify({ bugRelay })}\n`);
}

/** What the release says when the city map's render doesn't match the data being built (rendered map spec §4). */
export const STALE_RENDER = 'the city map render is out of date — run npm run map-render';

/**
 * The rendered map in `renderRoot` (its web/public/map, gitignored) against the data in `dataRoot`: none when there's no
 * render (the build ships the painting), current when it was made from this data, stale otherwise.
 */
export function renderCheck(renderRoot: string, dataRoot: string): 'none' | 'current' | 'stale' {
  let manifest = null;
  try {
    manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(renderRoot, 'web', 'public', 'map', 'tiles.json'), 'utf8')));
  } catch {
    return 'none';
  }
  if (!manifest) return 'none';
  try {
    return manifest.dataHash === currentDataHash(dataRoot) ? 'current' : 'stale';
  } catch {
    return 'stale';
  }
}

/** Copies a current render into the build's tree (the release's worktree has no gitignored tiles); a stale one stops the build. */
export function copyMapRender(renderRoot: string, work: string): 'none' | 'current' {
  const state = renderCheck(renderRoot, work);
  if (state === 'stale') throw new Error(STALE_RENDER);
  if (state === 'none') return 'none';
  const from = path.join(renderRoot, 'web', 'public', 'map'), to = path.join(work, 'web', 'public', 'map');
  fs.mkdirSync(to, { recursive: true });
  for (const f of ['tiles.json', 'windows.json']) if (fs.existsSync(path.join(from, f))) fs.copyFileSync(path.join(from, f), path.join(to, f));
  fs.cpSync(path.join(from, 'tiles'), path.join(to, 'tiles'), { recursive: true });
  // Blackouts' dark copies and masks, when the render has them (a render without them just has no blackouts).
  for (const dir of ['tiles-dark', 'tiles-mask']) if (fs.existsSync(path.join(from, dir))) fs.cpSync(path.join(from, dir), path.join(to, dir), { recursive: true });
  return 'current';
}
