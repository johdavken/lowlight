import { describe, expect, it } from 'vitest';
import { darkAt, scheduled, SLOT_STARTS } from './outage';

const at = (day: number, h: number, m = 0) => (day - 1) * 1440 + h * 60 + m;

describe('scheduled outages', () => {
  it('gives the same answer for the same inputs', () => {
    const o = { seed: 'pt-1', district: 'karasu', now: at(2, 23), rate: 0.5 };
    expect(scheduled(o)).toEqual(scheduled(o));
  });

  it('keeps Day 1 lit before 22:00', () => {
    expect(scheduled({ seed: 'a', district: 'karasu', now: at(1, 21, 40), rate: 1 })).toBeNull();
    expect(scheduled({ seed: 'a', district: 'karasu', now: at(1, 22), rate: 1 })).not.toBeNull();
  });

  it('merges adjoining dark slots into one outage', () => {
    let found = false;
    for (let i = 0; i < 1000 && !found; i++) {
      const o = scheduled({ seed: `s${i}`, district: 'marsh', now: at(2, 23, 30), rate: 0.5 });
      const after = scheduled({ seed: `s${i}`, district: 'marsh', now: at(3, 0, 30), rate: 0.5 });
      if (!o || !after) continue;
      found = true;
      expect(after).toEqual(o);
      expect(o.from).toBeLessThanOrEqual(at(2, 22));
      expect(o.to).toBeGreaterThanOrEqual(at(3, 2));
    }
    expect(found).toBe(true);
  });

  it('counts a slot after midnight with the night before', () => {
    expect(scheduled({ seed: 'a', district: 'karasu', now: at(3, 1), rate: 1 })).toEqual({ district: 'karasu', from: 2640, to: 3240, by: 'schedule' });
  });

  it('keeps day hours lit', () => {
    expect(scheduled({ seed: 'a', district: 'karasu', now: at(2, 12), rate: 1 })).toBeNull();
    expect(scheduled({ seed: 'a', district: 'karasu', now: at(2, 6), rate: 1 })).toBeNull();
  });

  it('holds the rate over many nights', () => {
    let dark = 0;
    let n = 0;
    for (let night = 2; night < 402; night++)
      for (const s of SLOT_STARTS) {
        n++;
        const now = (night - 1) * 1440 + s * 60 + 30;
        const o = scheduled({ seed: 'rate', district: 'marsh', now, rate: 0.25 });
        if (o) dark++;
      }
    expect(Math.abs(dark / n - 0.25)).toBeLessThan(0.03);
  });
});

describe('darkAt', () => {
  it('never darkens the Spine or the Ribbon', () => {
    expect(darkAt({ seed: 'a', now: at(2, 23), rates: { spine: 1, ribbon: 1 }, narrated: [] })).toEqual([]);
  });

  it('counts a narrator outage while it runs', () => {
    const narrated = [{ district: 'velvet', from: 2000, to: 2090, by: 'narrator' as const }];
    const dark = (now: number) => darkAt({ seed: 'a', now, rates: {}, narrated }).map((o) => o.district);
    expect(dark(2000)).toEqual(['velvet']);
    expect(dark(2089)).toEqual(['velvet']);
    expect(dark(2090)).toEqual([]);
  });

  it('keeps one outage per district, the earliest', () => {
    const narrated = [{ district: 'karasu', from: at(2, 23), to: at(2, 23) + 90, by: 'narrator' as const }];
    const out = darkAt({ seed: 'a', now: at(2, 23, 30), rates: { karasu: 1 }, narrated });
    expect(out).toHaveLength(1);
    expect(out[0]!.by).toBe('schedule');
  });
});

describe('one blackout per district, however it started (review I2)', () => {
  it("a narrator cut running into a dark slot is one outage, from the cut's start", () => {
    const narrated = [{ district: 'karasu', from: at(1, 21, 30), to: at(1, 23), by: 'narrator' as const, contact: 'nix', row: 'r1' }];
    const span = (now: number) => darkAt({ seed: 'a', now, rates: { karasu: 1 }, narrated })[0];
    expect(span(at(1, 21, 45))!.from).toBe(at(1, 21, 30));
    expect(span(at(1, 23, 30))!.from).toBe(at(1, 21, 30));
    expect(span(at(1, 23, 30))!.to).toBe(at(2, 6));
  });
});

describe('the power lines (blackouts phase 3 §2, §5)', () => {
  it('her line and the narrator line, with the time it went', async () => {
    const { cityLine, narratorPowerLine } = await import('./outage');
    expect(cityLine('Karasu', at(2, 22))).toBe('[city: the power is out across Karasu since 22:00]');
    expect(narratorPowerLine('Karasu', at(3, 1, 30))).toBe('The power is out across Karasu (since 01:30).');
  });
});
