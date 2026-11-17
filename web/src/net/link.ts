/** The in-game link routes (spec 2026-10-08 §4): the OpenRouter, Anthropic and NanoGPT keys and the model lists. A key goes up once; only its last 4 come back. */
import type { ChatThinking, LinkState, ModelChoice, NarratorThinking, ReplyLength } from '../../../shared/types';

/** NanoGPT's plan: on or off, and the share of the week's input tokens left (0–1; null: not said). */
export type NanoPlan = { active: boolean; weekLeft: number | null };
export type LinkInfo = { linked: boolean; last4: string | null; credit: number | null; state: LinkState; plan?: NanoPlan };
export type Provider = 'openrouter' | 'anthropic' | 'nanogpt';
export const PROVIDERS: readonly Provider[] = ['openrouter', 'anthropic', 'nanogpt'];
/** Every link; `state` is ok when any key works. */
export type LinkStatus = { state: LinkState } & Record<Provider, LinkInfo>;
export type LinkError = 'bad-key' | 'key-rejected' | 'unreachable';
export type ModelLists = { picks: ModelChoice[]; recent: ModelChoice[]; results: ModelChoice[] };
/** The model step's lists: the picks, recent models and the whole catalog (null when it can't be read). */
export type ModelBrowse = { picks: ModelChoice[]; recent: ModelChoice[]; all: ModelChoice[] | null };

const json = { 'content-type': 'application/json' };

export async function getLink(): Promise<LinkStatus> {
  const res = await fetch('/api/link');
  if (!res.ok) throw new Error(`/api/link: HTTP ${res.status}`);
  return (await res.json()) as LinkStatus;
}

/** Saves the key once its provider accepts it; a refusal comes back as its reason, never thrown. */
export async function putLink(apiKey: string, provider: Provider = 'openrouter'): Promise<LinkInfo | { error: LinkError }> {
  let res: Response;
  try {
    res = await fetch(`/api/link/${provider}`, { method: 'PUT', headers: json, body: JSON.stringify({ apiKey }) });
  } catch {
    return { error: 'unreachable' };
  }
  if (res.ok) return (await res.json()) as LinkInfo;
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  return { error: body.error === 'bad-key' || body.error === 'key-rejected' ? body.error : 'unreachable' };
}

export async function deleteLink(provider: Provider = 'openrouter'): Promise<void> {
  const res = await fetch(`/api/link/${provider}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`/api/link: HTTP ${res.status}`);
}

/** The model step's lists, in one go. */
export async function browseModels(): Promise<ModelBrowse> {
  const res = await fetch('/api/models?all=1');
  if (!res.ok) throw new Error(`/api/models: HTTP ${res.status}`);
  return (await res.json()) as ModelBrowse;
}

/** The shipped picks and recent models; with `q` (2+ characters), the catalog's matches too. */
export async function searchModels(q: string): Promise<ModelLists> {
  const res = await fetch(q ? `/api/models?q=${encodeURIComponent(q)}` : '/api/models');
  if (!res.ok) throw new Error(`/api/models: HTTP ${res.status}`);
  return (await res.json()) as ModelLists;
}

/** SYS → REPLY LENGTH and REPLY THINKING, as saved in data/settings.json. */
export async function getReplyPrefs(): Promise<{ length: ReplyLength; thinking: ChatThinking }> {
  const res = await fetch('/api/reply-prefs');
  if (!res.ok) throw new Error(`/api/reply-prefs: HTTP ${res.status}`);
  return (await res.json()) as { length: ReplyLength; thinking: ChatThinking };
}

export async function putReplyPrefs(p: { length?: ReplyLength; thinking?: ChatThinking }): Promise<{ length: ReplyLength; thinking: ChatThinking }> {
  const res = await fetch('/api/reply-prefs', { method: 'PUT', headers: json, body: JSON.stringify(p) });
  if (!res.ok) throw new Error(`/api/reply-prefs: HTTP ${res.status}`);
  return (await res.json()) as { length: ReplyLength; thinking: ChatThinking };
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
