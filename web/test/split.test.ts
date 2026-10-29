import { describe, expect, it } from 'vitest';
import { splitPx } from '../src/renderer/split';

describe('splitPx (RGB-split offset in screen px)', () => {
  it('rests at a 1 px hairline on every screen, so 4K stays sharp', () => {
    for (const scale of [1, 4, 5, 8]) expect(splitPx(0, scale)).toBe(1);
  });

  it('a full glitch still swings wide, scaled with the art (6 art px)', () => {
    expect(splitPx(1, 4)).toBe(24);
    expect(splitPx(1, 8)).toBe(48);
  });

  it('ramps between the two', () => {
    expect(splitPx(0.5, 8)).toBe(25);
  });
});
