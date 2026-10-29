import { describe, expect, it } from 'vitest';
import { parseSse } from '../src/sse';

/** Build a ReadableStream<Uint8Array> that emits the given string chunks in order. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out: { event: string; data: unknown }[] = [];
  for await (const frame of parseSse(stream)) out.push(frame);
  return out;
}

describe('parseSse', () => {
  it('parses a single frame split across a chunk boundary in the middle of the \\n\\n separator', async () => {
    const full = 'event: run.started\ndata: {"a":1}\n\n';
    const splitAt = full.indexOf('\n\n') + 1; // land inside the blank-line separator
    const chunks = [full.slice(0, splitAt), full.slice(splitAt)];
    const frames = await collect(streamOf(chunks));
    expect(frames).toEqual([{ event: 'run.started', data: { a: 1 } }]);
  });

  it('parses frames split across arbitrary chunk boundaries', async () => {
    const full = 'event: assistant.delta\ndata: {"delta":"hel';
    const full2 = 'lo"}\n\nevent: done\n\n';
    const frames = await collect(streamOf([full, full2]));
    expect(frames).toEqual([
      { event: 'assistant.delta', data: { delta: 'hello' } },
      { event: 'done', data: undefined },
    ]);
  });

  it('joins multi-line data fields with newlines before parsing', async () => {
    const chunk = 'event: assistant.completed\ndata: {"content":\ndata: "line1\\nline2"}\n\n';
    const frames = await collect(streamOf([chunk]));
    expect(frames).toEqual([{ event: 'assistant.completed', data: { content: 'line1\nline2' } }]);
  });

  it('ignores comment lines starting with ":"', async () => {
    const chunk = ': keepalive\n\nevent: run.started\ndata: {}\n\n: keepalive\n\n';
    const frames = await collect(streamOf([chunk]));
    expect(frames).toEqual([{ event: 'run.started', data: {} }]);
  });

  it('emits a final frame with no trailing blank line once the stream ends', async () => {
    const chunk = 'event: run.started\ndata: {}\n\nevent: done';
    const frames = await collect(streamOf([chunk]));
    expect(frames).toEqual([
      { event: 'run.started', data: {} },
      { event: 'done', data: undefined },
    ]);
  });

  it('a data-only frame gets the SSE default event name, message (chat completions)', async () => {
    expect(await collect(streamOf(['data: {"a":1}\n\n', ': keepalive\n\n', 'data: [DONE]\n\n']))).toEqual([
      { event: 'message', data: { a: 1 } },
      { event: 'message', data: '[DONE]' },
    ]);
  });
});
