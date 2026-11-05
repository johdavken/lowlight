import { nerveMax } from './stats';
import { describe, expect, it } from 'vitest';
import { crackTries, foldKit, heatIn, hottest, outcomeTier, repDelta, repTier, TIER_NAMES, type Check, type KitEvent } from './mission';
import type { Deck } from './gear';
import { DAY } from './clock';
import { DEFAULT_STATS } from './stats';
import type { CondCtx } from './quests';

const HICKS = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const STALL: Deck = { id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: ['fragile'] };
const at = (day: number, hh: number, mm = 0) => (day - 1) * DAY + hh * 60 + mm;
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: 'mid', warmth: 'mid', with: 'ember', stats: HICKS, ...o });

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
  const start = { deck: 'stall-build', nerveMax: 2, from: at(1, 20) };
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

describe('NERVE (the table spec §3)', () => {
  const start = { deck: null, nerveMax: 5, from: at(1, 20) };
  it('nerveMax: edge 4 → 5, edge 5 → 6, edge 1 → 4', () => {
    expect([4, 5, 1].map((edge) => nerveMax({ ...HICKS, edge }))).toEqual([5, 6, 4]);
  });
  it('foldKit spends nerve events and refills at 06:00', () => {
    expect(foldKit(start, [{ at: at(1, 21), nerve: -2 }], at(1, 22))).toMatchObject({ nerveLeft: 3, nerveMax: 5, nerveGone: false });
    expect(foldKit(start, [{ at: at(1, 21), nerve: -2 }], at(2, 7)).nerveLeft).toBe(5);
  });
  it('a lift ends NERVE GONE; NERVE alone leaves it on; a later 0 brings it back', () => {
    const ev = [{ at: at(1, 21), nerve: -5 }, { at: at(1, 22), nerve: 2, lift: true as const }];
    expect(foldKit(start, ev, at(1, 23))).toMatchObject({ nerveLeft: 2, nerveGone: false });
    expect(foldKit(start, [ev[0], { at: at(1, 22), nerve: 2 }], at(1, 23))).toMatchObject({ nerveLeft: 2, nerveGone: true });
    expect(foldKit(start, [...ev, { at: at(1, 22), nerve: -2 }], at(1, 23))).toMatchObject({ nerveLeft: 0, nerveGone: true });
  });
  it('nerveGone turns on at 0 and off at the next 06:00', () => {
    const ev = [{ at: at(1, 21), nerve: -2 }, { at: at(1, 22), nerve: -3 }];
    expect(foldKit(start, ev, at(1, 23))).toMatchObject({ nerveLeft: 0, nerveGone: true });
    expect(foldKit(start, ev, at(2, 7))).toMatchObject({ nerveLeft: 5, nerveGone: false });
  });
  it('a legacy edge: -1 event spends 1 nerve', () => {
    expect(foldKit(start, [{ at: at(1, 21), edge: -1 }], at(1, 22)).nerveLeft).toBe(4);
  });
});
