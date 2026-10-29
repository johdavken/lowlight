import { describe, expect, it } from 'vitest';
import { diceText } from '../../shared/dice/text';
import type { ChatMessage } from '../../shared/types';
import { buildMessages, CONTINUE_INSTRUCTION, HISTORY_MAX_CHARS, HISTORY_MAX_MESSAGES, HISTORY_STEP } from '../src/history';
import { END_SCENE_PLACEHOLDER, GREET_PLACEHOLDER } from '../src/instructions';
import { gigText } from '../../shared/gig/brief';

let n = 0;
const msg = (role: 'user' | 'agent', text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`,
  role,
  text,
  toolLines: [],
  ts: n,
  status: 'ok',
  ...extra,
});
const reply = (text = 'Now.') => ({ kind: 'reply' as const, contextLines: ['[room: rain]', '[you: Hicks]'], text });

describe('buildMessages', () => {
  it('system, then history oldest first, then the turn with its context lines', () => {
    const out = buildMessages({ instructions: 'Be Nix.', history: [msg('user', 'Hi'), msg('agent', 'Hey.')], turn: reply() });
    expect(out).toEqual([
      { role: 'system', content: 'Be Nix.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hey.' },
      { role: 'user', content: '[room: rain]\n[you: Hicks]\n\nNow.' },
    ]);
  });

  it('marks OOC lines and leaves out failed, lost and streaming lines', () => {
    const out = buildMessages({
      instructions: 's',
      history: [
        msg('user', 'quick question', { mode: 'ooc' }),
        msg('agent', 'sure', { mode: 'ooc' }),
        msg('user', 'never sent', { status: 'failed' }),
        msg('agent', 'cut off', { status: 'lost' }),
        msg('agent', 'still going', { status: 'streaming' }),
      ],
      turn: reply(),
    });
    expect(out.slice(1, -1)).toEqual([
      { role: 'user', content: '(OOC) quick question' },
      { role: 'assistant', content: 'sure' },
    ]);
  });

  it('leaves out empty lines (a reply that only used tools) — some providers refuse empty messages (I2)', () => {
    const out = buildMessages({ instructions: 's', history: [msg('user', 'dim the lamp'), msg('agent', ''), msg('agent', '   ')], turn: reply() });
    expect(out.slice(1, -1)).toEqual([{ role: 'user', content: 'dim the lamp' }]);
  });

  const lines = (count: number) => Array.from({ length: count }, (_, i) => msg(i % 2 ? 'agent' : 'user', `line ${i}`));
  const firstLine = (count: number) => buildMessages({ instructions: 's', history: lines(count), turn: reply() })[1].content;

  it(`sends the whole history while it fits ${HISTORY_MAX_MESSAGES} messages`, () => {
    const out = buildMessages({ instructions: 's', history: lines(40), turn: reply() });
    expect(out).toHaveLength(1 + 40 + 1);
    expect(out[1].content).toBe('line 0');
  });

  it(`over ${HISTORY_MAX_MESSAGES} messages, the start jumps ${HISTORY_STEP} at a time (the prompt cache survives between jumps — I3)`, () => {
    expect(HISTORY_STEP).toBe(20);
    expect(firstLine(41)).toBe('line 20');
    expect(firstLine(45)).toBe('line 20');
    expect(firstLine(60)).toBe('line 20');
    expect(firstLine(61)).toBe('line 40');
    expect(buildMessages({ instructions: 's', history: lines(60), turn: reply() })).toHaveLength(1 + 40 + 1);
  });

  it('the stepped start also follows the character budget', () => {
    const history = Array.from({ length: 30 }, (_, i) => msg('user', `${i}:`.padEnd(1500, 'x')));
    const out = buildMessages({ instructions: 's', history, turn: reply() });
    // Sliding would start at 9 (21 × 1,500 ≤ 32,000); stepped starts at 20.
    expect(out.slice(1, -1).map((m) => m.content.split(':')[0])).toEqual(Array.from({ length: 10 }, (_, i) => String(20 + i)));
  });

  it(`keeps whole messages within ${HISTORY_MAX_CHARS} characters`, () => {
    const history = Array.from({ length: 5 }, (_, i) => msg('user', String(i).repeat(10_000)));
    const out = buildMessages({ instructions: 's', history, turn: reply() });
    expect(out.slice(1, -1).map((m) => m.content[0])).toEqual(['2', '3', '4']);
  });

  it('one message bigger than the whole budget: no history, the turn still goes (Review Focus 1)', () => {
    const out = buildMessages({ instructions: 's', history: [msg('user', 'old'), msg('agent', 'x'.repeat(40_000))], turn: reply() });
    expect(out).toEqual([{ role: 'system', content: 's' }, { role: 'user', content: '[room: rain]\n[you: Hicks]\n\nNow.' }]);
  });

  it('an empty end line becomes the placeholder; one with text gets it appended', () => {
    const out = buildMessages({
      instructions: 'S',
      history: [
        { id: 'u', role: 'user', text: '', toolLines: [], ts: 1, status: 'ok', mode: 'end' },
        { id: 'a', role: 'agent', text: 'bye', toolLines: [], ts: 2, status: 'ok', mode: 'end' },
      ],
      turn: { kind: 'reply', contextLines: ['[room: x]'], text: '*waves*' },
    });
    expect(out[1]).toEqual({ role: 'user', content: END_SCENE_PLACEHOLDER });
    expect(out[2]).toEqual({ role: 'assistant', content: 'bye' });
  });

  it('an end line with text gets the placeholder appended after a blank line', () => {
    const out = buildMessages({
      instructions: 'S',
      history: [{ id: 'u', role: 'user', text: 'one last thing', toolLines: [], ts: 1, status: 'ok', mode: 'end' }],
      turn: reply(),
    });
    expect(out[1]).toEqual({ role: 'user', content: `one last thing\n\n${END_SCENE_PLACEHOLDER}` });
  });

  it('a leave line gets the leave placeholder', () => {
    const out = buildMessages({
      instructions: 'S',
      history: [{ id: 'u', role: 'user', text: 'bye', toolLines: [], ts: 1, status: 'ok', mode: 'end', leave: true }],
      turn: reply(),
    });
    expect(out[1]).toEqual({ role: 'user', content: 'bye\n\n[the user leaves]' });
  });

  it('an empty greet line becomes the greet placeholder; her greeting is an ordinary reply', () => {
    const out = buildMessages({
      instructions: 'S',
      history: [
        { id: 'g', role: 'user', text: '', toolLines: [], ts: 1, status: 'ok', mode: 'greet' },
        { id: 'a', role: 'agent', text: '*looks up* You again.', toolLines: [], ts: 2, status: 'ok', mode: 'greet' },
      ],
      turn: reply(),
    });
    expect(out[1]).toEqual({ role: 'user', content: GREET_PLACEHOLDER });
    expect(out[2]).toEqual({ role: 'assistant', content: '*looks up* You again.' });
  });

  it('a failed greet line is dropped', () => {
    const out = buildMessages({
      instructions: 'S',
      history: [{ id: 'g', role: 'user', text: '', toolLines: [], ts: 1, status: 'failed', mode: 'greet' }],
      turn: reply(),
    });
    expect(out).toHaveLength(2);
  });

  it('a continue turn ends with the continue instruction after her reply', () => {
    const out = buildMessages({ instructions: 's', history: [msg('user', 'Go on'), msg('agent', 'She paused')], turn: { kind: 'continue' } });
    expect(out.at(-2)).toEqual({ role: 'assistant', content: 'She paused' });
    expect(out.at(-1)).toEqual({ role: 'user', content: CONTINUE_INSTRUCTION });
    expect(CONTINUE_INSTRUCTION).toBe("(Continue your previous reply exactly where it stopped. Don't repeat any of it, don't restart, don't add commentary.)");
  });
});

describe('the opening scene row', () => {
  it('never becomes a completion message', () => {
    const scene = msg('user', 'Rain has shut the Ribbon.', { mode: 'scene', scene: { title: 'After closing', source: 'generated' } });
    const out = buildMessages({ instructions: 'SYS', history: [scene, msg('agent', 'You came.')], turn: { kind: 'reply', contextLines: [], text: 'hi' } });
    expect(JSON.stringify(out)).not.toContain('Rain has shut');
  });
});

describe('the gig row', () => {
  const turn = { kind: 'reply' as const, contextLines: [], text: 'hi' };
  const gig = { you: 'Hicks', title: 'Held Pay', tier: 'hard' as const, place: 'The Tilt', client: 'C', target: 'T', take: 'K', brief: 'B.', result: 'clean' as const, trace: 8, max: 14 };
  it('reads as its [gig] line, where it happened', () => {
    const g = msg('user', '*Hicks jacks in.*', { mode: 'gig', gig });
    const out = buildMessages({ instructions: 'SYS', history: [msg('agent', 'Go on.'), g, msg('agent', 'Clean.')], turn });
    expect(out.slice(1, 4)).toEqual([
      { role: 'assistant', content: 'Go on.' },
      { role: 'user', content: gigText(gig) },
      { role: 'assistant', content: 'Clean.' },
    ]);
  });
  it('a failed one is dropped', () => {
    const out = buildMessages({ instructions: 'SYS', history: [msg('user', 'x', { mode: 'gig', gig, status: 'failed' })], turn });
    expect(JSON.stringify(out)).not.toContain('[gig:');
  });
});

describe('the encounter row', () => {
  const turn = { kind: 'reply' as const, contextLines: [], text: 'hi' };
  it('reads [event: …] as a user line, where it happened', () => {
    const e = msg('user', 'A courier drops a box\non the counter', { mode: 'encounter', encounter: { title: 'Wrong "package"' } });
    const out = buildMessages({ instructions: 'SYS', history: [msg('agent', 'Eat.'), e, msg('agent', 'That is not my name.')], turn });
    expect(out.slice(1, 4)).toEqual([
      { role: 'assistant', content: 'Eat.' },
      { role: 'user', content: `[event: "Wrong 'package'": A courier drops a box on the counter.]` },
      { role: 'assistant', content: 'That is not my name.' },
    ]);
  });

  it('a failed one is dropped', () => {
    const e = msg('user', 'A knock.', { mode: 'encounter', encounter: { title: 'T' }, status: 'failed' });
    const out = buildMessages({ instructions: 'SYS', history: [e], turn });
    expect(JSON.stringify(out)).not.toContain('[event:');
  });
});

describe('the dice row', () => {
  const turn = { kind: 'reply' as const, contextLines: [], text: 'hi' };
  const dice = { you: 'Hicks', her: 'Nix', stake: 'a drink', result: 'won' as const, rounds: [{ round: 1, bids: [{ q: 2, face: 4 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [4, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 2, face: 4 as const, by: 'you' as const }, count: 1, loser: 'you' as const, left: { you: 0, her: 2 } }], lines: [null] };
  it('reads as its [dice] line, where it happened', () => {
    const d = msg('user', '*Hicks plays.*', { mode: 'dice', dice });
    const out = buildMessages({ instructions: 'SYS', history: [msg('agent', 'Deal.'), d, msg('agent', 'Fine.')], turn });
    expect(out.slice(1, 4)).toEqual([
      { role: 'assistant', content: 'Deal.' },
      { role: 'user', content: diceText(dice) },
      { role: 'assistant', content: 'Fine.' },
    ]);
  });
});

describe('quest and job rows', () => {
  it('a job row reaches her as a [job] line, a quest row as a [quest] line', () => {
    const out = buildMessages({
      instructions: 'Be Nix.',
      history: [
        msg('user', 'A Sentinel at the line.', { mode: 'quest', quest: { id: 'last-ferry', title: 'Last Ferry', beat: 'sentinel', run: 'last-ferry@0' } }),
        msg('user', 'Boots on the stairs.', { mode: 'quest', quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel' } }),
      ],
      turn: reply(),
    });
    expect(out[1].content).toBe('[job — Last Ferry: A Sentinel at the line.]');
    expect(out[2].content).toBe('[quest — Paper Trail: Boots on the stairs.]');
  });
});
