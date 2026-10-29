import { describe, expect, it } from 'vitest';
import { splitBubbles, textsBlock, MAX_BUBBLES, MAX_TEXT_CHARS, TEXT_WINDOW_MIN, TEXTS_IN_BLOCK } from './texts';
import type { ChatMessage } from './types';

const row = (id: string, clock: number, role: 'user' | 'agent', text = id): ChatMessage => ({ id, role, text, toolLines: [], ts: clock, status: 'ok', mode: 'text', clock });

describe('splitBubbles (deck spec §4)', () => {
  it('a photo line is never merged into words (photos spec §3)', () => {
    expect(splitBubbles('a\nb\nc\nd\n[photo: roof]')).toEqual(['a', 'b', 'c d', '[photo: roof]']);
  });

  it('splits lines and drops blanks', () => {
    expect(splitBubbles('till four\n\nslow night\n')).toEqual(['till four', 'slow night']);
  });
  it('strips actions', () => {
    expect(splitBubbles('*shrugs* fine')).toEqual(['fine']);
    expect(splitBubbles('*sighs*')).toEqual([]);
    expect(splitBubbles('  \n *looks up*\n')).toEqual([]);
  });
  it('caps at four, joining the rest', () => {
    expect(splitBubbles('a\nb\nc\nd\ne\nf')).toEqual(['a', 'b', 'c', 'd e f']);
  });
  it('limits', () => {
    expect([MAX_BUBBLES, MAX_TEXT_CHARS, TEXT_WINDOW_MIN, TEXTS_IN_BLOCK]).toEqual([4, 500, 1440, 8]);
  });
});

describe('textsBlock with photos (photos spec §4)', () => {
  it('her photo reads as its caption', () => {
    const rows = [{ id: 'a', role: 'agent' as const, text: 'look\n[photo: desk]', toolLines: [], ts: 1, status: 'ok' as const, mode: 'text' as const, clock: 100 }];
    expect(textsBlock(rows, 100, { you: 'Hicks', her: 'Nix' }, (id) => (id === 'desk' ? 'the desk' : null))).toBe('[texts, earlier: Nix: look · Nix: (sent a photo: the desk)]');
  });
});

describe('textsBlock (deck spec §3)', () => {
  const names = { you: 'you', her: 'Nix' };
  it('picks the newest 8 within a day, oldest first', () => {
    const now = 10000;
    const rows = [row('old1', now - 1500, 'user'), row('old2', now - 1500, 'agent')];
    for (let i = 1; i <= 12; i++) rows.push(row(`t${i}`, now - 12 + i, i % 2 === 1 ? 'user' : 'agent'));
    expect(textsBlock(rows, now, names)).toBe('[texts, earlier: you: t5 · Nix: t6 · you: t7 · Nix: t8 · you: t9 · Nix: t10 · you: t11 · Nix: t12]');
  });
  it("a reply's bubbles are separate items; failed rows are left out", () => {
    const rows = [row('a', 100, 'user', 'up?'), { ...row('f', 101, 'user', 'lost one'), status: 'failed' as const }, row('b', 102, 'agent', 'yeah\nroof')];
    expect(textsBlock(rows, 200, names)).toBe('[texts, earlier: you: up? · Nix: yeah · Nix: roof]');
  });
  it('a promised row (the line her text answers) is left out', () => {
    const rows = [{ ...row('p', 100, 'user', "[you told hicks you'd text]"), promised: true as const }, row('b', 101, 'agent', 'home.')];
    expect(textsBlock(rows, 200, names)).toBe('[texts, earlier: Nix: home.]');
  });
  it('is null with no recent texts', () => {
    expect(textsBlock([], 100, names)).toBeNull();
    expect(textsBlock([row('x', 0, 'user')], 5000, names)).toBeNull();
  });
});
