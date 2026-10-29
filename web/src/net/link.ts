/** The in-game link routes (spec 2026-10-08 §4): the OpenRouter key and the model lists. The key goes up once; only its last 4 come back. */
import type { LinkState, ModelChoice, NarratorThinking } from '../../../shared/types';

export type LinkInfo = { linked: boolean; last4: string | null; credit: number | null; state: LinkState };
export type LinkError = 'bad-key' | 'key-rejected' | 'unreachable';
export type ModelLists = { picks: ModelChoice[]; recent: ModelChoice[]; results: ModelChoice[] };

const json = { 'content-type': 'application/json' };

export async function getLink(): Promise<LinkInfo> {
  const res = await fetch('/api/link');
  if (!res.ok) throw new Error(`/api/link: HTTP ${res.status}`);
  return (await res.json()) as LinkInfo;
}

/** Saves the key once OpenRouter accepts it; a refusal comes back as its reason, never thrown. */
export async function putLink(apiKey: string): Promise<LinkInfo | { error: LinkError }> {
  let res: Response;
  try {
    res = await fetch('/api/link', { method: 'PUT', headers: json, body: JSON.stringify({ apiKey }) });
  } catch {
    return { error: 'unreachable' };
  }
  if (res.ok) return (await res.json()) as LinkInfo;
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  return { error: body.error === 'bad-key' || body.error === 'key-rejected' ? body.error : 'unreachable' };
}

export async function deleteLink(): Promise<void> {
  const res = await fetch('/api/link', { method: 'DELETE' });
  if (!res.ok) throw new Error(`/api/link: HTTP ${res.status}`);
}

/** The shipped picks and recent models; with `q` (2+ characters), the catalog's matches too. */
export async function searchModels(q: string): Promise<ModelLists> {
  const res = await fetch(q ? `/api/models?q=${encodeURIComponent(q)}` : '/api/models');
  if (!res.ok) throw new Error(`/api/models: HTTP ${res.status}`);
  return (await res.json()) as ModelLists;
}

/** SYS → NARRATOR THINKING, as saved in data/settings.json. */
export async function getNarratorThinking(): Promise<NarratorThinking> {
  const res = await fetch('/api/narrator-thinking');
  if (!res.ok) throw new Error(`/api/narrator-thinking: HTTP ${res.status}`);
  return ((await res.json()) as { thinking: NarratorThinking }).thinking;
}

export async function putNarratorThinking(thinking: NarratorThinking): Promise<NarratorThinking> {
  const res = await fetch('/api/narrator-thinking', { method: 'PUT', headers: json, body: JSON.stringify({ thinking }) });
  if (!res.ok) throw new Error(`/api/narrator-thinking: HTTP ${res.status}`);
  return ((await res.json()) as { thinking: NarratorThinking }).thinking;
}
