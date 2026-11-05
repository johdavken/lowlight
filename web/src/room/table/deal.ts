/**
 * The deal (the hand spec §5): lays cards out from a list, with deal, lift and flip. Used for the setup's approach
 * cards, the choices, STEADY / TAKE IT, the getaway, WALK / PRESS ON and the debrief.
 */
import type { JobEffect, Timing } from '../../../../shared/crew-book';
import { el, type TableCue } from './el';

export interface TableCard {
  id: string;
  face: HTMLElement | string;
  state: 'up' | 'lifted' | 'down' | 'locked' | 'empty';
  /** A recruit's stack in the hand (crew abilities spec §2): their call and abilities, under their id. */
  stack?: string;
  /** Tapped, it plays at once (an AFTER A ROLL ability on a parked roll), instead of lifting. */
  tap?: true;
  /** An ability in a recruit's stack: its glyph under their card, which flips the card to it. */
  glyph?: { kind: JobEffect['kind']; timing: Timing; label: string };
  /** An ability locked for want of NERVE (effect and NERVE spec §3): its tab dims. */
  off?: true;
  /** A program marked to load or run on the next roll (programs spec §2.1). */
  on?: true;
}

export function cardEl(c: TableCard, cls: string): HTMLButtonElement {
  const b = el('button', `${cls} s-${c.state}`);
  b.type = 'button';
  b.dataset.id = c.id;
  b.dataset.state = c.state;
  if (c.on) b.classList.add('on');
  if (typeof c.face === 'string') b.textContent = c.face;
  else b.append(c.face);
  return b;
}

/** A tray's head (SETUP's and a job's LOAD): any tap off the cards closes it, the word is there to be seen. */
export function trayHead(): HTMLElement {
  const shut = el('button', 'ts-tray-shut');
  shut.type = 'button';
  shut.append(el('kbd', '', 'ESC'), document.createTextNode('CLOSE'));
  const head = el('div', 'ts-tray-head');
  head.append(el('div', 'tb-group-label', 'LOAD A PROGRAM'), shut);
  return head;
}

export function mountDeal(host: HTMLElement, o: { onPick(id: string): void; reduced: boolean; cue?(name: TableCue): void }): { deal(cards: TableCard[]): void; flip(id: string): void; clear(): void; root: HTMLElement } {
  const root = el('div', 'tb-deal');
  host.append(root);
  return {
    root,
    deal(cards) {
      root.replaceChildren(
        ...cards.map((c, i) => {
          const b = cardEl(c, 'tb-card');
          if (!o.reduced) {
            b.classList.add('dealt');
            b.style.setProperty('--i', String(i));
          }
          b.addEventListener('click', () => {
            if (b.dataset.state === 'up' || b.dataset.state === 'lifted') o.onPick(c.id);
          });
          return b;
        }),
      );
      if (cards.length) o.cue?.('beat');
    },
    flip(id) {
      const b = [...root.querySelectorAll<HTMLElement>('.tb-card')].find((x) => x.dataset.id === id);
      if (!b) return;
      b.dataset.state = 'down';
      b.className = b.className.replace(/\bs-\w+/, 's-down');
      o.cue?.('lock');
    },
    clear() {
      root.replaceChildren();
    },
  };
}
