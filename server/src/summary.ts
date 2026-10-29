/**
 * The rolling summary (scribe spec §6): when the history's start is about to jump past messages, one
 * call folds them into a single "earlier tonight" paragraph, so the flow of a long scene survives.
 * Stored as story meta `summary.<player>` = { text, through }: rewind and BRANCH HERE undo it.
 */
import { JOBS_APART } from './instructions';
import type { ChatMessage } from '../../shared/types';
import type { Db } from './db';
import { historyStart, toCompletion } from './history';
import type { CompletionMessage } from './turn';

/** What the summary call asks for. GLM writes nearly twice this whatever it's told. */
export const SUMMARY_MAX = 1500;
/** What's kept: GLM's usual length whole; past it, the oldest sentences go (the newest is what the next turn needs). */
export const SUMMARY_KEEP = 3000;
export const SUMMARY_LINE = (text: string) => `[earlier tonight: ${text}]`;

const key = (player: string) => `summary.${player}`;

export interface Summary {
  text: string;
  through: string;
  /**
   * The summary this one replaced. A summary is written a turn ahead, while the line it runs to is still
   * sent; until that line drops out, the one before stands in (final review I2).
   */
  prev?: { text: string; through: string };
}

const isPart = (v: unknown): v is { text: string; through: string } =>
  typeof v === 'object' && v !== null && typeof (v as { text?: unknown }).text === 'string' && typeof (v as { through?: unknown }).through === 'string';

export function readSummary(db: Pick<Db, 'getMeta'>, player: string): Summary | null {
  const raw = db.getMeta(key(player));
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as { prev?: unknown };
    if (!isPart(v)) return null;
    return { text: v.text, through: v.through, ...(isPart(v.prev) ? { prev: { text: v.prev.text, through: v.prev.through } } : {}) };
  } catch {
    return null;
  }
}

/** The last `max` characters, starting at a sentence (or failing that, a word) so the cut doesn't show. */
function keepNewest(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = text.slice(-max);
  const sentence = tail.search(/[.!?]["'”’)*]*\s+\S/);
  if (sentence >= 0 && sentence < max / 5) return tail.slice(sentence).replace(/^[.!?]["'”’)*]*\s+/, '');
  const space = tail.indexOf(' ');
  return space >= 0 ? tail.slice(space + 1) : tail;
}

/** Stores the summary, its oldest part dropped past SUMMARY_KEEP, keeping the one it replaces as `prev`; stamped by the caller. */
export function writeSummary(db: Pick<Db, 'setMeta' | 'getMeta'>, player: string, s: { text: string; through: string }): void {
  const old = readSummary(db, player);
  const next: Summary = { text: keepNewest(s.text.trim(), SUMMARY_KEEP), through: s.through, ...(old ? { prev: { text: old.text, through: old.through } } : {}) };
  db.setMeta(key(player), JSON.stringify(next));
}

/** A first summary (none yet, or its line gone) reads at most this many of the lines it would cover: a long save's whole past would cost too much. */
export const SUMMARY_FIRST_MAX = 40;

/**
 * The messages the next turn would drop (one more exchange, as long as the last one) that the summary
 * doesn't cover yet, oldest first; empty when nothing is due.
 */
export function summaryDue(history: ChatMessage[], through: string | null): ChatMessage[] {
  const sent = history.map((m) => ({ m, c: toCompletion(m) })).filter((x): x is { m: ChatMessage; c: CompletionMessage } => x.c !== null);
  const lastOf = (role: CompletionMessage['role']) => sent.findLast((x) => x.c.role === role)?.c.content.length ?? 0;
  const next: CompletionMessage[] = [
    { role: 'user', content: 'x'.repeat(lastOf('user')) },
    { role: 'assistant', content: 'x'.repeat(lastOf('assistant')) },
  ];
  const start = Math.min(historyStart([...sent.map((x) => x.c), ...next]), sent.length);
  const dropping = sent.slice(0, start).map((x) => x.m);
  if (through === null) return dropping.slice(-SUMMARY_FIRST_MAX);
  const at = dropping.findIndex((m) => m.id === through);
  if (at >= 0) return dropping.slice(at + 1);
  // Covered past where the history would start (or a line from before what was passed in): nothing new, or the newest of it.
  return sent.some((x) => x.m.id === through) ? [] : dropping.slice(-SUMMARY_FIRST_MAX);
}

/** The summary call: the Residual's opening, then the old summary and the lines about to drop. */
export function summaryMessages(old: string | null, dropping: ChatMessage[], names: { self: string; player: string }): CompletionMessage[] {
  const lines = dropping
    .map((m) => ({ m, c: toCompletion(m) }))
    .filter((x): x is { m: ChatMessage; c: CompletionMessage } => x.c !== null)
    .map(({ m, c }) => `${m.role === 'user' ? names.player : names.self}: ${c.content.replace(/\s*\n\s*/g, ' ')}`);
  const system = [
    `You keep the records for a roleplay between ${names.self} and ${names.player}. You never write story. Now you keep its running summary: what happened tonight, in order, and the mood they're in now.`,
    `Fold the new lines into the summary so far. Keep the turns that matter and what led to them; drop small talk. Lasting facts are kept elsewhere: this is the flow of the night. Up to ${SUMMARY_MAX} characters of plain prose, past tense, no headings, no JSON.`,
    JOBS_APART,
  ].join('\n\n');
  const user = [`The summary so far: ${old ?? '(none yet)'}`, `The new lines:\n${lines.join('\n')}`].join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
