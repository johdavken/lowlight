import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Character } from '../src/character';
import { capBio, DEFAULT_FACE, firstSentence, resolveProfile, splitBio } from '../src/character-profile';
import type { ProfileSource } from '../src/character-profile';
import { tempDir } from './fixtures/temp-dir';

let dir: string;
let warnings: string[];

beforeEach(() => {
  dir = tempDir('character-profile-');
  warnings = [];
});

const warn = (m: string) => warnings.push(m);

const source = (c: Character, sourceDir = dir): ProfileSource => ({ dir: sourceDir, c });

describe('splitBio', () => {
  it('blank lines split, single newlines join, CRLF same as LF, empties dropped', () => {
    expect(splitBio('A one\nline.\n\n  B two.  \n\n\n')).toEqual(['A one line.', 'B two.']);
    expect(splitBio('A one\r\nline.\r\n\r\nB two.')).toEqual(['A one line.', 'B two.']);
    expect(splitBio(' \n\n \t\n')).toEqual([]);
  });
});

describe('capBio', () => {
  it('keeps whole paragraphs within max (joined by \\n\\n)', () => {
    expect(capBio(['a'.repeat(10), 'b'.repeat(10)], 22)).toEqual({ paras: ['a'.repeat(10), 'b'.repeat(10)], cut: false });
    expect(capBio(['a'.repeat(10), 'b'.repeat(10)], 21)).toEqual({ paras: ['a'.repeat(10)], cut: true });
    expect(capBio(['a'.repeat(30)], 20)).toEqual({ paras: [], cut: true });
  });
});

describe('firstSentence', () => {
  it('up to the first . ! or ? followed by space or end, capped at a word boundary', () => {
    expect(firstSentence('Runs the crew. Production work by day.')).toBe('Runs the crew.');
    expect(firstSentence('no stop here')).toBe('no stop here');
    expect(firstSentence('word '.repeat(30), 80).length).toBeLessThanOrEqual(80);
  });
});

describe('resolveProfile', () => {
  it('all four fields from the own source', () => {
    fs.writeFileSync(path.join(dir, 'bio.md'), 'Runs the crew.\n\nProduction work by day.');
    const c: Character = { tagline: 'Keeps the lights on.', bio: 'bio.md', facts: [{ label: 'Role', value: 'Foreman' }], face: { x: 0.4, y: 0.1 } } as Character;
    const profile = resolveProfile([source(c)], 'fallback description', warn);
    expect(profile).toEqual({
      tagline: 'Keeps the lights on.',
      bio: ['Runs the crew.', 'Production work by day.'],
      facts: [{ label: 'Role', value: 'Foreman' }],
      face: { x: 0.4, y: 0.1 },
    });
    expect(warnings).toEqual([]);
  });

  it('each missing field falls through to the base source (extends)', () => {
    const baseDir = tempDir('character-profile-base-');
    fs.writeFileSync(path.join(baseDir, 'bio.md'), 'Base bio.');
    const base: Character = { tagline: 'Base tagline.', bio: 'bio.md', facts: [{ label: 'Role', value: 'Base role' }], face: { x: 0.3, y: 0.2 } } as Character;
    const own: Character = {} as Character;
    const profile = resolveProfile([source(own), source(base, baseDir)], 'fallback description', warn);
    expect(profile).toEqual({
      tagline: 'Base tagline.',
      bio: ['Base bio.'],
      facts: [{ label: 'Role', value: 'Base role' }],
      face: { x: 0.3, y: 0.2 },
    });
    expect(warnings).toEqual([]);
  });

  it('own field overrides base', () => {
    const baseDir = tempDir('character-profile-base-');
    const base: Character = { tagline: 'Base tagline.' } as Character;
    const own: Character = { tagline: 'Own tagline.' } as Character;
    const profile = resolveProfile([source(own), source(base, baseDir)], 'fallback description', warn);
    expect(profile.tagline).toBe('Own tagline.');
    expect(warnings).toEqual([]);
  });

  it('fallbacks with no fields: tagline = firstSentence(description), bio = [description], facts = [], face = DEFAULT_FACE', () => {
    const c: Character = {} as Character;
    const profile = resolveProfile([source(c)], 'Runs the crew. More.', warn);
    expect(profile).toEqual({
      tagline: 'Runs the crew.',
      bio: ['Runs the crew. More.'],
      facts: [],
      face: DEFAULT_FACE,
    });
    expect(warnings).toEqual([]);
  });

  it('fallbacks with empty description: tagline "", bio []', () => {
    const c: Character = {} as Character;
    const profile = resolveProfile([source(c)], '', warn);
    expect(profile.tagline).toBe('');
    expect(profile.bio).toEqual([]);
  });

  it.each([
    ['tagline over 80', { tagline: 'x'.repeat(81) }, 'tagline'],
    ['multi-line tagline', { tagline: 'a\nb' }, 'tagline'],
    ['bio file missing', { bio: 'nope.md' }, 'bio'],
    ['bio outside the folder', { bio: '../x.md' }, 'bio'],
    ['face out of range', { face: { x: 1.2, y: 0 } }, 'face'],
    ['face malformed', { face: 'top' }, 'face'],
  ])('%s → one warning naming the field, that field falls back, the others still load', (_label, bad, field) => {
    const c: Character = { tagline: 'Good tagline.', facts: [{ label: 'Role', value: 'Foreman' }], ...bad } as Character;
    const profile = resolveProfile([source(c)], 'Fallback description.', warn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(field);
    if (field !== 'tagline') expect(profile.tagline).toBe('Good tagline.');
    if (field !== 'facts') expect(profile.facts).toEqual([{ label: 'Role', value: 'Foreman' }]);
  });

  it.each([
    ['bio is "." (the character folder itself)', '.'],
    ['bio is a subfolder', 'sub'],
  ])('%s → one warning, falls back to description, other fields still load', (_label, bio) => {
    if (bio === 'sub') fs.mkdirSync(path.join(dir, 'sub'));
    const c: Character = { tagline: 'Good tagline.', facts: [{ label: 'Role', value: 'Foreman' }], bio } as Character;
    const profile = resolveProfile([source(c)], 'Fallback description.', warn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('bio');
    expect(profile.bio).toEqual(['Fallback description.']);
    expect(profile.tagline).toBe('Good tagline.');
    expect(profile.facts).toEqual([{ label: 'Role', value: 'Foreman' }]);
  });

  it('whitespace-only bio.md → falls back to description (no warning)', () => {
    fs.writeFileSync(path.join(dir, 'bio.md'), '  \n\n \t \n');
    const c: Character = { bio: 'bio.md' } as Character;
    const profile = resolveProfile([source(c)], 'Fallback description.', warn);
    expect(profile.bio).toEqual(['Fallback description.']);
    expect(warnings).toEqual([]);
  });

  it('bio over BIO_MAX → cut at last whole paragraph, one warning', () => {
    const para1 = 'a'.repeat(1900);
    const para2 = 'b'.repeat(500);
    fs.writeFileSync(path.join(dir, 'bio.md'), `${para1}\n\n${para2}`);
    const c: Character = { bio: 'bio.md' } as Character;
    const profile = resolveProfile([source(c)], 'Fallback description.', warn);
    expect(profile.bio).toEqual([para1]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('bio');
  });

  it('facts: 8 entries with one bad label → the 6 first valid ones kept, one warning', () => {
    const facts = [
      { label: 'One', value: 'v1' },
      { label: 'Two', value: 'v2' },
      { label: '', value: 'bad' },
      { label: 'Three', value: 'v3' },
      { label: 'Four', value: 'v4' },
      { label: 'Five', value: 'v5' },
      { label: 'Six', value: 'v6' },
      { label: 'Seven', value: 'v7' },
    ];
    const c: Character = { facts } as Character;
    const profile = resolveProfile([source(c)], 'Fallback description.', warn);
    expect(profile.facts).toEqual([
      { label: 'One', value: 'v1' },
      { label: 'Two', value: 'v2' },
      { label: 'Three', value: 'v3' },
      { label: 'Four', value: 'v4' },
      { label: 'Five', value: 'v5' },
      { label: 'Six', value: 'v6' },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('facts');
  });

  it('facts not an array → [] and one warning', () => {
    const c: Character = { facts: 'nope' } as Character;
    const profile = resolveProfile([source(c)], 'Fallback description.', warn);
    expect(profile.facts).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('facts');
  });

  it('fewer than 6 kept after dropping an invalid one → warning says how many were kept', () => {
    const facts = [
      { label: 'One', value: 'v1' },
      { label: '', value: 'bad' },
    ];
    const c: Character = { facts } as Character;
    const profile = resolveProfile([source(c)], 'Fallback description.', warn);
    expect(profile.facts).toEqual([{ label: 'One', value: 'v1' }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('keeping the first 1 valid');
  });
});
