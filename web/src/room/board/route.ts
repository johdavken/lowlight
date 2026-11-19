/**
 * The board's route (crew rules spec 2026-11-17, The board: "the route as a line of beat titles with a fork drawn as a
 * fork and the way not taken struck out"; under each beat still ahead, who unspent has a way there). The table's svg
 * fork (table/route.ts) is drawn for a narrower, shorter strip, and its 14px names crowd at the board's width; the board
 * draws its own fork in two rows of cells instead: the shared start, the two branches one above the other inside a
 * fork's frame, the shared end. A way that doesn't fork-and-rejoin stays the table's ladder.
 */
import type { QuestState } from '../../../../shared/types';
import { fitTitle, wayOf } from '../table/route';
import { el } from '../table/el';

type Route = NonNullable<NonNullable<QuestState['active']>['route']>;
type RouteBeat = Route['ways'][number]['beats'][number];

/** A pixel-caps letter's advance: a beat's title (15px), the names under it (14px). */
const TITLE_CH = 7.8;
const NAME_CH = 7.4;
/** The advance `fitTitle` counts in (table/route.ts, its 14px svg letters). */
const TABLE_CH = 7.6;
/** The second row's top: the branch below, clear of the row above's names. */
export const ROW_B = 44;

/**
 * Who can go at a beat, to fit `px`: every first name if they fit, else the first ones that fit and `+N`, else
 * `N OF YOURS`. Nobody: YOU ALONE.
 */
export function fitNames(names: readonly string[], px: number): string {
  if (!names.length) return 'YOU ALONE';
  const max = Math.floor(px / NAME_CH);
  const up = names.map((n) => n.toUpperCase());
  const all = up.join(' · ');
  if (all.length <= max) return all;
  for (let k = up.length - 1; k >= 1; k--) {
    const s = `${up.slice(0, k).join(' · ')} +${up.length - k}`;
    if (s.length <= max) return s;
  }
  return `${up.length} OF YOURS`;
}

/**
 * The fork, or null when the route isn't two ways that share a start and part (the ladder says it better then).
 * `ahead`: beat id → names with a way there (the view's `ahead`).
 */
export function forkEl(route: Route, at: string, ahead: Record<string, string[]>, width: number): HTMLElement | null {
  if (route.ways.length !== 2) return null;
  const [a, b] = route.ways.map((w) => w.beats);
  let p = 0;
  while (p < a.length && p < b.length && a[p].id === b[p].id) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s].id === b[b.length - 1 - s].id) s++;
  const [ma, mb] = [a.slice(p, a.length - s), b.slice(p, b.length - s)];
  if (p === 0 || !ma.length || !mb.length) return null;
  const head = a.slice(0, p);
  const tail = a.slice(a.length - s);
  const mid = Math.max(ma.length, mb.length);
  const w = width / (head.length + mid + tail.length);
  const on = wayOf(route, at);
  const branch = (i: 0 | 1) => (on === null ? 'dim' : on === i ? 'lit' : 'gone');
  const reached = (id: string) => id === at || route.played.includes(id);
  const box = el('div', 'bw-rt');
  box.style.width = `${width}px`;
  const cell = (beat: RouteBeat, col: number, row: 0 | 1, state: string) => {
    const c = el('div', `bw-rt-b ${beat.id === at ? 'on' : route.played.includes(beat.id) ? 'f' : state}`);
    c.dataset.beat = beat.id;
    c.style.left = `${Math.round(col * w)}px`;
    c.style.top = `${row ? ROW_B : 0}px`;
    c.style.width = `${Math.round(w)}px`;
    c.append(el('span', 'bw-rt-t', fitTitle(beat.title, ((w - 18) * TABLE_CH) / TITLE_CH)));
    const names = ahead[beat.id];
    if (names && state !== 'gone' && !reached(beat.id)) c.append(el('small', 'bw-ahead', fitNames(names, w - 18)));
    box.append(c);
  };
  // The branch below hangs in the fork's frame: down from the line at the fork, along, and back up where they meet.
  const frame = el('div', `bw-rt-fork ${branch(1)}${tail.length ? '' : ' open'}`);
  frame.style.left = `${Math.round(p * w) + 4}px`;
  frame.style.width = `${Math.round(mid * w)}px`;
  frame.style.height = `${ROW_B}px`;
  box.append(frame);
  head.forEach((h, i) => cell(h, i, 0, reached(h.id) ? 'f' : 'dim'));
  ma.forEach((m, i) => cell(m, p + i, 0, branch(0)));
  mb.forEach((m, i) => cell(m, p + i, 1, branch(1)));
  // A shorter top branch still runs its line to the shared end.
  if (ma.length < mid) {
    const run = el('div', `bw-rt-run ${branch(0)}`);
    run.style.left = `${Math.round((p + ma.length) * w) + 4}px`;
    run.style.width = `${Math.round((mid - ma.length) * w)}px`;
    box.append(run);
  }
  tail.forEach((t, i) => cell(t, p + mid + i, 0, reached(t.id) ? 'f' : 'dim'));
  return box;
}
