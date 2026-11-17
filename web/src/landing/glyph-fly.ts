/**
 * The opening card's glyph flights (mockup docs/mockups/intro-story.html), drawn on a canvas over the card:
 * - `reform`: the name's glyphs peel off and settle into the text, each block loosening as its glyph leaves;
 * - `flyRows`: when the text scrolls, the rows leaving the window become the glyphs that form the rows coming in;
 * - `gather`: between pages, the text and the old name fly up into the next name.
 * A glyph in flight is one of the decode's Han glyphs in a cipher red; it lands, holds a moment, then flashes white into
 * its letter. Positions are in the card's own pixels (the 1600×900 stage), whatever the stage's zoom.
 */
import { rng } from '../../../shared/rng';
import { CIPHER_COLOURS } from './decrypt';
import { HAN, type TitleBuild } from './title-canvas';

export interface Pt {
  x: number;
  y: number;
}
/** A letter of the text: its hidden span, the character, its final colour and the line it sits in (for its font). */
export interface Letter {
  span: HTMLElement;
  ch: string;
  final: number[];
  line: HTMLElement;
}
/** Something on a page that can fly: a letter as it was (`ch`, its font and colour) or a cell of the name (no `ch`). */
export interface Source extends Pt {
  ch?: string;
  font?: string;
  colour?: string;
}
export interface Flight {
  /** Lands everything at once (and runs the flight's done). */
  finish(): void;
  /** Stops where it is; done never runs. */
  stop(): void;
}

export const PALE = [221, 214, 212];
export const RED = [255, 42, 42];
const WHITE = [255, 255, 255];
const FLASH_MS = 90;
/** How often a glyph in flight changes (about the decode's rate). */
const FLICK_MS = 45;
/** reform: the letters leave in reading order over this spread; each flight's length. */
const REFORM_SPREAD_MS = 1900;
const REFORM_FLY_MS: [number, number] = [420, 760];
/** gather: everything leaves within this spread. */
const GATHER_SPREAD_MS = 900;

export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * Pairs sources with targets so every target gets a glyph: `max(nSrc, nTgt)` pairs in a shuffled order, sources reused
 * when there are fewer of them, targets reused when there are fewer of those. Empty when either side is.
 */
export function assign(nSrc: number, nTgt: number, r: () => number): [number, number][] {
  if (!nSrc || !nTgt) return [];
  const shuffle = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const s = shuffle(nSrc);
  const t = shuffle(nTgt);
  return Array.from({ length: Math.max(nSrc, nTgt) }, (_, k) => [s[k % nSrc], t[k % nTgt]]);
}

/** The card's zoom: its drawn width over its own width (1 when it has none, as in tests). */
function zoom(host: HTMLElement): number {
  const w = host.offsetWidth;
  return w ? host.getBoundingClientRect().width / w : 1;
}
/** The centre of `el` in `host`'s own pixels. */
export function localPos(host: HTMLElement, el: Element | Range): Pt {
  const h = host.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const k = zoom(host);
  return { x: (b.left - h.left) / k + b.width / k / 2, y: (b.top - h.top) / k + b.height / k / 2 };
}
/** Where each cell of `title` sits in `host`'s pixels. */
export function cellPositions(host: HTMLElement, title: TitleBuild): Pt[] {
  const h = host.getBoundingClientRect();
  const b = title.canvas.getBoundingClientRect();
  const k = zoom(host);
  const x0 = (b.left - h.left) / k;
  const y0 = (b.top - h.top) / k;
  return title.cells.map((c) => ({ x: x0 + (c.col + 0.5) * title.cellW, y: y0 + (c.row + 0.5) * title.cellH }));
}

/** Every glyph showing on a page: its letters inside `win` (or all of them), then the name's cells when it shows. */
export function pageGlyphs(host: HTMLElement, lines: HTMLElement[], title: TitleBuild | null, win?: HTMLElement): Source[] {
  const out: Source[] = [];
  const w = win?.getBoundingClientRect();
  for (const line of lines) {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const el = n.parentElement!;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      const colour = el.closest('.oc-accent') ? hex(RED) : hex(PALE);
      for (let q = 0; q < n.data.length; q++) {
        const ch = n.data[q];
        if (!ch.trim()) continue;
        const range = document.createRange();
        range.setStart(n, q);
        range.setEnd(n, q + 1);
        const b = range.getBoundingClientRect();
        if (!b.width) continue;
        if (w && (b.top < w.top - 1 || b.bottom > w.bottom + 1)) continue;
        out.push({ ...localPos(host, range), ch, font: `${cs.fontSize} ${cs.fontFamily}`, colour });
      }
    }
  }
  if (title && title.canvas.style.visibility !== 'hidden') out.push(...cellPositions(host, title));
  return out;
}

const fontOf = (line: HTMLElement) => {
  const cs = getComputedStyle(line);
  const size = parseFloat(cs.fontSize) || 24;
  return { font: `${cs.fontSize} ${cs.fontFamily}`, han: `${Math.round(size * 0.8)}px 'Lowlight Han', sans-serif` };
};

/** A canvas over `host`, its size, for one flight. */
function overlay(host: HTMLElement): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D; w: number; h: number } | null {
  const w = host.offsetWidth || 1600;
  const h = host.offsetHeight || 900;
  const canvas = document.createElement('canvas');
  canvas.className = 'oc-fly';
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.scale(2, 2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  host.append(canvas);
  return { canvas, c, w, h };
}

/** One glyph's trip: from (sx, sy) to (x, y), then a hold as cipher, then a flash into `ch`, then its span shows. */
interface Trip extends Pt {
  sx: number;
  sy: number;
  delay: number;
  fly: number;
  hold: number;
  arc: number;
  glyph: string;
  colour: string;
  letter: Letter;
  font: string;
  han: string;
  shown: boolean;
  /** The name cell it leaves from (reform). */
  cell?: number;
}

/** Runs trips to their letters on an overlay; `onLeave` sees each trip as it sets off. */
function runTrips(host: HTMLElement, trips: Trip[], r: () => number, onDone: () => void, o: { onLeave?: (t: Trip) => void; waiting?: (t: Trip, c: CanvasRenderingContext2D) => void } = {}): Flight {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const reveal = (t: Trip) => {
    if (t.shown) return;
    t.letter.span.style.visibility = '';
    t.shown = true;
  };
  const ov = overlay(host);
  let raf: number | null = null;
  let over = false;
  const stop = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    ov?.canvas.remove();
  };
  const finish = () => {
    if (over) return;
    over = true;
    trips.forEach(reveal);
    stop();
    onDone();
  };
  if (!ov || !trips.length) {
    // Nothing to draw on (or nothing to fly): land at once, after this turn.
    queueMicrotask(finish);
    return { finish, stop: () => (over = true) };
  }
  const { c, w, h } = ov;
  const left = new Set<Trip>();
  const total = Math.max(...trips.map((t) => t.delay + t.fly + t.hold + FLASH_MS));
  const t0 = performance.now();
  let lastFlick = 0;
  const frame = (now: number) => {
    const t = now - t0;
    const flick = t - lastFlick > FLICK_MS;
    if (flick) lastFlick = t;
    c.clearRect(0, 0, w, h);
    for (const p of trips) {
      if (p.shown) continue;
      if (flick) p.glyph = pick(HAN);
      if (t < p.delay) {
        o.waiting?.(p, c);
        continue;
      }
      if (!left.has(p)) {
        left.add(p);
        o.onLeave?.(p);
      }
      const u = t - p.delay;
      if (u < p.fly) {
        const e = easeInOut(u / p.fly);
        c.font = p.han;
        c.fillStyle = p.colour;
        c.fillText(p.glyph, p.sx + (p.x - p.sx) * e + Math.sin(Math.PI * e) * p.arc, p.sy + (p.y - p.sy) * e);
      } else if (u < p.fly + p.hold) {
        c.font = p.han;
        c.fillStyle = p.colour;
        c.fillText(p.glyph, p.x, p.y);
      } else if (u < p.fly + p.hold + FLASH_MS) {
        c.font = p.font;
        c.fillStyle = hex(mix(WHITE, p.letter.final, (u - p.fly - p.hold) / FLASH_MS));
        c.fillText(p.letter.ch, p.x, p.y);
      } else reveal(p);
    }
    if (t >= total) return finish();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { finish, stop };
}

/**
 * The name's glyphs peel off and settle into `letters` (hidden spans already laid out), in reading order over about
 * two seconds. Each block of the name loosens into a cycling glyph as its glyph leaves; on finish the whole name has.
 */
export function reform(host: HTMLElement, letters: Letter[], title: TitleBuild, onDone: () => void): Flight {
  const r = rng(Math.floor(Math.random() * 2 ** 32));
  const cells = cellPositions(host, title);
  const order = assign(cells.length, cells.length, r).map(([s]) => s);
  const trips: Trip[] = letters.map((letter, i) => {
    const cell = order[i % order.length];
    const at = localPos(host, letter.span);
    return {
      ...at,
      ...fontOf(letter.line),
      sx: cells[cell].x,
      sy: cells[cell].y,
      delay: (i / letters.length) * REFORM_SPREAD_MS + r() * 220,
      fly: REFORM_FLY_MS[0] + r() * (REFORM_FLY_MS[1] - REFORM_FLY_MS[0]),
      hold: r() < 0.3 ? 160 + r() * 260 : 30 + r() * 70,
      arc: (r() - 0.5) * 160,
      glyph: HAN[0],
      colour: CIPHER_COLOURS[Math.floor(r() * CIPHER_COLOURS.length)],
      letter,
      shown: false,
      cell,
    };
  });
  return runTrips(host, trips, r, () => {
    title.loosenAll();
    onDone();
  }, { onLeave: (t) => t.cell !== undefined && title.loosen(t.cell) });
}

/** The rows leaving the window (`srcs`, where they were) fly to the letters coming in (`tgts`, where they will be). */
export function flyRows(host: HTMLElement, srcs: Pt[], tgts: (Letter & Pt)[], onDone: () => void): Flight {
  const r = rng(Math.floor(Math.random() * 2 ** 32));
  const trips: Trip[] = tgts.map((t) => {
    const s = srcs.length ? srcs[Math.floor(r() * srcs.length)] : t;
    return {
      x: t.x,
      y: t.y,
      ...fontOf(t.line),
      sx: s.x,
      sy: s.y,
      delay: r() * 220,
      fly: srcs.length ? 520 + r() * 300 : 0,
      hold: 40 + r() * 220,
      arc: (r() - 0.5) * 120,
      glyph: HAN[0],
      colour: CIPHER_COLOURS[Math.floor(r() * CIPHER_COLOURS.length)],
      letter: { span: t.span, ch: t.ch, final: t.final, line: t.line },
      shown: false,
    };
  });
  return runTrips(host, trips, r, onDone);
}

/**
 * Everything showing on the last page (`sources`) flies up into the next name, which appears cell by cell as glyphs land
 * and then locks into its blocks. Letters still waiting stay drawn where they were; name cells wait as cipher.
 */
export function gather(host: HTMLElement, sources: Source[], title: TitleBuild, onDone: () => void): Flight {
  const r = rng(Math.floor(Math.random() * 2 ** 32));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const targets = cellPositions(host, title);
  const han = `${Math.round(title.cellH * 0.75)}px 'Lowlight Han', sans-serif`;
  const parts = assign(sources.length, targets.length, r).map(([s, t]) => ({
    s: sources[s],
    cell: t,
    tx: targets[t].x,
    ty: targets[t].y,
    delay: r() * GATHER_SPREAD_MS,
    fly: 480 + r() * 360,
    arc: (r() - 0.5) * 200,
    glyph: pick(HAN),
    colour: pick(CIPHER_COLOURS),
    done: false,
  }));
  title.gatherStart();
  const ov = overlay(host);
  let raf: number | null = null;
  let over = false;
  const halt = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    ov?.canvas.remove();
  };
  // Stopped is final: not even the name's lock (already under way) runs done after it.
  const stop = () => {
    over = true;
    halt();
  };
  const finish = () => {
    if (over) return;
    over = true;
    halt();
    title.gatherEnd();
    onDone();
  };
  if (!ov || !parts.length) {
    queueMicrotask(finish);
    return { finish, stop: () => (over = true) };
  }
  const { c, w, h } = ov;
  const total = Math.max(...parts.map((p) => p.delay + p.fly));
  const t0 = performance.now();
  let lastFlick = 0;
  const frame = (now: number) => {
    const t = now - t0;
    const flick = t - lastFlick > FLICK_MS;
    if (flick) lastFlick = t;
    c.clearRect(0, 0, w, h);
    for (const p of parts) {
      if (p.done) continue;
      if (flick) p.glyph = pick(HAN);
      if (t < p.delay) {
        if (p.s.ch) {
          c.font = p.s.font ?? han;
          c.fillStyle = p.s.colour ?? hex(PALE);
          c.fillText(p.s.ch, p.s.x, p.s.y);
        } else {
          c.font = han;
          c.fillStyle = p.colour;
          c.fillText(p.glyph, p.s.x, p.s.y);
        }
        continue;
      }
      const u = (t - p.delay) / p.fly;
      if (u >= 1) {
        p.done = true;
        title.gatherHit(p.cell);
        continue;
      }
      const e = easeInOut(u);
      c.font = han;
      c.fillStyle = p.colour;
      c.fillText(p.glyph, p.s.x + (p.tx - p.s.x) * e + Math.sin(Math.PI * e) * p.arc, p.s.y + (p.ty - p.s.y) * e);
    }
    if (t >= total) {
      halt();
      // The name locks in; done once its blocks are all there.
      title.gatherLock(() => {
        if (over) return;
        over = true;
        onDone();
      });
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { finish, stop };
}
