import fs from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, faceUrl, parseFaces, parseNames, parseOrigins, parseReasons, reasonFor } from './data';

const quiet = () => vi.fn<(m: string) => void>();

describe('parseOrigins', () => {
  test('drops empty and duplicate names, one warning each', () => {
    const warn = quiet();
    const o = parseOrigins([{ name: 'Kessen' }, { name: '' }, { name: 'Kessen' }, { name: 'Varna', lore: 'tidal-isle' }, { name: 'Meridian' }], warn);
    expect(o).toEqual([{ name: 'Kessen' }, { name: 'Varna', lore: 'tidal-isle' }, { name: 'Meridian' }]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  test('fewer than 3 valid origins means the built-in list', () => {
    const warn = quiet();
    expect(parseOrigins([{ name: 'A' }, { name: 'B' }], warn)).toEqual(DEFAULT_ORIGINS);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test('more than 8 keeps the first 8', () => {
    const warn = quiet();
    expect(parseOrigins('ABCDEFGHI'.split('').map((name) => ({ name })), warn)).toHaveLength(8);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test('not a list means the built-in list', () => expect(parseOrigins({ nope: 1 }, quiet())).toEqual(DEFAULT_ORIGINS));
});

describe('parseNames', () => {
  test('keeps the two lists', () => expect(parseNames({ given: ['Ines'], family: ['Varga'] }, quiet())).toEqual({ given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] }));
  test('a missing list stays empty', () => expect(parseNames({ given: ['Ines'] }, quiet())).toEqual({ given: { f: [], m: [], x: ['Ines'] }, family: [] }));
});

describe('parseFaces', () => {
  test('bands from the file prefix; looks only add a neighbouring band', () => {
    const warn = quiet();
    const faces = parseFaces(['u25-01', 'mid-07', 'x-1', 'o40-02'], [{ id: 'mid-07', looks: ['25–40', 'over 40'] }, { id: 'u25-01', looks: ['over 40'] }], warn);
    expect(faces).toEqual([
      { id: 'u25-01', band: 'under 25', looks: ['under 25'] },
      { id: 'mid-07', band: '25–40', looks: ['25–40', 'over 40'] },
      { id: 'o40-02', band: 'over 40', looks: ['over 40'] },
    ]);
    // x-1 has no band; over 40 isn't next to under 25.
    expect(warn).toHaveBeenCalledTimes(2);
  });
  test('looks are kept in band order', () => {
    expect(parseFaces(['mid-01'], [{ id: 'mid-01', looks: ['over 40', 'under 25', '25–40'] }], quiet())[0].looks).toEqual(['under 25', '25–40', 'over 40']);
  });
});

describe('parseReasons', () => {
  test('an unknown lore id warns and is skipped', () => {
    const warn = quiet();
    const r = parseReasons([{ match: { kind: 'ban' }, text: 'Closed.', lore: 'nowhere' }, { match: { kind: 'ban' }, text: 'Shut.', lore: 'tidal-isle' }], new Set(['tidal-isle']), warn);
    expect(r).toEqual([{ match: { kind: 'ban' }, text: 'Shut.', lore: 'tidal-isle' }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test('a file that is not a list means the built-in reasons', () => expect(parseReasons('nope', new Set(), quiet())).toEqual(DEFAULT_REASONS));
});

describe('reasonFor', () => {
  const r = () => 0;
  test('the most specific reason wins', () => {
    expect(reasonFor({ kind: 'ban', f: 'district', v: 'the Strand' }, DEFAULT_REASONS, r)).toEqual({ why: 'SDG is sweeping the boardwalk.', lore: 'neon-strand' });
  });
  test('placeholders are filled', () => {
    expect(reasonFor({ kind: 'ban', f: 'origin', v: 'Kessen' }, DEFAULT_REASONS, r).why).toBe("MiraGen's quarantine on Kessen hulls, day 9.");
  });
  test('a rule nothing matches is by order of the Isle', () => {
    expect(reasonFor({ kind: 'ban', f: 'age', v: 'under 25' }, [], r)).toEqual({ why: 'By order of the Isle.', lore: 'tidal-isle' });
  });
  test('reasons for consequences match on the rule', () => {
    expect(reasonFor({ kind: 'if', f: 'trade', v: 'clinic', then: { doc: 'medical' } }, DEFAULT_REASONS, r)).toEqual({ why: 'Chiron wants a health record on anyone near patients.', lore: 'chiron-medical' });
    expect(reasonFor({ kind: 'if', f: 'origin', v: 'Kessen', then: { doc: 'medical' } }, DEFAULT_REASONS, r).lore).toBe('miragen-pharmaceuticals');
  });
});

test('every built-in reason names a lore entry that exists', () => {
  const ids = new Set(fs.readdirSync('world/lore').filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)));
  for (const x of DEFAULT_REASONS) expect(ids, x.text).toContain(x.lore);
});

test('faceUrl is under /api so the dev proxy reaches the server', () => {
  expect(faceUrl('mid-07')).toBe('/api/papers/faces/mid-07.jpg');
  expect(faceUrl(null)).toBeNull();
});

describe('names per origin (2026-10-12)', () => {
  test('an origin can carry its own given and family names', () => {
    const o = parseOrigins([{ name: 'Vrana', names: { given: { f: [], m: [], x: ['Zofia'] }, family: ['Novak'] } }, { name: 'Sundarpur' }, { name: 'Skarnholm' }], quiet());
    expect(o[0]).toEqual({ name: 'Vrana', names: { given: { f: [], m: [], x: ['Zofia'] }, family: ['Novak'] } });
    expect(o[1]).toEqual({ name: 'Sundarpur' });
  });
  test('names that are not two lists of strings warn and are dropped, keeping the origin', () => {
    const warn = quiet();
    const o = parseOrigins([{ name: 'Vrana', names: { given: 'Zofia' } }, { name: 'B' }, { name: 'C' }], warn);
    expect(o[0]).toEqual({ name: 'Vrana' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('gender, for pronouns (2026-10-12)', () => {
  test('a face can be tagged f or m; anything else warns and is dropped', () => {
    const warn = quiet();
    const f = parseFaces(['mid-01', 'mid-02', 'mid-03'], [{ id: 'mid-01', looks: ['25–40'], gender: 'f' }, { id: 'mid-02', gender: 'm' }, { id: 'mid-03', gender: 'q' }], warn);
    expect(f.map((x) => x.gender)).toEqual(['f', 'm', undefined]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test('given names can be sorted by gender; a plain list counts as either', () => {
    const o = parseOrigins([{ name: 'Vrana', names: { given: { f: ['Zofia'], m: ['Nikolai'], x: ['Sasha'] }, family: ['Novak'] } }, { name: 'B', names: { given: ['Deniz'], family: ['Kaya'] } }, { name: 'C' }], quiet());
    expect(o[0].names).toEqual({ given: { f: ['Zofia'], m: ['Nikolai'], x: ['Sasha'] }, family: ['Novak'] });
    expect(o[1].names).toEqual({ given: { f: [], m: [], x: ['Deniz'] }, family: ['Kaya'] });
  });
  test('the shared pool reads both shapes too', () => {
    expect(parseNames({ given: ['Ines'], family: ['Varga'] }, quiet())).toEqual({ given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] });
    expect(parseNames({ given: { f: ['Ines'], m: ['Tomas'] }, family: ['Varga'] }, quiet())).toEqual({ given: { f: ['Ines'], m: ['Tomas'], x: [] }, family: ['Varga'] });
  });
});
