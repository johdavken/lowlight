import { afterEach, describe, expect, it, vi } from 'vitest';
import { askGm, GM_TIMEOUT_MS, gmLines, gmMessages } from '../src/gm';

const facts = { title: 'Back Door', beat: 'A steel door behind the stall. One man on it.', choice: 'Talk your way in.', kind: 'cost' as const, position: 'open' as const, loot: "the cash in the stall's till", take: { filled: 2, size: 4 }, costs: ['alarm', 'worse', 'take'] as const };

afterEach(() => vi.useRealTimers());

describe('the GM (roll lifecycle spec §1.4)', () => {
  it("gmMessages tells it the scene, the loot, TAKE's fill and each cost with its meaning", () => {
    const [system, user] = gmMessages({ ...facts, costs: [...facts.costs] });
    expect(system.role).toBe('system');
    expect(system.content).toContain('JSON');
    expect(user.content).toContain("the cash in the stall's till");
    expect(user.content).toContain('2 of 4');
    expect(user.content).toContain('ALARM +1');
    expect(user.content).toContain('NEXT ROLL WORSE');
    expect(user.content).toContain('a specific threat waiting there');
    expect(user.content).toContain('A steel door behind the stall.');
  });

  it('gmLines keeps good lines and rejects long, empty, game-worded or missing ones', () => {
    const long = Array.from({ length: 31 }, () => 'word').join(' ');
    const r = gmLines(JSON.stringify({ lines: { 'ALARM +1': 'The doorman thumbs his earpiece.', 'NEXT ROLL WORSE': long, 'TAKE −1': '' } }), ['alarm', 'worse', 'take', 'heat']);
    expect(r.lines).toEqual({ alarm: 'The doorman thumbs his earpiece.' });
    expect(r.rejected.sort()).toEqual(['heat', 'take', 'worse']);
    expect(gmLines(JSON.stringify({ lines: { 'ALARM +1': 'The Heat is on you now.' } }), ['alarm']).rejected).toEqual(['alarm']);
    expect(gmLines(JSON.stringify({ lines: { 'ALARM +1': 'You hear an alarm.' } }), ['alarm']).rejected).toEqual(['alarm']);
  });

  it('final review M4: gmLines strips asterisks and folds whitespace, so a line stays one italic paragraph', () => {
    expect(gmLines(JSON.stringify({ lines: { 'ALARM +1': '*A phone* rings\n\nonce,   somewhere.' } }), ['alarm']).lines).toEqual({ alarm: 'A phone rings once, somewhere.' });
  });

  it('gmLines reads fenced and repaired JSON; garbage rejects all', () => {
    expect(gmLines('```json\n{ "lines": { "ALARM +1": "A phone rings." }, }\n```', ['alarm']).lines).toEqual({ alarm: 'A phone rings.' });
    expect(gmLines('no json here', ['alarm', 'take'])).toEqual({ lines: {}, rejected: ['alarm', 'take'] });
  });

  it('askGm returns the good lines and logs one gm: line', async () => {
    const log = vi.fn();
    const complete = vi.fn(async () => ({ text: JSON.stringify({ lines: { 'ALARM +1': 'A phone rings.' } }), tokensIn: 300, tokensOut: 40 }));
    expect(await askGm({ complete }, gmMessages({ ...facts, costs: ['alarm', 'take'] }), ['alarm', 'take'], log)).toEqual({ alarm: 'A phone rings.' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^gm: \d+ms · in 300 out 40 · used 1\/2/);
  });

  it('askGm gives up after the timeout or an error, with nothing', async () => {
    const log = vi.fn();
    expect(await askGm({ complete: async () => Promise.reject(new Error('boom')) }, [], ['alarm'], log)).toEqual({});
    vi.useFakeTimers();
    const slow = { complete: (_m: unknown, o: { signal: AbortSignal }) => new Promise<{ text: string }>((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))) };
    const p = askGm(slow, [], ['alarm'], log);
    await vi.advanceTimersByTimeAsync(GM_TIMEOUT_MS + 1);
    expect(await p).toEqual({});
  });
});
