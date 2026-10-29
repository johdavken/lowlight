import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buyEvent, canBuy, parseStock, type StockItem } from './stock';

const DECKS = new Set(['dock-slate', 'pocket-deck', 'deaf-meridian', 'stall-build', 'meridian']);
const item = (id: string, price: number, tier: 1 | 2 | 3 | 4, kind: 'deck' | 'cover' = 'deck'): StockItem => ({ id, kind, price, tier });

describe('fixer stock', () => {
  it('parses the starting stock', () => {
    const r = parseStock(fs.readFileSync('world/gear/stock.md', 'utf8'), DECKS);
    expect(r.problems).toEqual([]);
    expect(r.byPlace['second-socket']).toEqual([item('dock-slate', 300, 1), item('pocket-deck', 600, 2), item('deaf-meridian', 1400, 3)]);
    expect(r.byPlace['the-tilt']).toEqual([item('burner', 500, 2, 'cover')]);
    expect(r.byPlace['under-the-cat']).toEqual([item('burner', 600, 1, 'cover'), item('fall-guy', 1000, 3, 'cover')]);
  });
  it('an unknown id, a bad price or a bad tier is a problem, and that line is skipped', () => {
    for (const bad of ['golden-deck · 300 · 1', 'burner · lots · 1', 'burner · 300 · 7']) {
      const r = parseStock(`---\nplace: x\nitems:\n  - ${bad}\n  - burner · 300 · 1\n---\n`, DECKS);
      expect(r.problems, bad).toHaveLength(1);
      expect(r.byPlace.x).toEqual([item('burner', 300, 1, 'cover')]);
    }
  });
  it('buying a deck trades the old one in at 25% of its price here, else of 300', () => {
    const stock = [item('pocket-deck', 600, 2), item('deaf-meridian', 1400, 3)];
    expect(buyEvent({ item: stock[1], at: 99, current: 'pocket-deck', placeStock: stock })).toEqual({ at: 99, sol: -1400 + 150, deck: 'deaf-meridian' });
    expect(buyEvent({ item: stock[1], at: 99, current: 'stall-build', placeStock: stock })).toEqual({ at: 99, sol: -1400 + 75, deck: 'deaf-meridian' });
    expect(buyEvent({ item: stock[1], at: 99, current: null, placeStock: stock })).toEqual({ at: 99, sol: -1400, deck: 'deaf-meridian' });
  });
  it('buying cover adds one', () => {
    expect(buyEvent({ item: item('burner', 500, 2, 'cover'), at: 5, current: null, placeStock: [] })).toEqual({ at: 5, sol: -500, cover: { id: 'burner', delta: 1 } });
  });
  it('canBuy: locked, short, ok', () => {
    expect(canBuy({ item: item('burner', 500, 2, 'cover'), sol: 9999, tier: 1 })).toBe('locked');
    expect(canBuy({ item: item('burner', 500, 2, 'cover'), sol: 499, tier: 2 })).toBe('short');
    expect(canBuy({ item: item('burner', 500, 2, 'cover'), sol: 500, tier: 3 })).toBe('ok');
  });
});
