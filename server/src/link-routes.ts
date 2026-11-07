/**
 * The in-game link (spec §4): the player's keys — OpenRouter's and Anthropic's (Anthropic backend spec §1) — each
 * checked before it's saved, the model lists the select screen offers, and SYS → NARRATOR THINKING. A key never
 * leaves the server: answers carry its last 4 only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NARRATOR_THINKING, type LinkState, type ModelChoice, type NarratorThinking } from '../../shared/types';
import { modelLabel } from '../../shared/model-label';
import { MODEL_PICKS } from './default-models';
import type { ModelCatalog } from './model-catalog';
import type { AgentRuntime } from './runtime';
import type { Settings } from './settings';
import { checkAnthropicKey } from './anthropic';
import { toNative } from './model-route';

export const PROVIDERS = ['openrouter', 'anthropic'] as const;
export type Provider = (typeof PROVIDERS)[number];
const KEY_MIN = 8;
const KEY_MAX = 300;
const CHECK_TIMEOUT_MS = 5_000;
const STATUS_CACHE_MS = 15_000;
const SEARCH_MIN = 2;
const SEARCH_MAX = 30;

export interface LinkInfo {
  linked: boolean;
  last4: string | null;
  credit: number | null;
  state: LinkState;
}

/** Both links, and the one state that decides the select screen: ok when either key works. */
export interface LinkStatus {
  state: LinkState;
  openrouter: LinkInfo;
  anthropic: LinkInfo;
}

/** ok if either is ok; no-link if neither is linked; else the linked one's state (OpenRouter's when both are). */
export function combinedState(a: LinkInfo, b: LinkInfo): LinkState {
  if (a.state === 'ok' || b.state === 'ok') return 'ok';
  if (a.linked) return a.state;
  if (b.linked) return b.state;
  return 'no-link';
}

type Check = { state: 'ok' | 'no-credit'; credit: number | null } | { state: 'key-rejected' } | { state: 'unreachable' };

export function registerLinkRoutes(
  app: FastifyInstance,
  o: {
    settings: Settings;
    baseUrl: string;
    anthropicBaseUrl?: string;
    fetchImpl?: typeof fetch;
    catalog: ModelCatalog;
    runtimes: () => AgentRuntime[];
    originAllowed: (origin: string | undefined) => boolean;
  },
): void {
  const fetchImpl = o.fetchImpl ?? fetch;
  const sameOrigin = {
    onRequest: async (req: FastifyRequest, reply: FastifyReply) => {
      if (!o.originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    },
  };

  /** GET {baseUrl}/key with this key: what OpenRouter says about it. A missing /key (404) counts as fine. */
  async function checkOpenRouter(key: string): Promise<Check> {
    let res: Response;
    try {
      res = await fetchImpl(`${o.baseUrl}/key`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    } catch {
      return { state: 'unreachable' };
    }
    if (res.status === 401 || res.status === 403) return { state: 'key-rejected' };
    if (res.status === 404) return { state: 'ok', credit: null };
    if (!res.ok) return { state: 'unreachable' };
    const body = (await res.json().catch(() => ({}))) as { data?: { limit_remaining?: unknown } };
    const left = body.data?.limit_remaining;
    const credit = typeof left === 'number' ? left : null;
    return { state: credit !== null && credit <= 0 ? 'no-credit' : 'ok', credit };
  }

  const check = async (p: Provider, key: string): Promise<Check> => {
    if (p === 'openrouter') return checkOpenRouter(key);
    const state = await checkAnthropicKey(key, { ...(o.anthropicBaseUrl ? { baseUrl: o.anthropicBaseUrl } : {}), ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}), timeoutMs: CHECK_TIMEOUT_MS });
    return state === 'ok' ? { state: 'ok', credit: null } : { state };
  };
  const cached = new Map<Provider, { key: string; at: number; info: LinkInfo }>();
  const infoFor = (key: string, c: Check): LinkInfo => ({
    linked: true,
    last4: key.slice(-4),
    credit: 'credit' in c ? c.credit : null,
    state: c.state,
  });
  const unlinked: LinkInfo = { linked: false, last4: null, credit: null, state: 'no-link' };
  async function infoOf(p: Provider): Promise<LinkInfo> {
    const key = o.settings.key(p);
    if (!key) return unlinked;
    const c = cached.get(p);
    if (c && c.key === key && Date.now() - c.at < STATUS_CACHE_MS) return c.info;
    const info = infoFor(key, await check(p, key));
    cached.set(p, { key, at: Date.now(), info });
    return info;
  }
  /** Every runtime forgets its link status and rechecks — in the background: an answer never waits on a slow health check. */
  const resetAll = () => {
    for (const rt of o.runtimes()) void rt.resetProbe().catch(() => {});
  };
  const providerOf = (raw: string): Provider | null => ((PROVIDERS as readonly string[]).includes(raw) ? (raw as Provider) : null);

  app.get('/api/link', async (): Promise<LinkStatus> => {
    const [openrouter, anthropic] = await Promise.all([infoOf('openrouter'), infoOf('anthropic')]);
    return { state: combinedState(openrouter, anthropic), openrouter, anthropic };
  });

  app.put<{ Params: { provider: string } }>('/api/link/:provider', sameOrigin, async (req, reply) => {
    const p = providerOf(req.params.provider);
    if (!p) return reply.code(404).send({ error: 'provider' });
    const raw = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>).apiKey : undefined;
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (key.length < KEY_MIN || key.length > KEY_MAX) return reply.code(400).send({ error: 'bad-key' });
    const c = await check(p, key);
    if (c.state === 'key-rejected') return reply.code(400).send({ error: 'key-rejected' });
    if (c.state === 'unreachable') return reply.code(502).send({ error: 'unreachable' });
    o.settings.setKey(p, key);
    const info = infoFor(key, c);
    cached.set(p, { key, at: Date.now(), info });
    resetAll();
    return info;
  });

  app.delete<{ Params: { provider: string } }>('/api/link/:provider', sameOrigin, async (req, reply) => {
    const p = providerOf(req.params.provider);
    if (!p) return reply.code(404).send({ error: 'provider' });
    o.settings.deleteKey(p);
    cached.delete(p);
    resetAll();
    return reply.code(204).send();
  });

  app.get('/api/narrator-thinking', async (): Promise<{ thinking: NarratorThinking }> => ({ thinking: o.settings.narratorThinking() }));

  app.put('/api/narrator-thinking', sameOrigin, async (req, reply) => {
    const raw = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>).thinking : undefined;
    if (!(NARRATOR_THINKING as readonly unknown[]).includes(raw)) return reply.code(400).send({ error: 'bad-thinking' });
    o.settings.setNarratorThinking(raw as NarratorThinking);
    return { thinking: o.settings.narratorThinking() };
  });

  app.get<{ Querystring: { q?: string; all?: string } }>('/api/models', async (req) => {
    const all = await o.catalog.list();
    const byId = new Map((all ?? []).map((m) => [m.id, m]));
    const fallback = (id: string): ModelChoice => ({ id, label: modelLabel(id), priceIn: null, priceOut: null });
    // A Claude model goes through the Anthropic key when one is linked: the list says so.
    const anthropic = Boolean(o.settings.key('anthropic'));
    const onlyAnthropic = anthropic && !o.settings.key('openrouter');
    const via = (m: ModelChoice): ModelChoice => (anthropic && toNative(m.id) !== null ? { ...m, via: 'anthropic' } : m);
    // With the catalog down every pick shows (by its id); with it up, only the ones it still lists. Anthropic-only: Claude's.
    const picks = MODEL_PICKS.filter((p) => (!onlyAnthropic || p.id.startsWith('anthropic/')) && (all === null || byId.has(p.id))).map((p) => via({ ...(byId.get(p.id) ?? fallback(p.id)), why: p.why }));
    const recent = o.settings
      .recentModels()
      .filter((id) => (!onlyAnthropic || id.startsWith('anthropic/')) && (all === null || byId.has(id)))
      .map((id) => via(byId.get(id) ?? fallback(id)));
    const q = (req.query.q ?? '').trim();
    const results = (q.length >= SEARCH_MIN ? ((await o.catalog.search(q, SEARCH_MAX)) ?? []) : []).map(via);
    // `all=1`, the model step's browse list: every model, or null with the catalog down.
    return { picks, recent, results, ...(req.query.all === '1' ? { all: all?.map(via) ?? null } : {}) };
  });
}
