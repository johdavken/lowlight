/**
 * A full screen in the MAP's language (2026-10-18 PEOPLE spec §1): a dark backdrop under the keys bar, a framed
 * CRT screen with a `// TITLE` head, glitching in and out. YOU and PEOPLE are built on it. It handles no keys:
 * its owner closes it (Esc, its own keys), so an owner can refuse.
 */
import './screen.css';

/** How long the glitch-out runs before the screen is gone (the map's `map-glitch-out`, 0.6 s). */
export const SCREEN_GLITCH_OUT_MS = 600;

export interface ScreenHandle {
  root: HTMLElement;
  head: HTMLElement;
  /** What the owner fills: it scrolls inside the screen, under the CRT layers. */
  body: HTMLElement;
  /** `instant`: a switch to another screen; gone at once, no glitch-out. */
  close(instant?: boolean): void;
  readonly isOpen: boolean;
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
  if (!o.reducedMotion) screen.classList.add('scr-glitch-in');

  let open = true;
  function close(instant = false): void {
    if (!open) return;
    open = false;
    o.onClose?.();
    if (o.reducedMotion || instant) return root.remove();
    screen.classList.remove('scr-glitch-in');
    void screen.offsetWidth; // restart: the glitch-out runs from the top
    screen.classList.add('scr-glitch-out');
    root.classList.add('scr-closing');
    setTimeout(() => root.remove(), SCREEN_GLITCH_OUT_MS);
  }

  return {
    root,
    head,
    body,
    close,
    get isOpen() {
      return open;
    },
  };
}
