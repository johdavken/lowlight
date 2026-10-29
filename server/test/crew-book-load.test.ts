import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCrewBook } from '../src/crew-book-load';

describe('loadCrewBook', () => {
  it('reads the four files; a missing one is empty; problems warn', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-'));
    fs.writeFileSync(path.join(dir, 'names.md'), '## karasu\n- Juno Sato\n');
    fs.writeFileSync(path.join(dir, 'traits.md'), 'bad · Bad · + · teleport · any · Gone.\n');
    const warns: string[] = [];
    const book = loadCrewBook(dir, (m) => warns.push(m));
    expect(book.names).toEqual({ karasu: ['Juno Sato'] });
    expect(book.traits).toEqual([]);
    expect(book.errands).toEqual([]);
    expect(warns).toHaveLength(1);
    expect(loadCrewBook(path.join(dir, 'nope'), () => {})).toEqual({ names: {}, traits: [], pitches: {}, errands: [] });
  });
});
