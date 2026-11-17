/**
 * PEOPLE (2026-10-18 spec §2; trace panel 2026-11-15, mockup people-trace.html): who you know as a list on the panel's
 * rail, and for the pick their FILE, your TEXTS with them (the deck, folded in from its own screen) and, for the one
 * you're with, JOURNAL. One list serves all three tabs; the pick holds as the tab changes. The panel's own lines are
 * the UI's red; the picked row, its leader and what it opens are the contact's colour. LEADS and LOOSE ENDS live on
 * QUEST. Alt+C / Alt+X / Alt+J open it on their tab (main.ts); while it's open they turn it, and the open tab's key
 * closes it. ← / → turn the tab (in TEXTS only while the box is empty), ↑ / ↓ walk the list, Enter does the filled key
 * (GO; in TEXTS the deck's own SEND), and Tab turns it on the screen cycle. In TEXTS ↑ / ↓ walk the list only while
 * the box is empty, and a thread is asked for (and read) only once the list has rested on someone. It won't close over unsaved journal work: Esc
 * and the backdrop flash the page's SAVE instead. In TEXTS, Esc closes a text's controls or PASS TIME first.
 */
import type { FigureFit } from './figure-adjust';
import { panelCue } from '../ui/panel-sound';
import type { ContactEntry, LeadView } from '../../../shared/types';
import type { DeckMemory } from '../deck/deck-client';
import type { JournalView } from '../ui/journal';
import { bugReportOpen } from '../ui/bug-report';
import { openScreen, TRACE_OUT_MS } from '../ui/screen';
import { mountTracePanel, TRACE_RED } from '../ui/trace-panel';
import { contactsTab, type KeyedTab, type PeoplePage } from './people-contacts';
import { hasThread, noNumber, TEXTS_SETTLE_MS, textsBox, type TextsDeck } from './people-texts';
import './people-screen.css';

export type PeopleTab = PeoplePage;
export const PEOPLE_TABS: PeopleTab[] = ['file', 'texts', 'journal'];
const TAB_NAME: Record<PeopleTab, string> = { file: 'FILE', texts: 'TEXTS', journal: 'JOURNAL' };
const TAB_KEY: Record<string, PeopleTab> = { KeyC: 'file', KeyX: 'texts', KeyJ: 'journal' };
/** Their keys still work from here, and go to QUEST. */
const QUEST_KEY: Record<string, 'leads' | 'loose'> = { KeyL: 'leads', KeyO: 'loose' };
/** The key line, per tab. */
const HINTS: Record<PeopleTab, string> = {
  file: '[↑↓] WHO · [←→] TAB · [ENTER] GO · [ESC] CLOSE',
  texts: '[↑↓] WHO · [←→] TAB, BOX EMPTY · [ENTER] SEND · [ESC] CLOSE',
  journal: '[←→] TAB · [ESC] CLOSE',
};

export interface PeopleOpts {
  tab: PeopleTab;
  contacts(): Promise<ContactEntry[]>;
  leads(): Promise<LeadView[]>;
  journal: JournalView;
  /** The contact you're with. */
  current: string;
  /** Who to open on (a text's sender); else the one you're with. */
  contact?: string | null;
  /** The page's deck, made on the first look at TEXTS and kept (people-texts.ts). */
  deck(): TextsDeck;
  /** The deck if it has been made already (an earlier look): its threads are asked for again, for LAST TEXT. */
  kept?(): TextsDeck | null;
  /** What the deck remembers: its threads, and which is open. */
  memory: DeckMemory;
  /** Who has texted you unseen (the bar's count). */
  unread(): readonly { id: string; name: string }[];
  /** Standing values in the standing word's tooltip. */
  dev: boolean;
  /** Go to a contact. */
  pick(id: string): void;
  /** PEOPLE's wardrobe: her outfit picked (null: AUTO); a rejection puts the last pick back. */
  onOutfit?(id: string, outfit: string | null): Promise<void> | void;
  /** ADJUST FIGURE on FILE: whether this checkout may write characters' files (asked once at boot). */
  figureEdits?(): boolean;
  /** A contact's waist and portrait centre were saved (figure-adjust.ts). */
  onFit?(id: string, fit: FigureFit): void;
  /** Alt+L / Alt+O, from here. */
  toQuest?(tab: 'leads' | 'loose'): void;
  reducedMotion?: boolean;
  onClose?(): void;
}

export interface PeopleHandle {
  /** `instant`: a switch to another screen (no step-off). */
  close(instant?: boolean): void;
  /** Closes unless the journal has unsaved work; then JOURNAL comes up with its SAVE lit, and false. */
  requestClose(instant?: boolean): boolean;
  /** `contact`: the list goes to them too (a text's notice). */
  show(tab: PeopleTab, contact?: string | null): void;
  /** The screen cycle's Tab: FILE → TEXTS → JOURNAL (1) or back (-1); false past either end, or with no JOURNAL to turn to. */
  turnPage(dir: 1 | -1): boolean;
  /** The unread senders changed: the tags, the tab's count and the head follow. */
  setUnread(): void;
  readonly tab: PeopleTab;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export function openPeople(host: HTMLElement, o: PeopleOpts): PeopleHandle {
  const screen = openScreen(host, {
    title: 'PEOPLE',
    className: 'scr-trace people-screen',
    hotkey: 'P',
    label: 'People',
    accent: TRACE_RED,
    reducedMotion: o.reducedMotion,
    canClose: () => {
      if (!o.journal.busy) return true;
      refuse();
      return false;
    },
    onClose: () => {
      window.removeEventListener('keydown', onKey, true);
      watch?.disconnect();
      deckWatch?.disconnect();
      panel.destroy();
      putAway();
      if (instantClose) return void o.onClose?.();
      // Still on screen while it steps off: Esc mustn't reach the room (back to the dial-in) until it's gone.
      if (!o.reducedMotion) {
        window.addEventListener('keydown', swallowEsc, true);
        setTimeout(() => window.removeEventListener('keydown', swallowEsc, true), TRACE_OUT_MS);
      }
      o.onClose?.();
    },
  });
  const swallowEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || bugReportOpen()) return;
    e.preventDefault();
    e.stopPropagation();
  };
  /** A field of the screen's own (the text box, the dossier page, a note's edit): keys in it are the field's. */
  const typing = (n: Element | null) => (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) && screen.root.contains(n);
  /** A focused button of the screen's own (Tab) takes its Enter; a list row doesn't (Enter goes to the selection). */
  const onButton = (n: Element | null) => n instanceof HTMLButtonElement && screen.root.contains(n) && !n.classList.contains('pe-tile');
  /** Unsaved journal work refuses a close: JOURNAL comes up with its SAVE lit, wherever you were. */
  function refuse(): void {
    if (tab !== 'journal') show('journal');
    o.journal.flashSave();
  }

  const panel = mountTracePanel(screen, { title: 'PEOPLE' });
  const tabs = PEOPLE_TABS.map((t) => {
    const b = el('button', 'pe-tab tp-tab');
    b.type = 'button';
    b.dataset.tab = t;
    b.addEventListener('click', () => {
      if (t !== tab) panelCue('tab');
      show(t);
    });
    return b;
  });
  panel.tabs.classList.add('pe-tabs');
  panel.tabs.append(...tabs);
  panel.nums.classList.add('pe-nums');
  const pane = el('div', 'pe-pane');
  screen.body.append(pane);
  const journalTab = tabs[PEOPLE_TABS.indexOf('journal')];

  let tab: PeopleTab = o.tab;
  /** The list and what it opens once loaded (it loads once per open), or the line saying they didn't. */
  let body: KeyedTab | null = null;
  let known: ContactEntry[] = [];

  // ---------- the deck (TEXTS) ----------
  /** The deck once TEXTS has been looked at; before that nothing is connected, so nothing gets read. */
  let deck: TextsDeck | null = null;
  /** The thread the deck was last told to show while TEXTS is up; null: it's put away. */
  let showing: string | null = null;
  let deckWatch: MutationObserver | null = null;
  const watchDeck = (d: TextsDeck) => {
    deckWatch = typeof MutationObserver === 'function' ? new MutationObserver(deckMoved) : null;
    deckWatch?.observe(d.mount, { childList: true, subtree: true });
  };
  /** Put away, not ended: a text's controls, PASS TIME and an EDIT close; the thread, the draft and the connection stay. */
  function putAway(): void {
    clearTimeout(settle);
    if (!deck) return;
    deck.mount.style.visibility = '';
    if (showing === null && !pendingOpen) return;
    showing = null;
    pendingOpen = false;
    while (deck.deck.escape());
    deck.deck.away();
  }
  /** A thread waits to be asked for (the list is still moving): the last one's is out of sight and can't be typed into. */
  let settle: ReturnType<typeof setTimeout> | undefined;
  let pendingOpen = false;
  /** The deck follows the tab and the pick: their thread while TEXTS is up, away otherwise (so texts stay unread). */
  function syncDeck(): void {
    const c = body?.picked?.();
    const want = tab === 'texts' && c && hasThread(o.memory, c.id) ? c.id : null;
    if (!want) return putAway();
    const d = ensureDeck(want);
    d.mount.style.setProperty('--who', JSON.stringify(c!.name.toUpperCase()));
    if (showing === want && !pendingOpen) return;
    clearTimeout(settle);
    const openNow = () => {
      pendingOpen = false;
      showing = want;
      d.mount.style.visibility = '';
      // The thread it already holds comes back as it was (no blank column); another's is opened fresh.
      if (o.memory.open === want && o.memory.thread?.contact === want) d.deck.back();
      else d.deck.open(want);
      textsBox(d)?.focus();
    };
    // Coming onto the tab: at once. Walking the list while it's up: once it rests, with the last thread hidden meanwhile.
    if (showing === null && !pendingOpen) return openNow();
    pendingOpen = true;
    d.mount.style.visibility = 'hidden';
    settle = setTimeout(openNow, TEXTS_SETTLE_MS);
  }
  /** Made on the first look, already on the thread asked for: a deck with none open would read the list's first. */
  function ensureDeck(first: string): TextsDeck {
    if (deck) return deck;
    o.memory.open = first;
    deck = o.deck();
    watchDeck(deck);
    return deck;
  }
  /** The deck drew again: its threads may have come in (who has a number, their last text), or it fell back to another's thread. */
  let threadsSeen = '';
  function deckMoved(): void {
    if (!screen.isOpen) return;
    const sig = o.memory.threads.map((t) => `${t.id}:${t.last?.clock ?? ''}:${t.last?.text ?? ''}`).join('|');
    const c = body?.picked?.();
    // Someone with no number, found out only now: the deck opened the list's first instead. Their line, not that thread.
    const wrong = (showing !== null || pendingOpen) && c && !hasThread(o.memory, c.id);
    if (sig === threadsSeen && !wrong) return;
    threadsSeen = sig;
    if (wrong) body?.page?.(tab);
    else body?.refresh?.();
    syncDeck();
    later();
  }
  /** What TEXTS shows for the pick. */
  const textsFor = (c: ContactEntry): HTMLElement => {
    if (!hasThread(o.memory, c.id)) return noNumber(c.name);
    return ensureDeck(c.id).mount;
  };
  const unreadIds = () => new Set(o.unread().map((f) => f.id));

  function head(): void {
    const from = o.unread();
    for (const b of tabs) {
      const t = b.dataset.tab as PeopleTab;
      const inner = el('span', '', TAB_NAME[t]);
      if (t === 'texts' && from.length > 0) inner.append(el('span', 'pe-n tp-n new', `${from.length} NEW`));
      b.replaceChildren(inner);
      b.classList.toggle('on', t === tab);
    }
    const sep = () => el('i', '', ' · ');
    const parts: (Node | string)[] = [];
    if (known.length) parts.push(el('b', '', String(known.length)), ' KNOWN');
    if (from.length) parts.push(sep(), el('span', 'pe-newfrom', 'NEW'), ' FROM ', el('b', '', from.map((f) => f.name.toUpperCase()).join(', ')));
    const here = known.find((c) => c.id === o.current);
    if (here) parts.push(sep(), 'WITH ', el('b', '', here.name.toUpperCase()));
    panel.nums.replaceChildren(...parts);
    panel.hints(HINTS[tab]);
  }

  /** The leader: from the picked row to their name, in their colour. */
  function leads(): void {
    const c = body?.picked?.();
    panel.lead('pick', pane.querySelector('.pe-tile.on'), pane.querySelector('.pe-right .pe-name'), { within: pane.querySelector('.pe-roster'), toWithin: pane.querySelector('.pe-right'), fromGap: 6, toGap: 28, ...(c ? { color: c.accent } : {}) });
  }
  let queued = 0;
  const later = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      if (screen.isOpen) leads();
    });
  };
  const watch = typeof MutationObserver === 'function' ? new MutationObserver(later) : null;
  watch?.observe(pane, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  pane.addEventListener('scroll', later, true);
  pane.addEventListener('load', later, true);

  /** Who the list opens on, once it's in: a text's sender asked for while it was still loading too. */
  let start = o.contact ?? null;
  function show(t: PeopleTab, contact?: string | null): void {
    tab = t;
    pane.dataset.tab = t;
    if (contact) {
      if (body) body.select?.(contact);
      else start = contact;
    }
    head();
    if (body?.page) {
      body.page(t);
      syncDeck();
      leads();
      return;
    }
    // No list (still loading, nobody yet, a failed load): JOURNAL still shows, since it's the one you're with.
    pane.replaceChildren(t === 'journal' ? o.journal.element : (body ?? el('div', 'pe-loading', 'LOADING…')));
  }

  /** Another's file selected: her JOURNAL isn't yours to read, so the tab goes off and FILE comes up; TEXTS goes to their thread. */
  function selected(here: boolean): void {
    journalTab.disabled = !here;
    if (!here && tab === 'journal') {
      tab = 'file';
      pane.dataset.tab = tab;
      head();
    }
    syncDeck();
    later();
  }

  const swap = (node: KeyedTab) => {
    if (!screen.isOpen) return;
    body = node;
    pane.replaceChildren(node);
    show(tab);
  };
  void Promise.all([o.contacts(), o.leads().catch(() => [] as LeadView[])]).then(
    ([list, held]) => {
      known = list;
      swap(
        contactsTab(list, held, {
          current: o.current,
          dev: o.dev,
          pick: o.pick,
          start,
          journal: o.journal.element,
          texts: textsFor,
          unread: unreadIds,
          thread: (id) => o.memory.threads.find((t) => t.id === id) ?? null,
          onSelect: selected,
          onOutfit: o.onOutfit,
          figureEdits: o.figureEdits?.() ?? false,
          onFit: o.onFit,
        }),
      );
    },
    () => swap(el('div', 'pe-error', "Couldn't load your contacts.")),
  );

  function turnPage(dir: 1 | -1): boolean {
    const to = PEOPLE_TABS[PEOPLE_TABS.indexOf(tab) + dir];
    if (!to || (to === 'journal' && journalTab.disabled)) return false;
    show(to);
    return true;
  }

  const onKey = (e: KeyboardEvent) => {
    // A bug report over the screen takes the keys (its own listener comes later on window).
    if (bugReportOpen()) return;
    const alt = e.altKey && !e.ctrlKey && !e.metaKey;
    // Alt+P (PEOPLE itself) closes it, from any tab.
    if (alt && e.code === 'KeyP') {
      e.preventDefault();
      e.stopPropagation();
      requestClose();
      return;
    }
    const byKey = alt ? TAB_KEY[e.code] : undefined;
    const toQuest = alt ? QUEST_KEY[e.code] : undefined;
    if (toQuest) {
      e.preventDefault();
      e.stopPropagation();
      o.toQuest?.(toQuest);
      return;
    }
    if (byKey) {
      e.preventDefault();
      e.stopPropagation();
      if (byKey === tab) requestClose();
      else show(byKey);
      return;
    }
    const active = document.activeElement;
    if (e.key === 'Escape') {
      // A note's edit box cancels the edit with Esc, and the dossier page reverts its draft: leave it to them.
      if (o.journal.busy && active?.closest('.jr-edit, .jr-keys-edit, .jd-text')) return;
      e.preventDefault();
      e.stopPropagation();
      // TEXTS: the top thing first (a photo, a text's controls, PASS TIME, an EDIT); FILE: ADJUST FIGURE.
      if (tab === 'texts' && deck?.deck.escape()) return;
      if (tab === 'file' && body?.escape?.()) return;
      if (o.journal.busy) refuse();
      else close();
      return;
    }
    if (e.key === 'Tab' || e.key === 'F8') return; // Tab is the screen cycle's, F8 the bug report's
    const box = tab === 'texts' ? textsBox(deck) : null;
    const inBox = box !== null && active === box;
    // TEXTS: a letter typed anywhere goes to the box (Space on a focused button is the button's).
    const mine = active instanceof Element && screen.root.contains(active);
    if (tab === 'texts' && box && !inBox && e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey && !typing(active) && !(e.key === ' ' && mine && active instanceof HTMLButtonElement)) box.focus();
    // ↑ / ↓ / Enter belong to the list, never to the room behind; a field of the screen's own keeps its keys (the
    // text box gives up ↑ / ↓ only while it's empty), and a focused button of its own takes its Enter.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.shiftKey && (!typing(active) || (inBox && box!.value === ''))) {
      e.preventDefault();
      e.stopPropagation();
      panelCue('row');
      body?.handleKey?.(e);
      return;
    }
    if (e.key === 'Enter' && !e.altKey && !typing(active)) {
      if (onButton(active)) return void e.stopPropagation();
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && tab === 'file') body?.handleKey?.(e);
      return;
    }
    // ← / → turn the tab; in TEXTS only while the box is empty (else they move its caret).
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && (!typing(active) || (inBox && box!.value === ''))) {
      e.preventDefault();
      e.stopPropagation();
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      let i = PEOPLE_TABS.indexOf(tab);
      for (let n = 0; n < PEOPLE_TABS.length; n++) {
        i = (i + step + PEOPLE_TABS.length) % PEOPLE_TABS.length;
        if (PEOPLE_TABS[i] !== 'journal' || !journalTab.disabled) break;
      }
      if (PEOPLE_TABS[i] !== tab) panelCue('tab');
      show(PEOPLE_TABS[i]);
      return;
    }
    // TEXTS: nothing else reaches the room behind (its prompt, its Alt keys), box or no box: a chord, or a key
    // pressed outside the thread. Not prevented: copy and paste still work in the box.
    if (tab === 'texts' && (e.altKey || e.ctrlKey || e.metaKey || !(e.target instanceof Element && e.target.closest('.tx-deck')))) e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
  // Keys typed in the thread are the thread's: none bubble on to the room's listeners (but F8, the bug report).
  pane.addEventListener('keydown', (e) => {
    if (e.key !== 'F8' && e.target instanceof Element && e.target.closest('.tx-deck')) e.stopPropagation();
  });

  /** Set by a switch: nothing stays on screen, so there's no Esc to swallow afterwards. */
  let instantClose = false;
  function close(instant = false): void {
    instantClose = instant;
    screen.close(instant);
  }

  function requestClose(instant = false): boolean {
    if (o.journal.busy) {
      refuse();
      return false;
    }
    close(instant);
    return true;
  }

  // A deck from an earlier look is still away: asked for its list again, so the last texts shown are today's.
  deck = o.kept?.() ?? null;
  if (deck) {
    watchDeck(deck);
    deck.deck.away();
  }
  show(tab);
  return {
    close,
    requestClose,
    show,
    turnPage,
    setUnread() {
      head();
      body?.refresh?.();
    },
    get tab() {
      return tab;
    },
  };
}
