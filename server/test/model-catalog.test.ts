import { afterEach, describe, expect, it } from 'vitest';
import { createModelCatalog, createModelPicker } from '../src/model-catalog';
import { startStubOpenRouter, type StubOpenRouter } from './fixtures/stub-openrouter';

let stub: StubOpenRouter | null = null;
afterEach(async () => {
  await stub?.close();
  stub = null;
});

const LIST = {
  data: [
    { id: 'z-ai/glm-5.2', name: 'Z.AI: GLM 5.2', pricing: { prompt: '0.0000004', completion: '0.0000016' } },
    { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek: DeepSeek V3.2', pricing: { prompt: '0.00000025', completion: '0.00000038' } },
  ],
};

async function catalogWith(json: unknown = LIST, status = 200, now = () => 0) {
  stub = await startStubOpenRouter([]);
  stub.models = { status, json };
  return createModelCatalog({ baseUrl: stub.url, apiKey: () => 'sk-or-cat', now });
}

describe('createModelCatalog', () => {
  it('labels strip the provider prefix and prices are per million tokens', async () => {
    const c = await catalogWith();
    const glm = await c.get('z-ai/glm-5.2');
    expect(glm).toEqual({ id: 'z-ai/glm-5.2', label: 'GLM 5.2', priceIn: 0.4, priceOut: 1.6 });
    expect(c.labelFor('z-ai/glm-5.2')).toBe('GLM 5.2');
    expect(c.labelFor('unknown/thing')).toBe('thing');
  });

  it('is cached for an hour', async () => {
    let t = 0;
    const c = await catalogWith(LIST, 200, () => t);
    await c.list();
    await c.list();
    expect(stub!.requests.filter((r) => r.url.endsWith('/models'))).toHaveLength(1);
    t = 3_600_001;
    await c.list();
    expect(stub!.requests.filter((r) => r.url.endsWith('/models'))).toHaveLength(2);
  });

  it('get of an unknown id is null', async () => {
    expect(await (await catalogWith()).get('nope/nope')).toBeNull();
  });

  it('a failed fetch returns null (no throw)', async () => {
    const c = await catalogWith({}, 500);
    expect(await c.list()).toBeNull();
    expect(await c.get('z-ai/glm-5.2')).toBeNull();
  });
});

describe('createModelCatalog under a slow or busy OpenRouter (final review I1, I2)', () => {
  const hanging: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError'))));

  it('a fetch that never answers gives up after the timeout: list() is null', async () => {
    const c = createModelCatalog({ baseUrl: 'http://x', apiKey: () => 'k', fetchImpl: hanging, timeoutMs: 30 });
    expect(await c.list()).toBeNull();
  });

  it('labelSoon answers with the id-based label when the catalog is slow', async () => {
    const c = createModelCatalog({ baseUrl: 'http://x', apiKey: () => 'k', fetchImpl: hanging, timeoutMs: 10_000 });
    expect(await c.labelSoon('z-ai/glm-5.2', 30)).toBe('glm-5.2');
  });

  it('labelSoon gives the catalog label when it loads in time', async () => {
    const c = await catalogWith();
    expect(await c.labelSoon('z-ai/glm-5.2', 2_000)).toBe('GLM 5.2');
  });

  it('concurrent loads share one request', async () => {
    const c = await catalogWith();
    await Promise.all([c.list(), c.get('z-ai/glm-5.2'), c.get('deepseek/deepseek-v3.2'), c.list()]);
    expect(stub!.requests.filter((r) => r.url.endsWith('/models'))).toHaveLength(1);
  });
});

describe('createModelPicker', () => {
  async function pickerWith(curated: string[], chosen = 'z-ai/glm-5.2') {
    const catalog = await catalogWith();
    let current = chosen;
    const picker = createModelPicker({
      catalog,
      defaultModel: 'z-ai/glm-5.2',
      provider: 'openrouter',
      curated: () => curated,
      store: { get: () => current, set: (id) => (current = id ?? 'z-ai/glm-5.2') },
      credit: async () => 4.12,
    });
    return { picker, current: () => current };
  }

  it('the event lists her default first, then the curated models, deduplicated, with labels, prices and credit', async () => {
    const { picker } = await pickerWith(['deepseek/deepseek-v3.2', 'z-ai/glm-5.2', 'other/x']);
    const e = await picker.event();
    expect(e).toMatchObject({ type: 'model', model: 'z-ai/glm-5.2', provider: 'openrouter', label: 'GLM 5.2', backend: 'direct', credit: 4.12 });
    expect(e.choices!.map((c) => c.id)).toEqual(['z-ai/glm-5.2', 'deepseek/deepseek-v3.2', 'other/x']);
    expect(e.choices![2]).toEqual({ id: 'other/x', label: 'x', priceIn: null, priceOut: null });
  });

  it('a current model picked with OTHER is in the list too', async () => {
    const { picker } = await pickerWith([], 'deepseek/deepseek-v3.2');
    expect((await picker.event()).choices!.map((c) => c.id)).toEqual(['z-ai/glm-5.2', 'deepseek/deepseek-v3.2']);
  });

  it('the curated list is read live', async () => {
    const list: string[] = [];
    const { picker } = await pickerWith(list);
    list.push('deepseek/deepseek-v3.2');
    expect((await picker.event()).choices!.map((c) => c.id)).toEqual(['z-ai/glm-5.2', 'deepseek/deepseek-v3.2']);
  });

  it('the event carries her default', async () => {
    const { picker } = await pickerWith([], 'deepseek/deepseek-v3.2');
    expect((await picker.event()).default).toBe('z-ai/glm-5.2');
  });

  it('choose(null) resets to her default', async () => {
    const { picker, current } = await pickerWith([], 'deepseek/deepseek-v3.2');
    expect(await picker.choose(null)).toBeNull();
    expect(current()).toBe('z-ai/glm-5.2');
  });

  it('the catalog sends the key it reads now', async () => {
    stub = await startStubOpenRouter([]);
    let key: string | null = null;
    const c = createModelCatalog({ baseUrl: stub.url, apiKey: () => key });
    await c.list();
    expect(stub.requests[0]!.headers.authorization).toBeUndefined();
    key = 'sk-or-now';
    const c2 = createModelCatalog({ baseUrl: stub.url, apiKey: () => key });
    await c2.list();
    expect(stub.requests[1]!.headers.authorization).toBe('Bearer sk-or-now');
  });

  it('choose saves a known id and refuses an unknown one', async () => {
    const { picker, current } = await pickerWith([]);
    expect(await picker.choose('deepseek/deepseek-v3.2')).toBeNull();
    expect(current()).toBe('deepseek/deepseek-v3.2');
    expect(await picker.choose('nope/nope')).toBe('unknown-model');
    expect(current()).toBe('deepseek/deepseek-v3.2');
  });
});
