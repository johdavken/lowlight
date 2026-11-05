import { describe, expect, it } from 'vitest';
import { EXTRA_NOTE_MAX, extrasKnown, parseExtras, pickStrangerFace, tagCounts, type Extra } from './extras';

const ONE = { id: 'sdg-07', file: 'sdg-07.png', tags: ['sdg', 'officer'], note: 'grey beard' };
const bad = (e: unknown) => {
  const r = parseExtras([e]);
  return r.ok ? null : r.message;
};

describe('parseExtras', () => {
  it('reads a face', () => {
    const r = parseExtras([ONE]);
    expect(r).toEqual({ ok: true, extras: [ONE] });
  });
  it('refuses a bad id, no tags, too many tags, a long note, a file not named for its id', () => {
    expect(bad({ ...ONE, id: 'SDG 7' })).not.toBeNull();
    expect(bad({ ...ONE, tags: [] })).not.toBeNull();
    expect(bad({ ...ONE, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] })).not.toBeNull();
    expect(bad({ ...ONE, note: 'x'.repeat(EXTRA_NOTE_MAX + 1) })).not.toBeNull();
    expect(bad({ ...ONE, file: 'other.png' })).not.toBeNull();
  });
  it('refuses two faces with one id, naming it', () => {
    const r = parseExtras([ONE, ONE]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('sdg-07');
  });
});

describe('what a quest can name', () => {
  const lib = [ONE, { id: 'sdg-08', file: 'sdg-08.png', tags: ['sdg'] }, { id: 'dock-01', file: 'dock-01.png', tags: ['dock'] }];
  it('ids and tags', () => {
    const k = extrasKnown(lib);
    expect([...k.ids].sort()).toEqual(['dock-01', 'sdg-07', 'sdg-08']);
    expect([...k.tags].sort()).toEqual(['dock', 'officer', 'sdg']);
  });
  it('tag counts, by tag', () => {
    expect(tagCounts(lib)).toEqual([
      { tag: 'dock', count: 1 },
      { tag: 'officer', count: 1 },
      { tag: 'sdg', count: 2 },
    ]);
  });
});

describe('pickStrangerFace (a DRAW stranger)', () => {
  const x = (id: string, ...tags: string[]): Extra => ({ id, file: `${id}.png`, tags });
  const lib = [
    x('k-man-old', 'local', 'karasu', 'man', 'old'),
    x('k-man-mid', 'local', 'karasu', 'man'),
    x('k-woman-young', 'local', 'karasu', 'woman', 'young'),
    x('s-man-old', 'local', 'spine', 'man', 'old'),
    x('crew', 'crew-face', 'man', 'old'),
  ];
  const first = () => 0;
  it('a local of the district who fits; middle is neither young nor old', () => {
    expect(pickStrangerFace(lib, { gender: 'man', age: 'old', district: 'karasu' }, first)).toBe('k-man-old');
    expect(pickStrangerFace(lib, { gender: 'man', age: 'middle', district: 'karasu' }, first)).toBe('k-man-mid');
    expect(pickStrangerFace(lib, { gender: 'man', age: 'old', district: 'spine' }, first)).toBe('s-man-old');
  });
  it('a local of no district in particular fits any district', () => {
    const both = [...lib, x('any-man-mid', 'local', 'man')];
    const picks = new Set([0, 0.99].map((v) => pickStrangerFace(both, { gender: 'man', age: 'middle', district: 'karasu' }, () => v)));
    expect(picks).toEqual(new Set(['k-man-mid', 'any-man-mid']));
  });
  it('drops the district, then the age, then the gender; never a non-local', () => {
    expect(pickStrangerFace(lib, { gender: 'woman', age: 'young', district: 'velvet' }, first)).toBe('k-woman-young');
    expect(pickStrangerFace(lib, { gender: 'woman', age: 'old', district: 'karasu' }, first)).toBe('k-woman-young');
    expect(pickStrangerFace(lib, {}, () => 0.99)).toBe('s-man-old');
    expect(pickStrangerFace([x('crew', 'crew-face')], { gender: 'man' })).toBeNull();
  });
});
