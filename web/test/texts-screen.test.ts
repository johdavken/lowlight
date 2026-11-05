import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDeckMemory, type DeckMemory } from '../src/deck/deck-client';
import type { ConnectDeck } from '../src/deck/deck-socket';
import { openTexts, textsDeck, textsOwnsTab, TEXTS_OUT_MS, type TextsDeck, type TextsHandle } from '../src/ui/texts-screen';
import type { ChatMessage, DeckClientEvent, DeckServerEvent, DeckThread } from '../../shared/types';

const thread = (o: Partial<DeckThread> & { id: string }): DeckThread => ({ name: o.id.toUpperCase(), accent: '#ff4f8b', portrait: null, pronoun: 'she', last: null, unread: false, ...o });
const row = (o: Partial<ChatMessage> & { id: string }): ChatMessage => ({ role: 'user', text: 'x', toolLines: [], ts: 1, status: 'ok', mode: 'text', ...o });
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document.activeElement ?? document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

function fakeSocket() {
  const sent: DeckClientEvent[] = [];
  let onEvent: (e: DeckServerEvent) => void = () => {};
  let onStatus: (open: boolean) => void = () => {};
  const close = vi.fn();
  const connect: ConnectDeck = vi.fn((ev, st) => {
    onEvent = ev;
    onStatus = st;
    return { send: (e: DeckClientEvent) => sent.push(e), close };
  }) as unknown as ConnectDeck;
  return { connect, sent, close, server: (e: DeckServerEvent) => onEvent(e), status: (open: boolean) => onStatus(open) };
}

let handle: TextsHandle | null = null;
let host: HTMLElement;
afterEach(() => {
  handle?.close(true);
  handle = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

function open(o: { contact?: string | null; memory?: DeckMemory; reducedMotion?: boolean } = {}) {
  host = document.createElement('div');
  document.body.append(host);
  const sock = fakeSocket();
  const onClose = vi.fn();
  const memory = o.memory ?? newDeckMemory();
  const deck = textsDeck(memory, sock.connect);
  handle = openTexts(host, { contact: o.contact, deck, reducedMotion: o.reducedMotion ?? true, onClose });
  sock.status(true);
  sock.server({ type: 'deck_threads', threads: [thread({ id: 'nix' }), thread({ id: 'cass' })], start: 'nix' });
  return { ...sock, onClose, memory, deck };
}
/** Opens again on the page's kept deck. */
function reopen(deck: TextsDeck, contact?: string) {
  handle = openTexts(host, { contact, deck, reducedMotion: true, onClose: vi.fn() });
}
const threadFor = (s: ReturnType<typeof open>, contact: string, rows: ChatMessage[] = []) =>
  s.server({ type: 'deck_thread', contact, header: { place: 'ROOF', tail: null, time: null, weather: null }, rows, readOnly: null, typing: false });

describe('TEXTS (in-game texts spec §2)', () => {
  it('opens on the contact given, else the last thread, else the first', () => {
    let s = open({ contact: 'cass' });
    expect(s.sent).toContainEqual({ type: 'deck_thread', contact: 'cass' });
    handle!.close(true);
    // Put away, the pane isn't on screen; back, it opens the last thread again (and reads it).
    expect(s.sent.at(-1)).toEqual({ type: 'deck_open' });
    s.sent.length = 0;
    reopen(s.deck);
    expect(s.sent).toEqual([{ type: 'deck_thread', contact: 'cass' }]);
    handle!.close(true);
    s = open();
    expect(s.sent).toContainEqual({ type: 'deck_thread', contact: 'nix' });
    expect($('.tx-root .tx-pane .dk-holo')).not.toBeNull();
  });

  it('Alt+X closes it; the page keeps its connection', () => {
    const s = open();
    key('x', { altKey: true, code: 'KeyX' });
    expect(s.onClose).toHaveBeenCalledTimes(1);
    expect(s.close).not.toHaveBeenCalled();
    expect($('.tx-root')).toBeNull();
    expect(handle!.isOpen).toBe(false);
  });

  it('Esc: menu, then sheet, then the screen', () => {
    const s = open();
    threadFor(s, 'nix', [row({ id: 'u1', text: 'up?' })]);
    $('.dk-clock')!.click();
    $('.dk-me')!.click(); // holo: a click opens the bubble's menu
    expect($('.dk-menu')).not.toBeNull();
    let e = key('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect($('.dk-menu')).toBeNull();
    expect($('.dk-sheet')).not.toBeNull();
    e = key('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect($('.dk-sheet')).toBeNull();
    expect($('.tx-root')).not.toBeNull();
    e = key('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect($('.tx-root')).toBeNull();
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it("a backdrop click closes; a click in the pane doesn't", () => {
    const s = open();
    $('.tx-pane')!.click();
    expect(s.onClose).not.toHaveBeenCalled();
    $('.tx-root')!.click();
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it('room keys never fire while open', () => {
    const s = open();
    threadFor(s, 'nix');
    const room = vi.fn();
    window.addEventListener('keydown', room);
    const box = $<HTMLTextAreaElement>('.dk-box')!;
    box.focus();
    key('a', {}, box);
    for (const code of ['KeyR', 'KeyD', 'KeyE', 'KeyG']) key(code.slice(3).toLowerCase(), { altKey: true, code }, document.body);
    window.removeEventListener('keydown', room);
    expect(room).not.toHaveBeenCalled();
  });

  it('Tab is not swallowed', () => {
    const s = open();
    threadFor(s, 'nix');
    const box = $<HTMLTextAreaElement>('.dk-box')!;
    box.focus();
    const seen = vi.fn();
    window.addEventListener('keydown', seen, true);
    const e = key('Tab', {}, box);
    window.removeEventListener('keydown', seen, true);
    expect(e.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalled();
  });

  it('Esc during the fade is swallowed (Review Focus 3)', () => {
    vi.useFakeTimers();
    open({ reducedMotion: false });
    handle!.close();
    expect($('.tx-root.tx-closing')).not.toBeNull();
    const room = vi.fn();
    window.addEventListener('keydown', room);
    const e = key('Escape', {}, document.body);
    window.removeEventListener('keydown', room);
    expect(e.defaultPrevented).toBe(true);
    expect(room).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TEXTS_OUT_MS);
    expect($('.tx-root')).toBeNull();
  });

  it('reopen during the fade (Review Focus 3)', () => {
    vi.useFakeTimers();
    open({ reducedMotion: false });
    handle!.close();
    const sock = fakeSocket();
    handle = openTexts(host, { deck: textsDeck(newDeckMemory(), sock.connect), reducedMotion: false, onClose: vi.fn() });
    expect(document.querySelectorAll('.tx-root')).toHaveLength(1);
    expect($('.tx-root.tx-closing')).toBeNull();
  });

  it('show() opens that thread', () => {
    const s = open();
    s.sent.length = 0;
    handle!.show('cass');
    expect(s.sent).toContainEqual({ type: 'deck_thread', contact: 'cass' });
  });

  it('a text that lands while TEXTS is closed clears its bubble (final review C1)', () => {
    const s = open();
    threadFor(s, 'nix');
    const box = $<HTMLTextAreaElement>('.dk-box')!;
    box.value = 'you up?';
    $('.dk-send')!.click();
    handle!.close(true);
    // Her scene turn ends; your text runs and lands while the pane is put away.
    s.server({ type: 'deck_rows', contact: 'nix', rows: [row({ id: 'u9', text: 'you up?' }), row({ id: 'a9', role: 'agent', text: 'yeah' })] });
    reopen(s.deck);
    expect($('.dk-pending')).toBeNull();
    expect($('.dk-her')?.textContent).toBe('yeah');
  });

  it('a reopened pane sends at once, on the same connection (final review I3)', () => {
    const s = open();
    threadFor(s, 'nix');
    handle!.close(true);
    reopen(s.deck);
    s.sent.length = 0;
    const box = $<HTMLTextAreaElement>('.dk-box')!;
    box.value = 'omw';
    $('.dk-send')!.click();
    expect(s.sent).toContainEqual(expect.objectContaining({ type: 'deck_send', contact: 'nix', text: 'omw' }));
    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it('the box has focus when the pane opens and when a thread opens (final review I2)', () => {
    const s = open();
    threadFor(s, 'nix');
    expect(document.activeElement).toBe($('.dk-box'));
    handle!.close(true);
    (document.activeElement as HTMLElement | null)?.blur();
    reopen(s.deck);
    expect(document.activeElement).toBe($('.dk-box'));
    [...document.querySelectorAll<HTMLElement>('.dk-row')][1].click();
    threadFor(s, 'cass');
    expect(document.activeElement).toBe($('.dk-box'));
  });

  it('a letter typed outside the pane goes to the box (final review I2)', () => {
    const s = open();
    threadFor(s, 'nix');
    const outside = document.createElement('textarea');
    document.body.append(outside);
    outside.focus();
    key('o', {}, outside);
    expect(document.activeElement).toBe($('.dk-box'));
  });

  it('F8 reaches the bug report, from the box or outside it (deferred minor)', () => {
    const s = open();
    threadFor(s, 'nix');
    const report = vi.fn();
    window.addEventListener('keydown', report);
    key('F8', {}, $('.dk-box')!);
    key('F8', {}, document.body);
    window.removeEventListener('keydown', report);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("Tab in PASS TIME's time field is the field's, not the cycle's (deferred minor)", () => {
    const s = open();
    threadFor(s, 'nix');
    $('.dk-clock')!.click();
    expect(textsOwnsTab($('.dk-until'))).toBe(true);
    expect(textsOwnsTab($('.dk-box'))).toBe(false);
    expect(textsOwnsTab(document.body)).toBe(false);
  });
});

