import { describe, expect, it } from 'vitest';
import { chooseTake, THUNDER_TAKES, thunderLevel } from '../src/audio/thunder';
import { seededRng } from '../src/renderer/effects/lightning';

const band = (url: string) => THUNDER_TAKES.find((t) => t.url === url)!.band;

describe('thunder takes', () => {
  it('ships seven takes: two far, two mid, three near', () => {
    expect(THUNDER_TAKES.map((t) => t.band).sort()).toEqual(['far', 'far', 'mid', 'mid', 'near', 'near', 'near']);
    for (const t of THUNDER_TAKES) expect(t.url).toMatch(/^\/sound\/thunder\/(far|mid|near)-\d\.ogg$/);
  });

  it('picks by distance: far over 0.66, near under 0.33, mid between', () => {
    const rng = seededRng(1);
    expect(band(chooseTake(0.9, null, rng))).toBe('far');
    expect(band(chooseTake(0.1, null, rng))).toBe('near');
    expect(band(chooseTake(0.5, null, rng))).toBe('mid');
  });

  it('never plays the same take twice in a row', () => {
    const rng = seededRng(2);
    let last: string | null = null;
    for (let i = 0; i < 200; i++) {
      const next = chooseTake(i % 3 === 0 ? 0.1 : i % 3 === 1 ? 0.5 : 0.9, last, rng);
      expect(next).not.toBe(last);
      last = next;
    }
  });

  it('is louder near: 0.9 at 0, 0.35 at 1', () => {
    expect(thunderLevel(0)).toBeCloseTo(0.9);
    expect(thunderLevel(1)).toBeCloseTo(0.35);
    expect(thunderLevel(0.5)).toBeCloseTo(0.625);
  });
});
