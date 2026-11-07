import { describe, expect, it } from 'vitest';
import { LORE_TEST_MAP } from './lore.fixture';
import { categoryFile, categoryId, findRepeat, looseEntry, LORE_DRAFT_INSTRUCTION, loreDraftPrompt, parseDraft, splitDrafts, LORE_HEADER, locate, loreBlock, loreFile, loreId, loreLogLine, mapIds, parseCategoryFile, parseLoreFile, selectLore, LORE_BUDGET, loreKeyMatches, loreShort, LORE_SCORE, type LoreEntry } from './lore';

const MAP = LORE_TEST_MAP;
const IDS = mapIds(MAP);

const ORCHID = `---
title: Glass Orchid
category: Factions
keys: [glass orchid, the orchid, orchid house]
districts: [velvet]
places: [glass-orchid]
always: false
---
A companion house in Velvet: discreet, expensive, run like a hotel. Its people are
"orchids"; leaving is allowed and remembered. Nix worked there nine years.
`;

const file = (front: string, body = 'Some text.') => `---\n${front}\n---\n${body}\n`;
const problems = (text: string, id = 'x') => {
  const r = parseLoreFile(id, text, IDS);
  return r.ok ? [] : r.problems;
};

describe('parseLoreFile', () => {
  it("parses the spec's Glass Orchid example", () => {
    const r = parseLoreFile('glass-orchid', ORCHID, IDS);
    expect(r).toEqual({
      ok: true,
      entry: {
        id: 'glass-orchid',
        title: 'Glass Orchid',
        category: 'Factions',
        keys: ['glass orchid', 'the orchid', 'orchid house'],
        districts: ['velvet'],
        places: ['glass-orchid'],
        always: false,
        body: 'A companion house in Velvet: discreet, expensive, run like a hotel. Its people are\n"orchids"; leaving is allowed and remembered. Nix worked there nine years.',
      },
    });
  });

  it('loreFile round-trips', () => {
    const entries: LoreEntry[] = [
      { id: 'a', title: 'A: colon', keys: ['x y', "o'brien"], districts: [], places: [], always: false, body: 'Line one.\n\nLine "two".' },
      { id: 'lowlight', title: 'Lowlight', category: 'City', section: 'Basics', keys: [], districts: ['karasu'], places: ['haes-noodles'], always: true, body: 'The city.' },
    ];
    for (const e of entries) expect(parseLoreFile(e.id, loreFile(e), IDS)).toEqual({ ok: true, entry: e });
  });

  it('rejects bad fields, naming the field', () => {
    const cases: [string, string][] = [
      [file('keys: [a b]'), 'title'],
      [file(`title: ${'x'.repeat(61)}\nkeys: [ab]`), 'title'],
      [file('title: "a\\nb"\nkeys: [ab]'), 'title'],
      [file(`title: T\ncategory: ${'c'.repeat(31)}\nkeys: [ab]`), 'category'],
      [file(`title: T\nkeys: [${Array.from({ length: 13 }, (_, i) => `k${i}x`).join(', ')}]`), 'keys'],
      [file('title: T\nkeys: [a]'), 'keys'],
      [file(`title: T\nkeys: [${'k'.repeat(41)}]`), 'keys'],
      [file('title: T\nkeys: ["a\\nb"]'), 'keys'],
      [file('title: T\nkeys: [ab]', '   '), 'body'],
      [file('title: T\nkeys: [ab]', 'b'.repeat(1201)), 'body'],
      [file('title: T\nkeys: [ab]\nmood: x'), 'mood'],
    ];
    for (const [text, field] of cases) expect(problems(text).map((p) => p.field), text.slice(0, 60)).toContain(field);
  });

  it('needs a way in', () => {
    expect(problems(file('title: T'))).toContainEqual({ field: 'keys', message: 'needs keys, a district, a place or always' });
    expect(problems(file('title: T\nalways: true'))).toEqual([]);
  });

  it('needs front matter and a good id', () => {
    expect(problems('just text').length).toBeGreaterThan(0);
    expect(problems(file('title: T\nalways: true'), '../x').map((p) => p.field)).toContain('id');
    expect(problems(file('title: T\nalways: true'), 'Glass').map((p) => p.field)).toContain('id');
    expect(problems(file('title: T\nalways: true'), 'a'.repeat(41)).map((p) => p.field)).toContain('id');
  });

  it('checks map ids only when given', () => {
    const text = file('title: T\nplaces: [glass-orchd]');
    expect(problems(text)).toContainEqual({ field: 'places', message: "no place 'glass-orchd' on the map" });
    expect(problems(file('title: T\ndistricts: [nowhere]'))).toContainEqual({ field: 'districts', message: "no district 'nowhere' on the map" });
    expect(parseLoreFile('x', text, null).ok).toBe(true);
  });

  it('trims keys and drops duplicates ignoring case', () => {
    const r = parseLoreFile('x', file('title: T\nkeys: [Orchid, "orchid ", ORCHID]'), IDS);
    expect(r.ok && r.entry.keys).toEqual(['Orchid']);
  });

  it('accepts Windows line endings', () => {
    expect(parseLoreFile('glass-orchid', ORCHID.replace(/\n/g, '\r\n'), IDS).ok).toBe(true);
  });
});

describe('only: who reads an entry', () => {
  const file = (front: string) => `---\ntitle: T\n${front}\n---\nBody.\n`;

  it('round-trips, after section, and stays off the file when it is both', () => {
    const r = parseLoreFile('t', file('category: City\nsection: Slang\nonly: book\nkeys: [kk]'), null);
    expect(r.ok && r.entry.only).toBe('book');
    expect(r.ok && loreFile(r.entry)).toContain('section: Slang\nonly: book\nkeys:');
    const plain = parseLoreFile('t', file('keys: [kk]'), null);
    expect(plain.ok && 'only' in plain.entry).toBe(false);
    expect(plain.ok && loreFile(plain.entry)).not.toContain('only:');
  });

  it('refuses any other reader', () => {
    const r = parseLoreFile('t', file('only: everyone\nkeys: [kk]'), null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems.map((p) => p.field)).toContain('only');
  });

  it('a book-only entry needs nothing to bring it in; any other still does', () => {
    expect(parseLoreFile('t', file('only: book'), null).ok).toBe(true);
    expect(parseLoreFile('t', file('only: model'), null).ok).toBe(false);
    expect(parseLoreFile('t', file('category: City'), null).ok).toBe(false);
  });

  it('a book-only entry cannot be always', () => {
    const r = parseLoreFile('t', file('only: book\nalways: true'), null);
    expect(!r.ok && r.problems.map((p) => p.field)).toEqual(['only']);
  });

  it('a file the game would skip keeps its reader in the form', () => {
    expect(looseEntry('t', file('only: model\nplaces: [nowhere]\nbad: 1'), null).only).toBe('model');
    expect(looseEntry('t', file('only: everyone\nbad: 1'), null).only).toBeUndefined();
  });

  it('the model never reads a book-only entry, by any road', () => {
    const word = { id: 'w', title: 'W', only: 'book' as const, keys: ['hum'], districts: ['d'], places: ['p'], always: false, body: 'x' };
    const sel = selectLore([word], { placeId: 'p', districtId: 'd', recent: ['the hum'], force: ['w'] });
    expect(sel.picks).toEqual([]);
    expect(sel.dropped).toEqual([]);
  });

  it('the model reads its own entries', () => {
    const own = { id: 'm', title: 'M', only: 'model' as const, keys: [], districts: [], places: [], always: true, body: 'x' };
    expect(selectLore([own], { placeId: null, districtId: null, recent: [] }).picks.map((p) => p.entry.id)).toEqual(['m']);
  });

  it('COPY FOR OPUS shows every entry, and shapes its example on one both read', () => {
    const e = (id: string, title: string, only?: 'book') => ({ id, title, category: 'City', ...(only ? { only } : {}), keys: ['k'], districts: [], places: [], always: false, body: `${title} text.` });
    const out = loreDraftPrompt({ book: [e('a', 'Aardvark', 'book'), e('b', 'Basics')], map: null, category: 'City', template: null });
    expect(out).toContain('Aardvark: Aardvark text.');
    expect(out).toContain('title: Basics');
    expect(out).not.toContain('only: book');
  });
});

describe('loreId', () => {
  it('makes an id from a title, avoiding taken ones', () => {
    expect(loreId('Glass Orchid', new Set())).toBe('glass-orchid');
    expect(loreId('Glass Orchid', new Set(['glass-orchid']))).toBe('glass-orchid-2');
    expect(loreId('Glass Orchid', new Set(['glass-orchid', 'glass-orchid-2']))).toBe('glass-orchid-3');
    expect(loreId("Hae's Noodles!", new Set())).toBe('hae-s-noodles');
    const long = loreId(`${'word '.repeat(14)}`, new Set());
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('-')).toBe(false);
    expect(loreId('???', new Set())).toBe('entry');
  });
});

describe('category files', () => {
  it('parse and round-trip', () => {
    const c = { id: 'factions', category: 'Factions', template: 'Who they are.\nWhere they operate.' };
    expect(parseCategoryFile('factions', categoryFile(c))).toEqual({ ok: true, category: c });
    expect(categoryId('Factions')).toBe('factions');
    expect(categoryId('City & Slang')).toBe('city-slang');
  });

  it('rejects an empty or too long template, a bad id and a missing category', () => {
    const bad = (text: string, id = 'factions') => parseCategoryFile(id, text).ok;
    expect(bad(file('category: Factions', ' '))).toBe(false);
    expect(bad(file('category: Factions', 't'.repeat(2001)))).toBe(false);
    expect(bad(file('category: Factions'), '../x')).toBe(false);
    expect(bad(file('title: x'))).toBe(false);
  });
});

const E = (id: string, o: Partial<LoreEntry> = {}): LoreEntry => ({ id, title: id.toUpperCase(), keys: [], districts: [], places: [], always: false, body: `${id} body`, ...o });
const ids = (sel: ReturnType<typeof selectLore>) => sel.picks.map((p) => p.entry.id);
const at = (recent: string[], placeId: string | null = null, districtId: string | null = null) => ({ placeId, districtId, recent });

describe('locate', () => {
  it('finds the place and district for a scene', () => {
    expect(locate(MAP, 'ribbon/noodle-stall')).toEqual({ placeId: 'haes-noodles', districtId: 'karasu' });
    expect(locate(MAP, 'ribbon/elsewhere')).toEqual({ placeId: null, districtId: null });
    expect(locate(null, 'ribbon/noodle-stall')).toEqual({ placeId: null, districtId: null });
  });
});

describe('selectLore', () => {
  const A = E('a', { always: true });
  const P = E('p', { places: ['haes-noodles'] });
  const D = E('d', { districts: ['karasu'] });
  const K = E('k', { keys: ['orchid'] });

  it("forces a gig's entries in right after the always ones (Papers spec §4.2)", () => {
    const sel = selectLore([K, D, P, A], { ...at([], 'haes-noodles', 'karasu'), force: ['d', 'k', 'nope'] });
    expect(ids(sel)).toEqual(['a', 'd', 'k', 'p']);
    expect(sel.picks.map((p) => p.why)).toEqual(['always', 'gig', 'gig', 'place']);
  });

  it('orders always, place, keys, then district', () => {
    const sel = selectLore([K, D, P, A], at(['the orchid?'], 'haes-noodles', 'karasu'));
    expect(ids(sel)).toEqual(['a', 'p', 'k', 'd']);
    expect(sel.picks.map((p) => p.why)).toEqual(['always', 'place', 'key', 'district']);
    expect(sel.picks[2].key).toBe('orchid');
  });

  it('an entry qualifying twice appears once, at its first position', () => {
    const both = E('b', { always: true, keys: ['orchid'], places: ['haes-noodles'] });
    const sel = selectLore([both], at(['orchid'], 'haes-noodles', 'karasu'));
    expect(sel.picks).toHaveLength(1);
    expect(sel.picks[0].why).toBe('always');
  });

  it('matches keys on word boundaries (Review Focus 1)', () => {
    const hit = (key: string, text: string) => selectLore([E('x', { keys: [key] })], at([text])).picks.length === 1;
    for (const t of ["the Orchid's door", 'orchid.', 'ORCHID', '(orchid)']) expect(hit('orchid', t), t).toBe(true);
    for (const t of ['orchids', 'orchidea', 'xorchid']) expect(hit('orchid', t), t).toBe(false);
    expect(hit('glass', 'glassworks')).toBe(false);
    expect(hit('glass orchid', 'the glass   orchid')).toBe(true);
    expect(hit('glass orchid', 'the glass\norchid')).toBe(true);
    expect(hit('a.b', 'aXb')).toBe(false);
    // A typographic apostrophe in the text or the key still matches the other kind.
    expect(hit("hae's", 'at Hae’s tonight')).toBe(true);
    expect(hit('hae’s', "at Hae's tonight")).toBe(true);
  });

  it('looks at this turn and the four messages before it', () => {
    const recent = (i: number) => Array.from({ length: 6 }, (_, j) => (j === i ? 'orchid' : 'nothing'));
    expect(ids(selectLore([K], at(recent(4))))).toEqual(['k']);
    expect(ids(selectLore([K], at(recent(5))))).toEqual([]);
  });

  it('puts the most recently mentioned key first, then by title', () => {
    const K1 = E('k1', { keys: ['alpha'] });
    const K2 = E('k2', { keys: ['beta'] });
    expect(ids(selectLore([K1, K2], at(['beta', 'x', 'alpha'])))).toEqual(['k2', 'k1']);
    const Z = E('z', { title: 'Zed', keys: ['gamma'] });
    const Y = E('y', { title: 'Yew', keys: ['gamma'] });
    expect(ids(selectLore([Z, Y], at(['gamma'])))).toEqual(['y', 'z']);
  });

  it('keeps within the budget (6,000), dropping whole entries, and a later small one still fits', () => {
    expect(LORE_BUDGET).toBe(6000);
    const big = (id: string, title: string) => E(id, { title, always: true, body: 'x'.repeat(1200) });
    const book = [big('big-1', 'A1'), big('big-2', 'A2'), big('big-3', 'A3'), big('big-4', 'A4'), big('big-5', 'A5'), E('small', { title: 'B', always: true, body: 'tiny' })];
    const sel = selectLore(book, at([]));
    expect(ids(sel)).toEqual(['big-1', 'big-2', 'big-3', 'big-4', 'small']);
    expect(sel.dropped.map((e) => e.id)).toEqual(['big-5']);
    expect(sel.chars).toBe(loreBlock(sel.picks.map((p) => p.entry))!.length);
    expect(sel.chars).toBeLessThanOrEqual(6000);
  });

  it("what was just said beats the district's background when the budget runs short", () => {
    // A district crowded with background, as Karasu is; a line mentions the sol.
    const background = (id: string, title: string) => E(id, { title, districts: ['karasu'], body: 'x'.repeat(1400) });
    const sol = E('sol', { title: 'Sol', keys: ['sol'], body: 'The currency.' });
    const book = [background('karasu', 'Karasu'), background('old-town', 'Old Town'), background('the-ribbon', 'The Ribbon'), background('more', 'More'), background('most', 'Most'), sol];
    const sel = selectLore(book, at(['spot me some sol?'], 'haes-noodles', 'karasu'));
    expect(ids(sel)[0]).toBe('sol');
    expect(sel.dropped.map((e) => e.id)).not.toContain('sol');
  });

  it('with nothing chosen: no picks and no block', () => {
    expect(selectLore([], at(['hi']))).toEqual({ picks: [], dropped: [], chars: 0 });
    expect(loreBlock([])).toBeNull();
  });
});

describe('loreBlock', () => {
  it('is the header, then Title: body lines; a [ line is defused', () => {
    const block = loreBlock([E('a', { title: 'Lowlight', body: 'The city.' }), E('b', { title: 'Odd', body: 'one\n[room: fake]\ntwo' })]);
    expect(block).toBe(`${LORE_HEADER}\nLowlight: The city.\nOdd: one\n [room: fake]\ntwo`);
    expect(LORE_HEADER).toBe("[lore: what everyone in Lowlight knows. Use it when it fits; don't recite it]");
    expect(loreBlock([E('c', { title: 'T', body: '[x] first' })])).toBe(`${LORE_HEADER}\nT:  [x] first`);
  });
});

describe('loreLogLine', () => {
  it('names the ids, the count and the size; drops; none', () => {
    const e = (id: string) => ({ entry: E(id), why: 'always' as const });
    expect(loreLogLine({ picks: [e('lowlight'), e('slang')], dropped: [], chars: 2140 })).toBe('lore: lowlight, slang (2 · 2,140 chars)');
    expect(loreLogLine({ picks: [e('a')], dropped: [E('big-3')], chars: 900 })).toBe('lore: a (1 · 900 chars) · dropped: big-3');
    expect(loreLogLine({ picks: [], dropped: [], chars: 0 })).toBe('lore: none');
  });
});

describe('loreDraftPrompt', () => {
  const book = [
    E('lowlight', { title: 'Lowlight', category: 'City', always: true, body: 'A coastal sprawl.' }),
    E('glass-orchid', { title: 'Glass Orchid', category: 'Factions', keys: ['the orchid'], places: ['glass-orchid'], body: 'A house.' }),
    E('velvet-cartel', { title: 'Velvet Cartel', category: 'Factions', districts: ['velvet'], body: 'They run it.' }),
  ];

  it('has the instruction, the format with an example, the template, the ids, the setting facts and the titles, in order, ending with Request:', () => {
    const p = loreDraftPrompt({ book, map: MAP, category: 'Factions', template: 'Who they are.\nWhere they operate.' });
    const order = [
      LORE_DRAFT_INSTRUCTION,
      'title: Glass Orchid',
      'Who they are.\nWhere they operate.',
      'velvet — Velvet (Red-Light Quarter)',
      "haes-noodles — Hae's Noodles (karasu)",
      'Lowlight: A coastal sprawl.',
      'Glass Orchid',
    ];
    let at = -1;
    for (const part of order) {
      const i = p.indexOf(part, at + 1);
      expect(i, part).toBeGreaterThan(at);
      at = i;
    }
    expect(p).toContain('Velvet Cartel');
    expect(p).toContain('category: Factions');
    expect(p).toContain('Request: <your request>');
    expect(p).toMatch(/1,200/);
  });

  it('an empty category gets a skeleton example; no template, no template section', () => {
    const p = loreDraftPrompt({ book, map: MAP, category: 'History', template: null });
    expect(p).toContain('title: <Title>');
    expect(p).not.toContain('Template');
    expect(p).toContain('category: History');
  });
});

describe('splitDrafts', () => {
  it('finds the entries in a pasted answer, around prose, fences and CRLF (Review Focus 2)', () => {
    const paste = [
      'Here are two entries for you:',
      '',
      '```markdown',
      '---',
      'title: Velvet Cartel',
      'keys: [the cartel]',
      '---',
      'They run Velvet.',
      '',
      '---',
      'title: Neon Saints',
      'districts: [karasu]',
      '---',
      'A gang.',
      'Two lines.',
      '```',
      '',
      'Let me know if you want more!',
    ].join('\r\n');
    const drafts = splitDrafts(paste);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toBe('---\ntitle: Velvet Cartel\nkeys: [the cartel]\n---\nThey run Velvet.\n');
    expect(drafts[1].startsWith('---\ntitle: Neon Saints\n')).toBe(true);
    expect(drafts[1]).toContain('A gang.\nTwo lines.');
    expect(drafts[1]).not.toContain('Let me know');
  });

  it('no front matter → no drafts', () => {
    expect(splitDrafts('Just some text.\nNothing else.')).toEqual([]);
  });
});

describe('parseDraft', () => {
  const ids = mapIds(MAP);
  it('takes the default category, derives the id, and flags a clash with an existing title', () => {
    const d = parseDraft('---\ntitle: Glass Orchid\nkeys: [orchid]\n---\nAgain.\n', { taken: new Set(['glass-orchid']), titles: new Map([['glass-orchid', 'Glass Orchid']]), ids, category: 'Factions' });
    expect(d.id).toBe('glass-orchid-2');
    expect(d.clash).toBe('Glass Orchid');
    expect(d.result.ok && d.result.entry.category).toBe('Factions');
  });

  it('a draft that names its own category keeps it', () => {
    const d = parseDraft('---\ntitle: X Y\ncategory: City\nkeys: [xy]\n---\nT.\n', { taken: new Set(), titles: new Map(), ids, category: 'Factions' });
    expect(d.result.ok && d.result.entry.category).toBe('City');
    expect(d.clash).toBeNull();
  });

  it('a bad place id gives problems', () => {
    const d = parseDraft('---\ntitle: Nowhere\nplaces: [nowhere]\n---\nT.\n', { taken: new Set(), titles: new Map(), ids });
    expect(d.result.ok).toBe(false);
    expect(!d.result.ok && d.result.problems).toContainEqual({ field: 'places', message: "no place 'nowhere' on the map" });
  });
});

describe('looseEntry (a file the game would skip, opened anyway)', () => {
  const ids = mapIds(MAP);
  it('keeps every field that reads, and drops ids the map lacks', () => {
    const e = looseEntry('x', '---\ntitle: X Bar\ncategory: Places\nkeys: [x bar]\nplaces: [nowhere, haes-noodles]\ndistricts: [karasu, gone]\n---\nThe text.\n', ids);
    expect(e).toEqual({ id: 'x', title: 'X Bar', category: 'Places', keys: ['x bar'], districts: ['karasu'], places: ['haes-noodles'], always: false, body: 'The text.' });
  });
  it('reads what it can from a file that fails the schema', () => {
    const e = looseEntry('y', '---\ntitle: Y\nmood: odd\nkeys: [a]\n---\nStill here.\n', ids);
    expect(e.title).toBe('Y');
    expect(e.body).toBe('Still here.');
    expect(e.keys).toEqual(['a']);
  });
  it('a file with no front matter keeps its text as the body', () => {
    expect(looseEntry('z', 'just text', ids)).toMatchObject({ id: 'z', title: 'z', body: 'just text' });
  });
});

describe('the drafting prompt asks for one fenced block', () => {
  it('so a closing remark stays outside the entries', () => {
    expect(LORE_DRAFT_INSTRUCTION).toContain('```');
  });
});

describe('loreDraftPrompt asks for the sections a category has', () => {
  const e = (id: string, section?: string): LoreEntry => ({ id, title: id, category: 'City', ...(section ? { section } : {}), keys: ['key'], districts: [], places: [], always: false, body: 'x' });

  it('names them, sorted, once each', () => {
    expect(loreDraftPrompt({ book: [e('a', 'Slang'), e('b', 'Corps'), e('c', 'Corps'), e('d')], map: null, category: 'City', template: null })).toContain('Give each entry a section line, after category: Corps, Slang.');
  });

  it('says nothing of them in a category without any', () => {
    expect(loreDraftPrompt({ book: [e('a')], map: null, category: 'City', template: null })).not.toContain('section');
  });
});

describe('loreDraftPrompt keeps drafts true to what exists', () => {
  const book = [
    E('lowlight', { title: 'Lowlight', always: true, body: 'A coastal sprawl.' }),
    E('lowlight-intake', { title: 'Lowlight Intake', category: 'Places', places: ['lowlight-intake'], body: 'A counseling co-op above the noodle stall.' }),
  ];
  const rooms = { 'lowlight-intake': 'A worn office: a kitchenette, a desk lamp, three screens, a rain-streaked window.' };

  it("carries the category's existing entries in full, and what each place's room looks like", () => {
    const p = loreDraftPrompt({ book, map: MAP, category: 'Places', template: null, rooms });
    expect(p).toContain('Lowlight Intake: A counseling co-op above the noodle stall.');
    expect(p).toContain('lowlight-intake — Lowlight Intake: A worn office: a kitchenette, a desk lamp, three screens, a rain-streaked window.');
    expect(p.indexOf('A worn office')).toBeLessThan(p.indexOf('Request: '));
  });

  it('restates the format after the request, last', () => {
    const p = loreDraftPrompt({ book, map: MAP, category: 'Places', template: null });
    const after = p.slice(p.indexOf('Request: '));
    expect(after).toContain('```');
    expect(after).toContain('---');
    expect(p.trimEnd().endsWith('No headings, no lists, and no text outside the block.')).toBe(true);
  });
});

describe('splitDrafts reads a heading-style answer too', () => {
  const answer = [
    '**1. The intake room**',
    'Place: lowlight-intake',
    'Keys: intake room, front desk, the counter, waiting room',
    '',
    'A long room above a shuttered pharmacy, reached by one narrow stair.',
    'It smells of wet coats.',
    '',
    '**2. House rules and fees**',
    'Keys: Intake fees, house cut',
    '',
    'Lowlight Intake takes eighteen percent.',
    '',
    '## 3. The night stairs',
    'Category: Places',
    'District: karasu',
    'Keys: night arrivals',
    '',
    'After midnight the stairs bring a different crowd.',
  ].join('\n');

  it('turns each heading into a draft with its fields and text', () => {
    const drafts = splitDrafts(answer);
    expect(drafts).toHaveLength(3);
    const ids = mapIds(MAP);
    const first = parseDraft(drafts[0], { taken: new Set(), titles: new Map(), ids, category: 'Places' });
    expect(first.result.ok && first.result.entry).toEqual({
      id: 'the-intake-room',
      title: 'The intake room',
      category: 'Places',
      keys: ['intake room', 'front desk', 'the counter', 'waiting room'],
      districts: [],
      places: ['lowlight-intake'],
      always: false,
      body: 'A long room above a shuttered pharmacy, reached by one narrow stair.\nIt smells of wet coats.',
    });
    const third = parseDraft(drafts[2], { taken: new Set(), titles: new Map(), ids });
    expect(third.result.ok && third.result.entry).toMatchObject({ title: 'The night stairs', category: 'Places', districts: ['karasu'], keys: ['night arrivals'] });
  });

  it('prefers --- blocks when the answer has them', () => {
    expect(splitDrafts('**Heading**\n---\ntitle: A B\nkeys: [ab]\n---\nText.\n')).toEqual(['---\ntitle: A B\nkeys: [ab]\n---\nText.\n']);
  });
});

describe('findRepeat: which existing entry a draft rewrites', () => {
  const book = [
    { id: 'karasu', title: 'Karasu and the Ribbon', places: [] },
    { id: 'haes-noodles', title: "Hae's noodle stall", places: ['haes-noodles'] },
    { id: 'lowlight-intake', title: 'Lowlight Intake', places: ['lowlight-intake'] },
    { id: 'glass-orchid', title: 'Glass Orchid', places: [] },
    { id: 'hae', title: 'Hae', places: ['haes-noodles', 'lowlight-intake'] },
  ];
  it('the same title or id, ignoring case and punctuation', () => {
    expect(findRepeat({ title: 'glass orchid', places: [] }, book)).toEqual({ id: 'glass-orchid', by: 'name' });
    expect(findRepeat({ title: 'Karasu', places: [] }, book)).toEqual({ id: 'karasu', by: 'name' });
    expect(findRepeat({ title: "Hae's Noodles", places: [] }, book)).toEqual({ id: 'haes-noodles', by: 'name' });
  });
  it('the same single place', () => {
    expect(findRepeat({ title: 'The Intake', places: ['lowlight-intake'] }, book)).toEqual({ id: 'lowlight-intake', by: 'place' });
  });
  it('sharing one of several places is not a repeat; nothing alike is null', () => {
    expect(findRepeat({ title: 'Noodle regulars', places: ['haes-noodles', 'lowlight-intake'] }, book)).toBeNull();
    expect(findRepeat({ title: 'Velvet', places: [] }, book)).toBeNull();
  });
  it('a title match wins over a place match', () => {
    expect(findRepeat({ title: 'Hae', places: ['lowlight-intake'] }, book)).toEqual({ id: 'hae', by: 'name' });
  });
});


describe('exports for the Studio GIGS tab', () => {
  it('loreMentions: a key on word boundaries, as selectLore matches', async () => {
    const { loreMentions } = await import('./lore');
    const orchid = { id: 'o', title: 'Glass Orchid', keys: ['the orchid', 'orchid'], districts: [], places: [], always: false, body: '' };
    expect(loreMentions("drinks at the Orchid's bar", orchid)).toBe(true);
    expect(loreMentions('orchids grow', orchid)).toBe(false);
    expect(loreMentions('nothing here', { ...orchid, keys: [] })).toBe(false);
  });
  it('yamlScalar quotes what YAML would misread', async () => {
    const { yamlScalar } = await import('./lore');
    expect(yamlScalar('yes')).toBe('"yes"');
    expect(yamlScalar('Plain words')).toBe('Plain words');
  });
});

describe('mentionsKeys', () => {
  it('matches any key as a whole word, any case', async () => {
    const { mentionsKeys } = await import('./lore');
    expect(mentionsKeys('How is your BROTHER doing?', ['brother', 'teo'])).toBe(true);
    expect(mentionsKeys('brotherhood of the marsh', ['brother'])).toBe(false);
    expect(mentionsKeys('nothing here', [])).toBe(false);
  });
});

describe('lore picking (spec 2026-11-07)', () => {
  const e = (id: string, o: Partial<LoreEntry> = {}): LoreEntry => ({ id, title: id, keys: [], districts: [], places: [], always: false, body: `${id.toUpperCase()} one. ${id.toUpperCase()} two. ${id.toUpperCase()} three.`, ...o });
  const at = (recent: Parameters<typeof selectLore>[1]['recent'], o: Partial<Parameters<typeof selectLore>[1]> = {}) => ({ placeId: null, districtId: null, recent, ...o });
  const ids = (sel: ReturnType<typeof selectLore>) => sel.picks.map((p) => p.entry.id);
  const her = (text: string) => ({ text, by: 'them' as const });
  const you = (text: string) => ({ text, by: 'you' as const });

  describe('§1 case in her lines', () => {
    it('a capitalised key keeps its capitals in her line, not in yours', () => {
      expect(loreKeyMatches('Shelf', 'a shelf of binders', true)).toBe(false);
      expect(loreKeyMatches('Shelf', 'up on the Shelf', true)).toBe(true);
      expect(loreKeyMatches('Shelf', 'a shelf of binders', false)).toBe(true);
    });
    it('a lowercase key matches any case; a leading "the" either case; its lowercase words any case', () => {
      expect(loreKeyMatches('the tide', 'The tide is in.', true)).toBe(true);
      expect(loreKeyMatches('The Tilt', 'down at the Tilt', true)).toBe(true);
      expect(loreKeyMatches('The Tilt', 'the tilt of her head', true)).toBe(false);
      expect(loreKeyMatches("the Cat's up", 'THE Cat’s Up', true)).toBe(true);
      expect(loreKeyMatches('the Wheel', 'behind the wheel', true)).toBe(false);
    });
    it('selectLore checks case only on her lines', () => {
      const shelf = e('shelf', { keys: ['the Shelf'] });
      expect(ids(selectLore([shelf], at([her('it was on the shelf')])))).toEqual([]);
      expect(ids(selectLore([shelf], at([you('it was on the shelf')])))).toEqual(['shelf']);
    });
  });

  describe('§2 people in the scene', () => {
    const twins = e('the-zhou-twins', { keys: ['Silas', 'Ember', 'Gumshoe'] });
    it("a name of someone present is no way in; another key is", () => {
      expect(ids(selectLore([twins], at(['Silas, look at this'], { present: ['Silas Zhou'] })))).toEqual([]);
      expect(ids(selectLore([twins], at(['where is Ember?'], { present: ['Silas Zhou'] })))).toEqual(['the-zhou-twins']);
      expect(ids(selectLore([twins], at(["Silas's counter"], { present: ['Nix'] })))).toEqual(['the-zhou-twins']);
    });
    it('a present name still leaves the place and district ways in', () => {
      const hae = e('haes-noodles', { keys: ['Hae'], places: ['stall'] });
      expect(ids(selectLore([hae], at(['Hae, a bowl'], { present: ['Hae'], placeId: 'stall' })))).toEqual(['haes-noodles']);
    });
  });

  describe('§3 who said it', () => {
    const tide = e('tide', { keys: ['the tide'] });
    it('her newest line brings an entry in; her older lines do not', () => {
      expect(ids(selectLore([tide], at([you('ok'), her('the tide is in')])))).toEqual(['tide']);
      expect(ids(selectLore([tide], at([you('ok'), her('right'), you('and?'), her('the tide is in')])))).toEqual([]);
    });
    it('her newest reply split by speaker counts whole; a line of hers past one of yours does not', () => {
      expect(ids(selectLore([tide], at([her('Silas: whatever'), her('Hae: the tide is in'), you('what is going on?')])))).toEqual(['tide']);
      expect(ids(selectLore([tide], at([her('Silas: whatever'), you('hm'), her('Hae: the tide is in')])))).toEqual([]);
    });
    it('your older lines still do, scored lower with each line back', () => {
      const s = selectLore([tide], at([you('ok'), her('right'), you('the tide is in')]));
      expect(s.picks[0].score).toBe(LORE_SCORE.yourOlder);
      const s2 = selectLore([tide], at([you('ok'), you('hm'), you('the tide is in')]));
      expect(s2.picks[0].score).toBe(LORE_SCORE.yourOlder - LORE_SCORE.olderStep);
    });
  });

  describe('§4 scores', () => {
    it('your newest beats her newest; a one-word lowercase key counts less; the best way in wins', () => {
      const a = e('a', { keys: ['the tide'] });
      const b = e('b', { keys: ['carts'] });
      const s = selectLore([a, b], at([you('carts'), her('the tide')]));
      expect(s.picks.map((p) => [p.entry.id, p.score, p.size])).toEqual([
        ['a', LORE_SCORE.herNewest, 'full'],
        ['b', Math.round(LORE_SCORE.yourNewest * 0.6), 'full'],
      ]);
      const placed = e('p', { keys: ['the tide'], places: ['x'] });
      expect(selectLore([placed], at([you('the tide')], { placeId: 'x' })).picks[0]).toMatchObject({ why: 'place', score: LORE_SCORE.place });
    });
    it('a gig, then the place, then your newest, then district', () => {
      const g = e('g'), p = e('p', { places: ['x'] }), k = e('k', { keys: ['Venn'] }), d = e('d', { districts: ['y'] });
      expect(ids(selectLore([d, k, p, g], at(['Venn'], { placeId: 'x', districtId: 'y', force: ['g'] })))).toEqual(['g', 'p', 'k', 'd']);
    });
  });

  describe('§5 sizes', () => {
    it('loreShort is the first two sentences, or null when that is all', () => {
      expect(loreShort('One. Two! Three?')).toBe('One. Two!');
      expect(loreShort('One. Two.')).toBeNull();
    });
    it('loreShort always starts at the start: initials, decimals and quotes are not sentence ends (review)', () => {
      expect(loreShort('Halloran, P.I. is a holovid. It has run for decades. Fans quote it.')).toBe('Halloran, P.I. is a holovid. It has run for decades.');
      expect(loreShort('It costs 3.5 creds. She sells it. Nobody asks.')).toBe('It costs 3.5 creds. She sells it.');
      expect(loreShort('She told him "run." He ran. Later he came back.')).toBe('She told him "run." He ran.');
    });
    it('district background goes in short; always entries and high scores whole', () => {
      const always = e('always', { always: true });
      const d = e('d', { districts: ['y'] });
      const p = e('p', { places: ['x'] });
      const s = selectLore([always, d, p], at([], { placeId: 'x', districtId: 'y' }));
      expect(s.picks.map((pk) => [pk.entry.id, pk.size, pk.entry.body])).toEqual([
        ['always', 'full', 'ALWAYS one. ALWAYS two. ALWAYS three.'],
        ['p', 'full', 'P one. P two. P three.'],
        ['d', 'short', 'D one. D two.'],
      ]);
    });
    it('a whole entry that will not fit goes short; a short one that will not fit is dropped', () => {
      const big = (id: string, o: Partial<LoreEntry>) => e(id, { body: `${id.toUpperCase()} first. ${id.toUpperCase()} second. X${'x'.repeat(1100)}.`, ...o });
      const book = [1, 2, 3, 4, 5, 6].map((n) => big(`p${n}`, { places: ['x'] }));
      const s = selectLore(book, at([], { placeId: 'x' }));
      expect(s.picks.filter((p) => p.size === 'full')).toHaveLength(5);
      expect(s.picks.filter((p) => p.size === 'short').map((p) => p.entry.id)).toEqual(['p6']);
      expect(s.chars).toBeLessThanOrEqual(LORE_BUDGET);
      const tight = selectLore([big('a', { places: ['x'], body: 'y'.repeat(LORE_BUDGET - LORE_HEADER.length - 10) }), big('b', { places: ['x'] })], at([], { placeId: 'x' }));
      expect(tight.dropped.map((d) => d.id)).toEqual(['b']);
    });
    it('the log line marks short picks', () => {
      const s = selectLore([e('d', { districts: ['y'] })], at([], { districtId: 'y' }));
      expect(loreLogLine(s)).toMatch(/^lore: d~ /);
    });
  });
});
