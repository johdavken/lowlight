import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { characterKnows, knowsReader, knowsStartsReader, resolveKnows, resolveKnowsStarts, standingConfigReader, TIE_MAX } from '../src/character';
import { parsePersona } from '../../shared/persona';
import { tempDir } from './fixtures/temp-dir';

describe('resolveKnows', () => {
  it('keeps trimmed lines under roster-shaped ids', () => {
    const warns: string[] = [];
    expect(resolveKnows({ 'nix-direct': '  Court.  ' }, 'hicks', (m) => warns.push(m))).toEqual({ 'nix-direct': 'Court.' });
    expect(warns).toEqual([]);
  });

  it('drops a too-long, empty, self, badly named or non-string entry, one warning each', () => {
    const warns: string[] = [];
    const out = resolveKnows(
      { cass: 'x'.repeat(TIE_MAX + 1), wren: '   ', hicks: 'me', 'Bad Id': 'y', dean: 3, nix: 'ok' },
      'hicks',
      (m) => warns.push(m),
    );
    expect(out).toEqual({ nix: 'ok' });
    expect(warns).toHaveLength(5);
    expect(TIE_MAX).toBe(600);
  });

  it('a non-object is none, with a warning', () => {
    const warns: string[] = [];
    expect(resolveKnows(['nix'], 'hicks', (m) => warns.push(m))).toEqual({});
    expect(warns).toHaveLength(1);
    expect(resolveKnows(undefined, 'hicks', (m) => warns.push(m))).toEqual({});
    expect(warns).toHaveLength(1);
  });
});

describe('characterKnows', () => {
  it("reads the character file's knows; no file or a bad file is none", () => {
    const dir = tempDir('knows-');
    const warns: string[] = [];
    expect(characterKnows(dir, 'hicks', (m) => warns.push(m))).toEqual({});
    fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ name: 'Hicks', knows: { nix: 'Court.' } }));
    expect(characterKnows(dir, 'hicks', (m) => warns.push(m))).toEqual({ nix: 'Court.' });
    fs.writeFileSync(path.join(dir, 'character.json'), '{ nope');
    expect(characterKnows(dir, 'hicks', (m) => warns.push(m))).toEqual({});
    expect(warns).toHaveLength(1);
  });
});

describe('persona kind', () => {
  it('keeps edit or custom; anything else is no persona', () => {
    expect(parsePersona({ name: 'H', background: '', kind: 'edit' })).toEqual({ name: 'H', background: '', kind: 'edit' });
    expect(parsePersona({ name: 'H', kind: 'custom' })).toEqual({ name: 'H', background: '', kind: 'custom' });
    expect(parsePersona({ name: 'H', kind: 'x' })).toBeNull();
  });
});

describe('knowsReader', () => {
  it('reads a character file once until it changes on disk (final review 7)', () => {
    const dir = tempDir('knows-');
    const file = path.join(dir, 'hicks', 'character.json');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify({ knows: { nix: 'One.' } }));
    const read = knowsReader(dir, () => {});
    const spy = vi.spyOn(fs, 'readFileSync');
    expect(read('hicks')).toEqual({ nix: 'One.' });
    expect(read('hicks')).toEqual({ nix: 'One.' });
    const reads = spy.mock.calls.filter((c) => String(c[0]) === file).length;
    expect(reads).toBe(1);
    fs.writeFileSync(file, JSON.stringify({ knows: { nix: 'Two.' } }));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(read('hicks')).toEqual({ nix: 'Two.' });
    expect(read('Bad Id')).toEqual({});
    spy.mockRestore();
  });
});

describe('ties with a standing start', () => {
  it('an object entry gives its line to resolveKnows and its start to resolveKnowsStarts', () => {
    const warns: string[] = [];
    const raw = { nix: { line: ' From before. ', trust: 6 }, cass: 'Plain.' };
    expect(resolveKnows(raw, 'hicks', (m) => warns.push(m))).toEqual({ nix: 'From before.', cass: 'Plain.' });
    expect(resolveKnowsStarts(raw, 'hicks', (m) => warns.push(m))).toEqual({ nix: { trust: 6 } });
    expect(warns).toEqual([]);
  });
  it('a bad start number warns and is dropped; the line stays', () => {
    const warns: string[] = [];
    const raw = { nix: { line: 'From before.', trust: 11, warmth: 3 } };
    expect(resolveKnows(raw, 'hicks', (m) => warns.push(m))).toEqual({ nix: 'From before.' });
    expect(resolveKnowsStarts(raw, 'hicks', (m) => warns.push(m))).toEqual({ nix: { warmth: 3 } });
    expect(warns).toHaveLength(1);
  });
  it('an object without a line is dropped by resolveKnows', () => {
    const warns: string[] = [];
    expect(resolveKnows({ nix: { trust: 2 } }, 'hicks', (m) => warns.push(m))).toEqual({});
    expect(warns).toHaveLength(1);
  });
  it('the readers read character files, cached by file', () => {
    const dir = tempDir('standing-');
    fs.mkdirSync(path.join(dir, 'hicks'));
    fs.writeFileSync(path.join(dir, 'hicks', 'character.json'), JSON.stringify({ name: 'Hicks', knows: { nix: { line: 'x', warmth: 4 } }, standing: { want: 'Quiet.' } }));
    const warn = vi.fn();
    expect(knowsStartsReader(dir, warn)('hicks')).toEqual({ nix: { warmth: 4 } });
    expect(standingConfigReader(dir, warn)('hicks')).toEqual({ start: null, want: 'Quiet.', secret: null, hint: null, words: {} });
    expect(standingConfigReader(dir, warn)('nobody')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
