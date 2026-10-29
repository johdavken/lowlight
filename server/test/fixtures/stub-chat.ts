import http, { type IncomingMessage, type ServerResponse } from 'node:http';

export interface StubRequest extends IncomingMessage {
  bodyText: string;
  bodyJson: unknown;
}

export interface StubScriptEntry {
  match: (req: StubRequest) => boolean;
  respond: (req: StubRequest, res: ServerResponse) => void;
}

export type StubScript = StubScriptEntry[];

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  bodyText: string;
  bodyJson: unknown;
}

export interface StubChat {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

/** The model the wire backend reports (`currentModel`), and what relay tests expect on the `model` event. */
export const DEFAULT_STUB_MODEL = { model: 'stub-model-1', provider: 'stub-provider' };

/** Writes one SSE frame: `event: <name>\ndata: <json>\n\n`. */
export function sseFrame(event: string, data?: unknown): string {
  const dataLine = data === undefined ? '' : `data: ${JSON.stringify(data)}\n`;
  return `event: ${event}\n${dataLine}\n`;
}

/** Starts an SSE response: status 200, correct headers. */
export function startSseResponse(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}

/** A plain `node:http` chat-completions stub driven by a script of match/respond pairs (see wire-backend.ts). */
export function startStubChat(script: StubScript): Promise<StubChat> {
  const requests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      let bodyJson: unknown;
      if (bodyText.length > 0) {
        try {
          bodyJson = JSON.parse(bodyText);
        } catch {
          bodyJson = undefined;
        }
      }
      const stubReq = req as StubRequest;
      stubReq.bodyText = bodyText;
      stubReq.bodyJson = bodyJson;

      requests.push({
        method: req.method ?? 'GET',
        url: req.url ?? '',
        headers: req.headers,
        bodyText,
        bodyJson,
      });

      const entry = script.find((e) => e.match(stubReq));
      if (entry) {
        entry.respond(stubReq, res);
        return;
      }
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'no script match' } }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

/** One chat-completions stream chunk (an unnamed SSE frame): `data: {"choices":[{"delta":…}]}`. */
export function chunkFrame(content: string, finishReason?: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content }, ...(finishReason ? { finish_reason: finishReason } : {}) }] })}\n\n`;
}

/** The chat-completions stream terminator. */
export function doneFrame(): string {
  return 'data: [DONE]\n\n';
}

/** A script entry answering `POST …/v1/chat/completions` with `reply` in two chunks, then [DONE]. */
export function completionEntry(reply: string | ((req: StubRequest) => string), prefix = ''): StubScriptEntry {
  return {
    match: (req) => req.method === 'POST' && req.url === `${prefix}/v1/chat/completions`,
    respond: (req, res) => {
      const text = typeof reply === 'function' ? reply(req) : reply;
      const cut = Math.ceil(text.length / 2);
      startSseResponse(res);
      res.write(chunkFrame(text.slice(0, cut)));
      res.write(chunkFrame(text.slice(cut), 'stop'));
      res.write(doneFrame());
      res.end();
    },
  };
}

/**
 * The relay's frame vocabulary, written as a chat-completions stream: text chunks, [DONE], error
 * chunks. Frames that stream has no equivalent for become keepalive comments.
 */
export function wireFrame(event: string, data?: unknown): string {
  switch (event) {
    case 'assistant.delta':
      return chunkFrame((data as { delta: string }).delta);
    case 'run.completed':
      return doneFrame();
    case 'run.failed':
    case 'error':
      return `data: ${JSON.stringify({ error: data ?? { message: 'failed' } })}\n\n`;
    case 'run.cancelled':
      return `data: ${JSON.stringify({ error: { message: 'cancelled' } })}\n\n`;
    default:
      return ': keepalive\n\n';
  }
}
