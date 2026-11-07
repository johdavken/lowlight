import { describe, expect, it } from 'vitest';
import { loreGlossary, type LoreEntry } from './lore';

const entry = (o: Partial<LoreEntry> & Pick<LoreEntry, 'id' | 'title' | 'body'>): LoreEntry => ({ keys: [], districts: [], places: [], always: false, ...o });

describe('loreGlossary', () => {
  it('leaves out the model\'s own entries', () => {
    expect(loreGlossary([entry({ id: 'm', title: 'M', only: 'model', keys: ['lacquer'], body: 'x.' })])).toEqual([]);
  });

  it('a book-only entry owns its keys, in any case; the other entry keeps the rest', () => {
    const g = loreGlossary([entry({ id: 'cortex', title: 'Cortex', keys: ['Cortex', 'Carts'], body: 'x.' }), entry({ id: 'slang-carts', title: 'Carts', only: 'book', keys: ['carts'], body: 'y.' })]);
    expect(g.map((e) => [e.id, e.keys])).toEqual([['cortex', ['Cortex']], ['slang-carts', ['carts']]]);
  });

  it("shows the on-the-street version's words when there is one, under the entry's own title and keys", () => {
    const g = loreGlossary([
      entry({ id: 'cortex-global', title: 'Cortex Global', keys: ['Cortex', 'Cortex Global'], body: 'Insider truth. Board secrets here. More.' }),
      entry({ id: 'cortex-global-on-the-street', title: 'Cortex on the street', keys: ['the Cortex', 'Corty'], body: 'What people say. They own the lights. And the rest.' }),
      entry({ id: 'aegis-solutions', title: 'Aegis Solutions', keys: ['Aegis', 'ok'], body: 'Second-largest supplier of armed force. Cheaper than SDG. Less careful.' }),
    ]);
    expect(g).toEqual([
      { id: 'aegis-solutions', title: 'Aegis Solutions', keys: ['Aegis'], text: 'Second-largest supplier of armed force. Cheaper than SDG.' },
      { id: 'cortex-global', title: 'Cortex Global', keys: ['Cortex', 'Cortex Global', 'the Cortex', 'Corty'], text: 'What people say. They own the lights.' },
    ]);
  });

  it('cuts a long first sentence at a word, with an ellipsis', () => {
    const [g] = loreGlossary([entry({ id: 'x', title: 'X', keys: ['Xanadu'], body: `${'word '.repeat(80)}end.` })]);
    expect(g.text.length).toBeLessThanOrEqual(241);
    expect(g.text.endsWith('…')).toBe(true);
  });
});
