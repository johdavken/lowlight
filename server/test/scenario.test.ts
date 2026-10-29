import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { artNarration, completeOnce, completeOnceWithUsage, forgetThinkingRefusals, NARRATOR_SYSTEM, NarratorError, scenePrompt } from '../src/scenario';
import { registerScenarioRoutes, type ScenarioDeps } from '../src/scenario-routes';
import { startStubOpenRouter, type StubOpenRouter } from './fixtures/stub-openrouter';

let stub: StubOpenRouter | null = null;
afterEach(async () => {
  await stub?.close();
  stub = null;
  forgetThinkingRefusals();
});

const GOOD = JSON.stringify({ title: 'After closing', text: 'Rain has shut the Ribbon early.' });
const THREE = JSON.stringify([
  { title: 'After closing', text: 'Rain has shut the Ribbon early.' },
  { title: 'A fee that did not clear', text: 'A payment bounced again.' },
  { title: 'The Orchid calls', text: 'A sealed card waits downstairs.' },
]);

describe('scenePrompt', () => {
  it("gives the narrator the room's art, the lore, both public files and the time and weather — never her identity", () => {
    const identity = 'SECRET IDENTITY: she fears the dark.';
    const msgs = scenePrompt({
      room: { name: 'Lowlight Intake', art: 'A worn office with three screens.', timeOfDay: 'night', weather: 'rain' },
      lore: '[lore: what everyone in Lowlight knows. Use it when it fits; don\'t recite it]\nLowlight: A coastal sprawl.',
      you: "[who's here: Hicks — Runs the crew.]",
      her: "[who's here: Nix — Night counselor.]",
      player: 'Hicks',
      steer: null,
    });
    expect(msgs[0]).toEqual({ role: 'system', content: NARRATOR_SYSTEM });
    const all = msgs.map((m) => m.content).join('\n');
    for (const part of ['Lowlight Intake', 'A worn office with three screens.', 'night', 'rain', 'Lowlight: A coastal sprawl.', 'Runs the crew.', 'Night counselor.']) expect(all).toContain(part);
    expect(all).not.toContain(identity);
    expect(all).toContain("The other character:\n[who's here: Nix");
    expect(all).not.toContain('Her (the other character)');
    expect(all).not.toContain('wants the opening');
    expect(NARRATOR_SYSTEM).toContain('Write one opening');
    expect(NARRATOR_SYSTEM).not.toContain('three different openings');
  });
});

describe('scenePrompt steer (arrival screen spec §3)', () => {
  it('carries what the player typed', () => {
    const msgs = scenePrompt({ room: { name: 'R', art: null, timeOfDay: null, weather: null }, lore: null, you: 'Y', her: 'H', player: 'Jo', steer: 'a bounced fee' });
    expect(msgs[1]!.content).toContain('What Jo wants the opening to be: a bounced fee');
  });
});

describe('artNarration', () => {
  it("is the art prompt's first paragraph past the front matter — the room, not the painter's directions", () => {
    const md = '---\npack: ribbon\nscene: noodle-stall\n---\nStreet level on Level 4,\nlate at night.\n\nThe dark shapes in the foreground of the guide are not people: paint them as street furniture.\n';
    expect(artNarration(md)).toBe('Street level on Level 4, late at night.');
  });

  it('a narration: field in the front matter wins', () => {
    expect(artNarration('---\nnarration: A wet stall under red neon.\n---\nPaint a stall.\n')).toBe('A wet stall under red neon.');
  });

  it('nothing to say is null', () => {
    expect(artNarration('---\npack: x\n---\n\n')).toBeNull();
  });
});

describe('completeOnce', () => {
  it('gives up after its timeout with a plain reason (final review M4)', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    await expect(completeOnce({ baseUrl: 'http://x', apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 900, fetchImpl: hang, timeoutMs: 20 })).rejects.toThrow('no answer in 1 s');
  });

  it('an error status carries the status', async () => {
    stub = await startStubOpenRouter([{ status: 402, json: { error: { message: 'no credit' } } }]);
    await expect(completeOnce({ baseUrl: stub.url, apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 900 })).rejects.toMatchObject({ status: 402 });
  });

  it('completeOnceWithUsage also says how many tokens went in and out', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ message: { content: GOOD } }], usage: { prompt_tokens: 1200, completion_tokens: 80 } } }]);
    const r = await completeOnceWithUsage({ baseUrl: stub.url, apiKey: 'k', model: 'm', messages: [], temperature: 0.2, maxTokens: 600 });
    expect(r).toEqual({ text: GOOD, tokensIn: 1200, tokensOut: 80 });
  });

  it('posts one non-streaming request to her model and returns the text', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ message: { content: GOOD } }] } }]);
    const text = await completeOnce({ baseUrl: stub.url, apiKey: 'sk-test', model: 'z-ai/glm-5.2', messages: [{ role: 'user', content: 'go' }], temperature: 0.9, maxTokens: 900 });
    expect(text).toBe(GOOD);
    const req = stub.requests.at(-1)!;
    expect(req.url).toMatch(/\/chat\/completions$/);
    expect(req.body).toMatchObject({ model: 'z-ai/glm-5.2', stream: false, temperature: 0.9, max_tokens: 900 });
    expect(req.headers.authorization).toBe('Bearer sk-test');
    expect(req.body).not.toHaveProperty('reasoning');
  });

  it('on OpenRouter, asks for no thinking: GLM thought up to 1,700 tokens and ran the 900 cap out', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ message: { content: GOOD } }] } }]);
    await completeOnce({ baseUrl: stub.url, apiKey: 'k', model: 'z-ai/glm-5.2', messages: [], temperature: 0.9, maxTokens: 900, thinking: 'auto' });
    expect(stub.requests.at(-1)!.body).toMatchObject({ reasoning: { enabled: false }, max_tokens: 900 });
  });

  it('an answer cut off at max_tokens says so (final review I2)', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ finish_reason: 'length', message: { content: '[{"title":"After' } }] } }]);
    await expect(completeOnce({ baseUrl: stub.url, apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 900 })).rejects.toThrow('the answer ran past 900 tokens');
  });

  const base = () => ({ baseUrl: stub!.url, apiKey: 'sk-test', model: 'm', messages: [], temperature: 0.9, maxTokens: 900 });
  const MANDATORY = { status: 400, json: { error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled.' } } };
  const ok = { json: { choices: [{ finish_reason: 'stop', message: { content: GOOD } }] } };

  it('a model that refuses no-thinking is asked again with low thinking and room for it (spec 2026-10-14 §2)', async () => {
    stub = await startStubOpenRouter([MANDATORY, ok]);
    expect(await completeOnce({ ...base(), thinking: 'auto' })).toBe(GOOD);
    expect(stub.requests).toHaveLength(2);
    expect(stub.requests[1].body).toMatchObject({ reasoning: { effort: 'low' }, max_tokens: 3000 });
  });

  it('a cut-off with thinking in it is asked again the same way', async () => {
    stub = await startStubOpenRouter([
      { json: { choices: [{ finish_reason: 'length', message: { content: '' } }], usage: { completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 700 } } } },
      ok,
    ]);
    expect(await completeOnce({ ...base(), thinking: 'auto' })).toBe(GOOD);
    expect(stub.requests[1].body).toMatchObject({ reasoning: { effort: 'low' }, max_tokens: 3000 });
  });

  it('a cut-off whose thinking shows only as message.reasoning is asked again too', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'Let me think…' } }] } }, ok]);
    expect(await completeOnce({ ...base(), thinking: 'auto' })).toBe(GOOD);
    expect(stub.requests).toHaveLength(2);
  });

  it('a cut-off with no thinking is too-long, one call', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ finish_reason: 'length', message: { content: '[{"title":"After' } }], usage: { completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 0 } } } }, ok]);
    await expect(completeOnce({ ...base(), thinking: 'auto' })).rejects.toMatchObject({ kind: 'too-long', message: 'the answer ran past 900 tokens' });
    expect(stub.requests).toHaveLength(1);
  });

  it('a failed retry reports its own kind, no third call', async () => {
    stub = await startStubOpenRouter([MANDATORY, { status: 503, json: { error: { message: 'down' } } }, ok]);
    await expect(completeOnce({ ...base(), thinking: 'auto' })).rejects.toMatchObject({ kind: 'busy', status: 503 });
    expect(stub.requests).toHaveLength(2);
  });

  it('no retry without thinking: a mandatory 400 is refused', async () => {
    stub = await startStubOpenRouter([MANDATORY, ok]);
    await expect(completeOnce(base())).rejects.toMatchObject({ kind: 'refused', status: 400 });
    expect(stub.requests).toHaveLength(1);
  });

  it('a 400 for another reason is refused, not retried', async () => {
    stub = await startStubOpenRouter([{ status: 400, json: { error: { message: 'm is not a valid model ID' } } }, ok]);
    await expect(completeOnce({ ...base(), thinking: 'auto' })).rejects.toMatchObject({ kind: 'refused' });
    expect(stub.requests).toHaveLength(1);
  });

  it('an aborted call is not retried (Review Focus 1)', async () => {
    const ac = new AbortController();
    let calls = 0;
    const hang = ((_url: string, init: RequestInit) => {
      calls++;
      return new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)));
    }) as unknown as typeof fetch;
    const p = completeOnce({ baseUrl: 'http://x', apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 200, thinking: 'auto', fetchImpl: hang, signal: ac.signal });
    ac.abort();
    const err = await p.catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(NarratorError);
    expect((err as Error).name).toBe('AbortError');
    expect(calls).toBe(1);
  });

  it('an abort during the retry comes out raw, not as a timeout (Task 1 review)', async () => {
    const ac = new AbortController();
    let calls = 0;
    const f = ((_url: string, init: RequestInit) => {
      calls++;
      if (calls === 1) return Promise.resolve(new Response(JSON.stringify(MANDATORY.json), { status: 400 }));
      queueMicrotask(() => ac.abort());
      return new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)));
    }) as unknown as typeof fetch;
    const err = await completeOnce({ baseUrl: 'http://x', apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 200, thinking: 'auto', fetchImpl: f, signal: ac.signal }).catch((e: unknown) => e);
    expect(calls).toBe(2);
    expect(err).not.toBeInstanceOf(NarratorError);
    expect((err as Error).name).toBe('AbortError');
  });

  it('the first call asks for no thinking', async () => {
    stub = await startStubOpenRouter([MANDATORY, ok]);
    await completeOnce({ ...base(), thinking: 'auto' });
    expect(stub.requests[0].body).toMatchObject({ reasoning: { enabled: false }, max_tokens: 900 });
  });

  it('auto remembers a refusal: that model goes straight to low thinking next time, others still try none', async () => {
    stub = await startStubOpenRouter([MANDATORY, ok, ok, ok]);
    await completeOnce({ ...base(), thinking: 'auto' });
    await completeOnce({ ...base(), thinking: 'auto' });
    expect(stub.requests).toHaveLength(3);
    expect(stub.requests[2].body).toMatchObject({ reasoning: { effort: 'low' }, max_tokens: 3000 });
    await completeOnce({ ...base(), model: 'other', thinking: 'auto' });
    expect(stub.requests[3].body).toMatchObject({ reasoning: { enabled: false }, max_tokens: 900 });
  });

  it('auto remembers a model that thought past the cap too', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'Hm.' } }] } }, ok, ok]);
    await completeOnce({ ...base(), thinking: 'auto' });
    await completeOnce({ ...base(), thinking: 'auto' });
    expect(stub.requests).toHaveLength(3);
    expect(stub.requests[2].body).toMatchObject({ reasoning: { effort: 'low' } });
  });

  it('off asks for none and never retries: a model that insists is refused plainly', async () => {
    stub = await startStubOpenRouter([MANDATORY, ok]);
    await expect(completeOnce({ ...base(), thinking: 'off' })).rejects.toMatchObject({ kind: 'refused', status: 400 });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].body).toMatchObject({ reasoning: { enabled: false }, max_tokens: 900 });
  });

  it('off ignores what auto remembered', async () => {
    stub = await startStubOpenRouter([MANDATORY, ok, ok]);
    await completeOnce({ ...base(), thinking: 'auto' });
    await completeOnce({ ...base(), thinking: 'off' });
    expect(stub.requests[2].body).toMatchObject({ reasoning: { enabled: false } });
  });

  it('low and medium think from the first call, with room for it', async () => {
    stub = await startStubOpenRouter([ok, ok]);
    await completeOnce({ ...base(), thinking: 'low' });
    await completeOnce({ ...base(), thinking: 'medium' });
    expect(stub.requests).toHaveLength(2);
    expect(stub.requests[0].body).toMatchObject({ reasoning: { effort: 'low' }, max_tokens: 3000 });
    expect(stub.requests[1].body).toMatchObject({ reasoning: { effort: 'medium' }, max_tokens: 5100 });
  });

  it('medium cut off is too-long, not retried', async () => {
    stub = await startStubOpenRouter([{ json: { choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'Hm.' } }] } }, ok]);
    await expect(completeOnce({ ...base(), thinking: 'medium' })).rejects.toMatchObject({ kind: 'too-long' });
    expect(stub.requests).toHaveLength(1);
  });

  it('the key never reaches a message on the network and not-JSON paths (Task 1 review)', async () => {
    const echo = (async () => new Response('<html>Authorization: Bearer sk-secret</html>', { status: 200 })) as unknown as typeof fetch;
    const a = await completeOnce({ baseUrl: 'http://x', apiKey: 'sk-secret', model: 'm', messages: [], temperature: 0.9, maxTokens: 900, fetchImpl: echo }).catch((e: Error) => e);
    expect((a as Error).message).not.toContain('sk-secret');
    const down = (() => Promise.reject(new TypeError('bad header value: Bearer sk-secret'))) as unknown as typeof fetch;
    const b = await completeOnce({ baseUrl: 'http://x', apiKey: 'sk-secret', model: 'm', messages: [], temperature: 0.9, maxTokens: 900, fetchImpl: down }).catch((e: Error) => e);
    expect((b as Error).message).not.toContain('sk-secret');
  });

  it('kinds by status: 429 and 5xx busy, other 4xx refused, 401 and 402 keep their status', async () => {
    for (const [status, kind] of [[429, 'busy'], [500, 'busy'], [502, 'busy'], [404, 'refused'], [401, 'refused'], [402, 'refused']] as const) {
      stub = await startStubOpenRouter([{ status, json: { error: { message: 'x' } } }]);
      await expect(completeOnce(base())).rejects.toMatchObject({ kind, status });
      await stub.close();
      stub = null;
    }
  });

  it('a timeout is kind timeout', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    await expect(completeOnce({ baseUrl: 'http://x', apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 900, fetchImpl: hang, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('a network failure is busy', async () => {
    const down = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    await expect(completeOnce({ baseUrl: 'http://x', apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 900, fetchImpl: down })).rejects.toMatchObject({ kind: 'busy' });
  });

  it('a body that is not JSON is unknown', async () => {
    const odd = (async () => new Response('<html>oops</html>', { status: 200 })) as unknown as typeof fetch;
    await expect(completeOnce({ baseUrl: 'http://x', apiKey: 'k', model: 'm', messages: [], temperature: 0.9, maxTokens: 900, fetchImpl: odd })).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('throws on an error status without the key in the message', async () => {
    stub = await startStubOpenRouter([{ status: 401, json: { error: { message: 'bad key sk-test' } } }]);
    await expect(completeOnce({ baseUrl: stub.url, apiKey: 'sk-test', model: 'm', messages: [], temperature: 0.9, maxTokens: 900 })).rejects.toThrow(/401/);
    await expect(
      completeOnce({ baseUrl: stub.url, apiKey: 'sk-test', model: 'm', messages: [], temperature: 0.9, maxTokens: 900 }).catch((e: Error) => {
        throw new Error(e.message.includes('sk-test') ? 'leaked' : 'ok');
      }),
    ).rejects.toThrow('ok');
  });
});

describe('POST /api/scenario/draft', () => {
  async function app(over: Partial<ScenarioDeps> = {}) {
    const narrate = vi.fn(async () => GOOD);
    const deps: ScenarioDeps = {
      originAllowed: () => true,
      busy: () => null,
      target: (ai) => (ai === 'nix-direct' ? { kind: 'direct', ready: () => true, narrate } : null),
      promptFor: async () => [{ role: 'system', content: NARRATOR_SYSTEM }],
      ...over,
    };
    const a = Fastify();
    registerScenarioRoutes(a, deps);
    await a.ready();
    const post = (body: unknown) => a.inject({ method: 'POST', url: '/api/scenario/draft', payload: body as object });
    return { post, narrate };
  }

  it("returns one opening's text, passing the steer on", async () => {
    const promptFor = vi.fn(async () => [{ role: 'system' as const, content: NARRATOR_SYSTEM }]);
    const { post } = await app({ promptFor });
    const r = await post({ ai: 'nix-direct', steer: '  a bounced fee ' });
    expect([r.statusCode, r.json()]).toEqual([200, { text: 'Rain has shut the Ribbon early.' }]);
    expect(promptFor).toHaveBeenCalledWith('nix-direct', 'a bounced fee');
    await post({ ai: 'nix-direct' });
    expect(promptFor).toHaveBeenLastCalledWith('nix-direct', null);
  });

  it('retries a bad answer once (Review Focus 3)', async () => {
    const narrate = vi.fn().mockResolvedValueOnce(THREE).mockResolvedValueOnce(GOOD);
    const { post } = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) });
    expect((await post({ ai: 'nix-direct' })).statusCode).toBe(200);
    expect(narrate).toHaveBeenCalledTimes(2);
  });

  it('two bad answers are 502 failed', async () => {
    const narrate = vi.fn(async () => THREE);
    const { post } = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) });
    const r = await post({ ai: 'nix-direct' });
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ error: 'failed' });
    expect(narrate).toHaveBeenCalledTimes(2);
  });

  it('a model error counts as a bad answer', async () => {
    const narrate = vi.fn().mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce(GOOD);
    const { post } = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) });
    expect((await post({ ai: 'nix-direct' })).statusCode).toBe(200);
  });

  it('a rejected key or no credit is said at once, without a second paid try (final review M3)', async () => {
    const fail = (status: number) => vi.fn().mockRejectedValue(Object.assign(new Error(`HTTP ${status}: {"error":"x"}`), { status }));
    const rejected = fail(401);
    const a = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: rejected }) });
    const r = await a.post({ ai: 'nix-direct' });
    expect([r.statusCode, r.json()]).toEqual([409, { error: 'key-rejected' }]);
    expect(rejected).toHaveBeenCalledTimes(1);
    const broke = fail(402);
    const b = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: broke }) });
    const q = await b.post({ ai: 'nix-direct' });
    expect([q.statusCode, q.json()]).toEqual([409, { error: 'no-credit' }]);
    expect(broke).toHaveBeenCalledTimes(1);
  });

  it("the reason given is the last try's, not the first's", async () => {
    const narrate = vi.fn().mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce('prose, no setups');
    const { post } = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) });
    expect((await post({ ai: 'nix-direct' })).json()).toEqual({ error: 'failed', kind: 'bad-answer', why: 'the answer was not one opening' });
  });

  it('the 502 says which kind of failure (spec 2026-10-14 §3); the why is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timeout = vi.fn().mockRejectedValue(new NarratorError('timeout', 'no answer in 45 s'));
    const a = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: timeout }) });
    expect((await a.post({ ai: 'nix-direct' })).json()).toEqual({ error: 'failed', kind: 'timeout', why: 'no answer in 45 s' });
    const odd = vi.fn().mockRejectedValue(new Error('odd'));
    const b = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: odd }) });
    expect((await b.post({ ai: 'nix-direct' })).json()).toEqual({ error: 'failed', kind: 'unknown', why: 'odd' });
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[narrator]') && String(c[0]).includes('no answer in 45 s'))).toBe(true);
    warn.mockRestore();
  });

  it('409 no-link, 409 busy, 400 bad-request', async () => {
    const { post } = await app();
    expect((await post({ ai: 'ghost' })).statusCode).toBe(400);
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ ai: 'nix-direct', steer: 5 })).statusCode).toBe(400);
    const noKey = await app({ target: () => ({ kind: 'direct', ready: () => false, narrate: vi.fn() }) });
    const r = await noKey.post({ ai: 'nix-direct' });
    expect([r.statusCode, r.json()]).toEqual([409, { error: 'no-link' }]);
    const busy = await app({ busy: () => 'cass' });
    const b = await busy.post({ ai: 'nix-direct' });
    expect([b.statusCode, b.json()]).toEqual([409, { error: 'busy', contact: 'cass' }]);
  });
});
