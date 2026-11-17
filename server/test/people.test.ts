import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPeople, type People } from '../src/people';
import { readFigure } from '../src/persona-figure';
import { parsePerson, parsePersonWho } from '../../shared/person';

let dir: string;
let people: People;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'people-'));
  people = createPeople(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const WHO = { name: 'Vee', pronoun: 'she' as const, background: 'From the Spine.', wears: 'a grey quilted jacket, cargo trousers, boots' };
const png = () => {
  const p = new PNG({ width: 4, height: 6 });
  p.data.fill(200);
  return PNG.sync.write(p);
};
/** A take on disk, as the generate route leaves one. */
const take = (id: string, name = '1794679903078-cf531b') => {
  fs.mkdirSync(path.join(people.dir(id), 'takes'), { recursive: true });
  fs.writeFileSync(path.join(people.dir(id), 'takes', `${name}.png`), png());
  return name;
};
const FIT = { face: { x: 0.5, y: 0.1 }, waist: 0.4, fields: { hair: 'cropped' } };

describe('parsePerson', () => {
  it('trims, and holds the name, background and wears to the persona limits', () => {
    expect(parsePerson({ id: 'p-1794679903078-abcdef', ...WHO, name: ' Vee ', made: 'x' })).toMatchObject({ name: 'Vee' });
    expect(parsePerson({ id: 'p-1794679903078-abcdef', ...WHO, name: 'x'.repeat(41), made: 'x' })).toBeNull();
    expect(parsePerson({ id: 'p-1794679903078-abcdef', ...WHO, wears: 'x'.repeat(201), made: 'x' })).toBeNull();
    expect(parsePerson({ id: 'p-1794679903078-abcdef', ...WHO, name: 'Ve\ne', made: 'x' })).toBeNull();
  });

  it('WHO: a WEARS written over lines reads as one line', () => {
    expect(parsePersonWho({ name: 'Vee', pronoun: 'she', background: '', wears: 'a black coat\nboots\r\nwet' })?.wears).toBe('a black coat boots wet');
  });

  it('a draft may have no name yet; a kept person may not', () => {
    expect(parsePerson({ id: 'p-1794679903078-abcdef', name: '', pronoun: 'they', background: '', wears: '', made: 'x', draft: true })).not.toBeNull();
    expect(parsePerson({ id: 'p-1794679903078-abcdef', name: '', pronoun: 'they', background: '', wears: '', made: 'x' })).toBeNull();
  });
});

describe('the people library', () => {
  it('a draft is not listed until it is saved', () => {
    const { id } = people.draft();
    expect(people.list()).toEqual([]);
    expect(people.get(id)).toMatchObject({ id, draft: true });
    const row = people.save(id, WHO);
    expect(row).toMatchObject({ id, ...WHO, figure: false, figureMade: null });
    expect(row.draft).toBeUndefined();
    expect(people.list().map((p) => p.id)).toEqual([id]);
  });

  it('lists the newest first', () => {
    const a = people.draft().id;
    people.save(a, WHO);
    const b = people.draft().id;
    people.save(b, { ...WHO, name: 'Ash' });
    expect(people.list().map((p) => p.name)).toEqual(['Ash', 'Vee']);
  });

  it('keep writes a figure the game reads, with the person\'s wears', () => {
    const { id } = people.draft();
    people.save(id, WHO);
    const row = people.keep(id, take(id), FIT);
    expect(row.figure).toBe(true);
    expect(row.figureMade).toEqual(expect.any(String));
    const fig = readFigure(people.dir(id));
    expect(fig?.meta).toMatchObject({ face: FIT.face, waist: 0.4, wears: WHO.wears, fields: { hair: 'cropped' } });
  });

  it('keep refuses a missing take, and a person with no wears yet', () => {
    const { id } = people.draft();
    expect(() => people.keep(id, take(id), FIT)).toThrow(/wears/i);
    people.save(id, WHO);
    expect(() => people.keep(id, '1794679903078-000000', FIT)).toThrow(/take/i);
  });

  it('takes lists them newest first, raw files left out; dropTakes removes them all', () => {
    const { id } = people.draft();
    take(id, '1794679903078-aaaaaa');
    take(id, '1794679999999-bbbbbb');
    fs.writeFileSync(path.join(people.dir(id), 'takes', '1794679999999-bbbbbb.raw.png'), png());
    expect(people.takes(id).map((t) => t.take)).toEqual(['1794679999999-bbbbbb', '1794679903078-aaaaaa']);
    people.dropTakes(id);
    expect(people.takes(id)).toEqual([]);
  });

  it('remove deletes the person and its folder', () => {
    const { id } = people.draft();
    people.save(id, WHO);
    people.remove(id);
    expect(people.get(id)).toBeNull();
    expect(fs.existsSync(people.dir(id))).toBe(false);
  });

  it('sweepDrafts removes drafts and their takes, never a saved person', () => {
    const draft = people.draft().id;
    take(draft);
    const kept = people.draft().id;
    people.save(kept, WHO);
    people.sweepDrafts();
    expect(fs.existsSync(people.dir(draft))).toBe(false);
    expect(people.get(kept)).not.toBeNull();
  });

  it('a bad person.json reads as no person, and an id that isn\'t one is refused', () => {
    const { id } = people.draft();
    fs.writeFileSync(path.join(people.dir(id), 'person.json'), '{nope');
    expect(people.get(id)).toBeNull();
    expect(people.list()).toEqual([]);
    expect(people.get('../settings')).toBeNull();
    expect(() => people.dir('../settings')).toThrow();
  });
});
