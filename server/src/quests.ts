import fs from 'node:fs';
import path from 'node:path';
import type { LeadEntry } from '../../shared/leads';
import { parseQuestFile, type QuestEntry } from '../../shared/quests';

export const DEFAULT_QUESTS_DIR = './world/quests';

/** What's wrong with a contract's lead: it has to exist, go to the contract's contact, and come from any guest. Null: nothing, or no lead. */
function leadProblem(q: QuestEntry, leads: LeadEntry[]): string | null {
  const id = q.contract?.lead;
  if (!id) return null;
  const lead = leads.find((l) => l.id === id);
  if (!lead) return `no lead '${id}'`;
  if (lead.to !== q.with?.[0]) return `'${id}' goes to ${lead.to}, not ${q.with?.[0]}`;
  const guest = q.contract?.guest?.id;
  return guest && lead.from !== guest ? `'${id}' comes from ${lead.from}, not guest ${guest}` : null;
}

/**
 * The quest book: each `.md` file directly in `dir`. A file that fails the rules (a name not on the
 * roster, a place not on the map, a branch that goes nowhere) warns once and is skipped; a missing
 * folder is an empty book. With `leads`, so is a contract whose lead isn't in that book or doesn't point at its contact.
 */
export function loadQuestBook(dir: string, known: { roster: ReadonlySet<string>; places: ReadonlySet<string>; extras?: { ids: ReadonlySet<string>; tags: ReadonlySet<string> } | null; decks?: ReadonlySet<string> | null; outfits?: ReadonlySet<string> | null }, warn: (m: string) => void, leads?: LeadEntry[]): QuestEntry[] {
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
    const bad = r.ok && leads ? leadProblem(r.entry, leads) : null;
    if (bad) warn(`quest ${d.name}: lead: ${bad}; skipping it`);
    else if (r.ok) book.push(r.entry);
    else warn(`quest ${d.name}: ${r.problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  }
  return book;
}
