/**
 * The subtitle box's leader (the room HUD, docs/mockups/hud-frames.html): a fine line out of the box's top edge to
 * whoever is speaking, a 45° run then straight, ending in a ring. It finds them on screen: their figure on the stage,
 * else their face in the party window, else the stranger's bust or the comms inset. No one to point at (narration),
 * the archive, or a Graft table up: no line.
 */
const NS = 'http://www.w3.org/2000/svg';

/** Where a leader runs: out of the box at `from`, a 45° run, then straight on to `to`. Whole pixels. */
export function leaderPath(from: readonly [number, number], to: readonly [number, number]): [number, number][] {
  const [x0, y0] = from.map(Math.round) as [number, number];
  const [x1, y1] = to.map(Math.round) as [number, number];
  const d = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0));
  return [[x0, y0], [x0 + Math.sign(x1 - x0) * d, y0 + Math.sign(y1 - y0) * d], [x1, y1]];
}

/** The speaker on screen, in the order the room shows them; null when no one is. */
export function speakerTarget(doc: ParentNode): { el: Element; kind: 'figure' | 'party' | 'bust' } | null {
  const seen = (el: Element | null) => el !== null && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
  const figure = doc.querySelector('.stage-figure.speaking');
  if (seen(figure)) return { el: figure!, kind: 'figure' };
  const tile = doc.querySelector('.wh-tile.wh-lit .wh-face');
  if (seen(tile)) return { el: tile!, kind: 'party' };
  for (const sel of ['.sp-portrait', '.ci']) {
    const bust = doc.querySelector(sel);
    if (seen(bust)) return { el: bust!, kind: 'bust' };
  }
  return null;
}

/** A Graft table on screen (the element stays in the DOM, hidden, between jobs). */
const tableUp = () => [...document.querySelectorAll('.tb.hud')].some((t) => t.getClientRects().length > 0);

export interface SubtitleLeader {
  /** Draws it again: the speaker changed, the box grew or moved, the window resized. */
  update(): void;
  /** Also redraws when `el` changes size (the prompt line: as a draft wraps it lifts the box without resizing it). */
  observe(el: Element): void;
}

/** How far in from the box's right end the leader lands: clear of the keys on the head line (the TEXT key 62px, style.css --bs-key-w, and the line's four). */
const KEYS_CLEAR = 226;

/** The right end of the name row's last word (name, time, model, takes), in the root's px; 0 with no row. */
function nameEnd(box: HTMLElement, local: (x: number, y: number) => readonly [number, number]): number {
  let end = 0;
  for (const n of box.querySelectorAll<HTMLElement>('.msg:last-of-type .meta > *')) {
    const r = n.getBoundingClientRect();
    if (r.width > 0) end = Math.max(end, local(r.right, r.top)[0]);
  }
  return end;
}

export function mountSubtitleLeader(root: HTMLElement, box: HTMLElement): SubtitleLeader {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sub-leader');
  svg.setAttribute('aria-hidden', 'true');
  root.append(svg);

  let watched: Element | null = null;
  const update = () => {
    svg.replaceChildren();
    if (!root.classList.contains('feed-stage') || root.classList.contains('expanded') || root.classList.contains('job-col') || tableUp()) return;
    const t = speakerTarget(document);
    if (!t) return;
    // Its box changes after this (a sprite takes its own shape once it loads, a figure swaps): watch it.
    if (t.el !== watched) {
      if (watched) ro?.unobserve(watched);
      watched = t.el;
      ro?.observe(watched);
      // It also moves without resizing: its waist drop and place are style vars (stage.ts), set as its sprite loads.
      mo?.disconnect();
      mo?.observe(watched, { attributes: true, attributeFilter: ['style', 'class'] });
      const game = watched.closest('#game');
      if (game) mo?.observe(game, { attributes: true, attributeFilter: ['class'] }); // quest-up moves the figures in
    }
    const r = root.getBoundingClientRect();
    const k = root.offsetWidth ? r.width / root.offsetWidth : 1; // #game is zoomed: rects come back in window px
    if (!k || !r.width) return;
    const local = (x: number, y: number) => [(x - r.left) / k, (y - r.top) / k] as const;
    const b = box.getBoundingClientRect();
    const [bx0, by0] = local(b.left, b.top);
    const [bx1] = local(b.right, b.top);
    const e = t.el.getBoundingClientRect();
    let to: readonly [number, number];
    if (t.kind === 'figure') {
      // Their chest: a fifth of the way down the sprite (it runs past the stage floor), kept well clear of the box.
      const [cx, top] = local(e.left + e.width / 2, e.top);
      to = [cx, Math.min(top + (e.height / k) * 0.21, by0 - 80)];
    } else {
      const [x, y] = local(e.right, e.top + e.height / 2);
      to = [x + 8, y];
    }
    // Out of the head line on the speaker's side: past the name row on the left, just left of the keys on the right
    // (the TEXT key, 62px, and the line's four, 26px each, end 200px in from the box's right).
    const right = to[0] > (bx0 + bx1) / 2;
    const from = [right ? bx1 - KEYS_CLEAR : Math.min(Math.max(bx0 + 240, nameEnd(box, local) + 24), bx1 - KEYS_CLEAR), by0] as const;
    const pts = leaderPath(from, to);
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('class', 'sl-line');
    line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    const [x1, y1] = pts[2];
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'sl-ring');
    ring.setAttribute('cx', String(x1));
    ring.setAttribute('cy', String(y1));
    ring.setAttribute('r', '6');
    const dot = document.createElementNS(NS, 'rect');
    dot.setAttribute('class', 'sl-dot');
    dot.setAttribute('x', String(x1 - 2));
    dot.setAttribute('y', String(y1 - 2));
    dot.setAttribute('width', '4');
    dot.setAttribute('height', '4');
    const foot = document.createElementNS(NS, 'rect');
    foot.setAttribute('class', 'sl-dot');
    foot.setAttribute('x', String(pts[0][0] - 2));
    foot.setAttribute('y', String(pts[0][1] - 2));
    foot.setAttribute('width', '4');
    foot.setAttribute('height', '4');
    svg.append(line, ring, dot, foot);
  };

  // Redrawn at most once a frame: the figure's style changes often (its lighting).
  let pending = false;
  const soon = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      update();
    });
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(soon) : null;
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(soon) : null;
  ro?.observe(box);
  window.addEventListener('resize', update);
  // A figure fading in or out (stage.ts) settles where it stands only after its transition.
  document.addEventListener('transitionend', (e) => {
    if (e.target instanceof Element && e.target.closest('.stage-figure')) soon();
  });
  return { update, observe: (el) => ro?.observe(el) };
}
