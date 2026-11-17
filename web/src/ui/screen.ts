/**
 * A full screen in the MAP's language (2026-10-18 PEOPLE spec §1): a dark backdrop under the keys bar, a framed
 * CRT screen with a `// TITLE` head. YOU is built on it, in the holo pane: the flat frame
 * (holo-frame.ts) drawn on as it opens and off as it closes. CREW and PEOPLE are the trace panel (`scr-trace`, trace-panel.ts):
 * no pane, the room dimmed behind it. It handles no keys: its owner closes it (Esc, its own keys), so an owner can
 * refuse.
 */
import './screen.css';
import { FRAME_OUT_MS, mountFrame, type HoloFrame } from './holo-frame';

/** How long the draw-off runs before the screen is gone. */
export const SCREEN_OUT_MS = FRAME_OUT_MS;
/** The trace panel's step-off (`scr-trace`: no frame to draw off). */
export const TRACE_OUT_MS = 200;

export interface ScreenHandle {
  root: HTMLElement;
  head: HTMLElement;
  /** What the owner fills: it scrolls inside the screen, under the CRT layers. */
  body: HTMLElement;
  /** `instant`: a switch to another screen; gone at once, no draw-off. */
  close(instant?: boolean): void;
  readonly isOpen: boolean;
  /** The holo pane's frame, for its live trim (setState); null on a plain screen. */
  readonly frame: HoloFrame | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export function openScreen(
  host: HTMLElement,
  o: {
    title: string;
    /** Added to the root (YOU: 'character-sheet'). */
    className: string;
    label: string;
    /** --screen-accent: the frame's colour. */
    accent?: string;
    /** The panel's key, in the frame's corner piece (YOU: 'Y'). */
    hotkey?: string;
    reducedMotion?: boolean;
    /** A backdrop click asks first; false keeps the screen open. */
    canClose?(): boolean;
    /** Called as soon as it starts closing (the room's chrome is free again). */
    onClose?(): void;
  },
): ScreenHandle {
  const root = el('div', `scr-root ${o.className}`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', o.label);
  if (o.accent) root.style.setProperty('--screen-accent', o.accent);
  const head = el('header', 'scr-head');
  head.append(el('span', '', `// ${o.title}`), el('span', 'scr-hint', '[ESC] CLOSE'));
  const body = el('div', 'scr-scroll');
  const screen = el('div', 'scr-screen');
  screen.append(body, el('div', 'scr-scan'), el('div', 'scr-roll'), el('div', 'scr-vignette'));
  const frame = el('div', 'scr-frame');
  frame.append(head, screen);
  root.append(frame);
  root.addEventListener('click', (e) => {
    if (e.target === root && o.canClose?.() !== false) close();
  });
  host.append(root);
  // The holo pane's frame (every screen today is one); a plain CRT screen keeps its own border and no draw-on.
  const kinds = o.className.split(' ');
  const hf = kinds.includes('scr-holo') ? mountFrame(frame, { shape: 'main', key: o.hotkey }) : null;
  hf?.open(o.reducedMotion);
  // The trace panel (CREW, 2026-11-14): no pane and no frame; it steps on and off in CSS (screen.css).
  const trace = kinds.includes('scr-trace');
  if (trace && o.reducedMotion) root.classList.add('scr-still');

  let open = true;
  function close(instant = false): void {
    if (!open) return;
    open = false;
    o.onClose?.();
    if (o.reducedMotion || instant) return root.remove();
    root.classList.add('scr-closing');
    setTimeout(() => root.remove(), hf?.close() ?? (trace ? TRACE_OUT_MS : 0));
  }

  return {
    root,
    head,
    body,
    close,
    get isOpen() {
      return open;
    },
    frame: hf,
  };
}
