import { describe, expect, it } from 'vitest';
import { JOURNAL_LINE_MAX, NOTE_MATCH_MAX, journalLineOf } from './journal-line';
import type { Note } from './types';

const note = (id: string, text: string, o: Partial<Note> = {}): Note => ({
  id,
  text,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  editedBy: 'agent',
  about: 'you',
  keys: [],
  ...o,
});

describe('journalLineOf', () => {
  it('is null with no notes', () => {
    expect(journalLineOf([], [])).toBeNull();
  });

  it('always lists pins', () => {
    expect(journalLineOf([note('n1', 'Owes Hae for noodles.', { pinned: true })], [])).toBe('[journal (pinned): n1 (you) Owes Hae for noodles.]');
  });

  it('lists a keyed note only when a recent line mentions its key', () => {
    const notes = [note('n1', 'Lost the chrome hand at the docks.', { keys: ['chrome hand'] })];
    expect(journalLineOf(notes, ['nothing here'])).toBe('[journal: 1 note]');
    expect(journalLineOf(notes, ['what happened to your chrome hand?'])).toBe('[journal: came up: n1 (you) Lost the chrome hand at the docks.]');
  });

  it('orders matches by the most recent mention, then id', () => {
    const notes = [note('n2', 'B.', { keys: ['ferry'] }), note('n1', 'A.', { keys: ['pier'] }), note('n3', 'C.', { keys: ['pier'] })];
    expect(journalLineOf(notes, ['the ferry', 'the pier'])).toBe('[journal: came up: n2 (you) B. · n1 (you) A. · n3 (you) C.]');
  });

  it(`keeps at most ${NOTE_MATCH_MAX} matches and counts the rest`, () => {
    const notes = Array.from({ length: 7 }, (_, i) => note(`n${i + 1}`, `N${i + 1}.`, { keys: ['rain'] }));
    const line = journalLineOf(notes, ['rain'])!;
    expect(line.match(/\(you\)/g)).toHaveLength(NOTE_MATCH_MAX);
    expect(line).toContain('2 more notes');
  });

  it(`drops matches from the end past ${JOURNAL_LINE_MAX} characters, never pins`, () => {
    const long = 'x'.repeat(270);
    const notes = [note('n1', long, { pinned: true }), ...Array.from({ length: 5 }, (_, i) => note(`n${i + 2}`, long, { keys: ['rain'] }))];
    const many = [...notes, ...Array.from({ length: 6 }, (_, i) => note(`n${i + 10}`, long, { pinned: true }))];
    const line = journalLineOf(many, ['rain'])!;
    expect(line.length).toBeLessThanOrEqual(JOURNAL_LINE_MAX);
    expect(line.match(/\[pinned\]|\(you\)/g)!.length).toBeGreaterThanOrEqual(7);
  });
});
