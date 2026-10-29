/**
 * Who's here (spec 2026-10-11 §2): everyone in your room besides you and your contact — the place's
 * resident and any contact the clock puts there — and the line her model gets when that changes.
 */
import type { Pronoun } from '../../shared/pronoun';
import type { Present } from '../../shared/types';

/**
 * The resident first, then the contacts whose place is `sceneId` in roster order, leaving out
 * `exclude` (your contact, you) and anyone named as in `excludeNames` (her or your namesake: their
 * `Name:` paragraphs couldn't be told from hers or yours).
 */
export function whoIsHere(o: {
  sceneId: string;
  resident: { id: string; name: string; pronoun: Pronoun } | null;
  contacts: { id: string; name: string; pronoun: Pronoun; sceneId: string }[];
  exclude: string[];
  excludeNames?: string[];
}): Present[] {
  const names = new Set((o.excludeNames ?? []).map((n) => n.toLowerCase()));
  const here: Present[] = o.resident && !names.has(o.resident.name.toLowerCase()) ? [{ id: o.resident.id, kind: 'resident', name: o.resident.name, pronoun: o.resident.pronoun }] : [];
  for (const c of o.contacts) {
    if (c.sceneId === o.sceneId && !o.exclude.includes(c.id) && !names.has(c.name.toLowerCase())) here.push({ id: c.id, kind: 'contact', name: c.name, pronoun: c.pronoun });
  }
  return here;
}

/**
 * One line per person who left or came in between `before` and `after`, or null when no one did.
 * Names only, never a pronoun; someone leaving says where they're due when `nextPlace` knows.
 */
export function presenceNote(before: Present[], after: Present[], nextPlace: (id: string) => string | null): string | null {
  const was = new Set(before.map((p) => p.id));
  const is = new Set(after.map((p) => p.id));
  const lines: string[] = [];
  for (const p of before) {
    if (is.has(p.id)) continue;
    const to = nextPlace(p.id);
    lines.push(to ? `[${p.name} heads out — due at ${to}.]` : `[${p.name} heads out.]`);
  }
  for (const p of after) if (!was.has(p.id)) lines.push(`[${p.name} comes in.]`);
  return lines.length > 0 ? lines.join('\n') : null;
}
