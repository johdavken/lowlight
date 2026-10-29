import { describe, expect, it } from 'vitest';
import { beatOnPage, beatStarts } from '../src/ui/beat-pages';

describe('beatStarts', () => {
  it('starts every beat after the first on a new page', () => {
    expect(beatStarts([30, 50, 10], 100)).toEqual([0, 100, 200]);
  });

  it('a beat longer than a page pushes the next one past its overflow', () => {
    expect(beatStarts([130, 20], 100)).toEqual([0, 200]);
  });

  it('one beat starts at the top', () => {
    expect(beatStarts([40], 100)).toEqual([0]);
  });
});

describe('beatOnPage', () => {
  it('finds the beat a page shows', () => {
    expect(beatOnPage([0, 100, 200], 1, 100)).toBe(1);
    expect(beatOnPage([0, 100, 200], 2, 100)).toBe(2);
  });

  it("a page of the first beat's overflow is still the first beat", () => {
    expect(beatOnPage([0, 200], 1, 100)).toBe(0);
    expect(beatOnPage([0, 200], 2, 100)).toBe(1);
  });
});
