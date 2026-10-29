import { describe, expect, test } from 'vitest';
import { applies, checkPacket, cost, holds, outcome, photoOk, ruleText, valuesFor, type Identity, type Rule } from './rules';

const truth: Identity = { origin: 'Kessen', district: 'Karasu', trade: 'clinic', age: 'over 40', sponsor: 'a co-op', arrival: 'last week', medical: false, renewal: false };

describe('ruleText', () => {
  test.each<[Rule, string]>([
    [{ kind: 'ban', f: 'origin', v: 'Kessen' }, 'No arrivals from Kessen tonight.'],
    [{ kind: 'if', f: 'trade', v: 'clinic', then: { doc: 'medical' } }, 'Clinic workers need a medical slip.'],
    [{ kind: 'if', f: 'district', v: 'Velvet', then: { g: 'sponsor', op: 'is', w: 'a House' } }, 'Permits for Velvet need a House sponsor.'],
    [{ kind: 'if', f: 'trade', v: 'freight', then: { g: 'district', op: 'not', w: 'the Strand' } }, 'Freight crews may not enter the Strand.'],
    [{ kind: 'if', f: 'age', v: 'under 25', then: { g: 'sponsor', op: 'not', w: 'none' } }, 'Anyone under 25 needs a sponsor.'],
    [{ kind: 'if', f: 'district', v: 'Karasu', then: { g: 'trade', op: 'not', w: 'house work' } }, "Permits for Karasu can't be for house work."],
    [{ kind: 'if', f: 'arrival', v: 'older', then: { doc: 'renewal' } }, 'Arrivals older than last week need a renewal stamp.'],
    [{ kind: 'ban', f: 'sponsor', v: 'none' }, 'Every permit needs a sponsor tonight.'],
    [{ kind: 'ban', f: 'trade', v: 'none' }, 'No one without a trade tonight.'],
  ])('%j', (rule, text) => expect(ruleText(rule)).toBe(text));
});

describe('holds and applies', () => {
  const r: Rule = { kind: 'if', f: 'trade', v: 'freight', then: { doc: 'medical' } };
  test('an if-rule whose condition does not match holds and does not apply', () => {
    expect(holds(r, truth)).toBe(true);
    expect(applies(r, truth)).toBe(false);
  });
  test('an if-rule that matches holds only when its consequence does', () => {
    const c: Rule = { kind: 'if', f: 'trade', v: 'clinic', then: { doc: 'medical' } };
    expect(applies(c, truth)).toBe(true);
    expect(holds(c, truth)).toBe(false);
    expect(holds(c, { ...truth, medical: true })).toBe(true);
  });
  test('a ban always applies', () => {
    const b: Rule = { kind: 'ban', f: 'district', v: 'Velvet' };
    expect(applies(b, truth)).toBe(true);
    expect(holds(b, truth)).toBe(true);
    expect(holds(b, { ...truth, district: 'Velvet' })).toBe(false);
  });
});

describe('cost', () => {
  test('a field costs one per document it is on', () => {
    expect(cost({ ...truth, origin: 'Varna' }, truth)).toBe(2);
    expect(cost({ ...truth, age: '25–40' }, truth)).toBe(1);
  });
  test('the sponsor letter follows the sponsor', () => {
    const none = { ...truth, sponsor: 'none' };
    expect(cost({ ...none, sponsor: 'a House' }, none)).toBe(3);
    expect(cost({ ...truth, sponsor: 'a House' }, truth)).toBe(2);
    expect(cost({ ...truth, sponsor: 'none' }, truth)).toBe(1);
  });
  test('a forged extra costs 2; removing a real one is free', () => {
    expect(cost({ ...truth, medical: true }, truth)).toBe(2);
    const held = { ...truth, medical: true };
    expect(cost({ ...held, medical: false }, held)).toBe(0);
  });
});

describe('checkPacket', () => {
  const rules: Rule[] = [
    { kind: 'if', f: 'age', v: 'over 40', then: { g: 'sponsor', op: 'is', w: 'a co-op' } },
    { kind: 'if', f: 'trade', v: 'clinic', then: { doc: 'medical' } },
  ];
  test('standing checks first: the photo, then the letter', () => {
    const c = checkPacket(truth, rules, ['over 40'], null);
    expect(c.map((x) => x.text)).toEqual(['The photo looks over 40.', 'A sponsor letter matches the permit.', 'Anyone over 40 needs a co-op sponsor.', 'Clinic workers need a medical slip.']);
    expect(c.slice(0, 2).every((x) => x.standing)).toBe(true);
  });
  test('no letter line without a sponsor', () => {
    expect(checkPacket({ ...truth, sponsor: 'none' }, [], ['over 40'], null).map((x) => x.text)).toEqual(['The photo looks over 40.']);
  });
  test('the photo line reads the 25–40 band in words, and fails outside looks', () => {
    const c = checkPacket({ ...truth, age: '25–40' }, [], ['over 40'], null);
    expect(c[0]).toMatchObject({ text: 'The photo looks between 25 and 40.', ok: false });
    expect(photoOk({ ...truth, age: '25–40' }, ['25–40', 'over 40'])).toBe(true);
  });
  test('an overlooked rule passes, marked', () => {
    const c = checkPacket(truth, rules, ['over 40'], 1);
    expect(c[3]).toMatchObject({ ok: true, overlooked: true });
    expect(c[2].overlooked).toBe(false);
  });
});

describe('outcome', () => {
  const pass = { text: '', standing: false, applies: true, ok: true, overlooked: false };
  test('any failure turns the client back', () => expect(outcome([pass, { ...pass, ok: false }], 0, 5)).toBe('back'));
  test('at or under the clean line is clean, above it a close call', () => {
    expect(outcome([pass], 4, 4)).toBe('clean');
    expect(outcome([pass], 5, 4)).toBe('close');
  });
});

test('valuesFor puts the origins first and keeps the fixed fields', () => {
  const v = valuesFor(['A', 'B', 'C']);
  expect(v.origin).toEqual(['A', 'B', 'C']);
  expect(v.age).toEqual(['under 25', '25–40', 'over 40']);
  expect(v.sponsor).toEqual(['none', 'a House', 'a co-op', 'a corp']);
});
