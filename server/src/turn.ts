/**
 * What every chat backend shares: the turn error, the stream-open frame, the model pair and one
 * message of a chat-completions request.
 */

/** Why a turn failed. `no-link`: a direct character's key was unlinked before the request went out (nothing was sent). */
export type TurnErrorKind = 'unreachable' | 'auth' | 'busy' | 'http' | 'credit' | 'refused' | 'no-link';

export class TurnError extends Error {
  constructor(
    public kind: TurnErrorKind,
    msg: string,
    public status?: number,
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
