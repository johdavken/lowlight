/**
 * Liar's dice, her round line (spec §4): after each round her model says one line in character and
 * picks a face. One small side call (the encounter narrator's path: her model, no thinking), never
 * a chat turn; a failure, a bad answer or a slow model just means no line for that round.
 */
import { roundSummary } from '../../shared/dice/text';
import type { RoundRecord } from '../../shared/dice/rules';
import type { CompletionMessage } from './turn';

export const DICE_LINE_TIMEOUT_MS = 10_000;
const LINE_MAX = 200;

export function diceLinePrompt(o: { identity: string; room: string; you: string; her: string; stake: string; record: RoundRecord; recent: string[]; expressions: string[] }): CompletionMessage[] {
  const faces = o.expressions.length ? `${o.expressions.join(', ')}, or neutral` : 'neutral';
  const system = [
    o.identity.trim(),
    `You're playing liar's dice with ${o.you}, for ${o.stake}. A round just ended. Say ONE short line to them, in character (under 25 words): a jab, a tell you noticed, a reaction to winning or losing the die. Don't narrate, don't describe actions, no quotes. Then pick your face for it from: ${faces}. Answer only with JSON: {"line": "...", "expression": "..."}`,
  ].join('\n\n');
  const r = o.record;
  const user = [
    `Where: ${o.room}.`,
    o.recent.length ? `What was said just before:\n${o.recent.join('\n')}` : null,
    `The round: ${roundSummary(r, { you: o.you, her: o.her })}.`,
    `Your dice were ${r.dice.her.join(' ')}; ${o.you}'s were ${r.dice.you.join(' ')}.`,
    `Dice left: you ${r.left.her}, ${o.you} ${r.left.you}.`,
  ].filter((x): x is string => x !== null);
  return [
    { role: 'system', content: system },
    { role: 'user', content: user.join('\n\n') },
  ];
}

/** Her answer, or null when it isn't one: the first {…}, a non-empty line (≤ 200), a face she has (else null). */
export function parseDiceLine(text: string, expressions: string[]): { line: string; expression: string | null } | null {
  const m = /\{[\s\S]*?\}/.exec(text);
  if (!m) return null;
  let v: unknown;
  try {
    v = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.line !== 'string') return null;
  const line = o.line.trim().replace(/^["“”']+|["“”']+$/g, '').trim().slice(0, LINE_MAX);
  if (!line) return null;
  const expression = typeof o.expression === 'string' && expressions.includes(o.expression) ? o.expression : null;
  return { line, expression };
}

export type DiceLineRequest = { round: number; record: RoundRecord; stake: string };
/** `signal` aborts the call (a newer round, or the tab gone): the answer is then null. */
export type DiceLiner = (player: string, req: DiceLineRequest, signal?: AbortSignal) => Promise<{ line: string; expression: string | null } | null>;

/** Her round line for a player's game: the prompt, one call raced against the timeout, the parse. */
export function makeDiceLiner(deps: {
  identity: () => string;
  roomName: () => string;
  you: (player: string) => string;
  her: string;
  expressions: string[];
  recent: (player: string) => string[];
  /** One call to her model; `signal` aborts it (the timeout's, or the caller's). */
  narrate: (messages: CompletionMessage[], signal: AbortSignal) => Promise<string>;
  timeoutMs?: number;
}): DiceLiner {
  return async (player, req, signal) => {
    const messages = diceLinePrompt({
      identity: deps.identity(),
      room: deps.roomName(),
      you: deps.you(player),
      her: deps.her,
      stake: req.stake,
      record: req.record,
      recent: deps.recent(player),
      expressions: deps.expressions,
    });
    // Past the timeout the request itself is aborted, not just ignored: it isn't left running (and billed).
    const stop = new AbortController();
    const onAbort = () => stop.abort();
    signal?.addEventListener('abort', onAbort);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => (stop.abort(), resolve(null)), deps.timeoutMs ?? DICE_LINE_TIMEOUT_MS)));
    const aborted = new Promise<null>((resolve) => stop.signal.addEventListener('abort', () => resolve(null)));
    try {
      if (signal?.aborted) return null;
      const text = await Promise.race([deps.narrate(messages, stop.signal), timeout, aborted]);
      return text === null ? null : parseDiceLine(text, deps.expressions);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}
