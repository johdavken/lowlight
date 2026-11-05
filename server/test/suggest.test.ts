import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { SUGGEST_LINE_MAX, SUGGEST_STEER_MAX, SUGGEST_THREADS_MAX, cleanSuggestion, openThreads, parseSuggestions, suggestPrompt, suggestSystem } from '../src/suggest';
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

describe('suggestPrompt: the character, the steer, three angles and open threads', () => {
  it('plays him as a person, keeps a steer whole, stops where someone else answers, never parrots', () => {
    const sys = suggestSystem('Hicks');
    expect(sys).toContain("Write Hicks as a person, not a winner");
    expect(sys).toContain("Don't echo or repeat back what was just said to Hicks.");
    expect(sys).toContain("keep that choice exactly: don't soften, reverse or water it down");
    expect(sys).toContain('Stop where someone else would have to answer or react.');
  });

  it('asks for PLAIN, PUSH and TURN only with angles on', () => {
    const [sys] = suggestPrompt({ ...base, angles: true });
    for (const l of ['PLAIN:', 'PUSH:', 'TURN:']) expect(sys!.content).toContain(`\n${l}`);
    expect(sys!.content).toContain('all three do it; they differ only in how');
    const [one] = suggestPrompt(base);
    expect(one!.content).not.toContain('PUSH:');
    expect(one!.content).toContain('Answer with the line alone');
  });

  it('lists open threads before the scene, and none when there are none', () => {
    const [, user] = suggestPrompt({ ...base, threads: ['Paper Trail: find the clerk', 'lead: a fence → Garro'] });
    expect(user!.content).toContain('Open threads (TURN may pick one up; never invent how they turn out):\n- Paper Trail: find the clerk\n- lead: a fence → Garro');
    expect(user!.content.indexOf('Open threads')).toBeLessThan(user!.content.indexOf('What just happened'));
    expect(suggestPrompt({ ...base, threads: [] })[1]!.content).not.toContain('Open threads');
  });
});

describe('openThreads', () => {
  const none = { quest: null, plan: null, her: 'Nix', player: 'Hicks', leads: [], looseEnds: [] };
  it('quest panel, plan card, held leads and loose ends, one line each, in that order', () => {
    const t = openThreads({
      ...none,
      quest: { active: { title: 'Paper Trail', beat: 'counted-badly' } as { title: string }, waiting: null, elsewhere: [{ title: 'Cold Iron', contactName: 'Ines', next: null }] },
      plan: { going: null, meet: { place: 'the Tilt', time: '23:00' } },
      leads: [{ title: 'a fence', toName: 'Garro', place: 'the Spine', followed: false }],
      looseEnds: [[{ text: 'old' }, { text: 'a burnt badge' }]],
    });
    // The beat is an id the player never sees: only the title goes.
    expect(t.join(' ')).not.toContain('counted-badly');
    expect(t).toEqual(['Paper Trail: under way', 'Cold Iron (with Ines)', 'Nix is meeting Hicks at the Tilt at 23:00', 'lead: a fence → Garro at the Spine', 'loose end: a burnt badge']);
  });

  it('skips followed leads, keeps two leads and two loose ends, and caps the whole', () => {
    const lead = (n: number, followed = false) => ({ title: `L${n}`, toName: 'X', place: null, followed });
    const t = openThreads({ ...none, leads: [lead(0, true), lead(1), lead(2), lead(3)], looseEnds: [[{ text: 'a' }], [{ text: 'b' }], [{ text: 'c' }]] });
    expect(t).toEqual(['lead: L1 → X', 'lead: L2 → X', 'loose end: a', 'loose end: b']);
    const many = openThreads({ ...none, quest: { active: null, waiting: null, elsewhere: Array.from({ length: 9 }, (_, i) => ({ title: `Q${i}`, contactName: 'Y', next: 'go' })) } });
    expect(many).toHaveLength(SUGGEST_THREADS_MAX);
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

describe('parseSuggestions', () => {
  it('splits PLAIN, PUSH and TURN, bold or bulleted, each cleaned', () => {
    const raw = 'PLAIN: *I nod.* "Fine."\n**PUSH:** "Pay me now."\n- TURN: Hicks: *I look at the door.* "Who else knows?"';
    expect(parseSuggestions(raw, 'Hicks')).toEqual([
      { angle: 'PLAIN', text: '*I nod.* "Fine."' },
      { angle: 'PUSH', text: 'Pay me now.' },
      { angle: 'TURN', text: '*I look at the door.* "Who else knows?"' },
    ]);
  });

  it('numbered, bracketed, italic, dashed and one-line labels; an action keeps its asterisk', () => {
    const want = [
      { angle: 'PLAIN', text: 'a.' },
      { angle: 'PUSH', text: 'b.' },
      { angle: 'TURN', text: '*I look away.* c.' },
    ];
    for (const raw of [
      '1. PLAIN: a.\n2. PUSH: b.\n3. TURN: *I look away.* c.',
      '[PLAIN] - a.\n[PUSH] - b.\n[TURN] - *I look away.* c.',
      '*PLAIN:* a.\n*PUSH:* b.\n*TURN:* *I look away.* c.',
      '**PLAIN** — a.\n**PUSH** — b.\n**TURN** — *I look away.* c.',
      'PLAIN (likely): a.\nPUSH: b.\nTURN: *I look away.* c.',
      'PLAIN: a. PUSH: b. TURN: *I look away.* c.',
      'Here are three:\nPLAIN: a.\nPUSH: b.\nTURN: *I look away.* c.\n\n(Each keeps the choice.)',
    ])
      expect(parseSuggestions(raw, 'Hicks')).toEqual(want);
  });

  it('an unlabelled first line is kept when fewer than three labels came; a word in lower case never splits', () => {
    expect(parseSuggestions('a.\nPUSH: b.\nTURN: c.', 'Hicks')).toEqual([
      { angle: null, text: 'a.' },
      { angle: 'PUSH', text: 'b.' },
      { angle: 'TURN', text: 'c.' },
    ]);
    expect(parseSuggestions('PLAIN: *I point.* Turn: left at the rail.', 'Hicks')).toEqual([{ angle: 'PLAIN', text: '*I point.* Turn: left at the rail.' }]);
  });

  it('no labels is one unlabelled draft; empty pieces and another speaker are dropped', () => {
    expect(parseSuggestions('Hicks: "Fine."', 'Hicks')).toEqual([{ angle: null, text: 'Fine.' }]);
    expect(parseSuggestions('PLAIN:\nPUSH: "No."\nNix: "Yes."', 'Hicks', ['Nix'])).toEqual([{ angle: 'PUSH', text: 'No.' }]);
    expect(parseSuggestions('   ', 'Hicks')).toEqual([]);
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
    expect([r.statusCode, r.json()]).toEqual([200, { text: '*I sit.* "Fine."', drafts: [{ angle: null, text: '*I sit.* "Fine."' }] }]);
    expect(promptFor).toHaveBeenCalledWith('nix-direct', 'say yes');
    await post({ ai: 'nix-direct', steer: '   ' });
    expect(promptFor).toHaveBeenLastCalledWith('nix-direct', null);
  });

  it('returns the three angles, the first as text', async () => {
    const narrate = vi.fn(async () => 'PLAIN: "Fine."\nPUSH: "Now."\nTURN: "The badge?"');
    const r = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) })).post({ ai: 'nix-direct' });
    expect(r.json()).toEqual({ text: 'Fine.', drafts: [{ angle: 'PLAIN', text: 'Fine.' }, { angle: 'PUSH', text: 'Now.' }, { angle: 'TURN', text: 'The badge?' }] });
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
    expect((await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: retried }) })).post({ ai: 'nix-direct' })).json()).toEqual({ text: 'Fine.', drafts: [{ angle: null, text: 'Fine.' }] });
    const failing = vi.fn().mockResolvedValueOnce('').mockRejectedValueOnce(new NarratorError('timeout', 'no answer in 45 s'));
    const r = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: failing }) })).post({ ai: 'nix-direct' });
    expect([r.statusCode, r.json()]).toEqual([502, { error: 'failed', kind: 'timeout', why: 'no answer in 45 s' }]);
    const empty = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: vi.fn(async () => '') }) })).post({ ai: 'nix-direct' });
    expect(empty.json()).toEqual({ error: 'failed', kind: 'bad-answer', why: 'the answer was empty' });
    warn.mockRestore();
  });
});
