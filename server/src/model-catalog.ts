/** The model lists (OpenRouter's: labels, prices, valid ids; Anthropic's for a player with only that key) and a direct character's model picker. */
import { modelLabel } from '../../shared/model-label';
import type { ModelChoice, ModelEvent } from '../../shared/types';
import { anthropicClient } from './anthropic';
import { fromNative } from './model-route';

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

/** A catalog over `fetchList`, cached for an hour, one request at a time (concurrent callers share it). */
function cachedCatalog(fetchList: () => Promise<Map<string, ModelChoice> | null>, now: () => number): ModelCatalog {
  let cached: { at: number; byId: Map<string, ModelChoice> } | null = null;
  let pending: Promise<Map<string, ModelChoice> | null> | null = null;

  function load(): Promise<Map<string, ModelChoice> | null> {
    if (cached && now() - cached.at < CATALOG_CACHE_MS) return Promise.resolve(cached.byId);
    pending ??= fetchList()
      .then((byId) => {
        if (byId) cached = { at: now(), byId };
        return byId;
      })
      .finally(() => (pending = null));
    return pending;
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

/** GET {baseUrl}/models, cached for an hour, without the models that can't call tools; prices per token × 1e6. */
export function createModelCatalog(opts: { baseUrl: string; apiKey: () => string | null; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number }): ModelCatalog {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const perMillion = (v: unknown): number | null => {
    const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e4) / 1e4 : null;
  };
  return cachedCatalog(async () => {
    try {
      const key = opts.apiKey();
      const res = await fetchImpl(`${opts.baseUrl}/models`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(opts.timeoutMs ?? CATALOG_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { id?: unknown; name?: unknown; pricing?: { prompt?: unknown; completion?: unknown }; context_length?: unknown; supported_parameters?: unknown }[] };
      const byId = new Map<string, ModelChoice>();
      for (const m of body.data ?? []) {
        if (typeof m.id !== 'string') continue;
        // A contact acts through tools: a model that says it can't call them isn't offered. One that doesn't say is.
        if (Array.isArray(m.supported_parameters) && !m.supported_parameters.includes('tools')) continue;
        byId.set(m.id, {
          id: m.id,
          label: modelLabel(m.id, typeof m.name === 'string' ? m.name : undefined),
          priceIn: perMillion(m.pricing?.prompt),
          priceOut: perMillion(m.pricing?.completion),
          ...(typeof m.context_length === 'number' && m.context_length > 0 ? { context: m.context_length } : {}),
        });
      }
      return byId;
    } catch {
      return null;
    }
  }, opts.now ?? Date.now);
}

/** Anthropic's own model list, ids in the stored form (`anthropic/claude-sonnet-5.5`); it gives no prices. */
export function createAnthropicCatalog(opts: { apiKey: () => string | null; baseUrl?: string; fetchImpl?: typeof fetch; now?: () => number }): ModelCatalog {
  return cachedCatalog(async () => {
    const key = opts.apiKey();
    if (!key) return null;
    try {
      const byId = new Map<string, ModelChoice>();
      for await (const m of anthropicClient(key, { baseUrl: opts.baseUrl, fetchImpl: opts.fetchImpl, timeoutMs: CATALOG_TIMEOUT_MS }).models.list({ limit: 100 })) {
        const id = fromNative(m.id);
        byId.set(id, { id, label: m.display_name || modelLabel(id), priceIn: null, priceOut: null });
      }
      return byId;
    } catch {
      return null;
    }
  }, opts.now ?? Date.now);
}

/** Anthropic's list when that's the only key linked (an Anthropic-only player), else OpenRouter's. */
export function createRoutedCatalog(o: { openrouter: ModelCatalog; anthropic: ModelCatalog; keys: () => { openrouter: string | null; anthropic: string | null } }): ModelCatalog {
  const pick = () => {
    const k = o.keys();
    return !k.openrouter && k.anthropic ? o.anthropic : o.openrouter;
  };
  return {
    list: () => pick().list(),
    get: (id) => pick().get(id),
    labelFor: (id) => pick().labelFor(id),
    labelSoon: (id, ms) => pick().labelSoon(id, ms),
    search: (q, limit) => pick().search(q, limit),
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
  /** The model she actually runs for a stored one (an Anthropic-only player's fallback); absent: the stored one. */
  shown?: (id: string) => string;
  /** Whether a model runs through the player's Anthropic key (the MODEL menu says so). */
  via?: (id: string) => boolean;
}): ModelPicker {
  const choiceFor = async (id: string): Promise<ModelChoice> =>
    (await opts.catalog.get(id)) ?? { id, label: modelLabel(id), priceIn: null, priceOut: null };
  return {
    async event() {
      const current = (opts.shown ?? ((id: string) => id))(opts.store.get());
      // A pick or recent the list no longer has can't be chosen, so it isn't offered; with the list down, all are.
      const listed = await opts.catalog.list();
      const offered = opts.curated().filter((id) => listed === null || listed.some((m) => m.id === id));
      const ids = [...new Set([opts.defaultModel, ...offered, current])];
      const choices = (await Promise.all(ids.map(choiceFor))).map((c): ModelChoice => (opts.via?.(c.id) ? { ...c, via: 'anthropic' } : c));
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
      // Her current model may have left the list (or lack tools): keeping it isn't a new pick.
      if (id !== null && id !== opts.store.get() && !(await opts.catalog.get(id))) return 'unknown-model';
      opts.store.set(id);
      return null;
    },
  };
}
