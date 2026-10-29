import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type KvLike, type RelayEnv, type RelayReport } from './worker';

function kv(): KvLike & { data: Map<string, string>; ttls: Map<string, number | undefined> } {
  const data = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    data,
    ttls,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v, o) => {
      data.set(k, v);
      ttls.set(k, o?.expirationTtl);
    },
  };
}

const report = (o: Partial<RelayReport> = {}): RelayReport => ({
  subject: '[Lowlight 0.1.0] Hae froze',
  text: 'She stopped answering.',
  attachments: [{ filename: 'server-log.txt', content: Buffer.from('log').toString('base64') }],
  ...o,
});

function post(body: unknown, ip = '1.2.3.4', headers: Record<string, string> = {}): Request {
  return new Request('https://relay.example/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('bug relay', () => {
  let env: RelayEnv;
  let resend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    env = { RESEND_API_KEY: 're_test', REPORT_TO: 'dev@example.com', REPORTS: kv() };
    resend = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
    vi.stubGlobal('fetch', resend);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends a valid report through Resend', async () => {
    const res = await worker.fetch(post(report({ replyTo: 'pat@x.io' })), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(resend).toHaveBeenCalledTimes(1);
    const [url, init] = resend.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: 'Lowlight bug reports <onboarding@resend.dev>',
      to: ['dev@example.com'],
      subject: '[Lowlight 0.1.0] Hae froze',
      text: 'She stopped answering.',
      reply_to: 'pat@x.io',
      attachments: [{ filename: 'server-log.txt', content: Buffer.from('log').toString('base64') }],
    });
  });

  it('rejects non-POST', async () => {
    const res = await worker.fetch(new Request('https://relay.example/'), env);
    expect(res.status).toBe(405);
    expect(resend).not.toHaveBeenCalled();
  });

  it('rejects a body over 4 MB', async () => {
    const big = report({ text: 'x'.repeat(4 * 1024 * 1024 + 1) });
    const res = await worker.fetch(post(big), env);
    expect(res.status).toBe(413);
    expect(resend).not.toHaveBeenCalled();
  });

  it('rejects a body over 4 MB even when Content-Length claims less', async () => {
    const req = post(report({ text: 'x'.repeat(4 * 1024 * 1024 + 1) }), '1.2.3.4', { 'content-length': '10' });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(413);
  });

  it('rejects a missing subject or text', async () => {
    for (const bad of [{ ...report(), subject: '' }, { ...report(), text: undefined }, 'not json']) {
      const res = await worker.fetch(post(bad), env);
      expect(res.status).toBe(400);
    }
    expect(resend).not.toHaveBeenCalled();
  });

  it('rejects an unknown attachment name or more than 2', async () => {
    const a = { filename: 'screenshot.png' as const, content: 'AAAA' };
    const evil = report({ attachments: [{ filename: 'evil.exe' as never, content: 'AAAA' }] });
    const three = report({ attachments: [a, a, a] });
    for (const bad of [evil, three]) expect((await worker.fetch(post(bad), env)).status).toBe(400);
    expect(resend).not.toHaveBeenCalled();
  });

  it('limits to 5 an hour per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await worker.fetch(post(report()), env)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await worker.fetch(post(report(), '5.6.7.8'), env)).status).toBe(200);
    const store = env.REPORTS as ReturnType<typeof kv>;
    const key = `rl:1.2.3.4:${Math.floor(Date.now() / 3_600_000)}`;
    expect(store.data.get(key)).toBe('5');
    expect(store.ttls.get(key)).toBe(3600);
  });

  it('caps every IP together at 50 a day', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 51; i++) statuses.push((await worker.fetch(post(report(), `10.0.0.${i}`), env)).status);
    expect(statuses.slice(0, 50).every((s) => s === 200)).toBe(true);
    expect(statuses[50]).toBe(429);
    const store = env.REPORTS as ReturnType<typeof kv>;
    expect(store.ttls.get(`day:${Math.floor(Date.now() / 86_400_000)}`)).toBe(86_400);
  });

  it('a mail that fails does not count', async () => {
    resend.mockResolvedValue(new Response('nope', { status: 500 }));
    for (let i = 0; i < 5; i++) await worker.fetch(post(report()), env);
    resend.mockResolvedValue(new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
    expect((await worker.fetch(post(report()), env)).status).toBe(200);
  });

  it('does not count a rejected report', async () => {
    for (let i = 0; i < 5; i++) await worker.fetch(post({ subject: '' }), env);
    expect((await worker.fetch(post(report()), env)).status).toBe(200);
  });

  it('reports a Resend failure', async () => {
    resend.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    const res = await worker.fetch(post(report()), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, reason: 'mail failed' });
  });
});
