import { describe, expect, test } from 'vitest';
import { defaultCounts, gigPrompt, PAPERS_HINT, type GigPromptInput } from './prompt';
import { BRIEF_BODY_MAX, BRIEF_FIELD_MAX, BRIEF_TITLE_MAX, gigFile, type Brief } from './brief';
import { splitDrafts, type LoreEntry } from '../lore';

const held: Brief = { id: 'night-pilot', title: 'Night Pilot', tier: 'hard', kind: 'papers', place: 'the-tilt', client: 'A pilot, through the Ferrymen', target: 'Tidal Isle · customs, booth nine', take: 'one crossing', text: 'A pilot who flew the wrong cargo once.' };
const lore = (title: string, body: string): LoreEntry => ({ id: title.toLowerCase(), title, keys: [], districts: [], places: [], always: false, body });
const input = (o: Partial<GigPromptInput> = {}): GigPromptInput => ({
  place: { id: 'the-tilt', name: 'The Tilt', district: 'Karasu' },
  room: 'A bar whose floor runs downhill.',
  counts: { easy: 1, medium: 2, hard: 0 },
  existing: [held],
  lore: [lore('Lowlight', 'The city.'), lore('Voltaic Logistics', 'Moves everything.')],
  ...o,
});
const HEADS = ['## What to write', '## How many', '## Format', '## Style', '## Already on this board', '## The place', '## Lore', '## Answer'];

describe('gigPrompt', () => {
  test('the sections, in order', () => {
    const p = gigPrompt(input());
    const at = HEADS.map((h) => p.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(p).toContain('The Tilt');
    expect(p).toContain('Karasu');
  });
  test('how many: only tiers asked for, each a papers job with its hint', () => {
    const p = gigPrompt(input());
    expect(p).toContain(`- 1 easy papers job: ${PAPERS_HINT}`);
    expect(p).toContain(`- 2 medium papers jobs: ${PAPERS_HINT}`);
    expect(p).not.toContain('hard papers');
    expect(p).toMatch(/3 job briefs/);
  });
  test('the format: every limit, the place id, an example file', () => {
    const p = gigPrompt(input());
    for (const n of [BRIEF_TITLE_MAX, BRIEF_FIELD_MAX, BRIEF_BODY_MAX]) expect(p).toContain(String(n));
    expect(p).toContain('place: the-tilt');
    expect(p).toContain(gigFile(held).trim());
  });
  test('with no jobs yet, the example is First Boat and the board says none yet', () => {
    const p = gigPrompt(input({ existing: [] }));
    expect(p).toContain('none yet');
    expect(p).toContain('title: First Boat');
    expect(p).toContain('kind: papers');
  });
  test('already on this board lists title — client → target', () => {
    expect(gigPrompt(input())).toContain('Night Pilot — A pilot, through the Ferrymen → Tidal Isle · customs, booth nine');
  });
  test('lore in the given order, each under its own heading; no room, no place section', () => {
    const p = gigPrompt(input({ room: null }));
    expect(p.indexOf('### Lowlight')).toBeLessThan(p.indexOf('### Voltaic Logistics'));
    expect(p).toContain('Moves everything.');
    expect(p).not.toContain('## The place');
  });
  test('no hacks, slips or payouts asked for', () => {
    const p = gigPrompt(input());
    expect(p).not.toMatch(/\bICE\b|lacquer|slip|netrunner/i);
    expect(p).toMatch(/no payouts or prices/i);
  });
  test("an answer written as asked splits into drafts with LORE's splitter", () => {
    const answer = ['```', gigFile({ ...held, id: 'a', title: 'One' }).trim(), gigFile({ ...held, id: 'b', title: 'Two' }).trim(), '```'].join('\n');
    expect(gigPrompt(input())).toMatch(/one ``` code block/);
    expect(splitDrafts(answer)).toHaveLength(2);
  });
});

describe('defaultCounts', () => {
  test('fills the gaps', () => {
    expect(defaultCounts({ easy: 2, medium: 0, hard: 1 })).toEqual({ easy: 0, medium: 1, hard: 0 });
    expect(defaultCounts({ easy: 0, medium: 0, hard: 0 })).toEqual({ easy: 1, medium: 1, hard: 1 });
  });
  test('all covered: one of each', () => {
    expect(defaultCounts({ easy: 1, medium: 3, hard: 1 })).toEqual({ easy: 1, medium: 1, hard: 1 });
  });
});

test('no lore ticked: no empty Lore section', () => {
  expect(gigPrompt(input({ lore: [] }))).not.toContain('## Lore');
});
