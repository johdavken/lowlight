/**
 * The flat panel frame (docs/mockups/panel-frames.html, FLAT): an SVG drawn behind a pane, the pane clipped to the
 * same outline. Every point is a whole pixel and every cut 45°, drawn with crispEdges so the diagonals step like the
 * room art. Opening, the edge traces round, the fill and trim step in, then the pane's content flickers on; closing
 * runs it back. It replaces the panes' own glitch and flicker; the panel sound is the caller's, as before.
 *
 * Shapes: `main` (YOU, PEOPLE, CREW, JOBS, TEXTS), the title in a raised tab top left and the hotkey in a piece in the
 * bottom-right cut; `side` (BOOK), the edge facing the scene stepping in; `band` (PAUSED).
 */
import './holo-frame.css';

/** How long the draw-off runs before the pane can go (holo-frame.css: content, trim, then the edge untraces). */
export const FRAME_OUT_MS = 360;
/** How long the draw-on runs (the content's flicker ends last); then its class comes off, so a refit doesn't replay it. */
export const FRAME_IN_MS = 560;

export type FrameShape = 'main' | 'side' | 'band' | 'box' | 'col';
export type Pt = readonly [number, number];

/** `main`'s top edge, down from the pane's top: the title's plate stands across it (holo-frame.css .hf-title). */
export const TOP = 14;
const K = 14; // `main`'s top-left cut, small, as the subtitle box's
const PLATE_X = 22; // where the title's plate starts
const PLATE_END = 340; // the clip lets the plate (and its roof line) break the top edge this far
const CUT = 140; // the bottom-right cut on `main`

export interface FrameGeometry {
  /** The outline, clockwise; the pane is clipped to it. */
  pts: Pt[];
  /** What the pane is clipped to when it isn't the outline: `main`'s outline with room above its top edge for the
   *  title's plate (it breaks the edge, as the subtitle box's name does). */
  clip?: Pt[];
  /** The loose piece in the bottom-right cut, holding the hotkey (`main` only). */
  piece?: Pt[];
}

/** The outline of a pane `w` × `h` (whole pixels). Pure, so the shape is testable. */
export function frameGeometry(shape: FrameShape, w: number, h: number): FrameGeometry {
  const W = Math.round(w);
  const H = Math.round(h);
  if (shape === 'main') {
    return {
      pts: [[0, TOP + K], [K, TOP], [W, TOP], [W, H - CUT], [W - 44, H - CUT], [W - 44 - CUT, H],
        [72, H], [16, H - 56], [16, H - 214], [0, H - 230]],
      clip: [[0, TOP + K], [K, TOP], [PLATE_X, TOP], [PLATE_X, 0], [PLATE_END, 0], [PLATE_END + TOP, TOP], [W, TOP], [W, H - CUT],
        [W - 44, H - CUT], [W - 44 - CUT, H], [72, H], [16, H - 56], [16, H - 214], [0, H - 230]],
      piece: [[W - 42, H - 126], [W, H - 126], [W, H], [W - 168, H]],
    };
  }
  if (shape === 'side') {
    const m = Math.round(H * 0.52);
    // A small foot corner: the list scrolls right down to it.
    return { pts: [[0, 40], [40, 0], [W, 0], [W, H - 110], [W - 20, H - 90], [W - 20, H], [40, H], [16, H - 24], [16, m + 16], [0, m]] };
  }
  if (shape === 'box' || shape === 'col') {
    // The subtitle box, and the JOB column as its twin: every corner cut small (docs/mockups/hud-frames.html).
    const k = 14;
    return { pts: [[k, 0], [W - k, 0], [W, k], [W, H - k], [W - k, H], [k, H], [0, H - k], [0, k]] };
  }
  return { pts: [[0, 0], [W, 0], [W, H - 28], [W - 28, H], [40, H], [0, H - 40]] };
}

/** The outline moved in by `d` along each edge's inward normal, its corners where the moved edges meet (the fine inner
 *  line). The outlines are convex, their edges at 0, 45 or 90 degrees. */
export function insetPoints(pts: readonly Pt[], d: number): Pt[] {
  const n = pts.length;
  const area = pts.reduce((a, [x, y], i) => { const [x2, y2] = pts[(i + 1) % n]; return a + (x * y2 - x2 * y); }, 0);
  const sgn = area > 0 ? 1 : -1;
  const lines = pts.map(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x, y2 - y) || 1;
    const nx = (-(y2 - y) / len) * sgn;
    const ny = ((x2 - x) / len) * sgn;
    return [[x + nx * d, y + ny * d], [x2 + nx * d, y2 + ny * d]] as const;
  });
  return lines.map((l, i) => {
    const [[ax, ay], [bx, by]] = lines[(i - 1 + n) % n];
    const [[cx, cy], [dx, dy]] = l;
    const den = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);
    if (Math.abs(den) < 1e-6) return [Math.round(cx), Math.round(cy)] as const;
    const t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / den;
    return [Math.round(ax + t * (bx - ax)), Math.round(ay + t * (by - ay))] as const;
  });
}

const poly = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ');
const rect = (cls: string, x: number, y: number, w: number, h: number) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const tick = (x: number, y: number) => rect('hf-solid', x, y, 6, 6);

/** Diagonal hatching inside a box: lines rising left to right, `gap` apart. */
function hatch(x0: number, y0: number, x1: number, y1: number, gap: number): string {
  const out: string[] = [];
  const d = Math.min(y1 - y0, x1 - x0);
  if (x1 - x0 < y1 - y0) for (let y = y0; y + d <= y1; y += gap) out.push(`<line class="hf-hatch" x1="${x0}" y1="${y + d}" x2="${x1}" y2="${y}"/>`);
  else for (let x = x0; x + d <= x1; x += gap) out.push(`<line class="hf-hatch" x1="${x}" y1="${y1}" x2="${x + d}" y2="${y0}"/>`);
  return out.join('');
}

/** Speed lines in the corner piece: 2px rows of set lengths, starting clear of its 45° side, ending before the key
 *  (and before the count under it, when there is one). */
function speed(W: number, H: number, counted = false): string {
  const L = [0.2, 0.55, 0.1, 0.4, 0.7, 0.25, 0.05, 0.5, 0.3, 0.6, 0.15, 0.45, 0.35, 0.65];
  const x1 = W - (counted ? 90 : 66);
  const out: string[] = [];
  let i = 0;
  for (let y = H - 110; y <= H - 12; y += 8, i++) {
    const left = W - 168 + (H - y) + 8;
    const x0 = Math.round(left + (x1 - left) * L[i % L.length]);
    if (x1 - x0 > 8) out.push(rect('hf-speed', x0, y, x1 - x0, 2));
  }
  return out.join('');
}

/** What the trim says about the panel, live: a count under the hotkey, a meter under the bottom edge, and whether
 *  the corner piece's speed lines run (something under way: an errand, her typing). */
export interface FrameState {
  count?: string;
  meter?: { label: string; frac: number; value: string };
  live?: boolean;
}

/** XML text: labels come from the game's data (district and contact names, standing words). */
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The meter: its label, a 6px track filled in whole 2px steps, its value. The track starts after the label (VT323
 *  16px at 0.16em is about 10.6px a letter), so a long name pushes it right rather than running off the frame. */
function meter(x: number, y: number, m: NonNullable<FrameState['meter']>): string {
  const lw = Math.max(150, Math.ceil(m.label.length * 10.6) + 14);
  const bw = 260;
  const f = Math.round((bw * Math.min(1, Math.max(0, m.frac))) / 2) * 2;
  return `<text class="hf-mtext" x="${x}" y="${y + 7}">${esc(m.label)}</text>${rect('hf-mtrack', x + lw, y, bw, 6)}${rect('hf-solid hf-mfill', x + lw, y, f, 6)}<text class="hf-mtext" x="${x + lw + bw + 10}" y="${y + 7}">${esc(m.value)}</text>`;
}

/** The trim that changes with the panel: the hotkey and count, the speed lines, the meter (`main` only). */
export function stateSvg(shape: FrameShape, w: number, h: number, key: string, st: FrameState): string {
  if (shape !== 'main') return '';
  const W = Math.round(w);
  const H = Math.round(h);
  const out = [`<g class="hf-speedg${st.live ? ' live' : ''}">${speed(W, H, !!st.count)}</g>`];
  if (key) {
    const y = H - (st.count ? 40 : 26);
    // ALT small over the letter (playtest): the letter is the panel's Alt key, open and close.
    out.push(`<text class="hf-alt" x="${W - 36}" y="${y - 44}" text-anchor="middle">ALT</text>`, `<text class="hf-key" x="${W - 38}" y="${y}" text-anchor="middle">${esc(key)}</text>`);
  }
  if (st.count) out.push(`<text class="hf-mtext hf-count" x="${W - 38}" y="${H - 14}" text-anchor="middle">${esc(st.count)}</text>`);
  if (st.meter) out.push(meter(76, H + 9, st.meter));
  return out.join('');
}

let ids = 0;

/** The frame's SVG for a pane `w` × `h`: fill, dotted grid, tab, edge, trim, and the live trim (`st`). */
export function frameSvg(shape: FrameShape, w: number, h: number, key = '', st: FrameState = {}): string {
  const W = Math.round(w);
  const H = Math.round(h);
  const g = frameGeometry(shape, W, H);
  const id = `hf-grid-${++ids}`;
  // Glints (the glass): short bright runs on the long edges, a gradient that fades at both ends.
  const glint = (x: number, y: number, w: number) => `<rect class="hf-glint" x="${Math.round(x)}" y="${y - 1}" width="${Math.round(w)}" height="2" fill="url(#${id}-gl)"/>`;
  const trim: string[] = [];
  if (shape === 'main') {
    // The top-left corner is the subtitle box's (playtest): a small cut, the title on its plate across the edge (CSS);
    // hatching over the top right as on the box.
    trim.push(tick(W - 4, TOP - 4), tick(W - 8, H - CUT - 6), hatch(W - 300, TOP - 16, W - 170, TOP - 4, 9), hatch(0, H - 212, 12, H - 60, 10),
      `<polygon class="hf-piece" points="${poly(g.piece!)}"/>`, glint(W * 0.52, TOP, Math.min(220, W * 0.2)), glint(W * 0.16, H, Math.min(240, W * 0.22)));
  } else if (shape === 'side') {
    const m = Math.round(H * 0.52);
    trim.push(`<polygon class="hf-solid" points="-10,-10 26,-10 -10,26"/>`, tick(W - 4, -4), tick(W - 24, H - 4), hatch(0, m + 30, 12, H - 40, 10),
      rect('hf-solid', 84, H + 7, 200, 6), glint(W * 0.35, 0, Math.min(180, W * 0.3)), glint(W * 0.3, H, Math.min(160, W * 0.28)));
  } else if (shape === 'col') {
    // The JOB column (table-hud): the box's accents on the bottom-right corner and a short one top right, dots in the
    // foot, a bracket; no hatching over the top (its name plate and details stand there in a narrow column).
    trim.push(`<polygon class="hf-solid" points="${W + 3},${H - 46} ${W + 3},${H - 12} ${W - 14},${H + 3} ${W - 120},${H + 3} ${W - 120},${H - 3} ${W - 16},${H - 3} ${W - 3},${H - 16} ${W - 3},${H - 46}"/>`,
      `<polygon class="hf-solid" points="${W - 3},40 ${W + 3},40 ${W + 3},12 ${W - 12},-3 ${W - 60},-3 ${W - 60},3 ${W - 14},3 ${W - 3},14"/>`,
      ...[0, 1, 2].map((i) => rect('hf-dot2', Math.round(W * 0.4) + i * 6, H - 11, 2, 2)),
      glint(W * 0.2, H, Math.min(160, W * 0.3)));
  } else if (shape === 'box') {
    // Solid accents on the top-right and bottom-left corners, hatching over the top right, dots in the foot, a bracket.
    trim.push(`<polygon class="hf-solid" points="${W - 120},-3 ${W - 12},-3 ${W + 3},12 ${W + 3},46 ${W - 3},46 ${W - 3},16 ${W - 14},3 ${W - 120},3"/>`,
      `<polygon class="hf-solid" points="-3,${H - 46} 3,${H - 46} 3,${H - 16} 16,${H - 3} 120,${H - 3} 120,${H + 3} 14,${H + 3} -3,${H - 12}"/>`,
      hatch(W - 300, -16, W - 170, -4, 9), ...[0, 1, 2].map((i) => rect('hf-dot2', Math.round(W * 0.7) + i * 6, H - 11, 2, 2)),
      `<polyline class="hf-brk" points="${W - 18},-7 ${W + 7},-7 ${W + 7},18"/>`, glint(W * 0.2, 0, Math.min(220, W * 0.25)), glint(W * 0.55, H, Math.min(200, W * 0.2)));
  } else {
    trim.push(tick(-3, -3), `<polygon class="hf-solid" points="${W - 26},-10 ${W + 10},-10 ${W + 10},26"/>`, hatch(W - 220, H + 6, W - 44, H + 22, 10),
      glint(W * 0.2, 0, Math.min(200, W * 0.3)), glint(W * 0.45, H, Math.min(160, W * 0.25)));
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">
<defs><pattern id="${id}" width="50" height="50" patternUnits="userSpaceOnUse"><path class="hf-grid" d="M0 0.5H50M0.5 0V50"/><rect class="hf-dot" width="2" height="2"/></pattern><linearGradient id="${id}-gl"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.35" stop-color="#fff"/><stop offset="0.65" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<polygon class="hf-fill" points="${poly(g.pts)}"/><polygon points="${poly(g.pts)}" fill="url(#${id})"/>
<polygon class="hf-inner" points="${poly(insetPoints(g.pts, 5))}"/><polygon class="hf-edge" pathLength="1" points="${poly(g.pts)}"/>
${trim.join('')}<g class="hf-state">${stateSvg(shape, W, H, key, st)}</g></svg>`;
}

/** A section head's label on the frame's bar (`.hf-hl`, holo-frame.css): its text moved into the bar's span, so the
 *  head's own text and class stay as they were. */
export function hl<T extends HTMLElement>(head: T): T {
  const bar = document.createElement('span');
  bar.className = 'hf-hl';
  bar.textContent = head.textContent;
  head.replaceChildren(bar);
  return head;
}

export interface HoloFrame {
  /** The frame (`div.hf`), the pane's previous sibling. Hide it with the pane when the pane hides. */
  readonly el: HTMLElement;
  /** Fits the frame to the pane's box again (the pane is shown and laid out). */
  fit(): void;
  /** The pane is up: fit, and draw on unless `reduced`. */
  open(reduced?: boolean): void;
  /** Draws off (nothing when `reduced`); returns how long until the pane can go. */
  close(reduced?: boolean): number;
  /** The live trim: count, meter, running lines. Redraws only that group (never re-traces). */
  setState(st: FrameState): void;
}

/**
 * Puts the frame behind `pane` (inserted before it, in its positioned parent) and clips the pane to the outline.
 * The pane's own box is untouched; it should have no border, background or clip-path of its own.
 */
export function mountFrame(pane: HTMLElement, o: { shape: FrameShape; key?: string; /** false: the pane isn't clipped (the subtitle box: its nameplate breaks the edge). */ clip?: boolean }): HoloFrame {
  const el = document.createElement('div');
  el.className = `hf hf-${o.shape}`;
  // Its live trim, mirrored for tests and e2e (setState keeps these current): nothing yet.
  el.dataset.count = '';
  el.dataset.meter = '';
  el.dataset.live = '';
  pane.before(el);
  if (o.clip !== false) pane.classList.add('hf-pane');
  let size = '';
  let state: FrameState = {};
  const fit = () => {
    const w = pane.offsetWidth;
    const h = pane.offsetHeight;
    el.style.left = `${pane.offsetLeft}px`;
    el.style.top = `${pane.offsetTop}px`;
    if (`${w}x${h}` === size || !w || !h) return;
    size = `${w}x${h}`;
    el.innerHTML = frameSvg(o.shape, w, h, o.key, state);
    const g = frameGeometry(o.shape, w, h);
    const path = (pts: readonly Pt[]) => `polygon(${pts.map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
    if (o.clip === false) {
      // Its own box is the pane's size, so CSS can stand it on the pane's floor (the subtitle box, style.css).
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    // The glass's blur, clipped to the outline: the frame carries it, so what the pane shows past the outline (the title's
    // plate on `main`, or all of an unclipped pane) has none behind it.
    const gb = document.createElement('div');
    gb.className = 'hf-gb';
    gb.style.width = `${w}px`;
    gb.style.height = `${h}px`;
    gb.style.clipPath = path(g.pts);
    el.prepend(gb);
    if (o.clip !== false) pane.style.clipPath = path(g.clip ?? g.pts);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(pane);
  fit();
  let settle: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (settle) clearTimeout(settle);
    settle = null;
    el.classList.remove('hf-opening', 'hf-closing');
    pane.classList.remove('hf-opening', 'hf-closing');
  };
  const restart = (cls: string) => {
    clear();
    void el.offsetWidth; // from the top, if it was mid-run
    el.classList.add(cls);
    pane.classList.add(cls);
  };
  return {
    el,
    fit,
    open(reduced) {
      fit();
      if (reduced) return clear();
      restart('hf-opening');
      // Drawn on: the class goes, so a resize (BOOK's foot follows the chat input) redraws without tracing again.
      settle = setTimeout(clear, FRAME_IN_MS);
    },
    close(reduced) {
      if (reduced) return 0;
      restart('hf-closing');
      return FRAME_OUT_MS;
    },
    setState(st) {
      // Unchanged, nothing redraws: a redraw restarts the running lines (CREW draws on every click).
      if (JSON.stringify(st) === JSON.stringify(state)) return;
      state = st;
      // Mirrored on the frame's element: tests and e2e read it there (jsdom lays nothing out, so draws no SVG).
      el.dataset.count = st.count ?? '';
      el.dataset.meter = st.meter ? `${st.meter.label} ${st.meter.value}` : '';
      el.dataset.live = st.live ? '1' : '';
      const g = el.querySelector('.hf-state');
      if (g && size) {
        const [w, h] = size.split('x').map(Number);
        g.innerHTML = stateSvg(o.shape, w, h, o.key ?? '', st);
      }
    },
  };
}
