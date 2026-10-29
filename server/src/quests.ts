import fs from 'node:fs';
import path from 'node:path';
import { parseQuestFile, type QuestEntry } from '../../shared/quests';

export const DEFAULT_QUESTS_DIR = './world/quests';

/**
 * The quest book: each `.md` file directly in `dir`. A file that fails the rules (a name not on the
 * roster, a place not on the map, a branch that goes nowhere) warns once and is skipped; a missing
 * folder is an empty book.
 */
export function loadQuestBook(dir: string, known: { roster: ReadonlySet<string>; places: ReadonlySet<string>; extras?: { ids: ReadonlySet<string>; tags: ReadonlySet<string> } | null; decks?: ReadonlySet<string> | null }, warn: (m: string) => void): QuestEntry[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const book: QuestEntry[] = [];
  for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue;
    const r = parseQuestFile(d.name.slice(0, -3), fs.readFileSync(path.join(dir, d.name), 'utf8'), known);
    if (r.ok) book.push(r.entry);
    else warn(`quest ${d.name}: ${r.problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  }
  return book;
}
