/** Minimal SSE (Server-Sent Events) frame parser for a streaming chat-completions response. */

export interface SseFrame {
  event: string;
  data: unknown;
}

function parseFrame(raw: string): SseFrame | null {
  const dataLines: string[] = [];
  let event: string | null = null;

  for (const line of raw.split('\n')) {
    if (line === '' || line.startsWith(':')) continue; // blank line or comment
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
    // other fields (id:, retry:) are not used here and are ignored
  }

  if (event === null && dataLines.length === 0) return null; // comment-only or empty frame
  // A frame with data but no event name has the SSE default name (chat-completions chunks).
  event ??= 'message';

  const dataText = dataLines.join('\n');
  let data: unknown = undefined;
  if (dataText.length > 0) {
    try {
      data = JSON.parse(dataText);
    } catch {
      data = dataText;
    }
  }
  return { event, data };
}

/**
 * Parse a `ReadableStream<Uint8Array>` of SSE frames (`event: <name>\ndata: <json>\n\n`),
 * tolerant of chunk boundaries landing anywhere, including mid-separator, and of a final
 * frame with no trailing blank line once the stream ends.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseFrame(raw);
        if (frame) yield frame;
      }

      if (done) {
        buffer += decoder.decode();
        const raw = buffer.trim();
        if (raw.length > 0) {
          const frame = parseFrame(raw);
          if (frame) yield frame;
        }
        break;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}
