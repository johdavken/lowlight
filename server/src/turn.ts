/**
 * What every chat backend shares: the turn error, the stream-open frame, the model pair and one
 * message of a chat-completions request.
 */

/** A turn that found no key linked (unlinked mid-session): the player relinks at select. */
export const NO_LINK_NOTICE = '// NO LINK — RELINK AT SELECT';

/** Why a turn failed. `no-link`: a direct character's key was unlinked before the request went out (nothing was sent). */
export type TurnErrorKind = 'unreachable' | 'auth' | 'busy' | 'http' | 'credit' | 'refused' | 'no-link';

export class TurnError extends Error {
  constructor(
    public kind: TurnErrorKind,
    msg: string,
    public status?: number,
    /** Seconds to wait before a retry, when the provider said (a 429). */
    public retryAfter?: number,
    /** The failure came from Anthropic (the player's notice names it); absent: OpenRouter or her own address. */
    public provider?: 'anthropic',
  ) {
    super(msg);
    this.name = 'TurnError';
  }
}

/**
 * Synthetic first frame a backend yields once the provider has answered 200 — before any real SSE
 * frame — so the relay can open the streaming reply (and attach tool lines to it) immediately.
 */
export const STREAM_OPEN_EVENT = 'stream.open';

export interface ModelPair {
  model: string;
  provider: string;
}

/** One message of a chat-completions request. */
export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
