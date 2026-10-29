import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDecks } from './gear';
import { SAMPLE, block } from './gear.fixture';

describe('parseDecks', () => {
  it('parses every block', () => {
    const r = parseDecks(SAMPLE);
    expect(r.problems).toEqual([]);
    expect(r.decks.map((d) => d.id)).toEqual(['meridian', 'stall-build', 'pocket-deck']);
    expect(r.decks[1]).toEqual({ id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'] });
  });

  it('skips a bad block with a problem', () => {
    for (const bad of <Record<string, string>[]>[{ id: 'b1', traits: '[shiny]' }, { id: 'b2', bonus: '60' }, { id: 'b3', heat: '11' }, { id: 'meridian' }]) {
      const r = parseDecks(SAMPLE + block(bad));
      expect(r.problems).toHaveLength(1);
      expect(r.decks.map((d) => d.id)).toEqual(['meridian', 'stall-build', 'pocket-deck']);
    }
  });

  it('reads a skin; none is absent; an unknown one is a problem', () => {
    expect(parseDecks(block({ id: 's1', skin: 'amber' })).decks[0].skin).toBe('amber');
    expect(parseDecks(block({ id: 's2' })).decks[0].skin).toBeUndefined();
    const bad = parseDecks(block({ id: 's3', skin: 'chrome' }));
    expect(bad.decks).toHaveLength(0);
    expect(bad.problems).toHaveLength(1);
  });

  it('the live catalog gives every deck its skin', () => {
    const r = parseDecks(fs.readFileSync('world/gear/decks.md', 'utf8'));
    expect(Object.fromEntries(r.decks.map((d) => [d.id, d.skin]))).toEqual({
      meridian: 'meridian', 'deaf-meridian': 'meridian-deaf', 'dock-slate': 'dock', 'stall-build': 'slab',
      'pocket-deck': 'pocket', 'field-deck': 'sentinel', 'old-karasu': 'amber', 'chrome-deck': 'holo',
    });
  });

  it('the live catalog parses clean', () => {
    const r = parseDecks(fs.readFileSync('world/gear/decks.md', 'utf8'));
    expect(r.problems).toEqual([]);
    expect(r.decks).toHaveLength(8);
  });
});

