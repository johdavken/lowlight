/**
 * Calls to Anthropic's Messages API with the player's key (Anthropic backend spec §3): a streamed round of her
 * turn, a one-shot call for the narrator and the rest, and the key check. Errors become the game's own kinds;
 * the key goes only into the SDK's x-api-key header and is redacted from every message.
 */
import Anthropic from '@anthropic-ai/sdk';
import { toAnthropicRequest, toChunks, type AnthropicUsage, type ChatBody, type ChunkData } from './anthropic-convert';
import type { AnthropicRoute } from './model-route';
import { NarratorError } from './scenario';
import { TurnError, type CompletionMessage } from './turn';
import { ANTHROPIC_BASE_URL } from './config';

const CHECK_TIMEOUT_MS = 5_000;
/** Anthropic's answer when the org's credits are spent (a 400, not a 402). */
const NO_CREDIT = /credit balance/i;

export function anthropicClient(key: string, o: { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Anthropic {
  return new Anthropic({
    apiKey: key,
    // The game's own retry rules are the only ones (one wait on a 429, direct.ts).
    maxRetries: 0,
    // Always given: left out, the SDK reads ANTHROPIC_BASE_URL, which a Claude Code shell points elsewhere.
    baseURL: o.baseUrl ?? ANTHROPIC_BASE_URL,
    ...(o.fetchImpl ? { fetch: o.fetchImpl } : {}),
    ...(o.timeoutMs ? { timeout: o.timeoutMs } : {}),
  });
}

/** Removes the key, and anything shaped like an Anthropic key, from text bound for a log or the page. */
export const redactAnthropic = (text: string, key: string): string => text.replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-…').split(key).join('…');

/** The API's own reason, not the SDK's "400 {json}". */
function reasonOf(err: InstanceType<typeof Anthropic.APIError>): string {
  const inner = (err.error as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof inner === 'string' ? inner : err.message;
}

/** An SDK failure as a turn's error kind (spec §3 Errors). Credit carries 402, as OpenRouter's does, so the link reads no-credit. */
export function turnErrorFor(err: unknown, redact: (s: string) => string): TurnError {
  if (err instanceof Anthropic.APIConnectionError) return new TurnError('unreachable', redact(err.message), undefined, undefined, 'anthropic');
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
    const why = redact(reasonOf(err)).slice(0, 300);
    const s = err.status;
    if (s === 401) return new TurnError('auth', why, s, undefined, 'anthropic');
    if (s === 403) return new TurnError('refused', why, s, undefined, 'anthropic');
    if (s === 429 || s >= 500) return new TurnError('busy', why, s, Number(err.headers?.get('retry-after')) || undefined, 'anthropic');
    if (NO_CREDIT.test(why)) return new TurnError('credit', why, 402, undefined, 'anthropic');
    return new TurnError('http', why, s, undefined, 'anthropic');
  }
  return new TurnError('http', redact(err instanceof Error ? err.message : String(err)), undefined, undefined, 'anthropic');
}

/**
 * One streamed round of her turn, as chat chunks. Throws a TurnError before the stream opens; a failure
 * mid-stream arrives as an error chunk. The caller's abort (her stall clock) is rethrown as an AbortError.
 */
export async function openAnthropicRound(
  route: AnthropicRoute,
  body: ChatBody,
  o: { signal?: AbortSignal; baseUrl?: string; fetchImpl?: typeof fetch; onUsage?: (u: AnthropicUsage) => void } = {},
): Promise<AsyncIterable<ChunkData>> {
  const redact = (s: string) => redactAnthropic(s, route.key);
  const client = anthropicClient(route.key, o);
  let stream: AsyncIterable<Parameters<typeof toChunks>[0] extends AsyncIterable<infer E> ? E : never>;
  try {
    stream = await client.beta.messages.create({ ...toAnthropicRequest(body, route.native), stream: true }, o.signal ? { signal: o.signal } : {});
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    throw turnErrorFor(err, redact);
  }
  return (async function* () {
    try {
      yield* toChunks(stream, o.onUsage);
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError || o.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      yield { error: { message: turnErrorFor(err, redact).message } };
    }
  })();
}

/** One non-streamed call (the narrator, scribe, dice, pick check): her text. Throws a NarratorError. */
export async function anthropicComplete(o: {
  key: string;
  native: string;
  messages: CompletionMessage[];
  maxTokens: number;
  effort: 'low' | 'medium';
  timeoutMs: number;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onUsage?: (u: AnthropicUsage) => void;
}): Promise<{ text: string; tokensIn: number | null; tokensOut: number | null }> {
  const redact = (s: string) => redactAnthropic(s, o.key);
  const client = anthropicClient(o.key, o);
  const signal = o.signal ? AbortSignal.any([AbortSignal.timeout(o.timeoutMs), o.signal]) : AbortSignal.timeout(o.timeoutMs);
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create(toAnthropicRequest({ max_tokens: o.maxTokens, effort: o.effort, messages: o.messages }, o.native), { signal });
  } catch (err) {
    // The caller's own abort is theirs to read; only the timeout is a failure to tell.
    if (o.signal?.aborted) throw err;
    if (signal.aborted || err instanceof Anthropic.APIConnectionTimeoutError) throw new NarratorError('timeout', `no answer in ${Math.ceil(o.timeoutMs / 1000)} s`);
    if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
      const t = turnErrorFor(err, redact);
      throw new NarratorError(t.kind === 'busy' ? 'busy' : 'refused', `HTTP ${err.status}: ${t.message.slice(0, 200)}`, t.status);
    }
    throw new NarratorError('busy', redact(err instanceof Error ? err.message : String(err)));
  }
  const u = res.usage;
  o.onUsage?.({ model: res.model, input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
  if (res.stop_reason === 'refusal') throw new NarratorError('refused', 'the model declined');
  if (res.stop_reason === 'max_tokens') throw new NarratorError('too-long', `the answer ran past ${o.maxTokens} tokens`);
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return { text, tokensIn: u.input_tokens ?? null, tokensOut: u.output_tokens ?? null };
}

/** Whether Anthropic takes this key: one page of its model list. */
export async function checkAnthropicKey(key: string, o: { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<'ok' | 'key-rejected' | 'unreachable'> {
  try {
    await anthropicClient(key, { ...o, timeoutMs: o.timeoutMs ?? CHECK_TIMEOUT_MS }).models.list({ limit: 1 });
    return 'ok';
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return 'key-rejected';
    return 'unreachable';
  }
}
