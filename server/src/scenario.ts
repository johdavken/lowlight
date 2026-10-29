/**
 * Scenario cards (spec 2026-10-09 §2): the narrator that writes three openings for a new game, and
 * the one-off, non-streaming call to her model that runs it.
 */
import { parse as parseYaml } from 'yaml';
import type { NarratorKind } from '../../shared/narrator';
import type { NarratorThinking } from '../../shared/types';
import type { CompletionMessage } from './turn';
import { oneLine } from './persona';
import { SUGGEST_STEER_MAX } from './suggest';

/** What's kept of a steer typed in the box, as SUGGEST keeps it. */
const cutSteer = (s: string) => (s.length > SUGGEST_STEER_MAX ? `${s.slice(0, SUGGEST_STEER_MAX - 1)}…` : s);

/** The narrator's instructions (spec §2, exact). */
export const NARRATOR_SYSTEM =
  'You write openings for a roleplay in Lowlight. Write one opening for a first scene between these two people, in the third person and present tense: a title of at most 40 characters and two or three sentences of at most 600 characters. Use only the places and facts given. Never write what the user does, says or feels. If the user says what they want the opening to be, build it from that. Answer only with a JSON object {"title","text"}.';
export const NARRATOR_TEMPERATURE = 0.9;
export const NARRATOR_MAX_TOKENS = 900;
/** How long one narrator request may take before it's given up (each of the route's two tries). */
export const NARRATOR_TIMEOUT_MS = 45_000;

/**
 * What a room's art shows, for the narrator: its art prompt's `narration:` front-matter field when
 * there is one, else the body's first paragraph — the room itself, before the directions to the
 * painter (guide shapes, "no letters") that follow. Null when there's nothing.
 */
export function artNarration(md: string): string | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (m) {
    try {
      const front = parseYaml(m[1]) as { narration?: unknown } | null;
      if (typeof front?.narration === 'string' && front.narration.trim()) return front.narration.trim().replace(/\s+/g, ' ');
    } catch {
      // Front matter that doesn't parse: the body still says what the room looks like.
    }
  }
  const body = m ? md.slice(m[0].length) : md;
  const first = body.split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s+/g, ' ').trim()).find(Boolean);
  return first ?? null;
}

/**
 * A narrator call that failed, with the kind the player is told (spec 2026-10-14 §3). A non-2xx
 * answer carries its status (401 a rejected key, 402 no credit). The message is the raw reason,
 * for the log and the dev panel; it never holds the key.
 */
export class NarratorError extends Error {
  constructor(
    readonly kind: Exclude<NarratorKind, 'bad-answer'>,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NarratorError';
  }
}

/** Room for thinking on the retry, above the call's own cap (spec 2026-10-14 §2): 3,000 for the narrator's 900. */
export const THINKING_ROOM = 2100;
/** The same for SYS → NARRATOR THINKING at MEDIUM. */
export const MEDIUM_THINKING_ROOM = 4200;

/** Models that refused to answer without thinking (or thought past the cap anyway), this run: auto skips the no-thinking try for them. */
const mustThink = new Set<string>();

/** Tests: start with nothing remembered. */
export function forgetThinkingRefusals(): void {
  mustThink.clear();
}

/** The narrator's request: the room (with what its art shows), the lore there, who you are and who she is (her public file only). */
export function scenePrompt(o: {
  room: { name: string; art: string | null; timeOfDay: string | null; weather: string | null };
  lore: string | null;
  you: string;
  her: string;
  /** The player's name, and what they typed in the box (arrival screen spec §3): null for none. */
  player: string;
  steer: string | null;
}): CompletionMessage[] {
  const when = [o.room.timeOfDay, o.room.weather && o.room.weather !== 'none' ? o.room.weather : null].filter(Boolean).join(', ');
  const facts = [
    `Where: ${o.room.name}${when ? ` (${when})` : ''}.`,
    o.room.art ? `What the room looks like: ${o.room.art}` : null,
    o.lore,
    `The user's character:\n${o.you}`,
    `The other character:\n${o.her}`,
    o.steer ? `What ${o.player} wants the opening to be: ${cutSteer(oneLine(o.steer))}` : null,
  ].filter((x): x is string => Boolean(x));
  return [
    { role: 'system', content: NARRATOR_SYSTEM },
    { role: 'user', content: facts.join('\n\n') },
  ];
}

type CompleteOptions = {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: CompletionMessage[];
  temperature: number;
  maxTokens: number;
  /**
   * OpenRouter only (unset: no reasoning field at all). auto asks the model not to think first (GLM's
   * thinking ran 120–1,700 tokens and blew the cap); one that refuses, or thinks past the cap anyway,
   * is asked once more with low thinking and THINKING_ROOM more tokens (spec 2026-10-14 §2), and is
   * remembered so its next call goes straight to low. off never retries; low and medium always think.
   */
  thinking?: NarratorThinking;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Aborts the request early (the caller no longer wants the answer). */
  signal?: AbortSignal;
};

/** Why the first call should be asked again with thinking allowed: it was refused for it, or cut off by it. */
class ThinkingNeeded extends Error {}

/** One non-streaming chat completion; its text. Throws a NarratorError, never with the key in the message. */
export async function completeOnce(o: CompleteOptions): Promise<string> {
  return (await completeOnceWithUsage(o)).text;
}

/** completeOnce, plus the tokens the provider counted (null when it didn't say): the scribe logs them. */
export async function completeOnceWithUsage(o: CompleteOptions): Promise<{ text: string; tokensIn: number | null; tokensOut: number | null }> {
  switch (o.thinking) {
    case undefined:
      return callOnce(o, undefined, o.maxTokens, false);
    case 'off':
      return callOnce(o, { enabled: false }, o.maxTokens, false);
    case 'medium':
      return callOnce(o, { effort: 'medium' }, o.maxTokens + MEDIUM_THINKING_ROOM, false);
    case 'low':
      return callOnce(o, { effort: 'low' }, o.maxTokens + THINKING_ROOM, false);
    case 'auto':
      if (mustThink.has(o.model)) return callOnce(o, { effort: 'low' }, o.maxTokens + THINKING_ROOM, false);
      try {
        return await callOnce(o, { enabled: false }, o.maxTokens, true);
      } catch (err) {
        if (!(err instanceof ThinkingNeeded)) throw err;
        mustThink.add(o.model);
        return callOnce(o, { effort: 'low' }, o.maxTokens + THINKING_ROOM, false);
      }
  }
}

async function callOnce(
  o: CompleteOptions,
  reasoning: Record<string, unknown> | undefined,
  maxTokens: number,
  mayRetry: boolean,
): Promise<{ text: string; tokensIn: number | null; tokensOut: number | null }> {
  const f = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? NARRATOR_TIMEOUT_MS;
  let res: Response;
  let text: string;
  try {
    const signal = o.signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), o.signal]) : AbortSignal.timeout(timeoutMs);
    res = await f(`${o.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}) },
      body: JSON.stringify({ model: o.model, messages: o.messages, stream: false, temperature: o.temperature, max_tokens: maxTokens, ...(reasoning ? { reasoning } : {}) }),
      signal,
    });
    text = await res.text();
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      // The caller's own abort is theirs to read; only the timeout is a failure to tell.
      if (o.signal?.aborted) throw err;
      throw new NarratorError('timeout', `no answer in ${Math.ceil(timeoutMs / 1000)} s`);
    }
    if (o.signal?.aborted) throw err;
    const why = err instanceof Error ? err.message : String(err);
    throw new NarratorError('busy', o.apiKey ? why.split(o.apiKey).join('[key]') : why);
  }
  if (!res.ok) {
    const redacted = o.apiKey ? text.split(o.apiKey).join('[key]') : text;
    if (mayRetry && res.status === 400 && /reasoning is mandatory/i.test(text)) throw new ThinkingNeeded();
    const kind = res.status === 429 || res.status >= 500 ? 'busy' : 'refused';
    throw new NarratorError(kind, `HTTP ${res.status}: ${redacted.slice(0, 200)}`, res.status);
  }
  let body: { choices?: { finish_reason?: string | null; message?: { content?: string | null; reasoning?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } };
  try {
    body = JSON.parse(text);
  } catch {
    throw new NarratorError('unknown', `not JSON: ${(o.apiKey ? text.split(o.apiKey).join('[key]') : text).slice(0, 80)}`);
  }
  const choice = body.choices?.[0];
  // A reasoning model's thinking counts toward the cap: a cut-off answer is never three setups, so say why.
  if (choice?.finish_reason === 'length') {
    const thought = (body.usage?.completion_tokens_details?.reasoning_tokens ?? 0) > 0 || Boolean(choice.message?.reasoning);
    if (mayRetry && thought) throw new ThinkingNeeded();
    throw new NarratorError('too-long', `the answer ran past ${maxTokens} tokens`);
  }
  return { text: choice?.message?.content ?? '', tokensIn: body.usage?.prompt_tokens ?? null, tokensOut: body.usage?.completion_tokens ?? null };
}
