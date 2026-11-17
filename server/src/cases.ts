/** Case files for the deduction board (spec 2026-11-09-deduction-board §1): world/cases/<id>.md, read once at startup. */
import fs from 'node:fs';
import path from 'node:path';
import { parseCaseFile, type CaseFile } from '../../shared/cases';

export const DEFAULT_CASES_DIR = './world/cases';

export function loadCases(dir: string, known: { extras: ReadonlySet<string> | null }, warn: (m: string) => void): CaseFile[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: CaseFile[] = [];
  for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue;
    const r = parseCaseFile(d.name.slice(0, -3), fs.readFileSync(path.join(dir, d.name), 'utf8'), known);
    if (r.ok) out.push(r.entry);
    else warn(`case ${d.name}: ${r.problems.map((p) => `${p.field}: ${p.message}`).join('; ')}; skipping it`);
  }
  return out;
}

/**
 * A case's recorded barks (The Fourteenth voice script): `<dir>/voice/<case>/<group>[-<take>].ogg`, as the urls the page
 * plays, grouped by name (`bounce1-a`, `bounce1-b` → bounce1; `kat` → kat). None when the case has no folder.
 */
export function caseBarks(dir: string, caseId: string): Record<string, string[]> {
  let names: string[];
  try {
    names = fs.readdirSync(path.join(dir, 'voice', caseId)).sort();
  } catch {
    return {};
  }
  const out: Record<string, string[]> = {};
  for (const n of names) {
    const m = /^([a-z0-9]+)(?:-[a-z0-9]+)?\.ogg$/.exec(n);
    if (m) (out[m[1]] ??= []).push(`/api/cases/voice/${caseId}/${n}`);
  }
  return out;
}
