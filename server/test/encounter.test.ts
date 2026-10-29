import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { ChatMessage } from '../../shared/types';
import { ENCOUNTER_SYSTEM, encounterPrompt, recentLines, sceneNow } from '../src/encounter';
import { gigText } from '../../shared/gig/brief';
import { diceText } from '../../shared/dice/text';
import { registerEncounterRoutes, type EncounterDeps } from '../src/encounter-routes';
import { NarratorError } from '../src/scenario';

let n = 0;
const row = (m: Partial<ChatMessage>): ChatMessage => ({ id: `m${n++}`, role: 'user', text: 'x', toolLines: [], ts: n, status: 'ok', ...m });
const names = { player: 'Hicks', contact: 'Nix' };

describe('recentLines', () => {
  it('the window starts after the last good END SCENE, skips OOC/greet/failed/scene, reads travel and events', () => {
    const rows = [
      row({ text: 'before the end' }),
      row({ mode: 'end', text: '' }),
      row({ role: 'agent', mode: 'end', text: 'Goodnight.' }),
      row({ mode: 'scene', text: 'the opening scene' }),
      row({ mode: 'greet', text: '' }),
      row({ role: 'agent', mode: 'greet', text: 'You came.' }),
      row({ mode: 'ooc', text: 'brb' }),
      row({ text: 'lost line', status: 'failed' }),
      row({ mode: 'end', status: 'failed', text: '' }),
      row({ text: 'Eat with me.' }),
      row({ mode: 'travel', text: "*Hicks and Nix head to Hae's Noodles.*" }),
      row({ role: 'agent', mode: 'travel', text: 'Two bowls.' }),
      row({ mode: 'encounter', text: 'A courier drops a box.', encounter: { title: 'Wrong package' } }),
      row({ role: 'agent', text: '' }),
    ];
    expect(recentLines(rows, names)).toEqual([
      'Nix: You came.',
      'Hicks: Eat with me.',
      "[travel: *Hicks and Nix head to Hae's Noodles.*]",
      'Nix: Two bowls.',
      '[event: "Wrong package": A courier drops a box.]',
    ]);
  });

  it('reads a gig as its [gig] line, the result included (deferred minor)', () => {
    const gig = { you: 'Hicks', title: 'Held Pay', tier: 'hard' as const, place: 'The Tilt', client: 'C', target: 'T', take: 'K', brief: 'B.', result: 'traced' as const, trace: 17, max: 14 };
    const rows = [row({ mode: 'gig', text: `*Hicks jacks into a job off The Tilt's board: "Held Pay".*`, gig }), row({ role: 'agent', mode: 'gig', text: 'Bad luck.' })];
    expect(recentLines(rows, names)).toEqual([gigText(gig), 'Nix: Bad luck.']);
  });

  it('reads a dice game as its [dice] line', () => {
    const dice = { you: 'Hicks', her: 'Nix', stake: 'a drink', result: 'won' as const, rounds: [{ round: 1, bids: [{ q: 2, face: 4 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [4, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 2, face: 4 as const, by: 'you' as const }, count: 1, loser: 'you' as const, left: { you: 0, her: 2 } }], lines: [null] };
    const rows = [row({ mode: 'dice', text: '*Hicks plays.*', dice })];
    expect(recentLines(rows, names)).toEqual([diceText(dice).length > 400 ? diceText(dice).slice(0, 399) + '…' : diceText(dice)]);
  });

  it('keeps the last 8 and cuts each at 400 characters with …', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ text: `line ${i}` }));
    rows.push(row({ role: 'agent', text: 'y'.repeat(450) }));
    const out = recentLines(rows, names);
    expect(out).toHaveLength(8);
    expect(out[0]).toBe('Hicks: line 5');
    expect(out.at(-1)).toBe(`Nix: ${'y'.repeat(394)}…`);
    expect(out.at(-1)).toHaveLength(400);
  });

  it("her reply's resident and stranger paragraphs read as theirs (minor M3)", () => {
    const rows = [
      row({ mode: 'encounter', text: 'A courier.', encounter: { title: 'T', stranger: { name: 'Courier', voice: 'v' } } }),
      row({ role: 'agent', mode: 'encounter', text: '*looks up* Not my name.\n\nCourier: Print here.\n\nHae: Not at my counter.\n\nHae: Out.' }),
    ];
    expect(recentLines(rows, { ...names, others: ['Hae'] })).toEqual([
      '[event: "T": A courier.]',
      'Nix: *looks up* Not my name.',
      'Courier: Print here.',
      'Hae: Not at my counter. Out.',
    ]);
  });

  it('nothing since END SCENE is no lines', () => {
    expect(recentLines([row({ text: 'hi' }), row({ mode: 'end', text: '' })], names)).toEqual([]);
  });
});

describe('sceneNow (final review I1, I2)', () => {
  it('texts are not lines said in the room: DRAW and SUGGEST leave them out (deck mid review I2)', () => {
    const rows = [row({ text: 'in the room' }), row({ mode: 'text', text: 'you at the tilt?' }), row({ role: 'agent', mode: 'text', text: 'yeah. come by' })];
    expect(sceneNow(rows, names).recent).toEqual(['Hicks: in the room']);
  });

  it('lore reads the recent lines newest first', () => {
    const rows = [row({ text: 'old line' }), row({ role: 'agent', text: 'the Orchid' })];
    const now = sceneNow(rows, names);
    expect(now.recent).toEqual(['Hicks: old line', 'Nix: the Orchid']);
    expect(now.loreRecent).toEqual(['Nix: the Orchid', 'Hicks: old line']);
  });

  it('after END SCENE and her closing reply, the stranger has gone for the next draw', () => {
    const enc = row({ mode: 'encounter', text: 'A courier.', encounter: { title: 'T', stranger: { name: 'Courier', voice: 'v' } } });
    const end = row({ mode: 'end', text: '' });
    expect(sceneNow([enc, row({ role: 'agent', text: 'Hm.' })], names).stranger?.name).toBe('Courier');
    expect(sceneNow([enc, end, row({ role: 'agent', mode: 'end', replyTo: end.id, text: 'Night.' })], names).stranger).toBeNull();
  });
});

describe('encounterPrompt', () => {
  const base = {
    room: { name: 'Noodle Stall', art: 'Steam under red signs.', timeOfDay: 'night', weather: 'rain' },
    lore: '[lore: …]\nThe Ribbon: a stacked district.',
    you: "[who's here: Hicks — Runs the crew.]",
    her: "[who's here: Nix — Night counselor.]",
    others: [],
    stranger: null,
    recent: [],
    reserved: ['Hicks', 'Nix'],
  };

  it('the system message, exactly', () => {
    expect(encounterPrompt(base)[0]).toEqual({ role: 'system', content: ENCOUNTER_SYSTEM });
    expect(ENCOUNTER_SYSTEM).toBe(
      'You write events for a roleplay in Lowlight. Write three different events that could happen right now to the two people in this scene: something from outside that cuts in — a person, a call, a failure, a discovery. Each fits the place and what just happened, in the third person and present tense, with a title of at most 40 characters and two or three sentences of at most 600 characters. Never write what the user does, says or feels. An event may bring in one new person: give them a short name (at most 24 characters, not one already taken) and a few words on how they speak. Use only the places and facts given. Only an event whose text cuts this district\'s power — the grid fails, the lights die — says so with "power": "out"; every other event leaves it out. Answer only with a JSON array of three {"title","text","stranger","power"} objects, where stranger is {"name","voice"} or null and power is "out" or absent.',
    );
  });

  it("says the power's out right after where, when it is (blackouts phase 3 §2)", () => {
    const user = encounterPrompt({ ...base, power: 'The power is out across Karasu (since 22:00).' })[1].content;
    expect(user.startsWith('Where: Noodle Stall (night, rain).\n\nThe power is out across Karasu (since 22:00).\n\nWhat the room looks like:')).toBe(true);
    expect(encounterPrompt({ ...base, power: null })[1].content).not.toContain('The power is out');
    expect(encounterPrompt(base)[1].content).not.toContain('The power is out');
  });

  it("the Cipher's secrets come after the lore, only when there are any (cipher spec §2.7)", () => {
    const secrets = 'Secrets in this story (never state them):\n- The stall is a drop. Hints: a chalk mark';
    const user = encounterPrompt({ ...base, cipher: secrets })[1].content;
    expect(user).toContain(secrets);
    expect(user.indexOf(secrets)).toBeGreaterThan(user.indexOf('The Ribbon: a stacked district.'));
    expect(user.indexOf(secrets)).toBeLessThan(user.indexOf("The user's character:"));
    expect(encounterPrompt({ ...base, cipher: null })[1].content).toBe(encounterPrompt(base)[1].content);
  });

  it('the facts in order; who else is here and what just happened only when there are any', () => {
    const user = encounterPrompt({
      ...base,
      others: [{ name: 'Hae', pronoun: 'she', voice: 'Brisk, warm.' }, { name: 'Silas', pronoun: 'he', voice: 'Second Socket counter.' }],
      stranger: { name: 'Courier', voice: 'clipped' },
      recent: ['Hicks: Eat.', 'Nix: Fine.'],
      reserved: ['Hicks', 'Nix', 'Hae'],
    })[1].content;
    const order = [
      'Where: Noodle Stall (night, rain).',
      'What the room looks like: Steam under red signs.',
      'The Ribbon: a stacked district.',
      "The user's character:\n[who's here: Hicks",
      "The other character:\n[who's here: Nix",
      'Also here: Hae (she) — Brisk, warm.',
      'Also here: Silas (he) — Second Socket counter.',
      'Also here: Courier, a stranger from an earlier event — clipped',
      'What just happened:\nHicks: Eat.\nNix: Fine.',
      'Names already taken: Hicks, Nix, Hae.',
    ];
    const at = order.map((p) => user.indexOf(p));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);

    const bare = encounterPrompt(base)[1].content;
    expect(bare).not.toContain('Also here');
    expect(bare).not.toContain('What just happened');
    expect(bare).toContain('Names already taken: Hicks, Nix.');
  });
});

const GOOD = JSON.stringify([
  { title: 'Wrong package', text: 'A courier drops a box.', stranger: { name: 'Courier', voice: 'clipped' } },
  { title: 'Blackout', text: 'The grid drops.', stranger: null },
  { title: 'Regular', text: 'An old man sits.', stranger: { name: 'Nix', voice: 'taken' } },
]);

describe('POST /api/encounter/options', () => {
  async function app(over: Partial<EncounterDeps> = {}) {
    const narrate = vi.fn(async () => GOOD);
    const deps: EncounterDeps = {
      originAllowed: () => true,
      busy: () => null,
      target: (ai) => (ai === 'nix-direct' ? { kind: 'direct', ready: () => true, narrate } : null),
      promptFor: () => ({ messages: [{ role: 'system', content: ENCOUNTER_SYSTEM }], reserved: ['Hicks', 'Nix'] }),
      ...over,
    };
    const a = Fastify();
    registerEncounterRoutes(a, deps);
    await a.ready();
    const post = (body: unknown) => a.inject({ method: 'POST', url: '/api/encounter/options', payload: body as object });
    return { post, narrate };
  }

  it('returns three events; a stranger with a taken name is dropped', async () => {
    const { post } = await app();
    const r = await post({ ai: 'nix-direct' });
    expect(r.statusCode).toBe(200);
    expect(r.json().options).toEqual([
      { title: 'Wrong package', text: 'A courier drops a box.', stranger: { name: 'Courier', voice: 'clipped' } },
      { title: 'Blackout', text: 'The grid drops.' },
      { title: 'Regular', text: 'An old man sits.' },
    ]);
  });

  it("drops a power cut card where the power's already out (blackouts phase 3 §2)", async () => {
    const cut = JSON.stringify([{ title: 'Dark', text: 'The grid drops.', power: 'out' }, { title: 'B', text: 'b.' }, { title: 'C', text: 'c.' }]);
    const lit = await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: vi.fn(async () => cut) }) });
    expect((await lit.post({ ai: 'nix-direct' })).json().options[0]).toEqual({ title: 'Dark', text: 'The grid drops.', power: 'out' });
    const dark = await app({
      target: () => ({ kind: 'direct', ready: () => true, narrate: vi.fn(async () => cut) }),
      promptFor: () => ({ messages: [{ role: 'system', content: ENCOUNTER_SYSTEM }], reserved: ['Hicks', 'Nix'], dark: true }),
    });
    expect((await dark.post({ ai: 'nix-direct' })).json().options[0]).toEqual({ title: 'Dark', text: 'The grid drops.' });
  });

  it('a bad request, a foreign origin, no key and busy', async () => {
    expect((await (await app()).post({})).statusCode).toBe(400);
    expect((await (await app()).post({ ai: 'nobody' })).statusCode).toBe(400);
    expect((await (await app({ promptFor: () => null })).post({ ai: 'nix-direct' })).statusCode).toBe(400);
    expect((await (await app({ originAllowed: () => false })).post({ ai: 'nix-direct' })).json()).toEqual({ error: 'origin' });
    const noKey = await (await app({ target: () => ({ kind: 'direct', ready: () => false, narrate: vi.fn() }) })).post({ ai: 'nix-direct' });
    expect([noKey.statusCode, noKey.json()]).toEqual([409, { error: 'no-link' }]);
    const busy = await (await app({ busy: () => 'nix-direct' })).post({ ai: 'nix-direct' });
    expect([busy.statusCode, busy.json()]).toEqual([409, { error: 'busy', contact: 'nix-direct' }]);
  });

  it('a rejected key (401, 403) or no credit (402) is said at once, without a second try', async () => {
    for (const [status, error] of [
      [401, 'key-rejected'],
      [403, 'key-rejected'],
      [402, 'no-credit'],
    ] as const) {
      const narrate = vi.fn().mockRejectedValue(Object.assign(new Error(`HTTP ${status}`), { status }));
      const r = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) })).post({ ai: 'nix-direct' });
      expect([r.statusCode, r.json()]).toEqual([409, { error }]);
      expect(narrate).toHaveBeenCalledTimes(1);
    }
  });

  it('a bad answer is retried once, then 502 with the last try’s reason', async () => {
    const retried = vi.fn().mockResolvedValueOnce('[]').mockResolvedValueOnce(GOOD);
    expect((await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: retried }) })).post({ ai: 'nix-direct' })).statusCode).toBe(200);
    const failing = vi.fn().mockResolvedValueOnce('[]').mockRejectedValueOnce(new NarratorError('timeout', 'no answer in 45 s'));
    const r = await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate: failing }) })).post({ ai: 'nix-direct' });
    expect([r.statusCode, r.json()]).toEqual([502, { error: 'failed', kind: 'timeout', why: 'no answer in 45 s' }]);
  });

  it('the 502 says which kind of failure (spec 2026-10-14 §3): bad-answer, a NarratorError kind, unknown for any other error; the why is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const post = async (narrate: () => Promise<string>) => (await (await app({ target: () => ({ kind: 'direct', ready: () => true, narrate }) })).post({ ai: 'nix-direct' })).json();
    expect(await post(vi.fn(async () => '[]'))).toEqual({ error: 'failed', kind: 'bad-answer', why: 'the answer was not three events' });
    expect(await post(vi.fn().mockRejectedValue(new NarratorError('refused', 'HTTP 404: x', 404)))).toEqual({ error: 'failed', kind: 'refused', why: 'HTTP 404: x' });
    expect(await post(vi.fn().mockRejectedValue(new Error('odd')))).toEqual({ error: 'failed', kind: 'unknown', why: 'odd' });
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[narrator]') && String(c[0]).includes('HTTP 404: x'))).toBe(true);
    warn.mockRestore();
  });
});
