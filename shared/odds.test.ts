import { describe, expect, it } from 'vitest';
import { odds, resultLines } from './odds';

describe('odds (the table in the trace)', () => {
  it('splits a roll into a 6, a 4–5 and a miss, in whole percent', () => {
    expect(odds(1)).toEqual({ clean: 17, cost: 33, miss: 50 });
    expect(odds(2)).toEqual({ clean: 31, cost: 44, miss: 25 });
    expect(odds(4)).toEqual({ clean: 52, cost: 42, miss: 6 });
    for (let n = -1; n <= 8; n++) expect(Object.values(odds(n)).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('no dice rolls two and keeps the lower', () => expect(odds(0)).toEqual({ clean: 3, cost: 22, miss: 75 }));
  it('stops at the pool cap', () => expect(odds(9)).toEqual(odds(6)));
});

describe('resultLines', () => {
  const gains = (l: ReturnType<typeof resultLines>) => l.map((x) => `${x.key} ${x.gain} ${x.rest}`);
  it('TAKE by effect, costs by position', () => {
    expect(gains(resultLines({ position: 'open', effect: 'fair' }))).toEqual(['6 +2 TAKE. No cost.', '4–5 +1 TAKE. Pick 1 cost.', '1–3 No TAKE. Pick 2 costs.']);
    expect(gains(resultLines({ position: 'dark', effect: 'small' }))).toEqual(['6 +1 TAKE. No cost.', '4–5 Through, no TAKE. No cost.', '1–3 No TAKE. Pick 1 cost.']);
    expect(gains(resultLines({ position: 'wire', effect: 'big' }))).toEqual(['6 +3 TAKE. No cost.', '4–5 +2 TAKE. Pick 2 costs.', '1–3 No TAKE. Pick 2 costs.']);
  });
  it('a roll that fills nothing says only whether you are through', () => {
    expect(gains(resultLines({ position: 'open' }))).toEqual(['6 Through. No cost.', '4–5 Through. Pick 1 cost.', '1–3 Not through. Pick 2 costs.']);
  });
  it('a miss that loses the take, keeps half behind a held post, or blows the job', () => {
    expect(resultLines({ position: 'open', effect: 'fair', on: { miss: 'none' } })[2]).toMatchObject({ gain: 'YOU LOSE THE TAKE.', rest: 'Pick 2 costs.' });
    expect(resultLines({ position: 'open', effect: 'fair', on: { miss: 'part', harm: { who: 'KOJI', harm: 'hurt' } } })[2]).toMatchObject({ gain: 'YOU KEEP HALF THE TAKE.', rest: 'Pick 2 costs. KOJI TAKES THE HIT.' });
    expect(resultLines({ position: 'open', effect: 'fair', on: { miss: 'part', harm: { who: 'MIA', harm: 'held' } } })[2].rest).toBe('Pick 2 costs. MIA IS HELD.');
    expect(resultLines({ position: 'open', effect: 'fair', on: { blown: true, miss: 'none' } })[2].gain).toBe('THE JOB IS BLOWN.');
  });
  it('a pass that still cuts the take says so', () => expect(resultLines({ position: 'dark', effect: 'fair', on: { pass: 'part' } })[0].rest).toBe('No cost. The take is cut all the same.'));
});
