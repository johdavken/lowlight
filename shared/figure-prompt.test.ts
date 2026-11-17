import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPRESSION, DEFAULT_POSE, emptyFields, figurePrompt, prefillFields } from './figure-prompt';

describe('figurePrompt', () => {
  it('holds the locked lines and every filled field, in the pronoun given', () => {
    const p = figurePrompt({ ...emptyFields(), age: 'late thirties', hair: 'shaved, grey stubble', clothes: 'a long oilskin coat', extra: 'a limp on the left of the picture' }, 'he');
    for (const s of ['Flat chroma-key green background', 'first attached image', 'second attached image', 'no fanservice', 'a man', 'late thirties', 'shaved, grey stubble', 'a long oilskin coat', 'a limp on the left of the picture']) expect(p).toContain(s);
  });
  it('the start figure gives pose and framing only, not build', () => {
    const p = figurePrompt(emptyFields(), 'they');
    expect(p).toContain('gives pose and framing only');
    expect(p).not.toMatch(/gives pose, build/);
    expect(p).not.toContain('grey background');
  });

  it('an empty pose and expression take the cast defaults; nothing reads "undefined" or an empty label', () => {
    const p = figurePrompt(emptyFields(), 'they');
    expect(p).toContain(DEFAULT_POSE);
    expect(p).toContain(DEFAULT_EXPRESSION);
    expect(p).not.toContain('undefined');
    expect(p).not.toMatch(/Hair: \./);
    expect(p).not.toContain('Also:');
  });
});

describe('prefillFields', () => {
  it('puts the description in ANYTHING ELSE, tagline when there is none', () => {
    expect(prefillFields({ description: 'A runner.', tagline: 'T' }).extra).toBe('A runner.');
    expect(prefillFields({ description: '', tagline: 'Tagline.' })).toMatchObject({ extra: 'Tagline.', pose: DEFAULT_POSE, hair: '' });
  });
});
