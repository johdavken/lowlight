import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { worldInfoFrom } from './lore';

describe('worldInfoFrom', () => {
  it('keys and always: from the front matter', () => {
    const text = '---\ntitle: Aegis Solutions\ncategory: City\nkeys: [Aegis, SDG]\ndistricts: []\nplaces: []\nalways: true\n---\nAegis sells protection.\n';
    const wi = worldInfoFrom([{ name: 'aegis.md', text }]);
    expect(wi.entries['0']).toMatchObject({ uid: 0, key: ['Aegis', 'SDG'], constant: true, comment: 'Aegis Solutions', content: 'Aegis sells protection.' });
  });

  it('every real lore file converts, none empty', () => {
    const dir = path.join(__dirname, '../../world/lore');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
    const wi = worldInfoFrom(files);
    // One entry per file, however many there are (new lore mustn't break this test).
    expect(files.length).toBeGreaterThan(0);
    expect(Object.keys(wi.entries)).toHaveLength(files.length);
    for (const e of Object.values(wi.entries)) expect(e.content.length).toBeGreaterThan(0);
  });

  const file = (category: string, extra = '') => `---\ntitle: T\ncategory: ${category}\nkeys: [k]\ndistricts: []\nplaces: []\nalways: false\n${extra}---\nBody.\n`;
  const order = (text: string) => worldInfoFrom([{ name: 'x.md', text }]).entries['0'].order;

  it('always-on entries come first and never count against the budget', () => {
    const text = '---\ntitle: City\ncategory: City\nkeys: []\ndistricts: []\nplaces: []\nalways: true\n---\nThe city.\n';
    expect(worldInfoFrom([{ name: 'city.md', text }]).entries['0']).toMatchObject({ order: 1000, ignoreBudget: true });
  });

  it('when the budget cuts: people, then places, then the city and its factions, then tech and culture, then across the water', () => {
    expect(order(file('People'))).toBeGreaterThan(order(file('Places')));
    expect(order(file('Places'))).toBeGreaterThan(order(file('City')));
    expect(order(file('City'))).toBe(order(file('Factions')));
    expect(order(file('Factions'))).toBeGreaterThan(order(file('Tech')));
    expect(order(file('Tech'))).toBe(order(file('Culture')));
    expect(order(file('Culture'))).toBeGreaterThan(order(file('Across the Water')));
    expect(worldInfoFrom([{ name: 'x.md', text: file('People') }]).entries['0'].ignoreBudget).toBe(false);
  });

  it("an entry Lowlight keeps to a district or place ranks a little lower (SillyTavern can't, so it fires anywhere)", () => {
    expect(order(file('City', ''))).toBeGreaterThan(order(file('City').replace('districts: []', 'districts: [karasu]')));
    expect(order(file('City').replace('places: []', 'places: [haes-noodles]'))).toBeLessThan(order(file('City')));
  });

  it("no entry's text triggers others, as in Lowlight (only the chat does)", () => {
    expect(worldInfoFrom([{ name: 'x.md', text: file('City') }]).entries['0'].preventRecursion).toBe(true);
  });

  it('a file without front matter: its name as the title, no keys, not constant', () => {
    const wi = worldInfoFrom([{ name: 'loose-note.md', text: 'Just a note.' }]);
    expect(wi.entries['0']).toMatchObject({ comment: 'loose-note', key: [], constant: false, content: 'Just a note.' });
  });
});
