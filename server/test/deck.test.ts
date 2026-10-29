import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { makeFixture } from './fixtures/agents';
import { commsKey } from '../../shared/comms';
import { formatClock } from '../../shared/clock';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import type { DeckServerEvent } from '../../shared/types';

const TOKEN = 'test-token-123456789';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const until = async (p: () => boolean, ms = 3000) => {
  const t = Date.now();
  while (!p()) {
    if (Date.now() - t > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** nix and cass on the OpenRouter stub; replies wait for `release()` when `hold`. */
async function start(opts: { hold?: boolean; prepare?: (cfg: Config) => void } = {}) {
  let release!: () => void;
  const released = opts.hold ? new Promise<void>((r) => (release = r)) : Promise.resolve();
  const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('till four\nroof. 4:15'), chunk(undefined, 'stop')], holdUntil: released } });
  cleanups.push(async () => {
    release?.();
    await or.close();
  });
  const { cfg } = await makeFixture(
    [
      { id: 'nix', direct: true, pack: 'karasu' },
      { id: 'cass', direct: true, pack: 'karasu' },
      { id: 'mute', pack: 'karasu' },
    ],
    undefined,
    { openrouterUrl: or.url },
  );
  opts.prepare?.(cfg);
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (built.app.server.address() as { port: number }).port;
  return { built, cfg, port, release: () => release() };
}
type S = Awaited<ReturnType<typeof start>>;

/** A deck socket and everything it heard. */
async function deck(s: S, headers: Record<string, string> = { Origin: 'http://localhost:5173' }, token = TOKEN) {
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws/deck?token=${token}`, { headers });
  const events: DeckServerEvent[] = [];
  let closed: number | null = null;
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  ws.on('close', (c) => (closed = c));
  ws.on('error', () => {});
  cleanups.push(() => ws.close());
  const status = await new Promise<number>((r) => {
    ws.on('open', () => r(0));
    ws.on('unexpected-response', (_q, res) => r(res.statusCode ?? 1));
  });
  const send = (e: unknown) => ws.send(JSON.stringify(e));
  const of = <T extends DeckServerEvent['type']>(t: T) => events.filter((e): e is Extract<DeckServerEvent, { type: T }> => e.type === t);
  return { ws, events, send, of, status, closed: () => closed };
}

/** A room turn with `id` (you're with them after it). */
async function turn(s: S, id: string) {
  const rt = (await s.built.runtime(id))!;
  const player = s.built.world.active()!.player;
  const before = rt.db.recentMessages(player).filter((m) => m.role === 'agent' && m.status === 'ok').length;
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws/${id}?token=${TOKEN}&enter=1`, { headers: { Origin: 'http://localhost:5173' } });
  ws.on('error', () => {});
  cleanups.push(() => ws.close());
  await new Promise<void>((r) => ws.on('open', () => r()));
  ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
  await until(() => rt.db.recentMessages(player).filter((m) => m.role === 'agent' && m.status === 'ok').length > before && !rt.relay.busy);
  return { rt, ws };
}

describe('/ws/deck (deck spec §5)', () => {
  it('refuses a bad token, a foreign host and a foreign origin', async () => {
    const s = await start();
    const bad = await deck(s, undefined, 'nope-nope-nope-nope');
    await until(() => bad.closed() !== null);
    expect(bad.closed()).toBe(4401);
    const origin = await deck(s, { Origin: 'https://evil.example' });
    await until(() => origin.closed() !== null);
    expect(origin.closed()).toBe(4403);
    expect((await deck(s, { Origin: 'http://localhost:5173', Host: 'evil.example' })).status).toBe(403);
  });

  it('no active playthrough gives deck_nosave', async () => {
    const s = await start({ prepare: (c) => (c.autoPlaythrough = false) });
    const d = await deck(s);
    d.send({ type: 'deck_open' });
    await until(() => d.of('deck_nosave').length > 0);
  });

  it('deck_open lists the minded contacts you know, the start contact first', async () => {
    const s = await start();
    const first = s.built.world.active()!.startContact;
    const other = first === 'nix' ? 'cass' : 'nix';
    await turn(s, other); // met them
    const d = await deck(s);
    d.send({ type: 'deck_open' });
    await until(() => d.of('deck_threads').length > 0);
    const [t] = d.of('deck_threads');
    expect(t.start).toBe(first);
    // The mindless one isn't listed.
    expect(t.threads.map((x) => x.id)).toEqual([first, other]);
    expect(t.threads[0]).toMatchObject({ name: expect.any(String), accent: expect.any(String), pronoun: expect.any(String), last: null });
  });

  it('deck_send stores the texts and streams typing, then rows; you never move', async () => {
    const s = await start();
    const first = s.built.world.active()!.startContact;
    const other = first === 'nix' ? 'cass' : 'nix';
    await turn(s, other); // you're with the other one
    const before = s.built.world.active()!;
    const d = await deck(s);
    d.send({ type: 'deck_send', contact: first, text: 'you on shift?' });
    await until(() => d.of('deck_rows').some((e) => e.rows.some((r) => r.role === 'agent' && r.status === 'ok')));
    expect(d.of('deck_typing')[0]).toEqual({ type: 'deck_typing', contact: first, on: true });
    await until(() => d.of('deck_typing').some((e) => !e.on));
    // The header comes again with the story time the text moved to.
    await until(() => d.of('deck_thread').some((e) => e.contact === first && e.rows.length === 2));
    expect(d.of('deck_thread').at(-1)!.header.time).toBe(formatClock(s.built.world.clockNow()!));
    const nix = (await s.built.runtime(first))!;
    expect(nix.db.recentMessages(before.player, 10, 'text').map((m) => [m.role, m.text])).toEqual([
      ['user', 'you on shift?'],
      ['agent', 'till four\nroof. 4:15'],
    ]);
    const after = s.built.world.active()!;
    expect(after.location).toEqual(before.location);
    expect(after.solo ?? false).toBe(before.solo ?? false);
    expect(after.parted ?? {}).toEqual(before.parted ?? {});
  });

  it('two deck sockets both get the rows; room tabs get no text events', async () => {
    const s = await start();
    const first = s.built.world.active()!.startContact;
    const other = first === 'nix' ? 'cass' : 'nix';
    const { ws: room } = await turn(s, first);
    const heard: { type: string; message?: { mode?: string }; messageId?: string }[] = [];
    room.on('message', (m) => heard.push(JSON.parse(String(m))));
    await turn(s, other); // walk to the other, so the first isn't beside you
    const a = await deck(s);
    const b = await deck(s);
    a.send({ type: 'deck_send', contact: first, text: 'hey' });
    await until(() => b.of('deck_rows').some((e) => e.rows.some((r) => r.role === 'agent' && r.status === 'ok')));
    // Her room reply's own deltas can still be arriving: only a text's would be wrong here.
    const textIds = new Set((await s.built.runtime(first))!.db.recentMessages(s.built.world.active()!.player, 10, 'text').map((m) => m.id));
    expect(textIds.size).toBe(2);
    expect(heard.some((e) => (e.type === 'message' && e.message?.mode === 'text') || (e.type === 'nix_delta' && textIds.has(e.messageId ?? '')))).toBe(false);
  });

  it('with them in the save: readOnly here, and a send is refused with-them', async () => {
    const s = await start();
    await turn(s, 'nix');
    const d = await deck(s);
    d.send({ type: 'deck_thread', contact: 'nix' });
    await until(() => d.of('deck_thread').length > 0);
    expect(d.of('deck_thread')[0].readOnly).toBe('here');
    d.send({ type: 'deck_send', contact: 'nix', text: 'hi' });
    await until(() => d.of('deck_error').length > 0);
    expect(d.of('deck_error')[0]).toEqual({ type: 'deck_error', contact: 'nix', error: 'with-them' });
  });

  it('STEP OUT: her goodbye in the scene, then you are on your own and the thread opens', async () => {
    const s = await start();
    const { rt } = await turn(s, 'nix');
    const player = s.built.world.active()!.player;
    const d = await deck(s);
    d.send({ type: 'deck_thread', contact: 'nix' });
    await until(() => d.of('deck_thread').length > 0);
    d.send({ type: 'deck_step_out', contact: 'nix' });
    await until(() => d.of('deck_thread').some((e) => e.readOnly === null));
    expect(s.built.world.active()!.solo).toBe(true);
    // Her goodbye is a scene line (an END row that walks out, and her reply), never a text.
    const scene = rt.db.recentMessages(player, 10, 'scene');
    expect(scene.find((m) => m.role === 'user' && m.mode === 'end')?.leave).toBe(true);
    expect(scene.at(-1)).toMatchObject({ role: 'agent', status: 'ok' });
    expect(rt.db.recentMessages(player, 10, 'text')).toEqual([]);
    expect(d.of('deck_typing').map((e) => e.on)).toEqual([true, false]);
  });

  it("STEP OUT when you're not with them is refused", async () => {
    const s = await start();
    const first = s.built.world.active()!.startContact;
    const other = first === 'nix' ? 'cass' : 'nix';
    await turn(s, other);
    const d = await deck(s);
    d.send({ type: 'deck_step_out', contact: first });
    await until(() => d.of('deck_error').length > 0);
    expect(d.of('deck_error')[0]).toEqual({ type: 'deck_error', contact: first, error: 'not-with-them' });
    expect(s.built.world.active()!.location?.contactId).toBe(other);
  });

  it('on comms with them: readOnly call', async () => {
    const s = await start();
    const { rt } = await turn(s, 'nix');
    rt.db.setMeta(commsKey(s.built.world.active()!.player), JSON.stringify({ on: true, at: 'karasu/noodle-stall' }));
    const d = await deck(s);
    d.send({ type: 'deck_thread', contact: 'nix' });
    await until(() => d.of('deck_thread').length > 0);
    expect(d.of('deck_thread')[0].readOnly).toBe('call');
  });

  it("a text waiting on her room reply isn't sent once that reply puts you with her (final review #6)", async () => {
    const s = await start({ hold: true });
    const cass = (await s.built.runtime('cass'))!;
    // Cass's room reply is held, so her relay is busy; when it ends you're with her.
    const room = new WebSocket(`ws://127.0.0.1:${s.port}/ws/cass?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
    room.on('error', () => {});
    cleanups.push(() => room.close());
    await new Promise<void>((r) => room.on('open', () => r()));
    room.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
    await until(() => cass.relay.busy);
    const d = await deck(s);
    d.send({ type: 'deck_send', contact: 'cass', text: 'quick one', localId: 'L1' });
    await until(() => d.of('deck_typing').length > 0);
    s.release();
    await until(() => d.of('deck_error').length > 0, 5000);
    expect(d.of('deck_error')[0]).toEqual({ type: 'deck_error', contact: 'cass', error: 'with-them', localId: 'L1' });
    expect(cass.db.recentMessages(s.built.world.active()!.player, 10, 'text')).toEqual([]);
  });

  it('WAIT past a promise: her text lands, stamped at the minute it came due (promised texts spec §5)', async () => {
    const s = await start();
    const first = s.built.world.active()!.startContact;
    const other = first === 'nix' ? 'cass' : 'nix';
    await turn(s, other); // you're with the other one, not her
    const her = (await s.built.runtime(first))!;
    const player = s.built.world.active()!.player;
    const now = s.built.world.clockNow()!;
    her.db.withStamp({ messageId: 'earlier', take: 0 }, () => her.db.setMeta(`promise.${player}`, JSON.stringify({ when: { at: now + 30 }, about: 'about tonight', from: 'earlier', since: now })));
    s.built.world.wait({ minutes: 60 });
    await until(() => her.db.recentMessages(player, 10, 'text').some((m) => m.role === 'agent' && m.status === 'ok'), 5000);
    const rows = her.db.recentMessages(player, 10, 'text');
    expect(rows.map((m) => [m.role, m.clock, m.promised ?? false])).toEqual([
      ['user', now + 30, true],
      ['agent', now + 30, false],
    ]);
    expect(her.db.getMeta(`promise.${player}`)).toBeNull();
    // Another clock move sends nothing more.
    s.built.world.wait({ minutes: 10 });
    await new Promise((r) => setTimeout(r, 300));
    expect(her.db.recentMessages(player, 10, 'text')).toHaveLength(2);
  });

  it('a promised text is unread until you open her thread; the room tab hears it (promised texts spec §6)', async () => {
    const s = await start();
    const first = s.built.world.active()!.startContact;
    const other = first === 'nix' ? 'cass' : 'nix';
    const { ws: room } = await turn(s, other);
    const heard: { type: string; from?: { id: string }[] }[] = [];
    room.on('message', (m) => heard.push(JSON.parse(String(m))));
    const her = (await s.built.runtime(first))!;
    const player = s.built.world.active()!.player;
    const now = s.built.world.clockNow()!;
    her.db.withStamp({ messageId: 'earlier', take: 0 }, () => her.db.setMeta(`promise.${player}`, JSON.stringify({ when: { at: now + 30 }, about: 'about tonight', from: 'earlier', since: now })));
    s.built.world.wait({ minutes: 60 });
    await until(() => heard.some((e) => e.type === 'texts_unread' && (e.from ?? []).some((f) => f.id === first)), 5000);
    const d = await deck(s);
    d.send({ type: 'deck_open' });
    await until(() => d.of('deck_threads').length > 0);
    const t = d.of('deck_threads').at(-1)!;
    expect(t.threads.find((x) => x.id === first)?.unread).toBe(true);
    // A new tab joining hears it too.
    const late = new WebSocket(`ws://127.0.0.1:${s.port}/ws/${other}?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
    const lateHeard: { type: string; from?: { id: string }[] }[] = [];
    late.on('message', (m) => lateHeard.push(JSON.parse(String(m))));
    late.on('error', () => {});
    cleanups.push(() => late.close());
    await until(() => lateHeard.some((e) => e.type === 'texts_unread' && (e.from ?? []).length === 1));
    // Opening her thread reads it.
    d.send({ type: 'deck_thread', contact: first });
    await until(() => heard.some((e) => e.type === 'texts_unread' && (e.from ?? []).length === 0));
    d.send({ type: 'deck_open' });
    await until(() => d.of('deck_threads').length > 1);
    expect(d.of('deck_threads').at(-1)!.threads.find((x) => x.id === first)?.unread).toBe(false);
  });

  describe('controls (deck controls spec §2)', () => {
    async function texted(s: S) {
      const first = s.built.world.active()!.startContact;
      const other = first === 'nix' ? 'cass' : 'nix';
      await turn(s, other);
      const d = await deck(s);
      const her = (await s.built.runtime(first))!;
      const player = s.built.world.active()!.player;
      d.send({ type: 'deck_send', contact: first, text: 'one' });
      await until(() => her.db.recentMessages(player, 10, 'text').filter((m) => m.role === 'agent' && m.status === 'ok').length === 1);
      d.send({ type: 'deck_send', contact: first, text: 'two' });
      await until(() => her.db.recentMessages(player, 10, 'text').filter((m) => m.role === 'agent' && m.status === 'ok').length === 2 && !her.relay.busy);
      const rows = () => her.db.recentMessages(player, 10, 'text');
      return { d, first, her, player, rows };
    }

    it('deck_regen gives her a new take; deck_swipe shows the other', async () => {
      const s = await start();
      const { d, first, rows } = await texted(s);
      const reply = rows().at(-1)!;
      d.send({ type: 'deck_regen', contact: first, messageId: reply.id });
      await until(() => rows().at(-1)!.takes?.count === 2);
      d.send({ type: 'deck_swipe', contact: first, messageId: reply.id, index: 0 });
      await until(() => rows().at(-1)!.takes?.index === 0);
      await until(() => d.of('deck_thread').some((e) => e.rows.at(-1)?.takes?.index === 0));
    });

    it('deck_edit edits your text and she replies again', async () => {
      const s = await start();
      const { d, first, rows } = await texted(s);
      const mine = rows().at(-2)!;
      d.send({ type: 'deck_edit', contact: first, messageId: mine.id, text: 'TWO' });
      await until(() => rows().at(-2)!.text === 'TWO' && rows().at(-1)!.takes?.count === 2);
    });

    it('deck_delete cuts this text and later ones', async () => {
      const s = await start();
      const { d, first, rows } = await texted(s);
      d.send({ type: 'deck_delete', contact: first, messageId: rows()[2].id });
      await until(() => rows().length === 2);
      expect(rows().map((m) => m.text)).toEqual(['one', 'till four\nroof. 4:15']);
    });

    it("a scene row can't be touched from the deck", async () => {
      const s = await start();
      const { d, first, her, player } = await texted(s);
      her.db.insertMessage(player, { id: 'scene-row', role: 'user', text: 'in the room', toolLines: [], ts: Date.now(), status: 'ok' });
      const scene = her.db.getMessage(player, 'scene-row')!;
      d.send({ type: 'deck_delete', contact: first, messageId: scene.id });
      await until(() => d.of('deck_error').length > 0);
      expect(her.db.getMessage(player, scene.id)).toBeDefined();
    });
  });

  it('a playthrough switch pushes fresh threads', async () => {
    const s = await start();
    const d = await deck(s);
    d.send({ type: 'deck_open' });
    await until(() => d.of('deck_threads').length === 1);
    const pt = s.built.world.active()!;
    const next = pt.startContact === 'nix' ? 'cass' : 'nix';
    s.built.world.create(pt.player, next);
    await until(() => d.of('deck_threads').length === 2);
    expect(d.of('deck_threads')[1].start).toBe(next);
  });
});
