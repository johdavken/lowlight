import { describe, expect, it } from 'vitest';
import { COSTS, dealCosts, FORCED_FIRST, firstCost, picksFor, resistPrice } from './costs';

const all = { take: true, next: true, alarm: true };

describe('the costs (roll lifecycle spec §1.1–1.3)', () => {
  it('five costs with their tags', () => {
    expect(Object.fromEntries(Object.entries(COSTS).map(([k, v]) => [k, v.tag]))).toEqual({ alarm: 'ALARM +1', heat: 'HEAT +1', worse: 'NEXT ROLL WORSE', small: 'NEXT ROLL SMALL', take: 'TAKE −1' });
  });

  it('dealCosts: three different, the same for a seed, seeds differ', () => {
    const a = dealCosts('run|door|talk|costs', all);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(dealCosts('run|door|talk|costs', all)).toEqual(a);
    const seen = new Set(Array.from({ length: 30 }, (_, i) => dealCosts(`s${i}`, all).join()));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('dealCosts: only costs that can bite', () => {
    for (let i = 0; i < 30; i++) {
      const d = dealCosts(`s${i}`, { take: false, next: false, alarm: true });
      expect(d).toEqual(['alarm']);
    }
    expect(dealCosts('x', { take: false, next: false, alarm: true })).toEqual(['alarm']);
    expect(dealCosts('x', { take: false, next: false, alarm: false })).toEqual([]);
    for (let i = 0; i < 30; i++) expect(dealCosts(`s${i}`, { ...all, next: false })).not.toContain('worse');
  });

  it('picksFor: by position and result, never more than dealt', () => {
    expect([picksFor('cost', 'dark', 3), picksFor('miss', 'dark', 3)]).toEqual([0, 1]);
    expect([picksFor('cost', 'open', 3), picksFor('miss', 'open', 3)]).toEqual([1, 2]);
    expect([picksFor('cost', 'wire', 3), picksFor('miss', 'wire', 3)]).toEqual([2, 2]);
    expect([picksFor('clean', 'wire', 3), picksFor('crit', 'wire', 3)]).toEqual([0, 0]);
    expect(picksFor('miss', 'wire', 1)).toBe(1);
  });

  it('resistPrice: 6 costs 0, 4–5 one, 1–3 two, two 6s give one back', () => {
    expect([resistPrice([6, 2]), resistPrice([5]), resistPrice([4, 1]), resistPrice([3, 1]), resistPrice([1]), resistPrice([6, 6])]).toEqual([0, 1, 1, 2, 2, -1]);
  });
});

describe('HEAT +1 (tier template spec §2)', () => {
  it('never deals it, and deals three of the four', () => {
    for (let i = 0; i < 50; i++) {
      const d = dealCosts(`seed-${i}`, { take: true, next: true, alarm: true });
      expect(d).toHaveLength(3);
      expect(d).not.toContain('heat');
    }
  });
});

describe('trouble has a shape (approach shapes spec §1)', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => `s${i}`);

  it("dealCosts: an approach's never cost isn't dealt, and the three left are", () => {
    for (const [approach, never] of [['quiet', 'take'], ['smooth', 'small'], ['hard', 'alarm']] as const)
      for (const s of seeds) {
        const d = dealCosts(s, all, approach);
        expect(d).not.toContain(never);
        expect(new Set(d).size).toBe(3);
      }
  });

  it.runIf(FORCED_FIRST)('dealCosts: the first-pick cost leads', () => {
    for (const [approach, first] of [['quiet', 'alarm'], ['smooth', 'worse'], ['hard', 'take']] as const) for (const s of seeds) expect(dealCosts(s, all, approach)[0]).toBe(first);
  });

  it('dealCosts: no approach deals as before', () => {
    expect(dealCosts('run|door|talk|costs', all)).toEqual(['small', 'worse', 'alarm']);
    for (const s of seeds) expect(dealCosts(s, all, null)).toEqual(dealCosts(s, all));
  });

  it('dealCosts: only what can bite, whatever the approach', () => {
    expect(dealCosts('x', { take: false, next: false, alarm: true }, 'hard')).toEqual([]);
    expect(dealCosts('x', { take: false, next: false, alarm: true }, 'quiet')).toEqual(['alarm']);
    for (const s of seeds) expect(dealCosts(s, { ...all, next: false }, 'smooth')).not.toContain('worse');
  });

  it.skipIf(FORCED_FIRST)('firstCost: every pick is free under removal', () => {
    expect(firstCost('quiet', ['worse', 'alarm'])).toBeNull();
    expect(firstCost('hard', ['take', 'worse'])).toBeNull();
  });

  it.runIf(FORCED_FIRST)("firstCost: the approach's cost when it's dealt, else null", () => {
    expect(firstCost('quiet', ['worse', 'alarm'])).toBe('alarm');
    expect(firstCost('hard', ['small', 'worse'])).toBeNull();
    expect(firstCost(null, ['alarm'])).toBeNull();
    expect(firstCost(undefined, ['alarm'])).toBeNull();
  });
});
