/**
 * The run's board (gig runs spec §5): isometric blocks whose height is their cost, curved links
 * lying on the floor, the sentries' gaze, and a CRT layer, in amber phosphor. Drawn as SVG from a
 * RunState; `render` redraws the whole board (it is small).
 */
import { inReach, isVisible, neighbours, type NodeType, type RunState } from '../../../../shared/gig/rules';
import './gig.css';

export interface BoardViewOpts {
  onSelect: (id: number) => void;
  /** A setting, or a getter read on every render (a setting that can change mid-run). */
  reducedMotion: boolean | (() => boolean);
  /** Dev: show every node's type. */
  reveal?: boolean;
}

const AMBER = '#ffc56b';
const GREEN = '#7dffa0';
const CYAN = '#7fe9ff';
const RED = '#ff5a5a';
const PINK = '#ff4f8b';
const KEY = '#fff3a8';
const COLOR: Record<NodeType, string> = { ENTRY: AMBER, RELAY: AMBER, TRAP: RED, SENTRY: RED, ICE2: CYAN, ICE3: CYAN, TARGET: PINK, CACHE: GREEN, KEY };
// ︎ asks for the text glyph, not an emoji; the trap is ✕ (✖ draws as an emoji).
const GLYPH: Record<NodeType, string> = { ENTRY: '▶︎', RELAY: '·', TRAP: '✕', SENTRY: '◉', ICE2: '▦', ICE3: '▦', TARGET: '◆︎', CACHE: '+2', KEY: '⚷' };
const LABEL: Record<NodeType, string> = { ENTRY: 'ENTRY', RELAY: 'RELAY', TRAP: 'TRAP', SENTRY: 'SENTRY', ICE2: 'LACQ 2', ICE3: 'LACQ 3', TARGET: 'TARGET', CACHE: 'CACHE', KEY: 'KEY' };
/** Height is cost: slabs, walls, a pillar, a tower. */
const HEIGHT: Record<NodeType, number> = { ENTRY: 10, RELAY: 8, TRAP: 8, CACHE: 8, KEY: 8, SENTRY: 30, ICE2: 22, ICE3: 36, TARGET: 44 };

/** Floor units: a column is this far from the next, the whole row range this tall. */
const COL_W = 111.2;
const ROW_H = 300;

/** Floor coordinates before the tilt: x along the columns, y down the rows. */
function floor(col: number, row: number, cols: number): [number, number] {
  return [col * COL_W, row * ROW_H * Math.max(1, (cols - 1) / 5)];
}
/** The isometric tilt (the mockup's P()). */
function tilt(fx: number, fy: number): [number, number] {
  const u = fx * 0.92 * 0.62;
  const v = fy * 0.92;
  return [(u - v) * 0.866, (u + v) * 0.5];
}
/** A node's floor position on screen. */
export function project(col: number, row: number, cols: number): [number, number] {
  return tilt(...floor(col, row, cols));
}

let instances = 0;
const f1 = (n: number) => n.toFixed(1);
const rgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `${v >> 16},${(v >> 8) & 255},${v & 255}`;
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class BoardView {
  private readonly screen: HTMLElement;
  private readonly board: HTMLElement;
  private readonly id = `gig${++instances}`;
  private readonly onClick = (e: Event) => {
    const g = (e.target as Element).closest?.('.gig-node');
    if (g instanceof Element && g.getAttribute('data-id') !== null) this.opts.onSelect(Number(g.getAttribute('data-id')));
  };

  constructor(
    host: HTMLElement,
    private readonly opts: BoardViewOpts,
  ) {
    this.screen = document.createElement('div');
    this.screen.className = 'gig-screen gig-crt';
    this.screen.classList.toggle('gig-motion', !this.reduced());
    this.board = document.createElement('div');
    this.board.className = 'gig-board';
    this.screen.append(this.board);
    for (const fx of ['roll', 'scan', 'mask', 'glare', 'vig']) {
      const d = document.createElement('div');
      d.className = `gig-fx gig-fx-${fx}`;
      this.screen.append(d);
    }
    this.board.addEventListener('click', this.onClick);
    host.append(this.screen);
  }

  private reduced(): boolean {
    const r = this.opts.reducedMotion;
    return typeof r === 'function' ? r() : r;
  }

  render(state: RunState, selected: number | null): void {
    this.screen.classList.toggle('gig-motion', !this.reduced());
    const { board } = state;
    const cols = Math.max(...board.nodes.map((n) => n.col)) + 1;
    const shown = (id: number) => this.opts.reveal === true || isVisible(state, id);
    const held = (id: number) => state.held.has(id);
    const at = board.nodes.map((n) => project(n.col, n.row, cols));
    const id = this.id;
    const glow = (name: string, col: string, sd: number) =>
      `<filter id="${id}-${name}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feFlood flood-color="${col}"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    // Phosphor bloom plus a 1px red/blue fringe over the whole board.
    const crt = `<filter id="${id}-crt" x="-5%" y="-5%" width="110%" height="110%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="bloom"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/><feOffset in="r" dx="-0.9" result="r2"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/><feOffset in="b" dx="0.9" result="b2"/>
      <feBlend in="r2" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b2" mode="screen" result="rgb"/>
      <feBlend in="rgb" in2="bloom" mode="screen"/></filter>`;
    let s = `<defs>${glow('held', GREEN, 3)}${glow('tgt', PINK, 5)}${glow('link', GREEN, 2.5)}${crt}</defs><g filter="url(#${id}-crt)">`;

    // The floor: a faint survey grid under the board.
    const [fw, fh] = floor(cols - 1, 1, cols);
    for (let k = 0; k <= cols * 2; k++) {
      const a = tilt((k * COL_W) / 2 - 30, -30);
      const b = tilt((k * COL_W) / 2 - 30, fh + 30);
      s += `<line class="gig-floor" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`;
    }
    for (let k = 0; k <= 10; k++) {
      const a = tilt(-30, (k * (fh + 60)) / 10 - 30);
      const b = tilt(fw + 30, (k * (fh + 60)) / 10 - 30);
      s += `<line class="gig-floor" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`;
    }

    // Links: constellation's bow, set on the floor and then tilted (a tilted curve stays a curve).
    for (const [a, b] of board.links) {
      const [ax, ay] = floor(board.nodes[a].col, board.nodes[a].row, cols);
      const [bx, by] = floor(board.nodes[b].col, board.nodes[b].row, cols);
      const c = tilt((ax + bx) / 2, (ay + by) / 2 - Math.abs(bx - ax) * 0.12 - 8);
      const d = `M${f1(at[a][0])},${f1(at[a][1])} Q${f1(c[0])},${f1(c[1])} ${f1(at[b][0])},${f1(at[b][1])}`;
      const live = held(a) && held(b);
      const reach = !live && (held(a) || held(b));
      s += `<path class="gig-link ${live ? 'gig-live' : reach ? 'gig-reachable' : 'gig-dim'}" d="${d}"${live ? ` filter="url(#${id}-link)"` : ''}/>`;
      if (live) s += `<path class="gig-flow" d="${d}"/>`;
    }

    // Each watching sentry's gaze: a ring on the nodes of yours it sees, and a faint cone.
    // The rules' own predicate (rules.watchers): an unheld sentry linked to a node of yours.
    const watching = board.nodes.filter((n) => n.type === 'SENTRY' && !held(n.id) && neighbours(board, n.id).some(held));
    for (const sen of watching) {
      const [sx, sy] = at[sen.id];
      for (const m of neighbours(board, sen.id).filter(held)) {
        const [tx, ty] = at[m];
        s += `<g class="gig-gaze"><ellipse cx="${f1(tx)}" cy="${f1(ty)}" rx="34" ry="17"/><path d="M${f1(sx)},${f1(sy - HEIGHT.SENTRY)} L${f1(tx - 26)},${f1(ty - 6)} L${f1(tx + 26)},${f1(ty + 6)} Z"/></g>`;
      }
    }

    // Blocks, back to front.
    const pts = (a: [number, number][]) => a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
    const order = [...board.nodes].sort((p, q) => at[p.id][1] - at[q.id][1]);
    // Labels go in one layer after every block, so a nearer block never hides one.
    let labels = '';
    for (const n of order) {
      const [cx, cy] = at[n.id];
      const vis = shown(n.id);
      const own = held(n.id);
      const state3 = own ? 'gig-held' : inReach(state, n.id) ? 'gig-reach' : 'gig-far';
      const watch = watching.includes(n);
      const cls = ['gig-node', state3, vis ? `gig-t-${n.type.toLowerCase()}` : 'gig-fog', selected === n.id ? 'gig-sel' : '', watch ? 'gig-watch' : ''].filter(Boolean).join(' ');
      const col = own ? GREEN : vis ? COLOR[n.type] : AMBER;
      const c3 = rgb(col);
      const r = n.type === 'SENTRY' && vis ? 11 : 18;
      const h = vis ? HEIGHT[n.type] : 0;
      const top: [number, number][] = [[cx, cy - r * 0.5 - h], [cx + r * 0.866, cy - h], [cx, cy + r * 0.5 - h], [cx - r * 0.866, cy - h]];
      let g = '';
      if (!vis) {
        g = `<polygon points="${pts(top)}" fill="rgba(${c3},.05)" stroke="${col}" stroke-dasharray="3 3"/><text x="${f1(cx)}" y="${f1(cy + 5)}" fill="${col}" font-size="20" text-anchor="middle">?</text>`;
      } else {
        const left: [number, number][] = [[cx - r * 0.866, cy - h], [cx, cy + r * 0.5 - h], [cx, cy + r * 0.5], [cx - r * 0.866, cy]];
        const right: [number, number][] = [[cx + r * 0.866, cy - h], [cx, cy + r * 0.5 - h], [cx, cy + r * 0.5], [cx + r * 0.866, cy]];
        g += `<ellipse cx="${f1(cx)}" cy="${f1(cy + 2)}" rx="${f1(r * 1.05)}" ry="${f1(r * 0.52)}" fill="rgba(${c3},.08)"/>`;
        g += `<polygon points="${pts(left)}" fill="rgba(${c3},.17)" stroke="${col}"/><polygon points="${pts(right)}" fill="rgba(${c3},.08)" stroke="${col}"/>`;
        const lit = own ? ` filter="url(#${id}-held)"` : n.type === 'TARGET' ? ` filter="url(#${id}-tgt)"` : '';
        g += `<polygon class="gig-top" points="${pts(top)}" fill="rgba(${c3},.3)" stroke="${col}"${lit}/>`;
        if (n.type === 'ICE2' || n.type === 'ICE3')
          g += [0.33, 0.66].map((f) => `<polyline points="${f1(cx - r * 0.866)},${f1(cy - h * f)} ${f1(cx)},${f1(cy + r * 0.5 - h * f)} ${f1(cx + r * 0.866)},${f1(cy - h * f)}" fill="none" stroke="${col}" opacity=".5"/>`).join('');
        if (n.type === 'SENTRY') g += `<ellipse cx="${f1(cx)}" cy="${f1(cy - h - 7)}" rx="9" ry="5" fill="#120606" stroke="${col}"/><circle cx="${f1(cx)}" cy="${f1(cy - h - 7)}" r="2.6" fill="${col}"/>`;
        if (n.type === 'TARGET') g += `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="34" ry="17" fill="none" stroke="${col}" opacity=".35"/><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="46" ry="23" fill="none" stroke="${col}" opacity=".18"/>`;
        const ly = n.type === 'TARGET' ? cy + 38 : cy - h - (n.type === 'SENTRY' ? 18 : 12);
        labels += `<text data-for="${n.id}"${state3 === 'gig-far' ? ' opacity=".55"' : ''} x="${f1(cx)}" y="${f1(ly)}" fill="${col}" font-size="15" letter-spacing="1" text-anchor="middle">${esc(GLYPH[n.type])} ${LABEL[n.type]}</text>`;
      }
      if (selected === n.id)
        g += `<path class="gig-ticks" d="M${f1(cx - 30)},${f1(cy)} l8,-4 M${f1(cx + 30)},${f1(cy)} l-8,4 M${f1(cx)},${f1(cy - 15)} l8,4 M${f1(cx)},${f1(cy + 15)} l-8,-4"/>`;
      // An invisible floor tile under the block makes the whole footprint clickable.
      g = `<polygon class="gig-hit" points="${pts([[cx, cy - 20], [cx + 34, cy], [cx, cy + 20], [cx - 34, cy]])}"/>${g}`;
      s += `<g class="${cls}" data-id="${n.id}"><title>${vis ? LABEL[n.type] : 'Unknown'} · n${n.id}</title>${g}</g>`;
    }
    s += `<g class="gig-labels">${labels}</g></g>`;

    // Fit the view to the board (towers rise above their footprint), at 16:9.
    const xs = at.map((p) => p[0]);
    const ys = at.map((p) => p[1]);
    const x0 = Math.min(...xs) - 60;
    const x1 = Math.max(...xs) + 60;
    const y0 = Math.min(...ys) - 70;
    const y1 = Math.max(...ys) + 40;
    const w = x1 - x0;
    const hgt = y1 - y0;
    const vw = Math.max(w, (hgt * 16) / 9);
    const vh = (vw * 9) / 16;
    this.board.innerHTML = `<svg class="gig-svg" viewBox="${f1(x0 - (vw - w) / 2)} ${f1(y0 - (vh - hgt) / 2)} ${f1(vw)} ${f1(vh)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The network">${s}</svg>`;
  }

  destroy(): void {
    this.board.removeEventListener('click', this.onClick);
    this.screen.remove();
  }
}
