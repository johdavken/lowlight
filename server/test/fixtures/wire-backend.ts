/**
 * A test Backend that sends each turn to a scripted chat-completions stub (stub-chat.ts) over HTTP
 * and streams the reply back as relay frames. The relay tests script raw HTTP (holds, stalls, error
 * statuses); this keeps those scripts while the relay sees an ordinary direct backend.
 *
 * It keeps the first transport's meaning on purpose, not direct.ts's: 402/403 are `http`, a
 * `length` finish completes, stream.open carries no model, and currentModel is never null. Tests of
 * the real direct transport use createDirectBackend on stub-openrouter.ts.
 */
import type { Backend, TurnRequest } from '../../src/backend';
import { TurnError, STREAM_OPEN_EVENT } from '../../src/turn';
import { parseSse, type SseFrame } from '../../src/sse';
import { DEFAULT_STUB_MODEL } from './stub-chat';

/** One stream frame as relay frames: text → delta; [DONE] or a stop/length finish → completed; an error → failed. */
function relayFrames(frame: SseFrame, state: { ended: boolean }): SseFrame[] {
  if (frame.event !== 'message' || state.ended) return [];
  if (frame.data === '[DONE]') {
    state.ended = true;
    return [{ event: 'run.completed', data: undefined }];
  }
  const data = frame.data as { error?: unknown; choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[] } | undefined;
  const choice = data?.choices?.[0];
  const out: SseFrame[] = [];
  const content = choice?.delta?.content;
  if (typeof content === 'string' && content.length > 0) out.push({ event: 'assistant.delta', data: { delta: content } });
  if (data?.error || choice?.finish_reason === 'error') {
    state.ended = true;
    out.push({ event: 'run.failed', data: data?.error ?? choice });
  } else if (choice?.finish_reason === 'stop' || choice?.finish_reason === 'length') {
    state.ended = true;
    out.push({ event: 'run.completed', data: undefined });
  }
  return out;
}

async function errorFor(res: Response): Promise<TurnError> {
  let body: { error?: { message?: string } } | undefined;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = undefined;
  }
  if (res.status === 401) return new TurnError('auth', 'unauthorized', res.status);
  if (res.status === 429) return new TurnError('busy', 'rate limited', res.status);
  return new TurnError('http', body?.error?.message ?? `HTTP ${res.status}`, res.status);
}

/** A direct-kind Backend on the stub at `url`: POST {messages, model?, provider?} to `${url}/v1/chat/completions`. */
export function wireBackend(url: string): Backend & { reqs: TurnRequest[] } {
  const reqs: TurnRequest[] = [];
  return {
    reqs,
    async *streamTurn(req, signal) {
      reqs.push(req);
      let res: Response;
      try {
        res = await fetch(`${url}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(req.model ? { model: req.model.model, provider: req.model.provider } : {}), stream: true, messages: req.messages }),
          signal,
        });
      } catch (err) {
        // As both real backends do: a refused connection is `unreachable`; an abort passes through.
        if (err instanceof TypeError) throw new TurnError('unreachable', err.message);
        throw err;
      }
      if (!res.ok) throw await errorFor(res);
      yield { event: STREAM_OPEN_EVENT, data: undefined };
      if (!res.body) return;
      const state = { ended: false };
      for await (const frame of parseSse(res.body as ReadableStream<Uint8Array>)) yield* relayFrames(frame, state);
    },
    probe: async () => 'ok',
    currentModel: async () => ({ ...DEFAULT_STUB_MODEL }),
  };
}
