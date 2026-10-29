import { describe, expect, it } from 'vitest';
import { capAtWordBoundary, parsePersona, PERSONA_BACKGROUND_MAX, PERSONA_NAME_MAX } from './persona';

describe('parsePersona', () => {
  it('trims and accepts a name with no background', () => {
    expect(parsePersona({ name: '  Vee ' })).toEqual({ name: 'Vee', background: '' });
  });

  it('rejects an empty, too long or multi-line name, a long background, unknown keys and non-objects', () => {
    const bad: unknown[] = [
      { name: '  ' },
      { name: 'x'.repeat(PERSONA_NAME_MAX + 1) },
      { name: 'a\nb' },
      { name: 'V', background: 'x'.repeat(PERSONA_BACKGROUND_MAX + 1) },
      { name: 'V', mode: 'edit' },
      { name: 3 },
      'Vee',
      null,
      [],
    ];
    for (const b of bad) expect(parsePersona(b), JSON.stringify(b)).toBeNull();
  });

  it('accepts the limits exactly', () => {
    expect(parsePersona({ name: 'x'.repeat(40), background: 'y'.repeat(1200) })).not.toBeNull();
  });

  it('keeps newlines in the background', () => {
    expect(parsePersona({ name: 'V', background: ' one\n\ntwo ' })!.background).toBe('one\n\ntwo');
  });
});

describe('capAtWordBoundary', () => {
  it('cuts back to the last whole word', () => {
    expect(capAtWordBoundary('one two three', 9)).toBe('one two');
    expect(capAtWordBoundary('short', 9)).toBe('short');
  });
});

describe("a persona's pronoun (2026-10-12)", () => {
  it('optional: saves from before it still parse; she, he or they only', () => {
    expect(parsePersona({ name: 'Rin', background: '' })).toEqual({ name: 'Rin', background: '' });
    expect(parsePersona({ name: 'Rin', background: '', pronoun: 'they' })).toEqual({ name: 'Rin', background: '', pronoun: 'they' });
    expect(parsePersona({ name: 'Rin', background: '', pronoun: 'it' })).toBeNull();
  });
});
