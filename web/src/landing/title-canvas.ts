/**
 * The opening card's names drawn as block letters on a canvas, decrypting themselves (decrypt.ts) through the chat
 * decode's Han glyphs. Finished cells are drawn as rectangles (█ full, ▀ top half, ▄ bottom half) so the letters stay
 * crisp; glyphs on the way there are text in 'Lowlight Han' (ui/style.css).
 *
 * Two more states, for the glyph flights (glyph-fly.ts):
 * - loosened: a cell whose glyph flew off to the text shows a dimmer Han glyph instead of its block, cycling for as
 *   long as the name is up;
 * - gathering: the name builds from glyphs flying in from the last page. A cell appears when one lands, cycles, then
 *   each flashes white into its block.
 */
import { GLYPHS } from '../room/table/decode';
import { frameAt, planDecrypt, TICKS_PER_S, type DecryptPlan } from './decrypt';
import { artCells, blockArt, type ArtCell } from './lowlight-art';

/** One cell in stage pixels: a terminal cell's 1:2, so ▀ and ▄ are square. */
export const CELL_W = 10;
export const CELL_H = 20;
/** Backing pixels per stage pixel, for a sharp title when the stage is scaled up. */
const DENSITY = 2;
/** The decode's Chinese glyphs, one per entry. */
export const HAN: readonly string[] = [...GLYPHS];
const FONT = `${Math.round(CELL_H * 0.75)}px 'Lowlight Han', sans-serif`;
/** How often a loosened cell's glyph may change (the decode's noise rate), and the chance it does on a beat. */
const CYCLE_MS = 66;
const CYCLE_CHANCE = 0.45;
/** A loosened cell's glyph, against its block. */
const LOOSE_ALPHA = 0.75;
/** Gathering: cells lock into their blocks over this spread, each flashing white for FLASH_MS. */
const LOCK_SPREAD_MS = 420;
const LOCK_FLASH_MS = 120;
const CIPHER_REDS = ['#80100f', '#c8181c', '#ff2a2a'];

export interface TitleBuild {
  canvas: HTMLCanvasElement;
  /** The art's filled cells in reading order, and one cell's size in stage pixels. */
  cells: readonly ArtCell[];
  cellW: number;
  cellH: number;
  /** Starts the build; `onDone` runs once every letter is final. */
  start(onDone?: () => void): void;
  /** Draws the finished title at once (reduced motion, or after a build). */
  finish(): void;
  /** Stops every animation where it is. */
  stop(): void;
  /** Cell `i` loses its block to a cycling glyph; false when it already had. */
  loosen(i: number): boolean;
  loosenAll(): void;
  /** Gathering: starts it (nothing shows), a glyph lands on cell `i`, then every cell locks in and `done` runs. */
  gatherStart(): void;
  gatherHit(i: number): void;
  gatherLock(done: () => void): void;
  /** Ends gathering at once, the name finished. */
  gatherEnd(): void;
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Mounts the canvas title in `into`, or returns null (and mounts nothing) when there's no art for `title` or no 2D canvas. */
export function mountTitleCanvas(into: HTMLElement, title: string, seed: number = Math.floor(Math.random() * 2 ** 32)): TitleBuild | null {
  const art = blockArt(title);
  if (!art) return null;
  const { cells, cols, rows } = artCells(art);
  const canvas = document.createElement('canvas');
  canvas.className = 'oc-title-canvas';
  canvas.width = cols * CELL_W * DENSITY;
  canvas.height = rows * CELL_H * DENSITY;
  canvas.style.width = `${cols * CELL_W}px`;
  canvas.style.height = `${rows * CELL_H}px`;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  const c = ctx;
  c.scale(DENSITY, DENSITY);
  c.font = FONT;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  into.append(canvas);

  const plan: DecryptPlan = planDecrypt(cells, rows, seed, HAN);
  const han = () => HAN[Math.floor(Math.random() * HAN.length)];
  const loose = new Map<number, string>();
  let gather: { shown: Set<number>; lock: number[] | null; colour: string[] } | null = null;
  let lastTick = 0;

  const block = (cell: ArtCell, colour: string) => {
    const x = cell.col * CELL_W;
    const y = cell.row * CELL_H;
    c.fillStyle = colour;
    if (cell.ch === '▀') c.fillRect(x, y, CELL_W, CELL_H / 2);
    else if (cell.ch === '▄') c.fillRect(x, y + CELL_H / 2, CELL_W, CELL_H / 2);
    else c.fillRect(x, y, CELL_W, CELL_H);
  };
  const glyph = (cell: ArtCell, g: string, colour: string) => {
    c.fillStyle = colour;
    c.fillText(g, cell.col * CELL_W + CELL_W / 2, cell.row * CELL_H + CELL_H / 2);
  };
  const drawGather = (g: NonNullable<typeof gather>) => {
    const now = performance.now();
    plan.cells.forEach((p, i) => {
      if (!g.shown.has(i)) return;
      const at = g.lock ? g.lock[i] : Infinity;
      if (now < at) return glyph(p.cell, loose.get(i) ?? HAN[0], g.colour[i]);
      block(p.cell, hex(mix([255, 255, 255], parse(p.final), Math.min(1, (now - at) / LOCK_FLASH_MS))));
    });
  };
  const draw = (tick: number) => {
    lastTick = tick;
    c.clearRect(0, 0, cols * CELL_W, rows * CELL_H);
    if (gather) return drawGather(gather);
    const f = frameAt(plan, tick);
    f.cells.forEach((s, i) => {
      if (!s) return;
      const cell = plan.cells[i].cell;
      if (s.final && loose.has(i)) {
        c.globalAlpha = LOOSE_ALPHA;
        glyph(cell, loose.get(i)!, s.colour);
        c.globalAlpha = 1;
        return;
      }
      if (s.final) return block(cell, s.colour);
      glyph(cell, s.glyph, s.colour);
    });
  };

  let raf: number | null = null;
  let cyc: number | null = null;
  let lockTimer: ReturnType<typeof setTimeout> | null = null;
  // Loosened cells keep cycling, each on its own beat; a gathering name redraws every frame while it locks in.
  const cycle = () => {
    if (cyc !== null) return;
    let last = 0;
    const f = (now: number) => {
      if (now - last > CYCLE_MS) {
        last = now;
        for (const i of loose.keys()) if (Math.random() < CYCLE_CHANCE) loose.set(i, han());
        if (raf === null) draw(Math.max(lastTick, plan.ticks));
      } else if (gather?.lock) draw(lastTick);
      cyc = requestAnimationFrame(f);
    };
    cyc = requestAnimationFrame(f);
  };
  const stopBuild = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  };

  const build: TitleBuild = {
    canvas,
    cells,
    cellW: CELL_W,
    cellH: CELL_H,
    start(onDone) {
      stopBuild();
      const t0 = performance.now();
      const frame = (now: number) => {
        const tick = Math.floor(((now - t0) * TICKS_PER_S) / 1000);
        draw(Math.max(0, tick));
        if (tick >= plan.ticks) {
          raf = null;
          onDone?.();
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      draw(0);
      raf = requestAnimationFrame(frame);
    },
    finish() {
      stopBuild();
      draw(plan.ticks);
    },
    stop() {
      stopBuild();
      if (cyc !== null) cancelAnimationFrame(cyc);
      cyc = null;
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = null;
    },
    loosen(i) {
      if (loose.has(i)) return false;
      loose.set(i, han());
      cycle();
      return true;
    },
    loosenAll() {
      cells.forEach((_, i) => loose.has(i) || loose.set(i, han()));
      draw(plan.ticks);
      cycle();
    },
    gatherStart() {
      gather = { shown: new Set(), lock: null, colour: cells.map(() => CIPHER_REDS[Math.floor(Math.random() * CIPHER_REDS.length)]) };
      draw(0);
      cycle();
    },
    gatherHit(i) {
      if (!gather) return;
      gather.shown.add(i);
      if (!loose.has(i)) loose.set(i, han());
    },
    gatherLock(done) {
      const g = gather;
      if (!g) return done();
      cells.forEach((_, i) => build.gatherHit(i));
      const t0 = performance.now();
      g.lock = cells.map(() => t0 + Math.random() * LOCK_SPREAD_MS);
      lockTimer = setTimeout(() => {
        lockTimer = null;
        if (gather !== g) return;
        build.gatherEnd();
        done();
      }, LOCK_SPREAD_MS + LOCK_FLASH_MS + 40);
    },
    gatherEnd() {
      gather = null;
      loose.clear();
      draw(plan.ticks);
    },
  };
  return build;
}
