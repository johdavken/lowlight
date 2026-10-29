import { describe, expect, test } from 'vitest';
import { rng } from '../gig/generate';
import { chance, chooseMove, DEFAULT_SETTINGS, simulate, strongestFace, TUNE, type DiceSettings } from './opponent';
import { bid, callLiar, countFace, isLegal, lastBid, newGame, totalDice, type DiceState } from './rules';

const PLAIN: DiceSettings = { bluff: 0, nerve: 0.5, suspicion: 0.5 };
const CASS: DiceSettings = { bluff: 0.15, nerve: 0.45, suspicion: 0.75 };

describe('chance', () => {
  test('own dice covering q → 1; needing more than unknown → 0; a hand binomial', () => {
    expect(chance(2, 5, [5, 1, 3], 4)).toBe(1);
    expect(chance(9, 5, [5], 4)).toBe(0);
    expect(chance(3, 5, [5, 1], 3)).toBeCloseTo(1 - (2 / 3) ** 3, 10);
    expect(chance(1, 1, [], 2)).toBeCloseTo(1 - (5 / 6) ** 2, 10);
  });
  test('read raises the per-die chance, capped at 0.75', () => {
    expect(chance(3, 5, [5, 1], 3, 1.35)).toBeCloseTo(1 - (1 - 0.45) ** 3, 10);
    expect(chance(1, 5, [], 1, 10)).toBeCloseTo(0.75, 10);
  });
  test('strongestFace: most dice with wilds, non-1s, the higher face on a tie', () => {
    expect(strongestFace([1, 3, 3, 6, 6])).toBe(6);
    expect(strongestFace([1, 1, 2, 4, 5])).toBe(5);
  });
});

describe('chooseMove', () => {
  test('never illegal over thousands of states, and always calls an impossible bid', () => {
    let moves = 0;
    for (let g = 1; g <= 400; g++) {
      let s: DiceState = newGame(g);
      const r = rng(g * 31 + 7);
      for (let guard = 0; !s.over && guard < 200; guard++) {
        const settings = { bluff: r(), nerve: r(), suspicion: r() };
        const last = lastBid(s);
        const m = chooseMove(s, settings, r);
        moves++;
        if (last) {
          const max = countFace(s.dice[s.turn], last.face) + s.left[s.turn === 'you' ? 'her' : 'you'];
          if (last.q > max) expect(m.kind).toBe('liar');
        }
        if (m.kind === 'liar') {
          expect(last).not.toBeNull();
          s = callLiar(s).state;
        } else {
          expect(isLegal(last, m.q, m.face, totalDice(s))).toBe(true);
          s = bid(s, m.q, m.face, m.bluff);
        }
      }
    }
    expect(moves).toBeGreaterThan(2000);
  });

  test('opening a round always bids, never on 1s', () => {
    for (let g = 1; g <= 200; g++) {
      const m = chooseMove(newGame(g), DEFAULT_SETTINGS, rng(g));
      expect(m.kind).toBe('bid');
      if (m.kind === 'bid') expect(m.face).not.toBe(1);
    }
  });

  test('the constants', () => {
    expect(DEFAULT_SETTINGS).toEqual({ bluff: 0.25, nerve: 0.5, suspicion: 0.5 });
    expect(TUNE).toEqual({ callBase: 0.15, callSpan: 0.35, acceptBase: 0.5, acceptSpan: 0.35, read: 1.35, bluffLo: 0.3 });
  });
});

describe('settings matter', () => {
  test('suspicion 1 calls more per game than suspicion 0', () => {
    const hi = simulate(400, { bluff: 0.25, nerve: 0.5, suspicion: 1 }, PLAIN, 3);
    const lo = simulate(400, { bluff: 0.25, nerve: 0.5, suspicion: 0 }, PLAIN, 3);
    expect(hi.callsPerGame).toBeGreaterThan(lo.callsPerGame);
  });
  test('bluff 0.8 bluffs on more bids than bluff 0', () => {
    expect(simulate(300, { bluff: 0.8, nerve: 0.5, suspicion: 0.5 }, PLAIN, 5).bluffRate).toBeGreaterThan(simulate(300, PLAIN, PLAIN, 5).bluffRate);
  });
});

describe('strength', () => {
  test('the defaults beat a reckless bidder at least 70%', () => {
    expect(simulate(400, DEFAULT_SETTINGS, { bluff: 1, nerve: 1, suspicion: 0 }, 1).herWinRate).toBeGreaterThanOrEqual(0.7);
  });
  test("Cass's settings win 40–55% against a plain player", () => {
    const r = simulate(1000, CASS, PLAIN, 1);
    expect(r.herWinRate).toBeGreaterThanOrEqual(0.4);
    expect(r.herWinRate).toBeLessThanOrEqual(0.55);
  });
});
