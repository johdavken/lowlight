/**
 * The deck's client (in-game texts spec §3): the deck's state, its socket and its screens, mounted in a root it's
 * given. Two shells use it: the phone page at /deck (deck.ts) and the room's TEXTS screen. How a thread is opened and
 * left (browser history, or nothing) is the shell's `DeckNav`.
 */
import './deck.css';
import './holo.css';
import { connectDeck, type ConnectDeck } from './deck-socket';
import { formatClock } from '../../../shared/clock';
import { deckErrorText, laterCount, menuItems, patchThread, renderBar, renderMenu, renderPassTime, renderThread, renderThreads } from './deck-view';
import type { ChatMessage, DeckHeader, DeckReadOnly, DeckServerEvent, DeckThread } from '../../../shared/types';

export interface DeckNav {
  /** The thread to open first (phone: ?c=). */
  initial(): string | null;
  /** The client opened (contact) or left (null) a thread by a tap. */
  went(contact: string | null): void;
  /** ‹ in a thread. */
  back(): void;
  /** Outside navigation (phone: popstate) calls `go`; returns the remover. */
  listen(go: (contact: string | null) => void): () => void;
}

/** The phone's navigation: a thread is a history entry (`/deck?c=nix`), so the phone's back button leaves it. */
export function historyNav(): DeckNav {
  return {
    initial: () => new URLSearchParams(location.search).get('c'),
    went: (contact) => history.pushState(contact ? { c: contact } : {}, '', contact ? `/deck?c=${encodeURIComponent(contact)}` : '/deck'),
    back: () => history.back(),
    listen(go) {
      const onPop = () => go(new URLSearchParams(location.search).get('c'));
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    },
  };
}

type Pending = { localId: string; text: string; failed?: string }[];

/**
 * What outlives a mount in the room's TEXTS screen, for the page session (in-game texts spec §3): a reopen shows the
 * last thread at once, with your draft and any text of yours that hasn't landed yet.
 */
export interface DeckMemory {
  drafts: Map<string, string>;
  open: string | null;
  threads: DeckThread[];
  thread: { contact: string; header: DeckHeader; rows: ChatMessage[]; readOnly: DeckReadOnly } | null;
  pending: Map<string, Pending>;
}

export function newDeckMemory(): DeckMemory {
  return { drafts: new Map(), open: null, threads: [], thread: null, pending: new Map() };
}

/** The room's navigation: the open thread is the memory's, and nothing touches the game's URL or history. */
export function memoryNav(memory: DeckMemory): DeckNav {
  return {
    initial: () => memory.open,
    went: (contact) => void (memory.open = contact),
    back: () => {}, // holo has no ‹: the list is beside the thread
    listen: () => () => {},
  };
}

export interface DeckHandle {
  /** Opens `contact`'s thread, or the list. */
  open(contact: string | null): void;
  /** Closes the top thing (the menu, then PASS TIME, then an EDIT): true, or false when there was nothing. */
  escape(): boolean;
  /** Put away (the room's TEXTS closed): the server hears nothing's on screen, so her texts stay unread. */
  away(): void;
  /** Back on screen: the open thread is asked for again (and read). */
  back(): void;
  /** The socket closed, every listener gone. */
  destroy(): void;
}

interface State {
  threads: DeckThread[];
  open: string | null;
  header: DeckHeader | null;
  rows: ChatMessage[];
  readOnly: DeckReadOnly;
  typing: Set<string>;
  nosave: boolean;
  online: boolean;
  error: string | null;
  /** Your texts per contact not in the thread yet (final review I2): shown at once, offered again if they can't go. */
  pending: Map<string, Pending>;
}

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export function mountDeck(root: HTMLElement, o: { look: 'phone' | 'holo'; nav: DeckNav; memory?: DeckMemory; connect?: ConnectDeck }): DeckHandle {
  const nav = o.nav;
  const holo = o.look === 'holo';
  const mem = o.memory;
  const s: State = { threads: mem?.threads ?? [], open: null, header: null, rows: [], readOnly: null, typing: new Set(), nosave: false, online: false, error: null, pending: mem?.pending ?? new Map() };
  if (holo) root.classList.add('dk-holo');
  // The thread on screen, patched in place so its text box (draft, focus, keyboard) survives updates (final review I1).
  let shown: { contact: string; view: HTMLElement } | null = null;
  // A bubble's controls (deck controls spec §2), and EDIT's text in the box.
  let menu: HTMLElement | null = null;
  let editing: { id: string; text: string } | null = null;
  let editSent: { contact: string; id: string; text: string } | null = null;
  // Put away (destroy): a PASS TIME or a long press still in flight draws nothing (review of task 1).
  let destroyed = false;
  // Off screen but connected (away): no thread is asked for, so nothing gets read.
  let hidden = false;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };
  const openMenu = (id: string) => {
    if (destroyed) return;
    closeMenu();
    const contact = s.open;
    const items = menuItems(s.rows, id);
    if (!contact || items.length === 0) return;
    const row = s.rows.find((m) => m.id === id);
    const act = (e: Parameters<typeof deck.send>[0]) => {
      closeMenu();
      s.error = null;
      deck.send(e);
    };
    menu = renderMenu({
      items,
      takes: row?.takes ?? null,
      later: laterCount(s.rows, id),
      onRegen: () => act({ type: 'deck_regen', contact, messageId: id }),
      onSwipe: (index) => act({ type: 'deck_swipe', contact, messageId: id, index }),
      onEdit: () => {
        closeMenu();
        editing = { id, text: row?.text ?? '' };
        shown = null; // a fresh box, holding the text to edit
        render();
      },
      onDelete: () => act({ type: 'deck_delete', contact, messageId: id }),
      onClose: closeMenu,
    });
    root.append(menu);
  };
  // PASS TIME's panel, over whichever screen is up.
  let sheet: HTMLElement | null = null;
  const closeSheet = () => {
    sheet?.remove();
    sheet = null;
  };
  const openSheet = () => {
    closeSheet();
    sheet = renderPassTime((b) => void passTime(b), closeSheet);
    root.append(sheet);
  };
  async function passTime(b: { minutes: number } | { until: string }) {
    try {
      const res = await fetch('/api/playthroughs/active/wait', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        s.error = body.error === 'busy' ? 'WAIT FOR HER TO FINISH' : 'TIME DIDN\'T PASS';
      } else {
        s.error = null;
        // The bar shows the new time at once, on the list too (it has no header of its own).
        const { clock } = (await res.json()) as { clock: number };
        s.header = { ...(s.header ?? { place: '', tail: null, weather: null }), time: formatClock(clock) };
      }
    } catch {
      s.error = 'NO SIGNAL';
    }
    if (destroyed) return;
    closeSheet();
    // The clock moved: where everyone is, and the header's time.
    deck.send({ type: 'deck_open' });
    if (s.open) deck.send({ type: 'deck_thread', contact: s.open });
    render();
  }
  const pendingOf = (id: string) => s.pending.get(id) ?? [];
  const sendText = (contact: string, text: string, localId: string) => {
    s.pending.set(contact, [...pendingOf(contact).filter((p) => p.localId !== localId), { localId, text }]);
    deck.send({ type: 'deck_send', contact, text, localId });
  };
  s.open = nav.initial();
  if (mem?.thread && mem.thread.contact === s.open) ({ header: s.header, rows: s.rows, readOnly: s.readOnly } = { ...mem.thread, rows: [...mem.thread.rows] });
  /** The holo memory follows the state: the next mount starts where this one is. */
  const remember = () => {
    if (!mem) return;
    mem.threads = s.threads;
    mem.open = s.open;
    if (s.open && s.header) mem.thread = { contact: s.open, header: s.header, rows: s.rows, readOnly: s.readOnly };
  };
  /** Holo always has a thread open: the one asked for, else the list's first (an unknown contact too). */
  const known = (id: string | null) => id !== null && (s.threads.length === 0 || s.threads.some((t) => t.id === id));

  const deck = (o.connect ?? connectDeck)(onEvent, (open) => {
    s.online = open;
    if (open) {
      // Whatever was typing before the drop, the server says again (#5).
      s.typing.clear();
      deck.send({ type: 'deck_open' });
      if (s.open && !hidden) deck.send({ type: 'deck_thread', contact: s.open });
    }
    render();
  });

  function openThread(id: string, push = true) {
    closeMenu();
    editing = null;
    s.open = id;
    s.rows = [];
    s.header = null;
    s.error = null;
    if (push) nav.went(id);
    deck.send({ type: 'deck_thread', contact: id });
    render();
  }
  function closeThread(push = true) {
    s.open = null;
    if (push) nav.went(null);
    deck.send({ type: 'deck_open' });
    render();
  }
  const unlisten = nav.listen((c) => {
    if (c) openThread(c, false);
    else closeThread(false);
  });
  // Back on the phone after a while: the save may have moved on (a LOAD, or you walked to her on the desktop).
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    deck.send({ type: 'deck_open' });
    if (s.open && !hidden) deck.send({ type: 'deck_thread', contact: s.open });
  };
  document.addEventListener('visibilitychange', onVisible);

  function onEvent(e: DeckServerEvent) {
    if (e.type === 'deck_nosave') s.nosave = true;
    else if (e.type === 'deck_threads') {
      s.nosave = false;
      s.threads = e.threads;
      if (holo && !known(s.open) && s.threads.length > 0) return openThread(s.threads[0].id);
    } else if (e.type === 'deck_thread' && e.contact === s.open) {
      // Her new reply to your edit is in: the edit went through.
      if (editSent && e.rows.some((r) => r.id === editSent!.id && r.text === editSent!.text)) editSent = null;
      s.header = e.header;
      s.rows = e.rows;
      s.readOnly = e.readOnly;
      // The server knows whether she's typing (a deck that reconnected missed the word): #5.
      if (e.typing) s.typing.add(e.contact);
      else s.typing.delete(e.contact);
    } else if (e.type === 'deck_rows') {
      // Your text has landed: its waiting bubble goes.
      for (const r of e.rows) {
        if (r.role !== 'user') continue;
        const list = pendingOf(e.contact);
        const at = list.findIndex((p) => !p.failed && p.text === r.text);
        if (at >= 0) s.pending.set(e.contact, list.filter((_, i) => i !== at));
      }
      if (e.contact === s.open) for (const r of e.rows) {
        const at = s.rows.findIndex((x) => x.id === r.id);
        if (at >= 0) s.rows[at] = r;
        else s.rows.push(r);
      }
    } else if (e.type === 'deck_typing') {
      if (e.on) s.typing.add(e.contact);
      else s.typing.delete(e.contact);
    } else if (e.type === 'deck_error' && e.localId && pendingOf(e.contact).some((p) => p.localId === e.localId)) {
      // A text that couldn't go stays as yours, NOT SENT · RETRY, whichever screen you're on.
      const why = deckErrorText(e.error, s.threads.find((t) => t.id === e.contact)?.pronoun ?? 'she');
      s.pending.set(e.contact, pendingOf(e.contact).map((p) => (p.localId === e.localId ? { ...p, failed: why } : p)));
      if (e.error === 'with-them') deck.send({ type: 'deck_thread', contact: e.contact });
    } else if (e.type === 'deck_error' && editSent && e.contact === editSent.contact && e.contact === s.open) {
      editing = { id: editSent.id, text: editSent.text };
      editSent = null;
      shown = null;
      s.error = deckErrorText(e.error, s.threads.find((t) => t.id === e.contact)?.pronoun ?? 'she');
    } else if (e.type === 'deck_error' && e.contact === s.open) {
      s.error = deckErrorText(e.error, s.threads.find((t) => t.id === e.contact)?.pronoun ?? 'she');
      if (e.error === 'with-them') deck.send({ type: 'deck_thread', contact: e.contact });
    }
    render();
  }

  // Holo's bar across the pane and its list column, rebuilt on every render; the thread beside them is patched.
  let holoBar: HTMLElement | null = null;
  let holoList: HTMLElement | null = null;
  const holoChrome = () => {
    // A row the keyboard is on keeps it across the rebuild (deferred minor).
    const focused = holoList?.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.id : undefined;
    const bar = renderBar(s.header, openSheet);
    const list = renderThreads(s.threads, (id) => openThread(id), s.header, openSheet, s.open);
    list.classList.add('dk-lcol');
    holoBar?.replaceWith(bar);
    holoList?.replaceWith(list);
    holoBar = bar;
    holoList = list;
    if (focused) [...list.querySelectorAll<HTMLElement>('.dk-row')].find((r) => r.dataset.id === focused)?.focus();
  };

  function render() {
    if (destroyed) return;
    remember();
    const contact = s.open ? s.threads.find((t) => t.id === s.open) : undefined;
    if (!s.nosave && s.open && contact && s.header && shown?.contact === contact.id && root.contains(shown.view)) {
      const msgs = shown.view.querySelector('.dk-msgs');
      const atBottom = !msgs || msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
      if (holo) holoChrome();
      patchThread(shown.view, threadView(contact));
      root.querySelector('.dk-offline')?.remove();
      if (!s.online) root.append(Object.assign(document.createElement('div'), { className: 'dk-offline', textContent: 'NO SIGNAL' }));
      const after = shown.view.querySelector('.dk-msgs');
      if (after && atBottom) after.scrollTop = after.scrollHeight;
      if (sheet) root.append(sheet);
      if (menu) root.append(menu);
      return;
    }
    shown = null;
    root.replaceChildren();
    if (s.nosave) {
      root.append(Object.assign(document.createElement('div'), { className: 'dk-screen dk-nosave', textContent: 'NO SAVE LOADED' }));
      return;
    }
    if (holo) {
      holoBar = holoList = null;
      holoChrome();
      const col = Object.assign(document.createElement('div'), { className: 'dk-tcol' });
      const cols = Object.assign(document.createElement('div'), { className: 'dk-cols' });
      cols.append(holoList!, col);
      root.append(holoBar!, cols);
      if (s.open && contact && s.header) {
        const view = threadView(contact);
        shown = { contact: contact.id, view };
        col.append(view);
        const msgs = view.querySelector('.dk-msgs');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
        // A thread coming up in the pane takes the keys (final review I2); not while the pane is put away.
        if (root.isConnected) view.querySelector<HTMLElement>('.dk-box')?.focus();
      }
    } else if (s.open && contact && s.header) {
      const view = threadView(contact);
      shown = { contact: contact.id, view };
      root.append(view);
      const msgs = view.querySelector('.dk-msgs');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    } else {
      root.append(renderThreads(s.threads, (id) => openThread(id), s.header, openSheet));
    }
    if (sheet) root.append(sheet);
    if (menu && shown) root.append(menu);
    if (!s.online) root.append(Object.assign(document.createElement('div'), { className: 'dk-offline', textContent: 'NO SIGNAL' }));
  }
  function threadView(contact: DeckThread): HTMLElement {
    const view = renderThread({
      contact,
      header: s.header!,
      rows: s.rows,
      readOnly: s.readOnly,
      typing: s.typing.has(contact.id),
      pending: pendingOf(contact.id),
      onSend: (text) => {
        s.error = null;
        if (editing) {
          deck.send({ type: 'deck_edit', contact: contact.id, messageId: editing.id, text });
          // Kept until she answers: a failed EDIT puts your words back in the box (final review #6).
          editSent = { contact: contact.id, id: editing.id, text };
          editing = null;
          shown = null;
        } else sendText(contact.id, text, newId());
        render();
      },
      onMenu: openMenu,
      editing,
      onCancelEdit: () => {
        editing = null;
        shown = null;
        render();
      },
      onResend: (localId) => {
        const p = pendingOf(contact.id).find((x) => x.localId === localId);
        if (p) sendText(contact.id, p.text, localId);
        render();
      },
      onRetry: (messageId) => deck.send({ type: 'deck_retry', contact: contact.id, messageId }),
      onBack: () => nav.back(),
      onStepOut: () => {
        s.error = null;
        deck.send({ type: 'deck_step_out', contact: contact.id });
      },
      onPassTime: openSheet,
      ...(holo && {
        hideBack: true,
        menuOnClick: true,
        enterSends: true,
        draft: mem?.drafts.get(contact.id),
        onDraft: (text: string) => void (text ? mem?.drafts.set(contact.id, text) : mem?.drafts.delete(contact.id)),
      }),
    });
    if (s.error) view.querySelector('.dk-msgs')?.append(Object.assign(document.createElement('div'), { className: 'dk-error', textContent: s.error }));
    return view;
  }

  render();
  return {
    open(contact) {
      hidden = false;
      if (holo && !known(contact)) contact = s.threads[0]?.id ?? null;
      if (contact) openThread(contact);
      else closeThread();
    },
    escape() {
      const viewer = document.querySelector('.dk-viewer');
      if (viewer) return viewer.remove(), true;
      if (menu) return closeMenu(), true;
      if (sheet) return closeSheet(), true;
      if (editing) {
        editing = null;
        shown = null;
        render();
        return true;
      }
      return false;
    },
    away() {
      hidden = true;
      deck.send({ type: 'deck_open' });
    },
    back() {
      hidden = false;
      if (s.open) deck.send({ type: 'deck_thread', contact: s.open });
    },
    destroy() {
      destroyed = true;
      // A photo open full screen hangs on the body, not the root.
      for (const v of document.querySelectorAll('.dk-viewer')) v.remove();
      closeMenu();
      closeSheet();
      unlisten();
      document.removeEventListener('visibilitychange', onVisible);
      deck.close();
    },
  };
}
