import { describe, expect, it } from 'vitest';
import { CIPHER, frameAt, planDecrypt, TICKS_PER_S, TITLE_BUILD_MS } from '../src/landing/decrypt';
import { artCells, blockArt } from '../src/landing/lowlight-art';

const art = blockArt('LOWLIGHT')!;
const { cells, cols, rows } = artCells(art);
const BUILD_TICKS = Math.round((TITLE_BUILD_MS * TICKS_PER_S) / 1000);

describe('LOWLIGHT block art', () => {
  it('is eight even rows of block characters', () => {
    expect(art).toHaveLength(8);
    expect(new Set(art.map((l) => [...l].length)).size).toBe(1);
    expect(cols).toBe(86);
    expect(rows).toBe(8);
    expect(cells.every((c) => '█▀▄'.includes(c.ch))).toBe(true);
  });

  it('draws HICKS and SOREN the same way', () => {
    for (const word of ['HICKS', 'SOREN']) {
      const a = blockArt(word)!;
      expect(a).toHaveLength(8);
      expect(new Set(a.map((l) => [...l].length)).size).toBe(1);
      expect(artCells(a).cells.every((c) => '█▀▄'.includes(c.ch))).toBe(true);
    }
  });

  it('has no art for letters it lacks', () => {
    expect(blockArt('QUAY')).toBeNull();
    expect(blockArt('')).toBeNull();
  });
});

describe('decrypt', () => {
  it('the same seed plays the same frames', () => {
    const a = planDecrypt(cells, rows, 7);
    const b = planDecrypt(cells, rows, 7);
    for (const t of [0, 20, 90, 150, 250]) expect(frameAt(a, t)).toEqual(frameAt(b, t));
  });

  it('starts empty and ends on the art in its final colours, by the build time', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const plan = planDecrypt(cells, rows, seed);
      expect(frameAt(plan, -1).cells.every((c) => c === null)).toBe(true);
      expect(plan.ticks).toBeLessThanOrEqual(BUILD_TICKS);
      const end = frameAt(plan, plan.ticks);
      expect(end.done).toBe(true);
      end.cells.forEach((c, i) => expect(c).toEqual({ glyph: cells[i].ch, colour: plan.cells[i].final, final: true }));
      expect(frameAt(plan, plan.ticks - 1).done).toBe(false);
    }
  });

  it('types cells in reading order', () => {
    const plan = planDecrypt(cells, rows, 5);
    const starts = plan.cells.map((p) => p.segs[0].start);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
  });

  it('shows only typing blocks, cipher glyphs or the real character', () => {
    const plan = planDecrypt(cells, rows, 11);
    const ok = new Set([...CIPHER, '▉', '▓', '▒', '░']);
    for (let t = 0; t <= plan.ticks; t += 3)
      frameAt(plan, t).cells.forEach((c, i) => {
        if (c && !ok.has(c.glyph)) expect(c.glyph).toBe(cells[i].ch);
      });
  });

  it('cycles through a cipher it is given (the card passes the decode\'s Han)', () => {
    const han = ['电', '网', '码'];
    const plan = planDecrypt(cells, rows, 11, han);
    const ok = new Set([...han, '▉', '▓', '▒', '░']);
    for (let t = 0; t <= plan.ticks; t += 3)
      frameAt(plan, t).cells.forEach((c, i) => {
        if (c && !ok.has(c.glyph)) expect(c.glyph).toBe(cells[i].ch);
      });
  });

  it('cycles cipher glyphs mid-build', () => {
    const plan = planDecrypt(cells, rows, 3);
    const mid = frameAt(plan, 150).cells;
    expect(mid.every((c) => c && !c.final)).toBe(true);
    expect(new Set(mid.map((c) => c!.glyph)).size).toBeGreaterThan(50);
  });
});
