/**
 * The job's route over the JOB column (the table in the trace, mockup graft-trace.html FORK / POST): the ways through
 * the job from the view's `route`. Two ways draw as a shared start, two branches and a shared end, the one you're on
 * lit and the one you left struck; a diamond marks a post. Any other shape (one way, three or more) draws the ladder
 * of the way you're on.
 */
import type { QuestState } from '../../../../shared/types';

type Route = NonNullable<NonNullable<QuestState['active']>['route']>;
type RouteBeat = Route['ways'][number]['beats'][number];
const NS = 'http://www.w3.org/2000/svg';
/** The route's width on the table (`o.width` overrides it: the story table's route beside the job's line is wider). */
const W0 = 336;
const [T, M, B] = [18, 44, 70];
/** A pixel-caps letter's advance at the route's size. */
const CH = 7.6;

/** Which way a run is on: the one holding a played or current beat the others don't; null before the fork. */
export function wayOf(route: Route, at: string): number | null {
  const seen = [...route.played, at];
  const mine = route.ways.map((w, i) => (w.beats.some((b) => seen.includes(b.id) && route.ways.every((x, j) => j === i || !x.beats.some((y) => y.id === b.id))) ? i : -1)).filter((i) => i >= 0);
  return mine.length === 1 ? mine[0] : null;
}

/** A title cut to fit `px`: a leading THE goes first, then the end. */
export function fitTitle(title: string, px: number): string {
  const max = Math.max(3, Math.floor(px / CH));
  if (title.length <= max) return title;
  const bare = title.replace(/^THE /, '');
  return bare.length <= max ? bare : `${bare.slice(0, max - 1)}…`;
}

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (cls) n.setAttribute('class', cls);
  return n;
};

function ladder(beats: RouteBeat[], route: Route, at: string, W = W0): HTMLElement {
  const box = document.createElement('div');
  box.className = 'rt-ladder';
  const per = W / Math.max(1, beats.length);
  for (const b of beats) {
    const s = document.createElement('span');
    s.className = b.id === at ? 'on' : route.played.includes(b.id) ? 'f' : '';
    s.dataset.beat = b.id;
    s.textContent = `${fitTitle(b.title, per - 10)}${b.post ? ' ◆' : ''}`;
    box.append(s);
  }
  return box;
}

/**
 * `at`: the beat you're on. `pick`: before the fork, the way the selected card leads (lit; the other dim). `hot`: the
 * beat you're on is covered by a held post (its ring in the crew's colour).
 */
export function routeEl(route: Route, at: string, o: { pick?: number | null; hot?: boolean; width?: number } = {}): HTMLElement | SVGSVGElement {
  const W = o.width ?? W0;
  const on = wayOf(route, at);
  if (route.ways.length !== 2) return ladder((route.ways[on ?? 0] ?? route.ways[0]).beats, route, at, W);
  const [a, b] = route.ways.map((w) => w.beats);
  let p = 0;
  while (p < a.length && p < b.length && a[p].id === b[p].id) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s].id === b[b.length - 1 - s].id) s++;
  const [ma, mb] = [a.slice(p, a.length - s), b.slice(p, b.length - s)];
  // Not a fork-and-rejoin after a shared start (a way that only adds beats): the ladder says it better.
  if (p === 0 || !ma.length || !mb.length) return ladder((route.ways[on ?? 0] ?? route.ways[0]).beats, route, at, W);
  const head = a.slice(0, p);
  const tail = a.slice(a.length - s);
  const mid = Math.max(ma.length, mb.length);
  // Slots along the line: the shared start, room for the branches, the shared end.
  const slots = head.length + mid + tail.length;
  const step = (W - 14) / Math.max(1, slots - 1 + 0.6);
  const xHead = (i: number) => 4 + i * step;
  const x0 = xHead(head.length - 1) + Math.min(30, step * 0.45);
  const x1 = tail.length ? W - 10 - (tail.length - 1) * step - Math.min(30, step * 0.45) : W - 6;
  const xTail = (i: number) => W - 10 - (tail.length - 1 - i) * step;
  const state = (i: 0 | 1) => (on === null ? (o.pick === i ? 'lit' : 'dim') : on === i ? 'lit' : 'gone');
  const root = svg('svg', { width: W, height: 88, viewBox: `0 0 ${W} 88` }, 'rt');
  const branch = (y: number, cls: string) => svg('path', { d: `M${x0} ${M} L${x0 + 26} ${y} H${tail.length ? x1 - 26 : x1}${tail.length ? ` L${x1} ${M}` : ''}` }, cls);
  const reached = (id: string) => id === at || route.played.includes(id);
  root.append(svg('path', { d: `M4 ${M} H${x0}` }, 'lit'), branch(T, state(0)), branch(B, state(1)));
  if (tail.length) root.append(svg('path', { d: `M${x1} ${M} H${xTail(tail.length - 1)}` }, tail.some((t) => reached(t.id)) ? 'lit' : 'dim'));
  const node = (beat: RouteBeat, x: number, y: number, labelY: number, cls: string, anchor: 'start' | 'middle' | 'end', room: number) => {
    const now = beat.id === at;
    const g = svg('g', { 'data-beat': beat.id }, now ? `${o.hot ? 'hot' : 'lit'} cur` : cls);
    if (beat.post) g.append(svg('rect', { x: x - 3.5, y: y - 3.5, width: 7, height: 7, transform: `rotate(45 ${x} ${y})` }, 'pst'));
    else if (!now) g.append(svg('rect', { x: x - 2, y: y - 2, width: 4, height: 4 }, 'tick'));
    if (now) g.append(svg('circle', { cx: x, cy: y, r: beat.post ? 8 : 4.5, ...(beat.post ? { style: 'fill:none' } : {}) }, 'now'));
    const text = svg('text', { x: anchor === 'start' ? x - 4 : anchor === 'end' ? x + 6 : x, y: labelY, 'text-anchor': anchor });
    text.textContent = fitTitle(beat.title, room);
    g.append(text);
    root.append(g);
  };
  head.forEach((h, i) => node(h, xHead(i), M, M - 10, reached(h.id) ? 'lit' : 'dim', i === 0 ? 'start' : 'middle', Math.max(40, step - 8)));
  const lo = x0 + 30;
  const hi = (tail.length ? x1 : W) - 30;
  const along = (list: RouteBeat[], y: number, labelY: number, st: string) => list.forEach((m, i) => node(m, lo + ((i + 0.5) * (hi - lo)) / list.length, y, labelY, reached(m.id) ? 'lit' : st, 'middle', (hi - lo) / list.length - 6));
  along(ma, T, T - 8, state(0));
  along(mb, B, B + 17, state(1));
  tail.forEach((t, i) => node(t, xTail(i), M, i === tail.length - 1 ? M + 18 : M - 9, reached(t.id) ? 'lit' : 'dim', i === tail.length - 1 ? 'end' : 'middle', Math.max(40, step - 8)));
  return root;
}
