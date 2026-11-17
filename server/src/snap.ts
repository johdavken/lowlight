/**
 * Sprite snap: puts a character layer on the cast's pixel grid (blocks anchored at 0,0) with the cast's
 * shared palette — binary alpha, nearest colour, no dithering — at the layer's own size. Snapping a
 * snapped layer changes nothing. Expressions go through snapPatch, against her figure.
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { linearSrgbToOklab, parseHex, SRGB_BYTE_TO_LINEAR } from '../../shared/color';
import type { Hex } from '../../shared/types';
import { buildPaletteLab, nearestPaletteColor } from '../../tools/palette-snap';

/** shared/cast-palette.json: the grid's block size and the cast's colours. */
export interface CastPalette {
  block: number;
  colours: Hex[];
}

const NO_PALETTE = 'Run npm run cast-palette first';
/** A patch pixel at or under this alpha is Krita's stray haze, not part of the face. */
const PATCH_ALPHA = 8;

export function readCastPalette(file: string): CastPalette {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(NO_PALETTE);
  }
  const p = raw as Partial<CastPalette> | null;
  const ok =
    p !== null &&
    typeof p === 'object' &&
    Number.isInteger(p.block) &&
    (p.block as number) >= 1 &&
    Array.isArray(p.colours) &&
    p.colours.length > 0 &&
    p.colours.every((c) => typeof c === 'string' && parseHex(c) !== null);
  if (!ok) throw new Error(NO_PALETTE);
  return { block: p.block as number, colours: p.colours as Hex[] };
}

/** One block's average: colour weighted by alpha (sRGB bytes), alpha a plain mean (0–255). */
export interface BlockAverage {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The image's blocks, row by row (`cols` across); edge blocks average only the pixels they cover. */
export function blockAverages(png: PNG, block: number): { cols: number; rows: number; blocks: BlockAverage[] } {
  const cols = Math.ceil(png.width / block);
  const rows = Math.ceil(png.height / block);
  const blocks: BlockAverage[] = [];
  for (let by = 0; by < rows; by++)
    for (let bx = 0; bx < cols; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = by * block; y < Math.min((by + 1) * block, png.height); y++)
        for (let x = bx * block; x < Math.min((bx + 1) * block, png.width); x++) {
          const i = (y * png.width + x) * 4;
          const pa = png.data[i + 3];
          r += png.data[i] * pa;
          g += png.data[i + 1] * pa;
          b += png.data[i + 2] * pa;
          a += pa;
          n++;
        }
      blocks.push(a > 0 ? { r: r / a, g: g / a, b: b / a, a: a / n } : { r: 0, g: 0, b: 0, a: 0 });
    }
  return { cols, rows, blocks };
}

/** Nearest palette colour (OKLab) for an sRGB byte triple, cached per palette. */
function matcher(pal: CastPalette): (r: number, g: number, b: number) => [number, number, number] {
  const table = buildPaletteLab(pal.colours);
  const cache = new Map<number, [number, number, number]>();
  return (r, g, b) => {
    const R = Math.round(r);
    const G = Math.round(g);
    const B = Math.round(b);
    const key = (R << 16) | (G << 8) | B;
    let hit = cache.get(key);
    if (!hit) {
      const hex = nearestPaletteColor(linearSrgbToOklab(SRGB_BYTE_TO_LINEAR[R], SRGB_BYTE_TO_LINEAR[G], SRGB_BYTE_TO_LINEAR[B]), table);
      hit = parseHex(hex)!.map((v) => Math.round(v * 255)) as [number, number, number];
      cache.set(key, hit);
    }
    return hit;
  };
}

/** Paints one block's square of `out` (clipped at the edges). */
function fillBlock(out: PNG, block: number, bx: number, by: number, rgba: readonly number[]): void {
  for (let y = by * block; y < Math.min((by + 1) * block, out.height); y++)
    for (let x = bx * block; x < Math.min((bx + 1) * block, out.width); x++) out.data.set(rgba, (y * out.width + x) * 4);
}

export function snapImage(png: PNG, pal: CastPalette): PNG {
  const near = matcher(pal);
  const { cols, blocks } = blockAverages(png, pal.block);
  const out = new PNG({ width: png.width, height: png.height });
  blocks.forEach((k, i) => {
    if (k.a < 128) return;
    fillBlock(out, pal.block, i % cols, Math.floor(i / cols), [...near(k.r, k.g, k.b), 255]);
  });
  return out;
}

/** Source-over, straight alpha: the patch drawn on the base, as the stage stacks them. */
function composite(top: PNG, base: PNG): PNG {
  const out = new PNG({ width: base.width, height: base.height });
  for (let i = 0; i < base.data.length; i += 4) {
    const ta = top.data[i + 3] / 255;
    const ba = base.data[i + 3] / 255;
    const a = ta + ba * (1 - ta);
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round((top.data[i + c] * ta + base.data[i + c] * ba * (1 - ta)) / a);
    out.data[i + 3] = Math.round(a * 255);
  }
  return out;
}

/**
 * An expression patch on the grid without a seam: snap the patch drawn on her figure, and keep the
 * blocks the patch reaches (alpha over 8) that join up with its solid part (average alpha 128 or
 * more), so faint wisps running off the face stay and Krita's stray haze elsewhere on the layer goes
 * (Hae's annoyed had ~6,000 such pixels down her body). Seamless on the figure; on another outfit,
 * whose head isn't quite the same picture, only the patch's edge ring carries the figure's head.
 */
export function snapPatch(patch: PNG, base: PNG, pal: CastPalette): PNG {
  if (patch.width !== base.width || patch.height !== base.height) {
    throw new Error(`patch is ${patch.width}×${patch.height}, base is ${base.width}×${base.height}`);
  }
  const worn = snapImage(composite(patch, base), pal);
  const out = new PNG({ width: patch.width, height: patch.height });
  const k = pal.block;
  const { cols, rows, blocks } = blockAverages(patch, k);
  const reached = new Uint8Array(cols * rows);
  for (let y = 0; y < patch.height; y++)
    for (let x = 0; x < patch.width; x++)
      if (patch.data[(y * patch.width + x) * 4 + 3] > PATCH_ALPHA) reached[Math.floor(y / k) * cols + Math.floor(x / k)] = 1;
  // Flood out from the solid blocks through reached ones (8 neighbours).
  const keep = new Uint8Array(cols * rows);
  const queue: number[] = [];
  blocks.forEach((b, i) => {
    if (reached[i] && b.a >= 128) {
      keep[i] = 1;
      queue.push(i);
    }
  });
  while (queue.length) {
    const i = queue.pop()!;
    const bx = i % cols;
    const by = Math.floor(i / cols);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = bx + dx;
        const ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (reached[j] && !keep[j]) {
          keep[j] = 1;
          queue.push(j);
        }
      }
  }
  keep.forEach((on, i) => {
    if (!on) return;
    const bx = i % cols;
    const by = Math.floor(i / cols);
    const o = (by * k * patch.width + bx * k) * 4;
    fillBlock(out, k, bx, by, Array.from(worn.data.subarray(o, o + 4)));
  });
  return out;
}
