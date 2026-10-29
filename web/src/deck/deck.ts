/**
 * The deck (spec 2026-10-23): texting your contacts, built for a phone. Its own page at /deck: no stage, no room
 * audio. The list and a thread share the screen; the phone's back button goes from a thread to the list.
 */
import './deck.css';
import { connectDeck } from './deck-socket';
import { formatClock } from '../../../shared/clock';
import { deckErrorText, laterCount, menuItems, patchThread, renderBoot, renderMenu, renderPassTime, renderThread, renderThreads } from './deck-view';
import type { ChatMessage, DeckHeader, DeckReadOnly, DeckServerEvent, DeckThread } from '../../../shared/types';

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
  pending: Map<string, { localId: string; text: string; failed?: string }[]>;
}

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;


export function startDeck(): void {
  document.title = 'Lowlight · Deck';
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Chakra+Petch:wght@400;600&display=swap';
  document.head.append(fonts);
  document.body.innerHTML = '';
  document.body.className = 'dk-body';
  const root = document.createElement('div');
  root.className = 'dk-root';
  document.body.append(root);
  // The network's boot screen over the deck while it connects; once per page load.
  document.body.append(renderBoot(() => {}));

  const s: State = { threads: [], open: null, header: null, rows: [], readOnly: null, typing: new Set(), nosave: false, online: false, error: null, pending: new Map() };
  // The thread on screen, patched in place so its text box (draft, focus, keyboard) survives updates (final review I1).
  let shown: { contact: string; view: HTMLElement } | null = null;
  // A bubble's controls (deck controls spec §2), and EDIT's text in the box.
  let menu: HTMLElement | null = null;
  let editing: { id: string; text: string } | null = null;
  let editSent: { contact: string; id: string; text: string } | null = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };
  const openMenu = (id: string) => {
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
  const params = new URLSearchParams(location.search);
  s.open = params.get('c');

  // The keyboard takes the bottom of the screen: the deck fits what's left (Review Focus 5).
  // iOS pans the page up as the keyboard opens: follow the visual viewport's top too (#4).
  const fit = () => {
    root.style.setProperty('--dk-h', `${window.visualViewport?.height ?? window.innerHeight}px`);
    root.style.setProperty('--dk-top', `${window.visualViewport?.offsetTop ?? 0}px`);
  };
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  window.addEventListener('resize', fit);
  fit();

  const deck = connectDeck(onEvent, (open) => {
    s.online = open;
    if (open) {
      // Whatever was typing before the drop, the server says again (#5).
      s.typing.clear();
      deck.send({ type: 'deck_open' });
      if (s.open) deck.send({ type: 'deck_thread', contact: s.open });
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
    if (push) history.pushState({ c: id }, '', `/deck?c=${encodeURIComponent(id)}`);
    deck.send({ type: 'deck_thread', contact: id });
    render();
  }
  function closeThread(push = true) {
    s.open = null;
    if (push) history.pushState({}, '', '/deck');
    deck.send({ type: 'deck_open' });
    render();
  }
  window.addEventListener('popstate', () => {
    const c = new URLSearchParams(location.search).get('c');
    if (c) openThread(c, false);
    else closeThread(false);
  });
  // Back on the phone after a while: the save may have moved on (a LOAD, or you walked to her on the desktop).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    deck.send({ type: 'deck_open' });
    if (s.open) deck.send({ type: 'deck_thread', contact: s.open });
  });

  function onEvent(e: DeckServerEvent) {
    if (e.type === 'deck_nosave') s.nosave = true;
    else if (e.type === 'deck_threads') {
      s.nosave = false;
      s.threads = e.threads;
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

  function render() {
    const contact = s.open ? s.threads.find((t) => t.id === s.open) : undefined;
    if (!s.nosave && s.open && contact && s.header && shown?.contact === contact.id && root.contains(shown.view)) {
      const msgs = shown.view.querySelector('.dk-msgs');
      const atBottom = !msgs || msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
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
    if (s.open && contact && s.header) {
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
      onBack: () => history.back(),
      onStepOut: () => {
        s.error = null;
        deck.send({ type: 'deck_step_out', contact: contact.id });
      },
      onPassTime: openSheet,
    });
    if (s.error) view.querySelector('.dk-msgs')?.append(Object.assign(document.createElement('div'), { className: 'dk-error', textContent: s.error }));
    return view;
  }

  render();
}
