/**
 * A generated take to the cast's sprite (persona figure spec 2026-11-12): 1024×1536 like every cast sprite,
 * the flat green backdrop cut by a flood from the border (grey clothes against grey cut through, 2026-11-14), then SNAP.
 * On a chroma-key backdrop the pockets the flood can't reach (between an arm and the body, between the legs) go
 * too (2026-11-16): the prompt keeps that green off the figure, so an enclosed patch of it is backdrop.
 */
import { PNG } from 'pngjs';
import { snapImage, type CastPalette } from './snap';

export const FIGURE_W = 1024;
export const FIGURE_H = 1536;
/** How far (RGB distance) a background pixel may be from the corners' grey. */
const GREY_TOLERANCE = 40;
const CORNER = 8;
/** A corner colour this saturated (max − min channel) is a chroma key, not a studio grey. */
const KEY_SATURATION = 100;
/** Enclosed backdrop pockets smaller than this many pixels are left (stray pixels, not gaps). */
const MIN_POCKET = 4;

/** Nearest-neighbour resize. */
function resize(src: PNG, w: number, h: number): PNG {
  if (src.width === w && src.height === h) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / w));
      src.data.copy(out.data, (y * w + x) * 4, (sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4);
    }
  }
  return out;
}

/** The mean colour of the four CORNER×CORNER corners. */
function cornerGrey(png: PNG): [number, number, number] {
  const sum = [0, 0, 0];
  let n = 0;
  for (const [cx, cy] of [[0, 0], [png.width - CORNER, 0], [0, png.height - CORNER], [png.width - CORNER, png.height - CORNER]])
    for (let y = cy; y < cy + CORNER; y++)
      for (let x = cx; x < cx + CORNER; x++) {
        const i = (y * png.width + x) * 4;
        for (let c = 0; c < 3; c++) sum[c] += png.data[i + c];
        n++;
      }
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

/** Background pixels: those joined to the border through pixels near the corners' grey. */
export function cutGrey(png: PNG): PNG {
  const { width: w, height: h } = png;
  const [gr, gg, gb] = cornerGrey(png);
  const near = (p: number) => {
    const i = p * 4;
    // A model that sends transparency anyway: see-through is background too.
    if (png.data[i + 3] < 128) return true;
    return Math.hypot(png.data[i] - gr, png.data[i + 1] - gg, png.data[i + 2] - gb) <= GREY_TOLERANCE;
  };
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!bg[p] && near(p)) {
      bg[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  const flood = () => {
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < w * (h - 1)) push(p + w);
    }
  };
  flood();
  // A chroma key: every enclosed pocket of it is backdrop too. A grey backdrop keeps them (grey clothes look the same).
  if (Math.max(gr, gg, gb) - Math.min(gr, gg, gb) >= KEY_SATURATION) {
    const seen = new Uint8Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
      if (bg[p0] || seen[p0] || !near(p0)) continue;
      // The pocket's pixels, found without marking them background yet.
      const pocket: number[] = [p0];
      seen[p0] = 1;
      for (let i = 0; i < pocket.length; i++) {
        const p = pocket[i];
        const x = p % w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * (h - 1) ? p + w : -1]) {
          if (q >= 0 && !seen[q] && !bg[q] && near(q)) {
            seen[q] = 1;
            pocket.push(q);
          }
        }
      }
      if (pocket.length >= MIN_POCKET) for (const p of pocket) bg[p] = 1;
    }
  }
  const out = new PNG({ width: w, height: h });
  png.data.copy(out.data);
  for (let p = 0; p < w * h; p++) out.data[p * 4 + 3] = bg[p] ? 0 : 255;
  return out;
}

/** A take, ready to play: cast size, grey cut, snapped to the cast's grid and palette. */
export function cleanTake(png: PNG, pal: CastPalette): PNG {
  return snapImage(cutGrey(resize(png, FIGURE_W, FIGURE_H)), pal);
}
