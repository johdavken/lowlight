/**
 * The art store: where the art the game never loads lives (room masters, character .kra/.psd and sources,
 * cards, Patreon, splash, Studio's room projects in `work/`). It is kept out of git, in a backed-up folder
 * named by `<root>/.art-store` (one line: a path, absolute or relative to the root; the file is git-ignored).
 * Without that file the store is `<root>/art`, the old layout, so a fresh clone, a worktree or a test's
 * throwaway root work unchanged. Its layout mirrors `art/`: `<store>/<character>/<file>.kra`, `<store>/work/<room>/`.
 *
 * The text under `art/` (art/scenes/*.md, style.md, cast-palette.json, studio-character.json) and its SVGs
 * (make-portrait's source) stay in the repo.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ART_STORE_FILE = '.art-store';

/** The art store's folder for this root. */
export function artStore(root: string = process.cwd()): string {
  const pointer = path.join(root, ART_STORE_FILE);
  let line = '';
  try {
    line = fs.readFileSync(pointer, 'utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? '';
  } catch {
    // no pointer: the old layout
  }
  return line ? path.resolve(root, line) : path.join(root, 'art');
}

/** Studio's and the art pipeline's working folder: room projects, builds, the library, character imports. */
export const artWork = (root: string = process.cwd()): string => path.join(artStore(root), 'work');
