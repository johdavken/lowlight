import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCast } from '../src/cast';
import { extrasKnown } from '../../shared/extras';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cast-'));
const write = (people: unknown) => {
  const f = path.join(tmp(), 'cast.json');
  fs.writeFileSync(f, JSON.stringify({ people }));
  return f;
};
const o = (warns: string[]) => ({ extras: new Set(['local-01', 'crew-wire-02']), roster: new Set(['rue']), warn: (m: string) => warns.push(m) });

describe('the cast list (narration images spec 2026-11-18)', () => {
  it('loads a stranger portrait and a contact', () => {
    const warns: string[] = [];
    const cast = loadCast(write({ halloran: { extra: 'local-01' }, rue: { character: 'rue' } }), o(warns));
    expect([...cast]).toEqual([
      ['halloran', { kind: 'extra', id: 'local-01' }],
      ['rue', { kind: 'character', id: 'rue' }],
    ]);
    expect(warns).toEqual([]);
  });

  it('warns once for each bad entry and drops it', () => {
    const warns: string[] = [];
    const cast = loadCast(write({ a: { extra: 'local-99' }, b: { extra: 'crew-wire-02' }, c: { character: 'nobody' }, 'Bad Id': { extra: 'local-01' }, d: { face: 'x' }, ok: { extra: 'local-01' } }), o(warns));
    expect([...cast.keys()]).toEqual(['ok']);
    expect(warns).toHaveLength(5);
    expect(warns.join('\n')).toContain("'local-99'");
    expect(warns.join('\n')).toContain('crew portrait');
    expect(warns.join('\n')).toContain("'nobody'");
  });

  it('a missing file is an empty cast, without a warning', () => {
    const warns: string[] = [];
    expect(loadCast(path.join(tmp(), 'none.json'), o(warns)).size).toBe(0);
    expect(warns).toEqual([]);
  });

  it("the extras' known set carries each portrait's tags, for image … any draws", () => {
    expect(extrasKnown([{ id: 'local-01', file: 'local-01.png', tags: ['man'], note: '' }]).list).toEqual([{ id: 'local-01', tags: ['man'] }]);
  });

  it('the shipped world/cast.json loads clean against the shipped extras', () => {
    const warns: string[] = [];
    const extras = JSON.parse(fs.readFileSync('world/extras/extras.json', 'utf8')) as { id: string }[];
    const roster = new Set(fs.readdirSync('characters'));
    loadCast('world/cast.json', { extras: new Set(extras.map((e) => e.id)), roster, warn: (m) => warns.push(m) });
    expect(warns).toEqual([]);
  });
});
