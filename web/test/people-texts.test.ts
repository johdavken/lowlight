import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDeckMemory, type DeckMemory } from '../src/deck/deck-client';
import type { ConnectDeck } from '../src/deck/deck-socket';
import { openPeople, type PeopleHandle, type PeopleTab } from '../src/room/people-screen';
import { hasThread, TEXTS_SETTLE_MS, textsDeck, textsOwnsTab, type TextsDeck } from '../src/room/people-texts';
import type { JournalView } from '../src/ui/journal';
import type { ChatMessage, ContactEntry, DeckClientEvent, DeckServerEvent, DeckThread } from '../../shared/types';

// TEXTS as PEOPLE's middle tab (2026-11-15): the real deck client on a fake socket, inside the real PEOPLE screen.
const thread = (o: Partial<DeckThread> & { id: string }): DeckThread => ({ name: o.id.toUpperCase(), accent: '#ff4f8b', portrait: null, pronoun: 'she', last: null, unread: false, ...o });
const row = (o: Partial<ChatMessage> & { id: string }): ChatMessage => ({ role: 'user', text: 'x', toolLines: [], ts: 1, status: 'ok', mode: 'text', ...o });
const contact = (o: Partial<ContactEntry> & { id: string }): ContactEntry => ({ name: o.id.charAt(0).toUpperCase() + o.id.slice(1), accent: '#ff4f8b', portrait: null, status: 'met', sceneId: 's', placeName: 'Somewhere', timeOfDay: null, lastLine: null, ...o });
const CONTACTS = [contact({ id: 'cass' }), contact({ id: 'nix' }), contact({ id: 'hae' })];
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document.activeElement ?? document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Past the list's rest: the thread it stopped on is asked for. */
const settled = () => new Promise((r) => setTimeout(r, TEXTS_SETTLE_MS + 20));

function fakeSocket() {
  const sent: DeckClientEvent[] = [];
  let onEvent: (e: DeckServerEvent) => void = () => {};
  let onStatus: (open: boolean) => void = () => {};
  const connect: ConnectDeck = vi.fn((ev, st) => {
    onEvent = ev;
    onStatus = st;
    return { send: (e: DeckClientEvent) => sent.push(e), close: vi.fn() };
  }) as unknown as ConnectDeck;
  return { connect, sent, server: (e: DeckServerEvent) => onEvent(e), status: (open: boolean) => onStatus(open) };
}
function fakeJournal() {
  const element = document.createElement('div');
  element.className = 'jd-root';
  return { element, busy: false, flashSave: vi.fn() } as unknown as JournalView;
}

let handle: PeopleHandle | null = null;
afterEach(() => {
  handle?.close(true);
  handle = null;
  document.body.replaceChildren();
});

/** PEOPLE with the deck made on demand, as main.ts does; the socket opens and lists Nix's and Cass's threads once it is. */
async function open(o: { tab?: PeopleTab; contact?: string; memory?: DeckMemory; kept?: TextsDeck | null; threads?: DeckThread[]; lateThreads?: boolean } = {}) {
  const sock = fakeSocket();
  const memory = o.memory ?? newDeckMemory();
  let kept: TextsDeck | null = o.kept ?? null;
  const made = vi.fn();
  const onClose = vi.fn();
  handle = openPeople(document.body, {
    tab: o.tab ?? 'texts',
    contacts: async () => CONTACTS,
    leads: async () => [],
    journal: fakeJournal(),
    current: 'nix',
    contact: o.contact ?? null,
    deck: () => {
      if (!kept) {
        made();
        kept = textsDeck(memory, sock.connect);
        // `lateThreads`: as in the room, where the socket opens and the list comes in after the deck is mounted.
        if (!o.lateThreads) arrive();
      }
      return kept;
    },
    kept: () => kept,
    memory,
    unread: () => [],
    dev: false,
    pick: vi.fn(),
    reducedMotion: true,
    onClose,
  });
  function arrive(): void {
    sock.status(true);
    sock.server({ type: 'deck_threads', threads: o.threads ?? [thread({ id: 'nix' }), thread({ id: 'cass' })], start: 'nix' });
  }
  await tick();
  return { ...sock, memory, made, onClose, arrive, deck: () => kept };
}
const threadFor = (s: { server(e: DeckServerEvent): void }, id: string, rows: ChatMessage[] = []) =>
  s.server({ type: 'deck_thread', contact: id, header: { place: 'ROOF', tail: null, time: null, weather: null }, rows, readOnly: null, typing: false });
const asked = (sent: DeckClientEvent[]) => sent.filter((e) => e.type === 'deck_thread').map((e) => (e as { contact: string }).contact);

describe("TEXTS, PEOPLE's middle tab", () => {
  it('FILE makes no deck and reads nothing; the first look at TEXTS makes it, on the pick', async () => {
    const s = await open({ tab: 'file' });
    key('ArrowUp');
    expect(s.made).not.toHaveBeenCalled();
    expect($('.tx-deck')).toBeNull();
    handle!.show('texts');
    expect(s.made).toHaveBeenCalledTimes(1);
    // Cass was picked (↑ from Nix): hers is the only thread asked for.
    expect(new Set(asked(s.sent))).toEqual(new Set(['cass']));
    expect($('.pe-right .tx-deck')).not.toBeNull();
    expect($('.pe-right .pe-name')!.textContent).toBe('CASS');
    expect($<HTMLElement>('.tx-deck')!.style.getPropertyValue('--who')).toBe('"CASS"');
  });

  it("the list picks the thread: ↑ / ↓ from the box open theirs, and the deck's own list and head stay in the markup, hidden by its look", async () => {
    const s = await open({ contact: 'cass' });
    threadFor(s, 'cass', [row({ id: 'm1', text: 'you up?' })]);
    const box = $<HTMLTextAreaElement>('.tx-deck .dk-box')!;
    expect(document.activeElement).toBe(box);
    s.sent.length = 0;
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect($('.pe-tile.on')!.dataset.id).toBe('nix');
    // Not yet: the list may still be moving, and Cass's thread is out of sight meanwhile (nothing typed lands in it).
    expect(asked(s.sent)).toEqual([]);
    expect($<HTMLElement>('.tx-deck')!.style.visibility).toBe('hidden');
    await settled();
    expect(asked(s.sent)).toEqual(['nix']);
    expect($<HTMLElement>('.tx-deck')!.style.visibility).toBe('');
    expect($('.tx-deck')!.classList.contains('dk-holo')).toBe(true);
  });

  it('walking the list past someone reads nobody on the way: only where it rests is asked for', async () => {
    const s = await open({ contact: 'cass', threads: [thread({ id: 'cass' }), thread({ id: 'nix' }), thread({ id: 'hae' })] });
    threadFor(s, 'cass');
    s.sent.length = 0;
    key('ArrowDown');
    key('ArrowDown');
    expect($('.pe-tile.on')!.dataset.id).toBe('hae');
    await settled();
    expect(asked(s.sent)).toEqual(['hae']);
  });

  it('↑ / ↓ with a draft in the box are the box\'s (a wrapped line, a selection): the list stays', async () => {
    const s = await open({ contact: 'cass' });
    threadFor(s, 'cass');
    const box = $<HTMLTextAreaElement>('.tx-deck .dk-box')!;
    box.value = 'a line long enough to wrap';
    s.sent.length = 0;
    expect(key('ArrowDown', {}, box).defaultPrevented).toBe(false);
    expect($('.pe-tile.on')!.dataset.id).toBe('cass');
    box.value = '';
    expect(key('ArrowDown', { shiftKey: true }, box).defaultPrevented).toBe(false);
    expect($('.pe-tile.on')!.dataset.id).toBe('cass');
    await settled();
    expect(asked(s.sent)).toEqual([]);
  });

  it("the first look at TEXTS on someone with no number reads nobody else's texts when the list comes in", async () => {
    const s = await open({ contact: 'hae', lateThreads: true });
    expect(s.made).toHaveBeenCalledTimes(1);
    s.arrive();
    await tick();
    // Hae has no thread: nothing but hers was ever asked for, and the deck is put away.
    expect(asked(s.sent).filter((c) => c !== 'hae')).toEqual([]);
    expect(s.sent[s.sent.length - 1]).toEqual({ type: 'deck_open' });
    expect($('.pe-right .pe-nonum')).not.toBeNull();
    expect(s.memory.open).toBeNull();
  });

  it('with no box (the one you are with, read-only), typing and Alt chords still never reach the room', async () => {
    const room = vi.fn();
    window.addEventListener('keydown', room);
    const s = await open({ contact: 'nix' });
    s.server({ type: 'deck_thread', contact: 'nix', header: { place: 'HERE', tail: null, time: null, weather: null }, rows: [], readOnly: 'here', typing: false });
    expect($('.tx-deck .dk-box')).toBeNull();
    key('h', {}, document.body);
    key('e', { altKey: true, code: 'KeyE' }, document.body);
    window.removeEventListener('keydown', room);
    expect(room).not.toHaveBeenCalled();
    expect($('.people-screen')).not.toBeNull();
  });

  it('leaving the tab, or closing, puts the deck away (nothing more is read); coming back asks for the thread again', async () => {
    const s = await open({ contact: 'cass' });
    threadFor(s, 'cass');
    s.sent.length = 0;
    handle!.show('file');
    expect(s.sent).toEqual([{ type: 'deck_open' }]);
    handle!.show('texts');
    expect(asked(s.sent)).toEqual(['cass']);
    // The thread it held comes back as it was, not a blank column.
    expect($('.tx-deck .dk-thread')).not.toBeNull();
    s.sent.length = 0;
    handle!.close(true);
    expect(s.sent).toEqual([{ type: 'deck_open' }]);
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it("someone with no number: their line, not another's thread, and the deck is put away", async () => {
    const s = await open({ contact: 'cass' });
    threadFor(s, 'cass');
    s.sent.length = 0;
    $('.pe-tile[data-id="hae"]')!.click();
    expect(hasThread(s.memory, 'hae')).toBe(false);
    expect($('.pe-right .pe-nonum')!.textContent).toBe('No number for Hae yet.');
    expect($('.pe-right .tx-deck')).toBeNull();
    expect(asked(s.sent)).toEqual([]);
    expect(s.sent).toEqual([{ type: 'deck_open' }]);
  });

  it('Esc closes the top thing first (PASS TIME), then PEOPLE; none of it reaches the room', async () => {
    const room = vi.fn();
    window.addEventListener('keydown', room);
    const s = await open({ contact: 'cass' });
    threadFor(s, 'cass');
    $<HTMLElement>('.tx-deck .dk-clock')!.click();
    expect($('.tx-deck .dk-sheet')).not.toBeNull();
    expect(key('Escape').defaultPrevented).toBe(true);
    expect($('.tx-deck .dk-sheet')).toBeNull();
    expect($('.people-screen')).not.toBeNull();
    key('Escape');
    expect($('.people-screen')).toBeNull();
    window.removeEventListener('keydown', room);
    expect(room).not.toHaveBeenCalled();
  });

  it('← / → turn the tab only while the box is empty; a letter typed outside the box goes to it; typing never reaches the room', async () => {
    const room = vi.fn();
    window.addEventListener('keydown', room);
    const s = await open({ contact: 'cass' });
    threadFor(s, 'cass');
    const box = $<HTMLTextAreaElement>('.tx-deck .dk-box')!;
    box.value = 'hold on';
    expect(key('ArrowLeft', {}, box).defaultPrevented).toBe(false);
    expect(handle!.tab).toBe('texts');
    key('h', {}, box);
    expect(room).not.toHaveBeenCalled();
    box.blur();
    key('h', {}, document.body);
    expect(document.activeElement).toBe(box);
    box.value = '';
    expect(key('ArrowLeft', {}, box).defaultPrevented).toBe(true);
    expect(handle!.tab).toBe('file');
    window.removeEventListener('keydown', room);
  });

  it('a deck kept from an earlier look: opening PEOPLE asks for its list again and no thread, until TEXTS is up', async () => {
    const first = await open({ contact: 'cass' });
    threadFor(first, 'cass');
    handle!.close(true);
    const kept = first.deck();
    first.sent.length = 0;
    const s = await open({ tab: 'file', memory: first.memory, kept });
    expect(s.made).not.toHaveBeenCalled();
    expect(first.sent).toEqual([{ type: 'deck_open' }]);
    handle!.show('texts');
    expect(asked(first.sent).length).toBeGreaterThan(0);
  });

  it("Tab in PASS TIME's time field is the field's, not the screen cycle's", async () => {
    const s = await open({ contact: 'cass' });
    threadFor(s, 'cass');
    $<HTMLElement>('.tx-deck .dk-clock')!.click();
    expect(textsOwnsTab($('.tx-deck .dk-until'))).toBe(true);
    expect(textsOwnsTab($('.tx-deck .dk-box'))).toBe(false);
    expect(textsOwnsTab(null)).toBe(false);
  });
});
