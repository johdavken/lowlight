import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { cleanTake, cutGrey, FIGURE_H, FIGURE_W } from '../src/figure-clean';
import type { CastPalette } from '../src/snap';

const GREY = [128, 128, 128];
const RED = [200, 30, 30];
const pal: CastPalette = { block: 2, colours: ['#808080', '#c81e1e', '#000000'] };

/** A grey canvas with a red ring and, inside it, a square of the same grey. */
function take(w: number, h: number): PNG {
  const png = new PNG({ width: w, height: h });
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      png.data.set([...(d < 100 && d >= 60 ? RED : GREY), 255], (y * w + x) * 4);
    }
  return png;
}
const alphaAt = (p: PNG, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

describe('cutGrey', () => {
  it('on a green backdrop keeps a grey figure whole, even where it touches the backdrop', () => {
    const png = new PNG({ width: 200, height: 300 });
    for (let y = 0; y < 300; y++)
      for (let x = 0; x < 200; x++) png.data.set([...(x >= 50 && x < 150 && y >= 50 && y < 250 ? [98, 98, 99] : [0, 255, 0]), 255], (y * 200 + x) * 4);
    const out = cutGrey(png);
    expect(alphaAt(out, 5, 5)).toBe(0);
    expect(alphaAt(out, 50, 50)).toBe(255); // the figure's edge, grey against green
    expect(alphaAt(out, 100, 150)).toBe(255);
  });

  it('on a green backdrop also cuts the pockets the figure closes in (between an arm and the body), not a stray pixel', () => {
    const w = 200;
    const png = new PNG({ width: w, height: 300 });
    const set = (x: number, y: number, c: number[]) => png.data.set([...c, 255], (y * w + x) * 4);
    for (let y = 0; y < 300; y++) for (let x = 0; x < w; x++) set(x, y, [0, 255, 0]);
    // A dark figure with a 20×20 hole of backdrop inside it, and one lone green pixel.
    for (let y = 50; y < 250; y++) for (let x = 50; x < 150; x++) set(x, y, [40, 30, 30]);
    for (let y = 100; y < 120; y++) for (let x = 90; x < 110; x++) set(x, y, [10, 250, 12]);
    set(70, 200, [0, 255, 0]);
    const out = cutGrey(png);
    expect(alphaAt(out, 100, 110)).toBe(0); // the pocket
    expect(alphaAt(out, 60, 60)).toBe(255); // the figure
    expect(alphaAt(out, 70, 200)).toBe(255); // a single pixel is left
  });

  it('cuts the grey joined to the border and keeps the grey the ring closes in', () => {
    const out = cutGrey(take(400, 600));
    expect(alphaAt(out, 5, 5)).toBe(0);
    expect(alphaAt(out, 200, 300)).toBe(255); // inside the ring: grey, but the figure's
    expect(alphaAt(out, 200 + 80, 300)).toBe(255); // the ring
  });
});

describe('cleanTake', () => {
  it('comes out at the cast size, binary alpha, every colour in the palette', () => {
    const out = cleanTake(take(1254, 1880), pal);
    expect([out.width, out.height]).toEqual([FIGURE_W, FIGURE_H]);
    const allowed = new Set(pal.colours);
    let bad = 0;
    for (let i = 0; i < out.data.length; i += 4) {
      const a = out.data[i + 3];
      if (a !== 0 && a !== 255) bad++;
      else if (a === 255 && !allowed.has(`#${[0, 1, 2].map((c) => out.data[i + c].toString(16).padStart(2, '0')).join('')}`)) bad++;
    }
    expect(bad).toBe(0);
    expect(alphaAt(out, 2, 2)).toBe(0);
    expect(alphaAt(out, FIGURE_W / 2, FIGURE_H / 2)).toBe(255);
  });
});
