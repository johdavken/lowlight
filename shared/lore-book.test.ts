import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOK_LINES, bookEntries, bookNow, parseLoreFile, searchBook, type BookEntry, type LoreEntry } from './lore';

const lore = (o: Partial<LoreEntry> & Pick<LoreEntry, 'id' | 'title' | 'body'>): LoreEntry => ({ keys: [], districts: [], places: [], always: false, ...o });
const entry = (o: Partial<BookEntry> & Pick<BookEntry, 'id'>): BookEntry => ({ title: o.id, category: null, section: null, keys: [], places: [], districts: [], always: false, body: '', ...o });
const at = (o: Partial<Parameters<typeof bookNow>[1]> = {}) => ({ lines: [], draft: '', placeId: null, districtId: null, present: [], ...o });
const ids = (hits: { entry: BookEntry }[]) => hits.map((h) => h.entry.id);

describe('bookEntries', () => {
  it('merges a street twin: main title, both bodies, both sets of keys, one row', () => {
    const b = bookEntries([
      lore({ id: 'cortex-global', title: 'Cortex Global', category: 'Factions', keys: ['Cortex'], body: 'Board secrets.' }),
      lore({ id: 'cortex-global-on-the-street', title: 'Cortex on the street', keys: ['Corty'], body: 'What people say.' }),
    ]);
    expect(b).toEqual([{ id: 'cortex-global', title: 'Cortex Global', category: 'Factions', section: null, keys: ['Cortex', 'Corty'], places: [], districts: [], always: false, body: 'Board secrets.\n\nWhat people say.' }]);
  });

  it('leaves out the model\'s own entries and keeps book-only ones', () => {
    const b = bookEntries([lore({ id: 'slang', title: 'Slang', only: 'model', always: true, body: 'x' }), lore({ id: 'slang-hum', title: 'Hum', only: 'book', keys: ['the hum'], body: 'y' })]);
    expect(b.map((e) => e.id)).toEqual(['slang-hum']);
  });

  it('keeps short keys the glossary drops', () => {
    expect(bookEntries([lore({ id: 'sdg', title: 'SDG', keys: ['SDG'], body: 'x' })])[0].keys).toEqual(['SDG']);
  });

  it('keeps a lone -on-the-street entry whose main entry is missing', () => {
    expect(bookEntries([lore({ id: 'x-on-the-street', title: 'X', keys: ['X-ray'], body: 'y' })]).map((e) => e.id)).toEqual(['x-on-the-street']);
  });

  it('keeps the main entry\'s section past a street twin', () => {
    const b = bookEntries([lore({ id: 'titan', title: 'Titan', category: 'City', section: 'Corps', keys: ['Titan'], body: 'x' }), lore({ id: 'titan-on-the-street', title: 'Titan', category: 'Factions', keys: ['Titan'], body: 'y' })]);
    expect(b.map((e) => e.section)).toEqual(['Corps']);
  });

  it('gives an entry with no category a null one', () => {
    expect(bookEntries([lore({ id: 'x', title: 'X', body: 'y' })])[0].category).toBeNull();
  });

  it('accounts for every world/lore entry', () => {
    const dir = path.resolve(__dirname, '../world/lore');
    const book = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).flatMap((f) => {
      const r = parseLoreFile(f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8'), null);
      return r.ok ? [r.entry] : [];
    });
    const all = new Set(book.map((e) => e.id));
    const twins = book.filter((e) => e.id.endsWith('-on-the-street') && all.has(e.id.slice(0, -'-on-the-street'.length)));
    const own = book.filter((e) => e.only === 'model');
    expect(bookEntries(book)).toHaveLength(book.length - twins.length - own.length);
  });
});

describe('the slang rows', () => {
  const dir = path.resolve(__dirname, '../world/lore');
  const book = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).flatMap((f) => {
    const r = parseLoreFile(f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8'), null);
    return r.ok ? [r.entry] : [];
  });

  it('the book shows only the words; the model keeps its three entries and none of the words', () => {
    const rows = bookEntries(book).filter((e) => e.section === 'Slang');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((e) => e.id.startsWith('slang-'))).toBe(true);
    const slang = book.filter((e) => e.section === 'Slang');
    expect(slang.filter((e) => e.only !== 'book').map((e) => e.id).sort()).toEqual(['grid-and-chrome-slang', 'lowlight-street-slang', 'slang']);
    expect(slang.filter((e) => e.only === 'model')).toHaveLength(3);
  });

  it('no word shares a title with another entry: a district finds its lore by title', () => {
    const titles = book.map((e) => e.title.toLowerCase());
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
  });
});

describe('bookNow', () => {
  const sdg = entry({ id: 'sdg', keys: ['SDG'] });
  const reach = entry({ id: 'reach', keys: ['the Reach'] });
  const orchid = entry({ id: 'orchid', keys: ['velvet'] });

  it('lists the newest match first, the draft ahead of every line', () => {
    const n = bookNow([sdg, reach, orchid], at({ draft: 'velvet', lines: ['the Reach', 'SDG'] }));
    expect(ids(n.said)).toEqual(['orchid', 'reach', 'sdg']);
    expect(n.count).toBe(3);
  });

  it('gives the key that matched', () => {
    expect(bookNow([sdg], at({ lines: ['the sdg were here'] })).said[0].key).toBe('SDG');
  });

  it('reads only the first BOOK_LINES lines', () => {
    const lines = [...Array<string>(BOOK_LINES).fill('nothing'), 'SDG'];
    expect(bookNow([sdg], at({ lines })).said).toEqual([]);
    expect(BOOK_LINES).toBe(5);
  });

  it('matches a curly apostrophe as a straight one', () => {
    const hae = entry({ id: 'hae', keys: ["Hae's"] });
    expect(ids(bookNow([hae], at({ draft: 'Hae’s place' })).said)).toEqual(['hae']);
  });

  it('matches a key inside curly double quotes', () => {
    expect(ids(bookNow([sdg], at({ draft: '“SDG”' })).said)).toEqual(['sdg']);
  });

  it('leaves a place’s entry out of said and the count, and in here', () => {
    const tilt = entry({ id: 'tilt', keys: ['the Tilt'], places: ['the-tilt'] });
    const n = bookNow([tilt], at({ lines: ['the Tilt again'], placeId: 'the-tilt' }));
    expect(n.said).toEqual([]);
    expect(n.count).toBe(0);
    expect(n.here.map((e) => e.id)).toEqual(['tilt']);
  });

  it('lists place entries before district entries, once each', () => {
    const d = entry({ id: 'a-district', title: 'A', districts: ['karasu'] });
    const p = entry({ id: 'z-place', title: 'Z', places: ['the-tilt'] });
    const both = entry({ id: 'm-both', title: 'M', places: ['the-tilt'], districts: ['karasu'] });
    expect(bookNow([d, p, both], at({ placeId: 'the-tilt', districtId: 'karasu' })).here.map((e) => e.id)).toEqual(['m-both', 'z-place', 'a-district']);
  });

  it('leaves always entries out of everything', () => {
    const slang = entry({ id: 'slang', keys: ['chrome'], always: true, places: ['the-tilt'] });
    const n = bookNow([slang], at({ lines: ['chrome'], placeId: 'the-tilt' }));
    expect(n).toEqual({ said: [], who: [], here: [], count: 0 });
  });

  it('moves a name-only match to who and off the count', () => {
    const twins = entry({ id: 'twins', keys: ['Silas'] });
    const n = bookNow([twins], at({ lines: ['Silas called'], present: ['Silas'] }));
    expect(ids(n.who)).toEqual(['twins']);
    expect(n.said).toEqual([]);
    expect(n.count).toBe(0);
  });

  it('treats one word of a full name as the name', () => {
    const soren = entry({ id: 'soren', keys: ['Soren'] });
    expect(ids(bookNow([soren], at({ lines: ['Soren'], present: ['Xander Soren'] })).who)).toEqual(['soren']);
  });

  it('treats a possessive as the name', () => {
    const hae = entry({ id: 'hae', keys: ["Hae's"] });
    expect(ids(bookNow([hae], at({ lines: ["Hae's broth"], present: ['Hae'] })).who)).toEqual(['hae']);
  });

  it('keeps an entry in said when another of its keys matched too', () => {
    const twins = entry({ id: 'twins', keys: ['Silas', 'Gumshoe'] });
    const n = bookNow([twins], at({ lines: ['Gumshoe and Silas'], present: ['Silas'] }));
    expect(ids(n.said)).toEqual(['twins']);
    expect(n.said[0].key).toBe('Gumshoe');
    expect(n.who).toEqual([]);
  });

  it('handles no place, no district, no lines and an empty draft', () => {
    expect(bookNow([sdg], at())).toEqual({ said: [], who: [], here: [], count: 0 });
  });
});

describe('searchBook', () => {
  const book = [
    entry({ id: 'body', title: 'Zed', body: 'the harbor at night' }),
    entry({ id: 'key', title: 'Yak', keys: ['Harbor'] }),
    entry({ id: 'title', title: 'The Harbor' }),
    entry({ id: 'none', title: 'Nope', body: 'nothing' }),
  ];

  it('finds any case, title hits first, then keys, then bodies', () => {
    expect(searchBook(book, 'HARBOR').map((e) => e.id)).toEqual(['title', 'key', 'body']);
  });

  it('returns nothing for a blank query', () => {
    expect(searchBook(book, '   ')).toEqual([]);
  });
});
