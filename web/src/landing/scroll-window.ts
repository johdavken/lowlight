/**
 * The opening card's text window (mockup docs/mockups/intro-story.html). A page's letters, each in its own span, are
 * regrouped into one div per visual row inside a window tall enough to hold a letter for every block of the name, so
 * every block can fly off into the text before anything scrolls. Then it crawls: a row leaves the top each time the
 * reader has had long enough to read it, and the wheel moves it either way. The scroller itself never touches the DOM;
 * the card hands it `moveTo`/`showAll`, so its timing is testable on its own.
 */

/** Where a row sits in the window's content, and how many letters it holds. */
export interface RowGeom {
  top: number;
  h: number;
  letters: number;
}
export interface Row extends RowGeom {
  el: HTMLElement;
  spans: HTMLElement[];
}

/** Reading pace: a row is given this long a letter, never less than READ_MIN_MS. */
export const READ_MS_PER_CHAR = 40;
export const READ_MIN_MS = 1200;
/** At the end of a page, its last window is held this share of its full reading time (most of it was read on the way). */
export const END_READ = 0.6;
/** Wheel delta that moves a row (about a notch). */
export const WHEEL_STEP = 40;
/** The window never grows past this many lines. */
export const MAX_ROWS = 12;
/** Slack under the last row that fits, so a label's margin doesn't cost a whole row. */
const SLACK = 4;

export const readMs = (letters: number): number => Math.max(READ_MIN_MS, letters * READ_MS_PER_CHAR);

/** The window's height: down to the first row that brings the letters to `need`, capped at MAX_ROWS lines. */
export function fitHeight(rows: readonly RowGeom[], need: number, lineH: number): number {
  let n = 0;
  let k = 0;
  while (k < rows.length && n < need) n += rows[k++].letters;
  const last = rows[Math.max(0, k - 1)];
  const fit = last ? last.top + last.h + SLACK : lineH;
  return Math.min(Math.round(MAX_ROWS * lineH), fit);
}

/** The rows wholly inside the window when row `s` is at its top. */
export function visibleRows(rows: readonly RowGeom[], s: number, H: number): number[] {
  const top = rows[s]?.top ?? 0;
  const out: number[] = [];
  rows.forEach((r, j) => {
    if (r.top >= top - 0.5 && r.top + r.h <= top + H + 0.5) out.push(j);
  });
  return out;
}

/** The first top row at which the last row is in the window: the end of the scroll. */
export function endIndex(rows: readonly RowGeom[], H: number): number {
  const last = rows.length - 1;
  let s = 0;
  while (s < last && !visibleRows(rows, s, H).includes(last)) s++;
  return s;
}

/**
 * Moves `lines`' letter spans into one div per visual row (a span starts a new row when its top changes), inside a
 * window as tall as `fitHeight` says for `need` letters, in place of the lines. Gap lines become empty rows.
 */
export function buildWindow(lines: HTMLElement[], need: number): { win: HTMLElement; inner: HTMLElement; rows: Row[]; H: number } {
  const groups: { cls: string; spans: HTMLElement[] }[] = [];
  for (const line of lines) {
    const spans = [...line.children] as HTMLElement[];
    if (!spans.length) {
      groups.push({ cls: line.className, spans: [] });
      continue;
    }
    let top: number | null = null;
    let g: { cls: string; spans: HTMLElement[] } | null = null;
    for (const sp of spans) {
      if (sp.offsetTop !== top) {
        top = sp.offsetTop;
        g = { cls: line.className, spans: [] };
        groups.push(g);
      }
      g!.spans.push(sp);
    }
  }
  const plain = lines.find((l) => l.className === 'oc-line') ?? lines[0];
  const lineH = parseFloat(getComputedStyle(plain).lineHeight) || 32;
  const win = document.createElement('div');
  win.className = 'oc-window';
  const inner = document.createElement('div');
  inner.className = 'oc-window-inner';
  win.append(inner);
  const rows: Row[] = groups.map((g) => {
    const el = document.createElement('div');
    el.className = `${g.cls} oc-row`;
    el.append(...g.spans);
    inner.append(el);
    return { el, spans: g.spans, top: 0, h: 0, letters: g.spans.filter((s) => s.textContent!.trim()).length };
  });
  lines[0].before(win);
  lines.forEach((l) => l.remove());
  for (const r of rows) {
    r.top = r.el.offsetTop;
    r.h = r.el.offsetHeight;
  }
  win.style.height = `${fitHeight(rows, need, lineH)}px`;
  return { win, inner, rows, H: win.clientHeight };
}

/** What the scroller asks of the card. */
export interface ScrollHost {
  rows: readonly RowGeom[];
  /** The window's height. */
  H: number;
  /** Moves the window from top row `from` to `to`: hide `leaving`, fly them into `entering`. Null when nothing flies. */
  moveTo(to: number, from: number, entering: number[], leaving: number[], done: () => void): { finish(): void; stop(): void } | null;
  /** Shows the window at top row `s` with everything in it revealed (a key's jump to the end). */
  showAll(s: number): void;
  /** The last row is in, for the first time. */
  onEnd(): void;
  /** Crawling: the hint says so. */
  onScrolling(): void;
  /** Past the end (wheel, or the end's hold run out): the next page. Past the top (wheel): the page before. */
  next(): void;
  back(): void;
}
export interface Scroller {
  wheel(dy: number): void;
  /** Jumps to the end. */
  key(): void;
  stop(): void;
}

/**
 * The crawl: waits one row's reading time, moves a row, and so on; once the last row is in it holds END_READ of the
 * window's reading time and calls `next`. The wheel moves a row either way (past an end it calls `next`/`back`); a row
 * in flight lands at once first. Any move restarts the wait.
 */
export function scroller(host: ScrollHost): Scroller {
  const R = host.rows;
  const endS = endIndex(R, host.H);
  let s = 0;
  let done = false;
  let acc = 0;
  let fx: { finish(): void; stop(): void } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const letters = (idx: number[]) => idx.reduce((n, j) => n + R[j].letters, 0);
  const schedule = () => {
    clear();
    if (stopped) return;
    if (s >= endS) {
      if (!done) {
        done = true;
        host.onEnd();
      }
      timer = setTimeout(() => {
        host.next();
        schedule();
      }, readMs(letters(visibleRows(R, endS, host.H))) * END_READ);
      return;
    }
    if (!done) host.onScrolling();
    timer = setTimeout(() => step(1), readMs(R[s].letters));
  };
  const step = (dir: number) => {
    clear();
    const to = s + dir;
    // Past an end: the card moves on (and stops this scroller), or can't (back from its first page), and the crawl goes on.
    if (to < 0 || to > endS) {
      if (to < 0) host.back();
      else host.next();
      return schedule();
    }
    const before = visibleRows(R, s, host.H);
    const after = visibleRows(R, to, host.H);
    const leaving = before.filter((j) => !after.includes(j));
    const entering = after.filter((j) => !before.includes(j));
    const from = s;
    s = to;
    fx = host.moveTo(to, from, entering, leaving, () => {
      fx = null;
      schedule();
    });
    if (!fx) schedule();
  };
  schedule();
  return {
    wheel(dy) {
      acc += dy;
      if (Math.abs(acc) < WHEEL_STEP) return;
      const dir = Math.sign(acc);
      acc = 0;
      fx?.finish();
      step(dir);
    },
    key() {
      clear();
      fx?.stop();
      fx = null;
      s = endS;
      host.showAll(endS);
      schedule();
    },
    stop() {
      stopped = true;
      clear();
      fx?.stop();
      fx = null;
    },
  };
}
