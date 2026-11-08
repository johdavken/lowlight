import { outcomeTier, endHeat } from './mission';
import { describe, expect, it } from 'vitest';
import { foldKit, sixesBetween, type Check } from './mission';
import type { Deck } from './gear';
import { DAY } from './clock';

const HICKS = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const STALL: Deck = { id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: ['fragile'] };
const at = (day: number, hh: number, mm = 0) => (day - 1) * DAY + hh * 60 + mm;
const check = (o: Partial<Check> = {}): Check => ({ stat: 'tech', base: 45, grid: false, crew: [], red: false, mods: [], ...o });

describe('sixesBetween', () => {
  it('counts the 06:00s in (a, b]', () => {
    expect(sixesBetween(at(1, 20), at(2, 5, 59))).toBe(0);
    expect(sixesBetween(at(1, 20), at(2, 6))).toBe(1);
    expect(sixesBetween(at(1, 20), at(4, 7))).toBe(3);
    expect(sixesBetween(at(2, 6), at(2, 7))).toBe(0);
  });
});

describe('foldKit', () => {
  const start = { deck: 'stall-build', nerveMax: 2, from: at(1, 20) };
  it('programs: the starter owned, a buy adds one, foils count up and down (owned programs plan)', () => {
    const k = foldKit({ ...start, programs: ['firewall', 'solvent'] }, [
      { at: at(1, 21), sol: 500 },
      { at: at(1, 22), sol: -200, program: { id: 'leech' } },
      { at: at(1, 22), program: { id: 'leech' } },
      { at: at(1, 23), program: { id: 'spike', foil: 1 } },
      { at: at(1, 23), program: { id: 'spike', foil: 1 } },
      { at: at(2, 1), program: { id: 'spike', foil: -1 } },
      { at: at(2, 2), program: { id: 'voicebox', foil: -1 } },
    ], at(2, 3));
    expect(k.programs).toEqual({ owned: ['firewall', 'solvent', 'leech'], foil: { spike: 1, voicebox: 0 } });
    expect(foldKit(start, [], at(1, 21)).programs).toEqual({ owned: [], foil: {} });
  });
  it('no events: the start deck, sol 0, heat 0, full EDGE', () => {
    expect(foldKit(start, [], at(1, 21))).toMatchObject({ deck: 'stall-build', sol: 0, heat: {}, nerveLeft: 2, nerveMax: 2 });
  });
  it('sums sol, clamps heat, applies deck changes and edge spends (never below 0)', () => {
    const k = foldKit(start, [
      { at: at(1, 21), sol: 400, heat: 6 },
      { at: at(1, 22), heat: 7, deck: null },
      { at: at(1, 22), edge: -1 },
      { at: at(1, 23), edge: -1 },
      { at: at(1, 23), edge: -1, deck: 'meridian' },
    ], at(1, 23, 30));
    expect(k).toMatchObject({ deck: 'meridian', sol: 400, heat: { unknown: 10 }, nerveLeft: 0, nerveMax: 2 });
    expect(foldKit(start, [{ at: at(1, 21), heat: -3 }], at(1, 22)).heat.unknown).toBe(0);
  });
  it('keeps every deck you get: owned grows, carrying one you own swaps, a lost deck leaves', () => {
    const k = foldKit(start, [
      { at: at(1, 21), deck: 'field-deck' },
      { at: at(1, 22), deck: 'stall-build' },
    ], at(1, 23));
    expect(k).toMatchObject({ deck: 'stall-build', owned: ['stall-build', 'field-deck'] });
    // A deck that dies (deck: null) leaves with the one carried; `lose` takes one you own without carrying it.
    expect(foldKit(start, [{ at: at(1, 21), deck: 'field-deck' }, { at: at(1, 22), deck: null }], at(1, 23))).toMatchObject({ deck: null, owned: ['stall-build'] });
    expect(foldKit(start, [{ at: at(1, 21), deck: 'field-deck' }, { at: at(1, 22), deck: 'stall-build', lose: ['field-deck'] }], at(1, 23))).toMatchObject({ deck: 'stall-build', owned: ['stall-build'] });
    // Losing the carried deck by name leaves you carrying none.
    expect(foldKit(start, [{ at: at(1, 21), lose: ['stall-build'] }], at(1, 23))).toMatchObject({ deck: null, owned: [] });
    expect(foldKit({ ...start, deck: null }, [], at(1, 21)).owned).toEqual([]);
  });
  it('a carry of a deck you no longer own does nothing; a death names its deck, so a same-minute carry can\'t move it (review I2)', () => {
    const two = { deck: 'dock-slate', nerveMax: 2, from: at(1, 20) };
    const own = { at: at(1, 21), deck: 'stall-build' };
    const back = { at: at(1, 21), deck: 'dock-slate', carry: true as const };
    const died = { at: at(1, 22), deck: null, lose: ['stall-build'] };
    const carry = { at: at(1, 22), deck: 'stall-build', carry: true as const };
    // The death folds before the carry at the same minute: the dock slate stays carried and owned.
    expect(foldKit(two, [own, back, died, carry], at(1, 23))).toMatchObject({ deck: 'dock-slate', owned: ['dock-slate'] });
    // The carry first (as it was played): the stall build dies in hand.
    expect(foldKit(two, [own, back, carry, died], at(1, 23))).toMatchObject({ deck: null, owned: ['dock-slate'] });
  });
  it('a trade (an old save\'s purchase) drops the deck carried as the new one comes', () => {
    expect(foldKit(start, [{ at: at(1, 21), deck: 'meridian', trade: true }], at(1, 23))).toMatchObject({ deck: 'meridian', owned: ['meridian'] });
    expect(foldKit({ ...start, deck: null }, [{ at: at(1, 21), deck: 'meridian', trade: true }], at(1, 23))).toMatchObject({ deck: 'meridian', owned: ['meridian'] });
  });
  it('cools by each 06:00 crossed, and refills EDGE', () => {
    const k = foldKit(start, [{ at: at(1, 22), heat: 5 }, { at: at(1, 22), edge: -1 }], at(4, 7));
    expect(k.heat.unknown).toBe(2);
    expect(k.nerveLeft).toBe(2);
  });
  it('events out of order fold by time', () => {
    const k = foldKit(start, [{ at: at(2, 7), heat: 1 }, { at: at(1, 22), heat: 5 }], at(2, 8));
    expect(k.heat.unknown).toBe(5); // 5, cooled to 4 at Day 2 06:00, then +1
  });
});

describe('endHeat (tier template spec §2)', () => {
  const at = (o: Partial<Parameters<typeof endHeat>[0]>) => endHeat({ alarm: 0, blown: false, deckHeat: 0, scrubbed: false, ...o });
  it('is the ALARM you leave with', () => expect(at({ alarm: 3 })).toBe(3));
  it('a blown job adds at least 2', () => expect([at({ blown: true }), at({ blown: true, alarm: 3 })]).toEqual([2, 3]));
  it('deck heat adds, SCRUB takes 1 off, floor 0', () => expect([at({ alarm: 1, deckHeat: 2 }), at({ scrubbed: true }), at({ alarm: 2, scrubbed: true })]).toEqual([3, 0, 1]));
});

describe('Paid Off and the grade (tier 3 beat play spec §2)', () => {
  it('a full take at ALARM 3 is clean', () => expect(outcomeTier({ take: 'full', blown: false, alarm: 3, paidOff: true })).toBe('clean'));
  it('a part take stays messy', () => expect(outcomeTier({ take: 'part', blown: false, alarm: 3, paidOff: true })).toBe('messy'));
  it('blown stays blown', () => expect(outcomeTier({ take: 'full', blown: true, alarm: 3, paidOff: true })).toBe('blown'));
});

describe('the pocket deck everyone owns', () => {
  const start = { nerveMax: 3, from: 0, pocket: 'pocket-deck' };
  it('sits beside the deck you start with, which stays carried', () => {
    const k = foldKit({ ...start, deck: 'field-deck' }, [], 0);
    expect(k.deck).toBe('field-deck');
    expect(k.owned).toEqual(['field-deck', 'pocket-deck']);
  });
  it('is carried by someone who starts with nothing else, and listed once by someone who starts with it', () => {
    expect(foldKit({ ...start, deck: null }, [], 0)).toMatchObject({ deck: 'pocket-deck', owned: ['pocket-deck'] });
    expect(foldKit({ ...start, deck: 'pocket-deck' }, [], 0).owned).toEqual(['pocket-deck']);
  });
  it('CARRY swaps to it, and losing the other deck leaves it', () => {
    expect(foldKit({ ...start, deck: 'field-deck' }, [{ at: 0, deck: 'pocket-deck', carry: true }], 0).deck).toBe('pocket-deck');
    expect(foldKit({ ...start, deck: 'field-deck' }, [{ at: 0, deck: null }], 0)).toMatchObject({ deck: null, owned: ['pocket-deck'] });
  });
});
