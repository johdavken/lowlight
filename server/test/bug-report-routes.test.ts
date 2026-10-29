import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { BugState } from '../src/bug-report';
import { registerBugReportRoutes, type BugDeps } from '../src/bug-report-routes';
import { tempDir } from './fixtures/temp-dir';

const STATE: BugState = {
  version: '0.1.0-preview.2',
  build: null,
  os: 'linux',
  runtime: 'Node 24',
  playthrough: { id: 'pt1', name: 'Hicks — Oct 11' },
  room: { sceneId: 'ribbon/noodle-stall', contactId: 'hae' },
  present: ['hae'],
  models: { hae: 'z-ai/glm-5.2' },
  clock: 'Day 1 · 23:40',
  turns: [{ speaker: 'Hae', text: 'You again.' }],
};

interface Relay {
  url: string;
  bodies: unknown[];
  close(): Promise<void>;
}

/** A fake relay: answers `status` (or never, for `'silent'`; a 302 to `redirect`), and records each body. */
async function relay(status: number | 'silent', o: { redirect?: string; reply?: string } = {}): Promise<Relay> {
  const bodies: unknown[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      bodies.push(raw ? JSON.parse(raw) : null);
      if (status === 'silent') return;
      if (o.redirect) return void res.writeHead(302, { location: o.redirect }).end();
      res.writeHead(status, { 'content-type': 'application/json' }).end(o.reply ?? JSON.stringify({ ok: status === 200 }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    bodies,
    close: () => new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}

const open: { app?: FastifyInstance; relay?: Relay } = {};
afterEach(async () => {
  await open.app?.close();
  await open.relay?.close();
  delete open.app;
  delete open.relay;
});

async function start(o: Partial<BugDeps> = {}): Promise<{ app: FastifyInstance; reportsDir: string }> {
  const reportsDir = o.reportsDir ?? tempDir('bug-reports-');
  const app = Fastify();
  registerBugReportRoutes(app, {
    relayUrl: null,
    logFile: null,
    reportsDir,
    keys: () => [],
    state: async (includeTurns) => ({ ...STATE, turns: includeTurns ? STATE.turns : [] }),
    context: () => ({ playthroughName: 'Hicks — Oct 11', hasTurns: true }),
    originAllowed: (origin) => origin === undefined || origin.startsWith('http://localhost'),
    ...o,
  });
  open.app = app;
  return { app, reportsDir };
}

const body = (o: Record<string, unknown> = {}) => ({ description: 'Hae froze', contact: '', includeTurns: true, screenshot: null, ...o });
const zips = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^bug-report-\d{8}-\d{6}(-\d+)?\.zip$/.test(f)) : []);

describe('POST /api/bug-report', () => {
  it('sends to the relay', async () => {
    open.relay = await relay(200);
    const { app, reportsDir } = await start({ relayUrl: open.relay.url });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sent: true });
    expect(open.relay.bodies).toHaveLength(1);
    expect(open.relay.bodies[0]).toMatchObject({ subject: '[Lowlight 0.1.0-preview.2] Hae froze', attachments: [{ filename: 'server-log.txt' }] });
    expect((open.relay.bodies[0] as { text: string }).text).toContain('You again.');
    expect(zips(reportsDir)).toEqual([]);
  });

  it('saves when no relay is set', async () => {
    const { app, reportsDir } = await start();
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    const json = res.json();
    expect(json).toMatchObject({ sent: false, reason: 'no report address in this build' });
    expect(zips(reportsDir)).toHaveLength(1);
    expect(json.file).toBe(path.join(reportsDir, zips(reportsDir)[0]));
  });

  it('saves on 429', async () => {
    open.relay = await relay(429);
    const { app, reportsDir } = await start({ relayUrl: open.relay.url });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.json()).toMatchObject({ sent: false, reason: 'too many reports this hour' });
    expect(zips(reportsDir)).toHaveLength(1);
  });

  it('saves on 500', async () => {
    open.relay = await relay(500);
    const { app } = await start({ relayUrl: open.relay.url });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.json()).toMatchObject({ sent: false, reason: 'the report server refused it' });
  });

  it("can't reach a closed relay", async () => {
    const { app } = await start({ relayUrl: 'http://127.0.0.1:9/' });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.json()).toMatchObject({ sent: false, reason: "couldn't reach the report server" });
  });

  it('times out a silent relay', async () => {
    open.relay = await relay('silent');
    const { app, reportsDir } = await start({ relayUrl: open.relay.url, timeoutMs: 200 });
    const t0 = Date.now();
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(res.json()).toMatchObject({ sent: false, reason: "couldn't reach the report server" });
    expect(zips(reportsDir)).toHaveLength(1);
  });

  it('rejects a bad body', async () => {
    open.relay = await relay(200);
    const { app } = await start({ relayUrl: open.relay.url });
    for (const bad of [
      body({ description: '' }),
      body({ description: '   ' }),
      body({ description: 'x'.repeat(4001) }),
      body({ contact: 'x'.repeat(201) }),
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: bad });
      expect(res.statusCode).toBe(400);
    }
    expect(open.relay.bodies).toHaveLength(0);
  });

  it('refuses a foreign origin', async () => {
    const { app } = await start();
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', headers: { origin: 'https://evil.example' }, payload: body() });
    expect(res.statusCode).toBe(403);
  });

  it('zip write fails', async () => {
    const dir = tempDir('bug-reports-');
    const notADir = path.join(dir, 'file');
    fs.writeFileSync(notADir, 'x');
    const { app } = await start({ reportsDir: notADir });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.json()).toEqual({ sent: false, reason: 'no report address in this build', file: null });
  });

  it('asks for turns only when ticked', async () => {
    open.relay = await relay(200);
    const { app } = await start({ relayUrl: open.relay.url });
    await app.inject({ method: 'POST', url: '/api/bug-report', payload: body({ includeTurns: false }) });
    expect((open.relay.bodies[0] as { text: string }).text).not.toContain('You again.');
  });
});

describe('POST /api/bug-report (review fixes)', () => {
  const extra: Relay[] = [];
  afterEach(async () => {
    for (const r of extra.splice(0)) await r.close();
  });

  it('drops an oversized screenshot rather than refusing the report', async () => {
    open.relay = await relay(200);
    const { app } = await start({ relayUrl: open.relay.url });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body({ screenshot: 'A'.repeat(3 * 1024 * 1024 + 4) }) });
    expect(res.json()).toEqual({ sent: true });
    const sent = open.relay.bodies[0] as { text: string; attachments: { filename: string }[] };
    expect(sent.attachments.map((a) => a.filename)).toEqual(['server-log.txt']);
    expect(sent.text).toContain('screenshot left out: too big');
  });

  it('keeps the relay body under 4 MB with the biggest screenshot and a huge log', async () => {
    const dir = tempDir('bug-log-');
    const logFile = path.join(dir, 'server.log');
    fs.writeFileSync(logFile, `${'y'.repeat(9_000)}\n`.repeat(400));
    open.relay = await relay(200);
    let size = 0;
    const counting: typeof fetch = async (url, init) => {
      size = String(init?.body).length;
      return fetch(url, init);
    };
    const { app } = await start({ relayUrl: open.relay.url, logFile, fetch: counting });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body({ screenshot: 'A'.repeat(3 * 1024 * 1024), description: 'x'.repeat(4000) }) });
    expect(res.json()).toEqual({ sent: true });
    expect(size).toBeGreaterThan(3 * 1024 * 1024);
    expect(size).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it('a redirect (captive portal) is not sent', async () => {
    const portal = await relay(200, { reply: '<html>login</html>' });
    extra.push(portal);
    open.relay = await relay(302, { redirect: portal.url });
    const { app, reportsDir } = await start({ relayUrl: open.relay.url });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.json()).toMatchObject({ sent: false, reason: "couldn't reach the report server" });
    expect(zips(reportsDir)).toHaveLength(1);
  });

  it('a 200 that is not the relay is not sent', async () => {
    open.relay = await relay(200, { reply: '<html>hello</html>' });
    const { app } = await start({ relayUrl: open.relay.url });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.json()).toMatchObject({ sent: false, reason: 'the report server refused it' });
  });

  it('a failing state() still sends what it can', async () => {
    open.relay = await relay(200);
    const { app } = await start({
      relayUrl: open.relay.url,
      state: async () => {
        throw new Error('database is closed');
      },
    });
    const res = await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    expect(res.json()).toEqual({ sent: true });
    const text = (open.relay.bodies[0] as { text: string }).text;
    expect(text).toContain('Hae froze');
    expect(text).toContain('game state unavailable: database is closed');
  });

  it('two reports in the same second keep both files', async () => {
    const { app, reportsDir } = await start();
    await app.inject({ method: 'POST', url: '/api/bug-report', payload: body() });
    await app.inject({ method: 'POST', url: '/api/bug-report', payload: body({ description: 'second' }) });
    expect(fs.readdirSync(reportsDir).filter((f) => f.endsWith('.zip'))).toHaveLength(2);
  });
});

describe('GET /api/bug-report/context', () => {
  it('names the playthrough', async () => {
    const { app } = await start();
    const res = await app.inject({ method: 'GET', url: '/api/bug-report/context' });
    expect(res.json()).toEqual({ playthroughName: 'Hicks — Oct 11', hasTurns: true });
  });
});
