import { describe, expect, it, vi } from 'vitest';
import {
  applyMove,
  bandOf,
  CELLS,
  cellOf,
  DEFAULT_SHARED_STANDING,
  parseSharedStanding,
  parseStandingConfig,
  parseStored,
  sharedStandingErrors,
  STANDING,
  standingBlock,
  standingKey,
  startValues,
  wordFor,
  type StandingConfig,
  type StandingMove,
} from './standing';

const cfgOf = (c: Partial<StandingConfig>): StandingConfig => ({ start: null, want: null, secret: null, hint: null, words: {}, ...c });
const move = (trust: number, warmth: number, i = 0): StandingMove => ({ trust, warmth, reason: `r${i}`, at: i, messageId: `m${i}`, take: 0 });

describe('bands and words', () => {
  it('band edges', () => {
    expect([-10, -5, -4, 4, 5, 10].map(bandOf)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
  });
  it('cell is trust then warmth', () => {
    expect(cellOf({ trust: -6, warmth: 7 })).toBe('low-high');
  });
  it('nine cells, trust-major', () => {
    expect(CELLS).toEqual(['low-low', 'low-mid', 'low-high', 'mid-low', 'mid-mid', 'mid-high', 'high-low', 'high-mid', 'high-high']);
  });
  it('override wins, else the shared word', () => {
    const cfg = cfgOf({ words: { 'high-high': 'Calls you child' } });
    expect(wordFor({ trust: 6, warmth: 6 }, cfg, DEFAULT_SHARED_STANDING)).toBe('Calls you child');
    expect(wordFor({ trust: 0, warmth: 6 }, cfg, DEFAULT_SHARED_STANDING)).toBe('Warming to you');
    expect(wordFor({ trust: 0, warmth: 0 }, null, DEFAULT_SHARED_STANDING)).toBe('Sizing you up');
  });
  it('the default grid', () => {
    expect(DEFAULT_SHARED_STANDING.words).toEqual({
      'low-low': 'Hostile',
      'low-mid': 'Wary',
      'low-high': "Fond of you, doesn't trust you",
      'mid-low': 'Cold',
      'mid-mid': 'Sizing you up',
      'mid-high': 'Warming to you',
      'high-low': 'Respects you, keeps distance',
      'high-mid': 'Trusts you',
      'high-high': 'Close',
    });
  });
  it('the default band lines', () => {
    expect(DEFAULT_SHARED_STANDING.trust).toEqual({
      low: "you don't believe much of what they say, and you check it.",
      mid: "you take what they say with a pinch of salt until it's proven.",
      high: "you believe them, and you'd tell them things you keep from others.",
    });
    expect(DEFAULT_SHARED_STANDING.warmth).toEqual({
      low: "you don't like them, and it shows.",
      mid: "they're neither a friend nor a problem yet.",
      high: 'you like having them around and it shows.',
    });
  });
});

describe('parseStandingConfig', () => {
  it('reads a full block', () => {
    const warn = vi.fn();
    const raw = { start: { trust: -3, warmth: 4 }, want: ' A favour. ', secret: 'The pumps.', hint: 'the winter', words: { 'high-high': 'Calls you child' } };
    expect(parseStandingConfig(raw, warn)).toEqual({ start: { trust: -3, warmth: 4 }, want: 'A favour.', secret: 'The pumps.', hint: 'the winter', words: { 'high-high': 'Calls you child' } });
    expect(warn).not.toHaveBeenCalled();
  });
  it('drops bad parts with a warning, keeps the rest (Review Focus 3)', () => {
    const warn = vi.fn();
    const cfg = parseStandingConfig({ start: { trust: 15, warmth: 2 }, secret: 'x'.repeat(301), want: 'A favour.', words: { 'up-down': 'No', 'low-low': 'Enemy' } }, warn);
    expect(cfg).toEqual({ start: null, want: 'A favour.', secret: null, hint: null, words: { 'low-low': 'Enemy' } });
    expect(warn).toHaveBeenCalledTimes(3);
  });
  it('a word over 32 characters, a non-integer start, an over-long want and hint are dropped', () => {
    const warn = vi.fn();
    const cfg = parseStandingConfig({ start: { trust: 1.5, warmth: 0 }, want: 'w'.repeat(201), secret: 's', hint: 'h'.repeat(121), words: { 'mid-mid': 'x'.repeat(33) } }, warn);
    expect(cfg).toEqual({ start: null, want: null, secret: 's', hint: null, words: {} });
    expect(warn).toHaveBeenCalledTimes(4);
  });
  it('hint without a secret is ignored', () => {
    expect(parseStandingConfig({ hint: 'the pumps' }, () => {})?.hint).toBeNull();
  });
  it('undefined → null, no warning; a non-object → null with a warning', () => {
    const warn = vi.fn();
    expect(parseStandingConfig(undefined, warn)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(parseStandingConfig('fond', warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('shared file', () => {
  it('a full file reads as given', () => {
    const warn = vi.fn();
    const raw = { words: { ...DEFAULT_SHARED_STANDING.words, 'mid-mid': 'Unsure' }, trust: DEFAULT_SHARED_STANDING.trust, warmth: DEFAULT_SHARED_STANDING.warmth };
    expect(parseSharedStanding(raw, warn).words['mid-mid']).toBe('Unsure');
    expect(warn).not.toHaveBeenCalled();
  });
  it('missing entries fall back to defaults, one warning each', () => {
    const warn = vi.fn();
    const s = parseSharedStanding({ words: { 'mid-mid': 'Unsure', 'low-low': 'x'.repeat(33) }, trust: { low: 'no.' } }, warn);
    expect(s.words['mid-mid']).toBe('Unsure');
    expect(s.words['low-low']).toBe('Hostile');
    expect(s.trust.low).toBe('no.');
    expect(s.trust.mid).toBe(DEFAULT_SHARED_STANDING.trust.mid);
    expect(s.warmth).toEqual(DEFAULT_SHARED_STANDING.warmth);
    // 8 cells missing or bad, 2 trust lines, 3 warmth lines.
    expect(warn).toHaveBeenCalledTimes(13);
  });
  it('not an object → the defaults with one warning', () => {
    const warn = vi.fn();
    expect(parseSharedStanding(null, warn)).toEqual(DEFAULT_SHARED_STANDING);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('sharedStandingErrors: a word over 32, an unknown cell, a missing band line', () => {
    const raw = { words: { ...DEFAULT_SHARED_STANDING.words, 'mid-mid': 'x'.repeat(33), 'up-down': 'No' }, trust: { low: 'a', mid: 'b' }, warmth: DEFAULT_SHARED_STANDING.warmth };
    expect(sharedStandingErrors(raw).map((e) => e.path).sort()).toEqual(['trust.high', 'words.mid-mid', 'words.up-down']);
    expect(sharedStandingErrors(DEFAULT_SHARED_STANDING)).toEqual([]);
  });
});

describe('starts and moves', () => {
  it('tie over config over 0/0, per value', () => {
    const cfg = cfgOf({ start: { trust: -3, warmth: 4 } });
    expect(startValues({ trust: 6 }, cfg)).toEqual({ trust: 6, warmth: 4 });
    expect(startValues(null, cfg)).toEqual({ trust: -3, warmth: 4 });
    expect(startValues({ warmth: 2 }, null)).toEqual({ trust: 0, warmth: 2 });
    expect(startValues(null, null)).toEqual({ trust: 0, warmth: 0 });
  });
  it('applyMove starts from start, clamps at ±10, keeps the last 20 moves', () => {
    const first = applyMove(null, { trust: 9, warmth: -9 }, move(2, -2));
    expect(first).toMatchObject({ trust: 10, warmth: -10 });
    expect(first.moves).toEqual([move(2, -2)]);
    let s = first;
    for (let i = 1; i <= 25; i++) s = applyMove(s, { trust: 0, warmth: 0 }, move(-1, 1, i));
    expect(s.trust).toBe(-10);
    expect(s.warmth).toBe(10);
    expect(s.moves).toHaveLength(STANDING.history);
    expect(s.moves[0].reason).toBe('r6');
    expect(s.moves.at(-1)!.reason).toBe('r25');
  });
  it('parseStored: null and bad JSON → null; good JSON reads back', () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored('{nope')).toBeNull();
    expect(parseStored('{"trust":"a"}')).toBeNull();
    expect(parseStored('{"trust":1,"warmth":0,"moves":[null,{"reason":"x"},{"trust":1,"warmth":0,"reason":"ok","at":1,"messageId":"m","take":0}]}')!.moves).toHaveLength(1);
    const s = applyMove(null, { trust: 0, warmth: 0 }, move(1, 0));
    expect(parseStored(JSON.stringify(s))).toEqual(s);
  });
  it('standingKey', () => expect(standingKey('hicks')).toBe('standing.hicks'));
});

describe('standingBlock', () => {
  const rot = cfgOf({ want: "That you'll owe him.", secret: 'He paid the divers.', hint: 'the pumps' });
  const block = (trust: number, cfg: StandingConfig | null = rot) => standingBlock({ player: 'Hicks', values: { trust, warmth: 6 }, cfg, shared: DEFAULT_SHARED_STANDING });
  it('opens with the player and the word', () => {
    expect(block(0).split('\n')[0]).toBe('[how you feel about Hicks — "Warming to you":');
  });
  it('band lines', () => {
    expect(block(0)).toContain(" Trust: you take what they say with a pinch of salt until it's proven.");
    expect(block(0)).toContain(' Warmth: you like having them around and it shows.');
  });
  it('want', () => expect(block(0)).toContain(" What you want from them: That you'll owe him."));
  it('secret gate: low', () => {
    expect(block(-6)).toContain("There's something you don't talk about. If talk comes near it, deflect.");
    expect(block(-6)).not.toContain('pumps');
    expect(block(-6)).not.toContain('divers');
  });
  it('secret gate: mid adds the hint', () => {
    expect(block(0)).toContain('If it comes near, you might let slip: the pumps.');
    expect(block(0)).not.toContain('divers');
  });
  it('a hint ending in a full stop gets one', () => {
    expect(block(0, cfgOf({ secret: 's', hint: 'the pumps.' }))).toContain('let slip: the pumps.\n');
  });
  it('a secret without a full stop gets one; one with ends once (deferred minor)', () => {
    expect(block(6, cfgOf({ secret: 'He paid the divers' }))).toContain("Your secret: He paid the divers. You may tell them");
    expect(block(6, cfgOf({ secret: 'He paid the divers!' }))).toContain("Your secret: He paid the divers! You may tell them");
  });
  it('secret gate: high gives the text', () => {
    expect(block(6)).toContain("Your secret: He paid the divers. You may tell them if the moment's right.");
    expect(block(6)).not.toContain('deflect');
  });
  it('no want/secret lines without them; closes with the instruction', () => {
    const b = block(0, null);
    expect(b).not.toContain('want');
    expect(b).not.toContain('secret');
    expect(b).not.toContain("something you don't talk about");
    expect(b.trimEnd().endsWith("Let this colour how you act; don't announce it.]")).toBe(true);
  });
});
