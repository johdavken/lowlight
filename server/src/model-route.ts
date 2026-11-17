/**
 * Where one call to her model goes (Anthropic backend spec §2): a Claude model to the player's Anthropic key
 * when one is linked, a model NanoGPT's plan covers to the NanoGPT key, everything else to OpenRouter. A
 * character on her own address keeps it. Model ids are stored in OpenRouter's form (`anthropic/claude-sonnet-5.5`),
 * which NanoGPT shares; Anthropic's native id exists only inside a route.
 */
import type { DirectSetup } from './agents';
import type { Settings } from './settings';

/** What an Anthropic-only player's characters run on when theirs isn't a Claude model. */
export const ANTHROPIC_FALLBACK_MODEL = 'anthropic/claude-sonnet-5.5';


/** A plain Claude id; OpenRouter's variants (`:batch`, `~anthropic/…-latest`) aren't Anthropic's and stay on OpenRouter. */
const PLAIN_CLAUDE = /^anthropic\/(claude-[a-z0-9.-]+)$/;

/** `anthropic/claude-sonnet-5.5` → `claude-sonnet-5-5`; null for a model that isn't Anthropic's own. */
export function toNative(id: string): string | null {
  const m = PLAIN_CLAUDE.exec(id);
  return m ? m[1]!.replace(/\./g, '-') : null;
}

/** `claude-sonnet-5-5` → `anthropic/claude-sonnet-5.5`. */
export function fromNative(native: string): string {
  return `anthropic/${native.replace(/-(\d+)-(\d+)$/, '-$1.$2')}`;
}

/** `model` is always the stored-form id; `key` '' is an address without auth. */
export type Route =
  | { provider: 'openrouter' | 'openai-compatible' | 'nanogpt'; baseUrl: string; key: string; model: string }
  | { provider: 'anthropic'; key: string; model: string; native: string };

export type AnthropicRoute = Extract<Route, { provider: 'anthropic' }>;

export type RouteKeys = { openrouter: string | null; anthropic: string | null; nanogpt?: string | null; own: string | null };

/** The linked keys a route can use, read now from settings. */
export function keysFor(settings: Pick<Settings, 'key'>, setup: Pick<DirectSetup, 'keyName'>): Required<RouteKeys> {
  return { openrouter: settings.key('openrouter'), anthropic: settings.key('anthropic'), nanogpt: settings.key('nanogpt'), own: setup.keyName === null ? '' : settings.key(setup.keyName) };
}

/** What routing needs of NanoGPT's model list, read synchronously from its last load. */
export interface NanoIndex {
  /** The OpenAI-style base (`<host>/api/v1`). */
  baseUrl: string;
  /** The plan covers this model; false while the list hasn't loaded. */
  included(id: string): boolean;
  /** The plan's allowance ran out (NanoGPT's 429 said so) and hasn't reset: plan models go elsewhere if they can. */
  spent?(): boolean;
}

/**
 * The route for `model`, or null when no key it could use is linked. `own` is the key her `keyName` names
 * ('' when she needs none), read for an openai-compatible character. In order: Claude to the Anthropic key; a
 * model NanoGPT's plan covers to the NanoGPT key (unless its allowance is spent); OpenRouter; NanoGPT for anything else (a NanoGPT-only player,
 * billed to their balance; a model it lacks falls back to her default like any unknown model); Anthropic-only
 * runs Sonnet.
 */
export function routeFor(
  setup: Pick<DirectSetup, 'provider' | 'baseUrl' | 'keyName'>,
  keys: RouteKeys,
  model: string,
  nano?: NanoIndex,
): Route | null {
  if (setup.provider === 'openai-compatible') return keys.own === null ? null : { provider: 'openai-compatible', baseUrl: setup.baseUrl, key: keys.own, model };
  const native = toNative(model);
  if (native && keys.anthropic) return { provider: 'anthropic', key: keys.anthropic, model, native };
  const nanoKey = nano ? (keys.nanogpt ?? null) : null;
  if (nanoKey && !nano!.spent?.() && nano!.included(model)) return { provider: 'nanogpt', baseUrl: nano!.baseUrl, key: nanoKey, model };
  if (keys.openrouter) return { provider: 'openrouter', baseUrl: setup.baseUrl, key: keys.openrouter, model };
  if (nanoKey) return { provider: 'nanogpt', baseUrl: nano!.baseUrl, key: nanoKey, model };
  if (keys.anthropic) return { provider: 'anthropic', key: keys.anthropic, model: ANTHROPIC_FALLBACK_MODEL, native: toNative(ANTHROPIC_FALLBACK_MODEL)! };
  return null;
}
