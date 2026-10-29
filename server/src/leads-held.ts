import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LeadEntry } from '../../shared/leads';
import type { HeldLead } from '../../shared/types';

/** A read-only look at one contact database; null when it can't be opened. */
function withDb<T>(file: string, read: (db: DatabaseSync) => T): T | null {
  if (!fs.existsSync(file)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return read(db);
  } catch (err) {
    console.error(`[leads] ${file}: unreadable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    db?.close();
  }
}

const hasTable = (db: DatabaseSync, name: string) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;

/**
 * The leads `player` holds in a playthrough (Leads spec §4): the `leads` rows of every contact
 * database in `charsDir`, kept only when the book still has the lead, oldest first. `followed`
 * is the receiver's meta key. Read fresh every call: a handful of small read-only opens.
 */
export function readHeldLeads(charsDir: string, player: string, book: LeadEntry[]): HeldLead[] {
  const byId = new Map(book.map((e) => [e.id, e]));
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(charsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const held: HeldLead[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const rows = withDb(path.join(charsDir, d.name, 'room.db'), (db) =>
      hasTable(db, 'leads') ? (db.prepare('SELECT id, details, at FROM leads WHERE player = ?').all(player) as { id: string; details: string; at: number }[]) : [],
    );
    for (const r of rows ?? []) if (byId.has(r.id)) held.push({ id: r.id, givenBy: d.name, details: r.details, at: r.at, followed: false });
  }
  for (const h of held) {
    const key = `lead.${player}.${h.id}.followed`;
    h.followed = withDb(path.join(charsDir, byId.get(h.id)!.to, 'room.db'), (db) => db.prepare('SELECT 1 FROM meta WHERE k = ?').get(key) !== undefined) ?? false;
  }
  return held.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
