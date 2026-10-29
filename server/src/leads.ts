import fs from 'node:fs';
import path from 'node:path';
import { checkChains, parseLeadFile, type LeadEntry } from '../../shared/leads';

export const DEFAULT_LEADS_DIR = './world/leads';

/**
 * The lead book: each `.md` file directly in `dir`. A file that fails the rules (or names someone
 * not in `roster`), or whose chain can never be held, warns once and is skipped; a missing folder
 * is an empty book.
 */
export function loadLeadBook(dir: string, roster: ReadonlySet<string> | null, warn: (m: string) => void): LeadEntry[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const book: LeadEntry[] = [];
  for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue;
    const r = parseLeadFile(d.name.slice(0, -3), fs.readFileSync(path.join(dir, d.name), 'utf8'), roster);
    if (r.ok) book.push(r.entry);
    else warn(`lead ${d.name}: ${r.problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  }
  const broken = checkChains(book);
  for (const [id, problems] of broken) warn(`lead ${id}.md: ${problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  return book.filter((e) => !broken.has(e.id));
}
