/**
 * Slip's board (spec §5): the building as its own camera feed. Paths on an isometric floor, pads
 * for nodes, glowing silhouettes for you, the guards and the cameras, red sight wedges, and the
 * next turn's sight in dashed red. The floor, paths and routes are drawn once; pads and wedges are
 * redrawn each render; the figures persist, so a move animates (CSS transform transitions).
 */
import { camLabel, DU, DV, guardLabel, predictWatch, watchedBy, type Dir, type SlipBoard, type SlipState } from '../../../../shared/slip/rules';
import './slip.css';

export interface SlipViewOpts {
  onNode: (id: number) => void;
  reducedMotion: boolean;
  placeName: string;
}
export interface SlipMarks {
  sel: number | null;
  /** NOISE or JAM being aimed: the nodes it can go to, and the one picked. */
  aim: { targets: number[]; cur: number } | null;
  /** Linked nodes you can step to. */
  moves: number[];
}

const NS = 'http://www.w3.org/2000/svg';
const SCALE = 66;
const C30 = Math.cos(Math.PI / 6);
const S30 = Math.sin(Math.PI / 6);

/** A lattice cell on screen. */
export function slipProject(u: number, v: number): [number, number] {
  return [(u - v) * C30 * SCALE, (u + v) * S30 * SCALE];
}

let instances = 0;

/** A small chevron `t` of the way from a to b, pointing at b. */
function arrow(parent: Element, a: [number, number], b: [number, number], t: number): void {
  const [x, y] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [dx, dy] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const back = (side: number): [number, number] => [x - dx * 6 + -dy * 4 * side, y - dy * 6 + dx * 4 * side];
  svg(parent, 'polyline', { class: 'slip-route-arrow', points: pts([back(1), [x, y], back(-1)]) });
}

function svg<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}
const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const diamond = (u: number, v: number, r: number) =>
  pts([
    slipProject(u - r, v - r),
    slipProject(u + r, v - r),
    slipProject(u + r, v + r),
    slipProject(u - r, v + r),
  ]);
function screenDir(d: Dir): [number, number] {
  const [x, y] = slipProject(DU[d], DV[d]);
  const l = Math.hypot(x, y);
  return [x / l, y / l];
}

interface Figure {
  g: SVGGElement;
  tag: SVGTextElement;
  visor?: SVGLineElement;
  lens?: SVGCircleElement;
}

export class SlipBoardView {
  private readonly screen: HTMLElement;
  private readonly svgEl: SVGSVGElement;
  private readonly wedges: SVGGElement;
  private readonly pads: SVGGElement;
  private readonly next: SVGGElement;
  private readonly figs: SVGGElement;
  private readonly turn: SVGTextElement;
  private readonly you: Figure;
  private readonly guards: Figure[];
  private readonly cams: Figure[];
  private readonly id = `slip${++instances}`;
  private readonly onClick = (e: Event) => {
    const pad = (e.target as Element).closest?.('.slip-pad');
    if (pad && pad.getAttribute('data-id') !== null) this.opts.onNode(Number(pad.getAttribute('data-id')));
  };

  constructor(
    host: HTMLElement,
    private readonly board: SlipBoard,
    private readonly opts: SlipViewOpts,
  ) {
    this.screen = document.createElement('div');
    this.screen.className = 'slip-screen';
    this.screen.classList.toggle('slip-motion', !opts.reducedMotion);
    const at = board.nodes.map((n) => slipProject(n.u, n.v));
    const xs = at.map((p) => p[0]);
    const ys = at.map((p) => p[1]);
    const x0 = Math.min(...xs) - 70;
    const x1 = Math.max(...xs) + 70;
    const y0 = Math.min(...ys) - 92;
    const y1 = Math.max(...ys) + 44;
    this.svgEl = document.createElementNS(NS, 'svg');
    this.svgEl.setAttribute('class', 'slip-svg');
    this.svgEl.setAttribute('viewBox', `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`);
    this.svgEl.setAttribute('role', 'img');
    this.svgEl.setAttribute('aria-label', 'The floor, on the building’s cameras');
    this.screen.append(this.svgEl);
    for (const fx of ['roll', 'scan', 'mask', 'glare', 'vig']) {
      const d = document.createElement('div');
      d.className = `slip-fx slip-fx-${fx}`;
      this.screen.append(d);
    }
    host.append(this.screen);
    this.svgEl.addEventListener('click', this.onClick);

    const defs = svg(this.svgEl, 'defs');
    // The bloom covers the whole board, so its region stays tight; a figure's glow needs room around it.
    const filter = (name: string, blur: number, pad: number) => {
      const f = svg(defs, 'filter', { id: `${this.id}-${name}`, x: `-${pad}%`, y: `-${pad}%`, width: `${100 + 2 * pad}%`, height: `${100 + 2 * pad}%` });
      svg(f, 'feGaussianBlur', { stdDeviation: blur, result: 'b' });
      const m = svg(f, 'feMerge');
      svg(m, 'feMergeNode', { in: 'b' });
      svg(m, 'feMergeNode', { in: 'SourceGraphic' });
    };
    filter('glow', 2, 50);
    filter('bloom', 3, 10);
    const root = svg(this.svgEl, 'g', { filter: `url(#${this.id}-bloom)` });

    // The floor's survey grid, the paths and the patrol routes never change.
    const grid = svg(root, 'g', { class: 'slip-floor' });
    for (let i = -1; i <= Math.max(board.W, board.H); i++) {
      if (i <= board.W) {
        const [a, b] = [slipProject(i, -1), slipProject(i, board.H)];
        svg(grid, 'line', { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) });
      }
      if (i <= board.H) {
        const [a, b] = [slipProject(-1, i), slipProject(board.W, i)];
        svg(grid, 'line', { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) });
      }
    }
    const paths = svg(root, 'g', { class: 'slip-paths' });
    for (const n of board.nodes)
      for (const d of [0, 1] as Dir[]) {
        const m = n.adj[d];
        if (m < 0) continue;
        const [a, b] = [slipProject(n.u, n.v), slipProject(board.nodes[m].u, board.nodes[m].v)];
        const xy = { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) };
        svg(paths, 'line', { class: 'slip-path', ...xy });
        svg(paths, 'line', { class: 'slip-path-core', ...xy });
      }
    const routes = svg(root, 'g', { class: 'slip-routes' });
    for (const g of board.guards) {
      const first = board.nodes[g.poses[0][0]];
      if (g.kind === 'post') {
        const [x, y] = slipProject(first.u, first.v);
        svg(routes, 'ellipse', { class: 'slip-route', cx: x.toFixed(1), cy: y.toFixed(1), rx: 22, ry: 11 });
        continue;
      }
      const seq = g.kind === 'loop' ? [...g.poses.map((p) => p[0]), g.poses[0][0]] : g.poses.slice(0, g.poses.length / 2).map((p) => p[0]);
      const at = seq.map((id) => slipProject(board.nodes[id].u, board.nodes[id].v));
      svg(routes, 'polyline', { class: 'slip-route', points: pts(at) });
      // Which way it walks: a chevron on every link of a loop; out and back on a beat.
      if (g.kind === 'loop') for (let k = 0; k + 1 < at.length; k++) arrow(routes, at[k], at[k + 1], 0.5);
      else {
        arrow(routes, at[0], at[1], 0.35);
        arrow(routes, at[1], at[0], 0.35);
      }
    }

    this.wedges = svg(root, 'g', { class: 'slip-wedges' });
    this.pads = svg(root, 'g', { class: 'slip-pads' });
    this.next = svg(root, 'g', { class: 'slip-nexts' });
    this.figs = svg(root, 'g', { class: 'slip-figs' });
    const hud = svg(this.svgEl, 'g', { class: 'slip-hud' });
    // The dot leads the stamp, so its place never depends on how long the name is.
    svg(hud, 'circle', { class: 'slip-rec', cx: (x0 + 18).toFixed(1), cy: (y0 + 15).toFixed(1), r: 4 });
    svg(hud, 'text', { class: 'slip-stamp', x: (x0 + 28).toFixed(1), y: (y0 + 20).toFixed(1) }, `CAM 03 · ${opts.placeName.toUpperCase()} · REC`);
    this.turn = svg(hud, 'text', { class: 'slip-turn', x: (x1 - 14).toFixed(1), y: (y0 + 20).toFixed(1) }, 'T+00');

    this.you = this.figure('you');
    this.guards = board.guards.map((_, i) => this.figure('guard', guardLabel(i)));
    this.cams = board.cams.map((_, i) => this.figure('cam', camLabel(i)));
  }

  setReducedMotion(on: boolean): void {
    this.screen.classList.toggle('slip-motion', !on);
  }

  destroy(): void {
    this.svgEl.removeEventListener('click', this.onClick);
    this.screen.remove();
  }

  render(s: SlipState, marks: SlipMarks): void {
    const b = this.board;
    const hidden = (id: number) => b.nodes[id].type === 'HIDE';
    const now = watchedBy(b, s);
    const watchedNow = new Set(now.flatMap((w) => w.nodes));
    const watchedNext = s.over ? new Set<number>() : new Set(predictWatch(b, s).flatMap((w) => w.nodes));

    this.wedges.replaceChildren();
    // No wedge into a booth: nobody sees you there.
    for (const w of now) if (w.nodes.length > 1 && !hidden(w.nodes[1])) svg(this.wedges, 'polygon', { class: 'slip-wedge', 'data-to': w.nodes[1], points: this.wedge(w.from, w.nodes[1], w.f) });

    this.pads.replaceChildren();
    const aimed = new Set(marks.aim?.targets ?? []);
    const moves = new Set(marks.aim ? [] : marks.moves);
    for (const n of b.nodes) {
      const g = svg(this.pads, 'g', { class: `slip-pad slip-${n.type.toLowerCase()}`, 'data-id': n.id });
      const exit = n.id === b.exit;
      const hot = watchedNow.has(n.id) && !hidden(n.id);
      g.classList.toggle('slip-hot', hot);
      g.classList.toggle('slip-open', exit && s.lifted);
      g.classList.toggle('slip-done', n.type === 'TARGET' && s.lifted);
      svg(g, 'polygon', { class: 'slip-hit', points: diamond(n.u, n.v, 0.24) });
      svg(g, 'polygon', { class: 'slip-pad-top', points: diamond(n.u, n.v, 0.17) });
      const [x, y] = slipProject(n.u, n.v);
      if (n.type === 'TARGET') {
        svg(g, 'ellipse', { class: 'slip-ring', cx: x.toFixed(1), cy: y.toFixed(1), rx: 26, ry: 13 });
        svg(g, 'ellipse', { class: 'slip-ring slip-ring-out', cx: x.toFixed(1), cy: y.toFixed(1), rx: 34, ry: 17 });
      }
      if (n.type === 'HIDE') svg(g, 'path', { class: 'slip-booth', d: `M${(x - 13).toFixed(1)},${(y + 1).toFixed(1)} v-17 q13,-11 26,0 v17`, filter: `url(#${this.id}-glow)` });
      const text =
        n.type === 'ENTRY' ? (exit ? 'ENTRY · EXIT' : 'ENTRY') : n.type === 'TARGET' ? (s.lifted ? 'LIFTED' : 'TARGET') : n.type === 'EXIT' ? 'EXIT' : n.type === 'HIDE' ? 'HIDE' : '';
      if (text) svg(g, 'text', { class: 'slip-label', x: x.toFixed(1), y: (y + 26).toFixed(1) }, text);
      if (moves.has(n.id)) svg(g, 'polygon', { class: 'slip-move', 'data-id': n.id, points: diamond(n.u, n.v, 0.23) });
      if (aimed.has(n.id)) svg(g, 'polygon', { class: 'slip-aim', 'data-id': n.id, points: diamond(n.u, n.v, 0.25) });
      if (marks.aim?.cur === n.id) svg(g, 'polygon', { class: 'slip-aim-cur', 'data-id': n.id, points: diamond(n.u, n.v, 0.29) });
      if (marks.sel === n.id && !marks.aim)
        for (const [du, dv] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const [cx, cy] = slipProject(n.u + du * 0.29, n.v + dv * 0.29);
          svg(g, 'circle', { class: 'slip-tick', cx: cx.toFixed(1), cy: cy.toFixed(1), r: 2.2 });
        }
    }

    this.next.replaceChildren();
    for (const id of watchedNext) {
      if (hidden(id)) continue;
      const n = b.nodes[id];
      svg(this.next, 'polygon', { class: 'slip-next', 'data-id': id, points: diamond(n.u, n.v, 0.27) });
    }

    // Back to front, decided before anything moves: re-inserting a figure cancels its transition, so
    // the out-of-place ones go in while they still hold their old place, then the style is flushed,
    // and only then do the figures move (and slide).
    const order = [
      { g: this.you.g, n: s.p },
      ...s.g.map((g, i) => ({ g: this.guards[i].g, n: g.n })),
      ...b.cams.map((c, i) => ({ g: this.cams[i].g, n: c.node })),
    ]
      .map((x) => ({ ...x, depth: x.n >= 0 ? b.nodes[x.n].u + b.nodes[x.n].v : 0 }))
      .sort((p, q) => p.depth - q.depth)
      .map((x) => x.g);
    if (order.some((g, i) => this.figs.children[i] !== g)) {
      order.forEach((g, i) => {
        if (this.figs.children[i] !== g) this.figs.insertBefore(g, this.figs.children[i] ?? null);
      });
      void this.figs.getBoundingClientRect();
    }
    this.place(this.you, s.p);
    this.you.g.classList.toggle('slip-hidden', s.p >= 0 && hidden(s.p));
    s.g.forEach((g, i) => {
      const f = this.guards[i];
      this.place(f, g.n);
      f.g.classList.toggle('slip-chase', g.m === 'chase');
      const [dx, dy] = screenDir(g.f);
      f.visor!.setAttribute('x1', (dx * 1.5).toFixed(1));
      f.visor!.setAttribute('y1', (-42 + dy * 1.5).toFixed(1));
      f.visor!.setAttribute('x2', (dx * 8).toFixed(1));
      f.visor!.setAttribute('y2', (-42 + dy * 8).toFixed(1));
      const mark = { patrol: '', chase: ' ◉', search: ' ?', investigate: ' ~', return: ' ↩' }[g.m];
      f.tag.textContent = `${guardLabel(i)}${mark}`;
    });
    b.cams.forEach((c, i) => {
      const f = this.cams[i];
      this.place(f, c.node);
      const jam = s.jam[i];
      f.g.classList.toggle('slip-jammed', jam > 0);
      const [dx, dy] = screenDir(c.dirs[s.phase % c.dirs.length]);
      f.lens!.setAttribute('cx', (dx * 6).toFixed(1));
      f.lens!.setAttribute('cy', (-27 + dy * 3).toFixed(1));
      f.tag.textContent = `${camLabel(i)}${jam > 0 ? ` ⌁${jam}` : c.kind === 'sweep' ? ' ⇄' : ''}`;
    });
    this.turn.textContent = `T+${String(s.turn).padStart(2, '0')}`;
  }

  private place(f: Figure, node: number): void {
    if (node < 0) return;
    const [x, y] = slipProject(this.board.nodes[node].u, this.board.nodes[node].v);
    (f.g as unknown as HTMLElement).style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  /** From the watcher's node to the far edge of the node it sees. */
  private wedge(from: number, to: number, d: Dir): string {
    const f = this.board.nodes[from];
    const n = this.board.nodes[to];
    const r = 0.22;
    const [du, dv] = [DU[d], DV[d]];
    const [pu, pv] = [-dv, du];
    return pts([slipProject(f.u, f.v), slipProject(n.u + du * r + pu * r, n.v + dv * r + pv * r), slipProject(n.u + du * r - pu * r, n.v + dv * r - pv * r)]);
  }

  private figure(kind: 'you' | 'guard' | 'cam', label = ''): Figure {
    const g = svg(this.figs, 'g', { class: `slip-fig slip-${kind}` });
    const h = svg(g, 'g', { class: 'slip-holo', filter: `url(#${this.id}-glow)` });
    if (kind === 'cam') {
      svg(h, 'ellipse', { class: 'slip-base', cx: 0, cy: 0, rx: 10, ry: 5 });
      svg(h, 'line', { class: 'slip-line', x1: 0, y1: 0, x2: 0, y2: -30 });
      svg(h, 'path', { class: 'slip-body', d: 'M-9,-30 a9,9 0 0 1 18,0 z' });
      const lens = svg(h, 'circle', { class: 'slip-lens', cx: 0, cy: -27, r: 2.6 });
      const tag = svg(g, 'text', { class: 'slip-tag', x: 13, y: -36 }, label);
      return { g, tag, lens };
    }
    svg(h, 'ellipse', { class: 'slip-base', cx: 0, cy: 0, rx: 14, ry: 7 });
    svg(h, 'path', { class: 'slip-body', d: 'M-9,-2 C-10,-18 -11,-30 -6,-33 Q0,-35 6,-33 C11,-30 10,-18 9,-2' });
    svg(h, 'circle', { class: 'slip-body', cx: 0, cy: -42, r: 6.5 });
    for (let y = -48; y < 0; y += 4) svg(h, 'line', { class: 'slip-scanline', x1: -10, y1: y, x2: 10, y2: y });
    if (kind === 'guard') {
      const visor = svg(h, 'line', { class: 'slip-visor', x1: 0, y1: -42, x2: 0, y2: -42 });
      const tag = svg(g, 'text', { class: 'slip-tag', x: 13, y: -48 }, label);
      return { g, tag, visor };
    }
    svg(h, 'path', { class: 'slip-hood', d: 'M-8,-37 C-9,-48 9,-51 8,-37' });
    const tag = svg(g, 'text', { class: 'slip-tag', x: 13, y: -48 }, 'YOU');
    return { g, tag };
  }
}

