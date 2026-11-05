import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyNav, memoryNav, mountDeck, newDeckMemory, type DeckHandle, type DeckMemory } from '../src/deck/deck-client';
import { connectDeck, type ConnectDeck } from '../src/deck/deck-socket';
import type { ChatMessage, DeckClientEvent, DeckHeader, DeckServerEvent, DeckThread } from '../../shared/types';

const thread = (o: Partial<DeckThread> & { id: string }): DeckThread => ({ name: o.id.toUpperCase(), accent: '#ff4f8b', portrait: null, pronoun: 'she', last: null, unread: false, ...o });
const row = (o: Partial<ChatMessage> & { id: string }): ChatMessage => ({ role: 'user', text: 'x', toolLines: [], ts: 1, status: 'ok', mode: 'text', ...o });
const HEADER: DeckHeader = { place: 'ROOFTOP', tail: null, weather: 'rain', time: 'THU 02:09' };

/** A deck socket that keeps what the client sends and lets a test play the server. */
function fakeSocket() {
  const sent: DeckClientEvent[] = [];
  let onEvent: (e: DeckServerEvent) => void = () => {};
  let onStatus: (open: boolean) => void = () => {};
  const close = vi.fn();
  const connect: ConnectDeck = (ev, st) => {
    onEvent = ev;
    onStatus = st;
    return { send: (e) => sent.push(e), close };
  };
  return { connect, sent, close, server: (e: DeckServerEvent) => onEvent(e), status: (open: boolean) => onStatus(open) };
}

let handle: DeckHandle | null = null;
afterEach(() => {
  handle?.destroy();
  handle = null;
  document.body.replaceChildren();
  history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

function mountPhone() {
  const root = document.createElement('div');
  document.body.append(root);
  const sock = fakeSocket();
  handle = mountDeck(root, { look: 'phone', nav: historyNav(), connect: sock.connect });
  sock.status(true);
  sock.server({ type: 'deck_threads', threads: [thread({ id: 'nix' })], start: 'nix' });
  return { root, ...sock };
}

const openNix = (s: ReturnType<typeof mountPhone>, rows: ChatMessage[] = []) => {
  s.root.querySelector<HTMLElement>('.dk-row')!.click();
  s.server({ type: 'deck_thread', contact: 'nix', header: HEADER, rows, readOnly: null, typing: false });
};

describe('mountDeck, the phone shell (in-game texts spec §3)', () => {
  it('phone: opening a row pushes ?c= and sends deck_thread', () => {
    const push = vi.spyOn(history, 'pushState');
    const s = mountPhone();
    s.root.querySelector<HTMLElement>('.dk-row')!.click();
    expect(push).toHaveBeenCalledWith({ c: 'nix' }, '', '/deck?c=nix');
    expect(s.sent).toContainEqual({ type: 'deck_thread', contact: 'nix' });
  });

  it('phone: popstate back to /deck shows the list', () => {
    const s = mountPhone();
    openNix(s);
    expect(s.root.querySelector('.dk-thread')).not.toBeNull();
    s.sent.length = 0;
    history.replaceState({}, '', '/deck');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(s.root.querySelector('.dk-title')?.textContent).toBe('MESSAGES');
    expect(s.sent).toContainEqual({ type: 'deck_open' });
  });

  it('escape() closes the menu, then the PASS TIME sheet, then the edit, then says false', () => {
    const s = mountPhone();
    openNix(s, [row({ id: 'u1', text: 'you up?' }), row({ id: 'a1', role: 'agent', text: 'yeah', replyTo: 'u1' })]);
    const mine = () => s.root.querySelector<HTMLElement>('.dk-me[data-id="u1"]')!;
    mine().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(s.root.querySelector('.dk-menu')).not.toBeNull();
    expect(handle!.escape()).toBe(true);
    expect(s.root.querySelector('.dk-menu')).toBeNull();

    s.root.querySelector<HTMLElement>('.dk-clock')!.click();
    expect(s.root.querySelector('.dk-sheet')).not.toBeNull();
    expect(handle!.escape()).toBe(true);
    expect(s.root.querySelector('.dk-sheet')).toBeNull();

    // The menu's openings are spaced (one open per long press), so the clock is past that.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    mine().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    s.root.querySelector<HTMLElement>('.dk-m-edit')!.click();
    expect(s.root.querySelector('.dk-editing')).not.toBeNull();
    expect(handle!.escape()).toBe(true);
    expect(s.root.querySelector('.dk-editing')).toBeNull();

    expect(handle!.escape()).toBe(false);
  });

  it('destroy() closes the socket and stops listening', () => {
    const s = mountPhone();
    handle!.destroy();
    handle = null;
    expect(s.close).toHaveBeenCalledTimes(1);
    s.sent.length = 0;
    history.replaceState({}, '', '/deck?c=nix');
    window.dispatchEvent(new PopStateEvent('popstate'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.sent).toEqual([]);
  });
});

function mountHolo(memory: DeckMemory = newDeckMemory()) {
  const root = document.createElement('div');
  document.body.append(root);
  const sock = fakeSocket();
  handle = mountDeck(root, { look: 'holo', nav: memoryNav(memory), memory, connect: sock.connect });
  return { root, memory, ...sock };
}
const nixThread = (rows: ChatMessage[] = []): DeckServerEvent => ({ type: 'deck_thread', contact: 'nix', header: HEADER, rows, readOnly: null, typing: false });
const TWO: DeckServerEvent = { type: 'deck_threads', threads: [thread({ id: 'nix' }), thread({ id: 'cass' })], start: 'nix' };

describe('mountDeck, the holo look (in-game texts spec §2–3)', () => {
  it('holo shows the list and the thread together, no history', () => {
    const push = vi.spyOn(history, 'pushState');
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    [...s.root.querySelectorAll<HTMLElement>('.dk-row')][1].click();
    s.server({ type: 'deck_thread', contact: 'cass', header: HEADER, rows: [], readOnly: null, typing: false });
    expect(s.root.classList.contains('dk-holo')).toBe(true);
    expect(s.root.querySelector('.dk-rows')).not.toBeNull();
    expect(s.root.querySelector('.dk-thread')).not.toBeNull();
    expect([...s.root.querySelectorAll('.dk-row')].map((r) => r.classList.contains('dk-on'))).toEqual([false, true]);
    expect(s.root.querySelector('.dk-back')).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(s.memory.open).toBe('cass');
  });

  it('drafts come back per contact across a remount', () => {
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    handle!.open('nix');
    s.server(nixThread([row({ id: 'a1', role: 'agent', text: 'roof. 4:15' })]));
    const box = s.root.querySelector<HTMLTextAreaElement>('.dk-box')!;
    box.value = 'omw';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    handle!.destroy();
    s.root.remove();
    const again = mountHolo(s.memory);
    // Before the server says anything: the last thread, her rows and your draft.
    expect(again.root.querySelector('.dk-her')?.textContent).toBe('roof. 4:15');
    expect(again.root.querySelector<HTMLTextAreaElement>('.dk-box')!.value).toBe('omw');
  });

  it('pending survives a remount (Review Focus 1)', () => {
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    handle!.open('nix');
    s.server(nixThread());
    const box = s.root.querySelector<HTMLTextAreaElement>('.dk-box')!;
    box.value = 'you up?';
    s.root.querySelector<HTMLElement>('.dk-send')!.click();
    handle!.destroy();
    s.root.remove();
    const again = mountHolo(s.memory);
    expect(again.root.querySelector('.dk-pending')?.textContent).toBe('you up?');
    again.status(true);
    again.server({ type: 'deck_rows', contact: 'nix', rows: [row({ id: 'u9', text: 'you up?' })] });
    expect(again.root.querySelector('.dk-pending')).toBeNull();
  });

  it('patching keeps the box in holo (Review Focus 2)', () => {
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    handle!.open('nix');
    s.server(nixThread());
    const box = s.root.querySelector<HTMLTextAreaElement>('.dk-box')!;
    box.focus();
    box.value = 'half';
    s.server({ type: 'deck_rows', contact: 'nix', rows: [row({ id: 'a1', role: 'agent', text: 'roof' })] });
    expect(s.root.querySelector('.dk-box')).toBe(box);
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe('half');
    expect(s.root.querySelector('.dk-her')?.textContent).toBe('roof');
  });

  it('open() of an unknown contact falls back (Review Focus 4)', () => {
    const s = mountHolo();
    s.status(true);
    s.server({ type: 'deck_threads', threads: [thread({ id: 'nix' })], start: 'nix' });
    s.sent.length = 0;
    handle!.open('ghost');
    expect(s.sent).toContainEqual({ type: 'deck_thread', contact: 'nix' });
    expect(s.memory.open).toBe('nix');
  });

  it('a reconnect refreshes the open thread (Review Focus 5)', () => {
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    handle!.open('nix');
    s.server(nixThread());
    const box = s.root.querySelector<HTMLTextAreaElement>('.dk-box')!;
    box.value = 'still here';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    s.status(false);
    expect(s.root.querySelector('.dk-offline')).not.toBeNull();
    s.sent.length = 0;
    s.status(true);
    expect(s.sent).toEqual([{ type: 'deck_open' }, { type: 'deck_thread', contact: 'nix' }]);
    expect(s.root.querySelector('.dk-offline')).toBeNull();
    expect(s.root.querySelector<HTMLTextAreaElement>('.dk-box')!.value).toBe('still here');
  });
});

describe('after destroy (review of task 1)', () => {
  it('a PASS TIME answering after destroy draws nothing', async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (answer = r))));
    const s = mountPhone();
    openNix(s);
    s.root.querySelector<HTMLElement>('.dk-clock')!.click();
    s.root.querySelector<HTMLElement>('.dk-wait')!.click();
    handle!.destroy();
    handle = null;
    const marker = document.createElement('i');
    s.root.replaceChildren(marker);
    answer(new Response(JSON.stringify({ clock: 100 }), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect([...s.root.childNodes]).toEqual([marker]);
    vi.unstubAllGlobals();
  });

  it('a long press still held at destroy opens no menu', () => {
    vi.useFakeTimers();
    const s = mountPhone();
    openNix(s, [row({ id: 'u1', text: 'you up?' })]);
    s.root.querySelector('.dk-me')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    handle!.destroy();
    handle = null;
    vi.advanceTimersByTime(1000);
    expect(s.root.querySelector('.dk-menu')).toBeNull();
    vi.useRealTimers();
  });

  it('a photo open full screen goes with destroy, and Esc closes it first', () => {
    const s = mountPhone();
    openNix(s, [row({ id: 'u1', text: 'pic?' }), row({ id: 'a2', role: 'agent', text: '[photo: roof-cranes]', replyTo: 'u1' })]);
    s.root.querySelector<HTMLElement>('.dk-photo')!.click();
    expect(document.querySelector('.dk-viewer')).not.toBeNull();
    expect(handle!.escape()).toBe(true);
    expect(document.querySelector('.dk-viewer')).toBeNull();
    s.root.querySelector<HTMLElement>('.dk-photo')!.click();
    handle!.destroy();
    handle = null;
    expect(document.querySelector('.dk-viewer')).toBeNull();
  });

  it('escape(): the menu goes before the PASS TIME sheet when both are up', () => {
    const s = mountPhone();
    openNix(s, [row({ id: 'u1', text: 'you up?' })]);
    s.root.querySelector<HTMLElement>('.dk-clock')!.click();
    s.root.querySelector('.dk-me')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(s.root.querySelector('.dk-sheet')).not.toBeNull();
    expect(handle!.escape()).toBe(true);
    expect(s.root.querySelector('.dk-menu')).toBeNull();
    expect(s.root.querySelector('.dk-sheet')).not.toBeNull();
  });
});

describe('connectDeck close() (review of task 1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('no reconnect after close', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() => Promise.reject(new Error('down')));
    vi.stubGlobal('fetch', fetch);
    const sock = connectDeck(vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    sock.close();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('a close while the bootstrap is in flight opens no socket', async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (answer = r))));
    const ws = vi.fn();
    vi.stubGlobal('WebSocket', ws);
    const sock = connectDeck(vi.fn(), vi.fn());
    sock.close();
    answer(new Response(JSON.stringify({ token: 't' }), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(ws).not.toHaveBeenCalled();
  });
});

describe('away and back (final review C1: a pane put away is not on screen)', () => {
  it("away() tells the server nothing's on screen; back() opens the thread again", () => {
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    handle!.open('nix');
    s.server(nixThread());
    s.sent.length = 0;
    handle!.away();
    expect(s.sent).toEqual([{ type: 'deck_open' }]);
    s.sent.length = 0;
    handle!.back();
    expect(s.sent).toEqual([{ type: 'deck_thread', contact: 'nix' }]);
  });

  it("a reconnect or a visible tab while away doesn't open the thread", () => {
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    handle!.open('nix');
    handle!.away();
    s.sent.length = 0;
    s.status(false);
    s.status(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.sent.filter((e) => e.type === 'deck_thread')).toEqual([]);
  });
});

describe('the holo list keeps a focused row (deferred minor)', () => {
  it('a row with keyboard focus keeps it when a new text arrives', () => {
    const s = mountHolo();
    s.status(true);
    s.server(TWO);
    handle!.open('nix');
    s.server(nixThread());
    [...s.root.querySelectorAll<HTMLElement>('.dk-row')][1].focus();
    s.server({ type: 'deck_rows', contact: 'nix', rows: [row({ id: 'a1', role: 'agent', text: 'roof' })] });
    const focused = document.activeElement as HTMLElement;
    expect(focused.classList.contains('dk-row')).toBe(true);
    expect(focused.dataset.id).toBe('cass');
  });
});

