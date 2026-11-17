/** Accounts files for Two Stories (spec 2026-11-10-two-stories §2): world/accounts/<id>.md, read once at startup. */
import fs from 'node:fs';
import path from 'node:path';
import { parseAccountsFile, type AccountsFile } from '../../shared/accounts';

export const DEFAULT_ACCOUNTS_DIR = './world/accounts';

/**
 * The accounts book. A file that fails its checks warns and is skipped, and so is one whose id is a case's: both put
 * their cards in the kit as `<id>/<CARD>`, so the two would share keys.
 */
export function loadAccounts(dir: string, known: { roster: ReadonlySet<string> | null; caseIds: ReadonlySet<string> }, warn: (m: string) => void): AccountsFile[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: AccountsFile[] = [];
  for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue;
    const id = d.name.slice(0, -3);
    if (known.caseIds.has(id)) {
      warn(`accounts ${d.name}: ${id} is also a case in world/cases, and their cards would share kit keys; skipping it`);
      continue;
    }
    const r = parseAccountsFile(id, fs.readFileSync(path.join(dir, d.name), 'utf8'), { roster: known.roster });
    if (r.ok) out.push(r.entry);
    else warn(`accounts ${d.name}: ${r.problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  }
  return out;
}
