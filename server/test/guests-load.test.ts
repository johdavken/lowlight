import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadGuests } from '../src/guests-load';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'guests-'));
  fs.mkdirSync(path.join(d, 'guests'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const NOA = '---\nname: Noa Vey\nspec: runner\nsex: woman\naccent: "#9fd8c8"\nline: Dark Cart\n---\n';

describe('guest files (The Passenger spec, engine §2)', () => {
  it('reads a guest file', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'guests', 'noa.md'), NOA);
    const warn: string[] = [];
    expect(loadGuests(path.join(d, 'guests'), (m) => warn.push(m))).toEqual([{ id: 'noa', name: 'Noa Vey', spec: 'runner', accent: '#9fd8c8', portrait: null, art: null, line: 'Dark Cart' }]);
    expect(warn).toEqual([]);
  });
  it('names its art only when the file is in the crew art folder', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'guests', 'noa.md'), NOA.replace('line:', 'art: noa.webp\nline:'));
    expect(loadGuests(path.join(d, 'guests'), () => {})[0]!.art).toBeNull();
    fs.mkdirSync(path.join(d, 'art'));
    fs.writeFileSync(path.join(d, 'art', 'noa.webp'), '');
    expect(loadGuests(path.join(d, 'guests'), () => {})[0]!.art).toBe('/api/crew/art/noa.webp');
  });
  it('skips a guest with no such trade', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'guests', 'noa.md'), NOA.replace('spec: runner', 'spec: astronaut'));
    const warn: string[] = [];
    expect(loadGuests(path.join(d, 'guests'), (m) => warn.push(m))).toEqual([]);
    expect(warn.join()).toMatch(/noa\.md/);
  });
  it('no folder: no guests', () => {
    expect(loadGuests('/nonexistent/guests', () => {})).toEqual([]);
  });
  it('the real Noa loads', () => {
    const warn: string[] = [];
    expect(loadGuests('./world/crew/guests', (m) => warn.push(m)).map((g) => g.id)).toContain('noa');
    expect(warn).toEqual([]);
  });
});
