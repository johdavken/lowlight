import { describe, expect, it } from 'vitest';
import { cropBox } from '../server/src/thumb';
import { FIGURE_H, FIGURE_W, figureCrop } from './figure-crop';

describe('figureCrop', () => {
  it("is the game's cropBox as shares, at the edges too", () => {
    for (const face of [{ x: 0.5, y: 0.15 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.23, y: 0.61 }]) {
      const b = cropBox(FIGURE_W, FIGURE_H, face);
      expect(figureCrop(face)).toEqual({ x: b.x / FIGURE_W, y: b.y / FIGURE_H, w: b.w / FIGURE_W, h: b.h / FIGURE_H });
    }
  });
});
