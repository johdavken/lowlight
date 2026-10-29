/**
 * Habits, the Residual's ban list (spec 2026-10-29): every so often a run reads her recent replies and names up to five
 * body tics and prose shapes she keeps writing, as general rules. They reach her as one `[worn thin …]` line, beside the
 * echo line (which catches exact phrases; this catches the reworded and the shaped, over a longer stretch).
 * Stored as story meta `habits.<player>` = { rules, through }: rewind, swipe and BRANCH HERE undo it.
 */
import type { ChatMessage } from '../../shared/types';
import type { Db } from './db';

export const HABITS = { firstAfter: 8, every: 12, window: 12, retryGap: 3, maxRules: 5, maxChars: 90, quoteWords: 4 } as const;

export interface Habits {
  rules: string[];
  /** Her newest reply the run read. */
  through: string;
}

const key = (player: string) => `habits.${player}`;
const IN_CHARACTER = new Set<ChatMessage['mode']>([undefined, 'greet', 'travel', 'end']);

/** Her in-character replies: not texts, promised texts, scene or encounter lines, OOC, or failed takes. */
export function herReplies(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.role === 'agent' && m.status === 'ok' && !m.promised && m.text.trim() !== '' && IN_CHARACTER.has(m.mode));
}

export const repliesCount = (messages: ChatMessage[]): number => herReplies(messages).length;

/** First at HABITS.firstAfter of her replies; then once HABITS.every more follow `through` (gone: as if none). */
export function habitsDue(messages: ChatMessage[], h: Habits | null): boolean {
  const hers = herReplies(messages);
  const at = h ? hers.findIndex((m) => m.id === h.through) : -1;
  if (at < 0) return hers.length >= HABITS.firstAfter;
  return hers.length - (at + 1) >= HABITS.every;
}

export function readHabits(db: Pick<Db, 'getMeta'>, player: string): Habits | null {
  const raw = db.getMeta(key(player));
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as { rules?: unknown; through?: unknown };
    if (!Array.isArray(v.rules) || !v.rules.every((r) => typeof r === 'string') || typeof v.through !== 'string') return null;
    return { rules: v.rules as string[], through: v.through };
  } catch {
    return null;
  }
}

/** Stores the list; stamped by the caller. */
export function writeHabits(db: Pick<Db, 'setMeta'>, player: string, h: Habits): void {
  db.setMeta(key(player), JSON.stringify({ rules: h.rules, through: h.through }));
}

/** Her line on plain in-character turns; null with no rules. */
export function habitsLine(rules: readonly string[]): string | null {
  if (rules.length === 0) return null;
  const said = rules.map((r) => {
    const t = r.trim().replace(/\.+$/, '');
    return t.charAt(0).toLowerCase() + t.slice(1);
  });
  return `[worn thin — leave out: ${said.join(' · ')}]`;
}
