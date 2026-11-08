import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDecks, loadPrograms } from '../src/gear';
import { SAMPLE, block } from '../../shared/gear.fixture';

describe('loadDecks', () => {
  it('a missing file has none', () => {
    expect(loadDecks('/nonexistent-gear-dir', () => {})).toEqual([]);
  });
  it('a bad block warns and is skipped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gear-'));
    fs.writeFileSync(path.join(dir, 'decks.md'), SAMPLE + block({ id: 'bad', heat: '99' }));
    const warns: string[] = [];
    expect(loadDecks(dir, (m) => warns.push(m))).toHaveLength(3);
    expect(warns).toHaveLength(1);
  });
});

describe('loadStock', async () => {
  const { loadStock } = await import('../src/gear');
  it('reads the live stock against the live decks; a missing file has none', () => {
    const decks = loadDecks('world/gear', () => {});
    const programs = loadPrograms('world/gear', () => {});
    const warns: string[] = [];
    expect(Object.keys(loadStock('world/gear', decks, (m) => warns.push(m), programs)).sort()).toEqual(['deck-market', 'second-socket', 'the-tilt', 'under-the-cat']);
    expect(warns).toEqual([]);
    expect(loadStock('/nonexistent', decks, () => {})).toEqual({});
  });
});

describe('loadPrograms', async () => {
  const { loadPrograms } = await import('../src/gear');
  it('warns and skips a bad block; a missing file has none', () => {
    expect(loadPrograms('/nonexistent-gear-dir', () => {})).toEqual([]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gear-'));
    fs.writeFileSync(path.join(dir, 'programs.md'), '---\nid: solvent\nname: SOLVENT\nstat: tech\nkind: position\nline: Strips it.\n---\n---\nid: bad\nname: BAD\nstat: tech\nkind: dice\nline: x\n---\n');
    const warns: string[] = [];
    expect(loadPrograms(dir, (m) => warns.push(m)).map((p) => p.id)).toEqual(['solvent']);
    expect(warns).toHaveLength(1);
  });
  it('reads the live programs clean', () => {
    const warns: string[] = [];
    expect(loadPrograms('world/gear', (m) => warns.push(m))).toHaveLength(8);
    expect(warns).toEqual([]);
  });
});
