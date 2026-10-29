import { describe, expect, it } from 'vitest';
import { StrayCallFilter } from '../src/stray-calls';

/** Streams `chunks` through a fresh filter and returns everything it let out. */
function run(chunks: string[]): { out: string; pieces: string[] } {
  const f = new StrayCallFilter();
  const pieces = chunks.map((c) => f.push(c));
  pieces.push(f.flush());
  return { out: pieces.join(''), pieces };
}

describe('StrayCallFilter', () => {
  it("drops a line that is a tool call written out (Cass: '*set_expression name: neutral*')", () => {
    const text = '*the screens go black*\n\n*set_expression name: neutral*\n\nWell. That\'s not ideal.';
    expect(run([text]).out).toBe("*the screens go black*\n\nWell. That's not ideal.");
  });

  it('drops one that arrives in small pieces, and other call shapes', () => {
    expect(run(['Hi.\n', '*set_', 'exp', 'ression name', ': happy*', '\nBye.']).out).toBe('Hi.\nBye.');
    expect(run(['apply_preset(quiet)\nShe dims the lamps.']).out).toBe('She dims the lamps.');
    expect(run(['set_light {"light_id": "lamp"}']).out).toBe('');
  });

  it('keeps story lines that only look like it for a word or two', () => {
    for (const text of ['*sets the rag down*', '*a long pause*', 'Note: the fridge is off.', 'She says the set_light thing is broken.']) {
      expect(run([text]).out).toBe(text);
    }
  });

  it('holds only the first word of an ordinary line: the rest streams straight through', () => {
    const { pieces } = run(['*sets', ' the rag down and looks up', ' at you*']);
    expect(pieces[0]).toBe('');
    expect(pieces[1]).toBe('*sets the rag down and looks up');
    expect(pieces[2]).toBe(' at you*');
  });

  it("drops a line that starts with a tool's name, even narrated (Cass: '*set_light calls for room_1 through room_6 — all to 0*')", () => {
    const text = '*the neon sputters out*\n\n*set_light calls for room_1 through room_6 and monitors — all to 0*\n\nWell. That\'s atmospheric.';
    expect(run([text]).out).toBe("*the neon sputters out*\n\nWell. That's atmospheric.");
    expect(run(['*set_light*\nok']).out).toBe('ok');
  });

  it('a tool name mid-line is left alone (only whole lines are calls)', () => {
    const text = 'She says set_light name: x would be odd.';
    expect(run([text]).out).toBe(text);
  });
});
