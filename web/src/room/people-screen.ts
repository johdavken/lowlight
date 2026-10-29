/**
 * PEOPLE (2026-10-18 spec §2): CONTACTS, LEADS and JOURNAL as tabs of one full screen on the shared frame.
 * Alt+C / Alt+L / Alt+J open it on their tab (main.ts); while it's open they switch tabs, and the open tab's
 * key closes it. ← / → move between tabs when no text field has focus. It won't close over unsaved journal
 * work: Esc and the backdrop flash the page's SAVE instead.
 */
import type { ContactEntry, LeadView, LooseEndsView } from '../../../shared/types';
import type { JournalView } from '../ui/journal';
import { bugReportOpen } from '../ui/bug-report';
import { openScreen, SCREEN_GLITCH_OUT_MS } from '../ui/screen';
import { contactsTab, type KeyedTab } from './people-contacts';
import { leadsTab } from './people-leads';
import { looseEndsTab } from './people-loose-ends';
import './people-screen.css';

export type PeopleTab = 'contacts' | 'leads' | 'journal' | 'loose';
export const PEOPLE_TABS: PeopleTab[] = ['contacts', 'leads', 'journal', 'loose'];
const TAB_NAME: Record<PeopleTab, string> = { contacts: 'CONTACTS', leads: 'LEADS', journal: 'JOURNAL', loose: 'LOOSE ENDS' };
const TAB_KEY: Record<string, PeopleTab> = { KeyC: 'contacts', KeyL: 'leads', KeyJ: 'journal', KeyO: 'loose' };

export interface PeopleOpts {
  tab: PeopleTab;
  contacts(): Promise<ContactEntry[]>;
  leads(): Promise<LeadView[]>;
  /** LOOSE ENDS (cipher spec §2.8); absent: the tab shows nothing noticed. */
  looseEnds?(): Promise<LooseEndsView>;
  journal: JournalView;
  /** The contact you're with. */
  current: string;
  /** Your name, for "AS <NAME>" in the tab band. */
  persona: string | null;
  /** Standing values in the standing word's tooltip. */
  dev: boolean;
  /** Go to a contact. */
  pick(id: string): void;
  reducedMotion?: boolean;
  onClose?(): void;
}

export interface PeopleHandle {
  /** `instant`: a switch to another screen (no glitch-out). */
  close(instant?: boolean): void;
  /** Closes unless the journal has unsaved work; then JOURNAL comes up with its SAVE lit, and false. */
  requestClose(instant?: boolean): boolean;
  show(tab: PeopleTab): void;
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
    className: 'people-screen',
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
    const b = el('button', 'pe-tab');
    b.type = 'button';
    b.dataset.tab = t;
    b.append(el('span', '', TAB_NAME[t]));
    b.addEventListener('click', () => show(t));
    return b;
  });
  band.append(...tabs);
  if (o.persona) band.append(el('span', 'pe-as', `AS ${o.persona.toUpperCase()}`));
  const pane = el('div', 'pe-pane');
  screen.body.append(band, pane);

  let tab: PeopleTab = o.tab;
  /** Bumped on every show (and on close): a load that comes back for an older one draws nothing. */
  let token = 0;
  /** Each tab's content once loaded: it loads once per open (spec §2), keeping its selection across switches. */
  const loaded = new Map<PeopleTab, HTMLElement>();

  function show(t: PeopleTab): void {
    tab = t;
    const mine = ++token;
    for (const b of tabs) b.classList.toggle('on', b.dataset.tab === t);
    pane.dataset.tab = t;
    if (t === 'journal') return void pane.replaceChildren(o.journal.element);
    const have = loaded.get(t);
    if (have) return void pane.replaceChildren(have);
    pane.replaceChildren(el('div', 'pe-loading', 'LOADING…'));
    const draw = (node: HTMLElement, keep = true) => {
      if (keep) loaded.set(t, node);
      if (mine === token && screen.isOpen) pane.replaceChildren(node);
    };
    if (t === 'contacts') {
      void Promise.all([o.contacts(), o.leads().catch(() => [] as LeadView[])]).then(
        ([list, held]) => draw(contactsTab(list, held, { current: o.current, dev: o.dev, pick: o.pick })),
        () => draw(el('div', 'pe-error', "Couldn't load your contacts."), false),
      );
    } else if (t === 'loose') {
      void (o.looseEnds?.() ?? Promise.resolve<LooseEndsView>({ open: [], solved: [] })).then(
        (v) => draw(looseEndsTab(v)),
        () => draw(el('div', 'pe-error', "Couldn't load your loose ends."), false),
      );
    } else {
      void o.leads().then(
        (list) => draw(leadsTab(list)),
        () => draw(el('div', 'pe-error', "Couldn't load your leads."), false),
      );
    }
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
      (pane.firstElementChild as KeyedTab | null)?.handleKey?.(e);
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !typing(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
      const i = PEOPLE_TABS.indexOf(tab) + (e.key === 'ArrowLeft' ? -1 : 1);
      show(PEOPLE_TABS[(i + PEOPLE_TABS.length) % PEOPLE_TABS.length]);
    }
  };
  window.addEventListener('keydown', onKey, true);

  /** Set by a switch: nothing stays on screen, so there's no Esc to swallow afterwards. */
  let instantClose = false;
  function close(instant = false): void {
    token++;
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
    get tab() {
      return tab;
    },
  };
}
