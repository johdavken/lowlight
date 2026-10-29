/**
 * The opening card before the splash, like an 80s film's text card: black, LOWLIGHT in red, then a
 * few lines about the city typed one by one with a cursor. It holds on the last line and glitches
 * out into the splash. Any key or click skips it, and that gesture goes no further (it doesn't also
 * dismiss the splash underneath); `onGesture` lets the caller unlock sound with it.
 */
import { COPY } from './copy';
import { SOUND_PROMPT } from './splash';
import { glitchOut } from './stage';
import './opening-card.css';

/** Typing speed per character, the pause after each line, and the hold on the finished card. */
export const CARD_CHAR_MS = 32;
export const CARD_LINE_PAUSE_MS = 550;
export const CARD_HOLD_MS = 3000;
/** The hold with reduced motion, where every line is there at once. */
const STILL_HOLD_MS = 2500;

/** True: the card plays on every splash shown at load (2026-10-28). False: only the first in a session. */
export const CARD_EVERY_SPLASH = true;
export const CARD_KEY = 'lowlight.openingCardSeen';

/** Whether the card plays before this splash: never without one; then every time, or once a session (blocked storage: every time). */
export function shouldShowOpeningCard(splash: boolean, storage: Pick<Storage, 'getItem'> = sessionStorage, every: boolean = CARD_EVERY_SPLASH): boolean {
  if (!splash) return false;
  if (every) return true;
  try {
    return storage.getItem(CARD_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markOpeningCardSeen(storage: Pick<Storage, 'setItem'> = sessionStorage): void {
  try {
    storage.setItem(CARD_KEY, '1');
  } catch {
    // Blocked storage: it shows again next time.
  }
}

type Card = typeof COPY.openingCard;
type Line = Card['lines'][number];

export interface OpeningCard {
  el: HTMLElement;
  /** Resolves once the card has gone, by itself or skipped. */
  done: Promise<void>;
  skip(): void;
  /** Sound came on without a key (waitForSound): the typing starts. */
  soundStarted(): void;
  destroy(): void;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Fills `into` with `text`'s first `n` characters, accent words in their own span (text nodes only). */
function paint(into: HTMLElement, line: Line, n: number): void {
  into.replaceChildren();
  const shown = line.text.slice(0, n);
  const accents = line.accent ?? [];
  let i = 0;
  while (i < shown.length) {
    const hit = accents.find((w) => line.text.startsWith(w, i));
    if (hit) {
      into.append(el('span', 'oc-accent', shown.slice(i, i + hit.length)));
      i += hit.length;
      continue;
    }
    let j = i + 1;
    while (j < shown.length && !accents.some((w) => line.text.startsWith(w, j))) j++;
    into.append(document.createTextNode(shown.slice(i, j)));
    i = j;
  }
}

export function mountOpeningCard(
  host: HTMLElement,
  opts: {
    reducedMotion: boolean;
    card?: Card;
    onGesture?: () => void;
    /** The browser blocked sound: the card opens on the sound prompt, and its first key or click starts sound and the typing (it doesn't skip). */
    waitForSound?: boolean;
  },
): OpeningCard {
  const card = opts.card ?? COPY.openingCard;
  const root = el('div', `opening-card${opts.reducedMotion ? ' still' : ''}`);
  const text = el('div', 'oc-text');
  const cursor = el('span', 'oc-cursor');
  text.append(el('div', 'oc-title', card.title));
  root.append(text, el('div', 'oc-skip', card.skip));
  const sound = opts.waitForSound ? el('div', 'oc-sound', SOUND_PROMPT) : null;
  if (sound) {
    root.classList.add('waiting');
    root.append(sound);
  }
  host.append(root);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let leaving = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const later = (ms: number, fn: () => void) => {
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
  const lineEl = (line: Line) => {
    const e = el('div', `oc-line${line.dim ? ' dim' : ''}`);
    text.append(e);
    return e;
  };

  const stopListening = () => {
    window.removeEventListener('keydown', onKey, true);
    root.removeEventListener('pointerdown', onPointer);
  };
  const leave = () => {
    if (leaving) return;
    leaving = true;
    if (timer) clearTimeout(timer);
    timer = null;
    // Keys stay swallowed while it glitches out: a quick second key mustn't dismiss the splash too.
    void glitchOut(root, { reducedMotion: opts.reducedMotion }).then(() => {
      stopListening();
      root.remove();
      resolveDone();
    });
  };
  const gesture = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (leaving) return;
    opts.onGesture?.();
    // Waiting for sound: this gesture starts it, and the card begins rather than ending.
    if (!started) begin();
    else leave();
  };
  const onKey = (e: KeyboardEvent) => gesture(e);
  const onPointer = (e: PointerEvent) => gesture(e);
  // Capture on the window: the card sees the key before anything underneath does.
  window.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', onPointer);

  let started = false;
  const begin = () => {
    if (started || leaving) return;
    started = true;
    sound?.remove();
    root.classList.remove('waiting');
    if (opts.reducedMotion) {
      for (const line of card.lines) paint(lineEl(line), line, line.text.length);
      text.lastElementChild?.append(cursor);
      later(STILL_HOLD_MS, leave);
      return;
    }
    const typeLine = (li: number) => {
      if (li >= card.lines.length) return later(CARD_HOLD_MS, leave);
      const line = card.lines[li];
      const e = lineEl(line);
      const step = (n: number) => {
        paint(e, line, n);
        e.append(cursor);
        if (n < line.text.length) later(CARD_CHAR_MS, () => step(n + 1));
        else later(CARD_LINE_PAUSE_MS, () => typeLine(li + 1));
      };
      later(CARD_CHAR_MS, () => step(1));
    };
    typeLine(0);
  };
  if (!opts.waitForSound) begin();

  return {
    el: root,
    done,
    skip: leave,
    soundStarted: begin,
    destroy() {
      if (timer) clearTimeout(timer);
      timer = null;
      stopListening();
      root.remove();
      resolveDone();
    },
  };
}
