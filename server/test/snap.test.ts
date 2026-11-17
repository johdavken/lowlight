import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { type CastPalette, readCastPalette, snapImage, snapPatch } from '../src/snap';

const PAL: CastPalette = { block: 3, colours: ['#000000', '#ffffff', '#ff0000', '#00ff88'] };
const PAL_RGB = new Set(['0,0,0', '255,255,255', '255,0,0', '0,255,136']);

function png(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): PNG {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = fill(x, y);
      p.data[i] = r;
      p.data[i + 1] = g;
      p.data[i + 2] = b;
      p.data[i + 3] = a;
    }
  return p;
}
const px = (p: PNG, x: number, y: number) => Array.from(p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

/** Seeded noise so a failure reproduces. */
function noise(w: number, h: number, seed = 7): PNG {
  let s = seed;
  const r = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  return png(w, h, () => [r(), r(), r(), r()]);
}

/** Source-over, straight alpha (what the stage's stacked backgrounds do). */
function over(top: PNG, base: PNG): PNG {
  return png(base.width, base.height, (x, y) => {
    const [tr, tg, tb, ta] = px(top, x, y);
    const [br, bg, bb, ba] = px(base, x, y);
    const a = ta / 255 + (ba / 255) * (1 - ta / 255);
    if (a === 0) return [0, 0, 0, 0];
    const c = (t: number, b: number) => Math.round((t * (ta / 255) + b * (ba / 255) * (1 - ta / 255)) / a);
    return [c(tr, br), c(tg, bg), c(tb, bb), Math.round(a * 255)];
  });
}

describe('snapImage', () => {
  it('uses only palette colours, and alpha is 0 or 255', () => {
    const out = snapImage(noise(10, 7), PAL);
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 10; x++) {
        const [r, g, b, a] = px(out, x, y);
        expect([0, 255]).toContain(a);
        if (a === 255) expect(PAL_RGB.has(`${r},${g},${b}`)).toBe(true);
      }
  });

  it('every block is one colour, the partial edge blocks included, and the size is kept', () => {
    const out = snapImage(noise(10, 7), PAL);
    expect([out.width, out.height]).toEqual([10, 7]);
    for (let by = 0; by < 7; by += 3)
      for (let bx = 0; bx < 10; bx += 3) {
        const first = px(out, bx, by).join();
        for (let y = by; y < Math.min(by + 3, 7); y++) for (let x = bx; x < Math.min(bx + 3, 10); x++) expect(px(out, x, y).join()).toBe(first);
      }
  });

  it('is idempotent', () => {
    const once = snapImage(noise(10, 7), PAL);
    expect(Buffer.compare(snapImage(once, PAL).data, once.data)).toBe(0);
  });

  it('clears faint alpha noise', () => {
    const out = snapImage(png(9, 9, () => [255, 255, 255, 5]), PAL);
    expect(out.data.every((v: number) => v === 0)).toBe(true);
  });

  it('a block is solid at an average alpha of 128 or more', () => {
    const five = snapImage(png(3, 3, (x, y) => (y * 3 + x < 5 ? [255, 255, 255, 255] : [0, 0, 0, 0])), PAL);
    const four = snapImage(png(3, 3, (x, y) => (y * 3 + x < 4 ? [255, 255, 255, 255] : [0, 0, 0, 0])), PAL);
    expect(px(five, 0, 0)[3]).toBe(255);
    expect(px(four, 0, 0)[3]).toBe(0);
  });

  it("weights colour by alpha: clear pixels don't tint the block", () => {
    const out = snapImage(png(3, 3, (x, y) => (y * 3 + x < 5 ? [255, 0, 0, 255] : [255, 255, 255, 0])), PAL);
    expect(px(out, 1, 1)).toEqual([255, 0, 0, 255]);
  });
});

describe('snapPatch', () => {
  const base = png(12, 12, () => [0, 0, 0, 255]);
  // A white disc whose edge fades from 255 to 0 over 3 px.
  const patch = png(12, 12, (x, y) => {
    const d = Math.hypot(x - 6, y - 6);
    const a = d <= 2 ? 255 : d >= 5 ? 0 : Math.round(255 * (5 - d) / 3);
    return [255, 255, 255, a];
  });

  it('drawn over the snapped base, it matches snapping base and patch together', () => {
    expect(Buffer.compare(over(snapPatch(patch, base, PAL), snapImage(base, PAL)).data, snapImage(over(patch, base), PAL).data)).toBe(0);
  });

  it('blocks the patch does not reach are clear', () => {
    const out = snapPatch(patch, base, PAL);
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 11, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 6, 6)[3]).toBe(255);
  });

  it('keeps every block the patch reaches, even where it matches the base, so other outfits never show through', () => {
    // A face painted the same black as this base: on another outfit it must still cover that outfit's head.
    const same = png(12, 12, (x, y) => (x >= 3 && x < 9 && y >= 3 && y < 9 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
    const out = snapPatch(same, base, PAL);
    expect(px(out, 4, 4)).toEqual([0, 0, 0, 255]);
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("drops faint haze that doesn't touch the face, keeps faint parts that do", () => {
    // A solid 3×3 face at the top-left, a faint wisp running on from it, and a faint speck far away.
    const hazy = png(12, 12, (x, y) => {
      if (x < 3 && y < 3) return [255, 255, 255, 255];
      if (y === 1 && x >= 3 && x < 6) return [255, 255, 255, 40];
      if (x === 10 && y === 10) return [255, 255, 255, 40];
      return [0, 0, 0, 0];
    });
    const out = snapPatch(hazy, base, { ...PAL, block: 2 });
    expect(px(out, 0, 0)[3]).toBe(255);
    expect(px(out, 4, 0)[3]).toBe(255);
    expect(px(out, 10, 10)).toEqual([0, 0, 0, 0]);
  });

  it('throws when the sizes differ', () => {
    expect(() => snapPatch(png(6, 6, () => [0, 0, 0, 0]), base, PAL)).toThrow();
  });
});

describe('readCastPalette', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-palette-'));
  it('says how to make it when the file is missing', () => {
    expect(() => readCastPalette(path.join(dir, 'nope.json'))).toThrow('Run npm run cast-palette first');
  });
  it('says the same for a broken file', () => {
    const f = path.join(dir, 'bad.json');
    fs.writeFileSync(f, JSON.stringify({ block: 0, colours: [] }));
    expect(() => readCastPalette(f)).toThrow('Run npm run cast-palette first');
  });
  it('reads a good one', () => {
    const f = path.join(dir, 'good.json');
    fs.writeFileSync(f, JSON.stringify(PAL));
    expect(readCastPalette(f)).toEqual(PAL);
  });
});
