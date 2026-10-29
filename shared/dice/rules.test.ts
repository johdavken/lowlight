import { describe, expect, test } from 'vitest';
import { bid, callLiar, countFace, isLegal, lastBid, minRaise, newGame, START_DICE, totalDice, type Bid, type DiceState, type Face } from './rules';

const B = (q: number, face: Face, by: Bid['by'] = 'you'): Bid => ({ q, face, by });
/** A game with the dice set by hand (the rest as dealt). */
const rigged = (you: Face[], her: Face[], over: Partial<DiceState> = {}): DiceState => ({ ...newGame(1), dice: { you, her }, left: { you: you.length, her: her.length }, ...over });

describe('counting and raising', () => {
  test('countFace: a face counts itself and 1s; 1s count only 1s', () => {
    expect(countFace([5, 1, 5, 2, 1], 5)).toBe(4);
    expect(countFace([5, 1, 5, 2, 1], 1)).toBe(2);
    expect(countFace([2, 3], 6)).toBe(0);
  });

  test('minRaise: opening never on 1s; higher face same q; lower face q+1; to 1s ⌈q/2⌉; from 1s 2q+1; 1s to 1s q+1; Infinity past the total', () => {
    expect(minRaise(null, 1, 10)).toBe(Infinity);
    expect(minRaise(null, 4, 10)).toBe(1);
    expect(minRaise(B(3, 4), 5, 10)).toBe(3);
    expect(minRaise(B(3, 4), 3, 10)).toBe(4);
    expect(minRaise(B(3, 4), 4, 10)).toBe(4);
    expect(minRaise(B(5, 4), 1, 10)).toBe(3);
    expect(minRaise(B(4, 4), 1, 10)).toBe(2);
    expect(minRaise(B(2, 1), 6, 10)).toBe(5);
    expect(minRaise(B(2, 1), 1, 10)).toBe(3);
    expect(minRaise(B(5, 1), 2, 10)).toBe(Infinity);
    expect(isLegal(B(3, 4), 3, 5, 10)).toBe(true);
    expect(isLegal(B(3, 4), 3, 3, 10)).toBe(false);
  });
});

describe('a game', () => {
  test('newGame: five dice each, you open round 1, deterministic, plain JSON', () => {
    const s = newGame(1);
    expect(START_DICE).toBe(5);
    expect(s.dice.you).toHaveLength(5);
    expect(s.dice.her).toHaveLength(5);
    expect([s.turn, s.opener, s.round, s.over]).toEqual(['you', 'you', 1, null]);
    expect(newGame(1)).toEqual(s);
    expect(structuredClone(s)).toEqual(s);
  });

  test('mockup parity: the same dice as dice-engine.js for seeds 1 and 7', () => {
    expect(newGame(1).dice).toEqual({ you: [4, 1, 4, 6, 6], her: [2, 4, 5, 3, 6] });
    expect(newGame(7).dice).toEqual({ you: [1, 1, 6, 5, 4], her: [3, 3, 2, 4, 5] });
  });

  test('bid: an illegal raise throws; the turn passes; the input is unchanged', () => {
    const s = newGame(1);
    const before = structuredClone(s);
    expect(() => bid(s, 1, 1)).toThrow();
    const t = bid(s, 2, 4);
    expect(s).toEqual(before);
    expect(lastBid(t)).toEqual({ q: 2, face: 4, by: 'you' });
    expect(t.turn).toBe('her');
    expect(() => bid(t, 2, 3)).toThrow();
    expect(totalDice(t)).toBe(10);
  });

  test('callLiar: a count equal to q keeps the bid (the caller loses); one short and the bidder loses', () => {
    const s = bid(rigged([5, 5, 2, 3, 4], [1, 6, 6, 6, 2]), 3, 5);
    const exact = callLiar(s);
    expect(exact.record).toMatchObject({ caller: 'her', count: 3, loser: 'her', bid: { q: 3, face: 5, by: 'you' } });
    expect(exact.state.left).toEqual({ you: 5, her: 4 });
    const short = callLiar(bid(rigged([5, 5, 2, 3, 4], [1, 6, 6, 6, 2]), 4, 5));
    expect(short.record).toMatchObject({ count: 3, loser: 'you' });
  });

  test('callLiar: the loser opens the next round with new dice in their new counts', () => {
    const { state } = callLiar(bid(rigged([2, 2, 2, 2, 2], [3, 3, 3, 3, 3]), 9, 6));
    expect(state).toMatchObject({ round: 2, turn: 'you', opener: 'you', bids: [], left: { you: 4, her: 5 } });
    expect(state.dice.you).toHaveLength(4);
    expect(state.dice.her).toHaveLength(5);
    expect(state.rounds).toHaveLength(1);
  });

  test('callLiar: at 0 dice the game is over and nothing is rolled', () => {
    const s = bid(rigged([2], [3, 3]), 3, 6);
    const r = callLiar(s);
    expect(r.state.over).toBe('her');
    expect(r.state.left).toEqual({ you: 0, her: 2 });
    expect(r.state.dice).toEqual(s.dice);
    expect(() => bid(r.state, 1, 2)).toThrow();
  });

  test('callLiar with no bid throws', () => {
    expect(() => callLiar(newGame(1))).toThrow();
  });
});
