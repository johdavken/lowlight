import http from 'node:http';

/**
 * A stand-in for NanoGPT: GET /api/v1/models?detailed=true, POST /api/v1/chat/completions (streamed or not),
 * GET /api/subscription/v1/usage and POST /api/check-balance. Every request is kept.
 */
export interface StubNanoGpt {
  /** The host, as `nanogptBaseUrl` takes it (no /api/v1). */
  url: string;
  requests: { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }[];
  /** A streamed turn's text (mutable). */
  reply: string;
  /** A non-streamed call's text (mutable): the narrator, the Residual. */
  completion: string;
  /** Keys it accepts (others get a 401); empty: any. */
  keys: string[];
  /** The models it lists (mutable): id, and whether the plan covers it. */
  models: { id: string; included: boolean; tools?: boolean }[];
  /** /api/subscription/v1/usage's answer (mutable), and its status for a good key (default 200). */
  usage: unknown;
  usageStatus: number;
  /** /api/check-balance's dollars (mutable). */
  balance: number;
  /** When set, chat answers this instead (a 429 allowance, a 402). */
  chatError: { status: number; json: unknown; headers?: Record<string, string> } | null;
  close(): Promise<void>;
}

/** A plan that is on, with 3 of 4 parts of the week left. */
export const PLAN_ON = { active: true, state: 'active', weeklyInputTokens: { used: 15_000_000, remaining: 45_000_000, percentUsed: 25, resetAt: 0 } };
/** No plan: the key only has a balance. */
export const PLAN_OFF = { active: false, state: 'inactive', weeklyInputTokens: { used: 0, remaining: 0, percentUsed: 0, resetAt: 0 } };

export async function startStubNanoGpt(o: { reply?: string; completion?: string; keys?: string[]; models?: StubNanoGpt['models']; port?: number } = {}): Promise<StubNanoGpt> {
  const stub = {
    requests: [],
    reply: o.reply ?? 'Hi from NanoGPT.',
    completion: o.completion ?? '{}',
    keys: o.keys ?? [],
    models: o.models ?? [
      { id: 'z-ai/glm-5.2', included: true },
      { id: 'deepseek/deepseek-v4-pro-0813', included: true },
      { id: 'anthropic/claude-sonnet-5.5', included: false },
    ],
    usage: PLAN_ON,
    usageStatus: 200,
    balance: 3.1,
    chatError: null,
  } as unknown as StubNanoGpt;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body: any = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      stub.requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const url = req.url ?? '';
      const key = String(req.headers.authorization ?? '').replace(/^Bearer /, '') || String(req.headers['x-api-key'] ?? '');
      const json = (status: number, b: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(b));
      };
      // The model list needs no key.
      if (req.method === 'GET' && url.startsWith('/api/v1/models')) {
        return json(200, {
          object: 'list',
          data: stub.models.map((m) => ({
            id: m.id,
            object: 'model',
            name: m.id.split('/')[1]?.toUpperCase() ?? m.id,
            context_length: 200_000,
            capabilities: { tool_calling: m.tools ?? true },
            pricing: { prompt: 0.4, completion: 1.3, currency: 'USD', unit: 'per_million_tokens' },
            subscription: { included: m.included, inputTokenMultiplier: 1 },
          })),
        });
      }
      if (stub.keys.length && !stub.keys.includes(key)) return json(401, { error: { message: 'Invalid API key', code: 'invalid_api_key' } });
      if (req.method === 'GET' && url.startsWith('/api/subscription/v1/usage')) return json(stub.usageStatus, stub.usageStatus === 200 ? stub.usage : { error: { message: 'no subscription' } });
      if (req.method === 'POST' && url.startsWith('/api/check-balance')) return json(200, { usd_balance: String(stub.balance), nano_balance: '0' });
      if (req.method === 'POST' && url.startsWith('/api/v1/chat/completions')) {
        if (stub.chatError) {
          res.writeHead(stub.chatError.status, { 'content-type': 'application/json', ...(stub.chatError.headers ?? {}) });
          return res.end(JSON.stringify(stub.chatError.json));
        }
        const model = body?.model ?? 'z-ai/glm-5.2';
        if (!body?.stream) return json(200, { id: 'c', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: stub.completion }, finish_reason: 'stop' }] });
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (d: unknown) => res.write(`data: ${JSON.stringify(d)}\n\n`);
        send({ choices: [{ index: 0, delta: { content: stub.reply }, finish_reason: null }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      json(404, { error: { message: 'not found' } });
    });
  });
  await new Promise<void>((r) => server.listen(o.port ?? 0, '127.0.0.1', r));
  const addr = server.address() as { port: number };
  stub.url = `http://127.0.0.1:${addr.port}`;
  stub.close = () => new Promise<void>((r) => server.close(() => r()));
  return stub;
}
