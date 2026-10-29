/**
 * Generates the three launch scenes as seeded procedural pixel art: layer PNGs, their emissive
 * maps and scene.json. Placeholder art only — replaced by final art later.
 *
 * Usage: `npm run gen:scenes` (writes to ./scenes).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LayerDef, SceneDef } from '../shared/types';
import { CLEAR, PixelCanvas, bayer4, mix, mulberry32, rgba, withAlpha, type RGBA } from './pixel';
import { CAMERA_MAX_X, CAMERA_MAX_Y } from '../web/src/renderer/camera';

const W = 480;
const H = 270;

/** Layer width: the render width plus parallax margin (48 px of travel at parallax 1). */
const layerWidth = (parallax: number) => (parallax > 0 ? W + Math.ceil(parallax * 48) : W);

// ---------------------------------------------------------------------------------------------
// Palette

const INK = rgba('#040209');
const C = {
  ink: INK,
  night0: rgba('#06030d'),
  night1: rgba('#0c0718'),
  v1: rgba('#120a20'),
  v2: rgba('#1a0f2c'),
  v3: rgba('#24153a'),
  v4: rgba('#33204c'),
  haze: rgba('#4c2c66'),
  mag: rgba('#5c1f50'),
  pink: rgba('#ff3c8a'),
  hotpink: rgba('#ff4f8b'),
  cyan: rgba('#3ff0ff'),
  ice: rgba('#7fe9ff'),
  amber: rgba('#ffb347'),
  orange: rgba('#ff8a3c'),
  red: rgba('#ff2d4a'),
  violet: rgba('#9b5cff'),
  lime: rgba('#b8ff6a'),
  beacon: rgba('#ff2020'),
  warm: rgba('#ffcf7a'),
  coolWin: rgba('#9fe8ff'),
  pinkWin: rgba('#ff7ab0'),
  lilac: rgba('#b48cff'),
};
const WINDOWS = [C.warm, C.warm, C.amber, C.coolWin, C.pinkWin, C.lilac];

// ---------------------------------------------------------------------------------------------
// Drawing kit

/**
 * A layer drawn in screen coordinates: x = 0 is the left edge of the 480-px view when the camera is
 * at rest, so content can be placed where lights sit. The parallax margin extends past both edges
 * (x0 < 0, x1 > 480). Self-lit pixels go to both the base (dim) and the emissive map (bright).
 */
class Layer {
  readonly base: PixelCanvas;
  readonly em: PixelCanvas | null;
  readonly ox: number;
  readonly x0: number;
  readonly x1: number;

  constructor(
    readonly id: string,
    readonly parallax: number,
    emissive: boolean,
  ) {
    const w = layerWidth(parallax);
    this.base = new PixelCanvas(w, H);
    this.em = emissive ? new PixelCanvas(w, H) : null;
    this.ox = Math.floor((w - W) / 2);
    this.x0 = -this.ox;
    this.x1 = w - this.ox;
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    this.base.fillRect(x + this.ox, y, w, h, c);
  }

  px(x: number, y: number, c: RGBA): void {
    this.base.set(x + this.ox, y, c);
  }

  blend(x: number, y: number, c: RGBA): void {
    this.base.blend(x + this.ox, y, c);
  }

  get(x: number, y: number): RGBA {
    return this.base.get(x + this.ox, y);
  }

  /** Punch a hole through base and emissive. */
  clear(x: number, y: number, w: number, h: number): void {
    this.rect(x, y, w, h, CLEAR);
    this.em?.fillRect(x + this.ox, y, w, h, CLEAR);
  }

  /** Self-lit rectangle: `under` on the base layer, `c` at full brightness on the emissive map. */
  glow(x: number, y: number, w: number, h: number, c: RGBA, under: RGBA = mix(c, INK, 0.55)): void {
    if (this.em) {
      this.rect(x, y, w, h, under);
      this.em.fillRect(x + this.ox, y, w, h, c);
    } else {
      this.rect(x, y, w, h, c);
    }
  }

  glowPx(x: number, y: number, c: RGBA, under?: RGBA): void {
    this.glow(x, y, 1, 1, c, under);
  }

  /** Ordered-dither `c` over a rectangle at the given coverage (0..1). */
  dither(x: number, y: number, w: number, h: number, c: RGBA, density: number): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) if (bayer4(xx, yy) < density) this.px(xx, yy, c);
    }
  }

  /** Spans of pixels: one [x0, x1] (inclusive) per row, starting at `y`. */
  spans(y: number, rows: [number, number][], c: RGBA): void {
    rows.forEach(([a, b], i) => this.rect(a, y + i, b - a + 1, 1, c));
  }
}

const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function sample(stops: readonly RGBA[], t: number): RGBA {
  const seg = clamp01(t) * (stops.length - 1);
  const i = Math.min(Math.floor(seg), stops.length - 2);
  return mix(stops[i], stops[i + 1], seg - i);
}

/** Vertical gradient quantised into flat bands with dithered seams (the chunky retro look). */
function gradient(L: Layer, x: number, y: number, w: number, h: number, stops: readonly RGBA[], bands: number): void {
  const colors = Array.from({ length: bands }, (_, k) => sample(stops, k / (bands - 1)));
  for (let yy = 0; yy < h; yy++) {
    const f = (yy / Math.max(1, h - 1)) * (bands - 1);
    const i = Math.min(Math.floor(f), bands - 1);
    const seam = clamp01((f - i - 0.5) * 2.2 + 0.5);
    for (let xx = 0; xx < w; xx++) {
      const next = i + 1 < bands && bayer4(x + xx, y + yy) < seam;
      L.px(x + xx, y + yy, colors[next ? i + 1 : i]);
    }
  }
}

/** A 5x5 pseudo-glyph (kana/kanji-like strokes). */
function glyph(rng: () => number): boolean[][] {
  const g = Array.from({ length: 5 }, () => Array<boolean>(5).fill(false));
  const strokes = int(rng, 2, 4);
  for (let s = 0; s < strokes; s++) {
    const r = rng();
    if (r < 0.45) {
      const row = pick(rng, [0, 2, 4, 1, 3, 0, 2, 4]);
      const a = int(rng, 0, 1);
      const b = int(rng, 3, 4);
      for (let x = a; x <= b; x++) g[row][x] = true;
    } else if (r < 0.9) {
      const col = pick(rng, [0, 2, 4, 1, 3, 2]);
      const a = int(rng, 0, 1);
      const b = int(rng, 3, 4);
      for (let y = a; y <= b; y++) g[y][col] = true;
    } else {
      for (let i = 0; i < 5; i++) g[i][rng() < 0.5 ? i : 4 - i] = true;
    }
  }
  return g;
}

function drawGlyph(L: Layer, x: number, y: number, g: boolean[][], c: RGBA): void {
  g.forEach((row, yy) => row.forEach((on, xx) => on && L.glowPx(x + xx, y + yy, c)));
}

/** Outline tube around a rectangle. */
function tube(L: Layer, x: number, y: number, w: number, h: number, c: RGBA): void {
  L.glow(x, y, w, 1, c);
  L.glow(x, y + h - 1, w, 1, c);
  L.glow(x, y, 1, h, c);
  L.glow(x + w - 1, y, 1, h, c);
}

/** Vertical neon sign: dark backing panel, tube border, a column of glyphs. Returns its height. */
function vSign(L: Layer, rng: () => number, x: number, y: number, n: number, c: RGBA, border = true): number {
  const h = n * 7 + 3;
  L.rect(x, y, 9, h, mix(INK, c, 0.1));
  if (border) tube(L, x, y, 9, h, mix(c, INK, 0.3));
  for (let i = 0; i < n; i++) drawGlyph(L, x + 2, y + 2 + i * 7, glyph(rng), c);
  return h;
}

/** Horizontal neon sign of n glyphs. Returns its width. */
function hSign(L: Layer, rng: () => number, x: number, y: number, n: number, c: RGBA): number {
  const w = n * 7 + 3;
  L.rect(x, y, w, 9, mix(INK, c, 0.1));
  tube(L, x, y, w, 9, mix(c, INK, 0.3));
  for (let i = 0; i < n; i++) drawGlyph(L, x + 2 + i * 7, y + 2, glyph(rng), c);
  return w;
}

const FONT: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

/** Self-lit text in the 3x5 font; each font pixel is `scale` px square. Returns the text width. */
function text(L: Layer, x: number, y: number, s: string, c: RGBA, scale = 1): number {
  [...s].forEach((ch, i) => {
    const rows = FONT[ch] ?? FONT[' '];
    rows.forEach((row, yy) =>
      [...row].forEach((p, xx) => {
        if (p === '#') L.glow(x + (i * 4 + xx) * scale, y + yy * scale, scale, scale, c);
      }),
    );
  });
  return (s.length * 4 - 1) * scale;
}

interface SkylineOpts {
  x0: number;
  x1: number;
  base: number;
  bottom?: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  body: RGBA;
  /** Lighter colour for the building's right edge and roof line (light from the strip). */
  rim?: RGBA;
  /** How far each building's body may drift toward `rim` (adds tonal variety). */
  bodyJitter?: number;
  windows: readonly RGBA[];
  litP: number;
  /** Pushes window colours toward `hazeColor` (distance). */
  haze: number;
  hazeColor: RGBA;
  step: [number, number];
  size: [number, number];
  dark?: RGBA;
  towerP?: number;
  signP?: number;
  signColors?: readonly RGBA[];
}

/** A row of buildings with roof details, lit/unlit windows and the odd vertical sign. */
function skyline(L: Layer, rng: () => number, o: SkylineOpts): void {
  let x = o.x0 - int(rng, 0, o.maxW - 1);
  while (x < o.x1) {
    let w = int(rng, o.minW, o.maxW);
    let h = int(rng, o.minH, o.maxH);
    if (rng() < (o.towerP ?? 0)) {
      h = Math.min(o.base - 6, Math.round(h * 1.5));
      w = Math.max(o.minW, Math.round(w * 0.75));
    }
    building(L, rng, x, o.base - h, w, o);
    x += w + (rng() < 0.3 ? int(rng, 1, 3) : 0);
  }
}

function building(L: Layer, rng: () => number, x: number, top: number, w: number, o: SkylineOpts): void {
  const bottom = o.bottom ?? H;
  const body = o.rim && o.bodyJitter ? mix(o.body, o.rim, rng() * o.bodyJitter) : o.body;
  L.rect(x, top, w, bottom - top, body);

  // Roof furniture.
  const crown = rng();
  if (crown < 0.3 && w >= 8) {
    const inset = int(rng, 1, Math.max(1, Math.floor(w / 4)));
    const sh = int(rng, 2, 7);
    L.rect(x + inset, top - sh, w - inset * 2, sh, body);
    if (rng() < 0.5 && w - inset * 4 > 2) L.rect(x + inset * 2, top - sh - 3, w - inset * 4, 3, body);
  } else if (crown < 0.5) {
    const ax = x + int(rng, 1, Math.max(1, w - 2));
    const ah = int(rng, 5, 16);
    L.rect(ax, top - ah, 1, ah, body);
    if (rng() < 0.6) L.glowPx(ax, top - ah - 1, mix(C.beacon, o.hazeColor, o.haze * 0.8));
  } else if (crown < 0.62 && w >= 8) {
    const tx = x + int(rng, 1, w - 7);
    L.rect(tx, top - 7, 6, 4, body);
    L.rect(tx + 1, top - 8, 4, 1, body);
    L.rect(tx, top - 3, 1, 3, body);
    L.rect(tx + 5, top - 3, 1, 3, body);
  } else if (crown < 0.7 && w >= 6) {
    for (let i = 0; i < Math.floor(w / 2); i++) L.rect(x + i, top - i, w - i * 2, 1, body);
  }

  if (o.rim) {
    L.rect(x + w - 1, top, 1, bottom - top, o.rim);
    L.rect(x, top, w, 1, mix(body, o.rim, 0.6));
  }

  // Windows.
  const [sx, sy] = o.step;
  const [ww, wh] = o.size;
  const main = pick(rng, o.windows);
  const alt = pick(rng, o.windows);
  const bands = w >= 10 && rng() < 0.18;
  const lit = (c: RGBA, wx: number, wy: number, w2: number) => {
    const col = mix(c, o.hazeColor, o.haze);
    L.glow(wx, wy, w2, wh, col, mix(col, body, 0.6));
  };
  for (let wy = top + 3; wy + wh <= bottom - 1; wy += sy) {
    const r = rng();
    const mode = r < 0.07 ? 'lit' : r < 0.3 ? 'dark' : 'mixed';
    if (bands) {
      if (mode !== 'dark' && rng() < o.litP * 2.5) {
        const a = x + 2 + int(rng, 0, Math.floor(w / 3));
        const b = x + w - 2 - int(rng, 0, Math.floor(w / 3));
        lit(rng() < 0.85 ? main : alt, a, wy, Math.max(1, b - a));
      } else if (o.dark) L.rect(x + 2, wy, w - 4, wh, o.dark);
      continue;
    }
    for (let wx = x + 2; wx + ww <= x + w - 2; wx += sx) {
      const on = mode === 'lit' || (mode === 'mixed' && rng() < o.litP);
      if (on) lit(rng() < 0.85 ? main : alt, wx, wy, ww);
      else if (o.dark && rng() < 0.7) L.rect(wx, wy, ww, wh, o.dark);
    }
  }

  if (o.signP && o.signColors && w >= 13 && rng() < o.signP) {
    const c = mix(pick(rng, o.signColors), o.hazeColor, o.haze);
    vSign(L, rng, x + w - 11, top + int(rng, 6, 24), int(rng, 2, 5), c);
  }
}

/**
 * A figure in silhouette, seen from behind or walking past. Drawn as per-row spans so it can carry
 * a 1-px rim light on one side and along the top of the head/umbrella.
 */
interface FigureOpts {
  body: RGBA;
  rim?: RGBA;
  rimSide?: -1 | 1;
  umbrella?: RGBA;
  /** Stop drawing at this y (e.g. a seated figure hidden by a stool). */
  cutY?: number;
  stride?: number;
}

function figure(L: Layer, cx: number, top: number, h: number, o: FigureOpts): void {
  const rows: [number, number, number, RGBA][] = []; // y, x0, x1, colour
  const add = (y: number, a: number, b: number, c: RGBA = o.body) => rows.push([y, Math.round(a), Math.round(b), c]);
  const headH = Math.max(3, Math.round(h * 0.12));
  const headW = Math.max(3, Math.round(h * 0.1));
  const shoulderW = Math.max(5, Math.round(h * 0.27));
  const neckY = top + headH;
  const legY = top + Math.round(h * 0.6);
  const stride = o.stride ?? 0;

  for (let i = 0; i < headH; i++) {
    const inset = i === 0 || i === headH - 1 ? 1 : 0;
    add(top + i, cx - headW / 2 + inset, cx + headW / 2 - 1 - inset);
  }
  add(neckY, cx - headW / 4, cx + headW / 4);
  for (let y = neckY + 1; y < legY; y++) {
    const t = (y - neckY) / (legY - neckY);
    const half = (shoulderW / 2) * (t < 0.15 ? 0.8 + t * 1.3 : 1 - (t - 0.15) * 0.18 + (t > 0.85 ? (t - 0.85) * 0.8 : 0));
    add(y, cx - half, cx + half - 1);
  }
  const legW = Math.max(2, Math.round(shoulderW * 0.32));
  for (let y = legY; y < top + h; y++) {
    const t = (y - legY) / (top + h - legY);
    const spread = stride * t;
    add(y, cx - legW - 1 - spread, cx - 1 - spread);
    add(y, cx + 1 + spread, cx + legW + 1 + spread);
  }
  if (o.umbrella) {
    const uw = Math.round(h * 0.28);
    const uh = Math.round(h * 0.11);
    const uy = top - uh - 2;
    for (let i = 0; i <= uh; i++) {
      const half = uw * Math.sqrt(1 - Math.pow((uh - i) / uh, 2));
      add(uy + i, cx - half, cx + half, o.umbrella);
    }
    for (let y = uy + uh + 1; y < neckY + 4; y++) add(y, cx + 2, cx + 2, o.body);
  }

  const visible = rows.filter(([y]) => o.cutY === undefined || y < o.cutY);
  for (const [y, a, b, c] of visible) L.rect(a, y, b - a + 1, 1, c);
  if (o.rim) {
    const side = o.rimSide ?? 1;
    const byRow = new Map<number, number>();
    for (const [y, a, b] of visible) {
      const edge = side > 0 ? b : a;
      const cur = byRow.get(y);
      if (cur === undefined || (side > 0 ? edge > cur : edge < cur)) byRow.set(y, edge);
    }
    for (const [y, x] of byRow) L.px(x, y, o.rim);
    const topY = Math.min(...visible.map(([y]) => y));
    for (const [y, a, b] of visible) if (y === topY) L.rect(a, y, b - a + 1, 1, o.rim);
  }
}

/** Wet-ground reflection streaks of a light source: broken horizontal dashes fading downward. */
function reflection(L: Layer, rng: () => number, x: number, w: number, y0: number, y1: number, c: RGBA, strength: number): void {
  for (let y = y0; y < y1; y += 2) {
    const fade = 1 - (y - y0) / (y1 - y0);
    for (let xx = x; xx < x + w; xx++) {
      if (rng() < 0.55 * fade) L.px(xx, y, mix(L.get(xx, y), c, strength * fade + 0.05));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Scenes

interface BuiltScene {
  def: Omit<SceneDef, 'layers'>;
  layers: Layer[];
}

function lowlightIntake(): BuiltScene {
  const rng = mulberry32(0x10411);

  // Window opening in screen coordinates (room layer).
  const win = { x: 256, y: 38, w: 190, h: 136 };
  // Rain is only seen through the glass: below the blinds, left of the cabinet, above the armchair
  // and plant, inset by the room layer's camera travel so it never slides past the frame.
  const travelX = Math.ceil(CAMERA_MAX_X * 0.4);
  const travelY = Math.ceil(CAMERA_MAX_Y * 0.4);
  const glass = { x0: win.x, y0: win.y + 26, x1: 440, y1: 160 };
  const weatherRegion: [number, number, number, number] = [
    glass.x0 + travelX,
    glass.y0 + travelY,
    glass.x1 - glass.x0 - travelX * 2,
    glass.y1 - glass.y0 - travelY * 2,
  ];

  // --- back: the city through the window -----------------------------------------------------
  const back = new Layer('back', 0.1, true);
  gradient(back, back.x0, 0, back.x1 - back.x0, H, [C.night0, rgba('#130828'), rgba('#2a0f3c'), rgba('#4e1a4c')], 12);
  for (let i = 0; i < 40; i++) back.px(int(rng, back.x0, back.x1), int(rng, 0, 70), mix(C.haze, C.lilac, rng() * 0.4));
  back.glowPx(300, 22, mix(C.beacon, C.haze, 0.2));
  back.glowPx(303, 22, rgba('#d8d0ff'));
  skyline(back, rng, {
    x0: back.x0, x1: back.x1, base: 190, minW: 8, maxW: 22, minH: 50, maxH: 130, towerP: 0.15,
    body: mix(C.v3, C.haze, 0.55), rim: mix(C.haze, C.pink, 0.2), bodyJitter: 0.25,
    windows: WINDOWS, litP: 0.14, haze: 0.6, hazeColor: C.haze, step: [2, 3], size: [1, 1],
  });
  back.dither(back.x0, 150, back.x1 - back.x0, 50, withAlpha(mix(C.haze, C.mag, 0.5), 255), 0.18);
  skyline(back, rng, {
    x0: back.x0, x1: back.x1, base: 225, minW: 12, maxW: 30, minH: 50, maxH: 120,
    body: C.v2, rim: mix(C.v3, C.pink, 0.35), bodyJitter: 0.2, dark: mix(C.v2, C.v3, 0.6),
    windows: WINDOWS, litP: 0.2, haze: 0.25, hazeColor: C.haze, step: [3, 4], size: [1, 2],
    signP: 0.3, signColors: [C.cyan, C.amber, C.lime],
  });
  // The near tower that carries the big pink sign.
  back.rect(312, 30, 52, H - 30, C.v1);
  back.rect(363, 30, 1, H - 30, mix(C.v2, C.pink, 0.45));
  back.rect(312, 30, 52, 1, mix(C.v2, C.pink, 0.3));
  back.rect(330, 18, 14, 12, C.v1);
  back.rect(336, 6, 1, 12, C.v1);
  back.glowPx(336, 5, C.beacon);
  for (let wy = 36; wy < H; wy += 5) {
    for (let wx = 315; wx < 330; wx += 3) {
      if (rng() < 0.22) back.glow(wx, wy, 2, 2, mix(C.warm, C.haze, 0.2));
      else back.rect(wx, wy, 2, 2, C.v2);
    }
  }
  back.rect(333, 44, 13, 66, mix(INK, C.pink, 0.1));
  tube(back, 333, 44, 13, 66, C.pink);
  for (let i = 0; i < 6; i++) {
    const g = glyph(rng);
    g.forEach((row, yy) => row.forEach((on, xx) => on && back.glow(336 + xx, 47 + i * 10 + yy * 1.5, 1, 2, C.hotpink)));
  }
  back.rect(350, 60, 10, 2, C.v1); // bracket
  hSign(back, rng, 262, 120, 4, C.cyan);
  vSign(back, rng, 400, 70, 4, C.amber);
  text(back, 384, 140, 'OPEN', C.lime);

  // --- room: walls, desk, chairs, window frame -----------------------------------------------
  const room = new Layer('room', 0.4, true);
  const floorY = 206;
  gradient(room, room.x0, 0, room.x1 - room.x0, floorY, [rgba('#07040e'), rgba('#110a1e'), rgba('#1a1029')], 6);
  for (let x = room.x0 + 6; x < room.x1; x += 64) room.rect(x, 0, 1, 150, mix(C.v1, INK, 0.5));
  room.rect(room.x0, 150, room.x1 - room.x0, 1, C.v3);
  room.rect(room.x0, 151, room.x1 - room.x0, 1, INK);
  gradient(room, room.x0, floorY, room.x1 - room.x0, H - floorY, [rgba('#130b20'), rgba('#08050f')], 4);
  let gapY = floorY + 2;
  for (let step = 3; gapY < H; step += 2) {
    room.rect(room.x0, gapY, room.x1 - room.x0, 1, INK);
    gapY += step;
  }
  room.rect(room.x0, floorY, room.x1 - room.x0, 1, C.v3);

  // Pink spill from the window: around the frame on the wall and a skewed pool on the floor.
  for (let y = win.y - 14; y < win.y + win.h + 30; y++) {
    for (let x = win.x - 30; x < win.x + win.w + 30; x++) {
      const dx = Math.max(win.x - x, x - (win.x + win.w), 0);
      const dy = Math.max(win.y - y, y - (win.y + win.h), 0);
      const d = Math.sqrt(dx * dx + dy * dy) / 30;
      if (d > 0 && bayer4(x, y) < 0.45 * (1 - d)) room.px(x, y, mix(room.get(x, y), C.pink, 0.16));
    }
  }
  for (let y = floorY + 3; y < H; y++) {
    const t = (y - floorY) / (H - floorY);
    const shift = Math.round(t * -90);
    const x0 = win.x + 10 + shift;
    const x1 = win.x + win.w - 10 + shift - Math.round(t * 20);
    for (let x = x0; x < x1; x++) {
      const mid = Math.abs(x - (x0 + x1) / 2) < 2;
      if (!mid && bayer4(x, y) < 0.42 - t * 0.36) room.px(x, y, mix(room.get(x, y), C.pink, 0.3));
    }
  }

  // Window: opening, frame, mullions, blinds.
  room.clear(win.x, win.y, win.w, win.h);
  const frame = C.v3;
  const frameLit = mix(C.v3, C.pink, 0.35);
  room.rect(win.x - 5, win.y - 5, win.w + 10, 5, frame);
  room.rect(win.x - 5, win.y, 5, win.h, frame);
  room.rect(win.x + win.w, win.y, 5, win.h, frame);
  room.rect(win.x - 8, win.y + win.h, win.w + 16, 4, C.v4);
  room.rect(win.x - 8, win.y + win.h, win.w + 16, 1, frameLit);
  room.rect(win.x - 8, win.y + win.h + 4, win.w + 16, 2, INK);
  room.rect(win.x - 1, win.y, 1, win.h, frameLit);
  room.rect(win.x + win.w, win.y, 1, win.h, frameLit);
  const mx = win.x + Math.floor(win.w / 2) - 1;
  room.rect(mx, win.y, 3, win.h, frame);
  room.rect(mx + 2, win.y, 1, win.h, frameLit);
  room.rect(win.x, win.y + 66, win.w, 3, frame);
  room.rect(win.x, win.y + 66, win.w, 1, frameLit);
  for (let y = win.y; y < win.y + 26; y += 3) {
    const sag = y === win.y + 21 ? 4 : 0;
    room.rect(win.x, y, win.w - sag * 10, 2, mix(C.v3, C.v4, 0.5));
    room.rect(win.x, y + 1, win.w - sag * 10, 1, mix(C.v2, INK, 0.3));
  }
  room.rect(win.x + 30, win.y + 26, 1, 22, C.v4); // blind cord
  room.rect(win.x + 29, win.y + 48, 3, 3, C.v4);

  // Bookshelf on the left wall.
  const shelfX = room.x0 + 2;
  room.rect(shelfX, 60, 30 - room.x0, floorY - 60, C.v1);
  room.rect(shelfX + 30 - room.x0 - 1, 60, 1, floorY - 60, C.v3);
  for (let sy = 66; sy < floorY - 8; sy += 26) {
    room.rect(shelfX, sy + 22, 30 - room.x0, 2, C.v3);
    for (let bx = shelfX + 2; bx < 26; ) {
      const bw = int(rng, 2, 4);
      const bh = int(rng, 12, 20);
      room.rect(bx, sy + 22 - bh, bw, bh, pick(rng, [rgba('#2a1a40'), rgba('#3a1830'), rgba('#142a36'), rgba('#2c2440')]));
      room.rect(bx, sy + 22 - bh, 1, bh, mix(C.v4, C.amber, 0.12));
      bx += bw + (rng() < 0.2 ? 2 : 0);
    }
  }

  // Framed print on the wall + a small pinboard of notes.
  room.rect(44, 62, 46, 34, C.v3);
  room.rect(46, 64, 42, 30, mix(C.v1, C.mag, 0.25));
  room.rect(48, 80, 38, 12, mix(C.v2, C.haze, 0.3));
  room.rect(56, 70, 6, 8, mix(C.v3, C.amber, 0.2));
  room.rect(196, 74, 34, 26, mix(C.v2, C.v3, 0.6));
  for (let i = 0; i < 5; i++) room.rect(198 + int(rng, 0, 24), 76 + int(rng, 0, 18), 6, 5, mix(C.v4, C.warm, 0.15 + rng() * 0.1));

  // Workstation desk.
  const deskTop = 168;
  room.rect(26, deskTop, 196, 5, C.v4);
  room.rect(26, deskTop, 196, 1, mix(C.v4, C.amber, 0.35));
  room.rect(30, deskTop + 5, 188, 34, C.v2);
  room.rect(32, deskTop + 8, 50, 30, mix(C.v2, C.v3, 0.5));
  for (const dy of [8, 18, 28]) {
    room.rect(32, deskTop + dy, 50, 1, INK);
    room.rect(53, deskTop + dy + 4, 8, 1, C.v4);
  }
  room.rect(214, deskTop + 5, 4, floorY - deskTop - 5, C.v1);

  // Monitor (intake terminal).
  const mon = { x: 122, y: 124, w: 56, h: 42 };
  room.rect(mon.x, mon.y, mon.w, mon.h, C.v3);
  room.rect(mon.x, mon.y, mon.w, 1, C.v4);
  room.rect(mon.x + 22, mon.y + mon.h, 12, deskTop - mon.y - mon.h, C.v3);
  room.rect(mon.x + 16, deskTop - 1, 24, 1, C.v4);
  const scr = { x: mon.x + 4, y: mon.y + 4, w: mon.w - 8, h: mon.h - 10 };
  room.glow(scr.x, scr.y, scr.w, scr.h, rgba('#0b3440'), rgba('#081c26'));
  for (let ly = scr.y + 3; ly < scr.y + scr.h - 3; ly += 3) {
    const len = int(rng, 6, scr.w - 6);
    room.glow(scr.x + 3, ly, len, 1, mix(C.ice, rgba('#0b3440'), rng() * 0.45));
  }
  room.glow(scr.x + 3, scr.y + scr.h - 4, 3, 2, C.ice);
  room.glowPx(mon.x + mon.w - 5, mon.y + mon.h - 3, C.lime);
  // Keyboard.
  room.rect(126, deskTop - 3, 40, 3, C.v4);
  room.rect(126, deskTop - 3, 40, 1, mix(C.v4, C.ice, 0.25));

  // Desk lamp: base, arm, shade, bulb, and its warm pool on the desk.
  room.rect(66, deskTop - 3, 16, 3, C.v4);
  for (let i = 0; i < 24; i++) room.rect(74 + Math.round(i * 0.25), deskTop - 4 - i, 2, 1, C.v4);
  for (let i = 0; i < 9; i++) room.rect(80 + i, 141 - Math.round(i * 0.4), 2, 1, C.v4);
  room.spans(132, [[86, 92], [85, 95], [84, 97], [83, 99], [82, 101], [81, 102], [80, 103], [80, 104]], C.v4);
  room.rect(81, 132, 2, 8, mix(C.v4, C.amber, 0.3));
  room.glow(84, 140, 18, 2, C.amber);
  room.glow(88, 142, 10, 1, C.warm);
  for (let y = deskTop; y < deskTop + 5; y++) {
    for (let x = 60; x < 124; x++) {
      const d = Math.abs(x - 92) / 32;
      if (bayer4(x, y) < 0.7 - d * 0.7) room.px(x, y, mix(room.get(x, y), C.amber, 0.4));
    }
  }
  for (let y = 142; y < deskTop; y++) {
    const t = (y - 142) / (deskTop - 142);
    const half = 9 + t * 22;
    for (let x = Math.round(93 - half); x <= Math.round(93 + half); x++) {
      const edge = Math.abs(x - 93) / half;
      if (edge < 0.6) room.px(x, y, mix(room.get(x, y), C.amber, 0.1 - t * 0.04));
      else if (bayer4(x, y) < 0.5 * (1 - edge)) room.px(x, y, mix(room.get(x, y), C.amber, 0.08));
    }
  }
  // Papers and a mug.
  room.rect(186, deskTop - 2, 22, 2, mix(C.v4, C.warm, 0.12));
  room.rect(188, deskTop - 3, 18, 1, mix(C.v4, C.warm, 0.2));
  room.rect(104, deskTop - 7, 6, 7, C.v3);
  room.rect(110, deskTop - 6, 2, 4, C.v3);
  room.rect(104, deskTop - 7, 6, 1, mix(C.v4, C.amber, 0.4));

  // Nix's office chair (from behind) and the client armchair.
  const chair = mix(C.v1, C.v2, 0.4);
  room.spans(146, Array.from({ length: 42 }, (_, i): [number, number] => [142 + (i < 3 ? 2 - i : 0), 170 - (i < 3 ? 2 - i : 0)]), chair);
  room.rect(170, 148, 1, 40, mix(chair, C.pink, 0.2));
  room.rect(138, 186, 37, 6, chair);
  room.rect(155, 192, 3, 12, chair);
  room.rect(140, 204, 33, 2, chair);
  room.rect(140, 206, 2, 2, chair);
  room.rect(171, 206, 2, 2, chair);
  room.rect(155, 206, 3, 2, chair);

  const arm = mix(rgba('#2a1028'), C.v2, 0.4);
  room.rect(296, 164, 64, 28, arm);
  room.rect(296, 164, 64, 1, mix(arm, C.pink, 0.4));
  room.rect(290, 176, 10, 26, arm);
  room.rect(356, 176, 10, 26, arm);
  room.rect(290, 176, 10, 1, mix(arm, C.pink, 0.4));
  room.rect(356, 176, 10, 1, mix(arm, C.pink, 0.4));
  room.rect(300, 190, 56, 10, mix(arm, INK, 0.2));
  room.rect(292, 202, 3, 4, INK);
  room.rect(361, 202, 3, 4, INK);
  // Side table with a plant and a tissue box.
  room.rect(384, 180, 30, 3, C.v4);
  room.rect(386, 183, 2, floorY - 183, C.v3);
  room.rect(410, 183, 2, floorY - 183, C.v3);
  room.rect(392, 172, 9, 8, mix(C.v3, C.mag, 0.3));
  for (let i = 0; i < 6; i++) room.rect(394 + int(rng, -4, 6), 160 + i * 2, int(rng, 2, 5), 2, rgba('#14261e'));
  // Cabinet with a status LED on the right.
  room.rect(440, 120, 44, floorY - 120, C.v2);
  room.rect(440, 120, 1, floorY - 120, mix(C.v2, C.pink, 0.3));
  room.rect(440, 160, 44, 1, INK);
  room.rect(458, 140, 8, 1, C.v4);
  room.rect(458, 180, 8, 1, C.v4);
  room.glowPx(476, 126, C.amber);

  // --- fg: the near desk edge ---------------------------------------------------------------
  const fg = new Layer('fg', 1.0, false);
  const edgeY = 244;
  fg.spans(edgeY, Array.from({ length: H - edgeY }, (_, i): [number, number] => [fg.x0, 300 + i * 2]), C.ink);
  fg.rect(fg.x0, edgeY, 300 - fg.x0, 1, mix(C.v3, C.amber, 0.3));
  for (let i = 0; i < H - edgeY; i++) fg.px(300 + i * 2, edgeY + i, mix(C.v3, C.pink, 0.25));
  // Mug, pen, stack of files on the edge.
  fg.rect(40, edgeY - 13, 11, 13, C.ink);
  fg.rect(51, edgeY - 10, 3, 1, C.ink);
  fg.rect(53, edgeY - 10, 1, 6, C.ink);
  fg.rect(51, edgeY - 5, 3, 1, C.ink);
  fg.rect(40, edgeY - 13, 11, 1, mix(C.v3, C.amber, 0.35));
  fg.rect(150, edgeY - 6, 46, 6, C.ink);
  fg.rect(152, edgeY - 8, 40, 2, C.ink);
  fg.rect(150, edgeY - 6, 46, 1, mix(C.v2, C.amber, 0.3));
  fg.rect(152, edgeY - 8, 40, 1, mix(C.v2, C.amber, 0.25));
  fg.rect(206, edgeY - 1, 20, 1, mix(C.v2, C.ice, 0.3));
  // Potted plant leaves rising at the right edge.
  fg.spans(236, Array.from({ length: H - 236 }, (_, i): [number, number] => [452 - Math.floor(i / 4), 504]), C.ink);
  const leaves: [number, number, number, number][] = [
    [470, 236, -1.0, 48], [480, 236, -0.4, 60], [490, 236, 0.2, 54], [462, 238, -1.6, 36], [496, 238, 0.7, 40],
  ];
  for (const [lx, ly, slope, len] of leaves) {
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const wdt = Math.max(1, Math.round(Math.sin(t * Math.PI) * 4));
      const x = Math.round(lx + slope * i * 0.6 + Math.sin(t * 3) * 2);
      fg.rect(x - Math.floor(wdt / 2), ly - i, wdt, 1, C.ink);
      fg.px(x + Math.ceil(wdt / 2), ly - i, mix(C.v2, C.pink, 0.3));
    }
  }

  return {
    def: {
      id: 'lowlight-intake',
      name: 'Lowlight Intake',
      description: "Nix's night-shift counseling office above the noodle stall, Level 4 of the Ribbon.",
      resolution: [W, H],
      lights: [
        { id: 'desk_lamp', label: 'desk lamp', pos: [93, 146], color: '#ffb347', intensity: 0.6, radius: 110, flicker: 0 },
        { id: 'window_neon', label: 'pink neon through the window', pos: [339, 77], color: '#ff3c8a', intensity: 0.8, radius: 180, flicker: 0.15, sound: 'neon' },
        { id: 'monitor', label: 'intake terminal glow', pos: [150, 144], color: '#7fe9ff', intensity: 0.35, radius: 80, flicker: 0.05 },
      ],
      defaults: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'rain', weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night' },
      sound: { indoor: true, hum: 0.3, bed: { src: 'sound/office-heater.ogg', level: 0.35 } },
      presets: {
        'after-hours': { ambientLevel: 0.2, lights: { desk_lamp: { intensity: 0.4 } } },
        storm: { weather: 'rain', weatherLevel: 1.0, lights: { window_neon: { flicker: 0.6 } } },
        closing: { ambientLevel: 0.15, lights: { desk_lamp: { intensity: 0 }, monitor: { intensity: 0.1 } } },
        late: { ambientLevel: 0.2, timeOfDay: 'late-night', lights: { desk_lamp: { intensity: 0.45 }, window_neon: { intensity: 0.6 }, monitor: { intensity: 0.25 } } },
        quiet: { ambient: '#141024', ambientLevel: 0.25, weatherLevel: 0.3, fog: 0.15, lights: { desk_lamp: { intensity: 0.5, flicker: 0 }, window_neon: { intensity: 0.4, flicker: 0.05 }, monitor: { intensity: 0.2 } } },
        tense: { ambient: '#2a0f1c', ambientLevel: 0.2, fog: 0.35, lights: { desk_lamp: { intensity: 0.35, flicker: 0.15 }, window_neon: { color: '#ff2d4a', intensity: 0.9, flicker: 0.5 }, monitor: { flicker: 0.3 } } },
      },
      weatherRegion,
    },
    layers: [back, room, fg],
  };
}

function noodleStall(): BuiltScene {
  const rng = mulberry32(0x2a0d1e);

  // --- back: Ribbon facades, the Level 5 walkway and its cyan sign ---------------------------
  const back = new Layer('back', 0.15, true);
  gradient(back, back.x0, 0, back.x1 - back.x0, H, [rgba('#0a0414'), rgba('#2a0c30'), rgba('#3c1238')], 8);
  const facade = mix(C.v2, C.haze, 0.2);
  skyline(back, rng, {
    x0: back.x0, x1: back.x1, base: H, minW: 26, maxW: 54, minH: 236, maxH: 262,
    body: facade, rim: mix(facade, C.pink, 0.3), bodyJitter: 0.35, dark: mix(facade, C.v4, 0.4),
    windows: WINDOWS, litP: 0.16, haze: 0.45, hazeColor: C.haze, step: [4, 6], size: [2, 3],
    signP: 0.45, signColors: [C.pink, C.violet, C.lime, C.amber],
  });
  // AC units and pipes clinging to the facades.
  for (let i = 0; i < 26; i++) {
    const ax = int(rng, back.x0, back.x1);
    const ay = int(rng, 20, 160);
    back.rect(ax, ay, 6, 4, mix(facade, C.v4, 0.6));
    back.rect(ax, ay + 4, 6, 1, mix(facade, INK, 0.5));
  }
  for (let i = 0; i < 6; i++) back.rect(int(rng, back.x0, back.x1), 0, 1, H, mix(facade, INK, 0.35));
  // Level 5 walkway girder with railing and underside lamps.
  back.rect(back.x0, 84, back.x1 - back.x0, 1, C.v4);
  for (let x = back.x0; x < back.x1; x += 5) back.rect(x, 84, 1, 8, C.v3);
  back.rect(back.x0, 92, back.x1 - back.x0, 11, C.v1);
  back.rect(back.x0, 92, back.x1 - back.x0, 1, mix(C.v3, C.cyan, 0.25));
  for (let x = back.x0; x < back.x1; x += 12) back.rect(x, 95, 1, 6, C.v2);
  for (let x = back.x0 + 8; x < back.x1; x += 30) back.glow(x, 103, 3, 1, mix(C.amber, C.haze, 0.25));
  // Sign on Level 5.
  const upW = hSign(back, rng, 344, 50, 6, C.cyan);
  back.rect(344 + 6, 59, 1, 25, C.v3);
  back.rect(344 + upW - 7, 59, 1, 25, C.v3);
  text(back, 352, 40, 'HOTEL', mix(C.cyan, C.haze, 0.15));
  // Shuttered shopfronts at street level behind the stall.
  for (let x = back.x0; x < back.x1; x += 58) {
    back.rect(x + 2, 168, 50, 46, mix(C.v2, INK, 0.3));
    for (let y = 170; y < 214; y += 2) back.rect(x + 3, y, 48, 1, mix(C.v2, C.v3, 0.4));
    if (rng() < 0.4) back.glow(x + 10, 176, 30, 8, mix(C.warm, C.haze, 0.45));
  }
  back.dither(back.x0, 120, back.x1 - back.x0, 100, mix(C.haze, C.mag, 0.4), 0.12);

  // --- mid: the stall --------------------------------------------------------------------------
  const mid = new Layer('mid', 0.5, true);
  const groundY = 214;
  // Wet street.
  gradient(mid, mid.x0, groundY, mid.x1 - mid.x0, H - groundY, [rgba('#140a1e'), rgba('#07040c')], 5);
  mid.rect(mid.x0, groundY, mid.x1 - mid.x0, 2, C.v3);
  mid.rect(mid.x0, groundY, mid.x1 - mid.x0, 1, mix(C.v3, C.orange, 0.3));

  // Stall interior: back wall, menu strips, shelves, pot.
  const sx0 = 114;
  const sx1 = 388;
  mid.rect(sx0, 128, sx1 - sx0, groundY - 128, rgba('#1c0c1c'));
  mid.dither(sx0, 128, sx1 - sx0, 60, mix(rgba('#1c0c1c'), C.orange, 0.15), 0.25);
  for (let i = 0; i < 4; i++) {
    const mx = 132 + i * 34;
    mid.rect(mx, 150, 28, 14, mix(INK, C.amber, 0.1));
    for (let r = 0; r < 3; r++) mid.glow(mx + 2, 152 + r * 4, int(rng, 10, 24), 1, mix(C.warm, C.orange, rng()));
  }
  mid.rect(276, 150, 100, 2, C.v3);
  for (let bx = 280; bx < 372; bx += 9) {
    mid.rect(bx, 145, 7, 5, mix(C.v4, C.orange, 0.2));
    mid.rect(bx + 1, 144, 5, 1, mix(C.v4, C.warm, 0.35));
  }
  for (let lx = 300; lx < 370; lx += 14) {
    mid.rect(lx, 152, 1, 12, C.v4);
    mid.rect(lx - 1, 164, 3, 2, C.v4);
  }
  // Cook behind the counter.
  figure(mid, 214, 150, 60, { body: rgba('#0c0610'), rim: mix(C.v3, C.orange, 0.6), rimSide: 1, cutY: 190 });
  mid.rect(206, 149, 16, 2, mix(rgba('#0c0610'), C.warm, 0.25)); // headband
  // Stock pot and burner.
  mid.rect(262, 168, 34, 22, C.v3);
  mid.rect(260, 166, 38, 3, C.v4);
  mid.rect(260, 166, 38, 1, mix(C.v4, C.warm, 0.4));
  mid.rect(262, 168, 1, 22, mix(C.v3, C.orange, 0.4));
  mid.glow(266, 188, 26, 1, mix(C.cyan, C.violet, 0.5));
  // Steam rising from the pot.
  for (let k = 0; k < 5; k++) {
    for (let y = 164; y > 110; y--) {
      const t = (164 - y) / 54;
      const x = Math.round(266 + k * 6 + Math.sin(y * 0.16 + k * 1.7) * (2 + t * 5));
      const a = Math.round(150 * (1 - t));
      if (bayer4(x, y) < 0.85 - t * 0.4) {
        mid.blend(x, y, rgba('#d8c8f0', a));
        if (t > 0.3) mid.blend(x + 1, y, rgba('#d8c8f0', Math.round(a * 0.6)));
      }
    }
  }
  // Counter.
  const counterY = 188;
  mid.rect(sx0 - 6, counterY, sx1 - sx0 + 12, 6, rgba('#3a1c24'));
  mid.rect(sx0 - 6, counterY, sx1 - sx0 + 12, 1, mix(rgba('#3a1c24'), C.warm, 0.5));
  mid.rect(sx0 - 6, counterY + 5, sx1 - sx0 + 12, 1, INK);
  mid.rect(sx0 - 2, counterY + 6, sx1 - sx0 + 4, groundY - counterY - 6, rgba('#1e0e18'));
  for (let x = sx0; x < sx1; x += 6) mid.rect(x, counterY + 7, 1, groundY - counterY - 8, rgba('#140912'));
  // Bowls on the counter.
  for (const bx of [170, 236, 318]) {
    mid.spans(counterY - 4, [[bx, bx + 9], [bx, bx + 9], [bx + 1, bx + 8], [bx + 2, bx + 7]], rgba('#e8d8c8'));
    mid.rect(bx, counterY - 4, 10, 1, rgba('#3a1c24'));
    mid.rect(bx + 1, counterY - 4, 8, 1, mix(C.orange, rgba('#3a1c24'), 0.4));
    mid.dither(bx + 2, counterY - 12, 6, 8, rgba('#bfb0d8'), 0.2);
  }
  // Posts.
  mid.rect(sx0 - 4, 118, 5, groundY - 118, C.v1);
  mid.rect(sx1 - 1, 118, 5, groundY - 118, C.v1);
  mid.rect(sx0, 118, 1, groundY - 118, mix(C.v2, C.orange, 0.4));
  mid.rect(sx1 - 1, 118, 1, groundY - 118, mix(C.v2, C.orange, 0.4));
  // Awning: striped, scalloped.
  const awnY = 116;
  for (let x = sx0 - 12; x < sx1 + 12; x++) {
    const stripe = Math.floor((x - sx0 + 12) / 8) % 2 === 0 ? rgba('#4a0f24') : rgba('#260818');
    mid.rect(x, awnY, 1, 12, stripe);
    const dip = ((x - sx0 + 12) % 8) - 3.5;
    if (Math.abs(dip) < 2.5) mid.rect(x, awnY + 12, 1, 2, stripe);
  }
  mid.rect(sx0 - 12, awnY, sx1 - sx0 + 24, 1, mix(rgba('#4a0f24'), C.red, 0.5));
  // Main noodle sign above the awning.
  const sign = { x: 178, y: 86, w: 124, h: 28 };
  mid.rect(sign.x + 8, sign.y + sign.h, 2, awnY - sign.y - sign.h, C.v2);
  mid.rect(sign.x + sign.w - 10, sign.y + sign.h, 2, awnY - sign.y - sign.h, C.v2);
  mid.rect(sign.x, sign.y, sign.w, sign.h, mix(INK, C.red, 0.12));
  tube(mid, sign.x, sign.y, sign.w, sign.h, C.red);
  tube(mid, sign.x + 3, sign.y + 3, sign.w - 6, sign.h - 6, mix(C.red, INK, 0.35));
  const tw = (7 * 4 - 1) * 3;
  text(mid, sign.x + Math.floor((sign.w - tw) / 2), sign.y + 7, 'NOODLES', rgba('#ff5468'), 3);
  // Paper lanterns.
  const lanterns = [150, 195, 240, 285, 330, 366];
  for (const lx of lanterns) {
    const ly = 132 + (lx % 3);
    mid.rect(lx, awnY + 12, 1, ly - awnY - 12, C.v3);
    mid.rect(lx - 3, ly, 7, 2, C.v1);
    const rows: [number, number][] = [[-3, 3], [-5, 5], [-6, 6], [-6, 6], [-6, 6], [-6, 6], [-6, 6], [-5, 5], [-5, 5], [-3, 3]];
    rows.forEach(([a, b], i) => {
      const rib = i % 3 === 1;
      mid.glow(lx + a, ly + 2 + i, b - a + 1, 1, rib ? rgba('#d0602a') : i < 4 ? rgba('#ffb060') : C.orange);
    });
    mid.glow(lx - 2, ly + 4, 1, 4, rgba('#ffd890'));
    mid.rect(lx - 3, ly + 12, 7, 2, C.v1);
    mid.rect(lx, ly + 14, 1, 4, mix(C.red, INK, 0.3));
  }
  // Hanging side signs.
  mid.rect(98, awnY + 2, 14, 1, C.v3);
  vSign(mid, rng, 98, awnY + 6, 5, C.pink);
  mid.rect(392, awnY + 2, 14, 1, C.v3);
  vSign(mid, rng, 398, awnY + 6, 3, C.lime);
  // Vending machine on the left.
  const vm = { x: 22, y: 134, w: 36, h: groundY - 134 };
  mid.rect(vm.x, vm.y, vm.w, vm.h, rgba('#1a1a34'));
  mid.rect(vm.x + vm.w - 1, vm.y, 1, vm.h, mix(C.v3, C.ice, 0.4));
  mid.glow(vm.x + 3, vm.y + 4, vm.w - 12, 40, rgba('#8fdfff'), rgba('#2a4a60'));
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      mid.glow(vm.x + 5 + c * 4, vm.y + 7 + r * 10, 2, 5, pick(rng, [C.red, C.amber, C.lime, C.pink, C.violet, rgba('#ffffff')]));
    }
    mid.glow(vm.x + 3, vm.y + 13 + r * 10, vm.w - 12, 1, rgba('#4aa8d0'));
  }
  mid.glow(vm.x + vm.w - 7, vm.y + 8, 3, 6, C.lime);
  mid.rect(vm.x + 4, vm.y + 52, vm.w - 14, 8, INK);
  // Crates and a pipe on the right.
  for (const [cx, cy] of [[420, 194], [436, 194], [428, 176]] as const) {
    mid.rect(cx, cy, 15, 18, rgba('#2a1424'));
    mid.rect(cx, cy, 15, 1, mix(rgba('#2a1424'), C.lime, 0.2));
    mid.rect(cx + 2, cy + 6, 11, 1, INK);
    mid.rect(cx + 2, cy + 12, 11, 1, INK);
  }
  mid.rect(468, 0, 4, groundY, C.v1);
  mid.rect(471, 0, 1, groundY, mix(C.v2, C.lime, 0.2));
  // Reflections on the wet street.
  reflection(mid, rng, sign.x + 6, sign.w - 12, groundY + 3, H, C.red, 0.4);
  reflection(mid, rng, 140, 236, groundY + 3, 250, C.orange, 0.3);
  reflection(mid, rng, vm.x + 2, vm.w - 6, groundY + 3, 252, C.ice, 0.35);
  reflection(mid, rng, 98, 9, groundY + 3, 245, C.pink, 0.35);

  // --- fg: stools and the crowd --------------------------------------------------------------
  const fg = new Layer('fg', 1.0, false);
  const shadow = rgba('#030106');
  for (const sx of [168, 214, 262, 310]) {
    fg.rect(sx - 8, 224, 17, 3, shadow);
    fg.rect(sx - 8, 224, 17, 1, mix(C.v2, C.orange, 0.45));
    fg.rect(sx - 1, 227, 3, 28, shadow);
    fg.rect(sx - 7, 238, 15, 1, shadow);
    fg.spans(255, [[sx - 6, sx + 6], [sx - 8, sx + 8]], shadow);
  }
  // Two regulars on stools, hunched over their bowls.
  figure(fg, 214, 176, 74, { body: shadow, rim: mix(C.v2, C.orange, 0.7), rimSide: -1, cutY: 225 });
  figure(fg, 310, 174, 76, { body: shadow, rim: mix(C.v2, C.orange, 0.7), rimSide: 1, cutY: 225 });
  // Passers-by, one with an umbrella.
  figure(fg, 30, 150, 140, { body: shadow, rim: mix(C.v3, C.ice, 0.5), rimSide: 1, umbrella: rgba('#0a0614'), stride: 6 });
  figure(fg, 424, 160, 128, { body: shadow, rim: mix(C.v3, C.pink, 0.55), rimSide: -1, stride: 4 });
  figure(fg, 462, 140, 150, { body: shadow, rim: mix(C.v3, C.lime, 0.4), rimSide: -1, umbrella: rgba('#12061a'), stride: 3 });

  return {
    def: {
      id: 'noodle-stall',
      name: 'Noodle Stall',
      description:
        'Street level on Level 4 of the Ribbon, where steam rolls off the noodle counter under hanging signs while the late crowd drifts past.',
      resolution: [W, H],
      lights: [
        { id: 'stall_lantern', label: 'paper lanterns over the counter', pos: [240, 142], color: '#ff8a3c', intensity: 0.7, radius: 160, flicker: 0.05 },
        { id: 'sign_noodles', label: 'red noodle sign', pos: [240, 100], color: '#ff2d4a', intensity: 0.9, radius: 140, flicker: 0.2, sound: 'neon' },
        { id: 'sign_upper', label: 'cyan sign on Level 5', pos: [367, 54], color: '#3ff0ff', intensity: 0.6, radius: 150, flicker: 0.1, sound: 'neon' },
      ],
      defaults: { ambient: '#241020', ambientLevel: 0.4, weather: 'rain', weatherLevel: 0.4, fog: 0.4, timeOfDay: 'late-night' },
      sound: { bed: { src: 'sound/street-crowd-sizzle.ogg', level: 0.5 } },
      presets: {
        rush: { ambientLevel: 0.5, lights: { stall_lantern: { intensity: 0.9 } } },
        'last-call': { ambientLevel: 0.25, lights: { sign_noodles: { flicker: 0.5 } } },
        late: { ambientLevel: 0.25, timeOfDay: 'late-night', lights: { stall_lantern: { intensity: 0.5 }, sign_noodles: { intensity: 0.7 }, sign_upper: { intensity: 0.4 } } },
        quiet: { ambientLevel: 0.3, weatherLevel: 0.2, fog: 0.3, lights: { stall_lantern: { intensity: 0.45, flicker: 0 }, sign_noodles: { intensity: 0.5, flicker: 0.05 }, sign_upper: { intensity: 0.35 } } },
        tense: { ambient: '#2a0c14', ambientLevel: 0.25, fog: 0.5, lights: { stall_lantern: { intensity: 0.4, flicker: 0.2 }, sign_noodles: { color: '#ff2020', intensity: 1, flicker: 0.6 }, sign_upper: { intensity: 0.2, flicker: 0.4 } } },
      },
    },
    layers: [back, mid, fg],
  };
}

function ribbonRooftop(billboardText = 'HALCYON'): BuiltScene {
  const rng = mulberry32(0x7e0f70);

  // --- sky ----------------------------------------------------------------------------------
  const sky = new Layer('sky', 0.02, false);
  gradient(sky, sky.x0, 0, sky.x1 - sky.x0, H, [rgba('#040312'), rgba('#0b0926'), rgba('#1c1040'), rgba('#3e164c'), rgba('#621e52')], 14);
  for (let i = 0; i < 70; i++) {
    const x = int(rng, sky.x0, sky.x1);
    const y = int(rng, 0, 110);
    sky.px(x, y, mix(rgba('#4a3c7a'), rgba('#d8d0ff'), rng() * rng()));
  }
  // Hazy moon behind cloud bands.
  const moon = { x: 450, y: 30, r: 11 };
  for (let y = -moon.r - 8; y <= moon.r + 8; y++) {
    for (let x = -moon.r - 8; x <= moon.r + 8; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= moon.r) sky.px(moon.x + x, moon.y + y, d > moon.r - 1.5 ? rgba('#9c8cc4') : rgba('#b8aad8'));
      else if (d < moon.r + 8 && bayer4(x, y) < 0.5 * (1 - (d - moon.r) / 8)) sky.px(moon.x + x, moon.y + y, rgba('#2e2252'));
    }
  }
  sky.px(moon.x - 4, moon.y - 2, rgba('#a698cc'));
  sky.rect(moon.x + 2, moon.y + 3, 3, 2, rgba('#a698cc'));
  for (const [cy, ch, cx0, cw] of [[26, 4, 380, 140], [36, 3, 300, 200], [70, 5, -10, 220], [84, 3, 120, 260]] as const) {
    for (let y = cy; y < cy + ch; y++) {
      for (let x = cx0; x < cx0 + cw; x++) {
        const edge = Math.min(x - cx0, cx0 + cw - x) / 30;
        if (bayer4(x, y) < Math.min(0.75, edge)) sky.px(x, y, rgba('#24183e'));
      }
    }
  }

  // --- far: hazy skyline, the megatower ------------------------------------------------------
  const far = new Layer('far', 0.15, true);
  const farHaze = rgba('#5a3474');
  skyline(far, rng, {
    x0: far.x0, x1: far.x1, base: 205, bottom: H, minW: 6, maxW: 18, minH: 40, maxH: 120, towerP: 0.2,
    body: mix(C.v4, farHaze, 0.6), rim: mix(farHaze, C.pink, 0.15), bodyJitter: 0.2,
    windows: WINDOWS, litP: 0.12, haze: 0.62, hazeColor: farHaze, step: [2, 3], size: [1, 1],
  });
  // Megatower with a spire and aircraft warning lights.
  const mt = { x: 92, w: 30, top: 28 };
  const mtBody = mix(C.v3, farHaze, 0.45);
  far.rect(mt.x, mt.top, mt.w, H - mt.top, mtBody);
  far.rect(mt.x + 4, mt.top - 10, mt.w - 8, 10, mtBody);
  far.rect(mt.x + 10, mt.top - 22, mt.w - 20, 12, mtBody);
  far.rect(mt.x + 14, mt.top - 44, 2, 22, mtBody);
  far.glowPx(mt.x + 14, mt.top - 45, C.beacon);
  far.glowPx(mt.x + 4, mt.top - 11, mix(C.beacon, farHaze, 0.3));
  far.glowPx(mt.x + mt.w - 5, mt.top - 11, mix(C.beacon, farHaze, 0.3));
  far.rect(mt.x + mt.w - 1, mt.top, 1, H - mt.top, mix(mtBody, C.pink, 0.3));
  for (let y = mt.top + 4; y < H; y += 3) {
    if (rng() < 0.5) far.glow(mt.x + 3, y, mt.w - 6, 1, mix(rng() < 0.5 ? C.lilac : C.coolWin, farHaze, 0.55), mix(mtBody, C.lilac, 0.15));
  }
  far.glow(mt.x + 6, mt.top + 30, mt.w - 12, 3, mix(C.cyan, farHaze, 0.3));
  skyline(far, rng, {
    x0: far.x0, x1: far.x1, base: 225, minW: 10, maxW: 26, minH: 30, maxH: 90,
    body: mix(C.v2, farHaze, 0.3), rim: mix(C.v3, C.pink, 0.3), bodyJitter: 0.2, dark: mix(C.v2, farHaze, 0.4),
    windows: WINDOWS, litP: 0.16, haze: 0.38, hazeColor: farHaze, step: [3, 3], size: [1, 1],
    signP: 0.25, signColors: [C.cyan, C.pink, C.amber],
  });
  // Glow of the strip rising between the towers.
  for (let y = 180; y < H; y++) {
    const t = (y - 180) / (H - 180);
    for (let x = far.x0; x < far.x1; x++) {
      if (bayer4(x, y) < t * 0.45) far.px(x, y, mix(far.get(x, y), C.pink, 0.25 + t * 0.15));
    }
  }

  // --- mid: near towers flanking the strip, the corp billboard -------------------------------
  const mid = new Layer('mid', 0.4, true);
  const midOpts: SkylineOpts = {
    x0: mid.x0, x1: 150, base: H, minW: 22, maxW: 44, minH: 120, maxH: 190,
    body: C.v1, rim: mix(C.v2, C.pink, 0.55), bodyJitter: 0.15, dark: mix(C.v1, C.v3, 0.5),
    windows: WINDOWS, litP: 0.2, haze: 0.08, hazeColor: C.haze, step: [4, 5], size: [2, 2],
    signP: 0.5, signColors: [C.pink, C.cyan, C.amber],
  };
  skyline(mid, rng, midOpts);
  skyline(mid, rng, { ...midOpts, x0: 300, x1: mid.x1, minH: 110, maxH: 170 });
  // Canyon-facing neon on the inner walls: signs climbing up out of the strip.
  vSign(mid, rng, 152, 184, 6, C.pink);
  vSign(mid, rng, 166, 214, 4, C.cyan);
  vSign(mid, rng, 286, 196, 5, C.amber);
  // The strip below: neon haze rising out of the canyon and the tops of signs just in view.
  for (let y = 170; y < H; y++) {
    const t = (y - 170) / (H - 170);
    for (let x = 130; x < 310; x++) {
      const side = Math.min(x - 130, 310 - x) / 40;
      if (bayer4(x, y) < t * t * 0.7 * Math.min(1, side)) mid.px(x, y, mix(mid.get(x, y), C.pink, 0.35 + t * 0.2));
    }
  }
  tube(mid, 184, 220, 46, 14, C.pink);
  for (let i = 0; i < 6; i++) drawGlyph(mid, 187 + i * 7, 224, glyph(rng), C.hotpink);
  tube(mid, 238, 225, 30, 12, C.cyan);
  for (let i = 0; i < 3; i++) drawGlyph(mid, 242 + i * 8, 228, glyph(rng), C.ice);

  // Billboard tower across the strip.
  const bt = { x: 290, w: 120, top: 46 };
  mid.rect(bt.x, bt.top + 30, bt.w, H - bt.top - 30, C.v1);
  mid.rect(bt.x, bt.top + 30, 1, H - bt.top - 30, mix(C.v2, C.pink, 0.6));
  for (let y = bt.top + 70; y < H; y += 5) {
    for (let x = bt.x + 4; x < bt.x + bt.w - 4; x += 5) {
      if (rng() < 0.16) mid.glow(x, y, 2, 2, pick(rng, WINDOWS));
      else mid.rect(x, y, 2, 2, mix(C.v1, C.v3, 0.5));
    }
  }
  // Scaffold and the screen.
  const bb = { x: bt.x + 8, y: bt.top, w: bt.w - 16, h: 52 };
  mid.rect(bb.x - 3, bb.y - 3, bb.w + 6, bb.h + 6, INK);
  for (let x = bb.x; x < bb.x + bb.w; x += 12) mid.rect(x, bb.y + bb.h + 3, 1, 14, C.v3);
  mid.rect(bb.x - 3, bb.y + bb.h + 10, bb.w + 6, 1, C.v3);
  for (let y = bb.y; y < bb.y + bb.h; y++) {
    const t = (y - bb.y) / bb.h;
    const scan = (y - bb.y) % 3 === 2;
    const c = mix(rgba('#4a1ca0'), rgba('#c06cff'), 1 - t);
    mid.glow(bb.x, y, bb.w, 1, scan ? mix(c, INK, 0.35) : mix(c, INK, 0.1));
  }
  // Logo: a ringed eye, plus wordmark.
  const ex = bb.x + 22;
  const ey = bb.y + 26;
  for (let y = -12; y <= 12; y++) {
    for (let x = -12; x <= 12; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > 9.5 && d < 12) mid.glowPx(ex + x, ey + y, rgba('#f0d8ff'));
      else if (d < 4.5) mid.glowPx(ex + x, ey + y, d < 2 ? rgba('#1a0840') : C.cyan);
    }
  }
  if (billboardText) text(mid, bb.x + 42, bb.y + 12, billboardText, rgba('#f6e8ff'), 2);
  for (let i = 0; i < 3; i++) mid.glow(bb.x + 42, bb.y + 28 + i * 5, int(rng, 24, 52), 2, mix(rgba('#f0d8ff'), rgba('#7a3ad0'), 0.4));
  mid.glow(bb.x, bb.y + bb.h - 1, bb.w, 1, C.pink);

  // --- fg: roof edge, vents, antenna --------------------------------------------------------
  const fg = new Layer('fg', 1.0, false);
  const roofY = 238;
  const roof = rgba('#05030b');
  fg.rect(fg.x0, roofY, fg.x1 - fg.x0, H - roofY, roof);
  fg.rect(fg.x0, roofY - 4, fg.x1 - fg.x0, 4, rgba('#0c0716'));
  fg.rect(fg.x0, roofY - 4, fg.x1 - fg.x0, 1, mix(C.v3, C.pink, 0.55));
  fg.rect(fg.x0, roofY, fg.x1 - fg.x0, 1, INK);
  for (let x = fg.x0; x < fg.x1; x += 37) fg.rect(x, roofY - 4, 1, 4, INK);
  // Puddles catching the pink.
  for (const [px, py, pw] of [[110, 252, 40], [250, 260, 56], [400, 248, 30]] as const) {
    for (let y = py; y < py + 3; y++) {
      for (let x = px + (y - py) * 2; x < px + pw - (y - py) * 2; x++) {
        if (bayer4(x, y) < 0.6) fg.px(x, y, mix(roof, C.pink, 0.25 + (rng() < 0.2 ? 0.2 : 0)));
      }
    }
  }
  // HVAC unit with a fan grille.
  const hv = { x: 300, y: 204, w: 64, h: 34 };
  fg.rect(hv.x, hv.y, hv.w, hv.h, rgba('#0a0614'));
  fg.rect(hv.x, hv.y, hv.w, 1, mix(C.v3, C.pink, 0.4));
  fg.rect(hv.x + hv.w - 1, hv.y, 1, hv.h, mix(C.v3, C.pink, 0.3));
  for (let y = -12; y <= 12; y++) {
    for (let x = -12; x <= 12; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d < 12 && (Math.round(d) % 3 === 0 || Math.abs(x) === Math.abs(y))) fg.px(hv.x + 18 + x, hv.y + 17 + y, rgba('#1a1028'));
    }
  }
  for (let y = hv.y + 6; y < hv.y + hv.h - 4; y += 3) fg.rect(hv.x + 36, y, 22, 1, rgba('#1a1028'));
  // Vent stacks.
  for (const [vx, vh] of [[386, 22], [398, 14], [140, 18]] as const) {
    fg.rect(vx, roofY - vh, 4, vh, roof);
    fg.rect(vx - 2, roofY - vh - 3, 8, 3, roof);
    fg.rect(vx - 2, roofY - vh - 3, 8, 1, mix(C.v3, C.pink, 0.45));
  }
  fg.rect(150, roofY - 8, 140, 3, roof);
  fg.rect(150, roofY - 8, 140, 1, mix(C.v2, C.pink, 0.35));
  // Antenna mast: lattice with cross-bracing, a dish, and the beacon on top.
  const am = { x: 56, top: 112 };
  fg.rect(am.x - 1, am.top, 1, roofY - am.top, roof);
  fg.rect(am.x + 7, am.top + 8, 1, roofY - am.top - 8, roof);
  fg.rect(am.x - 1, am.top, 1, roofY - am.top, mix(C.v3, C.pink, 0.2));
  for (let y = am.top + 8; y < roofY; y += 8) {
    fg.rect(am.x - 1, y, 9, 1, roof);
    for (let i = 0; i < 8; i++) {
      fg.px(am.x + i, y + i, roof);
      fg.px(am.x + 7 - i, y + i, roof);
    }
  }
  fg.rect(am.x + 3, am.top - 18, 1, 26, roof);
  fg.spans(160, [[am.x + 9, am.x + 11], [am.x + 8, am.x + 13], [am.x + 8, am.x + 14], [am.x + 8, am.x + 14], [am.x + 8, am.x + 13], [am.x + 9, am.x + 11]], roof);
  fg.rect(am.x + 3, am.top - 22, 3, 3, rgba('#ff2020'));
  fg.px(am.x + 4, am.top - 23, rgba('#ff6a6a'));
  // Cable sagging from the mast to the HVAC.
  for (let x = am.x + 8; x < hv.x; x++) {
    const t = (x - am.x - 8) / (hv.x - am.x - 8);
    fg.px(x, Math.round(150 + t * (hv.y + 4 - 150) + Math.sin(t * Math.PI) * 30), roof);
  }

  return {
    def: {
      id: 'ribbon-rooftop',
      name: 'Ribbon Rooftop',
      description:
        "Above the strip at night, where the Ribbon's skyline stacks back into the rain and its signs glow up from the street below.",
      resolution: [W, H],
      lights: [
        { id: 'billboard', label: 'corp billboard across the strip', pos: [350, 72], color: '#9b5cff', intensity: 0.7, radius: 180, flicker: 0.1, sound: 'neon' },
        { id: 'sign_below', label: 'neon spill from the Ribbon below', pos: [222, 236], color: '#ff3c8a', intensity: 0.6, radius: 200, flicker: 0.15, sound: 'neon' },
        { id: 'beacon', label: 'antenna beacon', pos: [60, 91], color: '#ff2020', intensity: 0.5, radius: 90, flicker: 0 },
      ],
      defaults: { ambient: '#0d0c24', ambientLevel: 0.3, weather: 'rain', weatherLevel: 0.8, fog: 0.3, timeOfDay: 'night' },
      sound: { bed: { src: 'sound/industry-night.ogg', level: 0.45 } },
      presets: {
        'clear-night': { weather: 'none', fog: 0.15 },
        downpour: { weather: 'rain', weatherLevel: 1.0, fog: 0.5 },
        dawn: { timeOfDay: 'dawn', ambient: '#3a2a4a', ambientLevel: 0.5 },
        late: { ambientLevel: 0.2, timeOfDay: 'late-night', lights: { billboard: { intensity: 0.5 }, sign_below: { intensity: 0.45 }, beacon: { intensity: 0.5 } } },
        quiet: { ambientLevel: 0.25, weatherLevel: 0.3, fog: 0.2, lights: { billboard: { intensity: 0.35, flicker: 0.02 }, sign_below: { intensity: 0.4, flicker: 0.05 }, beacon: { intensity: 0.3 } } },
        tense: { ambient: '#24081a', ambientLevel: 0.22, fog: 0.45, weatherLevel: 0.9, lights: { billboard: { color: '#ff2d4a', intensity: 0.8, flicker: 0.4 }, sign_below: { intensity: 0.7, flicker: 0.35 }, beacon: { intensity: 0.9, flicker: 0.5 } } },
      },
    },
    layers: [sky, far, mid, fg],
  };
}

// ---------------------------------------------------------------------------------------------

/** Write every launch scene (scene.json + layer and emissive PNGs) into `outDir/<id>/`. */
/**
 * Re-labels a built scene for the neutral default pack: new id/name/description, lights renamed
 * (ids and labels), and only the listed presets kept, with their light references remapped.
 */
function neutral(
  built: BuiltScene,
  def: { id: string; name: string; description: string },
  lights: Record<string, { id: string; label: string; sound?: 'neon' }>,
  keepPresets: string[],
  sound?: SceneDef['sound'],
): BuiltScene {
  const presets: SceneDef['presets'] = {};
  for (const name of keepPresets) {
    const preset = built.def.presets[name];
    if (!preset) continue;
    const { lights: pl, ...atmo } = preset;
    presets[name] = { ...atmo, ...(pl ? { lights: Object.fromEntries(Object.entries(pl).map(([id, v]) => [lights[id].id, v])) } : {}) };
  }
  return {
    layers: built.layers,
    def: {
      ...built.def,
      ...def,
      lights: built.def.lights.map((l) => ({ ...l, ...lights[l.id] })),
      presets,
      ...(sound ? { sound } : {}),
    },
  };
}

function workspace(): BuiltScene {
  return neutral(
    lowlightIntake(),
    { id: 'workspace', name: 'Workspace', description: 'A quiet workspace at night: a desk, a lamp, a screen and a window onto the city.' },
    {
      desk_lamp: { id: 'lamp', label: 'desk lamp' },
      window_neon: { id: 'window', label: 'city glow through the window', sound: undefined }, // a glow, not a sign
      monitor: { id: 'screen', label: 'screen glow' },
    },
    ['after-hours', 'storm', 'late', 'quiet', 'tense'],
    { indoor: true, hum: 0.3, bed: { src: 'sound/overhead-fan.ogg', level: 0.35 } },
  );
}

function rooftop(): BuiltScene {
  return neutral(
    ribbonRooftop(''),
    { id: 'rooftop', name: 'Rooftop', description: 'A rooftop above the city at night, with the skyline all around.' },
    {
      billboard: { id: 'billboard', label: 'distant billboard' },
      sign_below: { id: 'signs', label: 'signs in the street below' },
      beacon: { id: 'beacon', label: 'antenna beacon' },
    },
    ['clear-night', 'downpour', 'late', 'quiet', 'tense'],
  );
}

/** The app's own splash: the rooftop skyline as a stand-in until the real art is promoted. */
function splash(): BuiltScene {
  const built = neutral(
    ribbonRooftop(''),
    { id: 'splash', name: 'Lowlight', description: 'The city at night from high above the Ribbon: the splash behind the logo.' },
    {
      billboard: { id: 'tower_sign', label: 'tower sign', sound: 'neon' },
      sign_below: { id: 'street_signs', label: 'signs in the street below', sound: 'neon' },
      beacon: { id: 'spire_beacon', label: 'spire beacon' },
    },
    [],
  );
  built.def.defaults = { ambient: '#120a20', ambientLevel: 0.3, weather: 'rain', weatherLevel: 0.35, fog: 0.25, timeOfDay: 'late-night' };
  return built;
}

const PACKS = {
  karasu: [lowlightIntake, noodleStall, ribbonRooftop],
  default: [workspace, rooftop],
  lowlight: [splash],
} satisfies Record<string, (() => BuiltScene)[]>;

export type PlaceholderPack = keyof typeof PACKS;

export async function generateScenes(outDir: string, pack: PlaceholderPack = 'karasu'): Promise<void> {
  for (const build of PACKS[pack]) {
    const { def, layers } = build();
    const dir = path.join(outDir, def.id);
    await fs.promises.mkdir(dir, { recursive: true });
    const layerDefs: LayerDef[] = [];
    for (const layer of layers) {
      const entry: LayerDef = { id: layer.id, src: `${layer.id}.png`, parallax: layer.parallax };
      await fs.promises.writeFile(path.join(dir, entry.src), layer.base.toPNG());
      if (layer.em) {
        entry.emissive = `${layer.id}_e.png`;
        await fs.promises.writeFile(path.join(dir, entry.emissive), layer.em.toPNG());
      }
      layerDefs.push(entry);
    }
    const scene: SceneDef = { ...def, layers: layerDefs };
    const ordered = {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      resolution: scene.resolution,
      layers: scene.layers,
      lights: scene.lights,
      defaults: scene.defaults,
      presets: scene.presets,
      ...(scene.weatherRegion ? { weatherRegion: scene.weatherRegion } : {}),
      ...(scene.sound ? { sound: scene.sound } : {}),
    };
    await fs.promises.writeFile(path.join(dir, 'scene.json'), `${JSON.stringify(ordered, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Writes only the neutral default pack unless told otherwise: the karasu scenes may hold
  // promoted art, so regenerate those placeholders into a temp dir, never over scenes/karasu.
  const out = path.resolve(process.argv[2] ?? 'scenes/default');
  const pack = (process.argv[3] ?? 'default') as PlaceholderPack;
  if (!(pack in PACKS)) throw new Error(`unknown pack '${pack}'; available: ${Object.keys(PACKS).join(', ')}`);
  generateScenes(out, pack).then(
    () => console.log(`wrote scenes to ${out}`),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
