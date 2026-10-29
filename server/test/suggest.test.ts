import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { SUGGEST_LINE_MAX, SUGGEST_STEER_MAX, cleanSuggestion, suggestPrompt, suggestSystem } from '../src/suggest';
import { registerSuggestRoutes, type SuggestDeps } from '../src/suggest-routes';
import { NarratorError } from '../src/scenario';

const base = {
  player: 'Hicks',
  pronoun: 'he' as const,
  room: { name: "Hae's Noodles", art: 'A stall under the rail.', timeOfDay: 'night', weather: 'rain' },
  lore: null,
  you: "[who's here: Hicks (he)]\nA netrunner with debts.",
  her: "[who's here: Nix (she)]\nA fixer.",
  others: [{ name: 'Hae', pronoun: 'she' as const, voice: 'Short, warm.' }],
  stranger: null,
  summary: null,
  recent: ['Nix: You owe me.', 'Hicks: I know.'],
  steer: null,
};

describe('suggestPrompt', () => {
  it('writes for the player only, in their voice, and never for anyone else', () => {
    const [sys, user] = suggestPrompt(base);
    expect(sys).toEqual({ role: 'system', content: suggestSystem('Hicks') });
    expect(sys!.content).toContain("Write only Hicks's next line");
    expect(sys!.content).toContain('Never write what anyone else says, does or feels');
    expect(user!.content).toContain("Who you write for:\n[who's here: Hicks (he)]\nA netrunner with debts.");
    expect(user!.content).toContain("The other character:\n[who's here: Nix (she)]\nA fixer.");
    expect(user!.content).toContain('Also here: Hae (she) — Short, warm.');
    expect(user!.content).toContain("Where: Hae's Noodles (night, rain).");
    // The scene ends on what just happened: the line he answers.
    expect(user!.content.endsWith('What just happened:\nNix: You owe me.\nHicks: I know.')).toBe(true);
  });

  it('takes the earlier-tonight summary and a steer, the steer last', () => {
    const [, user] = suggestPrompt({ ...base, summary: 'They met at the stall.', steer: 'tell her I am not paying' });
    expect(user!.content).toContain('Earlier tonight: They met at the stall.');
    expect(user!.content.endsWith('What Hicks means to do next (write it as his line, in his own words): tell her I am not paying')).toBe(true);
  });

  it('a long steer is cut', () => {
    const [, user] = suggestPrompt({ ...base, steer: 'x'.repeat(SUGGEST_STEER_MAX + 50) });
    expect(user!.content).toContain(`${'x'.repeat(SUGGEST_STEER_MAX - 1)}…`);
    expect(user!.content).not.toContain('x'.repeat(SUGGEST_STEER_MAX + 1));
  });

  it('an empty scene still asks for an opening line', () => {
    const [, user] = suggestPrompt({ ...base, recent: [] });
    expect(user!.content).toContain('Nothing has been said yet');
  });
});

describe('suggestPrompt on the way somewhere (arrival screen spec §4)', () => {
  it('says where they are heading, before the steer', () => {
    const [, user] = suggestPrompt({ ...base, steer: 'the fence', travel: { from: 'the Tilt', to: 'the Low Roller', contact: 'Nix', comms: false } });
    expect(user!.content).toContain("Next: Hicks and Nix are about to head from the Tilt to the Low Roller. Write what Hicks does or says as they set off, and why they're going.");
    expect(user!.content.indexOf('Next: ')).toBeLessThan(user!.content.indexOf('What Hicks means to do next'));
  });

  it('with no start place, only where to', () => {
    const [, user] = suggestPrompt({ ...base, travel: { from: null, to: 'the Low Roller', contact: 'Nix', comms: false } });
    expect(user!.content).toContain('Next: Hicks and Nix are about to head to the Low Roller.');
  });

  it('going back to her: he heads back to where she is, not with her (final review M1)', () => {
    const [, user] = suggestPrompt({ ...base, travel: { from: 'the Tilt', to: 'the Low Roller', contact: 'Nix', comms: false, back: true } });
    expect(user!.content).toContain('Next: Hicks heads back to Nix at the Low Roller. Write what Hicks says or does as he sets off, and why.');
    expect(user!.content).not.toContain('Hicks and Nix are about to head');
  });

  it('on comms, he goes alone with her on the line', () => {
    const [, user] = suggestPrompt({ ...base, travel: { from: 'the Tilt', to: 'the Low Roller', contact: 'Nix', comms: true } });
    expect(user!.content).toContain('Next: Hicks heads to the Low Roller, Nix on the line. Write what Hicks says or does as he sets off, and why.');
  });
});

describe('cleanSuggestion', () => {
  it('drops a name prefix, wrapping quotes and blank space; keeps actions', () => {
    expect(cleanSuggestion('Hicks: *I sit.* "Fine."', 'Hicks')).toBe('*I sit.* "Fine."');
    expect(cleanSuggestion('**Hicks:** Fine.', 'Hicks')).toBe('Fine.');
    expect(cleanSuggestion('"Fine. Pour me one."', 'Hicks')).toBe('Fine. Pour me one.');
    expect(cleanSuggestion('  \n*I sit.*\n\n\n"Fine."  ', 'Hicks')).toBe('*I sit.*\n\n"Fine."');
  });

  it('cuts what follows another speaker taking over', () => {
    expect(cleanSuggestion('*I sit.* "Fine."\n\nNix: Good.', 'Hicks', ['Nix', 'Hae'])).toBe('*I sit.* "Fine."');
  });

  it('nothing usable is null; an overlong line is cut at a sentence', () => {
    expect(cleanSuggestion('   ', 'Hicks')).toBeNull();
    expect(cleanSuggestion('Hicks:', 'Hicks')).toBeNull();
    const long = `${'Word word word. '.repeat(200)}`;
    const cut = cleanSuggestion(long, 'Hicks')!;
    expect(cut.length).toBeLessThanOrEqual(SUGGEST_LINE_MAX);
    expect(cut.endsWith('.')).toBe(true);
  });
});

describe('POST /api/suggest', () => {
  async function app(over: Partial<SuggestDeps> = {}) {
    const narrate = vi.fn(async () => 'Hicks: *I sit.* "Fine."');
    const promptFor = vi.fn(() => ({ messages: [{ role: 'system' as const, content: 'x' }], player: 'Hicks', others: ['Nix'] }));
    const deps: SuggestDeps = {
      originAllowed: () => true,
      busy: () => null,
      target: (ai) => (ai === 'nix-direct' ? { kind: 'direct', ready: () => true, narrate } : null),
      promptFor,
      ...over,
    };
    const a = Fastify();
    registerSuggestRoutes(a, deps);
    await a.ready();
    const post = (body: unknown) => a.inject({ method: 'POST', url: '/api/suggest', payload: body as object });
    return { post, narrate, promptFor };
  }

  it('returns the cleaned line, passing the steer on', async () => {
    const { post, promptFor } = await app();
    const r = await post({ ai: 'nix-direct', steer: '  say yes  ' });
    expect([r.statusCode, r.json()]).toEqual([200, { text: '*I sit.* "Fine."' }]);
    expect(promptFor).toHaveBeenCalledWith('nix-direct', 'say yes');
    await post({ ai: 'nix-direct', steer: '   ' });
    expect(promptFor).toHaveBeenLastCalledWith('nix-direct', null);
  });

  it('passes a travel on to the prompt, and refuses a bad one', async () => {
    const { post, promptFor } = await app();
    await post({ ai: 'nix-direct', travel: { from: 'the Tilt', to: 'the Low Roller', comms: true } });
    expect(promptFor).toHaveBeenLastCalledWith('nix-direct', null, { from: 'the Tilt', to: 'the Low Roller', comms: true, back: false });
    await post({ ai: 'nix-direct', travel: { to: 'the Low Roller' } });
    expect(promptFor).toHaveBeenLastCalledWith('nix-direct', null, { from: null, to: 'the Low Roller', comms: false, back: false });
    expect((await post({ ai: 'nix-direct', travel: { from: 'x' } })).statusCode).toBe(400);
    await post({ ai: 'nix-direct', travel: { to: 'the Low Roller', back: true } });
    expect(promptFor).toHaveBeenLastCalledWith('nix-direct', null, { from: null, to: 'the Low Roller', comms: false, back: true });
    expect((await post({ ai: 'nix-direct', travel: { to: 'x', back: 'yes' } })).statusCode).toBe(400);
  });

  it('a bad request, a foreign origin, no key and busy', async () => {
    expect((await (await app()).post({})).statusCode).toBe(400);
    expect((await (await app()).post({ ai: 'nobody' })).statusCode).toBe(400);
    expect((await (await app()).post({ ai: 'nix-direct', steer: 4 })).statusCode).toBe(400);
    expect((await (await app({ promptFor: () => null })).post({ ai: 'nix-direct' })).statusCode).toBe(400);
    expect((await (await app({ originAllowed: () => false })).post({ ai: 'nix-direct' })).json()).toEqual({ error: 'origin' });
    const noKey = await (await app({ target: () => ({ kind: 'direct', ready: () => false, narrate: vi.fn() }) })).post({ ai: 'nix-direct' });
    expect([noKey.statusCode, noKey.json()]).toEqual([409, { error: 'no-link' }]);
    const busy = await (await app({ busy: () => 'nix-direct' })).post({ ai: 'nix-direct' });
    expect([busy.statusCode, busy.json()]).toEqual([409, { error: 'busy', contact: 'nix-direct' }]);
  });

  it('a rejected key or no credit is said at once', async () => {
    for (const [status, error] of [
      [401, 'key-rejected'],
      [402, 'no-credit'],
    ] as const) {
      const narrate = vi.fn().mockRejectedValue(Object.assign(new Error(`HTTP ${status}`), { status }));
      const r = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) })).post({ ai: 'nix-direct' });
      expect([r.statusCode, r.json()]).toEqual([409, { error }]);
      expect(narrate).toHaveBeenCalledTimes(1);
    }
  });

  it('an empty answer is retried once, then 502 with the kind', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const retried = vi.fn().mockResolvedValueOnce('  ').mockResolvedValueOnce('Fine.');
    expect((await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: retried }) })).post({ ai: 'nix-direct' })).json()).toEqual({ text: 'Fine.' });
    const failing = vi.fn().mockResolvedValueOnce('').mockRejectedValueOnce(new NarratorError('timeout', 'no answer in 45 s'));
    const r = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: failing }) })).post({ ai: 'nix-direct' });
    expect([r.statusCode, r.json()]).toEqual([502, { error: 'failed', kind: 'timeout', why: 'no answer in 45 s' }]);
    const empty = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: vi.fn(async () => '') }) })).post({ ai: 'nix-direct' });
    expect(empty.json()).toEqual({ error: 'failed', kind: 'bad-answer', why: 'the answer was empty' });
    warn.mockRestore();
  });
});
