import { describe, expect, it } from 'vitest';
import { normalizeKeys } from './note-keys';

describe('normalizeKeys', () => {
  it('trims, dedupes case-insensitively, caps at 4 and 40 chars', () => {
    expect(normalizeKeys([' Teo ', 'teo', 'debt', 'Mother Rot', 'x'.repeat(41), 'stall', 'fifth'])).toEqual(['Teo', 'debt', 'Mother Rot', 'stall']);
  });
  it('drops stopword keys and keys under 3 letters', () => {
    expect(normalizeKeys(['it', 'the', 'ok', 'Hae', 'THEM'])).toEqual(['Hae']);
  });
  it('non-arrays and non-strings give []', () => {
    expect(normalizeKeys('Teo')).toEqual([]);
    expect(normalizeKeys([3, null])).toEqual([]);
    expect(normalizeKeys(undefined)).toEqual([]);
  });
});

describe('normalizeKeys, final review I6', () => {
  it('drops everyday words', () => {
    expect(normalizeKeys(['was', 'what', 'here', 'your', 'know', 'tonight', 'valve'])).toEqual(['valve']);
  });
  it('drops the names it is told to', () => {
    expect(normalizeKeys(['Nix', 'hicks', 'Teo'], ['Nix', 'Hicks'])).toEqual(['Teo']);
  });
});
