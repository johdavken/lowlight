import { describe, expect, it } from 'vitest';
import { districtsIn, maskIndex, splitDark } from '../src/ui/map/blackout';

// Blackouts (spec 2026-10-27): a dark tile split by the district mask (R = index × 8).
const px = (vals: number[][]) => new Uint8ClampedArray(vals.flat());

describe('splitting a dark tile by district', () => {
  it("keeps only the named district's dark pixels", () => {
    const dark = px([[10, 10, 10, 255], [20, 20, 20, 255], [30, 30, 30, 255]]);
    const mask = px([[8, 0, 0, 255], [16, 0, 0, 255], [0, 0, 0, 255]]);
    expect([...splitDark(dark, mask, 1)]).toEqual([10, 10, 10, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("a neighbour's tower over a dark district stays lit (Review Focus 2)", () => {
    // A district-2 tower top drawn inside district 1's ground: splitting 1 never takes it.
    const dark = px([[1, 1, 1, 255], [2, 2, 2, 255], [3, 3, 3, 255]]);
    const mask = px([[8, 0, 0, 255], [16, 0, 0, 255], [8, 0, 0, 255]]);
    const out = splitDark(dark, mask, 1);
    expect(out[7]).toBe(0);
    expect([out[3], out[11]]).toEqual([255, 255]);
  });
  it('index 0 (water, the gaps) is never taken', () => {
    expect([...splitDark(px([[5, 5, 5, 255]]), px([[0, 0, 0, 255]]), 0)]).toEqual([0, 0, 0, 0]);
  });
  it('tolerates ±1 rounding in the mask', () => {
    expect(maskIndex(15)).toBe(2);
    expect(maskIndex(17)).toBe(2);
    expect(maskIndex(0)).toBe(0);
  });
  it('lists the districts a tile holds', () => {
    expect(districtsIn(px([[8, 0, 0, 255], [0, 0, 0, 255], [16, 0, 0, 255], [8, 0, 0, 255]]))).toEqual([1, 2]);
  });
});
