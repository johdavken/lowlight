import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { silhouette } from './silhouette';

function img(px: [number, number, number, number][]): PNG {
  const p = new PNG({ width: px.length, height: 1 });
  px.forEach((c, i) => p.data.set(c, i * 4));
  return p;
}

describe('silhouette', () => {
  it('fills every visible pixel with one colour, keeping its alpha', () => {
    const out = silhouette(img([[200, 10, 30, 255], [90, 90, 90, 128]]), [3, 2, 4]);
    expect([...out.data.subarray(0, 8)]).toEqual([3, 2, 4, 255, 3, 2, 4, 128]);
  });

  it('leaves see-through pixels as they were and keeps the size', () => {
    const out = silhouette(img([[0, 0, 0, 0], [255, 255, 255, 255]]), [3, 2, 4]);
    expect([...out.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([out.width, out.height]).toEqual([2, 1]);
  });
});
