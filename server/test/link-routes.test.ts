import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { combinedState, registerLinkRoutes } from '../src/link-routes';
import { createAnthropicCatalog, createModelCatalog, createNanoGptCatalog, createRoutedCatalog } from '../src/model-catalog';
import { startStubAnthropic, type StubAnthropic } from './fixtures/stub-anthropic';
import { PLAN_OFF, startStubNanoGpt, type StubNanoGpt } from './fixtures/stub-nanogpt';
import { openSettings, type Settings } from '../src/settings';
import { startStubOpenRouter, type StubOpenRouter } from './fixtures/stub-openrouter';
import { tempDir } from './fixtures/temp-dir';

let stub: StubOpenRouter | null = null;
let an: StubAnthropic | null = null;
let nano: StubNanoGpt | null = null;
afterEach(async () => {
  await stub?.close();
  await an?.close();
  await nano?.close();
  stub = null;
  an = null;
  nano = null;
});
const GOOD_ANT = 'sk-ant-api03-good-key-wxyz';
const GOOD_NANO = 'sk-nano-good-key-n4n0';

const MODELS = {
  data: [
    { id: 'z-ai/glm-5.2', name: 'Z.ai: GLM 5.2', pricing: { prompt: '0.0000004', completion: '0.0000016' } },
    { id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', pricing: { prompt: '0.000002', completion: '0.00001' } },
    { id: 'qwen/qwen-4-235b', name: 'Qwen: Qwen 4 235B' },
    { id: 'qwen/qwen-4-32b', name: 'Qwen: Qwen 4 32B' },
    { id: 'x/recent-one', name: 'X: Recent One' },
    ...Array.from({ length: 40 }, (_, i) => ({ id: `bulk/model-${i}`, name: `Bulk: Model ${i}` })),
  ],
};

async function start(opts: { key?: string | null; anthropicKey?: string; nanoKey?: string; fetchImpl?: typeof fetch; settings?: Settings } = {}) {
  stub = await startStubOpenRouter([]);
  an = await startStubAnthropic({ keys: [GOOD_ANT] });
  nano = await startStubNanoGpt({ keys: [GOOD_NANO] });
  stub.models = { status: 200, json: MODELS };
  const settings = opts.settings ?? openSettings(tempDir('nix-link-'));
  if (opts.key) settings.setKey('openrouter', opts.key);
  if (opts.anthropicKey) settings.setKey('anthropic', opts.anthropicKey);
  if (opts.nanoKey) settings.setKey('nanogpt', opts.nanoKey);
  const resets: string[] = [];
  const runtimes = [{ id: 'a', resetProbe: async () => void resets.push('a') }, { id: 'b', resetProbe: async () => void resets.push('b') }];
  const app = Fastify();
  const nanoCatalog = createNanoGptCatalog({ host: nano.url });
  const catalog = createRoutedCatalog({
    openrouter: createModelCatalog({ baseUrl: stub.url, apiKey: () => settings.key('openrouter') }),
    anthropic: createAnthropicCatalog({ apiKey: () => settings.key('anthropic'), baseUrl: an.url }),
    nanogpt: nanoCatalog,
    keys: () => ({ openrouter: settings.key('openrouter'), anthropic: settings.key('anthropic'), nanogpt: settings.key('nanogpt') }),
  });
  registerLinkRoutes(app, {
    settings,
    baseUrl: stub.url,
    anthropicBaseUrl: an.url,
    nanogptHost: nano.url,
    nanogpt: nanoCatalog,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    catalog,
    runtimes: () => runtimes as never,
    originAllowed: (o) => o === undefined || o === 'http://localhost:5173',
  });
  await app.ready();
  return { app, settings, resets, stub: stub!, an: an!, nano: nano!, nanoCatalog };
}

const put = (app: Awaited<ReturnType<typeof start>>['app'], body: unknown, origin?: string) =>
  app.inject({ method: 'PUT', url: '/api/link/openrouter', payload: body as object, headers: origin ? { origin } : {} });

describe('/api/link', () => {
  it('GET with no key → no-link', async () => {
    const { app } = await start();
    const res = await app.inject({ method: 'GET', url: '/api/link' });
    expect(res.json()).toEqual({ state: 'no-link', openrouter: { linked: false, last4: null, credit: null, state: 'no-link' }, anthropic: { linked: false, last4: null, credit: null, state: 'no-link' }, nanogpt: { linked: false, last4: null, credit: null, state: 'no-link' } });
  });

  it('PUT a good key saves it and returns last4 and credit, never the key', async () => {
    const { app, settings } = await start();
    const res = await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ linked: true, last4: '3f9a', credit: 4.12, state: 'ok' });
    expect(res.body).not.toContain('sk-or-v1-abcdef3f9a');
    expect(settings.key('openrouter')).toBe('sk-or-v1-abcdef3f9a');
  });

  it('PUT checks the candidate key, not the stored one', async () => {
    const { app, stub } = await start({ key: 'sk-or-old-00000000' });
    await put(app, { apiKey: 'sk-or-new-11111111' });
    expect(stub.requests.find((r) => r.url.endsWith('/key'))!.headers.authorization).toBe('Bearer sk-or-new-11111111');
  });

  it('PUT trims whitespace', async () => {
    const { app, settings } = await start();
    const res = await put(app, { apiKey: '  sk-or-ok3f9a\n' });
    expect(res.statusCode).toBe(200);
    expect(settings.key('openrouter')).toBe('sk-or-ok3f9a');
  });

  it('PUT a rejected key writes nothing', async () => {
    const { app, settings, stub } = await start({ key: 'sk-or-previous' });
    stub.key = { status: 401, json: {} };
    const res = await put(app, { apiKey: 'sk-or-bad-key-123' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'key-rejected' });
    expect(settings.key('openrouter')).toBe('sk-or-previous');
  });

  it('PUT while OpenRouter is down → 502 unreachable, nothing written', async () => {
    const { app, settings } = await start({ fetchImpl: () => Promise.reject(new TypeError('fetch failed')) });
    const res = await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'unreachable' });
    expect(settings.key('openrouter')).toBeNull();
  });

  it('PUT a 5xx from /key → 502 unreachable', async () => {
    const { app, stub } = await start();
    stub.key = { status: 503, json: {} };
    expect((await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' })).statusCode).toBe(502);
  });

  it('PUT a zero-credit key links with state no-credit', async () => {
    const { app, settings, stub } = await start();
    stub.key = { status: 200, json: { data: { limit_remaining: 0 } } };
    const res = await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' });
    expect(res.json()).toEqual({ linked: true, last4: '3f9a', credit: 0, state: 'no-credit' });
    expect(settings.key('openrouter')).toBe('sk-or-v1-abcdef3f9a');
  });

  it('PUT where /key is missing (404) saves with credit null', async () => {
    const { app, stub } = await start();
    stub.key = { status: 404, json: {} };
    expect((await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' })).json()).toEqual({ linked: true, last4: '3f9a', credit: null, state: 'ok' });
  });

  it.each([['too short', { apiKey: 'short' }], ['too long', { apiKey: 'k'.repeat(301) }], ['not a string', { apiKey: 42 }], ['missing', {}]])(
    'PUT %s → 400 bad-key',
    async (_label, body) => {
      const { app } = await start();
      const res = await put(app, body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'bad-key' });
    },
  );

  it('PUT and DELETE from a foreign Origin → 403 origin', async () => {
    const { app, settings } = await start({ key: 'sk-or-keep-me-1' });
    expect((await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' }, 'https://evil.example')).statusCode).toBe(403);
    const del = await app.inject({ method: 'DELETE', url: '/api/link/openrouter', headers: { origin: 'https://evil.example' } });
    expect(del.statusCode).toBe(403);
    expect(del.json()).toEqual({ error: 'origin' });
    expect(settings.key('openrouter')).toBe('sk-or-keep-me-1');
  });

  it('PUT and DELETE reset every runtime’s probe', async () => {
    const { app, resets } = await start();
    await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' });
    expect(resets).toEqual(['a', 'b']);
    await app.inject({ method: 'DELETE', url: '/api/link/openrouter' });
    expect(resets).toEqual(['a', 'b', 'a', 'b']);
  });

  it('PUT and DELETE answer without waiting on the runtimes’ health checks', async () => {
    const { app } = await start();
    const slow = { id: 'slow', resetProbe: () => new Promise<void>(() => {}) };
    const app2 = Fastify();
    registerLinkRoutes(app2, {
      settings: openSettings(tempDir('nix-link-')),
      baseUrl: stub!.url,
      catalog: createModelCatalog({ baseUrl: stub!.url, apiKey: () => null }),
      runtimes: () => [slow] as never,
      originAllowed: () => true,
    });
    await app2.ready();
    const res = await Promise.race([put(app2, { apiKey: 'sk-or-v1-abcdef3f9a' }), new Promise<'hung'>((r) => setTimeout(() => r('hung'), 1000))]);
    expect(res).not.toBe('hung');
    const del = await Promise.race([app2.inject({ method: 'DELETE', url: '/api/link/openrouter' }), new Promise<'hung'>((r) => setTimeout(() => r('hung'), 1000))]);
    expect(del).not.toBe('hung');
    void app;
  });

  it('DELETE removes the key → GET says no-link', async () => {
    const { app, settings } = await start({ key: 'sk-or-v1-abcdef3f9a' });
    const del = await app.inject({ method: 'DELETE', url: '/api/link/openrouter' });
    expect(del.statusCode).toBe(204);
    expect(settings.key('openrouter')).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/link' })).json().openrouter).toMatchObject({ linked: false, state: 'no-link' });
  });

  it('GET with a key reports last4, credit and state', async () => {
    const { app } = await start({ key: 'sk-or-v1-abcdef3f9a' });
    const res = await app.inject({ method: 'GET', url: '/api/link' });
    expect(res.json().openrouter).toEqual({ linked: true, last4: '3f9a', credit: 4.12, state: 'ok' });
    expect(res.body).not.toContain('abcdef');
  });

  it('GET with a revoked key says key-rejected, and keeps the key', async () => {
    const { app, settings, stub } = await start({ key: 'sk-or-v1-abcdef3f9a' });
    stub.key = { status: 401, json: {} };
    expect((await app.inject({ method: 'GET', url: '/api/link' })).json().openrouter).toMatchObject({ linked: true, state: 'key-rejected' });
    expect(settings.key('openrouter')).toBe('sk-or-v1-abcdef3f9a');
  });
});

describe('/api/link/anthropic', () => {
  const putAnt = (app: Awaited<ReturnType<typeof start>>['app'], apiKey: string, origin?: string) =>
    app.inject({ method: 'PUT', url: '/api/link/anthropic', payload: { apiKey }, headers: origin ? { origin } : {} });

  it('PUT a good key saves it; last4, no credit figure; GET shows it beside OpenRouter', async () => {
    const { app, settings } = await start();
    const res = await putAnt(app, GOOD_ANT);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ linked: true, last4: 'wxyz', credit: null, state: 'ok' });
    expect(settings.key('anthropic')).toBe(GOOD_ANT);
    expect(settings.key('openrouter')).toBeNull();
    const all = (await app.inject({ method: 'GET', url: '/api/link' })).json();
    expect(all.state).toBe('ok');
    expect(all.anthropic).toMatchObject({ linked: true, last4: 'wxyz', state: 'ok' });
    expect(all.openrouter).toMatchObject({ linked: false, state: 'no-link' });
    expect(JSON.stringify(all)).not.toContain('good-key');
  });

  it('PUT a rejected key → 400 key-rejected, nothing written', async () => {
    const { app, settings } = await start();
    const res = await putAnt(app, 'sk-ant-api03-wrong-0000');
    expect([res.statusCode, res.json().error]).toEqual([400, 'key-rejected']);
    expect(settings.key('anthropic')).toBeNull();
  });

  it('DELETE removes only that key', async () => {
    const { app, settings } = await start({ key: 'sk-or-v1-abcdef3f9a', anthropicKey: GOOD_ANT });
    expect((await app.inject({ method: 'DELETE', url: '/api/link/anthropic' })).statusCode).toBe(204);
    expect(settings.key('anthropic')).toBeNull();
    expect(settings.key('openrouter')).toBe('sk-or-v1-abcdef3f9a');
  });

  it('an unknown provider → 404; the old unprefixed PUT is gone', async () => {
    const { app } = await start();
    expect((await app.inject({ method: 'PUT', url: '/api/link/bogus', payload: { apiKey: GOOD_ANT } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/link', payload: { apiKey: GOOD_ANT } })).statusCode).toBe(404);
  });

  it('a foreign Origin → 403', async () => {
    const { app, settings } = await start();
    expect((await putAnt(app, GOOD_ANT, 'https://evil.example')).statusCode).toBe(403);
    expect(settings.key('anthropic')).toBeNull();
  });

  it('the combined state: ok when either is ok', async () => {
    const { app, stub } = await start({ key: 'sk-or-v1-abcdef3f9a', anthropicKey: GOOD_ANT });
    stub.key = { status: 401, json: {} };
    const all = (await app.inject({ method: 'GET', url: '/api/link' })).json();
    expect([all.openrouter.state, all.anthropic.state, all.state]).toEqual(['key-rejected', 'ok', 'ok']);
  });
});

describe('/api/models with an Anthropic key', () => {
  it('only that key: only Claude picks, from Anthropic\'s list, marked via anthropic', async () => {
    const { app } = await start({ anthropicKey: GOOD_ANT });
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string; via?: string; label: string }[] };
    expect(body.picks.map((p) => [p.id, p.via])).toEqual([['anthropic/claude-sonnet-5.5', 'anthropic']]);
    expect(body.picks[0]!.label).toBe('Claude Sonnet 5.5');
  });

  it('both keys: the OpenRouter list, with the Claude pick marked via anthropic', async () => {
    const { app } = await start({ key: 'sk-or-k-123456', anthropicKey: GOOD_ANT });
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string; via?: string }[] };
    expect(body.picks.map((p) => [p.id, p.via])).toEqual([['z-ai/glm-5.2', undefined], ['anthropic/claude-sonnet-5.5', 'anthropic']]);
  });
});

describe('/api/models: which results go through the Anthropic key', () => {
  it("a plain Claude id is marked via anthropic; OpenRouter's :batch variant is not", async () => {
    const { app, stub } = await start({ key: 'sk-or-k-123456', anthropicKey: GOOD_ANT });
    stub.models = { status: 200, json: { data: [...MODELS.data, { id: 'anthropic/claude-sonnet-5.5:batch', name: 'Anthropic: Claude Sonnet 5.5 (batch)' }] } };
    const body = (await app.inject({ method: 'GET', url: '/api/models?q=sonnet' })).json() as { results: { id: string; via?: string }[] };
    expect(body.results.map((r) => [r.id, r.via])).toEqual([['anthropic/claude-sonnet-5.5', 'anthropic'], ['anthropic/claude-sonnet-5.5:batch', undefined]]);
  });
});

describe('/api/models', () => {
  it('no q → picks with why, recent, results []', async () => {
    const { app, settings } = await start({ key: 'sk-or-k-123456' });
    settings.pushRecent('x/recent-one');
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string; why?: string; priceIn: number | null }[]; recent: { id: string }[]; results: unknown[] };
    expect(body.picks.map((p) => p.id)).toEqual(['z-ai/glm-5.2', 'anthropic/claude-sonnet-5.5']);
    expect(body.picks[0]!.why).toBeTruthy();
    expect(body.picks[0]!.priceIn).toBe(0.4);
    expect(body.recent.map((r) => r.id)).toEqual(['x/recent-one']);
    expect(body.results).toEqual([]);
  });

  it('all=1 → every listed model, Claude marked via anthropic; absent without it', async () => {
    const { app } = await start({ key: 'sk-or-k-123456', anthropicKey: GOOD_ANT });
    const body = (await app.inject({ method: 'GET', url: '/api/models?all=1' })).json() as { all: { id: string; via?: string }[] };
    expect(body.all.length).toBeGreaterThan(30);
    expect(body.all.find((m) => m.id === 'anthropic/claude-sonnet-5.5')?.via).toBe('anthropic');
    expect((await app.inject({ method: 'GET', url: '/api/models' })).json()).not.toHaveProperty('all');
  });

  it('all=1 with the catalog down → null, the picks still there', async () => {
    const { app, stub } = await start({ key: 'sk-or-k-123456' });
    stub.models = { status: 500, json: {} };
    const body = (await app.inject({ method: 'GET', url: '/api/models?all=1' })).json() as { all: null; picks: unknown[] };
    expect(body.all).toBeNull();
    expect(body.picks.length).toBeGreaterThan(0);
  });

  it("a recent model the list no longer has isn't offered", async () => {
    const { app, settings } = await start({ key: 'sk-or-k-123456' });
    settings.pushRecent('x/recent-one');
    settings.pushRecent('gone/old-model');
    const recent = async () => ((await app.inject({ method: 'GET', url: '/api/models' })).json() as { recent: { id: string }[] }).recent.map((r) => r.id);
    expect(await recent()).toEqual(['x/recent-one']);
  });

  it('picks missing from the catalog are hidden', async () => {
    const { app } = await start();
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string }[] };
    expect(body.picks.map((p) => p.id)).not.toContain('deepseek/deepseek-v4-pro-0813');
  });

  it("q 'qwe' → results matching id or name", async () => {
    const { app } = await start();
    const body = (await app.inject({ method: 'GET', url: '/api/models?q=QWE' })).json() as { results: { id: string }[] };
    expect(body.results.map((r) => r.id)).toEqual(['qwen/qwen-4-235b', 'qwen/qwen-4-32b']);
  });

  it('results are capped at 30', async () => {
    const { app } = await start();
    const body = (await app.inject({ method: 'GET', url: '/api/models?q=bulk' })).json() as { results: unknown[] };
    expect(body.results).toHaveLength(30);
  });

  it('q of 1 char → results []', async () => {
    const { app } = await start();
    const body = (await app.inject({ method: 'GET', url: '/api/models?q=q' })).json() as { results: unknown[] };
    expect(body.results).toEqual([]);
  });

  it('with the catalog down, picks still show (labels from their ids)', async () => {
    const { app, stub } = await start();
    stub.models = { status: 500, json: {} };
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string }[] };
    expect(body.picks.map((p) => p.id)).toEqual(['z-ai/glm-5.2', 'deepseek/deepseek-v4-pro-0813', 'anthropic/claude-sonnet-5.5']);
  });
});

describe('/api/reply-prefs', () => {
  const put = (app: Awaited<ReturnType<typeof start>>['app'], body: unknown, origin?: string) =>
    app.inject({ method: 'PUT', url: '/api/reply-prefs', payload: body as object, headers: origin ? { origin } : {} });

  it('GET is normal and auto until set; a PUT may carry either and answers with both', async () => {
    const { app, settings } = await start();
    expect((await app.inject({ method: 'GET', url: '/api/reply-prefs' })).json()).toEqual({ length: 'normal', thinking: 'auto' });
    expect((await put(app, { length: 'long' })).json()).toEqual({ length: 'long', thinking: 'auto' });
    expect((await put(app, { thinking: 'low' })).json()).toEqual({ length: 'long', thinking: 'low' });
    expect(settings.replyLength()).toBe('long');
    expect(settings.chatThinking()).toBe('low');
  });

  it.each([{ length: 'epic' }, { thinking: 'high' }, { length: 'short', thinking: 'off' }, {}, null])('PUT %j → 400, nothing written', async (body) => {
    const { app, settings } = await start();
    const res = await put(app, body);
    expect(res.statusCode).toBe(400);
    expect(settings.replyLength()).toBe('normal');
    expect(settings.chatThinking()).toBe('auto');
  });

  it('PUT from a foreign Origin → 403', async () => {
    const { app } = await start();
    expect((await put(app, { length: 'short' }, 'https://evil.example')).statusCode).toBe(403);
  });
});

describe('/api/world-moves (off-screen moves spec §6)', () => {
  const put = (app: Awaited<ReturnType<typeof start>>['app'], body: unknown) => app.inject({ method: 'PUT', url: '/api/world-moves', payload: body as object });

  it('GET is on until switched off; PUT saves it', async () => {
    const { app, settings } = await start();
    expect((await app.inject({ method: 'GET', url: '/api/world-moves' })).json()).toEqual({ on: true });
    expect((await put(app, { on: false })).json()).toEqual({ on: false });
    expect(settings.worldMoves()).toBe(false);
  });

  it.each([{ on: 'no' }, {}, null])('PUT %j → 400, nothing written', async (body) => {
    const { app, settings } = await start();
    const res = await put(app, body);
    expect(res.statusCode).toBe(400);
    expect(settings.worldMoves()).toBe(true);
  });
});

describe('/api/narrator-thinking', () => {
  const putThinking = (app: Awaited<ReturnType<typeof start>>['app'], body: unknown, origin?: string) =>
    app.inject({ method: 'PUT', url: '/api/narrator-thinking', payload: body as object, headers: origin ? { origin } : {} });

  it('GET is auto until set', async () => {
    const { app } = await start();
    expect((await app.inject({ method: 'GET', url: '/api/narrator-thinking' })).json()).toEqual({ thinking: 'auto' });
  });

  it('PUT saves it to settings.json; auto takes the field back out', async () => {
    const { app, settings } = await start();
    expect((await putThinking(app, { thinking: 'medium' })).json()).toEqual({ thinking: 'medium' });
    expect(settings.narratorThinking()).toBe('medium');
    expect((await app.inject({ method: 'GET', url: '/api/narrator-thinking' })).json()).toEqual({ thinking: 'medium' });
    await putThinking(app, { thinking: 'auto' });
    expect(settings.narratorThinking()).toBe('auto');
  });

  it.each([{ thinking: 'high' }, { thinking: 2 }, {}, null])('PUT %j → 400, nothing written', async (body) => {
    const { app, settings } = await start();
    const res = await putThinking(app, body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad-thinking' });
    expect(settings.narratorThinking()).toBe('auto');
  });

  it('PUT from a foreign Origin → 403', async () => {
    const { app, settings } = await start();
    expect((await putThinking(app, { thinking: 'low' }, 'https://evil.example')).statusCode).toBe(403);
    expect(settings.narratorThinking()).toBe('auto');
  });
});

describe('/api/link/nanogpt', () => {
  const putNano = (app: Awaited<ReturnType<typeof start>>['app'], apiKey: string) => app.inject({ method: 'PUT', url: '/api/link/nanogpt', payload: { apiKey } });

  it('PUT a good key with a plan: saved; the plan and the balance come back; GET shows it beside the others', async () => {
    const { app, settings } = await start();
    const res = await putNano(app, GOOD_NANO);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ linked: true, last4: 'n4n0', credit: 3.1, state: 'ok', plan: { active: true, weekLeft: 0.75 } });
    expect(settings.key('nanogpt')).toBe(GOOD_NANO);
    const all = (await app.inject({ method: 'GET', url: '/api/link' })).json();
    expect(all.state).toBe('ok');
    expect(all.nanogpt).toMatchObject({ linked: true, last4: 'n4n0', state: 'ok' });
    expect([all.openrouter.state, all.anthropic.state]).toEqual(['no-link', 'no-link']);
    expect(JSON.stringify(all)).not.toContain('good-key');
  });

  it('no plan and a spent balance: linked, but no-credit', async () => {
    const { app, nano } = await start();
    nano.usage = PLAN_OFF;
    nano.balance = 0;
    const res = await putNano(app, GOOD_NANO);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ state: 'no-credit', credit: 0, plan: { active: false } });
  });

  it('no plan but money on it: ok', async () => {
    const { app, nano } = await start();
    nano.usage = PLAN_OFF;
    expect((await putNano(app, GOOD_NANO)).json()).toMatchObject({ state: 'ok', credit: 3.1 });
  });

  it("a key the plan call won't answer (no plan): its balance decides", async () => {
    const { app, nano } = await start();
    nano.usageStatus = 403;
    expect((await putNano(app, GOOD_NANO)).json()).toMatchObject({ state: 'ok', credit: 3.1 });
    expect((await putNano(app, 'sk-nano-wrong-key-0000')).json().error).toBe('key-rejected');
  });

  it('a relink starts the plan afresh after its allowance ran out', async () => {
    const { app, nanoCatalog } = await start();
    nanoCatalog.markSpent(3600);
    await putNano(app, GOOD_NANO);
    expect(nanoCatalog.spent()).toBe(false);
  });

  it('PUT a rejected key → 400 key-rejected, nothing written', async () => {
    const { app, settings } = await start();
    const res = await putNano(app, 'sk-nano-wrong-key-0000');
    expect([res.statusCode, res.json().error]).toEqual([400, 'key-rejected']);
    expect(settings.key('nanogpt')).toBeNull();
  });

  it('linking loads the plan list, so the next turn routes on it', async () => {
    const { app, nano, nanoCatalog } = await start();
    expect(nanoCatalog.included('z-ai/glm-5.2')).toBe(false);
    await putNano(app, GOOD_NANO);
    await vi.waitFor(() => expect(nanoCatalog.included('z-ai/glm-5.2')).toBe(true));
    expect(nanoCatalog.included('anthropic/claude-sonnet-5.5')).toBe(false);
    expect(nano.requests.some((r) => r.url.startsWith('/api/v1/models'))).toBe(true);
  });

  it('DELETE removes only that key', async () => {
    const { app, settings } = await start({ key: 'sk-or-v1-abcdef3f9a', nanoKey: GOOD_NANO });
    expect((await app.inject({ method: 'DELETE', url: '/api/link/nanogpt' })).statusCode).toBe(204);
    expect(settings.key('nanogpt')).toBeNull();
    expect(settings.key('openrouter')).toBe('sk-or-v1-abcdef3f9a');
  });

  it('the combined state over three: ok when any is ok, else the first linked one', async () => {
    const { app, stub, nano } = await start({ key: 'sk-or-v1-abcdef3f9a', nanoKey: GOOD_NANO });
    stub.key = { status: 401, json: {} };
    let all = (await app.inject({ method: 'GET', url: '/api/link' })).json();
    expect([all.openrouter.state, all.nanogpt.state, all.state]).toEqual(['key-rejected', 'ok', 'ok']);
    expect(combinedState({ linked: false, last4: null, credit: null, state: 'no-link' }, { linked: true, last4: 'x', credit: 0, state: 'no-credit' }, { linked: true, last4: 'y', credit: null, state: 'key-rejected' })).toBe('no-credit');
    void nano;
  });
});

describe('/api/models with a NanoGPT key', () => {
  it("only that key: NanoGPT's list, every pick it has marked via nanogpt", async () => {
    const { app } = await start({ nanoKey: GOOD_NANO });
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string; via?: string }[] };
    expect(body.picks.map((p) => [p.id, p.via])).toEqual([
      ['z-ai/glm-5.2', 'nanogpt'],
      ['deepseek/deepseek-v4-pro-0813', 'nanogpt'],
      ['anthropic/claude-sonnet-5.5', 'nanogpt'],
    ]);
  });

  it('with OpenRouter too: the plan models go via nanogpt once its list is in; Claude stays on OpenRouter', async () => {
    const { app, nanoCatalog } = await start({ key: 'sk-or-k-123456', nanoKey: GOOD_NANO });
    await nanoCatalog.list();
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string; via?: string }[] };
    expect(body.picks.map((p) => [p.id, p.via])).toEqual([['z-ai/glm-5.2', 'nanogpt'], ['anthropic/claude-sonnet-5.5', undefined]]);
  });

  it('all three keys: Claude via anthropic, GLM via nanogpt', async () => {
    const { app, nanoCatalog } = await start({ key: 'sk-or-k-123456', anthropicKey: GOOD_ANT, nanoKey: GOOD_NANO });
    await nanoCatalog.list();
    const body = (await app.inject({ method: 'GET', url: '/api/models' })).json() as { picks: { id: string; via?: string }[] };
    expect(body.picks.map((p) => [p.id, p.via])).toEqual([['z-ai/glm-5.2', 'nanogpt'], ['anthropic/claude-sonnet-5.5', 'anthropic']]);
  });
});
