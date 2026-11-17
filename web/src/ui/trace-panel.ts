/**
 * The trace panel (mockup crew-trace.html, picked 2026-11-14): the in-room panels in the HUD trace. No pane: the room
 * stays behind, dimmed (screen.css `scr-trace`). The panel hangs off the keys bar: its head line runs from a ring at
 * the left, under the panel's name, its tabs and its numbers, then climbs 45° into the bright run the bar draws under
 * the open screen's word. Lists stand on a rail, a leader runs from the pick to what it opens, and the hints are the
 * room's key line. CREW is the first panel on it; the parts (`tp-*`, trace-panel.css) are for YOU and PEOPLE too.
 */
import './trace-panel.css';
import { setHints } from '../landing/hint-line';
import type { ScreenHandle } from './screen';
import { clearLead, hostRect, leadPoints, traceVia, type Pt } from './trace-lead';

/** The one colour of the UI's own lines (playtest pick 2026-11-15): every trace panel's head line, rail and keys. */
export const TRACE_RED = '#ff4d4d';

export interface TracePanel {
  /** Where the owner puts its tabs (after the title, on the head line). */
  readonly tabs: HTMLElement;
  /** The numbers at the head line's right end, before it climbs. */
  readonly nums: HTMLElement;
  /** A refusal or notice, said on the head line. */
  readonly note: HTMLElement;
  /** The key line at the foot: `[↑↓] WHO · [ESC] CLOSE`. */
  hints(text: string): void;
  /** Draws the head line again (the bar moved, the head's height changed). */
  draw(): void;
  /**
   * A leader from `from`'s right edge to `to`'s left, at their middles (`fy`/`ty`: 0 top … 1 bottom). Cleared when
   * either is missing or hidden, `from` is scrolled out of `within`, or `to` out of `toWithin`. `color`: this leader's
   * own (a contact's), else the panel's.
   */
  lead(key: string, from: Element | null, to: Element | null, o?: { within?: Element | null; toWithin?: Element | null; fromGap?: number; toGap?: number; fy?: number; ty?: number; via?: (a: Pt, b: Pt) => Pt[]; color?: string }): void;
  clear(key: string): void;
  destroy(): void;
}

/** The head line's corners: from the ring, along under the head, then 45° up into the bar's run (or straight on, with no run to meet). */
export function headLinePoints(ring: Pt, run: Pt | null, end: number): Pt[] {
  const [x0, y] = [Math.round(ring[0]), Math.round(ring[1])];
  if (!run) return [[x0, y], [Math.round(end), y]];
  const [rx, ry] = [Math.round(run[0]), Math.round(run[1])];
  const rise = y - ry;
  // No room to climb (the word sits over the ring's end): a straight line to the edge.
  if (rise <= 0 || rx - rise <= x0 + 8) return [[x0, y], [Math.round(end), y]];
  return [[x0, y], [rx - rise, y], [rx, ry]];
}

/** Whether `el` shows inside `within`'s box (a row scrolled out of its list has nothing to point from). */
function shown(host: HTMLElement, el: Element, within: Element | null | undefined): boolean {
  const r = hostRect(host, el);
  if (r.width <= 0 && r.height <= 0) return false;
  if (!within) return true;
  const w = hostRect(host, within);
  const [x, y] = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
  return y >= w.top - 1 && y <= w.bottom + 1 && x >= w.left - 1 && x <= w.right + 1;
}

export function mountTracePanel(screen: ScreenHandle, o: { title: string }): TracePanel {
  const root = screen.root;
  const span = (cls: string, text = '') => {
    const n = document.createElement('span');
    n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const tabs = document.createElement('nav');
  tabs.className = 'tp-tabs';
  const nums = span('tp-nums');
  const note = span('tp-note');
  note.setAttribute('role', 'status');
  screen.head.classList.add('tp-head-row');
  screen.head.replaceChildren(span('tp-title', o.title), tabs, note, nums);
  const keys = document.createElement('div');
  keys.className = 'tp-keys';
  screen.head.parentElement!.append(keys);

  let drawn = '';
  function draw(): void {
    if (!screen.isOpen || root.offsetWidth === 0) return;
    const head = hostRect(root, screen.head);
    const frame = hostRect(root, screen.head.parentElement!);
    const y = Math.round(head.bottom + 6);
    // The bar's bright run under this screen's word (hud.ts drawTrace `.kon`); the bar is the root's sibling.
    const kon = root.parentElement?.querySelector('.hud-trace .kon');
    const k = kon ? hostRect(root, kon) : null;
    const run: Pt | null = k && k.width > 0 ? [k.left, (k.top + k.bottom) / 2] : null;
    const pts = headLinePoints([frame.left, y], run, frame.right);
    // Drawn again only when it moved: a new path would replay its run-in (screen.css).
    const key = pts.join(' ');
    if (key !== drawn) traceVia(root, 'head', pts);
    drawn = key;
    // The numbers end before the climb.
    const climb = pts.length === 3 ? pts[1][0] : frame.right;
    nums.style.marginRight = `${Math.max(0, Math.round(frame.right - climb + 18))}px`;
    root.style.setProperty('--tp-line', `${y - Math.round(frame.top)}px`);
  }

  // The bar redraws its trace when it reflows or a screen opens (its run appears a tick after this panel mounts).
  const hud = root.parentElement?.querySelector('.hud-trace');
  const seen = hud ? new MutationObserver(draw) : null;
  if (hud) seen!.observe(hud, { childList: true });
  const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
  sized?.observe(root);
  sized?.observe(screen.head);
  const raf = requestAnimationFrame(draw);
  draw();

  return {
    tabs,
    nums,
    note,
    hints: (text) => setHints(keys, text),
    draw,
    lead(key, from, to, opt = {}) {
      if (!from || !to || root.offsetWidth === 0 || !shown(root, from, opt.within) || !shown(root, to, opt.toWithin)) return void clearLead(root, key);
      const a = hostRect(root, from);
      const b = hostRect(root, to);
      const p: Pt = [a.right + (opt.fromGap ?? 8), a.top + a.height * (opt.fy ?? 0.5)];
      const q: Pt = [b.left - (opt.toGap ?? 8), b.top + b.height * (opt.ty ?? 0.5)];
      if (q[0] - p[0] < 6) return void clearLead(root, key);
      traceVia(root, key, opt.via ? opt.via(p, q) : leadPoints(p, q));
      const svg = root.querySelector<SVGElement>(`:scope > svg.hv-lead[data-lead='${key}']`);
      if (opt.color) svg?.style.setProperty('--hv-c', opt.color);
      else svg?.style.removeProperty('--hv-c');
    },
    clear: (key) => clearLead(root, key),
    destroy() {
      seen?.disconnect();
      sized?.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}
