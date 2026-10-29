import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createDeck, type DeckDeps } from '../src/deck';
import type { ContactEntry, DeckServerEvent, PlaythroughInfo } from '../../shared/types';
import type { AgentRuntime } from '../src/runtime';
import type { World } from '../src/world';

// The deck server's races, with fakes (final review I2, I3).
const NIX: ContactEntry = { id: 'nix', name: 'Nix', accent: '#ff4f8b', portrait: null, status: 'start', sceneId: 'karasu/intake', placeName: 'the Intake', timeOfDay: null, lastLine: null } as ContactEntry;

function setup(o: { busyFor?: number; sendText?: (text: string) => Promise<{ ok: boolean; error?: string }>; runtime?: () => Promise<AgentRuntime | null>; lastText?: DeckDeps['lastText']; contacts?: ContactEntry[] } = {}) {
  let pt = { id: 'pt-1', player: 'hicks', startContact: 'nix', location: null, solo: true } as unknown as PlaythroughInfo;
  const sent: string[] = [];
  let busyUntil = Date.now() + (o.busyFor ?? 0);
  const relay = {
    get busy() {
      return Date.now() < busyUntil;
    },
    commsNow: () => null,
    sendText: vi.fn(async (_p: string, text: string) => {
      sent.push(text);
      return o.sendText ? o.sendText(text) : { ok: true };
    }),
    retry: vi.fn(async () => ({ ok: true })),
  };
  const rt = { relay, db: { recentMessages: () => [], getMessage: () => undefined } } as unknown as AgentRuntime;
  const world = { active: () => pt, contacts: () => o.contacts ?? [NIX], whereNow: () => null, clockNow: () => 1200 } as unknown as World;
  const deps: DeckDeps = { world, runtime: o.runtime ?? (async () => rt), minded: () => true, pronoun: () => 'she', placeName: (s) => s, waitMs: 200, pollMs: 10, ...(o.lastText ? { lastText: o.lastText } : {}) };
  const deck = createDeck(deps);
  const ws = Object.assign(new EventEmitter(), { readyState: 1, OPEN: 1, out: [] as DeckServerEvent[], send(s: string) { this.out.push(JSON.parse(s)); } });
  deck.attach(ws as never);
  const client = (e: unknown) => ws.emit('message', JSON.stringify(e));
  return {
    deck, ws, client, relay, sent,
    setPt: (p: Partial<PlaythroughInfo>) => (pt = { ...pt, ...p }),
    setBusy: (ms: number) => (busyUntil = Date.now() + ms),
    of: <T extends DeckServerEvent['type']>(t: T) => ws.out.filter((e): e is Extract<DeckServerEvent, { type: T }> => e.type === t),
  };
}
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);
process.on('unhandledRejection', onUnhandled);
afterEach(() => {
  unhandled.length = 0;
});

describe('the deck server under load (final review I2, I3)', () => {
  it('two quick texts both go, in order; typing… stays on until the last is answered', async () => {
    let release!: () => void;
    const first = new Promise<void>((r) => (release = r));
    const s = setup({ sendText: async (t) => (t === 'hey' ? (await first, { ok: true }) : { ok: true }) });
    s.client({ type: 'deck_send', contact: 'nix', text: 'hey', localId: 'L1' });
    s.client({ type: 'deck_send', contact: 'nix', text: 'you there?', localId: 'L2' });
    await settle(50);
    expect(s.sent).toEqual(['hey']);
    release();
    await settle();
    expect(s.sent).toEqual(['hey', 'you there?']);
    expect(s.of('deck_typing').map((e) => e.on)).toEqual([true, false]);
    expect(s.of('deck_error')).toEqual([]);
  });

  it('a text that waited too long comes back with its localId, so the deck can offer it again', async () => {
    const s = setup({ busyFor: 10_000 });
    s.client({ type: 'deck_send', contact: 'nix', text: 'hey', localId: 'L1' });
    await settle();
    expect(s.of('deck_error')).toEqual([{ type: 'deck_error', contact: 'nix', error: 'busy', localId: 'L1' }]);
    expect(s.sent).toEqual([]);
  });

  it('a LOAD while a text waits: it is not sent into the new save', async () => {
    const s = setup({ busyFor: 60 });
    s.client({ type: 'deck_send', contact: 'nix', text: 'hey', localId: 'L1' });
    await settle(20);
    s.setPt({ id: 'pt-2' });
    await settle();
    expect(s.sent).toEqual([]);
    expect(s.of('deck_error')[0]).toMatchObject({ error: 'save-changed', localId: 'L1' });
  });

  it('walking in on her while a text waits: it is not sent (final review #6)', async () => {
    const s = setup({ busyFor: 60 });
    s.client({ type: 'deck_send', contact: 'nix', text: 'hey', localId: 'L1' });
    await settle(20);
    s.setPt({ solo: false, location: { contactId: 'nix', sceneId: 'karasu/intake' } });
    await settle();
    expect(s.sent).toEqual([]);
    expect(s.of('deck_error')[0]).toMatchObject({ error: 'with-them', localId: 'L1' });
  });

  it('a throw in the send (a database closed by a LOAD) is a deck_error, never a crash', async () => {
    const s = setup({ sendText: async () => { throw new Error('database is not open'); } });
    s.client({ type: 'deck_send', contact: 'nix', text: 'hey', localId: 'L1' });
    await settle();
    expect(s.of('deck_error')[0]).toMatchObject({ error: 'failed', localId: 'L1' });
    expect(unhandled).toEqual([]);
  });

  it('a throw reading the threads is swallowed, never a crash', async () => {
    const s = setup({ runtime: async () => { throw new Error('boom'); } });
    s.client({ type: 'deck_open' });
    s.client({ type: 'deck_thread', contact: 'nix' });
    await settle();
    expect(unhandled).toEqual([]);
  });

  it("a thread opened while a text waits says typing… (a deck that reconnected missed the first word) (#5)", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const s = setup({ sendText: async () => (await held, { ok: true }) });
    s.client({ type: 'deck_send', contact: 'nix', text: 'hey', localId: 'L1' });
    await settle(30);
    s.client({ type: 'deck_thread', contact: 'nix' });
    await settle(30);
    expect(s.of('deck_thread').at(-1)).toMatchObject({ typing: true });
    release();
    await settle();
    expect(s.of('deck_thread').at(-1)).toMatchObject({ typing: false });
  });

  it('a last text with a photo previews as PHOTO · her words (photos spec §5)', async () => {
    const s = setup({ runtime: vi.fn(async () => null), lastText: () => ({ id: 't', role: 'agent', text: 'on the roof\n[photo: roof]', toolLines: [], ts: 1, status: 'ok', mode: 'text', clock: 1300 }) });
    s.client({ type: 'deck_open' });
    await settle(50);
    expect(s.of('deck_threads')[0].threads[0].last).toEqual({ text: 'PHOTO · on the roof', clock: 1300, mine: false });
  });

  it("the thread list reads each contact's last text without starting her (#9)", async () => {
    const runtime = vi.fn(async () => null);
    const s = setup({ runtime, lastText: () => ({ id: 't', role: 'agent', text: 'yeah\nroof', toolLines: [], ts: 1, status: 'ok', mode: 'text', clock: 1300 }) });
    s.client({ type: 'deck_open' });
    await settle(50);
    expect(runtime).not.toHaveBeenCalled();
    expect(s.of('deck_threads')[0].threads[0].last).toEqual({ text: 'roof', clock: 1300, mine: false });
  });

  it('unread threads sort right after the start contact (promised texts spec §6)', async () => {
    const CASS = { ...NIX, id: 'cass', name: 'Cass', status: 'met' } as ContactEntry;
    const HICKS = { ...NIX, id: 'hicks2', name: 'Abe', status: 'met' } as ContactEntry;
    const s = setup({
      lastText: (id) => (id === 'cass' ? { id: 'c1', role: 'agent', text: 'home.', toolLines: [], ts: 1, status: 'ok', mode: 'text', clock: 1300 } : id === 'hicks2' ? { id: 'h1', role: 'user', text: 'yo', toolLines: [], ts: 2, status: 'ok', mode: 'text', clock: 1400 } : undefined),
      contacts: [NIX, HICKS, CASS],
    });
    s.client({ type: 'deck_open' });
    await settle(50);
    const t = s.of('deck_threads')[0].threads;
    expect(t.map((x) => [x.id, x.unread])).toEqual([['nix', false], ['cass', true], ['hicks2', false]]);
  });

  it("a promised text that can't go is logged, never shown as your error (mid review M1)", async () => {
    const s = setup({ busyFor: 10_000 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await s.deck.promised('nix', { about: 'x', due: 1200, where: "it's 20:00", place: 'home', from: 'p1' })).toBe(false);
    expect(s.of('deck_error')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});


describe('read marks (promised texts final review)', () => {
  const ROW = (id: string, ts: number, role: 'user' | 'agent') => ({ id, role, text: id, toolLines: [], ts, status: 'ok' as const, mode: 'text' as const, clock: 1000 + ts });
  function store(rows: ReturnType<typeof ROW>[]) {
    const meta = new Map<string, string>();
    let ts = 100;
    const relay = {
      busy: false,
      commsNow: () => null,
      sendText: vi.fn(async (_p: string, text: string) => {
        rows.push(ROW(`u${ts}`, ++ts, 'user'), ROW(`a${ts}`, ++ts, 'agent'));
        void text;
        return { ok: true };
      }),
    };
    const db = { recentMessages: (_p: string, n: number) => rows.slice(-n), getMessage: () => undefined, getMeta: (k: string) => meta.get(k) ?? null, setMeta: (k: string, v: string) => void meta.set(k, v) };
    const rt = { relay, db } as unknown as AgentRuntime;
    const pt = { id: 'pt-1', player: 'hicks', startContact: 'nix', location: null, solo: true } as unknown as PlaythroughInfo;
    const world = { active: () => pt, contacts: () => [NIX], whereNow: () => null, clockNow: () => 1200 } as unknown as World;
    const unread: { id: string }[][] = [];
    const deck = createDeck({
      world, runtime: async () => rt, minded: () => true, pronoun: () => 'she', placeName: (s) => s,
      lastText: () => rows.at(-1),
      meta: (_id, k) => meta.get(k) ?? null,
      onUnread: (from) => unread.push(from),
    });
    const ws = Object.assign(new EventEmitter(), { readyState: 1, OPEN: 1, out: [] as DeckServerEvent[], send(s: string) { this.out.push(JSON.parse(s)); } });
    deck.attach(ws as never);
    return { deck, unread, meta, rows, client: (e: unknown) => ws.emit('message', JSON.stringify(e)), out: ws.out };
  }

  it('a rewind past what you read leaves the older text read (final review I1)', async () => {
    const rows = [ROW('a1', 1, 'agent')];
    const s = store(rows);
    s.client({ type: 'deck_thread', contact: 'nix' });
    await settle(30);
    rows.push(ROW('u2', 2, 'user'), ROW('a3', 3, 'agent'));
    s.client({ type: 'deck_thread', contact: 'nix' });
    await settle(30);
    // A rewind cuts u2 and a3: her newest is a1 again, which you read long ago.
    rows.splice(1);
    expect(await s.deck.unread()).toEqual([]);
  });

  it('after a restart, reading her thread still tells the room tabs (final review I2)', async () => {
    const s = store([ROW('a1', 1, 'agent')]);
    s.client({ type: 'deck_thread', contact: 'nix' });
    await settle(30);
    expect(s.unread.at(-1)).toEqual([]);
  });

  it('a reply you watch arrive is never signalled as unread (final review M4)', async () => {
    const s = store([ROW('a1', 1, 'agent')]);
    s.client({ type: 'deck_thread', contact: 'nix' });
    await settle(30);
    s.client({ type: 'deck_send', contact: 'nix', text: 'hey', localId: 'L1' });
    await settle(100);
    expect(s.unread.some((u) => u.length > 0)).toBe(false);
  });

  it('the room tab on join gets the list right away, empty or not (final review I2)', () => {
    const s = store([ROW('a1', 1, 'agent')]);
    expect(s.deck.unreadNow()).toEqual([{ id: 'nix', name: 'Nix' }]);
  });

  it("DELETE and swipe don't show her typing (final review #5)", async () => {
    const s = store([ROW('a1', 1, 'agent')]);
    s.client({ type: 'deck_delete', contact: 'nix', messageId: 'a1' });
    await settle(60);
    expect(s.out.some((e) => e.type === 'deck_typing' && e.on)).toBe(false);
  });
});

