import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { blank, blitOver, crop, readPng, scaleNearest, writePng, type Img } from './image';
import { tempDir } from '../../server/test/fixtures/temp-dir';

function px(img: Img, x: number, y: number): number[] {
  const i = (y * img.w + x) * 4;
  return [...img.data.slice(i, i + 4)];
}
function set(img: Img, x: number, y: number, rgba: number[]): void {
  img.data.set(rgba, (y * img.w + x) * 4);
}

describe('image utils', () => {
  it('crop → scaleNearest → blitOver round-trips a 4×4 fixture', () => {
    const src = blank(4, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(src, x, y, [x * 60, y * 60, 0, 255]);
    const c = crop(src, 1, 1, 2, 2);
    expect([c.w, c.h]).toEqual([2, 2]);
    expect(px(c, 0, 0)).toEqual([60, 60, 0, 255]);
    const big = scaleNearest(c, 4, 4);
    expect(px(big, 3, 3)).toEqual([120, 120, 0, 255]);
    expect(px(big, 1, 1)).toEqual([60, 60, 0, 255]);
    const dst = blank(4, 4);
    blitOver(dst, big, 0, 0);
    expect(px(dst, 2, 0)).toEqual(px(big, 2, 0));
  });

  it('crop clamps to the image bounds', () => {
    const c = crop(blank(4, 4), 3, 3, 5, 5);
    expect([c.w, c.h]).toEqual([1, 1]);
  });

  it('blitOver honours alpha (50% red over blue)', () => {
    const dst = blank(1, 1);
    set(dst, 0, 0, [0, 0, 255, 255]);
    const src = blank(1, 1);
    set(src, 0, 0, [255, 0, 0, 128]);
    blitOver(dst, src, 0, 0);
    const [r, g, b, a] = px(dst, 0, 0);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
    expect(g).toBe(0);
    expect(Math.abs(b - 127)).toBeLessThanOrEqual(1);
    expect(a).toBe(255);
  });

  it('writePng then readPng returns the same pixels', () => {
    const img = blank(3, 2);
    set(img, 2, 1, [10, 20, 30, 40]);
    const file = path.join(tempDir('art-img-'), 'x.png');
    writePng(file, img);
    const back = readPng(file);
    expect([back.w, back.h]).toEqual([3, 2]);
    expect([...back.data]).toEqual([...img.data]);
  });
});
