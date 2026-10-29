/**
 * What the chat relay talks to for a turn: her model, called directly. Everything above it —
 * history, message controls, takes, saving — lives in the relay.
 */
import type { LinkState } from '../../shared/types';
import type { CompletionMessage, ModelPair } from './turn';
import type { SseFrame } from './sse';

export interface TurnRequest {
  messages: CompletionMessage[];
  model: ModelPair | null;
  /** A regenerate turn: the backend asks for a little more variety. */
  regenerate: boolean;
  /** A text on the deck (spec 2026-10-23 §4): no tools are offered at all. */
  noTools?: boolean;
}

export interface Backend {
  /**
   * One turn: yields `stream.open` (its data may carry `{ model }`, the model actually used), then
   * `assistant.delta` / `run.completed` / `run.failed`. Throws a `TurnError` before the stream opens.
   */
  streamTurn(req: TurnRequest, signal?: AbortSignal): AsyncGenerator<SseFrame>;
  probe(): Promise<LinkState>;
  /** False when a turn can't start (a direct character with no key linked); absent means always ready. */
  ready?(): boolean;
  /** Her current model, or null when the backend can't say. */
  currentModel(): Promise<ModelPair | null>;
}
