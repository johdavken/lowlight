import { describe, expect, it } from 'vitest';
import { HABITS_MAX_TOKENS, habitsMessages, parseHabitsAnswer, type HabitsRunInput } from '../src/habits-run';

const input = (over: Partial<HabitsRunInput> = {}): HabitsRunInput => ({
  self: 'Silas',
  player: 'Hicks',
  lines: [
    { speaker: 'them', text: 'x'.repeat(250) },
    { speaker: 'her', text: '*pushes his glasses up* "Sure."' },
  ],
  current: [],
  ...over,
});

describe('habitsMessages (habits spec §1.3)', () => {
  it('a system message on the two kinds and the JSON shape, and a user message of the lines', () => {
    expect(HABITS_MAX_TOKENS).toBe(400);
    const [system, user] = habitsMessages(input());
    expect(system.role).toBe('system');
    for (const s of ['Body business', 'Prose shape', 'Never quote', '{"rules"']) expect(system.content).toContain(s);
    expect(user.content).toContain('Silas: *pushes his glasses up* "Sure."');
    expect(user.content).toContain(`Hicks: ${'x'.repeat(200)}`);
    expect(user.content).not.toContain('x'.repeat(201));
    expect(user.content).toContain('none yet');
  });

  it('shows the current rules when there are some', () => {
    const [, user] = habitsMessages(input({ current: ['No glasses business'] }));
    expect(user.content).toContain('No glasses business');
    expect(user.content).not.toContain('none yet');
  });
});

describe('parseHabitsAnswer (habits spec §1.4)', () => {
  it('an object, a bare array, fenced JSON, an empty list', () => {
    expect(parseHabitsAnswer('{"rules":["No glasses business"]}', [])).toEqual({ rules: ['No glasses business'], refused: [] });
    expect(parseHabitsAnswer('["A","B"]', [])).toEqual({ rules: ['A', 'B'], refused: [] });
    expect(parseHabitsAnswer('```json\n{"rules":["A"]}\n```', [])).toEqual({ rules: ['A'], refused: [] });
    expect(parseHabitsAnswer('{"rules":[]}', [])).toEqual({ rules: [], refused: [] });
  });

  it('null without readable JSON', () => {
    expect(parseHabitsAnswer('nothing here', [])).toBeNull();
    expect(parseHabitsAnswer('{"other":1}', [])).toBeNull();
    // An object without rules isn't a bare array, whatever brackets it holds.
    expect(parseHabitsAnswer('{"notes":[]}', [])).toBeNull();
  });

  it('a blank or non-string rule costs only itself', () => {
    expect(parseHabitsAnswer('{"rules":["A","  ","C"]}', [])).toEqual({ rules: ['A', 'C'], refused: ['habits: rule 2 empty'] });
    expect(parseHabitsAnswer('{"rules":[3,"B"]}', [])).toEqual({ rules: ['B'], refused: ['habits: rule 1 empty'] });
  });

  it('90 characters pass, 91 are too long', () => {
    expect(parseHabitsAnswer(JSON.stringify({ rules: ['a'.repeat(90)] }), [])!.rules).toHaveLength(1);
    expect(parseHabitsAnswer(JSON.stringify({ rules: ['a'.repeat(91)] }), [])).toEqual({ rules: [], refused: ['habits: rule 1 too long'] });
  });

  it('four of her words in a row are refused, through case, punctuation and curly quotes', () => {
    const hers = ['*Pushes his glasses up.* "Sure."', '*She doesn’t look up from the slate.*'];
    expect(parseHabitsAnswer('{"rules":["Stop: pushes his GLASSES up!"]}', hers)!.refused).toEqual(['habits: rule 1 quotes her']);
    expect(parseHabitsAnswer('{"rules":["No pushing his glasses"]}', hers)!.rules).toEqual(['No pushing his glasses']);
    expect(parseHabitsAnswer(`{"rules":["Less of: doesn't look up from"]}`, hers)!.refused).toEqual(['habits: rule 1 quotes her']);
  });

  it("her words in single quotes, straight or curly, are still hers (final review I1)", () => {
    const hers = ['She runs her thumb along the chipped rim of the cup.'];
    expect(parseHabitsAnswer(`{"rules":["No 'thumb along the chipped rim' business"]}`, hers)!.refused).toEqual(['habits: rule 1 quotes her']);
    expect(parseHabitsAnswer('{"rules":["No ‘thumb along the chipped rim’ business"]}', hers)!.refused).toEqual(['habits: rule 1 quotes her']);
  });

  it('five kept, the rest past five', () => {
    const rules = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    expect(parseHabitsAnswer(JSON.stringify({ rules }), [])).toEqual({ rules: rules.slice(0, 5), refused: ['habits: rule 6 past five', 'habits: rule 7 past five'] });
  });
});
