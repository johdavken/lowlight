import { describe, expect, it } from 'vitest';
import type { Anchor, Pt } from '../../shared/map-schema';
import { pathD } from '../src/ui/map/path';

const toPx = (x: number, y: number): Pt => [x * 10, y * 10];
const corner = (x: number, y: number): Anchor => ({ x, y, i: null, o: null });

describe('pathD', () => {
  it('draws corners as lines and closes the path', () => {
    expect(pathD([corner(0, 0), corner(1, 0), corner(1, 1)], toPx)).toBe('M0,0 L10,0 L10,10 L0,0 Z');
  });

  it('leaves an open path open', () => {
    expect(pathD([corner(0, 0), corner(1, 0), corner(1, 1)], toPx, false)).toBe('M0,0 L10,0 L10,10');
  });

  it('draws a handle on either end as a cubic curve; a missing handle sits on its point', () => {
    const a = { ...corner(0, 0), o: [1, 0] as Pt };
    const b = { ...corner(1, 0), i: [-1, 0] as Pt };
    expect(pathD([a, b], toPx, false)).toBe('M0,0 C10,0 0,0 10,0');
    expect(pathD([a, corner(1, 0)], toPx, false)).toBe('M0,0 C10,0 10,0 10,0');
  });

  it('draws nothing for no points', () => {
    expect(pathD([], toPx)).toBe('');
  });
});
