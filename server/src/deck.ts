/**
 * The deck (spec 2026-10-23 §5): texting your contacts from your phone. Its own socket, not a room hub's, so
 * opening it never enters a room; every open deck hears the same threads.
 */
import { photoPreview } from '../../shared/photos';
import type { WebSocket } from 'ws';
import { formatClock } from '../../shared/clock';
import type { Pronoun } from '../../shared/pronoun';
import type { ChatMessage, ContactEntry, DeckClientEvent, DeckHeader, DeckReadOnly, DeckServerEvent, DeckThread, ServerEvent } from '../../shared/types';
import { deckReadKey } from '../../shared/promise';
import type { AgentRuntime } from './runtime';
import type { World } from './world';

/** A thread opens with this many of its newest rows. */
export const DECK_THREAD_ROWS = 60;
/** A text to someone mid-reply waits this long for her, then gives up as busy (Review Focus 2). */
export const DECK_WAIT_MS = 120_000;
const DECK_POLL_MS = 250;

export interface DeckDeps {
  world: World;
  runtime(id: string): Promise<AgentRuntime | null>;
  /** Whether this contact has a mind (a mindless one can't text back). */
  minded(id: string): boolean;
  pronoun(id: string): Pronoun;
  /** The map's name for a scene. */
  placeName(sceneId: string): string;
  /** Her newest text with `player`, read without starting her runtime (final review #9); absent: through the runtime. */
  lastText?: (contact: string, player: string) => ChatMessage | undefined;
  /** One meta value from her db (her read mark), without starting her; absent: nothing has been read. */
  meta?: (contact: string, key: string) => string | null;
  /** Who has texted you unseen changed (promised texts spec §6): the room tabs' HUD hears it. */
  onUnread?: (from: { id: string; name: string }[]) => void;
  waitMs?: number;
  pollMs?: number;
}

export interface Deck {
  attach(socket: WebSocket): void;
  /** A text turn's event from `contact`'s relay (runtime opts.onText). */
  onText(contact: string, e: ServerEvent, player: string): void;
  /** `contact`'s rows changed some other way (a rewind cut texts): re-send that thread to whoever has it open. */
  touched(contact: string): void;
  /** The world changed (a LOAD, a new playthrough): every deck gets fresh threads. */
  refresh(): void;
  /** Who has texted you unseen. */
  unread(): Promise<{ id: string; name: string }[]>;
  /** The same, at once (a room tab joining): from her last texts as the database has them. */
  unreadNow(): { id: string; name: string }[];
  /** Her promised text (promised texts spec §5), on her queue like any text; true once it's sent. */
  promised(contact: string, o: { about: string; due: number; where: string; place: string; from: string }): Promise<boolean>;
}

interface Client {
  ws: WebSocket;
  open: string | null;
}

/** The thread list's line for a text: her last bubble, or PHOTO · her words when she sent a photo (photos spec §5). */
const lastBubble = (m: ChatMessage) => (/\[\s*photo\s*:/i.test(m.text) ? photoPreview(m.text) : (m.text.split('\n').filter((l) => l.trim() !== '').at(-1) ?? ''));

export function createDeck(deps: DeckDeps): Deck {
  const clients = new Set<Client>();
  const waitMs = deps.waitMs ?? DECK_WAIT_MS;
  const pollMs = deps.pollMs ?? DECK_POLL_MS;

  const send = (c: Client, e: DeckServerEvent) => {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(e));
  };
  const all = (e: DeckServerEvent) => {
    for (const c of clients) send(c, e);
  };

  /** The minded contacts you know in the active playthrough. */
  const known = (): ContactEntry[] => deps.world.contacts().filter((c) => deps.minded(c.id));

  /** Her newest shown text with `player` (a promised text's hidden line never counts). */
  async function newestText(id: string, player: string): Promise<ChatMessage | undefined> {
    if (deps.lastText) return deps.lastText(id, player);
    return (await deps.runtime(id))?.db.recentMessages(player, 5, 'text').filter((m) => !m.promised).at(-1);
  }
  /** Her newest text is hers, and the deck hasn't shown it to you (promised texts spec §6). */
  // The mark is how far you've read (a row's ts), so a rewind back past it leaves older texts read (final review I1).
  const readTo = (id: string, player: string) => Number(deps.meta?.(id, deckReadKey(player)) ?? NaN);
  const isUnread = (id: string, player: string, newest: ChatMessage | undefined) => {
    if (newest?.role !== 'agent' || newest.status !== 'ok') return false;
    const mark = readTo(id, player);
    return Number.isNaN(mark) || newest.ts > mark;
  };

  async function unreadFrom(): Promise<{ id: string; name: string }[]> {
    const pt = deps.world.active();
    if (!pt) return [];
    const out: { id: string; name: string }[] = [];
    for (const c of known()) if (isUnread(c.id, pt.player, await newestText(c.id, pt.player))) out.push({ id: c.id, name: c.name });
    return out;
  }
  // Unknown at start (a restart): the first count always goes out (final review I2).
  let lastUnread = '';
  async function notifyUnread(): Promise<void> {
    try {
      const from = await unreadFrom();
      const key = JSON.stringify(from);
      if (key === lastUnread) return;
      lastUnread = key;
      deps.onUnread?.(from);
    } catch (err) {
      console.warn(`[deck] unread: ${(err as Error).message}`);
    }
  }

  async function threads(): Promise<DeckServerEvent> {
    const pt = deps.world.active();
    if (!pt) return { type: 'deck_nosave' };
    const list: (DeckThread & { status: ContactEntry['status'] })[] = [];
    for (const c of known()) {
      const newest = await newestText(c.id, pt.player);
      const last = newest && newest.clock !== undefined ? { text: lastBubble(newest), clock: newest.clock, mine: newest.role === 'user' } : null;
      list.push({ id: c.id, name: c.name, accent: c.accent, portrait: c.portrait, pronoun: deps.pronoun(c.id), last, unread: isUnread(c.id, pt.player, newest), status: c.status });
    }
    // The start contact pinned first, then anyone who texted you unseen, then the newest text, then by name.
    list.sort(
      (a, b) =>
        Number(b.status === 'start') - Number(a.status === 'start') || Number(b.unread) - Number(a.unread) || (b.last?.clock ?? -1) - (a.last?.clock ?? -1) || a.name.localeCompare(b.name),
    );
    return { type: 'deck_threads', threads: list.map(({ status: _s, ...t }) => t), start: pt.startContact ?? null };
  }

  function readOnly(contact: string, rt: AgentRuntime): DeckReadOnly {
    const pt = deps.world.active();
    if (!pt || pt.solo || pt.location?.contactId !== contact) return null;
    return rt.relay.commsNow(pt.player)?.on ? 'call' : 'here';
  }

  /** Where she is now, by the map's name (her room's scene when the world can't say). */
  function placeOf(c: ContactEntry): string {
    const where = deps.world.whereNow(c.id);
    return where ? deps.placeName(where) : c.placeName;
  }

  function header(c: ContactEntry): DeckHeader {
    const pt = deps.world.active();
    const now = deps.world.clockNow();
    return { place: placeOf(c), tail: c.planTail ?? null, time: now === null ? null : formatClock(now), weather: pt?.weather?.weather ?? null };
  }

  async function thread(contact: string): Promise<DeckServerEvent | null> {
    const pt = deps.world.active();
    if (!pt) return { type: 'deck_nosave' };
    const c = known().find((k) => k.id === contact);
    const rt = c ? await deps.runtime(contact) : null;
    if (!c || !rt) return null;
    // The line a promised text answers is never shown (promised texts spec §5).
    const rows = rt.db.recentMessages(pt.player, DECK_THREAD_ROWS, 'text').filter((m) => m.status !== 'streaming' && !m.promised);
    // On screen now: what's in it has been seen (promised texts spec §6).
    const seen = rows.at(-1);
    if (seen && !(Number(rt.db.getMeta(deckReadKey(pt.player)) ?? NaN) >= seen.ts)) rt.db.setMeta(deckReadKey(pt.player), String(seen.ts));
    void notifyUnread();
    return { type: 'deck_thread', contact, header: header(c), rows, readOnly: readOnly(contact, rt), typing: typing.has(contact) };
  }

  async function sendThreads(c: Client) {
    try {
      send(c, await threads());
    } catch (err) {
      console.warn(`[deck] threads: ${(err as Error).message}`);
    }
  }

  async function sendThread(c: Client, contact: string) {
    try {
      const e = await thread(contact);
      if (e) send(c, e);
      else send(c, { type: 'deck_error', contact, error: 'unknown' });
    } catch (err) {
      console.warn(`[deck] thread ${contact}: ${(err as Error).message}`);
    }
  }

  /** Waits for her relay to be free (a scene reply running), up to waitMs. */
  async function free(rt: AgentRuntime): Promise<boolean> {
    const t = Date.now();
    while (rt.relay.busy) {
      if (Date.now() - t >= waitMs) return false;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return true;
  }

  // One text at a time per contact, in the order sent (final review I2): a second text waits for her first reply.
  const queues = new Map<string, Promise<unknown>>();
  // typing… shows from the first text queued until the last is answered.
  const typing = new Map<string, number>();
  const typingStep = (contact: string, by: 1 | -1) => {
    const n = (typing.get(contact) ?? 0) + by;
    if (n <= 0) typing.delete(contact);
    else typing.set(contact, n);
    if ((by === 1 && n === 1) || n <= 0) all({ type: 'deck_typing', contact, on: n > 0 });
  };

  type Run = (rt: AgentRuntime, player: string, place: string) => Promise<{ ok: boolean; error?: string }>;

  /**
   * Queues `run` for `contact` (one at a time, in order). A text needs you apart; STEP OUT (`together`) needs you
   * with them, and leaves you on your own once her goodbye is in.
   */
  /** `quiet`: a control that writes nothing of hers (DELETE, a swipe) shows no typing… (final review #5). */
  function text(c: Client | null, contact: string, localId: string | undefined, run: Run, together = false, quiet = false): Promise<boolean> {
    const wrongPlace = (rt: AgentRuntime) => (together ? readOnly(contact, rt) === null : readOnly(contact, rt) !== null);
    const wrongWhy = together ? 'not-with-them' : 'with-them';
    const fail = (error: string): false => {
      // A promised text (no client) that can't go is hers, not yours: logged, never shown as your error (mid review M1).
      if (c === null) console.warn(`[deck] promised text from ${contact} not sent: ${error}`);
      else all({ type: 'deck_error', contact, error, ...(localId ? { localId } : {}) });
      return false;
    };
    const prior = queues.get(contact) ?? Promise.resolve();
    if (!quiet) typingStep(contact, 1);
    const job = prior.then(async (): Promise<boolean> => {
      try {
        const pt = deps.world.active();
        if (!pt) {
          if (c) send(c, { type: 'deck_nosave' });
          return false;
        }
        if (!known().some((k) => k.id === contact)) return fail('unknown');
        const first = await deps.runtime(contact);
        if (!first) return fail('unknown');
        if (wrongPlace(first)) return fail(wrongWhy);
        if (!(await free(first))) return fail('busy');
        // The world may have moved on while it waited (final review I3, #6): a LOAD, or you walked in on her.
        const now = deps.world.active();
        if (!now || now.id !== pt.id) return fail('save-changed');
        const entry = known().find((k) => k.id === contact);
        const rt = entry ? await deps.runtime(contact) : null;
        if (!entry || !rt) return fail('unknown');
        if (wrongPlace(rt)) return fail(wrongWhy);
        const r = await run(rt, now.player, placeOf(entry));
        if (!r.ok) return fail(r.error ?? 'failed');
        // Her goodbye is in: you walk out, as WALK OUT does (a call's HANG UP has already put you on your own).
        if (together && !deps.world.active()?.solo) deps.world.goSolo();
        return true;
      } catch (err) {
        console.warn(`[deck] text to ${contact}: ${(err as Error).message}`);
        return fail('failed');
      } finally {
        if (!quiet) typingStep(contact, -1);
        // With her thread open, the re-send below reads it first (final review M4: no flash for a reply you watched).
        if (![...clients].some((k) => k.open === contact)) void notifyUnread();
        // The list's last texts, and the open thread's header at the story time the text moved to.
        for (const k of clients) {
          void sendThreads(k);
          if (k.open === contact) void sendThread(k, contact);
        }
      }
    });
    const tail = job.catch(() => false);
    queues.set(contact, tail);
    void tail.then(() => {
      if (queues.get(contact) === tail) queues.delete(contact);
    });
    return tail;
  }

  function onMessage(c: Client, raw: string) {
    let e: DeckClientEvent;
    try {
      e = JSON.parse(raw) as DeckClientEvent;
    } catch {
      return;
    }
    if (!e || typeof e !== 'object') return;
    if (e.type === 'deck_open') {
      c.open = null;
      void sendThreads(c);
    } else if (e.type === 'deck_thread' && typeof e.contact === 'string') {
      c.open = e.contact;
      void sendThread(c, e.contact);
    } else if (e.type === 'deck_send' && typeof e.contact === 'string' && typeof e.text === 'string') {
      c.open = e.contact;
      text(c, e.contact, typeof e.localId === 'string' ? e.localId : undefined, (rt, player, place) => rt.relay.sendText(player, e.text, place));
    } else if ((e.type === 'deck_regen' || e.type === 'deck_swipe' || e.type === 'deck_edit' || e.type === 'deck_delete') && typeof e.contact === 'string' && typeof e.messageId === 'string') {
      c.open = e.contact;
      const id = e.messageId;
      const ev = e;
      text(
        c,
        e.contact,
        undefined,
        async (rt, player, place) => {
          // Texts only: the room's lines are the room's (deck controls spec §2).
          const row = rt.db.getMessage(player, id);
          if (row?.mode !== 'text' || row.promised) return { ok: false, error: 'unknown message' };
          if (ev.type === 'deck_regen') return rt.relay.regenerate(player, id, place);
          if (ev.type === 'deck_swipe') return typeof ev.index === 'number' ? rt.relay.swipe(player, id, ev.index) : { ok: false, error: 'bad' };
          if (ev.type === 'deck_edit') return typeof ev.text === 'string' ? rt.relay.editText(player, id, ev.text, place) : { ok: false, error: 'bad' };
          return rt.relay.deleteTexts(player, id);
        },
        false,
        ev.type === 'deck_swipe' || ev.type === 'deck_delete',
      );
    } else if (e.type === 'deck_step_out' && typeof e.contact === 'string') {
      c.open = e.contact;
      text(c, e.contact, undefined, (rt, player) => rt.relay.send(player, '', 'end', { leave: true }), true);
    } else if (e.type === 'deck_retry' && typeof e.contact === 'string' && typeof e.messageId === 'string') {
      const id = e.messageId;
      text(c, e.contact, undefined, async (rt, player, place) => {
        // Only a failed text of yours is retried here: the room's RETRY is the room's.
        const row = rt.db.getMessage(player, id);
        if (row?.mode !== 'text' || row.role !== 'user' || row.status !== 'failed') return { ok: false, error: 'unknown message' };
        return rt.relay.retry(player, id, place);
      });
    }
  }

  return {
    attach(ws) {
      const c: Client = { ws, open: null };
      clients.add(c);
      ws.on('message', (d) => onMessage(c, String(d)));
      ws.on('close', () => clients.delete(c));
    },
    onText(contact, e) {
      // Rows only: the deck shows a text whole (typing…, then the bubbles), never word by word.
      if (e.type === 'message' && e.message.mode === 'text' && e.message.status !== 'streaming' && !e.message.promised) all({ type: 'deck_rows', contact, rows: [e.message] });
      else if (e.type === 'messages_removed') this.touched(contact);
    },
    touched(contact) {
      for (const c of clients) if (c.open === contact) void sendThread(c, contact);
    },
    unread: unreadFrom,
    unreadNow() {
      const pt = deps.world.active();
      if (!pt || !deps.lastText) return [];
      return known()
        .filter((c) => isUnread(c.id, pt.player, deps.lastText!(c.id, pt.player)))
        .map((c) => ({ id: c.id, name: c.name }));
    },
    promised(contact, o) {
      return text(null, contact, undefined, (rt, player) => rt.relay.sendPromised(player, { ...o, place: o.place }));
    },
    refresh() {
      lastUnread = '';
      void notifyUnread();
      for (const c of clients) {
        void sendThreads(c);
        if (c.open) void sendThread(c, c.open);
      }
    },
  };
}
