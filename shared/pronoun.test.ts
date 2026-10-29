import { describe, expect, it } from 'vitest';
import { forms, isPronoun, named, PRONOUNS } from './pronoun';

describe('pronouns', () => {
  it('forms: she, he and they', () => {
    expect(forms('she')).toEqual({ she: 'she', her: 'her', hers: 'her', herself: 'herself', is: 'is', has: 'has', s: 's' });
    expect(forms('he')).toEqual({ she: 'he', her: 'him', hers: 'his', herself: 'himself', is: 'is', has: 'has', s: 's' });
    expect(forms('they')).toEqual({ she: 'they', her: 'them', hers: 'their', herself: 'themselves', is: 'are', has: 'have', s: '' });
  });

  it('named: the name with its pronoun, as the models see it', () => {
    expect(named('Mother Rot', 'he')).toBe('Mother Rot (he)');
  });

  it('isPronoun: only she, he and they', () => {
    expect(PRONOUNS).toEqual(['she', 'he', 'they']);
    for (const p of PRONOUNS) expect(isPronoun(p)).toBe(true);
    expect(isPronoun('it')).toBe(false);
    expect(isPronoun(undefined)).toBe(false);
  });
});
