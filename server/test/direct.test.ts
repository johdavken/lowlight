import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import type { DirectSetup } from '../src/agents';
import { DIRECT_ALREADY_SHOWN, DIRECT_CONTINUE_NUDGE, DIRECT_SPEAK_NUDGE, createDirectBackend, type DirectBackendOptions } from '../src/direct';
import { TurnError } from '../src/turn';
import type { SseFrame } from '../src/sse';
import { chunk, startStubOpenRouter, type StubOpenRouter, type StubOpenRouterStep } from './fixtures/stub-openrouter';

const KEY = 'sk-or-test';
let stub: StubOpenRouter | null = null;
afterEach(async () => {
  await stub?.close();
  stub = null;
});

const setupFor = (baseUrl: string, over: Partial<DirectSetup> = {}): DirectSetup => ({
  provider: 'openrouter',
  baseUrl,
  keyName: 'openrouter',
  defaultModel: 'z-ai/glm-5.2',
  temperature: 0.9,
  maxTokens: 400,
  identity: () => 'You are Nix.',
  ...over,
});

async function backendWith(steps: StubOpenRouterStep[], over: Partial<DirectSetup> = {}, opts: Partial<DirectBackendOptions> = {}) {
  stub = await startStubOpenRouter(steps);
  let chosen = over.defaultModel ?? 'z-ai/glm-5.2';
  const notices: string[] = [];
  const sleeps: number[] = [];
  const backend = createDirectBackend({
    setup: setupFor(stub.url, over),
    tools: { room: undefined as never, journal: undefined as never, player: () => 'hicks', expressions: null },
    model: { get: () => chosen, set: (id) => (chosen = id ?? 'z-ai/glm-5.2') },
    apiKey: () => KEY,
    onNotice: (t) => notices.push(t),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...opts,
  });
  return { backend, notices, sleeps, chosen: () => chosen, stub: stub! };
}

const messages = [
  { role: 'system' as const, content: 'S' },
  { role: 'user' as const, content: 'hi' },
];
async function run(gen: AsyncGenerator<SseFrame>): Promise<SseFrame[]> {
  const out: SseFrame[] = [];
  for await (const f of gen) out.push(f);
  return out;
}
const turn = (b: { streamTurn: (r: any) => AsyncGenerator<SseFrame> }, over: Record<string, unknown> = {}) =>
  run(b.streamTurn({ messages, model: null, regenerate: false, ...over }));
const text = (frames: SseFrame[]) => frames.filter((f) => f.event === 'assistant.delta').map((f) => (f.data as { delta: string }).delta).join('');
const ok = (...parts: string[]): StubOpenRouterStep => ({ chunks: [...parts.map((p) => chunk(p)), chunk(undefined, 'stop')] });

async function thrown(p: Promise<unknown>): Promise<TurnError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof TurnError) return err;
    throw err;
  }
  throw new Error('did not throw');
}

describe('createDirectBackend: the request', () => {
  it('reads the key per request', async () => {
    let key = 'sk-or-k1';
    const { backend, stub } = await backendWith([ok('One.'), ok('Two.')], {}, { apiKey: () => key });
    await turn(backend);
    key = 'sk-or-k2';
    await turn(backend);
    const posts = stub.requests.filter((r) => r.method === 'POST');
    expect(posts.map((r) => r.headers.authorization)).toEqual(['Bearer sk-or-k1', 'Bearer sk-or-k2']);
  });

  it('a key unlinked before (or mid-) turn: no request goes out; it throws no-link', async () => {
    const { backend, stub } = await backendWith([ok('Hi.')], {}, { apiKey: () => null });
    const err = await thrown(turn(backend));
    expect(err.kind).toBe('no-link');
    expect(stub.requests).toHaveLength(0);
  });

  it('an error echoing a key that was since replaced is still redacted', async () => {
    let key = 'custom-secret-key-1';
    const { backend } = await backendWith([{ status: 400, json: { error: { message: 'bad key custom-secret-key-1' } } } as never], { provider: 'openai-compatible', keyName: 'lab' }, {
      apiKey: () => key,
      fetchImpl: async (url, init) => {
        key = 'custom-secret-key-2';
        return fetch(url, init);
      },
    });
    const err = await thrown(turn(backend));
    expect(err.message).not.toContain('custom-secret-key-1');
  });

  it('a keyless setup (keyName null) sends no Authorization header', async () => {
    const { backend, stub } = await backendWith([ok('Hi.')], { provider: 'openai-compatible', keyName: null }, { apiKey: () => '' });
    await turn(backend);
    expect(stub.requests.find((r) => r.method === 'POST')!.headers.authorization).toBeUndefined();
  });

  it('sends model, stream true, temperature, max_tokens and the messages, with auth and X-Title', async () => {
    const { backend, stub } = await backendWith([ok('Hi.')]);
    await turn(backend);
    const req = stub.requests.find((r) => r.method === 'POST')!;
    expect(req.url).toBe('/api/v1/chat/completions');
    expect(req.body).toMatchObject({ model: 'z-ai/glm-5.2', stream: true, temperature: 0.9, max_tokens: 400, messages });
    expect(req.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(req.headers['x-title']).toBe('Lowlight');
  });

  it('never sends set_expression, even for a character with expressions (faces come from her *actions*)', async () => {
    const expressions = { names: () => ['happy', 'annoyed'], set: () => ({ ok: true as const, text: 'expression: happy' }) };
    const withExpr = await backendWith([ok('Hi.')], {}, { tools: { room: undefined as never, journal: undefined as never, player: () => 'hicks', expressions } });
    await turn(withExpr.backend);
    const toolNames = withExpr.stub.requests[0].body.tools.map((t: { function: { name: string } }) => t.function.name);
    expect(toolNames).not.toContain('set_expression');

    const without = await backendWith([ok('Hi.')]);
    await turn(without.backend);
    const toolNames2 = without.stub.requests[0].body.tools.map((t: { function: { name: string } }) => t.function.name);
    expect(toolNames2).not.toContain('set_expression');
  });

  it('regenerate raises temperature by 0.2, capped at 1.5', async () => {
    const a = await backendWith([ok('a')]);
    await turn(a.backend, { regenerate: true });
    expect(a.stub.requests[0].body.temperature).toBeCloseTo(1.1);
    await a.stub.close();
    const b = await backendWith([ok('b')], { temperature: 1.4 });
    await turn(b.backend, { regenerate: true });
    expect(b.stub.requests[0].body.temperature).toBe(1.5);
  });

  it('uses the chosen model, not the default', async () => {
    const { backend, stub } = await backendWith([ok('a')]);
    await turn(backend, { model: { model: 'deepseek/deepseek-v3.2', provider: 'openrouter' } });
    expect(stub.requests[0].body.model).toBe('deepseek/deepseek-v3.2');
  });
});

describe('createDirectBackend: streaming', () => {
  it('yields stream.open with the model used, then content deltas, then run.completed on stop', async () => {
    const { backend } = await backendWith([ok('*She looks up.*', ' Hey.')]);
    const frames = await turn(backend);
    expect(frames[0]).toEqual({ event: 'stream.open', data: { model: 'z-ai/glm-5.2' } });
    expect(text(frames)).toBe('*She looks up.* Hey.');
    expect(frames.at(-1)!.event).toBe('run.completed');
    expect(frames.filter((f) => f.event === 'run.completed')).toHaveLength(1);
  });

  it("drops a tool call she wrote into the story as its own line (Cass: '*set_expression name: neutral*')", async () => {
    const { backend } = await backendWith([ok('*The screens go black.*\n\n*set_expr', 'ession name: neutral*\n\nWell. That', "'s not ideal.")]);
    expect(text(await turn(backend))).toBe("*The screens go black.*\n\nWell. That's not ideal.");
  });

  it('a round that ran out at the cap with no text (her thinking ate it) is asked once more, thinking low with more room', async () => {
    const { backend, stub, notices } = await backendWith([{ chunks: [chunk(undefined, 'length')] }, ok('*He looks up.* Hicks.')]);
    expect(text(await turn(backend))).toBe('*He looks up.* Hicks.');
    const posts = stub.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0].body.reasoning).toBeUndefined();
    expect(posts[1].body.reasoning).toEqual({ effort: 'low' });
    expect(posts[1].body.max_tokens).toBeGreaterThan(posts[0].body.max_tokens);
    expect(notices).toEqual([]);
  });

  it('only once: a retry that runs out too says the reply was cut off, with no third call', async () => {
    const { backend, stub, notices } = await backendWith([{ chunks: [chunk(undefined, 'length')] }, { chunks: [chunk(undefined, 'length')] }, ok('never')]);
    await turn(backend);
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(2);
    expect(notices).toEqual(['// REPLY CUT OFF — RAISE MAX TOKENS']);
  });

  it('a reply cut off after some text keeps it and is finished in one more round: thinking low, more room, no tools', async () => {
    const { backend, stub, notices } = await backendWith([{ chunks: [chunk('He looks at the page. Then'), chunk(undefined, 'length')] }, ok('at you.')]);
    expect(text(await turn(backend))).toBe('He looks at the page. Then at you.');
    const posts = stub.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1].body.reasoning).toEqual({ effort: 'low' });
    expect(posts[1].body.max_tokens).toBeGreaterThan(posts[0].body.max_tokens);
    expect(posts[1].body.tool_choice).toBe('none');
    expect(posts[1].body.messages.slice(-2)).toEqual([
      { role: 'assistant', content: 'He looks at the page. Then' },
      { role: 'user', content: DIRECT_CONTINUE_NUDGE },
    ]);
    expect(notices).toEqual([]);
  });

  it('a finishing round that runs out too says the reply was cut off, with no third call', async () => {
    const { backend, stub, notices } = await backendWith([{ chunks: [chunk('He looks'), chunk(undefined, 'length')] }, { chunks: [chunk(' at the'), chunk(undefined, 'length')] }, ok('never')]);
    const frames = await turn(backend);
    expect(text(frames)).toBe('He looks at the');
    expect(frames.at(-1)!.event).toBe('run.completed');
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(2);
    expect(notices).toEqual(['// REPLY CUT OFF — RAISE MAX TOKENS']);
  });

  it('a stream that goes silent mid-reply fails plainly after the stall limit, keeping what she wrote', async () => {
    const { backend } = await backendWith([{ chunks: [chunk('*He looks')], hang: true }], {}, { stallMs: 200 });
    const started = Date.now();
    const frames = await turn(backend);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(text(frames)).toBe('*He looks');
    const last = frames.at(-1)!;
    expect(last.event).toBe('run.failed');
    expect(String(last.data)).toMatch(/went quiet/);
  });

  it('a stream that goes silent before a single frame fails the same way', async () => {
    const { backend } = await backendWith([{ chunks: [], hang: true }], {}, { stallMs: 200 });
    const frames = await turn(backend);
    expect(frames.at(-1)!.event).toBe('run.failed');
    expect(String(frames.at(-1)!.data)).toMatch(/went quiet/);
  });

  it('a slow but steady stream (each gap under the limit) is not a stall', async () => {
    const { backend } = await backendWith([{ chunks: [chunk('*He'), chunk(' looks'), chunk(' up.*'), chunk(undefined, 'stop')], gapMs: 120 }], {}, { stallMs: 300 });
    const frames = await turn(backend);
    expect(text(frames)).toBe('*He looks up.*');
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('finish_reason stop gives no cut-off notice', async () => {
    const { backend, notices } = await backendWith([ok('Hi.')]);
    await turn(backend);
    expect(notices).toEqual([]);
  });

  it('ignores delta.reasoning and SSE comment lines', async () => {
    const { backend } = await backendWith([
      { raw: [': OPENROUTER PROCESSING\n\n'], chunks: [{ choices: [{ index: 0, delta: { reasoning: 'thinking…' }, finish_reason: null }] }, chunk('Hi.'), chunk(undefined, 'stop')] },
    ]);
    expect(text(await turn(backend))).toBe('Hi.');
  });

  it('an error object mid-stream with no finish_reason yields run.failed after the text so far (Review Focus 3)', async () => {
    const { backend } = await backendWith([{ chunks: [chunk('Half a '), { error: { code: 502, message: 'provider fell over' } }], done: false }]);
    const frames = await turn(backend);
    expect(text(frames)).toBe('Half a ');
    expect(frames.at(-1)!.event).toBe('run.failed');
  });
});

describe('createDirectBackend: errors', () => {
  const kindFor = async (status: number) => {
    const { backend } = await backendWith([{ status, json: { error: { message: `status ${status}` } } }]);
    const err = await thrown(turn(backend));
    await stub!.close();
    stub = null;
    return err.kind;
  };

  it('401 → auth, 402 → credit, 403 → refused, 500 → http', async () => {
    expect(await kindFor(401)).toBe('auth');
    expect(await kindFor(402)).toBe('credit');
    expect(await kindFor(403)).toBe('refused');
    expect(await kindFor(500)).toBe('http');
  });

  it('connection refused → unreachable', async () => {
    const backend = createDirectBackend({
      setup: setupFor('http://127.0.0.1:9/api/v1'),
      tools: { room: undefined as never, journal: undefined as never, player: () => 'hicks', expressions: null },
      model: { get: () => 'z-ai/glm-5.2', set: () => {} },
      apiKey: () => KEY,
      onNotice: () => {},
    });
    expect((await thrown(turn(backend))).kind).toBe('unreachable');
  });

  it('429 waits Retry-After (capped at 5 s) and retries once', async () => {
    const { backend, sleeps, stub } = await backendWith([{ status: 429, headers: { 'Retry-After': '30' }, json: {} }, ok('Fine.')]);
    expect(text(await turn(backend))).toBe('Fine.');
    expect(sleeps).toEqual([5000]);
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(2);
  });

  it('429 without Retry-After waits 2 s; a second 429 → busy', async () => {
    const { backend, sleeps } = await backendWith([{ status: 429, json: {} }, { status: 429, json: {} }]);
    expect((await thrown(turn(backend))).kind).toBe('busy');
    expect(sleeps).toEqual([2000]);
  });

  it('a 404 naming the model retries once on the default, with a notice, and resets the choice', async () => {
    const { backend, notices, chosen, stub } = await backendWith([
      { status: 404, json: { error: { message: 'No endpoints found for z-ai/glm-5.2-x.' } } },
      ok('Back.'),
    ]);
    const frames = await turn(backend, { model: { model: 'z-ai/glm-5.2-x', provider: 'openrouter' } });
    expect(notices).toEqual(['// GLM-5.2-X UNAVAILABLE — BACK ON GLM-5.2']);
    expect(chosen()).toBe('z-ai/glm-5.2');
    expect(stub.requests.filter((r) => r.method === 'POST').map((r) => r.body.model)).toEqual(['z-ai/glm-5.2-x', 'z-ai/glm-5.2']);
    expect(frames[0]).toEqual({ event: 'stream.open', data: { model: 'z-ai/glm-5.2' } });
  });

  it('when the default itself is unknown → http, no retry', async () => {
    const { backend, stub } = await backendWith([{ status: 400, json: { error: { message: 'z-ai/glm-5.2 is not a valid model ID' } } }]);
    expect((await thrown(turn(backend))).kind).toBe('http');
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('the key never appears in a thrown error message, even when the provider echoes it', async () => {
    const { backend } = await backendWith([{ status: 400, json: { error: { message: `bad request for key ${KEY} and sk-or-v1-abc123` } } }]);
    const err = await thrown(turn(backend));
    expect(err.message).not.toContain(KEY);
    expect(err.message).not.toContain('sk-or-v1-abc123');
    expect(err.message).toContain('sk-or-…');
  });
});

describe('createDirectBackend: status', () => {
  it("probe: /key 200 → 'ok' and credit; cached 15 s", async () => {
    let t = 0;
    const { backend, stub } = await backendWith([], {}, { now: () => t });
    expect(await backend.probe()).toBe('ok');
    expect(backend.credit()).toBe(4.12);
    stub.key = { status: 401, json: {} };
    t = 14_000;
    expect(await backend.probe()).toBe('ok');
    t = 15_001;
    expect(await backend.probe()).toBe('key-rejected');
    const keyCalls = stub.requests.filter((r) => r.url.endsWith('/key'));
    expect(keyCalls).toHaveLength(2);
    expect(keyCalls[0].headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("probe: a /key request that never answers gives up after the timeout → 'unreachable' (final review I1)", async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError'))));
    const backend = createDirectBackend({
      setup: setupFor('http://x/api/v1'),
      tools: { room: undefined as never, journal: undefined as never, player: () => 'hicks', expressions: null },
      model: { get: () => 'm', set: () => {} },
      apiKey: () => KEY,
      onNotice: () => {},
      fetchImpl: hanging,
      probeTimeoutMs: 30,
    });
    expect(await backend.probe()).toBe('unreachable');
  });

  it("probe: network failure → 'unreachable'", async () => {
    const backend = createDirectBackend({
      setup: setupFor('http://127.0.0.1:9/api/v1'),
      tools: { room: undefined as never, journal: undefined as never, player: () => 'hicks', expressions: null },
      model: { get: () => 'm', set: () => {} },
      apiKey: () => KEY,
      onNotice: () => {},
    });
    expect(await backend.probe()).toBe('unreachable');
  });

  it("probe: an openai-compatible address without /key (404) → 'ok', credit null", async () => {
    const { backend, stub } = await backendWith([], { provider: 'openai-compatible' });
    stub.key = { status: 404, json: {} };
    expect(await backend.probe()).toBe('ok');
    expect(backend.credit()).toBeNull();
  });

  it("probe with no key → 'no-link' without a request; not ready", async () => {
    const { backend, stub } = await backendWith([], {}, { apiKey: () => null });
    expect(await backend.probe()).toBe('no-link');
    expect(backend.ready()).toBe(false);
    expect(stub.requests).toHaveLength(0);
  });

  it("probe: limit_remaining 0 → 'no-credit'", async () => {
    const { backend, stub } = await backendWith([]);
    stub.key = { status: 200, json: { data: { limit_remaining: 0 } } };
    expect(await backend.probe()).toBe('no-credit');
    expect(backend.credit()).toBe(0);
  });

  it("probe: a fetch that throws is 'unreachable', never 'key-rejected'", async () => {
    const throwing: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    const { backend } = await backendWith([], {}, { fetchImpl: throwing });
    expect(await backend.probe()).toBe('unreachable');
  });

  it('resetProbe drops the cached state', async () => {
    let key: string | null = null;
    const { backend } = await backendWith([], {}, { apiKey: () => key });
    expect(await backend.probe()).toBe('no-link');
    key = KEY;
    expect(await backend.probe()).toBe('no-link');
    backend.resetProbe();
    expect(await backend.probe()).toBe('ok');
    expect(backend.ready()).toBe(true);
  });

  it('currentModel is the chosen model and the provider', async () => {
    const { backend } = await backendWith([]);
    expect(await backend.currentModel()).toEqual({ model: 'z-ai/glm-5.2', provider: 'openrouter' });
  });
});

describe('createDirectBackend: the tool loop', () => {
  let tmpDir: string;
  let registry: SceneRegistry;
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-loop-'));
    await generateScenes(tmpDir);
    registry = (await SceneRegistry.load(tmpDir)).registry;
  });
  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const toolCall = (id: string, name: string, args: unknown) => ({
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }],
  });
  const callsThenStop = (...calls: unknown[]): StubOpenRouterStep => ({ chunks: [...calls, chunk(undefined, 'tool_calls')] });

  async function loopBackend(steps: StubOpenRouterStep[]) {
    const room = new Room(registry);
    const journal = new Journal(openDb(':memory:', { defaultPlayer: 'hicks' }));
    const made = await backendWith(steps, {}, { tools: { room, journal, player: () => 'hicks', expressions: null } });
    return { ...made, room };
  }

  it('with no tools offered (a text), a stray tool call is ignored, never run (deck M7)', async () => {
    const id = new Room(registry).state.lights[0].id;
    const stray = await loopBackend([callsThenStop(toolCall('c1', 'set_light', { light_id: id, intensity: 0 })), ok('Better.')]);
    const before = stray.room.state.lights[0].intensity;
    const frames = await turn(stray.backend, { noTools: true });
    expect(stray.room.state.lights[0].intensity).toBe(before);
    expect(stray.stub.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('runs tools in-process, then sends a second request carrying the assistant tool_calls and one tool message per call', async () => {
    const id = new Room(registry).state.lights[0].id;
    const again = await loopBackend([callsThenStop(toolCall('c1', 'set_light', { light_id: id, intensity: 0 })), ok('Better.')]);
    const frames = await turn(again.backend);
    expect(again.room.state.lights[0].intensity).toBe(0);
    const posts = again.stub.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(2);
    const second = posts[1].body.messages;
    expect(second.slice(0, 2)).toEqual(messages);
    expect(second[2]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'set_light' } }] });
    expect(second[3]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
    expect(second[3].content).toMatch(/^applied: /);
    expect(text(frames)).toBe('Better.');
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('unparseable tool arguments are echoed back as {} so strict providers accept round 2 (final review I3)', async () => {
    const bad = { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'set_light', arguments: '{"light_' } }] }, finish_reason: null }] };
    const { backend, stub } = await loopBackend([{ chunks: [bad, chunk(undefined, 'tool_calls')] }, ok('Hm.')]);
    expect(text(await turn(backend))).toBe('Hm.');
    const second = stub.requests.filter((r) => r.method === 'POST')[1].body.messages;
    expect(second[2].tool_calls[0].function.arguments).toBe('{}');
    expect(second[3].content).toMatch(/^error: /);
  });

  it('tools is sent on every request', async () => {
    const { backend, stub } = await loopBackend([callsThenStop(toolCall('c1', 'get_room', {})), ok('Done.')]);
    await turn(backend);
    for (const r of stub.requests.filter((x) => x.method === 'POST')) {
      expect(r.body.tools.map((t: { function: { name: string } }) => t.function.name)).toContain('set_light');
    }
  });

  it('a call line left at the end of a round, before a tool round, is dropped too', async () => {
    const { backend } = await loopBackend([
      { chunks: [chunk('*I reach for the switch.*\napply_preset(quiet)'), toolCall('c1', 'get_room', {}), chunk(undefined, 'tool_calls')] },
      ok('Better.'),
    ]);
    expect(text(await turn(backend))).toBe('*I reach for the switch.*\nBetter.');
  });

  it('text before and after a tool round joins with one space at a bare seam (Review Focus 2)', async () => {
    const { backend } = await loopBackend([
      { chunks: [chunk('*I dim the lamp.*'), toolCall('c1', 'get_room', {}), chunk(undefined, 'tool_calls')] },
      ok('Better.'),
    ]);
    expect(text(await turn(backend))).toBe('*I dim the lamp.* Better.');
  });

  it('she spoke, then only changed things that worked (a note, a light): the turn ends, no second round to say it all again', async () => {
    const id = new Room(registry).state.lights[0].id;
    const { backend, stub, room } = await loopBackend([
      { chunks: [chunk('*I dim the lamp.* There.'), toolCall('c1', 'set_light', { light_id: id, intensity: 0 }), chunk(undefined, 'tool_calls')] },
      ok('*I dim the lamp.* There, again.'),
    ]);
    const frames = await turn(backend);
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect(room.state.lights[0].intensity).toBe(0);
    expect(text(frames)).toBe('*I dim the lamp.* There.');
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('only an action so far (*…*), then changes that worked: one more round, so she says her line', async () => {
    const id = new Room(registry).state.lights[0].id;
    const { backend, stub } = await loopBackend([
      { chunks: [chunk('*The smile drops.*\n\n*I dim the lamp.*'), toolCall('c1', 'set_light', { light_id: id, intensity: 0 }), chunk(undefined, 'tool_calls')] },
      ok('Talk to me.'),
    ]);
    expect(text(await turn(backend))).toBe('*The smile drops.*\n\n*I dim the lamp.* Talk to me.');
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(2);
  });

  it('she spoke, then a change failed: one more round, so she can fix it or say so', async () => {
    const { backend, stub } = await loopBackend([
      { chunks: [chunk('There.'), toolCall('c1', 'set_light', { light_id: 'nope' }), chunk(undefined, 'tool_calls')] },
      ok('Hm, that one sticks.'),
    ]);
    expect(text(await turn(backend))).toBe('There. Hm, that one sticks.');
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(2);
  });

  it('she broke off ("Let me fix what I wrote down, first."), then changed things: one more round, no tools, to finish', async () => {
    const id = new Room(registry).state.lights[0].id;
    const { backend, stub } = await loopBackend([
      { chunks: [chunk('*reaches for the ledger*\n\nLet me fix what I wrote down, first.'), toolCall('c1', 'set_light', { light_id: id, intensity: 0 }), chunk(undefined, 'tool_calls')] },
      ok("There. You're Hicks, and your sister is Mira."),
    ]);
    expect(text(await turn(backend))).toBe("*reaches for the ledger*\n\nLet me fix what I wrote down, first. There. You're Hicks, and your sister is Mira.");
    const posts = stub.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1].body.tool_choice).toBe('none');
    expect(posts[1].body.messages.at(-1)).toEqual({ role: 'user', content: DIRECT_CONTINUE_NUDGE });
  });

  it('"hold on —" then a change: the finishing round may add nothing, and the reply stands', async () => {
    const id = new Room(registry).state.lights[0].id;
    const { backend } = await loopBackend([
      { chunks: [chunk('Alright, hold on —'), toolCall('c1', 'set_light', { light_id: id, intensity: 0 }), chunk(undefined, 'tool_calls')] },
      ok(''),
    ]);
    const frames = await turn(backend);
    expect(text(frames)).toBe('Alright, hold on —');
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('a later round repeating what she already said: the repeated sentences are dropped, the new ones kept', async () => {
    const { backend } = await loopBackend([
      { chunks: [chunk('Thanks for telling me straight.\n\nOne last night. One, or more than one?'), toolCall('c1', 'set_light', { light_id: 'nope' }), chunk(undefined, 'tool_calls')] },
      ok('One last night. One, or more than one?\n\n*I keep my voice even, watching your hands*'),
    ]);
    expect(text(await turn(backend))).toBe('Thanks for telling me straight.\n\nOne last night. One, or more than one? *I keep my voice even, watching your hands*');
  });

  it('a later round that rewrites her reply in other words is dropped whole', async () => {
    const first = 'Hae sets two bowls on the counter without a word, no greens in one, and goes back to the pot. She already knew the order before we sat down.';
    const { backend } = await loopBackend([
      { chunks: [chunk(first), toolCall('c1', 'set_light', { light_id: 'nope' }), chunk(undefined, 'tool_calls')] },
      ok('Without a word Hae sets two bowls on the counter, no greens in one, and goes back to the pot; she already knew the order before we sat down.'),
    ]);
    expect(text(await turn(backend))).toBe(first);
  });

  it("she spoke, then a call failed: the error says her words are already shown, so the fix-up round doesn't repeat them", async () => {
    const { backend, stub } = await loopBackend([
      { chunks: [chunk('Three weeks. That is gone.'), toolCall('c1', 'set_light', { light_id: 'nope' }), chunk(undefined, 'tool_calls')] },
      ok(''),
    ]);
    await turn(backend);
    const tool = stub.requests.filter((r) => r.method === 'POST')[1].body.messages.find((m: { role: string }) => m.role === 'tool');
    expect(tool.content).toMatch(/^error: /);
    expect(tool.content).toContain(DIRECT_ALREADY_SHOWN);
  });

  it('nothing said yet: a failed call goes back plain', async () => {
    const { backend, stub } = await loopBackend([callsThenStop(toolCall('c1', 'set_light', { light_id: 'nope' })), ok('Hm.')]);
    await turn(backend);
    const tool = stub.requests.filter((r) => r.method === 'POST')[1].body.messages.find((m: { role: string }) => m.role === 'tool');
    expect(tool.content).not.toContain(DIRECT_ALREADY_SHOWN);
  });

  it('a failed tool call goes back as an error result and the turn continues', async () => {
    const { backend, stub } = await loopBackend([callsThenStop(toolCall('c1', 'set_light', { light_id: 'nope' })), ok('Hm.')]);
    expect(text(await turn(backend))).toBe('Hm.');
    const tool = stub.requests.filter((r) => r.method === 'POST')[1].body.messages.find((m: { role: string }) => m.role === 'tool');
    expect(tool.content).toMatch(/^error: /);
  });

  it('tools, then a round with no text: one more round, nudged to speak (the silent greeting)', async () => {
    const { backend, stub } = await loopBackend([callsThenStop(toolCall('c1', 'get_room', {})), ok(), ok('*looks up* You.')]);
    const frames = await turn(backend);
    const posts = stub.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(3);
    expect(posts[2].body.messages.at(-1)).toEqual({ role: 'user', content: DIRECT_SPEAK_NUDGE });
    expect(posts[2].body.tool_choice).toBe('none');
    expect(posts[0].body.tool_choice).toBeUndefined();
    expect(text(frames)).toBe('*looks up* You.');
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('tool rounds up to the cap with nothing said: one more round, nudged to speak with no tools (the failing-note loop)', async () => {
    const round = (n: number): StubOpenRouterStep => callsThenStop(toolCall(`c${n}`, 'note', { text: '' }));
    const { backend, stub } = await loopBackend([round(1), round(2), round(3), round(4), ok('*wipes the counter* Back already.'), ok('never')]);
    const frames = await turn(backend);
    const posts = stub.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(5);
    expect(posts[4].body.messages.at(-1)).toEqual({ role: 'user', content: DIRECT_SPEAK_NUDGE });
    expect(posts[4].body.tool_choice).toBe('none');
    expect(text(frames)).toBe('*wipes the counter* Back already.');
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('nudges only once: still silent after it, the turn completes', async () => {
    const { backend, stub } = await loopBackend([callsThenStop(toolCall('c1', 'get_room', {})), ok(), ok(), ok('never')]);
    const frames = await turn(backend);
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(3);
    expect(frames.at(-1)!.event).toBe('run.completed');
  });

  it('no nudge when she already said something alongside the tools', async () => {
    const { backend, stub } = await loopBackend([{ chunks: [chunk('*I dim the lamp.*'), toolCall('c1', 'get_room', {}), chunk(undefined, 'tool_calls')] }, ok()]);
    expect(text(await turn(backend))).toBe('*I dim the lamp.*');
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(2);
  });

  it('no nudge for an empty reply with no tools', async () => {
    const { backend, stub } = await loopBackend([ok(), ok('never')]);
    await turn(backend);
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('after 4 tool rounds the turn completes with the text so far and no 5th request', async () => {
    const round = (n: number): StubOpenRouterStep => ({ chunks: [chunk(n === 1 ? 'Wait.' : undefined), toolCall(`c${n}`, 'get_room', {}), chunk(undefined, 'tool_calls')] });
    const { backend, stub } = await loopBackend([round(1), round(2), round(3), round(4), ok('never')]);
    const frames = await turn(backend);
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(4);
    expect(text(frames)).toBe('Wait.');
    expect(frames.at(-1)!.event).toBe('run.completed');
  });
});

describe('a text turn (deck spec §4)', () => {
  it('noTools sends no tools', async () => {
    const { backend, stub } = await backendWith([ok('till four')]);
    expect(text(await turn(backend, { noTools: true }))).toBe('till four');
    expect(stub.requests[0].body.tools).toBeUndefined();
    expect(stub.requests[0].body.tool_choice).toBeUndefined();
  });
});
