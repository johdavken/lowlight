import { PNG } from 'pngjs';
import { describe, expect, test } from 'vitest';
import { normalMap, normalMapPng } from '../src/normal-map';

/** An RGBA image: opaque mid-grey where `inside(x, y)`, transparent elsewhere. */
function shape(w: number, h: number, inside: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      out.set([128, 128, 128, 255], (y * w + x) * 4);
    }
  return out;
}
const at = (img: Uint8Array, w: number, x: number, y: number) => Array.from(img.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));

describe('normalMap', () => {
  test('a transparent pixel encodes neutral with alpha 0', async () => {
    const out = await normalMap(shape(64, 64, (x, y) => x > 20 && y > 20 && x < 44 && y < 44), 64, 64, { px: 1 });
    expect(at(out, 64, 0, 0)).toEqual([128, 128, 255, 0]);
  });

  test('a wide flat interior faces out', async () => {
    const out = await normalMap(shape(400, 400, (x, y) => Math.hypot(x - 200, y - 200) < 180), 400, 400, { px: 1 });
    expect(at(out, 400, 200, 200)[2]).toBeGreaterThanOrEqual(250);
  });

  test('a narrow strip curves over without a ridge', async () => {
    const W = 64;
    const out = await normalMap(shape(W, 300, (x, y) => x >= 20 && x < 44 && y > 10 && y < 290), W, 300, { px: 1 });
    const r = [];
    for (let x = 20; x < 44; x++) r.push(at(out, W, x, 150)[0]);
    for (let i = 0; i + 1 < r.length; i++) {
      // Facing left at its left edge, right at its right: red rises across it, with no jump at the middle.
      expect(r[i + 1]).toBeGreaterThanOrEqual(r[i] - 2);
      expect(Math.abs(r[i + 1] - r[i])).toBeLessThanOrEqual(40);
    }
    expect(r[r.length - 1]).toBeGreaterThan(r[0] + 40);
  });

  test('snapped output is constant inside each 2×2 block', async () => {
    const W = 80;
    const out = await normalMap(shape(W, 80, (x, y) => Math.hypot(x - 40, y - 40) < 30), W, 80, { px: 2 });
    for (let y = 0; y < 80; y += 2)
      for (let x = 0; x < W; x += 2) {
        const a = at(out, W, x, y);
        expect(at(out, W, x + 1, y)).toEqual(a);
        expect(at(out, W, x, y + 1)).toEqual(a);
        expect(at(out, W, x + 1, y + 1)).toEqual(a);
      }
  });

  test('the event loop runs while a large map is made', async () => {
    let ticks = 0;
    let on = true;
    const tick = () => {
      ticks++;
      if (on) setImmediate(tick);
    };
    setImmediate(tick);
    await normalMap(shape(1024, 1536, (x, y) => Math.hypot(x - 512, y - 700) < 400), 1024, 1536, { px: 2 });
    on = false;
    expect(ticks).toBeGreaterThan(3);
  });
});

describe('normalMapPng', () => {
  test('round-trips a PNG of the same size', async () => {
    const png = new PNG({ width: 50, height: 70 });
    png.data.set(shape(50, 70, (x, y) => x > 10 && x < 40 && y > 10 && y < 60));
    const out = PNG.sync.read(await normalMapPng(PNG.sync.write(png), { px: 1 }));
    expect([out.width, out.height]).toEqual([50, 70]);
    expect(out.data[(35 * 50 + 25) * 4 + 3]).toBe(255);
  });
});
