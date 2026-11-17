/**
 * The decrypt effect from TerminalTextEffects (MIT, © 2023 ChrisBuilds; https://github.com/ChrisBuilds/terminaltexteffects),
 * the one the Omarchy screensaver plays through ttfx, ported as a pure, seeded timeline.
 *
 * Upstream: cells are typed in reading order (▉▓▒░ then a cipher glyph, a random cipher colour each
 * frame); once all are typed every cell cycles fast through 80 random glyphs, then slowly through
 * 1–15 more (some held 35–60 frames), then flashes white into its final colour. Here it runs at the
 * screensaver's 120 frames a second, squeezed to about 2.6 s: faster typing, 50 fast glyphs, a shorter
 * slow tail (1–10 glyphs, long holds 15–30 frames) clipped at the end, and the card's reds instead of
 * green and amber.
 */
import { rng } from '../../../shared/rng';
import type { ArtCell } from './lowlight-art';

export const TICKS_PER_S = 120;
/** How long the title takes to build; the card's lines wait this long. */
export const TITLE_BUILD_MS = 2600;
const BUILD_TICKS = Math.round((TITLE_BUILD_MS * TICKS_PER_S) / 1000);
/** About how long typing takes, and the tick by which every cell has been typed. */
const TYPE_TICKS = 80;
const TYPE_GLYPHS = ['▉', '▓', '▒', '░'];
const FAST_GLYPHS = 50;
const FAST_TICKS = 2;
const FLASH_TICKS = 5;

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => String.fromCodePoint(a + i));
/** Upstream's cipher pool: printable ASCII, block elements, box drawing, Latin-1 and Latin Extended. */
export const CIPHER: readonly string[] = [...range(33, 127), ...range(9608, 9632), ...range(9472, 9599), ...range(174, 452)];
export const CIPHER_COLOURS: readonly string[] = ['#80100f', '#c8181c', '#ff2a2a'];
/** The final colours, top row to bottom row. */
const FINAL_TOP = [255, 96, 80];
const FINAL_BOTTOM = [229, 20, 26];
const WHITE = [255, 255, 255];

const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

interface Seg {
  start: number;
  end: number;
  glyph: string;
  colour: string;
}
export interface CellPlan {
  cell: ArtCell;
  segs: Seg[];
  final: string;
}
export interface DecryptPlan {
  cells: CellPlan[];
  /** The tick on which every cell shows its final character in its final colour. */
  ticks: number;
}
/** A cell as drawn on one tick: a glyph in a colour, `final` once it is the real block character. */
export interface Shown {
  glyph: string;
  colour: string;
  final: boolean;
}

/** `cipher` is the pool of glyphs a cell cycles through on its way (upstream's by default; the opening card passes the decode's Han). */
export function planDecrypt(cells: readonly ArtCell[], rows: number, seed: number, cipher: readonly string[] = CIPHER): DecryptPlan {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const between = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const plans: CellPlan[] = cells.map((cell) => {
    const top = mix(FINAL_TOP, FINAL_BOTTOM, rows > 1 ? cell.row / (rows - 1) : 0);
    return { cell, segs: [], final: hex(top) };
  });

  // Typing: each tick, three times in four, the next few cells in reading order appear.
  const speed = Math.max(1, Math.ceil(plans.length / (TYPE_TICKS * 0.75)));
  let next = 0;
  for (let t = 0; next < plans.length; t++) {
    if (t < TYPE_TICKS && r() > 0.75) continue;
    const take = t >= TYPE_TICKS ? plans.length - next : speed;
    for (const p of plans.slice(next, next + take)) {
      let at = t;
      for (const g of TYPE_GLYPHS) for (let k = 0; k < 2; k++, at++) p.segs.push({ start: at, end: at + 1, glyph: g, colour: pick(CIPHER_COLOURS) });
      p.segs.push({ start: at, end: at + 1, glyph: pick(cipher), colour: pick(CIPHER_COLOURS) });
    }
    next += take;
  }
  // The last typed glyph stays until every cell starts decrypting together.
  const decrypt = Math.max(...plans.map((p) => p.segs[p.segs.length - 1].end));
  const lockBy = BUILD_TICKS - FLASH_TICKS;
  let ticks = 0;
  for (const p of plans) {
    p.segs[p.segs.length - 1].end = decrypt;
    const colour = pick(CIPHER_COLOURS);
    let at = decrypt;
    for (let i = 0; i < FAST_GLYPHS; i++, at += FAST_TICKS) p.segs.push({ start: at, end: at + FAST_TICKS, glyph: pick(cipher), colour });
    const slow = between(1, 10);
    for (let i = 0; i < slow && at < lockBy; i++) {
      const hold = r() <= 0.3 ? between(15, 30) : between(3, 5);
      const end = Math.min(at + hold, lockBy);
      p.segs.push({ start: at, end, glyph: pick(cipher), colour });
      at = end;
    }
    // The discovered flash: the real character, white fading into its final colour.
    const final = mix(FINAL_TOP, FINAL_BOTTOM, p.cell.row / Math.max(1, rows - 1));
    for (let k = 0; k < FLASH_TICKS; k++, at++) p.segs.push({ start: at, end: at + 1, glyph: p.cell.ch, colour: hex(mix(WHITE, final, k / FLASH_TICKS)) });
    ticks = Math.max(ticks, at);
  }
  return { cells: plans, ticks };
}

/** Every cell on `tick`: null before it is typed, else what it shows. `done` once all are final. */
export function frameAt(plan: DecryptPlan, tick: number): { cells: (Shown | null)[]; done: boolean } {
  const cells = plan.cells.map((p): Shown | null => {
    const { segs } = p;
    if (tick < segs[0].start) return null;
    if (tick >= segs[segs.length - 1].end) return { glyph: p.cell.ch, colour: p.final, final: true };
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].start <= tick) lo = mid;
      else hi = mid - 1;
    }
    const s = segs[lo];
    return { glyph: s.glyph, colour: s.colour, final: false };
  });
  return { cells, done: tick >= plan.ticks };
}
