/**
 * The table's shell (the hand spec §5): a card table over the dimmed room. The beat's prose, the dealt cards in the
 * middle, and along the bottom your hand, then the rail: TAKE, ALARM and NERVE as three stacks (PUSH goes after NERVE).
 */
import './table.css';
import { ALARM_MAX, ALARM_SHIFT } from '../../../../shared/dice';
import { el, isPhone, proseNodes } from './el';

export interface TableShell {
  root: HTMLElement;
  open(): void;
  close(): void;
  /** `soon`: pips about to change, which blink (the trace table): TAKE and ALARM the next ones to fill, NERVE the last ones to be spent. */
  corners(o: { take?: { filled: number; size: number }; alarm?: number; nerve?: { left: number; max: number }; soon?: { take?: number; alarm?: number; nerve?: number } }): void;
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
  /** HUD mode: publish the log region's place for the JOB column (job-column.css); done on open and on resize. */
  publishLog(): void;
}

/** One of the rail's stacks: its number, a cell per step from the bottom up (the filled ones lit), its word. */
function stack(box: HTMLElement, filled: number, size: number, word: string, aria: string, o: { /** Pips about to fill (> 0) or to be spent (< 0): they blink. */ soon?: number; /** Steps where something changes (1-based): marked. */ marks?: readonly number[]; note?: string } = {}): void {
  const cells = el('span', 'tb-stack');
  const soon = o.soon ?? 0;
  for (let i = 0; i < size; i++) {
    const g = soon > 0 ? i >= filled && i < filled + soon : soon < 0 && i < filled && i >= filled + soon;
    cells.append(el('i', [i < filled ? 'f' : '', g ? 'g' : '', o.marks?.includes(i + 1) ? 'mark' : ''].filter(Boolean).join(' ')));
  }
  box.setAttribute('aria-label', aria);
  box.replaceChildren(el('span', 'tb-num', String(filled)), el('span', 'tb-of', `/${size}`), cells, el('span', 'tb-word', word), ...(o.note ? [el('span', 'tb-clock-note', o.note)] : []));
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
/** The HUD tables up and how each publishes its log region: one closing over another (SETUP over a debrief) hands the
 * column's place back to the one still up. */
const hudLogs = new Map<HTMLElement, () => void>();
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
  // The JOB column (job-column.ts) stands in the log region while a HUD table (the job's, SETUP's) is up: its place, as
  // layout pixels on the stage (offsets, so the stage's zoom doesn't enter), for job-column.css.
  const publishLog = () => {
    if (!log || root.hidden) return;
    // The column's place in the region: all of it, or what a table leaves under its own head (`tb-log-at`, the job table's route).
    const found = log.querySelector<HTMLElement>(':scope > .tb-log-at');
    // Not laid out (a board has the table): the whole region.
    const at = found && found.offsetHeight > 0 ? found : null;
    const top = at ? at.offsetTop - log.offsetTop : 0;
    host.style.setProperty('--hud-log-x', `${root.offsetLeft + log.offsetLeft}px`);
    host.style.setProperty('--hud-log-y', `${root.offsetTop + log.offsetTop + Math.max(0, top)}px`);
    host.style.setProperty('--hud-log-w', `${log.offsetWidth}px`);
    host.style.setProperty('--hud-log-h', `${at ? at.offsetHeight : log.offsetHeight}px`);
  };
  if (log && typeof ResizeObserver === 'function') new ResizeObserver(publishLog).observe(log);
  const game = () => (host.closest('#game') as HTMLElement | null) ?? (host.id === 'game' ? host : null);
  return {
    root,
    middle,
    bottom,
    rail: right,
    ...(top ? { top } : {}),
    ...(log ? { log } : {}),
    ...(levers ? { levers } : {}),
    publishLog,
    open() {
      root.hidden = false;
      root.classList.toggle('phone', isPhone(host));
      game()?.classList.add('tb-dim');
      if (log) hudLogs.set(root, publishLog);
      publishLog();
      shown(root, true);
    },
    close() {
      root.hidden = true;
      // The dim stays while another table is still up (SETUP closing over a job's debrief).
      const g = game();
      if (g && !g.querySelector('.tb:not([hidden])')) g.classList.remove('tb-dim');
      hudLogs.delete(root);
      for (const publish of hudLogs.values()) publish();
      shown(root, false);
    },
    corners(o) {
      take.hidden = !o.take;
      if (o.take) stack(take, o.take.filled, o.take.size, 'TAKE', `TAKE ${o.take.filled}/${o.take.size}`, { soon: o.soon?.take });
      alarm.hidden = o.alarm === undefined;
      if (o.alarm !== undefined) {
        const out = o.alarm >= ALARM_MAX;
        alarm.classList.toggle('out', out);
        // What ALARM does, under its clock, and the steps where it does it (shared/dice.ts positionOf, the getaway).
        stack(alarm, o.alarm, ALARM_MAX, out ? 'GET OUT' : 'ALARM', `ALARM ${o.alarm}/${ALARM_MAX}`, { soon: o.soon?.alarm, marks: [ALARM_SHIFT, ALARM_MAX], note: `AT ${ALARM_SHIFT} EVERY POSITION A STEP WORSE · AT ${ALARM_MAX} GET OUT` });
      }
      nerve.hidden = !o.nerve;
      if (o.nerve) {
        nerve.classList.toggle('gone', o.nerve.left === 0);
        stack(nerve, o.nerve.left, o.nerve.max, o.nerve.left ? 'NERVE' : 'GONE', `NERVE ${o.nerve.left}/${o.nerve.max}`, { soon: o.soon?.nerve ? -o.soon.nerve : 0 });
      }
    },
    prose(text) {
      prose.replaceChildren(...proseNodes(text));
    },
  };
}
