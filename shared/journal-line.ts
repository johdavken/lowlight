// The per-turn `[journal …]` line: her pinned notes, and the unpinned ones whose keywords came up in the last few lines.
// Shared by the game's journal (server/src/journal.ts) and the SillyTavern package's ledger.
import { mentionsKeys } from './lore';
import type { Note } from './types';

/** At most this many unpinned notes come back in the journal line when their keywords come up (scribe spec §5). */
export const NOTE_MATCH_MAX = 5;
/** The journal line's length cap: matched notes go first, pins never. */
export const JOURNAL_LINE_MAX = 2400;

const flat = (text: string) => text.replace(/\s*\n\s*/g, ' ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const label = (n: Note) => `${n.id} (${n.about})`;

export function byIdNumber(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}

/** The `[journal …]` line for these notes, or null when there are none. `recent`: the last few lines, newest first. */
export function journalLineOf(all: readonly Note[], recent: readonly string[]): string | null {
  if (all.length === 0) return null;
  const pins = all.filter((n) => n.pinned);
  // Unpinned notes whose keywords came up: the earliest (most recent) mention first, ties by id.
  const firstMention = (n: Note) => recent.findIndex((t) => mentionsKeys(t, n.keys ?? []));
  let matched = all
    .filter((n) => !n.pinned && (n.keys?.length ?? 0) > 0)
    .map((n) => ({ n, at: firstMention(n) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at || byIdNumber(a.n.id, b.n.id))
    .slice(0, NOTE_MATCH_MAX)
    .map((m) => m.n);
  const build = () => {
    const rest = all.length - pins.length - matched.length;
    const parts: string[] = [];
    if (pins.length > 0) parts.push(pins.map((n) => `${label(n)} ${flat(n.text)}`).join(' · '));
    if (matched.length > 0) parts.push(`came up: ${matched.map((n) => `${label(n)} ${flat(n.text)}`).join(' · ')}`);
    if (pins.length + matched.length === 0) return `[journal: ${plural(rest, 'note')}]`;
    if (rest > 0) parts.push(`${rest} more ${rest === 1 ? 'note' : 'notes'}`);
    return `[journal${pins.length > 0 ? ' (pinned)' : ''}: ${parts.join(' · ')}]`;
  };
  let line = build();
  while (line.length > JOURNAL_LINE_MAX && matched.length > 0) {
    matched = matched.slice(0, -1);
    line = build();
  }
  return line;
}
