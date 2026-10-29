import type { Backend, TurnRequest } from '../../src/backend';
import type { SseFrame } from '../../src/sse';

/** What a fake backend answers a turn with: the frames it streams, or an error it throws. */
export type Script = (req: TurnRequest) => SseFrame[] | Error;

/** A reply's frames: stream.open (with the model, when given), one delta, run.completed. */
export const reply = (text: string, model?: string): SseFrame[] => [
  { event: 'stream.open', data: model ? { model } : undefined },
  { event: 'assistant.delta', data: { delta: text } },
  { event: 'run.completed', data: undefined },
];

/** A Backend that records each TurnRequest and answers with `script`. */
export function fakeBackend(script: Script, model = 'z-ai/glm-5.2'): Backend & { reqs: TurnRequest[] } {
  const reqs: TurnRequest[] = [];
  return {
    reqs,
    async *streamTurn(req) {
      reqs.push(req);
      const out = script(req);
      if (out instanceof Error) throw out;
      yield* out;
    },
    probe: async () => 'ok',
    currentModel: async () => ({ model, provider: 'openrouter' }),
  };
}
