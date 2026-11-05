import { describe, expect, it } from 'vitest';
import { DEFAULT_STATS, nerveMax, parseStats, STAT_KEYS } from './stats';

const HICKS = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };

describe('stats', () => {
  it('parseStats takes six whole numbers 1–10', () => {
    expect(parseStats(HICKS)).toEqual(HICKS);
    expect(STAT_KEYS).toEqual(['body', 'reflex', 'tech', 'cool', 'wits', 'edge']);
    for (const bad of [{ ...HICKS, tech: 0 }, { ...HICKS, tech: 11 }, { ...HICKS, tech: 4.5 }, { ...HICKS, edge: undefined }, { ...HICKS, luck: 3 }, null, 'x']) {
      expect(parseStats(bad)).toBeNull();
    }
  });
  it('the default is 3 in everything', () => {
    expect(DEFAULT_STATS).toEqual({ body: 3, reflex: 3, tech: 3, cool: 3, wits: 3, edge: 3 });
  });
  it('nerveMax is 3 + edge ÷ 2 rounded up (the table spec §3)', () => {
    expect([4, 5, 7, 3].map((edge) => nerveMax({ ...HICKS, edge }))).toEqual([5, 6, 7, 5]);
  });
});
