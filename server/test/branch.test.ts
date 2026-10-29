import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import { openDb, type Db } from '../src/db';
import { createPlaythroughs, type LiveDbs } from '../src/playthroughs';
import { DatabaseSync } from 'node:sqlite';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import { tempDir } from './fixtures/temp-dir';
import type { ChatMessage, RoomState } from '../../shared/types';

const TOKEN = 'test-token-123456789';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const until = async (p: () => boolean) => {
  const t = Date.now();
  while (!p()) {
    if (Date.now() - t > 3000) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** nix and cass on the OpenRouter stub whose replies wait for `release()` when `hold`. */
async function start(opts: { hold?: boolean } = {}) {
  let release!: () => void;
  const released = opts.hold ? new Promise<void>((r) => (release = r)) : Promise.resolve();
  const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')], holdUntil: released } });
  cleanups.push(async () => {
    release?.();
    await or.close();
  });
  const { cfg } = await makeFixture([
    { id: 'nix', direct: true, pack: 'karasu' },
    { id: 'cass', direct: true, pack: 'karasu' },
  ], undefined, { openrouterUrl: or.url });
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (built.app.server.address() as { port: number }).port;
  const pt = built.world.active()!;
  const api = async (method: string, url: string, payload?: unknown, headers?: Record<string, string>) => {
    const res = await built.app.inject({ method: method as 'POST', url, payload: payload as object | undefined, ...(headers ? { headers } : {}) });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
  };
  const dbPath = (ptId: string, contact: string) => path.join(cfg.playthroughsDir, ptId, 'chars', contact, 'room.db');
  /** Opens a contact's database in `ptId` (created if new); closed after the test. */
  const open = (ptId: string, contact: string): Db => {
    fs.mkdirSync(path.dirname(dbPath(ptId, contact)), { recursive: true });
    const db = openDb(dbPath(ptId, contact), { defaultPlayer: pt.player });
    cleanups.push(() => {
      try {
        db.close();
      } catch {
        // already closed by the test
      }
    });
    return db;
  };
  return { built, cfg, pt, api, port, open, dbPath, or, release: () => release() };
}

const line = (id: string, ts: number, role: 'user' | 'agent' = 'agent', text = `line ${id}`): ChatMessage => ({ id, role, text, toolLines: [], ts, status: 'ok' });
const room = (sceneId: string): RoomState => ({
  sceneId,
  lights: [],
  atmosphere: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' },
});

/** Nix has lines at 10 and 30 (she moves to the stall at 30, and Cass is shared then); Cass has lines at 20 and 40. */
function seed(s: Awaited<ReturnType<typeof start>>) {
  const nix = s.open(s.pt.id, 'nix');
  const player = s.pt.player;
  nix.insertMessage(player, line('n10', 10, 'agent', 'Rain again. You came anyway.'));
  nix.setReplyStamp({ messageId: 'n10', take: 0 });
  nix.saveRoom(room('karasu/lowlight-intake'));
  nix.setReplyStamp(null);
  nix.insertMessage(player, line('n30', 30));
  nix.setReplyStamp({ messageId: 'n30', take: 0 });
  nix.saveRoom(room('karasu/noodle-stall'));
  nix.shareContact({ contactId: 'cass', player, messageId: 'n30', how: null, at: 30 });
  nix.setReplyStamp(null);
  const cass = s.open(s.pt.id, 'cass');
  cass.insertMessage(player, line('c20', 20));
  cass.insertMessage(player, line('c40', 40));
  return { nix, cass };
}

/** Every file under `dir`, hashed. */
function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isFile()) out[f] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
  return out;
}

describe('world.branch', () => {
  it("branch cuts every contact at the line's time", async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const r = s.built.world.branch('nix', 'n10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(r.name).toBe(`${s.pt.name} — branch`);
    expect(r.forkedFrom).toEqual({ playthrough: s.pt.id, message: { contactId: 'nix', messageId: 'n10', excerpt: 'Rain again. You came anyway.' }, name: s.pt.name });
    expect(s.built.world.active()!.id).toBe(r.id);
    const bNix = s.open(r.id, 'nix');
    const bCass = s.open(r.id, 'cass');
    expect(bNix.allMessages(s.pt.player).map((m) => m.id)).toEqual(['n10']);
    expect(bCass.allMessages(s.pt.player).map((m) => m.id)).toEqual([]);
  });

  it("keeps only the narrator's power cuts whose rows the branch keeps (blackouts phase 3 §2)", async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const cut = (contact: string, row: string | null, district: string) => ({ district, from: 1, to: 91, by: 'narrator' as const, contact, row });
    s.built.playthroughs.setOutages(s.pt.id, [cut('nix', 'n10', 'karasu'), cut('nix', 'n30', 'velvet'), cut('cass', 'c20', 'marsh'), cut('nix', null, 'tidal')]);
    const r = s.built.world.branch('nix', 'n10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(s.built.playthroughs.get(r.id)!.outages?.map((o) => o.district)).toEqual(['karasu', 'tidal']);
    // The playthrough it came from is never written.
    expect(s.built.playthroughs.get(s.pt.id)!.outages).toHaveLength(4);
    // Its schedule is the same night (review I3).
    expect(s.built.playthroughs.get(r.id)!.seed).toBe(s.pt.seed ?? s.pt.id);
  });

  it("a line from before she ever moved: the branch opens her at her start room, not where her open room is now (e2e branch spec)", async () => {
    const s = await start();
    const rt = (await s.built.runtime('nix'))!;
    const startRoom = rt.room.state.sceneId;
    const player = s.pt.player;
    rt.db.insertMessage(player, line('n10', 10));
    rt.db.insertMessage(player, line('n30', 30));
    rt.db.setReplyStamp({ messageId: 'n30', take: 0 });
    rt.room.setScene({ id: 'karasu/ribbon-rooftop' }, 'agent');
    rt.db.setReplyStamp(null);
    expect(rt.room.state.sceneId).toBe('karasu/ribbon-rooftop');
    const r = s.built.world.branch('nix', 'n10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(r.location).toEqual({ contactId: 'nix', sceneId: startRoom });
  });

  it('a branch from a solo playthrough is not solo', async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    s.built.world.goSolo();
    const r = s.built.world.branch('nix', 'n10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(s.built.world.active()!.solo).toBeUndefined();
  });

  it('branch keeps the persona and the outfit', async () => {
    const s = await start();
    const persona = { name: 'Vee', background: 'Ex-courier.' };
    const made = s.built.world.create(s.pt.player, 'nix', undefined, persona) as { id: string };
    s.built.playthroughs.setOutfit(made.id, 'home');
    const nix = s.open(made.id, 'nix');
    nix.insertMessage(s.pt.player, line('v10', 10));
    nix.close();
    const r = s.built.world.branch('nix', 'v10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(r.persona).toEqual(persona);
    expect(r.outfit).toBe('home');
  });

  it('branching to a line inside the opening scene keeps the scene and brings its block back (Review Focus 2)', async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.insertMessage(s.pt.player, { id: 'scene-1', role: 'user', mode: 'scene', text: 'Rain has shut the Ribbon early.', scene: { title: 'After closing', source: 'written' }, toolLines: [], ts: 1, status: 'ok' });
    nix.insertMessage(s.pt.player, { id: 'e50', role: 'user', mode: 'end', text: '', toolLines: [], ts: 50, status: 'ok' });
    nix.insertMessage(s.pt.player, line('n51', 51, 'agent', 'Goodnight.'));
    nix.close();
    cass.close();
    const r = s.built.world.branch('nix', 'n10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    const rt = (await s.built.runtime('nix'))!;
    expect(rt.db.allMessages(s.pt.player).map((m) => m.id)).toEqual(['scene-1', 'n10']);
    await rt.relay.send(s.pt.player, 'still raining?');
    const chat = s.or.requests.filter((q) => q.url.endsWith('/v1/chat/completions')).at(-1)!;
    expect((chat.body as { messages: { content: string }[] }).messages[0].content).toContain('[scene: how this scene opens — "After closing"');
  });

  it('a contact shared after the line is unknown in the branch', async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const r = s.built.world.branch('nix', 'n10') as { id: string };
    expect(s.open(r.id, 'nix').sharedContacts(s.pt.player)).toEqual([]);
    expect(s.open(s.pt.id, 'nix').sharedContacts(s.pt.player).map((c) => c.contactId)).toEqual(['cass']);
  });

  it('a branch cut before the giving line holds no lead (Review Focus 2)', async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    cass.setReplyStamp({ messageId: 'c40', take: 0 });
    cass.giveLead({ id: 'teo-debt', player: s.pt.player, details: 'Teo owes 4k', messageId: 'c40', at: 40 });
    cass.setReplyStamp(null);
    nix.close();
    cass.close();
    const r = s.built.world.branch('nix', 'n30') as { id: string };
    expect(s.open(r.id, 'cass').leadsGiven(s.pt.player)).toEqual([]);
    expect(s.open(s.pt.id, 'cass').leadsGiven(s.pt.player).map((l) => l.id)).toEqual(['teo-debt']);
  });

  it('location comes from the rebuilt room', async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const r = s.built.world.branch('nix', 'n10') as { id: string; location: unknown };
    expect(r.location).toEqual({ contactId: 'nix', sceneId: 'karasu/lowlight-intake' });
    expect(s.open(r.id, 'nix').loadRoom()!.sceneId).toBe('karasu/lowlight-intake');
  });

  it('the original is byte-identical', async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const dir = path.join(s.cfg.playthroughsDir, s.pt.id);
    const before = hashTree(dir);
    s.built.world.branch('nix', 'n10');
    expect(hashTree(dir)).toEqual(before);
  });

  it('branch refused while busy leaves no folder', async () => {
    const s = await start({ hold: true });
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws/cass?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
    ws.on('error', () => {});
    cleanups.push(() => ws.close());
    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
    const rt = (await s.built.runtime('cass'))!;
    await until(() => rt.relay.busy);
    const folders = fs.readdirSync(s.cfg.playthroughsDir).length;
    expect(s.built.world.branch('nix', 'n10')).toEqual({ busy: 'cass' });
    expect(fs.readdirSync(s.cfg.playthroughsDir).length).toBe(folders);
  });

  it("edits made after the line in another contact's chat are cut too (final review I3)", async () => {
    const s = await start();
    const now = Date.now();
    const player = s.pt.player;
    const cass = s.open(s.pt.id, 'cass');
    cass.insertMessage(player, line('c1', now - 60_000));
    cass.setReplyStamp({ messageId: 'c1', take: 0 });
    cass.insertNote(player, { id: 'n1', text: 'in her reply', pinned: false, createdAt: 1, updatedAt: 1, editedBy: 'agent', about: 'you' });
    cass.setReplyStamp(null);
    // As if written in that reply, before the line branched from.
    cass.close();
    const raw = new DatabaseSync(s.dbPath(s.pt.id, 'cass'));
    raw.exec(`UPDATE writes SET at = ${now - 60_000}`);
    raw.close();
    const cassAgain = s.open(s.pt.id, 'cass');
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(player, line('n1', now - 30_000));
    nix.close();
    // Written now (after Nix's line), outside a reply: stamped to Cass's older line.
    cassAgain.insertNote(player, { id: 'n2', text: 'by hand, later', pinned: false, createdAt: now, updatedAt: now, editedBy: 'user', about: 'you' });
    cassAgain.close();
    const r = s.built.world.branch('nix', 'n1') as { id: string };
    const bCass = s.open(r.id, 'cass');
    expect(bCass.listNotes(player).map((n) => n.id)).toEqual(['n1']);
    expect(bCass.allMessages(player).map((m) => m.id)).toEqual(['c1']);
  });

  it("with no room of hers yet, the branch puts you in her start room, not the playthrough's last place (deferred minor)", async () => {
    const s = await start();
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(s.pt.player, line('n10', 10));
    nix.close();
    s.built.playthroughs.touch(s.pt.id, { contactId: 'cass', sceneId: 'karasu/noodle-stall' });
    const r = s.built.world.branch('nix', 'n10') as { location: unknown };
    expect(r.location).toEqual({ contactId: 'nix', sceneId: 'karasu/lowlight-intake' });
  });

  it("the excerpt never splits a character (deferred minor)", async () => {
    const s = await start();
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(s.pt.player, line('n10', 10, 'agent', `${'x'.repeat(59)}🌧️ rain`));
    nix.close();
    const r = s.built.world.branch('nix', 'n10') as { forkedFrom: { message: { excerpt: string } } };
    const excerpt = r.forkedFrom.message.excerpt;
    expect(Array.from(excerpt)).toHaveLength(60);
    expect(excerpt.endsWith('🌧')).toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(excerpt)).toBe(false); // no half emoji
  });

  it("an unknown line is 'unknown'", async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    expect(s.built.world.branch('nix', 'nope')).toBe('unknown');
    expect(s.built.world.branch('nobody', 'n10')).toBe('unknown');
  });
});

describe('Playthroughs.copyLive', () => {
  it('a failed copy leaves nothing', () => {
    const root = tempDir('copy-live-');
    const pts = createPlaythroughs(root);
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const dbs: LiveDbs = new Map([
      ['cass', { vacuumInto: (p: string) => fs.writeFileSync(p, 'db'), fingerprint: () => [1, 1, 0] }],
      ['nix', { vacuumInto: () => { throw new Error('disk full'); }, fingerprint: () => [1, 1, 0] }],
    ]);
    const before = fs.readdirSync(root).sort();
    expect(() => pts.copyLive(pt.id, dbs, { name: 'x', player: 'hicks', startContact: 'nix', forkedFrom: null, location: null })).toThrow('disk full');
    expect(fs.readdirSync(root).sort()).toEqual(before);
  });
});

describe('POST /api/branch', () => {
  it('200 activates the branch', async () => {
    const s = await start();
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const r = await s.api('POST', '/api/branch', { contactId: 'nix', messageId: 'n10' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: `${s.pt.name} — branch`, location: { contactId: 'nix' } });
    expect(s.built.world.active()!.id).toBe(r.body.id);
  });

  it('404 no such line', async () => {
    const s = await start();
    const r = await s.api('POST', '/api/branch', { contactId: 'nix', messageId: 'nope' });
    expect(r).toEqual({ status: 404, body: { error: 'no such line' } });
  });

  it('409 busy', async () => {
    const s = await start({ hold: true });
    const { nix, cass } = seed(s);
    nix.close();
    cass.close();
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws/nix?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
    ws.on('error', () => {});
    cleanups.push(() => ws.close());
    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
    const rt = (await s.built.runtime('nix'))!;
    await until(() => rt.relay.busy);
    const r = await s.api('POST', '/api/branch', { contactId: 'nix', messageId: 'n10' });
    expect(r).toEqual({ status: 409, body: { error: 'busy', contact: 'nix' } });
  });

  it('403 when cross-origin', async () => {
    const s = await start();
    const r = await s.api('POST', '/api/branch', { contactId: 'nix', messageId: 'n10' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });
});
