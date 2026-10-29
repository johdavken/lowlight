import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerLinkRoutes } from '../src/link-routes';
import { createModelCatalog } from '../src/model-catalog';
import { openSettings, type Settings } from '../src/settings';
import { startStubOpenRouter, type StubOpenRouter } from './fixtures/stub-openrouter';
import { tempDir } from './fixtures/temp-dir';

let stub: StubOpenRouter | null = null;
afterEach(async () => {
  await stub?.close();
  stub = null;
});

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

async function start(opts: { key?: string | null; fetchImpl?: typeof fetch; settings?: Settings } = {}) {
  stub = await startStubOpenRouter([]);
  stub.models = { status: 200, json: MODELS };
  const settings = opts.settings ?? openSettings(tempDir('nix-link-'));
  if (opts.key) settings.setKey('openrouter', opts.key);
  const resets: string[] = [];
  const runtimes = [{ id: 'a', resetProbe: async () => void resets.push('a') }, { id: 'b', resetProbe: async () => void resets.push('b') }];
  const app = Fastify();
  const catalog = createModelCatalog({ baseUrl: stub.url, apiKey: () => settings.key('openrouter') });
  registerLinkRoutes(app, {
    settings,
    baseUrl: stub.url,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    catalog,
    runtimes: () => runtimes as never,
    originAllowed: (o) => o === undefined || o === 'http://localhost:5173',
  });
  await app.ready();
  return { app, settings, resets, stub: stub! };
}

const put = (app: Awaited<ReturnType<typeof start>>['app'], body: unknown, origin?: string) =>
  app.inject({ method: 'PUT', url: '/api/link', payload: body as object, headers: origin ? { origin } : {} });

describe('/api/link', () => {
  it('GET with no key → no-link', async () => {
    const { app } = await start();
    const res = await app.inject({ method: 'GET', url: '/api/link' });
    expect(res.json()).toEqual({ linked: false, last4: null, credit: null, state: 'no-link' });
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
    const del = await app.inject({ method: 'DELETE', url: '/api/link', headers: { origin: 'https://evil.example' } });
    expect(del.statusCode).toBe(403);
    expect(del.json()).toEqual({ error: 'origin' });
    expect(settings.key('openrouter')).toBe('sk-or-keep-me-1');
  });

  it('PUT and DELETE reset every runtime’s probe', async () => {
    const { app, resets } = await start();
    await put(app, { apiKey: 'sk-or-v1-abcdef3f9a' });
    expect(resets).toEqual(['a', 'b']);
    await app.inject({ method: 'DELETE', url: '/api/link' });
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
    const del = await Promise.race([app2.inject({ method: 'DELETE', url: '/api/link' }), new Promise<'hung'>((r) => setTimeout(() => r('hung'), 1000))]);
    expect(del).not.toBe('hung');
    void app;
  });

  it('DELETE removes the key → GET says no-link', async () => {
    const { app, settings } = await start({ key: 'sk-or-v1-abcdef3f9a' });
    const del = await app.inject({ method: 'DELETE', url: '/api/link' });
    expect(del.statusCode).toBe(204);
    expect(settings.key('openrouter')).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/link' })).json()).toMatchObject({ linked: false, state: 'no-link' });
  });

  it('GET with a key reports last4, credit and state', async () => {
    const { app } = await start({ key: 'sk-or-v1-abcdef3f9a' });
    const res = await app.inject({ method: 'GET', url: '/api/link' });
    expect(res.json()).toEqual({ linked: true, last4: '3f9a', credit: 4.12, state: 'ok' });
    expect(res.body).not.toContain('abcdef');
  });

  it('GET with a revoked key says key-rejected, and keeps the key', async () => {
    const { app, settings, stub } = await start({ key: 'sk-or-v1-abcdef3f9a' });
    stub.key = { status: 401, json: {} };
    expect((await app.inject({ method: 'GET', url: '/api/link' })).json()).toMatchObject({ linked: true, state: 'key-rejected' });
    expect(settings.key('openrouter')).toBe('sk-or-v1-abcdef3f9a');
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
