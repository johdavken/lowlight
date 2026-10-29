import { describe, expect, it } from 'vitest';
import { crackTries, foldKit, heatIn, hottest, oddsOf, outcomeTier, repDelta, repTier, TIER_NAMES, type Check, type KitEvent } from './mission';
import type { Deck } from './gear';
import { DAY } from './clock';
import { DEFAULT_STATS } from './stats';
import type { CondCtx } from './quests';

const HICKS = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const STALL: Deck = { id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'] };
const at = (day: number, hh: number, mm = 0) => (day - 1) * DAY + hh * 60 + mm;
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: 'mid', warmth: 'mid', with: 'ember', stats: HICKS, ...o });

describe('oddsOf with modifiers', () => {
  it('why order and deltas', () => {
    const check: Check = { stat: 'tech', base: 45, grid: true, red: false, crew: [{ contact: 'ember', bonus: 15 }], mods: [{ when: [{ kind: 'set', name: 'cased' }], delta: 15, label: 'you cased the door' }] };
    const o = oddsOf(check, { stats: HICKS, deck: STALL, with: 'ember', alarm: 1, ctx: ctx({ flags: { cased: 'yes' } }), temper: 'easy' });
    expect(o.why).toEqual(['GRID', 'STALL BUILD +15', 'EMBER +15', '+15 YOU CASED THE DOOR', 'EASY MARK +10', 'ALARM 1 −10']);
    expect(o.chance).toBe(95);
    const bare = oddsOf({ ...check, crew: [], mods: [] }, { stats: HICKS, deck: null, with: 'nix', alarm: 2, ctx: ctx(), temper: 'hard' });
    expect(bare.why).toEqual(['GRID', 'NO DECK −25', 'HARD MARK −10', 'ALARM 2 −20']);
    expect(bare.chance).toBe(Math.max(5, 45 + 14 - 25 - 10 - 20));
  });
  it('a modifier whose condition fails is left out', () => {
    const check: Check = { stat: 'cool', base: 50, grid: false, red: false, crew: [], mods: [{ when: [{ kind: 'set', name: 'cased' }], delta: 15, label: 'cased' }] };
    expect(oddsOf(check, { stats: DEFAULT_STATS, deck: null, with: 'x', ctx: ctx() }).why).toEqual([]);
  });
});

describe('outcome tier and rep', () => {
  it('outcomeTier', () => {
    expect(outcomeTier({ take: 'full', blown: true, alarm: 0 })).toBe('blown');
    expect(outcomeTier({ take: 'none', blown: false, alarm: 0 })).toBe('blown');
    expect(outcomeTier({ take: 'part', blown: false, alarm: 0 })).toBe('messy');
    expect(outcomeTier({ take: 'full', blown: false, alarm: 2 })).toBe('messy');
    expect(outcomeTier({ take: 'full', blown: false, alarm: 1 })).toBe('clean');
  });
  it('repDelta', () => {
    expect([repDelta(1, 'clean'), repDelta(1, 'messy'), repDelta(1, 'blown')]).toEqual([6, 2, -10]);
    expect([repDelta(3, 'clean'), repDelta(3, 'blown')]).toEqual([8, -14]);
  });
  it('repTier boundaries and names', () => {
    expect([0, 19, 20, 44, 45, 74, 75, 100].map(repTier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(TIER_NAMES).toEqual(['NOBODY', 'KNOWN', 'TRUSTED', 'A NAME']);
  });
});

describe('the kit per district', () => {
  const start = { deck: 'stall-build', edgeMax: 2, from: at(1, 20) };
  it('rep per district, clamped', () => {
    const k = foldKit(start, [
      { at: at(1, 21), rep: { district: 'karasu', delta: 60 } },
      { at: at(1, 21), rep: { district: 'karasu', delta: 60 } },
      { at: at(1, 21), rep: { district: 'velvet', delta: -5 } },
    ], at(1, 22));
    expect(k.rep).toEqual({ karasu: 100, velvet: 0 });
  });
  it('heat per district cools by the rep tier there', () => {
    const k = foldKit(start, [
      { at: at(1, 21), rep: { district: 'karasu', delta: 50 } },
      { at: at(1, 21), heat: 6, district: 'karasu' },
      { at: at(1, 21), heat: 6, district: 'velvet' },
    ], at(2, 7));
    expect(heatIn(k, 'karasu')).toBe(3);
    expect(heatIn(k, 'velvet')).toBe(5);
    expect(heatIn(k, 'tidal')).toBe(0);
    expect(hottest(k)).toEqual({ district: 'velvet', heat: 5 });
  });
  it('cover counts add and spend, never below 0', () => {
    const k = foldKit(start, [
      { at: at(1, 21), cover: { id: 'burner', delta: 1 } },
      { at: at(1, 22), cover: { id: 'burner', delta: -1 } },
      { at: at(1, 22), cover: { id: 'fall-guy', delta: -1 } },
    ], at(1, 23));
    expect(k.cover).toEqual({ burner: 0, 'fall-guy': 0 });
  });
  it('foldKit migrates district-less heat', () => {
    const old: KitEvent = { at: at(1, 21), heat: 2 };
    const k = foldKit(start, [old], at(1, 22), { districtOf: () => 'karasu' });
    expect(heatIn(k, 'karasu')).toBe(2);
    expect(heatIn(foldKit(start, [old], at(1, 22)), 'unknown')).toBe(2);
  });
});

describe('crackTries', () => {
  it('from TECH, ALARM, deck and modifiers', () => {
    expect(crackTries({ tech: 7, alarm: 0, hasDeck: true, mods: 0 })).toBe(5);
    expect(crackTries({ tech: 3, alarm: 2, hasDeck: false, mods: 0 })).toBe(1);
  });
  it('tries never below 1', () => {
    expect(crackTries({ tech: 5, alarm: 0, hasDeck: true, mods: -9 })).toBe(1);
  });
});

describe('oddsOf extra (crew spec §2)', () => {
  it('adds each extra after the modifiers, named in why', () => {
    const check: Check = { stat: 'cool', base: 50, grid: false, crew: [], red: false, mods: [] };
    const o = oddsOf(check, { stats: { body: 5, reflex: 5, tech: 5, cool: 5, wits: 5, edge: 5 }, deck: null, with: 'nix', extra: [{ delta: 10, label: 'CASED' }] });
    expect(o.chance).toBe(60);
    expect(o.why).toEqual(['CASED +10']);
  });
});
