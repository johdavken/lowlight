import { describe, expect, it } from 'vitest';
import { toChunks, type AnthropicUsage, type ChunkData } from '../src/anthropic-convert';
import { anthropicClient, anthropicComplete, checkAnthropicKey, openAnthropicRound, turnErrorFor } from '../src/anthropic';
import { ToolCallAssembler } from '../src/direct-tools';
import { NarratorError } from '../src/scenario';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import Anthropic from '@anthropic-ai/sdk';

const KEY = 'sk-ant-test-key-0123456789';
const ROUTE = { provider: 'anthropic' as const, key: KEY, model: 'anthropic/claude-sonnet-5.5', native: 'claude-sonnet-5-5' };
const usage = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 };
const start = (model = 'claude-sonnet-5-5') =>
  ({ type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage } }) as unknown as BetaRawMessageStreamEvent;
const text = (t: string, index = 0) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: t } }) as unknown as BetaRawMessageStreamEvent;
const stop = (reason: string) => [
  { type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 42, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 } },
  { type: 'message_stop' },
] as unknown as BetaRawMessageStreamEvent[];

async function* of<T>(xs: T[]): AsyncGenerator<T> {
  for (const x of xs) yield x;
}
const all = async (g: AsyncIterable<ChunkData>) => {
  const out: ChunkData[] = [];
  for await (const c of g) out.push(c);
  return out;
};

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const apiErr = (status: number, message: string, type = 'invalid_request_error') => json(status, { type: 'error', error: { type, message } });

describe('toChunks', () => {
  it('text deltas in order, then stop', async () => {
    const out = await all(toChunks(of([start(), text('Hel'), text('lo'), ...stop('end_turn')])));
    expect(out.filter((c) => c.choices?.[0]?.delta?.content).map((c) => c.choices![0]!.delta!.content)).toEqual(['Hel', 'lo']);
    expect(out.at(-1)?.choices?.[0]?.finish_reason).toBe('stop');
  });

  it('a tool_use block becomes tool_call fragments the assembler joins', async () => {
    const events = [
      start(),
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'go_to', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"place":' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"roof"}' } },
      { type: 'content_block_stop', index: 1 },
      ...stop('tool_use'),
    ] as unknown as BetaRawMessageStreamEvent[];
    const out = await all(toChunks(of(events)));
    const a = new ToolCallAssembler();
    for (const c of out) a.add(c.choices?.[0]?.delta?.tool_calls);
    expect(a.calls()).toEqual([{ id: 't1', name: 'go_to', args: '{"place":"roof"}' }]);
    expect(out.at(-1)?.choices?.[0]?.finish_reason).toBe('tool_calls');
  });

  it('thinking yields an empty chunk (the stall clock still ticks)', async () => {
    const out = await all(toChunks(of([start(), { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hm' } } as unknown as BetaRawMessageStreamEvent])));
    expect(out).toContainEqual({});
  });

  it('a thinking block comes back whole, signature and all, to send with her tool call', async () => {
    const events = [
      start(),
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hm, ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'the roof' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig1' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'redacted_thinking', data: 'opaque' } },
      { type: 'content_block_stop', index: 1 },
      ...stop('tool_use'),
    ] as unknown as BetaRawMessageStreamEvent[];
    const blocks = (await all(toChunks(of(events)))).flatMap((c) => c.blocks ?? []);
    expect(blocks).toEqual([
      { type: 'thinking', thinking: 'hm, the roof', signature: 'sig1' },
      { type: 'redacted_thinking', data: 'opaque' },
    ]);
  });

  it('stop reasons: max_tokens is length, refusal is an error', async () => {
    expect((await all(toChunks(of([start(), ...stop('max_tokens')])))).at(-1)?.choices?.[0]?.finish_reason).toBe('length');
    expect((await all(toChunks(of([start(), ...stop('refusal')])))).at(-1)).toEqual({ error: { message: 'refused' } });
  });

  it('usage once, with the cache numbers and the model that answered', async () => {
    const seen: AnthropicUsage[] = [];
    await all(toChunks(of([start('claude-opus-5-5'), text('x'), ...stop('end_turn')]), (u) => seen.push(u)));
    expect(seen).toEqual([{ model: 'claude-opus-5-5', input: 10, output: 42, cacheRead: 900, cacheWrite: 0 }]);
  });
});

describe('turnErrorFor', () => {
  const redact = (s: string) => s.split(KEY).join('…');
  const gen = (status: number, message: string) => Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message } }, undefined, new Headers());
  it.each([
    [401, 'invalid x-api-key', 'auth'],
    [403, 'nope', 'refused'],
    [429, 'slow down', 'busy'],
    [529, 'Overloaded', 'busy'],
    [500, 'boom', 'busy'],
    [400, 'Your credit balance is too low to access the Anthropic API.', 'credit'],
  ])('%i → %s', (status, message, kind) => {
    const e = turnErrorFor(gen(status, message), redact);
    expect(e.kind).toBe(kind);
  });
  it('every error from Anthropic says so', () => {
    expect(turnErrorFor(gen(400, 'Your credit balance is too low'), redact).provider).toBe('anthropic');
    expect(turnErrorFor(new Anthropic.APIConnectionError({ message: 'x' }), redact).provider).toBe('anthropic');
  });
  it('credit carries 402 so the link reads no-credit', () => {
    expect(turnErrorFor(gen(400, 'Your credit balance is too low'), redact).status).toBe(402);
  });
  it('an unknown model is http 404 naming the model', () => {
    const e = turnErrorFor(gen(404, 'model: claude-x'), redact);
    expect([e.kind, e.status]).toEqual(['http', 404]);
    expect(e.message).toMatch(/model/);
  });
  it('a connection error is unreachable; the key never shows', () => {
    const e = turnErrorFor(new Anthropic.APIConnectionError({ message: `failed for ${KEY}` }), redact);
    expect(e.kind).toBe('unreachable');
    expect(e.message).not.toContain(KEY);
  });
});

describe('openAnthropicRound', () => {
  it('streams with the key, stream true and no temperature', async () => {
    let seen: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return sse([start(), text('hi'), ...stop('end_turn')]);
    }) as unknown as typeof fetch;
    const chunks = await all(await openAnthropicRound(ROUTE, { max_tokens: 100, effort: 'low', messages: [{ role: 'user', content: 'hey' }] }, { fetchImpl, baseUrl: 'http://fake' }));
    expect(seen!.url).toMatch(/\/v1\/messages/);
    // SDK 1.x sends an API key as a bearer token.
    expect(seen!.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(seen!.body.stream).toBe(true);
    expect('temperature' in seen!.body).toBe(false);
    expect(chunks.some((c) => c.choices?.[0]?.delta?.content === 'hi')).toBe(true);
  });

  it('a refused request throws a TurnError before the stream', async () => {
    const fetchImpl = (async () => apiErr(429, 'slow', 'rate_limit_error')) as unknown as typeof fetch;
    await expect(openAnthropicRound(ROUTE, { max_tokens: 100, effort: 'low', messages: [{ role: 'user', content: 'x' }] }, { fetchImpl, baseUrl: 'http://fake' })).rejects.toMatchObject({ kind: 'busy', status: 429 });
  });
});

describe('anthropicComplete', () => {
  const base = { key: KEY, native: 'claude-sonnet-5-5', messages: [{ role: 'system' as const, content: 'S' }, { role: 'user' as const, content: 'u' }], maxTokens: 300, effort: 'low' as const, timeoutMs: 5000, baseUrl: 'http://fake' };
  const msg = (stop_reason: string, content: unknown[]) => json(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason, usage });
  it('joins the text blocks; tokens in and out', async () => {
    const fetchImpl = (async () => msg('end_turn', [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }])) as unknown as typeof fetch;
    expect(await anthropicComplete({ ...base, fetchImpl })).toEqual({ text: 'ab', tokensIn: 10, tokensOut: 1 });
  });
  it('max_tokens is too-long, refusal is refused', async () => {
    await expect(anthropicComplete({ ...base, fetchImpl: (async () => msg('max_tokens', [])) as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'too-long' });
    await expect(anthropicComplete({ ...base, fetchImpl: (async () => msg('refusal', [])) as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'refused' });
  });
  it('429 is busy; a timeout is timeout', async () => {
    await expect(anthropicComplete({ ...base, fetchImpl: (async () => apiErr(429, 'slow')) as unknown as typeof fetch })).rejects.toBeInstanceOf(NarratorError);
    await expect(anthropicComplete({ ...base, fetchImpl: (async () => apiErr(429, 'slow')) as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'busy' });
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    await expect(anthropicComplete({ ...base, timeoutMs: 30, fetchImpl: hang })).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('anthropicClient', () => {
  it('never takes ANTHROPIC_BASE_URL from the environment (a Claude Code shell sets it)', () => {
    const was = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = 'http://elsewhere.invalid';
    try {
      expect(anthropicClient(KEY).baseURL).toBe('https://api.anthropic.com');
    } finally {
      if (was === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = was;
    }
  });
});

describe('checkAnthropicKey', () => {
  it('ok, rejected, unreachable', async () => {
    expect(await checkAnthropicKey(KEY, { baseUrl: 'http://fake', fetchImpl: (async () => json(200, { data: [], has_more: false, first_id: null, last_id: null })) as unknown as typeof fetch })).toBe('ok');
    expect(await checkAnthropicKey(KEY, { baseUrl: 'http://fake', fetchImpl: (async () => apiErr(401, 'bad key', 'authentication_error')) as unknown as typeof fetch })).toBe('key-rejected');
    expect(await checkAnthropicKey(KEY, { baseUrl: 'http://fake', fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch })).toBe('unreachable');
  });
});

