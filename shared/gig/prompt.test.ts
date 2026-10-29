import { describe, expect, test } from 'vitest';
import { defaultCounts, gigPrompt, SLIP_TIER_HINT, TIER_HINT, type GigPromptInput } from './prompt';
import { BRIEF_BODY_MAX, BRIEF_FIELD_MAX, BRIEF_TITLE_MAX, gigFile, type Brief } from './brief';
import { splitDrafts, type LoreEntry } from '../lore';

const held: Brief = { id: 'held-pay', title: 'Held Pay', tier: 'hard', place: 'the-tilt', client: 'Nobody, through the Switchboard', target: 'Glass Orchid · house ledger', take: "one worker's held payout, released", text: 'Thick lacquer.' };
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
  test('how many: only tiers asked for, each with its hint', () => {
    const p = gigPrompt(input());
    expect(p).toContain(`- 1 easy: ${TIER_HINT.easy}`);
    expect(p).toContain(`- 2 medium: ${TIER_HINT.medium}`);
    expect(p).not.toContain('hard:');
    expect(p).toMatch(/3 job briefs/);
  });
  test('the format: every limit, the place id, an example file', () => {
    const p = gigPrompt(input());
    for (const n of [BRIEF_TITLE_MAX, BRIEF_FIELD_MAX, BRIEF_BODY_MAX]) expect(p).toContain(String(n));
    expect(p).toContain('place: the-tilt');
    expect(p).toContain(gigFile(held).trim());
  });
  test('with no jobs yet, the example is Held Pay and the board says none yet', () => {
    const p = gigPrompt(input({ existing: [] }));
    expect(p).toContain('none yet');
    expect(p).toContain('title: Held Pay');
  });
  test('already on this board lists title — client → target', () => {
    expect(gigPrompt(input())).toContain('Held Pay — Nobody, through the Switchboard → Glass Orchid · house ledger');
  });
  test('lore in the given order, each under its own heading; no room, no place section', () => {
    const p = gigPrompt(input({ room: null }));
    expect(p.indexOf('### Lowlight')).toBeLessThan(p.indexOf('### Voltaic Logistics'));
    expect(p).toContain('Moves everything.');
    expect(p).not.toContain('## The place');
  });
  test('corp security is lacquer, never ICE; no payouts', () => {
    const p = gigPrompt(input());
    expect(p).not.toMatch(/\bICE\b/);
    expect(p).toMatch(/lacquer/);
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

describe('slips in the prompt (Slip spec §8)', () => {
  test('no slips asked for (or all zero): the prompt is exactly the hack prompt', () => {
    expect(gigPrompt(input({ slips: { easy: 0, medium: 0, hard: 0 } }))).toBe(gigPrompt(input()));
  });
  test('slips asked for: counted, hinted, kind: slip in the format, a slip example when one exists', () => {
    const slip: Brief = { ...held, id: 'back-office', title: 'Back Office', tier: 'medium', kind: 'slip', target: 'Glass Orchid · back office' };
    const p = gigPrompt(input({ slips: { easy: 0, medium: 1, hard: 0 }, existing: [held, slip] }));
    expect(p).toMatch(/4 job briefs/);
    expect(p).toContain(`- 1 medium slip: ${SLIP_TIER_HINT.medium}`);
    expect(p).toContain('kind: slip');
    expect(p).toContain(gigFile(slip).trim());
    expect(SLIP_TIER_HINT).toEqual({
      easy: 'one guard on a post or a short beat, a camera, a booth to hide in',
      medium: 'two guards (one may walk a loop), a sweeping camera, two hiding spots',
      hard: "three guards, two cameras, two hiding spots; you'll need the kit",
    });
  });
});

describe('papers in the prompt (Papers spec §8)', () => {
  const base = { place: { id: 'ferry-stairs', name: 'The Ferry Stairs', district: 'Tidal Isle' }, room: null, counts: { easy: 0, medium: 0, hard: 0 }, existing: [], lore: [] };
  test('asks for papers jobs with their own hint and kind line', () => {
    const p = gigPrompt({ ...base, papers: { easy: 0, medium: 1, hard: 0 } });
    expect(p).toContain('- 1 medium papers job: a person crossing through the Ferrymen; the target is a customs booth on Tidal Isle; the take is the crossing');
    expect(p).toContain('`kind: papers`');
  });
  test('none asked for leaves the prompt as it was', () => {
    expect(gigPrompt({ ...base, counts: { easy: 1, medium: 0, hard: 0 }, papers: { easy: 0, medium: 0, hard: 0 } })).toBe(gigPrompt({ ...base, counts: { easy: 1, medium: 0, hard: 0 } }));
  });
});
