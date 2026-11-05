/**
 * The table's shell (the hand spec §5): a card table over the dimmed room. The beat's prose, the dealt cards in the
 * middle, and along the bottom your hand, then the rail: TAKE, ALARM and NERVE as three stacks (PUSH goes after NERVE).
 */
import './table.css';
import { ALARM_MAX } from '../../../../shared/dice';
import { el, isPhone, proseNodes } from './el';

export interface TableShell {
  root: HTMLElement;
  open(): void;
  close(): void;
  corners(o: { take?: { filled: number; size: number }; alarm?: number; nerve?: { left: number; max: number } }): void;
  prose(text: string): void;
  middle: HTMLElement;
  bottom: HTMLElement;
  /** The rail's box, for a piece that goes beside its stacks (PUSH). */
  rail: HTMLElement;
  /** HUD mode (the job table, 2026-11-02 mockup graft-layouts.html A): the bar across the top (title, then the clocks). */
  top?: HTMLElement;
  /** HUD mode: the column left of the moment (the job's words). */
  log?: HTMLElement;
  /** HUD mode: the column right of the moment (PUSH, SAFE, BOLD). */
  levers?: HTMLElement;
}

/** One of the rail's stacks: its number, a cell per step from the bottom up (the filled ones lit), its word. */
function stack(box: HTMLElement, filled: number, size: number, word: string, aria: string): void {
  const cells = el('span', 'tb-stack');
  for (let i = 0; i < size; i++) cells.append(el('i', i < filled ? 'f' : ''));
  box.setAttribute('aria-label', aria);
  box.replaceChildren(el('span', 'tb-num', String(filled)), cells, el('span', 'tb-word', word));
}

/** A piece's picture (web/public/table/). */
export function piece(name: 'nerve' | 'push' | 'blown' | 'dark' | 'open' | 'wire', cls: string): HTMLImageElement {
  const img = el('img', cls);
  img.src = `/table/${name}.webp`;
  img.alt = '';
  return img;
}

/** Shells up now, and who hears when the first opens or the last closes (the table music). */
const openShells = new Set<HTMLElement>();
const watchers = new Set<(on: boolean) => void>();
const shown = (root: HTMLElement, on: boolean) => {
  const was = openShells.size > 0;
  if (on) openShells.add(root);
  else openShells.delete(root);
  if (was !== openShells.size > 0) for (const fn of watchers) fn(!was);
};
export function watchTables(fn: (on: boolean) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

/**
 * `hud`: the job table's layout (mockup graft-layouts.html A): the title and clocks in a bar across the top, the job's
 * words left of the moment, the levers right of it, the hand along the bottom; no panels behind any of it.
 */
export function mountTableShell(host: HTMLElement, o: { hud?: boolean } = {}): TableShell {
  const root = el('div', `tb${o.hud ? ' hud' : ''}`);
  root.hidden = true;
  const right = el('div', 'tb-corner tb-right');
  const take = el('div', 'tb-take');
  const alarm = el('div', 'tb-alarm');
  const nerve = el('div', 'tb-nerve');
  right.append(take, alarm, nerve);
  const prose = el('div', 'tb-prose');
  const middle = el('div', 'tb-middle');
  const bottom = el('div', 'tb-bottom');
  const top = o.hud ? el('div', 'tb-top') : undefined;
  const log = o.hud ? el('div', 'tb-log') : undefined;
  const levers = o.hud ? el('div', 'tb-levers') : undefined;
  if (top && log && levers) {
    // HUD: the clocks headline the top bar; the prose opens the log.
    top.append(right);
    log.append(prose);
    root.append(top, log, middle, levers, bottom);
  } else {
    // The rail at the right end of the bottom row (the hand goes before it).
    bottom.append(right);
    root.append(prose, middle, bottom);
  }
  host.append(root);
  const game = () => (host.closest('#game') as HTMLElement | null) ?? (host.id === 'game' ? host : null);
  return {
    root,
    middle,
    bottom,
    rail: right,
    ...(top ? { top } : {}),
    ...(log ? { log } : {}),
    ...(levers ? { levers } : {}),
    open() {
      root.hidden = false;
      root.classList.toggle('phone', isPhone(host));
      game()?.classList.add('tb-dim');
      shown(root, true);
    },
    close() {
      root.hidden = true;
      // The dim stays while another table is still up (SETUP closing over a job's debrief).
      const g = game();
      if (g && !g.querySelector('.tb:not([hidden])')) g.classList.remove('tb-dim');
      shown(root, false);
    },
    corners(o) {
      take.hidden = !o.take;
      if (o.take) stack(take, o.take.filled, o.take.size, 'TAKE', `TAKE ${o.take.filled}/${o.take.size}`);
      alarm.hidden = o.alarm === undefined;
      if (o.alarm !== undefined) {
        const out = o.alarm >= ALARM_MAX;
        alarm.classList.toggle('out', out);
        stack(alarm, o.alarm, ALARM_MAX, out ? 'GET OUT' : 'ALARM', `ALARM ${o.alarm}/${ALARM_MAX}`);
      }
      nerve.hidden = !o.nerve;
      if (o.nerve) {
        nerve.classList.toggle('gone', o.nerve.left === 0);
        stack(nerve, o.nerve.left, o.nerve.max, o.nerve.left ? 'NERVE' : 'GONE', `NERVE ${o.nerve.left}/${o.nerve.max}`);
      }
    },
    prose(text) {
      prose.replaceChildren(...proseNodes(text));
    },
  };
}
