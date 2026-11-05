/**
 * TEXTS (in-game texts spec §2): the deck in the room, a holo glass pane over the dimmed room. The deck's client
 * (`mountDeck`, look holo) is made once for the page (`textsDeck`) and kept connected: putting the pane away only
 * takes it off screen, so a text that lands, fails or gets her reply while it's away is there when it opens again
 * (final review C1, I3). Esc closes the top thing first; keys never reach the room while it's up.
 */
import { memoryNav, mountDeck, type DeckHandle, type DeckMemory } from '../deck/deck-client';
import type { ConnectDeck } from '../deck/deck-socket';
import { bugReportOpen } from './bug-report';
import './texts-screen.css';

/** How long the pane's flicker-out runs before it's gone. */
export const TEXTS_OUT_MS = 250;

/** The page's deck: its client, mounted once, and the element the pane shows it in. */
export interface TextsDeck {
  mount: HTMLElement;
  deck: DeckHandle;
}

export function textsDeck(memory: DeckMemory, connect?: ConnectDeck): TextsDeck {
  const mount = document.createElement('div');
  mount.className = 'tx-deck';
  return { mount, deck: mountDeck(mount, { look: 'holo', nav: memoryNav(memory), memory, connect }) };
}

/** Tab in a field of the pane's PASS TIME panel is the field's, not the screen cycle's. */
export function textsOwnsTab(el: Element | null): boolean {
  return el instanceof HTMLInputElement && el.closest('.tx-root .dk-sheet') !== null;
}

export interface TextsOpts {
  /** The thread to open on (the texts notice's sender); else the one open last, else the list's first. */
  contact?: string | null;
  deck: TextsDeck;
  reducedMotion: boolean;
  /** Called as soon as it starts closing (the room's chrome is free again). */
  onClose(): void;
}

export interface TextsHandle {
  /** `instant`: a switch to another screen; gone at once, no flicker-out. */
  close(instant?: boolean): void;
  show(contact: string): void;
  readonly isOpen: boolean;
}

export function openTexts(host: HTMLElement, o: TextsOpts): TextsHandle {
  // One pane: a reopen during the last one's flicker-out takes its place at once.
  for (const old of host.querySelectorAll(':scope > .tx-root')) old.remove();
  const root = document.createElement('div');
  root.className = 'tx-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Texts');
  const pane = document.createElement('div');
  pane.className = o.reducedMotion ? 'tx-pane' : 'tx-pane tx-in';
  const { mount, deck } = o.deck;
  pane.append(mount);
  root.append(pane);
  host.append(root);
  if (o.contact) deck.open(o.contact);
  else deck.back();
  // The box has the keys from the start: typing never goes to the room's prompt behind the pane (final review I2).
  const box = () => mount.querySelector<HTMLTextAreaElement>('.dk-box');
  box()?.focus();

  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  // Keys typed in the pane are the pane's: none bubble on to the room's listeners (but F8, the bug report).
  pane.addEventListener('keydown', (e) => {
    if (e.key !== 'F8') e.stopPropagation();
  });
  const onKey = (e: KeyboardEvent) => {
    if (bugReportOpen() || e.key === 'Tab' || e.key === 'F8') return; // Tab is the screen cycle's, F8 the bug report's
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyX') {
      e.preventDefault();
      e.stopPropagation();
      return close();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!deck.escape()) close();
      return;
    }
    // Any other chord, or a key typed outside the pane, never reaches the room (its Alt keys, its typing focus).
    // Not prevented: copy and paste still work in the box. A letter typed outside goes to the box.
    const inside = e.target instanceof Node && pane.contains(e.target);
    if (!inside && e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) box()?.focus();
    if (e.altKey || e.ctrlKey || e.metaKey || !inside) e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);

  const swallowEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || bugReportOpen()) return;
    e.preventDefault();
    e.stopPropagation();
  };
  let open = true;
  function close(instant = false): void {
    if (!open) return;
    open = false;
    window.removeEventListener('keydown', onKey, true);
    // Put away, not ended: the menu, PASS TIME and an EDIT close; the thread, the draft and the connection stay.
    while (deck.escape());
    deck.away();
    o.onClose();
    if (o.reducedMotion || instant) return root.remove();
    // Still on screen while it flickers out: Esc mustn't reach the room (back to the dial-in) until it's gone.
    root.classList.add('tx-closing');
    window.addEventListener('keydown', swallowEsc, true);
    setTimeout(() => {
      window.removeEventListener('keydown', swallowEsc, true);
      root.remove();
    }, TEXTS_OUT_MS);
  }

  return {
    close,
    show: (contact) => deck.open(contact),
    get isOpen() {
      return open;
    },
  };
}
