/**
 * PEOPLE (2026-10-18 spec §2; panel 2026-11-04): the shared holo pane in amber, a roster of who you know beside the
 * selected one's FILE and, for the one you're with, JOURNAL. LEADS and LOOSE ENDS live on QUEST now.
 * Alt+C / Alt+J open it on their page (main.ts); while it's open they turn it, and the open page's key closes it.
 * ← / → turn the page when no text field has focus, and Tab does on the screen cycle. It won't close over unsaved
 * journal work: Esc and the backdrop flash the page's SAVE instead.
 */
import type { ContactEntry, LeadView } from '../../../shared/types';
import type { JournalView } from '../ui/journal';
import { bugReportOpen } from '../ui/bug-report';
import { openScreen, SCREEN_GLITCH_OUT_MS } from '../ui/screen';
import { contactsTab, type KeyedTab, type PeoplePage } from './people-contacts';
import './people-screen.css';

export type PeopleTab = PeoplePage;
export const PEOPLE_TABS: PeopleTab[] = ['file', 'journal'];
const TAB_NAME: Record<PeopleTab, string> = { file: 'FILE', journal: 'JOURNAL' };
const TAB_KEY: Record<string, PeopleTab> = { KeyC: 'file', KeyJ: 'journal' };
/** Their keys still work from here, and go to QUEST. */
const QUEST_KEY: Record<string, 'leads' | 'loose'> = { KeyL: 'leads', KeyO: 'loose' };

export interface PeopleOpts {
  tab: PeopleTab;
  contacts(): Promise<ContactEntry[]>;
  leads(): Promise<LeadView[]>;
  journal: JournalView;
  /** The contact you're with. */
  current: string;
  /** Your name, for "AS <NAME>" in the head. */
  persona: string | null;
  /** Standing values in the standing word's tooltip. */
  dev: boolean;
  /** Go to a contact. */
  pick(id: string): void;
  /** Alt+L / Alt+O, from here. */
  toQuest?(tab: 'leads' | 'loose'): void;
  reducedMotion?: boolean;
  onClose?(): void;
}

export interface PeopleHandle {
  /** `instant`: a switch to another screen (no glitch-out). */
  close(instant?: boolean): void;
  /** Closes unless the journal has unsaved work; then JOURNAL comes up with its SAVE lit, and false. */
  requestClose(instant?: boolean): boolean;
  show(tab: PeopleTab): void;
  /** The screen cycle's Tab: FILE → JOURNAL (1) or back (-1); false past either end, or with no JOURNAL to turn to. */
  turnPage(dir: 1 | -1): boolean;
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
    className: 'scr-holo people-screen',
    label: 'People',
    accent: '#ffc56b',
    reducedMotion: o.reducedMotion,
    canClose: () => {
      if (!o.journal.busy) return true;
      refuse();
      return false;
    },
    onClose: () => {
      window.removeEventListener('keydown', onKey, true);
      if (instantClose) return void o.onClose?.();
      // Still on screen while it glitches out: Esc mustn't reach the room (back to the dial-in) until it's gone.
      if (!o.reducedMotion) {
        window.addEventListener('keydown', swallowEsc, true);
        setTimeout(() => window.removeEventListener('keydown', swallowEsc, true), SCREEN_GLITCH_OUT_MS);
      }
      o.onClose?.();
    },
  });
  const swallowEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || bugReportOpen()) return;
    e.preventDefault();
    e.stopPropagation();
  };
  /** A field of the screen's own (the dossier page, a note's edit): keys in it are the field's. */
  const typing = (n: Element | null) => (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) && screen.root.contains(n);
  /** A focused button of the screen's own (Tab) takes its Enter; a roster tile doesn't (Enter goes to the selection). */
  const onButton = (n: Element | null) => n instanceof HTMLButtonElement && screen.root.contains(n) && !n.classList.contains('pe-tile');
  /** Unsaved journal work refuses a close: JOURNAL comes up with its SAVE lit, wherever you were. */
  function refuse(): void {
    if (tab !== 'journal') show('journal');
    o.journal.flashSave();
  }

  const band = el('nav', 'pe-tabs');
  const tabs = PEOPLE_TABS.map((t) => {
    const b = el('button', 'pe-tab', TAB_NAME[t]);
    b.type = 'button';
    b.dataset.tab = t;
    b.addEventListener('click', () => show(t));
    return b;
  });
  band.append(...tabs);
  screen.head.replaceChildren(el('span', '', '◆ PEOPLE'), el('span', 'pe-as', o.persona ? `AS ${o.persona.toUpperCase()}` : ''), el('span', 'pe-esc', 'ESC'));
  const pane = el('div', 'pe-pane');
  screen.body.append(band, pane);
  const journalTab = tabs[PEOPLE_TABS.indexOf('journal')];

  let tab: PeopleTab = o.tab;
  /** The roster and file once loaded (it loads once per open), or the line saying they didn't. */
  let body: KeyedTab | null = null;

  function show(t: PeopleTab): void {
    tab = t;
    for (const b of tabs) b.classList.toggle('on', b.dataset.tab === t);
    pane.dataset.tab = t;
    if (body?.page) return body.page(t);
    pane.replaceChildren(t === 'journal' ? o.journal.element : (body ?? el('div', 'pe-loading', 'LOADING…')));
  }

  /** Another's file selected: her JOURNAL isn't yours to read, so the tab goes off and FILE comes up. */
  function selected(here: boolean): void {
    journalTab.disabled = !here;
    if (!here && body && tab === 'journal') show('file');
  }

  const swap = (node: KeyedTab) => {
    if (!screen.isOpen) return;
    body = node;
    if (node.page) pane.replaceChildren(node);
    show(tab);
  };
  void Promise.all([o.contacts(), o.leads().catch(() => [] as LeadView[])]).then(
    ([list, held]) => swap(contactsTab(list, held, { current: o.current, dev: o.dev, pick: o.pick, journal: o.journal.element, onSelect: selected })),
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
    // Alt+P (PEOPLE itself) closes it, from any tab.
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyP') {
      e.preventDefault();
      e.stopPropagation();
      requestClose();
      return;
    }
    const byKey = e.altKey && !e.ctrlKey && !e.metaKey ? TAB_KEY[e.code] : undefined;
    const toQuest = e.altKey && !e.ctrlKey && !e.metaKey ? QUEST_KEY[e.code] : undefined;
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
    if (e.key === 'Escape') {
      // A note's edit box cancels the edit with Esc, and the dossier page reverts its draft: leave it to them.
      if (o.journal.busy && document.activeElement?.closest('.jr-edit, .jr-keys-edit, .jd-text')) return;
      e.preventDefault();
      e.stopPropagation();
      if (o.journal.busy) refuse();
      else close();
      return;
    }
    // ↑ / ↓ / Enter belong to the open tab (its roster or list), never to the room behind; a field of the
    // screen's own keeps its keys, and a focused button of its own takes its Enter.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') && !e.altKey && !typing(document.activeElement)) {
      if (e.key === 'Enter' && onButton(document.activeElement)) return void e.stopPropagation();
      e.preventDefault();
      e.stopPropagation();
      body?.handleKey?.(e);
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !typing(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
      turnPage(tab === 'file' ? 1 : -1);
    }
  };
  window.addEventListener('keydown', onKey, true);

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

  show(tab);
  return {
    close,
    requestClose,
    show,
    turnPage,
    get tab() {
      return tab;
    },
  };
}
