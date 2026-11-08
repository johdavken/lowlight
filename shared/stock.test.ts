import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buyEvent, canBuy, gearRule, gearStat, parseFixer, parseStock, type StockItem } from './stock';

const DECKS = new Set(['dock-slate', 'pocket-deck', 'deaf-meridian', 'stall-build', 'meridian', 'field-deck', 'chrome-deck']);
const item = (id: string, price: number, tier: 1 | 2 | 3 | 4, kind: 'deck' | 'cover' = 'deck'): StockItem => ({ id, kind, price, tier });

describe('fixer stock', () => {
  it('parses the starting stock', () => {
    const r = parseStock(fs.readFileSync('world/gear/stock.md', 'utf8'), DECKS);
    expect(r.problems).toEqual([]);
    expect(r.byPlace['second-socket']).toEqual([item('dock-slate', 300, 1), item('pocket-deck', 600, 2), item('deaf-meridian', 4200, 3)]);
    expect(r.byPlace['the-tilt']).toEqual([item('burner', 500, 2, 'cover')]);
    expect(r.byPlace['under-the-cat']).toEqual([item('burner', 600, 1, 'cover'), item('fall-guy', 1000, 3, 'cover')]);
    // The Spine's fixer at the deck market.
    expect(r.byPlace['deck-market']).toEqual([item('dock-slate', 280, 1), item('burner', 550, 1, 'cover'), item('field-deck', 3900, 2), item('chrome-deck', 5950, 3)]);
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

describe('gear words on the shelf', () => {
  it('a deck: quality, slots, heat and traits; cover is used up', () => {
    expect(gearStat({ kind: 'deck', id: 'chrome-deck', quality: 4, heat: 1, traits: ['hidden', 'chrome'] })).toBe('Q4 · 3 SLOTS · HEAT 1 · HIDDEN · CHROME');
    expect(gearStat({ kind: 'deck', id: 'dock-slate', quality: 1, heat: 0, traits: [] })).toBe('Q1 · 1 SLOT · HEAT 0');
    expect(gearStat({ kind: 'cover', id: 'fall-guy' })).toBe('COVER · USED UP');
  });

  it('the rule: slots, heat unless hidden, each trait; each cover', () => {
    expect(gearRule({ kind: 'deck', id: 'chrome-deck', quality: 4, heat: 1, traits: ['hidden', 'chrome'] })).toBe(
      '3 program slots. Hidden: no deck heat. Chrome: RESIST rolls one more die on a grid check.',
    );
    expect(gearRule({ kind: 'deck', id: 'dock-slate', quality: 1, heat: 0, traits: [] })).toBe('1 program slot. No deck heat.');
    expect(gearRule({ kind: 'cover', id: 'burner' })).toBe("A blown job's rep loss is halved. Used up.");
    expect(gearRule({ kind: 'cover', id: 'fall-guy' })).toBe("A blown job costs no rep; the fixer takes half the job's pay from your sol. Used up.");
  });

  it('every deck and cover sold has a picture in web/public/gear', () => {
    const decks = fs.readFileSync('world/gear/decks.md', 'utf8').match(/^id: .+$/gm)!.map((l) => l.slice(4).trim());
    for (const id of [...decks, 'burner', 'fall-guy']) expect(fs.existsSync(`web/public/gear/${id}.webp`), id).toBe(true);
  });
});
