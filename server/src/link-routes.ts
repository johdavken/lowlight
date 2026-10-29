/**
 * The in-game link (spec §4): the player's OpenRouter key, checked before it's saved, and the model
 * lists the select screen offers, and SYS → NARRATOR THINKING. The key never leaves the server: answers carry its last 4 only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NARRATOR_THINKING, type LinkState, type ModelChoice, type NarratorThinking } from '../../shared/types';
import { modelLabel } from '../../shared/model-label';
import { MODEL_PICKS } from './default-models';
import type { ModelCatalog } from './model-catalog';
import type { AgentRuntime } from './runtime';
import type { Settings } from './settings';

const KEY_NAME = 'openrouter';
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

type Check = { state: 'ok' | 'no-credit'; credit: number | null } | { state: 'key-rejected' } | { state: 'unreachable' };

export function registerLinkRoutes(
  app: FastifyInstance,
  o: {
    settings: Settings;
    baseUrl: string;
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
  async function check(key: string): Promise<Check> {
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

  let cached: { key: string; at: number; info: LinkInfo } | null = null;
  const infoFor = (key: string, c: Check): LinkInfo => ({
    linked: true,
    last4: key.slice(-4),
    credit: 'credit' in c ? c.credit : null,
    state: c.state,
  });
  /** Every runtime forgets its link status and rechecks — in the background: an answer never waits on a slow health check. */
  const resetAll = () => {
    for (const rt of o.runtimes()) void rt.resetProbe().catch(() => {});
  };

  app.get('/api/link', async (): Promise<LinkInfo> => {
    const key = o.settings.key(KEY_NAME);
    if (!key) return { linked: false, last4: null, credit: null, state: 'no-link' };
    if (cached && cached.key === key && Date.now() - cached.at < STATUS_CACHE_MS) return cached.info;
    const info = infoFor(key, await check(key));
    cached = { key, at: Date.now(), info };
    return info;
  });

  app.put('/api/link', sameOrigin, async (req, reply) => {
    const raw = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>).apiKey : undefined;
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (key.length < KEY_MIN || key.length > KEY_MAX) return reply.code(400).send({ error: 'bad-key' });
    const c = await check(key);
    if (c.state === 'key-rejected') return reply.code(400).send({ error: 'key-rejected' });
    if (c.state === 'unreachable') return reply.code(502).send({ error: 'unreachable' });
    o.settings.setKey(KEY_NAME, key);
    const info = infoFor(key, c);
    cached = { key, at: Date.now(), info };
    resetAll();
    return info;
  });

  app.delete('/api/link', sameOrigin, async (_req, reply) => {
    o.settings.deleteKey(KEY_NAME);
    cached = null;
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

  app.get<{ Querystring: { q?: string } }>('/api/models', async (req) => {
    const all = await o.catalog.list();
    const byId = new Map((all ?? []).map((m) => [m.id, m]));
    const fallback = (id: string): ModelChoice => ({ id, label: modelLabel(id), priceIn: null, priceOut: null });
    // With the catalog down every pick shows (by its id); with it up, only the ones it still lists.
    const picks = MODEL_PICKS.filter((p) => all === null || byId.has(p.id)).map((p) => ({ ...(byId.get(p.id) ?? fallback(p.id)), why: p.why }));
    const recent = o.settings.recentModels().map((id) => byId.get(id) ?? fallback(id));
    const q = (req.query.q ?? '').trim();
    const results = q.length >= SEARCH_MIN ? ((await o.catalog.search(q, SEARCH_MAX)) ?? []) : [];
    return { picks, recent, results };
  });
}
