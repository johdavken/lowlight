import { describe, expect, it } from 'vitest';
import { EXTRA_NOTE_MAX, extrasKnown, parseExtras, tagCounts } from './extras';

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
