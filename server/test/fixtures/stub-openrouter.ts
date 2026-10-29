import http from 'node:http';

/** One scripted answer to a chat/completions request. Requests take the steps in order. */
export interface StubOpenRouterStep {
  status?: number;
  headers?: Record<string, string>;
  /** Streamed as `data: <json>` frames, then `data: [DONE]` unless `done` is false. */
  chunks?: unknown[];
  /** Written verbatim before the chunks (e.g. `: OPENROUTER PROCESSING\n\n`). */
  raw?: string[];
  done?: boolean;
  /** A non-streamed JSON body (error responses). */
  json?: unknown;
  /** Destroy the connection after this many chunks. */
  cutAfter?: number;
  /** After the chunks, go silent and keep the connection open (no [DONE], no end): a stalled stream. */
  hang?: boolean;
  /** Wait this long before each chunk (a slow but steady stream). */
  gapMs?: number;
  /** Hold the chunks (after the headers and `raw`) until this settles; a function is called when the request arrives. */
  holdUntil?: Promise<unknown> | (() => Promise<unknown>);
}

export interface StubOpenRouter {
  url: string;
  requests: { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }[];
  /** GET /key answer (mutable). */
  key: { status: number; json: unknown };
  /** GET /models answer (mutable). */
  models: { status: number; json: unknown };
  /** The scribe's calls (scribe spec): answered apart from `steps`, so a test's queued turns stay its own. */
  scribeRequests: { body: any }[];
  /** What a scribe call gets (mutable; default: nothing to write), after `delayMs` when set. */
  scribe: { status: number; json: unknown; delayMs?: number };
  close(): Promise<void>;
}

/** The scribe's system message starts with this (server/src/scribe.ts). */
const SCRIBE_OPENING = 'You keep the records for a roleplay';

/** A chat.completion.chunk with a content delta and/or a finish reason. */
export const chunk = (content?: string, finish?: string | null, extra: Record<string, unknown> = {}) => ({
  choices: [{ index: 0, delta: content === undefined ? {} : { content }, finish_reason: finish ?? null, ...extra }],
});

/** A step that streams `text` and stops. */
export const okStep = (text: string): StubOpenRouterStep => ({ chunks: [chunk(text), chunk(undefined, 'stop')] });

/** `fallback` answers every chat request once `steps` run out (otherwise a 500 "no step left"). */
export function startStubOpenRouter(steps: StubOpenRouterStep[], o: { fallback?: StubOpenRouterStep } = {}): Promise<StubOpenRouter> {
  const requests: StubOpenRouter['requests'] = [];
  const queue = [...steps];
  const stub = {
    key: { status: 200, json: { data: { limit_remaining: 4.12 } } as unknown },
    models: { status: 200, json: { data: [] } as unknown },
    scribeRequests: [] as { body: any }[],
    scribe: { status: 200, json: { choices: [{ message: { content: '{"notes":[]}' } }] } as unknown, delayMs: undefined as number | undefined },
  };
  const open = new Set<http.ServerResponse>();
  const server = http.createServer((req, res) => {
    open.add(res);
    res.on('close', () => open.delete(res));
    let text = '';
    req.on('data', (c) => (text += c));
    req.on('end', () => {
      let body: unknown = undefined;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = text;
      }
      const b = body as { stream?: boolean; messages?: { content?: unknown }[] } | undefined;
      const first = b?.messages?.[0]?.content;
      if (b?.stream === false && typeof first === 'string' && first.startsWith(SCRIBE_OPENING)) {
        stub.scribeRequests.push({ body });
        const answer = () => void res.writeHead(stub.scribe.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(stub.scribe.json));
        if (stub.scribe.delayMs) setTimeout(answer, stub.scribe.delayMs);
        else answer();
        return;
      }
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const path = (req.url ?? '').replace(/^\/api\/v1/, '');
      if (req.method === 'GET' && (path === '/key' || path === '/models')) {
        const a = path === '/key' ? stub.key : stub.models;
        res.writeHead(a.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(a.json));
        return;
      }
      const step = queue.shift() ?? o.fallback ?? { status: 500, json: { error: { message: 'stub: no step left' } } };
      if (step.json !== undefined || (step.status ?? 200) !== 200) {
        res.writeHead(step.status ?? 200, { 'Content-Type': 'application/json', ...(step.headers ?? {}) }).end(JSON.stringify(step.json ?? {}));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', ...(step.headers ?? {}) });
      for (const r of step.raw ?? []) res.write(r);
      const chunks = step.chunks ?? [];
      void (async () => {
        if (step.holdUntil) await (typeof step.holdUntil === 'function' ? step.holdUntil() : step.holdUntil);
        if (res.destroyed) return;
        for (let i = 0; i < chunks.length; i++) {
          if (step.cutAfter !== undefined && i === step.cutAfter) {
            res.destroy();
            return;
          }
          if (step.gapMs) await new Promise((r) => setTimeout(r, step.gapMs));
          if (res.destroyed) return;
          res.write(`data: ${JSON.stringify(chunks[i])}\n\n`);
        }
        if (step.hang) return;
        if (step.done !== false) res.write('data: [DONE]\n\n');
        res.end();
      })();
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve(
        Object.assign(stub, {
          url: `http://127.0.0.1:${port}/api/v1`,
          requests,
          close: () =>
            new Promise<void>((r) => {
              for (const res of open) res.destroy();
              server.close(() => r());
            }),
        }),
      );
    }),
  );
}
