import { describe, expect, it } from 'vitest';
import { cipherRunMessages, parseCipherAnswer, type CipherRunInput } from '../src/cipher-run';
import { foldCipher, TRUTH_KINDS, type CipherEvent } from '../../shared/cipher';

const input = (over: Partial<CipherRunInput> = {}): CipherRunInput => ({
  player: { id: 'hicks', name: 'Hicks' },
  cast: [
    { id: 'nix', name: 'Nix', pronoun: 'she', about: 'A fixer in Karasu.', secret: 'She sold a client out once.' },
    { id: 'hae', name: 'Hae', pronoun: 'she', about: 'Runs the noodle stall.', secret: null },
  ],
  lore: ['The script', 'Old Karasu decks'],
  summary: 'Hicks took a job from Nix.',
  recent: [
    { speaker: 'Hicks', text: 'What about the courier?' },
    { speaker: 'Nix', text: 'Gone.' },
  ],
  state: foldCipher([], 7),
  room: 3,
  ...over,
});
const t = (kind: string, knownBy: string[], truth = 'Something is hidden here.') => ({ kind, truth, knownBy, comesOutWhen: 'you go there', changes: 'it changes', clueIdeas: 'a mark' });

describe('cipherRunMessages', () => {
  const [sys, user] = cipherRunMessages(input());
  it('starts the way the test fakes know it', () => {
    expect(sys.content.startsWith('You keep the secrets of a story in Lowlight.')).toBe(true);
  });
  it('names every kind and the mix', () => {
    for (const k of TRUTH_KINDS) expect(sys.content).toContain(`${k}:`);
    expect(sys.content).toMatch(/No two truths of the same kind/);
    expect(sys.content).toContain('at most 3 truths');
  });
  it('lists the cast with their authored secrets, never the player', () => {
    expect(user.content).toContain('[cast: nix "Nix" (she) — A fixer in Karasu.; already keeps: She sold a client out once.]');
    expect(user.content).toContain('[cast: hae "Hae" (she) — Runs the noodle stall.]');
    expect(user.content).not.toMatch(/\[cast: hicks/);
    expect(user.content).toContain('[you: Hicks]');
  });
  it("no example names the player: the code refuses a truth that does (review I2)", () => {
    const kinds = sys.content.slice(sys.content.indexOf('Each truth is one of five kinds:'), sys.content.indexOf('These examples only show'));
    expect(kinds).not.toContain('Hicks');
  });

  it('the examples are no one in the cast (review M5)', () => {
    for (const w of ['till', 'Counting House', 'pump keeper', 'walk-in freezer']) expect(sys.content).not.toContain(w);
  });

  it('says who already keeps an open truth (review I3)', () => {
    const evs: CipherEvent[] = [{ t: 'truth', id: 'nix-1', kind: 'place', truth: 'The stall is a drop.', knownBy: ['hae'], comesOutWhen: 'w', changes: 'c', clueIdeas: 'i', seq: 1 }];
    const [, u] = cipherRunMessages(input({ state: foldCipher([evs], 20), room: 2 }));
    expect(u.content).toContain('place · The stall is a drop. · kept by hae (open)');
    expect(u.content).toContain('[cast: hae "Hae" (she) — Runs the noodle stall.; keeps an open truth already]');
    expect(u.content).not.toContain('[cast: nix "Nix" (she) — A fixer in Karasu.; already keeps: She sold a client out once.; keeps an open');
  });

  it('shows the truths already kept, open and out', () => {
    const evs: CipherEvent[] = [
      { t: 'truth', id: 'nix-1', kind: 'place', truth: 'The stall is a drop.', knownBy: ['hae'], comesOutWhen: 'w', changes: 'c', clueIdeas: 'i', seq: 1 },
      { t: 'learned', id: 'nix-1', seq: 2 },
    ];
    const [, u] = cipherRunMessages(input({ state: foldCipher([evs], 20), room: 2 }));
    expect(u.content).toContain('place · The stall is a drop. · kept by hae (out)');
  });
});

describe('parseCipherAnswer', () => {
  it('accepts good truths', () => {
    const r = parseCipherAnswer(JSON.stringify({ truths: [t('self', ['nix']), t('city', [])] }), input());
    expect(r.truths.map((x) => x.kind)).toEqual(['self', 'city']);
    expect(r.refused).toEqual([]);
  });
  it('checks each against the ones accepted before it in the same answer', () => {
    const r = parseCipherAnswer(JSON.stringify({ truths: [t('self', ['nix']), t('self', ['hae']), t('place', ['nix'])] }), input());
    expect(r.truths).toHaveLength(1);
    expect(r.refused).toEqual(['truths[1]: kind: already open (self)', 'truths[2]: knownBy: already holds an open truth (nix)']);
  });
  it("refuses the player's id and anything past the room left", () => {
    const r = parseCipherAnswer(JSON.stringify({ truths: [t('self', ['hicks']), t('city', []), t('place', ['hae'])] }), input({ room: 1 }));
    expect(r.truths.map((x) => x.kind)).toEqual(['city']);
    expect(r.refused).toEqual(['truths[0]: knownBy: the player', 'truths[2]: over the 1 asked for']);
  });
  it('a bad shape is refused per item; not JSON writes nothing', () => {
    expect(parseCipherAnswer('{"truths":[{"kind":"self"}]}', input()).refused[0]).toMatch(/^truths\[0\]: /);
    expect(parseCipherAnswer('nope', input())).toEqual({ truths: [], refused: ['answer: not JSON'] });
  });
  it('clue ideas given as a list are joined, not refused (hand-check 2026-10-29)', () => {
    const r = parseCipherAnswer(JSON.stringify({ truths: [{ ...t('self', ['nix']), clueIdeas: ['a mark', 'a key'] }] }), input());
    expect(r.refused).toEqual([]);
    expect(r.truths[0].clueIdeas).toBe('a mark; a key');
  });

  it('a truth that names the player is kept: it may be about others and them; never kept by them (hand-check 2026-10-29)', () => {
    const r = parseCipherAnswer(JSON.stringify({ truths: [t('between', ['nix'], 'Nix already warned Hae that Hicks would come asking.')] }), input());
    expect(r.refused).toEqual([]);
    expect(r.truths).toHaveLength(1);
  });

  it('caps the shorter fields at a word boundary', () => {
    const long = 'word '.repeat(80);
    const r = parseCipherAnswer(JSON.stringify({ truths: [{ ...t('self', ['nix']), comesOutWhen: long, changes: long, clueIdeas: long }] }), input());
    expect(r.truths[0].comesOutWhen.length).toBeLessThanOrEqual(200);
    expect(r.truths[0].clueIdeas.length).toBeLessThanOrEqual(200);
  });
});
