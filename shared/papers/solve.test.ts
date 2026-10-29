import { describe, expect, test } from 'vitest';
import { valuesFor, type Identity, type Rule } from './rules';
import { analyse, identities, solve, solveWith } from './solve';

const values = valuesFor(['Sable Coast', 'Kessen', 'the Shoals', 'Varna', 'Meridian']);

/** The first night (spec §2.8). */
const truth: Identity = { origin: 'Kessen', district: 'Karasu', trade: 'clinic', age: 'over 40', sponsor: 'a co-op', arrival: 'last week', medical: false, renewal: false };
const rules: Rule[] = [
  { kind: 'if', f: 'age', v: 'over 40', then: { g: 'sponsor', op: 'is', w: 'a co-op' } },
  { kind: 'if', f: 'trade', v: 'clinic', then: { doc: 'medical' } },
  { kind: 'if', f: 'sponsor', v: 'a co-op', then: { doc: 'renewal' } },
];
const looks = ['over 40'];

test('every identity: 5 origins × 5 × 5 × 3 × 4 × 3 × the two extras', () => {
  expect(identities(values)).toHaveLength(18000);
});

describe('the first night', () => {
  test('costs 4 without booth nine', () => {
    expect(solve(truth, rules, looks, values)?.min).toBe(4);
  });
  test('costs 2 with him; the tie between rules 1 and 2 goes to the lowest index', () => {
    expect(solveWith(truth, rules, looks, values, 0)).toMatchObject({ min: 4, minWith: 2, overlook: 1 });
  });
  test('has a trap: dropping the sponsor breaks the over-40 rule', () => {
    expect(analyse(truth, rules, looks, values).traps).toBeGreaterThanOrEqual(1);
  });
});

test('a truth that passes every rule costs nothing', () => {
  expect(solve(truth, [{ kind: 'ban', f: 'district', v: 'Velvet' }], looks, values)?.min).toBe(0);
});

test('rules nobody can pass have no solution', () => {
  const none: Rule[] = (['under 25', '25–40', 'over 40'] as const).map((v) => ({ kind: 'ban', f: 'age', v }));
  expect(solve(truth, none, ['under 25', '25–40', 'over 40'], values)).toBeNull();
});

test('booth nine at a cost is only used when it pays', () => {
  const w = solveWith(truth, rules, looks, values, 3);
  expect(w).toMatchObject({ min: 4, minWith: 4, overlook: null });
});
