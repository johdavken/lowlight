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
