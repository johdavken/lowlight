import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buyEvent, canBuy, parseFixer, parseStock, type StockItem } from './stock';

const DECKS = new Set(['dock-slate', 'pocket-deck', 'deaf-meridian', 'stall-build', 'meridian', 'field-deck', 'chrome-deck']);
const item = (id: string, price: number, tier: 1 | 2 | 3 | 4, kind: 'deck' | 'cover' = 'deck'): StockItem => ({ id, kind, price, tier });

describe('fixer stock', () => {
  it('parses the starting stock', () => {
    const r = parseStock(fs.readFileSync('world/gear/stock.md', 'utf8'), DECKS);
    expect(r.problems).toEqual([]);
    expect(r.byPlace['second-socket']).toEqual([item('dock-slate', 300, 1), item('pocket-deck', 600, 2), item('deaf-meridian', 1400, 3)]);
    expect(r.byPlace['the-tilt']).toEqual([item('burner', 500, 2, 'cover')]);
    expect(r.byPlace['under-the-cat']).toEqual([item('burner', 600, 1, 'cover'), item('fall-guy', 1000, 3, 'cover')]);
    // The Spine's fixer at the deck market.
    expect(r.byPlace['deck-market']).toEqual([item('dock-slate', 280, 1), item('burner', 550, 1, 'cover'), item('field-deck', 1300, 2), item('chrome-deck', 1700, 3)]);
  });
  it('an unknown id, a bad price or a bad tier is a problem, and that line is skipped', () => {
    for (const bad of ['golden-deck · 300 · 1', 'burner · lots · 1', 'burner · 300 · 7']) {
      const r = parseStock(`---\nplace: x\nitems:\n  - ${bad}\n  - burner · 300 · 1\n---\n`, DECKS);
      expect(r.problems, bad).toHaveLength(1);
      expect(r.byPlace.x).toEqual([item('burner', 300, 1, 'cover')]);
    }
  });
  it('buying a deck carries it and keeps the old one (no trade-in)', () => {
    expect(buyEvent({ item: item('deaf-meridian', 1400, 3), at: 99 })).toEqual({ at: 99, sol: -1400, deck: 'deaf-meridian', keep: true });
  });
  it('parseFixer: a deck bought before decks were kept traded the old one in; new buys and swaps keep it', () => {
    const v = JSON.stringify([
      { at: 1, sol: -1325, deck: 'deaf-meridian' },
      { at: 2, sol: -600, deck: 'pocket-deck', keep: true },
      { at: 3, deck: 'deaf-meridian', carry: true },
      { at: 4, sol: -500, cover: { id: 'burner', delta: 1 } },
    ]);
    expect(parseFixer(v)).toEqual([
      { at: 1, sol: -1325, deck: 'deaf-meridian', trade: true },
      { at: 2, sol: -600, deck: 'pocket-deck', keep: true },
      { at: 3, deck: 'deaf-meridian', carry: true },
      { at: 4, sol: -500, cover: { id: 'burner', delta: 1 } },
    ]);
  });
  it('buying cover adds one', () => {
    expect(buyEvent({ item: item('burner', 500, 2, 'cover'), at: 5 })).toEqual({ at: 5, sol: -500, cover: { id: 'burner', delta: 1 } });
  });
  it('canBuy: a deck you own is owned', () => {
    expect(canBuy({ item: item('dock-slate', 280, 1), sol: 9999, tier: 4, owned: ['dock-slate'] })).toBe('owned');
    expect(canBuy({ item: item('burner', 500, 1, 'cover'), sol: 9999, tier: 4, owned: ['burner'] })).toBe('ok');
  });
  it('canBuy: locked, short, ok', () => {
    expect(canBuy({ item: item('burner', 500, 2, 'cover'), sol: 9999, tier: 1 })).toBe('locked');
    expect(canBuy({ item: item('burner', 500, 2, 'cover'), sol: 499, tier: 2 })).toBe('short');
    expect(canBuy({ item: item('burner', 500, 2, 'cover'), sol: 500, tier: 3 })).toBe('ok');
  });
});
