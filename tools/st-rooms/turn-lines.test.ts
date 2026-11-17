import { describe, expect, it } from 'vitest';
import { arrivalGap } from './turn-lines';

const HOUR = 60 * 60 * 1000;

describe('arrivalGap', () => {
  it('says nothing under six hours', () => {
    expect(arrivalGap('Hicks', 0, 6 * HOUR - 1)).toBeNull();
  });

  it('names you and the time away, as the game words it', () => {
    expect(arrivalGap('Hicks', 0, 6 * HOUR)).toBe('[arrival: Hicks back after 6 hours]');
    expect(arrivalGap('Hicks', 0, 3 * 24 * HOUR)).toBe('[arrival: Hicks back after 3 days]');
  });

  it('says nothing for a time that does not read', () => {
    expect(arrivalGap('Hicks', NaN, 10 * HOUR)).toBeNull();
  });
});
