import { describe, expect, it } from 'vitest';
import { poolOf } from '../../shared/dice';
import type { Check } from '../../shared/mission';
import { programsOn } from '../src/room/table/preview';
import { parkedLine } from '../src/room/job-moment';

const stats = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const check: Check = { stat: 'tech', base: 50, grid: false, crew: [], red: false, mods: [] };
const who = { stats, deck: null, with: 'x' };

describe('the card agrees with the roll after a press (final review I1)', () => {
  it('a setup left for this roll shows the position the server rolls', () => {
    const p = poolOf(check, { ...who, next: { better: true } });
    expect(p.position).toBe('dark');
    expect(programsOn(p, []).position).toBe('dark');
  });
  it('after NEXT ROLL WORSE too', () => {
    const p = poolOf(check, { ...who, next: { worse: true, better: true } });
    expect(programsOn(p, []).position).toBe(p.position);
  });
  it('a lifting press beside a call', () => {
    const p = poolOf({ ...check, base: 40 }, { ...who, call: { lift: true, dice: 0, label: 'Dez' }, press: { lift: true, dice: 0, label: 'Cross' } });
    expect(p.position).toBe('dark');
    expect(programsOn(p, []).position).toBe('dark');
  });
  it('a marked position program the setup already covers is dropped', () => {
    const p = poolOf(check, { ...who, next: { better: true } });
    expect(programsOn(p, [{ kind: 'position', alarm: 1, load: false }]).ran).toEqual([]);
  });
});

describe('a parked roll says what it lost', () => {
  it('a trade, and a greed miss', () => {
    expect(parkedLine({ kind: 'clean', cost: { alarm: -1, heat: 0 }, lessTake: 1 })).toContain('TAKE −1');
    expect(parkedLine({ kind: 'miss', cost: { alarm: 0, heat: 0 }, missTake: true })).toContain('TAKE −1');
    expect(parkedLine({ kind: 'clean', cost: { alarm: 0, heat: 0 }, missTake: true })).not.toContain('TAKE −1');
  });
});

describe('a foil whose step does nothing still lifts the cut, as the server counts it (owned programs, review)', () => {
  it('a position foil marked in the dark on a holding deck lifts TIER 2 −1', () => {
    const DECK = { id: 'd', name: 'D', quality: 2 as const, heat: 0, traits: [] };
    const foil = { id: 'foil:solvent', name: 'SOLVENT', stat: 'tech' as const, kind: 'position' as const, line: 'x', foil: true as const };
    const dark = { ...check, base: 60 };
    const plain = poolOf(dark, { ...who, deck: DECK, tier: 2, tag: 'fair' });
    const server = poolOf(dark, { ...who, deck: DECK, tier: 2, tag: 'fair', programs: [foil] });
    expect(plain.position).toBe('dark');
    expect(plain.tier?.lifted).toBe(false);
    expect(server.tier?.lifted).toBe(true);
    const card = programsOn(plain, [{ name: 'SOLVENT', kind: 'position', alarm: 0, load: false, foil: true, tier: server.tier }]);
    expect(card.ran).toHaveLength(1);
    expect(card.tier).toEqual(server.tier);
    expect(card.effect).toBe(server.effect);
  });
});
