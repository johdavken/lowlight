import http from 'node:http';

/** A stand-in for Anthropic's API: GET /v1/models, POST /v1/messages (streamed or not). Every request is kept. */
export interface StubAnthropic {
  url: string;
  requests: { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }[];
  /** A streamed turn's text (mutable). */
  reply: string;
  /** A non-streamed call's text (mutable): the narrator, the Residual. */
  completion: string;
  /** Keys it accepts (others get a 401); empty: any. */
  keys: string[];
  close(): Promise<void>;
}

const usage = { input_tokens: 12, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

export async function startStubAnthropic(o: { reply?: string; completion?: string; keys?: string[] } = {}): Promise<StubAnthropic> {
  const stub = { requests: [], reply: o.reply ?? 'Hi from Claude.', completion: o.completion ?? '{}', keys: o.keys ?? [] } as unknown as StubAnthropic;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      stub.requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const key = String(req.headers.authorization ?? '').replace(/^Bearer /, '') || String(req.headers['x-api-key'] ?? '');
      const json = (status: number, b: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(b));
      };
      if (stub.keys.length && !stub.keys.includes(key)) return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
        return json(200, { data: [{ type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-09-01T00:00:00Z' }], has_more: false, first_id: null, last_id: null });
      }
      if (req.method === 'POST' && req.url?.startsWith('/v1/messages')) {
        const model = body?.model ?? 'claude-sonnet-5-5';
        if (!body?.stream) return json(200, { id: 'msg', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: stub.completion }], stop_reason: 'end_turn', usage });
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (e: Record<string, unknown>) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
        send({ type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage } });
        send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: stub.reply } });
        send({ type: 'content_block_stop', index: 0 });
        send({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } });
        send({ type: 'message_stop' });
        return res.end();
      }
      json(404, { type: 'error', error: { type: 'not_found_error', message: 'not found' } });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as { port: number };
  stub.url = `http://127.0.0.1:${addr.port}`;
  stub.close = () => new Promise<void>((r) => server.close(() => r()));
  return stub;
}
