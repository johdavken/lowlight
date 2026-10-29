/** OpenRouter's model list (labels, prices, valid ids) and a direct character's model picker. */
import { modelLabel } from '../../shared/model-label';
import type { ModelChoice, ModelEvent } from '../../shared/types';

const CATALOG_CACHE_MS = 3_600_000;
const CATALOG_TIMEOUT_MS = 8_000;

export interface ModelCatalog {
  /** Every model the provider lists; null when it can't be read. */
  list(): Promise<ModelChoice[] | null>;
  get(id: string): Promise<ModelChoice | null>;
  /** The label from the last loaded list, else the id after '/'. */
  labelFor(id: string): string;
  /** The catalog's label if the list loads within `ms`, else `labelFor` (pages mustn't wait on OpenRouter). */
  labelSoon(id: string, ms: number): Promise<string>;
  /** Models whose id or name contains `q` (any case), at most `limit`; null when the list can't be read. */
  search(q: string, limit: number): Promise<ModelChoice[] | null>;
}

/** GET {baseUrl}/models, cached for an hour; prices per token × 1e6. */
export function createModelCatalog(opts: { baseUrl: string; apiKey: () => string | null; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number }): ModelCatalog {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  let cached: { at: number; byId: Map<string, ModelChoice> } | null = null;
  /** One request at a time: concurrent callers share it. */
  let pending: Promise<Map<string, ModelChoice> | null> | null = null;
  const perMillion = (v: unknown): number | null => {
    const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e4) / 1e4 : null;
  };

  function load(): Promise<Map<string, ModelChoice> | null> {
    if (cached && now() - cached.at < CATALOG_CACHE_MS) return Promise.resolve(cached.byId);
    pending ??= fetchList().finally(() => (pending = null));
    return pending;
  }

  async function fetchList(): Promise<Map<string, ModelChoice> | null> {
    try {
      const key = opts.apiKey();
      const res = await fetchImpl(`${opts.baseUrl}/models`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(opts.timeoutMs ?? CATALOG_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { id?: unknown; name?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }[] };
      const byId = new Map<string, ModelChoice>();
      for (const m of body.data ?? []) {
        if (typeof m.id !== 'string') continue;
        byId.set(m.id, {
          id: m.id,
          label: modelLabel(m.id, typeof m.name === 'string' ? m.name : undefined),
          priceIn: perMillion(m.pricing?.prompt),
          priceOut: perMillion(m.pricing?.completion),
        });
      }
      cached = { at: now(), byId };
      return byId;
    } catch {
      return null;
    }
  }

  return {
    async list() {
      const byId = await load();
      return byId ? [...byId.values()] : null;
    },
    async get(id) {
      return (await load())?.get(id) ?? null;
    },
    labelFor(id) {
      return cached?.byId.get(id)?.label ?? modelLabel(id);
    },
    async search(q, limit) {
      const byId = await load();
      if (!byId) return null;
      const needle = q.toLowerCase();
      const out: ModelChoice[] = [];
      for (const m of byId.values()) {
        if (m.id.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle)) out.push(m);
        if (out.length >= limit) break;
      }
      return out;
    },
    labelSoon(id, ms) {
      const fallback = new Promise<null>((r) => setTimeout(() => r(null), ms));
      return Promise.race([load(), fallback]).then((byId) => byId?.get(id)?.label ?? modelLabel(id));
    },
  };
}

/** What the hub needs for a direct character's MODEL menu. */
export interface ModelPicker {
  /** The model event for her tabs: current model, label, choices with prices, credit. */
  event(): Promise<ModelEvent>;
  /** Saves a model the catalog knows (null: back to her default); otherwise the refusal. */
  choose(id: string | null): Promise<'unknown-model' | null>;
}

export function createModelPicker(opts: {
  catalog: ModelCatalog;
  defaultModel: string;
  provider: string;
  /** The picks and recent models, read now. */
  curated: () => string[];
  store: { get(): string; set(id: string | null): void };
  credit: () => Promise<number | null>;
}): ModelPicker {
  const choiceFor = async (id: string): Promise<ModelChoice> =>
    (await opts.catalog.get(id)) ?? { id, label: modelLabel(id), priceIn: null, priceOut: null };
  return {
    async event() {
      const current = opts.store.get();
      const ids = [...new Set([opts.defaultModel, ...opts.curated(), current])];
      const choices = await Promise.all(ids.map(choiceFor));
      return {
        type: 'model',
        model: current,
        provider: opts.provider,
        label: opts.catalog.labelFor(current),
        backend: 'direct',
        choices,
        credit: await opts.credit(),
        default: opts.defaultModel,
      };
    },
    async choose(id) {
      if (id !== null && !(await opts.catalog.get(id))) return 'unknown-model';
      opts.store.set(id);
      return null;
    },
  };
}
