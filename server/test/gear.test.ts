import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDecks } from '../src/gear';
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
    const warns: string[] = [];
    expect(Object.keys(loadStock('world/gear', decks, (m) => warns.push(m))).sort()).toEqual(['second-socket', 'the-tilt', 'under-the-cat']);
    expect(warns).toEqual([]);
    expect(loadStock('/nonexistent', decks, () => {})).toEqual({});
  });
});
