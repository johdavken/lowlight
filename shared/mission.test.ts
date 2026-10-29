import { describe, expect, it } from 'vitest';
import { foldKit, oddsOf, sixesBetween, type Check } from './mission';
import type { Deck } from './gear';
import { DAY } from './clock';

const HICKS = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const STALL: Deck = { id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'] };
const at = (day: number, hh: number, mm = 0) => (day - 1) * DAY + hh * 60 + mm;
const check = (o: Partial<Check> = {}): Check => ({ stat: 'tech', base: 45, grid: false, crew: [], red: false, mods: [], ...o });

describe('oddsOf', () => {
  it('±7 per stat point and the clamp', () => {
    expect(oddsOf(check(), { stats: HICKS, deck: null, with: 'nix' })).toMatchObject({ stat: 'TECH', chance: 59, noDeck: false });
    expect(oddsOf(check({ base: 90 }), { stats: { ...HICKS, tech: 9 }, deck: null, with: 'nix' }).chance).toBe(95);
    expect(oddsOf(check({ base: 10 }), { stats: { ...HICKS, tech: 1 }, deck: null, with: 'nix' }).chance).toBe(5);
  });
  it('grid adds the deck bonus', () => {
    expect(oddsOf(check({ grid: true }), { stats: HICKS, deck: STALL, with: 'nix' })).toMatchObject({ stat: 'TECH', chance: 74, noDeck: false });
  });
  it('grid with no deck is −25 and noDeck', () => {
    expect(oddsOf(check({ grid: true }), { stats: HICKS, deck: null, with: 'nix' })).toMatchObject({ stat: 'TECH', chance: 34, noDeck: true });
  });
  it('crew counts only when with', () => {
    const c = check({ crew: [{ contact: 'ember', bonus: 15 }] });
    expect(oddsOf(c, { stats: HICKS, deck: null, with: 'ember' }).chance).toBe(74);
    expect(oddsOf(c, { stats: HICKS, deck: null, with: 'hicks' }).chance).toBe(59);
  });
});

describe('sixesBetween', () => {
  it('counts the 06:00s in (a, b]', () => {
    expect(sixesBetween(at(1, 20), at(2, 5, 59))).toBe(0);
    expect(sixesBetween(at(1, 20), at(2, 6))).toBe(1);
    expect(sixesBetween(at(1, 20), at(4, 7))).toBe(3);
    expect(sixesBetween(at(2, 6), at(2, 7))).toBe(0);
  });
});

describe('foldKit', () => {
  const start = { deck: 'stall-build', edgeMax: 2, from: at(1, 20) };
  it('no events: the start deck, sol 0, heat 0, full EDGE', () => {
    expect(foldKit(start, [], at(1, 21))).toMatchObject({ deck: 'stall-build', sol: 0, heat: {}, edgeLeft: 2, edgeMax: 2 });
  });
  it('sums sol, clamps heat, applies deck changes and edge spends (never below 0)', () => {
    const k = foldKit(start, [
      { at: at(1, 21), sol: 400, heat: 6 },
      { at: at(1, 22), heat: 7, deck: null },
      { at: at(1, 22), edge: -1 },
      { at: at(1, 23), edge: -1 },
      { at: at(1, 23), edge: -1, deck: 'meridian' },
    ], at(1, 23, 30));
    expect(k).toMatchObject({ deck: 'meridian', sol: 400, heat: { unknown: 10 }, edgeLeft: 0, edgeMax: 2 });
    expect(foldKit(start, [{ at: at(1, 21), heat: -3 }], at(1, 22)).heat.unknown).toBe(0);
  });
  it('cools by each 06:00 crossed, and refills EDGE', () => {
    const k = foldKit(start, [{ at: at(1, 22), heat: 5 }, { at: at(1, 22), edge: -1 }], at(4, 7));
    expect(k.heat.unknown).toBe(2);
    expect(k.edgeLeft).toBe(2);
  });
  it('events out of order fold by time', () => {
    const k = foldKit(start, [{ at: at(2, 7), heat: 1 }, { at: at(1, 22), heat: 5 }], at(2, 8));
    expect(k.heat.unknown).toBe(5); // 5, cooled to 4 at Day 2 06:00, then +1
  });
});
