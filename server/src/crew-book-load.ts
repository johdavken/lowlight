/** The crew tables (crew spec §1–§2): world/crew/{names,traits,pitches,errands}.md, read once at startup (restart after editing). */
import fs from 'node:fs';
import path from 'node:path';
import { parseCrewBook, type CrewBook } from '../../shared/crew-book';

export const DEFAULT_CREW_DIR = './world/crew';

const read = (dir: string, name: string): string => {
  try {
    return fs.readFileSync(path.join(dir, `${name}.md`), 'utf8');
  } catch {
    return '';
  }
};

/** The book in `dir`; a missing file is an empty part; each problem warns and its line or block is skipped. */
export function loadCrewBook(dir: string, warn: (m: string) => void): CrewBook {
  const r = parseCrewBook({ names: read(dir, 'names'), traits: read(dir, 'traits'), pitches: read(dir, 'pitches'), errands: read(dir, 'errands') });
  for (const p of r.problems) warn(`crew ${p}; skipping it`);
  return r.book;
}
