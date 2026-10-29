import { describe, expect, it } from 'vitest';
import { maskFloor } from './mask-floor';

// Blackouts: lamp pools on the bay and the gaps go dark with the district beside them (review of the mask pass).
const sq = (x0: number, y0: number, s: number): [number, number][] => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
const districts = [{ id: 'a', border: sq(100, 100, 200) }, { id: 'b', border: sq(340, 100, 200) }, { id: 'spine', border: [] }];
const at = (f: ReturnType<typeof maskFloor>, x: number, y: number) => {
  const row = Math.floor(y / f.step), col = Math.floor(x / f.step);
  return f.runs.find(([r, c0, c1]) => r === row && col >= c0 && col <= c1)?.[3] ?? 0;
};

describe('the mask floor', () => {
  const f = maskFloor(districts, 1000, 700, 170, 10);
  it('water and gaps within reach take the nearest district', () => {
    expect(at(f, 200, 200)).toBe(1);
    expect(at(f, 315, 200)).toBe(1);
    expect(at(f, 325, 200)).toBe(2);
    expect(at(f, 200, 400)).toBe(1);
  });
  it('open water out of reach stays 0', () => {
    expect(at(f, 200, 650)).toBe(0);
    expect(at(f, 900, 650)).toBe(0);
  });
  it('districts without a border (the Spine, the Ribbon) own no floor', () => {
    expect(f.runs.every(([, , , id]) => id !== 3)).toBe(true);
  });
});
