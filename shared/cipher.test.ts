import { describe, expect, it } from 'vitest';
import { checkNewTruth, cipherBlock, cipherDue, cipherNarratorBlock, clueOnPage, foldCipher, looseEnds, parseCipherEvents, storyProse, type CipherEvent, type NewTruth, type TruthKind } from './cipher';

let seq = 0;
const truth = (id: string, kind: TruthKind, knownBy: string[], over: Partial<NewTruth> = {}): CipherEvent => ({
  t: 'truth', id, kind, truth: `truth ${id}`, knownBy, comesOutWhen: 'when', changes: 'changes', clueIdeas: 'ideas', seq: ++seq, ...over,
});
const clue = (id: string, text = 'a clue'): CipherEvent => ({ t: 'clue', id, text, messageId: 'm1', at: 100, place: 'karasu/noodle-stall', onPage: true, seq: ++seq });
const learned = (id: string): CipherEvent => ({ t: 'learned', id, seq: ++seq });
const run = (replies: number): CipherEvent => ({ t: 'run', replies, seq: ++seq });
const nt = (kind: TruthKind, knownBy: string[], over: Partial<NewTruth> = {}): NewTruth => ({ kind, truth: 'Something is hidden.', knownBy, comesOutWhen: 'w', changes: 'c', clueIdeas: 'i', ...over });
const ctx = { cast: new Set(['nix', 'hae', 'cass', 'hicks']), playerId: 'hicks' };

describe('foldCipher', () => {
  it('a truth is open until learned; clues attach to it; a run sets lastRun', () => {
    const s = foldCipher([[run(6), truth('nix-1', 'self', ['nix']), clue('nix-1'), truth('nix-2', 'place', ['hae']), learned('nix-2')]], 9);
    expect(s.replies).toBe(9);
    expect(s.lastRun).toBe(6);
    expect(s.truths.map((t) => [t.id, t.state, t.clues.length])).toEqual([['nix-1', 'open', 1], ['nix-2', 'out', 0]]);
  });

  it('events from two contacts merge in seq order', () => {
    const a = truth('nix-1', 'self', ['nix']);
    const b = truth('hae-1', 'place', ['hae']);
    const c = clue('nix-1', 'seen at the stall');
    expect(foldCipher([[a], [c, b]], 0).truths.map((t) => [t.id, t.clues.map((x) => x.text)])).toEqual([['nix-1', ['seen at the stall']], ['hae-1', []]]);
  });

  it('drops a 4th open truth (two Residuals racing)', () => {
    const s = foldCipher([[truth('a-1', 'self', ['nix']), truth('a-2', 'place', ['hae'])], [truth('b-1', 'city', []), truth('b-2', 'between', ['cass'])]], 0);
    expect(s.truths.map((t) => t.id)).toEqual(['a-1', 'a-2', 'b-1']);
  });

  it('drops a second open truth of a kind, and a holder with one open already', () => {
    expect(foldCipher([[truth('a-1', 'self', ['nix']), truth('a-2', 'self', ['hae'])]], 0).truths.map((t) => t.id)).toEqual(['a-1']);
    expect(foldCipher([[truth('a-1', 'self', ['nix']), truth('a-2', 'place', ['nix', 'hae'])]], 0).truths.map((t) => t.id)).toEqual(['a-1']);
  });

  it('an out truth frees its kind and its holder', () => {
    const s = foldCipher([[truth('a-1', 'self', ['nix']), learned('a-1'), truth('a-2', 'self', ['nix'])]], 0);
    expect(s.truths.map((t) => [t.id, t.state])).toEqual([['a-1', 'out'], ['a-2', 'open']]);
  });

  it('empty knownBy (narrator only) never clashes', () => {
    expect(foldCipher([[truth('a-1', 'city', []), truth('a-2', 'place', [])]], 0).truths).toHaveLength(2);
  });

  it("a clue or learned for a truth that isn't there is dropped (rewound on another contact)", () => {
    const s = foldCipher([[clue('gone-1'), learned('gone-1'), truth('a-1', 'self', ['nix'])]], 0);
    expect(s.truths.map((t) => [t.id, t.state, t.clues.length])).toEqual([['a-1', 'open', 0]]);
  });

  it('the same clue from a re-read of the same reply counts once (review M6)', () => {
    const s = foldCipher([[truth('a-1', 'self', ['nix']), clue('a-1', 'an envelope'), clue('a-1', 'an envelope'), clue('a-1', 'a receipt')]], 0);
    expect(s.truths[0].clues.map((c) => c.text)).toEqual(['an envelope', 'a receipt']);
  });

  it('nothing at all: no truths, no last run', () => {
    expect(foldCipher([], 7)).toEqual({ truths: [], replies: 7, lastRun: null });
  });
});

describe('cipherDue', () => {
  const s = (replies: number, open: number, lastRun: number | null) => ({
    replies, lastRun, truths: Array.from({ length: open }, (_, i) => ({ id: `t${i}`, kind: 'self' as const, truth: '', knownBy: [], comesOutWhen: '', changes: '', clueIdeas: '', state: 'open' as const, clues: [] })),
  });
  it('waits for 6 replies, fewer than 2 open, and 10 replies since the last run', () => {
    expect(cipherDue(s(5, 0, null))).toBe(false);
    expect(cipherDue(s(6, 0, null))).toBe(true);
    expect(cipherDue(s(6, 1, null))).toBe(true);
    expect(cipherDue(s(6, 2, null))).toBe(false);
    expect(cipherDue(s(15, 0, 6))).toBe(false);
    expect(cipherDue(s(16, 0, 6))).toBe(true);
  });
});

describe('checkNewTruth', () => {
  const open = foldCipher([[truth('a-1', 'place', ['hae'])]], 6);
  it('a good truth passes', () => {
    expect(checkNewTruth(open, nt('self', ['nix']), ctx)).toBeNull();
    expect(checkNewTruth(open, nt('city', []), ctx)).toBeNull();
  });
  it('refuses with the field first', () => {
    expect(checkNewTruth(open, nt('rumour' as TruthKind, ['nix']), ctx)).toBe('kind: unknown');
    expect(checkNewTruth(open, nt('place', ['nix']), ctx)).toBe('kind: already open (place)');
    expect(checkNewTruth(open, nt('self', ['dixie']), ctx)).toBe('knownBy: not in the cast (dixie)');
    expect(checkNewTruth(open, nt('self', ['hicks']), ctx)).toBe('knownBy: the player');
    expect(checkNewTruth(open, nt('self', ['hae']), ctx)).toBe('knownBy: already holds an open truth (hae)');
    expect(checkNewTruth(open, nt('self', ['nix'], { truth: 'x'.repeat(301) }), ctx)).toBe('truth: over 300');
    const full = foldCipher([[truth('a-1', 'place', ['hae']), truth('a-2', 'self', ['nix']), truth('a-3', 'city', [])]], 6);
    expect(checkNewTruth(full, nt('between', ['cass']), ctx)).toBe('open: full');
  });
  it("naming the player is fine: the guard is that they never keep one (hand-check 2026-10-29)", () => {
    expect(checkNewTruth(open, nt('self', ['nix'], { truth: 'Nix warned Hae that Hicks would come.' }), ctx)).toBeNull();
  });
});

describe('parseCipherEvents', () => {
  it('bad JSON or not a list reads as none', () => {
    expect(parseCipherEvents('x')).toEqual([]);
    expect(parseCipherEvents('{}')).toEqual([]);
    expect(parseCipherEvents(null)).toEqual([]);
    expect(parseCipherEvents(JSON.stringify([{ t: 'run', replies: 6, seq: 1 }]))).toEqual([{ t: 'run', replies: 6, seq: 1 }]);
  });
});

describe('clueOnPage', () => {
  it('stems match: "thick envelope" is on a page with "envelopes"', () => {
    expect(clueOnPage('a thick envelope under the register', '*She slides the envelopes under the till.*')).toBe(true);
  });
  it('a clue that shares no real word with the page is off it', () => {
    expect(clueOnPage('a thick envelope under the register', 'Rain on the glass. She says nothing.')).toBe(false);
  });
  it('capitalised words (names) and small words are not compared', () => {
    expect(clueOnPage('Envelope from Kade', 'An envelope.')).toBe(true);
    expect(clueOnPage('Envelope from Kade', 'Kade was here.')).toBe(true); // nothing left to compare: counts as on the page
  });
});

describe('storyProse', () => {
  it('keeps her actions, drops head lines, tool lines and markup', () => {
    const p = storyProse('[room: karasu/noodle-stall · lamp 80%]\n*She slides the envelope away.* "Nothing."\n// SET_LIGHT lamp 0\n<b>Fine.</b>');
    expect(p).toContain('She slides the envelope away.');
    expect(p).toContain('Fine.');
    expect(p).not.toContain('room:');
    expect(p).not.toContain('SET_LIGHT');
    expect(p).not.toContain('<b>');
  });
});

describe('storyProse and events (review I1)', () => {
  it("keeps an event card's text: the narrator's line is on the page", () => {
    const p = storyProse('[event: "Parcel": A courier drops a thick envelope at the stall.]');
    expect(p).toContain('A courier drops a thick envelope at the stall.');
    expect(clueOnPage('a thick envelope', p)).toBe(true);
  });
});

describe('cipherBlock', () => {
  const s = foldCipher([[truth('a-1', 'self', ['nix'], { truth: 'Nix sold the Kade file.', comesOutWhen: 'you see the receipt', clueIdeas: 'a burned receipt' }), truth('a-2', 'place', ['hae'], { truth: 'The stall is a drop.' }), truth('a-3', 'city', [], { truth: 'Bad script batch.' }), learned('a-3')]], 6);
  it('lists only the open truths she knows', () => {
    const b = cipherBlock(s.truths, 'nix', 'Hicks')!;
    expect(b.startsWith("[cipher] Things you know that Hicks doesn't.")).toBe(true);
    expect(b).toContain('- Nix sold the Kade file. Comes out when: you see the receipt. Hints you could drop: a burned receipt');
    expect(b).not.toContain('The stall is a drop.');
    expect(b).not.toContain('Bad script batch.');
    expect(b).toContain("If Hicks goes where it's kept and pays what it costs, they find it.");
  });
  it('null when she knows none', () => {
    expect(cipherBlock(s.truths, 'cass', 'Hicks')).toBeNull();
    expect(cipherBlock([], 'nix', 'Hicks')).toBeNull();
  });
});

describe('cipherNarratorBlock', () => {
  it('every open truth; null when none', () => {
    const s = foldCipher([[truth('a-1', 'self', ['nix'], { truth: 'One.', clueIdeas: 'ash' }), truth('a-2', 'city', [], { truth: 'Two.', clueIdeas: 'sirens' }), learned('a-2')]], 6);
    const b = cipherNarratorBlock(s.truths)!;
    expect(b).toContain('- One. Hints: ash');
    expect(b).not.toContain('Two.');
    expect(b.endsWith('An event may carry a small hint to one of these. Most don\'t.')).toBe(true);
    expect(cipherNarratorBlock([])).toBeNull();
  });
});

describe('looseEnds', () => {
  const off = (id: string, text: string): CipherEvent => ({ ...(clue(id, text) as Extract<CipherEvent, { t: 'clue' }>), onPage: false });
  const s = foldCipher(
    [[
      truth('a-1', 'self', ['nix'], { truth: 'SECRET-ONE' }),
      clue('a-1', 'a burned receipt'),
      off('a-1', 'a look'),
      truth('a-2', 'place', ['hae'], { truth: 'SECRET-TWO' }),
      off('a-2', 'only off the page'),
      truth('a-3', 'city', [], { truth: 'SOLVED-ONE' }),
      clue('a-3', 'sirens all night'),
      learned('a-3'),
    ]],
    9,
  );
  const v = looseEnds(s, (id) => (id === 'karasu/noodle-stall' ? "Hae's stall" : id));
  it('open groups hold on-page clues only; a truth with none is absent', () => {
    expect(v.open).toEqual([[{ text: 'a burned receipt', place: "Hae's stall", at: 100 }]]);
  });
  it('a learned truth is solved, with its on-page clues', () => {
    expect(v.solved).toEqual([{ truth: 'SOLVED-ONE', clues: [{ text: 'sirens all night', place: "Hae's stall", at: 100 }] }]);
  });
  it('no open truth text ever leaves', () => {
    const json = JSON.stringify(v);
    expect(json).not.toContain('SECRET-ONE');
    expect(json).not.toContain('SECRET-TWO');
    expect(json).not.toContain('a-1');
  });
});
