import { describe, expect, it } from 'vitest';
import { normalizeInverseDepth } from './depth';

describe('normalizeInverseDepth', () => {
  it('maps inverse depth (large = near) to 0 near … 1 far', () => {
    expect([...normalizeInverseDepth(new Float32Array([10, 5, 0]))]).toEqual([0, 0.5, 1]);
  });

  it('a "near" right half (large raw values) comes out < 0.5 on the right', () => {
    const raw = new Float32Array([1, 1, 9, 9]);
    const d = normalizeInverseDepth(raw);
    expect(d[2]).toBeLessThan(0.5);
    expect(d[0]).toBeGreaterThan(0.5);
  });

  it('a flat map normalizes to all 0.5 instead of dividing by zero', () => {
    expect([...normalizeInverseDepth(new Float32Array([3, 3]))]).toEqual([0.5, 0.5]);
  });
});
