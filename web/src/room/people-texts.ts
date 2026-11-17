/**
 * TEXTS, as PEOPLE's middle tab (in-game texts spec §2; folded into PEOPLE 2026-11-15, mockup people-trace.html): the
 * deck in the room. The deck's client (`mountDeck`, look holo) is made once for the page (`textsDeck`) and kept
 * connected: leaving the tab only puts it away, so a text that lands, fails or gets her reply while it's away is
 * there when the tab comes back (final review C1, I3). Its own list and header are hidden (deck/holo.css): PEOPLE's
 * list picks the thread, so the deck opens no thread of its own choosing (`picks: false`).
 */
import { memoryNav, mountDeck, type DeckHandle, type DeckMemory } from '../deck/deck-client';
import type { ConnectDeck } from '../deck/deck-socket';
import './people-texts.css';

/** The page's deck: its client, mounted once, and the element the tab shows it in. */
export interface TextsDeck {
  mount: HTMLElement;
  deck: DeckHandle;
}

export function textsDeck(memory: DeckMemory, connect?: ConnectDeck): TextsDeck {
  const mount = document.createElement('div');
  mount.className = 'tx-deck';
  return { mount, deck: mountDeck(mount, { look: 'holo', nav: memoryNav(memory), memory, connect, picks: false }) };
}

/** Tab in a field of the tab's PASS TIME panel is the field's, not the screen cycle's. */
export function textsOwnsTab(el: Element | null): boolean {
  return el instanceof HTMLInputElement && el.closest('.people-screen .dk-sheet') !== null;
}

/** Whether `id` has a thread: yes until the deck's threads are in (then only the ones it lists). */
export function hasThread(memory: DeckMemory, id: string): boolean {
  return memory.threads.length === 0 || memory.threads.some((t) => t.id === id);
}

/** The line for someone you can't text. */
export function noNumber(name: string): HTMLElement {
  const n = document.createElement('div');
  n.className = 'pe-nonum';
  n.textContent = `No number for ${name} yet.`;
  return n;
}

/** How long the list rests on someone before their thread is asked for (and so read): walking past reads nobody. */
export const TEXTS_SETTLE_MS = 200;

/** The deck's text box, when a thread is up and can be written to. */
export const textsBox = (d: TextsDeck | null): HTMLTextAreaElement | null => d?.mount.querySelector<HTMLTextAreaElement>('.dk-box') ?? null;
