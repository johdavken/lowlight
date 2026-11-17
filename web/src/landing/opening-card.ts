/**
 * The opening card before the splash (mockup docs/mockups/intro-story.html): LOWLIGHT, then HICKS, then SOREN, each a
 * block-letter name over small text, played as one continuous scroll.
 *
 * A page: its name decrypts through the decode's Han glyphs (title-canvas.ts); the glyphs peel off and settle into the
 * text (glyph-fly.ts `reform`), each block loosening into a cycling glyph as its glyph leaves. The text sits in a window
 * sized so every block can leave (scroll-window.ts), which then crawls, a row per reading time, the top row's glyphs
 * forming the next bottom row. When the last row has been read, the page's text and name fly up into the next name.
 *
 * Keys: Space/Enter/click finishes a page (or jumps to its end), then goes to the next name; the wheel scrolls either
 * way, and past the top flies back into the previous name, opened at its end; Esc skips to the splash. Every gesture is
 * swallowed (it never also dismisses the splash underneath); `onGesture` lets the caller unlock sound with it.
 *
 * With reduced motion, or no 2D canvas, a page shows its name and all its text at once, and moves on by itself after a
 * read (or on a key).
 */
import { COPY, type OpeningLine, type OpeningPage } from './copy';
import { loadIntroSkipped } from './intro-pref';
import { SOUND_PROMPT } from './splash';
import { glitchOut } from './stage';
import { TITLE_BUILD_MS } from './decrypt';
import { mountTitleCanvas, type TitleBuild } from './title-canvas';
import { flyRows, gather, localPos, pageGlyphs, PALE, RED, reform, type Flight, type Letter, type Source } from './glyph-fly';
import { buildWindow, readMs, scroller, visibleRows, END_READ, type Row, type Scroller } from './scroll-window';
import './opening-card.css';

/** After the name builds, a beat before its glyphs leave for the text. */
export const REFORM_AFTER_MS = 500;
/** Without effects, a page waits at least this long before moving on by itself. */
export const STILL_HOLD_MS = 4000;

/** True: the card plays on every splash shown at load (2026-10-28, kept for the three-page intro 2026-11-16). False: only the first in a session. */
export const CARD_EVERY_SPLASH = true;
export const CARD_KEY = 'lowlight.openingCardSeen';

/**
 * Whether the card plays before this splash: never without one, nor with SYS → INTRO on SKIP; then every time, or once
 * a session (blocked storage: every time).
 */
export function shouldShowOpeningCard(splash: boolean, storage: Pick<Storage, 'getItem'> = sessionStorage, every: boolean = CARD_EVERY_SPLASH, skipped: boolean = loadIntroSkipped()): boolean {
  if (!splash || skipped) return false;
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

export interface OpeningCard {
  el: HTMLElement;
  /** Resolves once the card has gone, by itself or skipped. */
  done: Promise<void>;
  skip(): void;
  /** Sound came on without a key (waitForSound): the card starts. */
  soundStarted(): void;
  destroy(): void;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Which characters of `line` are accent words. */
function accentMask(line: OpeningLine): boolean[] {
  const text = line.text ?? '';
  const mask = new Array<boolean>(text.length).fill(false);
  for (const w of line.accent ?? []) {
    for (let p = text.indexOf(w); p >= 0; p = text.indexOf(w, p + w.length)) mask.fill(true, p, p + w.length);
  }
  return mask;
}

/** `line`'s text into `into`, accent words in their own span (text nodes otherwise). */
function paintLine(into: HTMLElement, line: OpeningLine): void {
  const text = line.text ?? '';
  const mask = accentMask(line);
  let i = 0;
  while (i < text.length) {
    let j = i + 1;
    while (j < text.length && mask[j] === mask[i]) j++;
    into.append(mask[i] ? el('span', 'oc-accent', text.slice(i, j)) : document.createTextNode(text.slice(i, j)));
    i = j;
  }
}

/** Each character of each line in its own hidden span, so the page is laid out at its full size before anything shows. */
function letterSpans(lines: OpeningLine[], els: HTMLElement[]): Letter[] {
  const out: Letter[] = [];
  lines.forEach((line, k) => {
    const mask = accentMask(line);
    [...(line.text ?? '')].forEach((ch, q) => {
      const span = el('span', mask[q] ? 'oc-accent' : '', ch);
      span.style.visibility = 'hidden';
      els[k].append(span);
      if (ch.trim()) out.push({ span, ch, final: mask[q] ? RED : PALE, line: els[k] });
    });
  });
  return out;
}
const lettersOf = (rows: Row[]): Letter[] =>
  rows.flatMap((r) => r.spans.filter((s) => s.textContent!.trim()).map((span) => ({ span, ch: span.textContent!, final: span.classList.contains('oc-accent') ? RED : PALE, line: r.el })));

/** What runs on the page that's up, so a key, the wheel or leaving can reach it. */
interface PageRun {
  page: HTMLElement;
  title: TitleBuild | null;
  lines: HTMLElement[];
  win?: HTMLElement;
  done: boolean;
  /** A key while it plays: finish it, or jump to its end. */
  finish(): void;
  sc?: Scroller;
  /** Stops the scroll window's slide where it was headed, before anything is measured in it. */
  settle?(): void;
  stop(): void;
}

export function mountOpeningCard(
  host: HTMLElement,
  opts: {
    reducedMotion: boolean;
    card?: Card;
    onGesture?: () => void;
    /** The browser blocked sound: the card opens on the sound prompt, and its first key or click starts sound and the card (it doesn't skip). */
    waitForSound?: boolean;
  },
): OpeningCard {
  const card = opts.card ?? COPY.openingCard;
  const pages: OpeningPage[] = card.pages;
  const root = el('div', `opening-card${opts.reducedMotion ? ' still' : ''}`);
  const hint = el('div', 'oc-hint');
  const pager = el('div', 'oc-pager');
  root.append(pager, hint);
  const sound = opts.waitForSound ? el('div', 'oc-sound', SOUND_PROMPT) : null;
  if (sound) {
    root.classList.add('waiting');
    root.append(sound);
  }
  host.append(root);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let leaving = false;
  let started = false;
  let idx = 0;
  let cur: PageRun | null = null;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const later = (ms: number, fn: () => void) => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
  const setHint = (state: keyof Card['hint']) => {
    hint.textContent = card.hint[state];
    hint.classList.toggle('ready', state === 'ready');
  };
  const showPager = () => {
    pager.replaceChildren();
    pages.forEach((p, i) => {
      if (i) pager.append(document.createTextNode(' · '));
      pager.append(i === idx ? el('b', '', p.title) : document.createTextNode(p.title));
    });
    pager.append(document.createTextNode(`  ${String(idx + 1).padStart(2, '0')}/${String(pages.length).padStart(2, '0')}`));
  };

  /** Closes the page that's up: its timers, flights and scroll, and its elements. */
  const closePage = () => {
    clear();
    cur?.stop();
    cur = null;
    root.querySelectorAll('.oc-page, .oc-fly').forEach((e) => e.remove());
  };
  /** Everything showing on the page that's up, for the flight into the next (or previous) name. */
  const glyphsOfPage = (): Source[] | undefined => {
    if (!cur?.title || opts.reducedMotion) return undefined;
    cur.settle?.();
    return pageGlyphs(root, cur.lines, cur.title, cur.win);
  };

  /** Opens page `i`: its name gathers `from` the last page's glyphs (or decrypts), then its text; `atEnd` opens it scrolled to its end. */
  const openPage = (i: number, from?: Source[], atEnd = false) => {
    closePage();
    idx = i;
    showPager();
    const data = pages[i];
    const page = el('div', 'oc-page');
    const name = el('div', 'oc-name');
    const nameText = el('span', 'oc-name-text', data.title);
    name.append(nameText);
    page.append(name);
    root.append(page);
    const title = mountTitleCanvas(name, data.title);
    if (title) name.classList.add('blocks');
    const lines = data.lines.map((l) => el('div', `oc-line${l.kind ? ` ${l.kind}` : ''}`));
    page.append(...lines);
    const cursor = el('span', 'oc-cursor');
    let flight: Flight | null = null;
    const run: PageRun = {
      page,
      title,
      lines,
      done: false,
      finish: () => {},
      stop: () => {
        flight?.stop();
        flight = null;
        title?.stop();
        run.sc?.stop();
      },
    };
    cur = run;
    const live = () => cur === run && !leaving;
    const ready = () => {
      run.done = true;
      setHint('ready');
    };
    setHint('playing');

    // No effects (reduced motion, or no canvas): the finished name and everything at once, then on by itself after a read.
    if (!title || opts.reducedMotion) {
      title?.finish();
      data.lines.forEach((l, k) => paintLine(lines[k], l));
      [...lines].reverse().find((_, k) => data.lines[data.lines.length - 1 - k].text)?.append(cursor);
      const letterCount = data.lines.reduce((n, l) => n + (l.text ?? '').replace(/\s/g, '').length, 0);
      ready();
      later(Math.max(STILL_HOLD_MS, readMs(letterCount) * END_READ), advance);
      return;
    }

    letterSpans(data.lines, lines);
    const { win, inner, rows, H } = buildWindow(lines, title.cells.length);
    run.win = win;
    run.lines = rows.map((r) => r.el);
    const first = lettersOf(visibleRows(rows, 0, H).map((j) => rows[j]));
    const show = (s: number) => (inner.style.transform = `translateY(${-rows[s].top}px)`);
    // Measuring while the window is still sliding from the last move would put glyphs part of a row off: it
    // lands where it was headed first.
    const settle = () => {
      inner.style.transition = 'none';
      void inner.offsetHeight;
      inner.style.transition = '';
    };
    run.settle = settle;

    const startScroll = () => {
      if (!live() || run.sc) return;
      flight = null;
      run.sc = scroller({
        rows,
        H,
        moveTo: (to, fromS, entering, leavingRows, landed) => {
          settle();
          const delta = rows[to].top - rows[fromS].top;
          const srcs = lettersOf(leavingRows.map((j) => rows[j]))
            .filter((l) => l.span.style.visibility !== 'hidden')
            .map((l) => localPos(root, l.span));
          const tgts = lettersOf(entering.map((j) => rows[j])).map((l) => {
            const at = localPos(root, l.span);
            return { ...l, x: at.x, y: at.y - delta };
          });
          for (const j of leavingRows) for (const sp of rows[j].spans) sp.style.visibility = 'hidden';
          show(to);
          if (!tgts.length) return null;
          flight = flyRows(root, srcs, tgts, () => {
            flight = null;
            if (!live()) return;
            if (!run.done) tgts[tgts.length - 1].span.after(cursor);
            landed();
          });
          return flight;
        },
        showAll: (s) => {
          const vis = new Set(visibleRows(rows, s, H));
          rows.forEach((r, j) => r.spans.forEach((sp) => (sp.style.visibility = vis.has(j) ? '' : 'hidden')));
          show(s);
        },
        onEnd: () => {
          const last = lettersOf(rows).at(-1);
          (last?.span ?? inner).after(cursor);
          ready();
        },
        onScrolling: () => setHint('scrolling'),
        next: () => live() && advance(),
        back: () => live() && back(),
      });
    };
    // The name: gathered from the last page's glyphs, or decrypting in place. Then `then`, `after` ms on.
    const buildName = (then: () => void, after: number) => {
      if (from) {
        flight = gather(root, from, title, () => {
          flight = null;
          if (live()) later(after + 150, () => !run.sc && then());
        });
        return;
      }
      title.start();
      later(TITLE_BUILD_MS + after, () => !run.sc && then());
    };
    // A key while it plays: everything in the first window there at once, the name loosened, then the crawl (which a
    // second key, while it scrolls, jumps to the end of).
    run.finish = () => {
      if (run.sc) return run.sc.key();
      clear();
      // Stopped, not finished: a flight's done would carry on to its next step, which this does itself.
      flight?.stop();
      flight = null;
      title.gatherEnd();
      title.finish();
      first.forEach((l) => (l.span.style.visibility = ''));
      first.at(-1)?.span.after(cursor);
      title.loosenAll();
      startScroll();
    };
    if (atEnd) {
      // Back from the next page: the name forms, and the text is already all there, scrolled to its end.
      buildName(() => {
        title.loosenAll();
        startScroll();
        run.sc?.key();
      }, 0);
      return;
    }
    buildName(() => {
      flight = reform(root, first, title, () => {
        flight = null;
        if (!live()) return;
        first.at(-1)?.span.after(cursor);
        startScroll();
      });
    }, REFORM_AFTER_MS);
  };

  /** On to the next name (its glyphs flying up into it), or after the last, away to the splash. */
  function advance() {
    if (leaving || !cur) return;
    if (idx + 1 >= pages.length) return leave();
    const from = glyphsOfPage();
    openPage(idx + 1, from);
  }
  /** Back to the previous name (the wheel past the top), opened at its end. */
  function back() {
    if (leaving || !cur || idx === 0) return;
    const from = glyphsOfPage();
    openPage(idx - 1, from, true);
  }

  const stopListening = () => {
    window.removeEventListener('keydown', onKey, true);
    root.removeEventListener('pointerdown', onPointer);
    root.removeEventListener('wheel', onWheel);
  };
  function leave() {
    if (leaving) return;
    leaving = true;
    clear();
    cur?.stop();
    root.querySelectorAll('.oc-fly').forEach((e) => e.remove());
    // Keys stay swallowed while it glitches out: a quick second key mustn't dismiss the splash too.
    void glitchOut(root, { reducedMotion: opts.reducedMotion }).then(() => {
      stopListening();
      root.remove();
      resolveDone();
    });
  }
  const gesture = (e: Event, key?: string) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (leaving) return;
    opts.onGesture?.();
    // Waiting for sound: this gesture starts it, and the card begins rather than ending.
    if (!started) return begin();
    if (key === 'Escape') return leave();
    if (!cur) return;
    if (!cur.done) cur.finish();
    else advance();
  };
  const onKey = (e: KeyboardEvent) => gesture(e, e.key);
  const onPointer = (e: PointerEvent) => gesture(e);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!leaving) cur?.sc?.wheel(e.deltaY);
  };
  // Capture on the window: the card sees the key before anything underneath does.
  window.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', onPointer);
  root.addEventListener('wheel', onWheel, { passive: false });

  const begin = () => {
    if (started || leaving) return;
    started = true;
    sound?.remove();
    root.classList.remove('waiting');
    // The glyphs are drawn on canvases, which only draw a font once it's loaded.
    const fonts = document.fonts as FontFaceSet | undefined;
    if (opts.reducedMotion || !fonts) return openPage(0);
    void Promise.all([fonts.ready, fonts.load("20px 'Lowlight Han'", '电').catch(() => null)]).then(() => {
      if (!leaving && !cur) openPage(0);
    });
  };
  if (!opts.waitForSound) begin();

  return {
    el: root,
    done,
    skip: leave,
    soundStarted: begin,
    destroy() {
      leaving = true;
      clear();
      cur?.stop();
      cur = null;
      stopListening();
      root.remove();
      resolveDone();
    },
  };
}
