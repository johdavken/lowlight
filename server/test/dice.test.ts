import { describe, expect, it, vi } from 'vitest';
import { diceLinePrompt, makeDiceLiner, parseDiceLine, DICE_LINE_TIMEOUT_MS } from '../src/dice';
import type { RoundRecord } from '../../shared/dice/rules';

const record: RoundRecord = { round: 2, bids: [{ q: 4, face: 5, by: 'you' }], caller: 'her', dice: { you: [5, 5, 1, 2], her: [6, 6, 2, 3, 4] }, bid: { q: 4, face: 5, by: 'you' }, count: 3, loser: 'you', left: { you: 3, her: 5 } };
const base = { identity: 'You are Cass, a bartender.', room: 'The Tilt', you: 'Hicks', her: 'Cass', stake: 'a drink', record, recent: ['Hicks: Deal me in.'], expressions: ['smile', 'annoyed'] };

describe('diceLinePrompt', () => {
  it('carries her identity, the stake, the round from her side, the recent lines and her faces', () => {
    const [sys, user] = diceLinePrompt(base);
    expect(sys.role).toBe('system');
    expect(sys.content).toContain('You are Cass, a bartender.');
    expect(sys.content).toContain("You're playing liar's dice with Hicks, for a drink.");
    expect(sys.content).toContain('smile, annoyed, or neutral');
    expect(sys.content).toContain('Answer only with JSON: {"line": "...", "expression": "..."}');
    expect(user.content).toContain('Hicks: Deal me in.');
    expect(user.content).toContain('round 2: Hicks bid four 5s, you called, there were 3, Hicks lost a die');
    expect(user.content).toContain('Dice left: you 5, Hicks 3.');
    expect(user.content).toContain('Where: The Tilt.');
  });
});

describe('parseDiceLine', () => {
  const names = ['smile', 'annoyed'];
  it('clean JSON', () => expect(parseDiceLine('{"line": "Collar again.", "expression": "smile"}', names)).toEqual({ line: 'Collar again.', expression: 'smile' }));
  it('JSON inside prose', () => expect(parseDiceLine('Sure! {"line":"Nope.","expression":"annoyed"} hope that helps', names)).toEqual({ line: 'Nope.', expression: 'annoyed' }));
  it('an unknown or neutral face is null', () => {
    expect(parseDiceLine('{"line":"Hm.","expression":"furious"}', names)).toEqual({ line: 'Hm.', expression: null });
    expect(parseDiceLine('{"line":"Hm.","expression":"neutral"}', names)).toEqual({ line: 'Hm.', expression: null });
  });
  it('quotes around the line are stripped; a long line is cut to 200', () => {
    expect(parseDiceLine('{"line":"\\"Gotcha.\\"","expression":"smile"}', names)!.line).toBe('Gotcha.');
    expect(parseDiceLine(`{"line":"${'x'.repeat(300)}","expression":"smile"}`, names)!.line).toHaveLength(200);
  });
  it('garbage or an empty line is null', () => {
    expect(parseDiceLine('no json here', names)).toBeNull();
    expect(parseDiceLine('{"line":"   ","expression":"smile"}', names)).toBeNull();
    expect(parseDiceLine('{"line": broken', names)).toBeNull();
  });
});

describe('makeDiceLiner', () => {
  const deps = (narrate: (m: unknown, signal: AbortSignal) => Promise<string>) => ({
    identity: () => 'You are Cass.',
    roomName: () => 'The Tilt',
    you: () => 'Hicks',
    her: 'Cass',
    expressions: ['smile'],
    recent: () => ['Hicks: hi'],
    narrate,
  });
  const req = { round: 2, record, stake: 'a drink' };
  it('asks her model once and parses the answer', async () => {
    const narrate = vi.fn(async () => '{"line":"Again?","expression":"smile"}');
    expect(await makeDiceLiner(deps(narrate))('hicks', req)).toEqual({ line: 'Again?', expression: 'smile' });
    expect(narrate).toHaveBeenCalledTimes(1);
  });
  it('past the timeout, or aborted by the caller, the request itself is aborted and the answer is null (M7)', async () => {
    let seen: AbortSignal | null = null;
    const hang = (_m: unknown, s: AbortSignal) => ((seen = s), new Promise<string>(() => {}));
    expect(await makeDiceLiner({ ...deps(hang), timeoutMs: 5 })('hicks', req)).toBeNull();
    expect(seen!.aborted).toBe(true);
    const caller = new AbortController();
    const pending = makeDiceLiner(deps(hang))('hicks', req, caller.signal);
    caller.abort();
    expect(await pending).toBeNull();
    expect(seen!.aborted).toBe(true);
  });
  it('a model that throws gives null', async () => {
    expect(await makeDiceLiner(deps(async () => Promise.reject(new Error('down'))))('hicks', req)).toBeNull();
  });
  it('a model slower than the timeout gives null', async () => {
    vi.useFakeTimers();
    try {
      const p = makeDiceLiner(deps(() => new Promise(() => {})))('hicks', req);
      vi.advanceTimersByTime(DICE_LINE_TIMEOUT_MS + 1);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
