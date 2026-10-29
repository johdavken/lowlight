import { describe, expect, it } from 'vitest';
import { areaBounds, inArea, rectToShape, selfCrosses, shapeArea } from './weather-area';

describe('weather area shapes', () => {
  it('rectToShape walks the rectangle clockwise', () => {
    expect(rectToShape([10, 20, 30, 40])).toEqual([[10, 20], [40, 20], [40, 60], [10, 60]]);
  });

  it('shapeArea is absolute', () => {
    expect(shapeArea([[0, 0], [4, 0], [4, 2]])).toBe(4);
    expect(shapeArea([[4, 2], [4, 0], [0, 0]])).toBe(4);
  });

  it('areaBounds covers every shape', () => {
    expect(areaBounds([[[10, 10], [20, 10], [20, 20]], [[30, 5], [40, 5], [40.5, 25]]])).toEqual([10, 5, 31, 20]);
  });

  it('selfCrosses finds a figure eight, not a square or a notched shape', () => {
    expect(selfCrosses([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
    expect(selfCrosses([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
    expect(selfCrosses([[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]])).toBe(false);
  });

  it('inArea is true inside any shape and false in a notch or outside them all', () => {
    const notched: [number, number][] = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]];
    const area = [notched, rectToShape([50, 0, 10, 10])];
    expect(inArea(area, 5, 20)).toBe(true);
    expect(inArea(area, 15, 20)).toBe(false);
    expect(inArea(area, 55, 5)).toBe(true);
    expect(inArea(area, 45, 5)).toBe(false);
    expect(inArea(area, 5, 40)).toBe(false);
  });
});
