import { describe, expect, it } from 'vitest';
import { afterEffect, gambleDie, gambleFaces, gambleResult, deckNotes, effectPushRefusal, facesFor, fragileDies, kindResult, poolOf, positionOf, POOL_MAX, resultOf, rollPool, statDice, takeSize, tierCut, tradeRefusal, type Effect, type Position } from './dice';
import type { Deck } from './gear';
import type { CallEffect } from './hand';
import type { Check } from './mission';
import type { Program } from './programs';
import type { Stats } from './stats';

const HICKS: Stats = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const DECK: Deck = { id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: [] };
const check = (o: Partial<Check> = {}): Check => ({ stat: 'tech', base: 50, grid: false, crew: [], red: false, mods: [], ...o });
const seq = (faces: number[]) => {
  let i = 0;
  return () => faces[i++];
};

describe('the pool', () => {
  it('statDice bands: 1,3→1; 4,6→2; 7,8→3; 9,10→4', () => {
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(statDice)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('positionOf: bands, red, and ALARM 2 one step worse', () => {
    expect([positionOf(55, false, 0), positionOf(54, false, 0), positionOf(45, false, 0), positionOf(44, false, 0), positionOf(70, true, 0)]).toEqual(['dark', 'open', 'open', 'wire', 'wire']);
    expect([positionOf(60, false, 2), positionOf(50, false, 2), positionOf(40, false, 3)]).toEqual(['open', 'wire', 'wire']);
    expect(positionOf(60, false, 1)).toBe('dark');
  });

  it('poolOf parts: crew, deck on grid, an if modifier, an extra, an easy mark; capped at 6', () => {
    const c = check({ grid: true, crew: [{ contact: 'rue', bonus: 10 }], mods: [{ when: [], delta: 10, label: 'you know it' }] });
    const p = poolOf(c, { stats: HICKS, deck: DECK, with: 'rue', ctx: { flags: {}, trust: 'mid', warmth: 'mid', with: 'rue' }, extra: [{ delta: 10, label: 'cased' }], temper: 'easy' });
    expect(p.parts).toEqual([
      { label: 'STALL BUILD', dice: 1, kind: 'pocket' },
      { label: 'RUE', dice: 1, kind: 'people' },
      { label: 'YOU KNOW IT', dice: 1 },
      { label: 'CASED', dice: 1 },
      { label: 'EASY MARK', dice: 1 },
    ]);
    expect(p.dice).toBe(POOL_MAX);
    expect(p).toMatchObject({ stat: 'TECH', position: 'open', noDeck: false });
    const plain = poolOf(check({ grid: true, crew: [{ contact: 'rue', bonus: 10 }] }), { stats: HICKS, deck: DECK, with: 'rue' });
    expect(plain.dice).toBe(5);
  });

  it('no deck on grid is −1d and noDeck; a hard mark −1d; a crew contact not present adds nothing', () => {
    const p = poolOf(check({ grid: true, crew: [{ contact: 'rue', bonus: 15 }] }), { stats: HICKS, deck: null, with: 'nix-direct', temper: 'hard' });
    expect(p.parts).toEqual([
      { label: 'NO DECK', dice: -1, kind: 'pocket' },
      { label: 'HARD MARK', dice: -1 },
    ]);
    expect(p).toMatchObject({ dice: 1, noDeck: true });
  });

  it("the pool carries the stat's own dice as base (final review M2)", () => {
    expect(poolOf(check({ grid: true }), { stats: { ...HICKS, tech: 1 }, deck: null, with: 'x', temper: 'hard' })).toMatchObject({ base: 1, dice: -1 });
  });

  it('push adds {label:PUSH,dice:1}', () => {
    expect(poolOf(check(), { stats: HICKS, deck: null, with: 'x', push: true }).parts).toEqual([{ label: 'PUSH', dice: 1, kind: 'push' }]);
  });

  it('ALARM moves the position, not the dice', () => {
    expect(poolOf(check({ base: 60 }), { stats: HICKS, deck: null, with: 'x', alarm: 2 })).toMatchObject({ dice: 3, position: 'open' });
  });
});

describe('rolling', () => {
  it('rollPool(0) and rollPool(-1) roll 2 and keep low; rollPool(3) rolls 3 and keeps high', () => {
    expect(rollPool(0, seq([4, 2]))).toEqual({ faces: [4, 2], keep: 'low' });
    expect(rollPool(-1, seq([6, 5]))).toEqual({ faces: [6, 5], keep: 'low' });
    expect(rollPool(3, seq([1, 5, 3]))).toEqual({ faces: [1, 5, 3], keep: 'high' });
  });

  const cell = (faces: number[], pos: Position) => resultOf(faces, 'high', pos);
  it('resultOf: every cell of the table', () => {
    expect(cell([6, 2], 'dark')).toEqual({ kind: 'clean', pass: true, take: 2, alarm: 0, heat: 0 });
    expect(cell([5, 2], 'dark')).toEqual({ kind: 'cost', pass: true, take: 1, alarm: 0, heat: 0 });
    expect(cell([3, 2], 'dark')).toEqual({ kind: 'miss', pass: false, take: 0, alarm: 1, heat: 0 });
    expect(cell([6], 'open')).toEqual({ kind: 'clean', pass: true, take: 2, alarm: 0, heat: 0 });
    expect(cell([4], 'open')).toEqual({ kind: 'cost', pass: true, take: 1, alarm: 1, heat: 0 });
    expect(cell([1], 'open')).toEqual({ kind: 'miss', pass: false, take: 0, alarm: 1, heat: 1 });
    expect(cell([6, 1], 'wire')).toEqual({ kind: 'clean', pass: true, take: 2, alarm: 0, heat: 0 });
    expect(cell([5], 'wire')).toEqual({ kind: 'cost', pass: true, take: 1, alarm: 1, heat: 1 });
    expect(cell([2], 'wire')).toEqual({ kind: 'miss', pass: false, take: 0, alarm: 2, heat: 1 });
  });

  it('two 6s are a crit everywhere: TAKE +3, no cost', () => {
    for (const p of ['dark', 'open', 'wire'] as const) expect(cell([6, 3, 6], p)).toEqual({ kind: 'crit', pass: true, take: 3, alarm: 0, heat: 0 });
  });

  it('keep low: [6,2] is a miss', () => {
    expect(resultOf([6, 2], 'low', 'open').kind).toBe('miss');
  });

  it('fragileDies: a miss showing a 1 only', () => {
    expect(fragileDies([3, 1], cell([3, 1], 'open'))).toBe(true);
    expect(fragileDies([3, 2], cell([3, 2], 'open'))).toBe(false);
    expect(fragileDies([5, 1], cell([5, 1], 'open'))).toBe(false);
  });

  it('facesFor: the entry kept, 1s beside it (6s when keeping low); 66 is two sixes', () => {
    expect(facesFor(5, 3, 'high')).toEqual([5, 1, 1]);
    expect(facesFor(3, 2, 'low')).toEqual([3, 6]);
    expect(facesFor(66, 3, 'high')).toEqual([6, 6, 1]);
    expect(resultOf(facesFor(66, 2, 'high'), 'high', 'open').kind).toBe('crit');
  });

  it('takeSize: 1→3, 2→4, 3→6, 4→6 (tuned by job-sim)', () => {
    expect([1, 2, 3, 4].map((t) => takeSize(t as 1 | 2 | 3 | 4))).toEqual([3, 4, 6, 6]);
  });
});

describe('the hand on the pool', () => {
  it('QUIET adds +1d on reflex and tech only; HARD on body', () => {
    expect(poolOf(check({ stat: 'reflex' }), { stats: HICKS, deck: null, with: 'x', approach: 'quiet' }).parts).toContainEqual({ label: 'QUIET', dice: 1, kind: 'setup' });
    expect(poolOf(check({ stat: 'tech' }), { stats: HICKS, deck: null, with: 'x', approach: 'quiet' }).parts).toContainEqual({ label: 'QUIET', dice: 1, kind: 'setup' });
    expect(poolOf(check({ stat: 'cool' }), { stats: HICKS, deck: null, with: 'x', approach: 'quiet' }).parts).toEqual([]);
    expect(poolOf(check({ stat: 'body' }), { stats: HICKS, deck: null, with: 'x', approach: 'hard' }).parts).toContainEqual({ label: 'HARD', dice: 1, kind: 'setup' });
    expect(poolOf(check({ stat: 'cool' }), { stats: HICKS, deck: null, with: 'x', approach: 'smooth' }).parts).toContainEqual({ label: 'SMOOTH', dice: 1, kind: 'setup' });
  });
  it('a lift call claws back ALARM: open base at ALARM 2 is wire, lifted to open', () => {
    expect(poolOf(check({ base: 50 }), { stats: HICKS, deck: null, with: 'x', alarm: 2 }).position).toBe('wire');
    expect(poolOf(check({ base: 50 }), { stats: HICKS, deck: null, with: 'x', alarm: 2, call: { lift: true, dice: 0, label: 'DEZ' } }).position).toBe('open');
  });
  it('a dice call adds one part with its label; the cap holds', () => {
    const p = poolOf(check(), { stats: HICKS, deck: null, with: 'x', call: { lift: false, dice: 1, label: 'Dez' } });
    expect(p.parts).toEqual([{ label: 'DEZ', dice: 1 }]);
    const big = poolOf(check({ stat: 'tech' }), { stats: { ...HICKS, tech: 10 }, deck: DECK, with: 'x', approach: 'quiet', push: true, temper: 'easy', call: { lift: false, dice: 1, label: 'FAVOUR' } });
    expect(big.dice).toBe(POOL_MAX);
  });
});

describe('deck effects (deck effects spec 2026-10-30)', () => {
  const deck = (quality: Deck['quality'], traits: Deck['traits'] = []): Deck => ({ id: 'd', name: 'D', quality, heat: 1, traits });
  const grid = check({ grid: true });
  const at = (d: Deck | null, tier: number, c = grid, alarm = 0) => poolOf(c, { stats: HICKS, deck: d, with: 'nix', tier, alarm });

  it('quality above the job tier holds, equal is neither, below is outclassed; only on grid checks with a deck', () => {
    expect(at(deck(1), 1).deck?.match).toBeNull();
    expect(at(deck(2), 1).deck?.match).toBe('holds');
    expect(at(deck(2), 3).deck?.match).toBe('outclassed');
    expect(at(deck(4), 4).deck?.match).toBeNull();
    expect(at(deck(1), 4).deck?.match).toBe('outclassed');
    expect(at(deck(4), 1, check()).deck).toBeUndefined();
    expect(at(null, 1).deck).toBeUndefined();
    // No tier (a quest that isn't a job): neither.
    expect(poolOf(grid, { stats: HICKS, deck: deck(4), with: 'nix' }).deck?.match).toBeNull();
  });

  it('breaker: on the wire counts as in the open on a grid check, after ALARM, and a lift goes on top', () => {
    const wire = check({ grid: true, base: 40 });
    expect(at(deck(1, ['breaker']), 1, wire).position).toBe('open');
    expect(at(deck(1, ['breaker']), 1, wire).deck?.broke).toBe(true);
    expect(at(deck(1), 1, wire).position).toBe('wire');
    // ALARM 2 pushes the open to the wire; breaker brings it back.
    expect(at(deck(1, ['breaker']), 1, check({ grid: true, base: 50 }), 2).position).toBe('open');
    expect(at(deck(1, ['breaker']), 1, check({ grid: true, base: 60 })).deck?.broke).toBe(false);
    expect(poolOf(wire, { stats: HICKS, deck: deck(1, ['breaker']), with: 'nix', call: { label: 'x', lift: true, dice: 0 } }).position).toBe('dark');
    expect(at(deck(1, ['breaker']), 1, check({ base: 40 })).position).toBe('wire');
  });

  it('hidden and chrome are flagged on grid checks', () => {
    expect(at(deck(1, ['hidden']), 1).deck?.hidden).toBe(true);
    expect(at(deck(1), 1).deck?.hidden).toBe(false);
  });
});

describe('deckNotes', () => {
  it('the card\'s deck words: holds or outclassed, then breaker and hidden when they act', () => {
    expect(deckNotes({})).toEqual([]);
    expect(deckNotes({ deck: { match: null, broke: false, hidden: false, chrome: true } })).toEqual([]);
    expect(deckNotes({ deck: { match: 'holds', broke: true, hidden: true, chrome: false } })).toEqual(['DECK HOLDS', 'BREAKER', 'HIDDEN · NO DECK HEAT']);
    expect(deckNotes({ deck: { match: 'outclassed', broke: false, hidden: false, chrome: false } })).toEqual(['OUTCLASSED']);
  });
});

describe('effect (effect and NERVE spec §1)', () => {
  const at = (o: Parameters<typeof poolOf>[1] extends infer W ? Partial<W> : never, c = check()) => poolOf(c, { stats: HICKS, deck: null, with: 'nix', ...o });

  it('kindResult: TAKE by effect, ALARM and heat as FAIR', () => {
    const takes = (e: Effect) => (['crit', 'clean', 'cost', 'miss'] as const).map((k) => kindResult(k, 'open', e).take);
    expect(takes('small')).toEqual([2, 1, 0, 0]);
    expect(takes('fair')).toEqual([3, 2, 1, 0]);
    expect(takes('big')).toEqual([4, 3, 2, 0]);
    for (const e of ['small', 'big'] as const) for (const k of ['crit', 'clean', 'cost', 'miss'] as const) for (const p of ['dark', 'open', 'wire'] as const) {
      const { take: _a, ...rest } = kindResult(k, p, e);
      const { take: _b, ...fair } = kindResult(k, p);
      expect(rest).toEqual(fair);
    }
    expect(resultOf([6], 'high', 'open', 'big').take).toBe(3);
  });

  it('the order and the clamp: tag, heat, trade, PUSH', () => {
    expect(at({}).effect).toBe('fair');
    expect(at({}).effectParts).toEqual([]);
    expect(at({ tag: 'big', heat: 6 })).toMatchObject({ effect: 'fair', effectParts: [{ label: 'HEAT 6', step: -1 }] });
    expect(at({ tag: 'small', heat: 7 }).effect).toBe('small');
    expect(at({ heat: 5 }).effect).toBe('fair');
    const bold = at({ trade: 'bold' });
    expect(bold).toMatchObject({ effect: 'big', position: 'wire', effectParts: [{ label: 'BOLD', step: 1 }] });
    const pe = at({ push: 'effect' });
    expect(pe).toMatchObject({ effect: 'big', dice: at({}).dice, effectParts: [{ label: 'PUSH', step: 1 }] });
    expect(at({ push: true })).toMatchObject({ effect: 'fair', dice: at({}).dice + 1 });
    expect(at({ push: 'dice' }).dice).toBe(at({}).dice + 1);
    expect(at({ tag: 'big', push: 'effect' }).effect).toBe('big');
  });

  it('an outclassed deck on a grid check makes it SMALL', () => {
    const weak: Deck = { ...DECK, quality: 1 };
    expect(at({ deck: weak, tier: 2 }, check({ grid: true }))).toMatchObject({ effect: 'small', effectParts: [{ label: 'OUTCLASSED', step: -1 }, { label: 'TIER 2 −1', step: -1 }] });
    expect(at({ deck: weak, tier: 2 }).effectParts).toEqual([{ label: 'TIER 2 −1', step: -1 }]);
  });

  it('the trade moves position last: after ALARM and a lift', () => {
    expect(at({ alarm: 2, trade: 'safe' }, check({ base: 60 })).position).toBe('dark');
    expect(at({ call: { label: 'RUE', dice: 0, lift: true }, trade: 'bold' }).position).toBe('open');
    expect(at({ trade: 'safe' }, check({ red: true, base: 70 })).position).toBe('open');
  });

  it('tradeRefusal and effectPushRefusal say why not', () => {
    expect(tradeRefusal(at({}, check({ base: 60 })), 'safe')).toBe('ALREADY IN THE DARK');
    expect(tradeRefusal(at({}, check({ base: 40 })), 'bold')).toBe('ALREADY ON THE WIRE');
    expect(tradeRefusal(at({ tag: 'small' }), 'safe')).toBe('ALREADY SMALL');
    expect(tradeRefusal(at({ tag: 'big' }), 'bold')).toBe('ALREADY BIG');
    expect(tradeRefusal(at({}), 'safe')).toBeNull();
    expect(tradeRefusal(at({}), 'bold')).toBeNull();
    expect(effectPushRefusal(at({ tag: 'big' }))).toBe('ALREADY BIG');
    expect(effectPushRefusal(at({}))).toBeNull();
    const none = at({ takes: false, trade: 'bold', push: 'effect' });
    expect(none.effect).toBeUndefined();
    expect(none.position).toBe('open');
    expect(none.dice).toBe(at({}).dice);
    expect(tradeRefusal(none, 'safe')).not.toBeNull();
    expect(effectPushRefusal(none)).not.toBeNull();
  });

  it("a save keeps the roll's effect, and a SMALL 4–5 fills nothing", () => {
    const miss = { stat: 'TECH', dice: 2, position: 'open' as const, faces: [2, 1], keep: 'high' as const, kind: 'miss' as const, pass: false, effect: 'small' as const };
    expect(afterEffect({ kind: 'save' }, miss, { alarm: 1, heat: 1 })?.roll.effect).toBe('small');
    expect(kindResult('cost', 'open', 'small').take).toBe(0);
  });
});

describe('programs in the pool (programs spec §1.4)', () => {
  const P = (id: string, stat: Program['stat'], kind: Program['kind']): Program => ({ id, name: id.toUpperCase(), stat, kind, line: 'x' });
  const SOLVENT = P('solvent', 'tech', 'position');
  const LEECH = P('leech', 'tech', 'effect');
  const SCRUB = P('scrub', 'any', 'quiet');
  const wire = check({ base: 40 });
  const q = (quality: Deck['quality'], traits: Deck['traits'] = []): Deck => ({ id: 'd', name: 'D', quality, heat: 0, traits });

  it('a position program steps before the crew lift and the trade', () => {
    const lift = { label: 'RUE', dice: 0 as const, lift: true };
    expect(poolOf(wire, { stats: HICKS, deck: DECK, with: 'x', call: lift, trade: 'bold', programs: [SOLVENT] }).position).toBe('open');
    expect(poolOf(wire, { stats: HICKS, deck: DECK, with: 'x', call: lift, trade: 'bold' }).position).toBe('wire');
  });

  it('a position program on the wire after breaker', () => {
    expect(poolOf(check({ base: 40, grid: true }), { stats: HICKS, deck: q(2, ['breaker']), with: 'x', programs: [SOLVENT] }).position).toBe('dark');
  });

  it('NEXT ROLL WORSE still comes last', () => {
    expect(poolOf(check({ base: 50 }), { stats: HICKS, deck: DECK, with: 'x', next: { worse: true }, programs: [SOLVENT] }).position).toBe('open');
  });

  it('an effect program joins effectParts and clamps', () => {
    const pool = poolOf(check(), { stats: HICKS, deck: DECK, with: 'x', push: 'effect', programs: [LEECH] });
    expect(pool.effect).toBe('big');
    expect(pool.effectParts).toContainEqual({ label: 'LEECH', step: 1 });
  });

  it('a below-tier run is marked', () => {
    expect(poolOf(check(), { stats: HICKS, deck: q(1), with: 'x', tier: 2, programs: [SOLVENT] }).programs).toEqual([{ id: 'solvent', label: 'SOLVENT', alarm: 1 }]);
    expect(poolOf(check(), { stats: HICKS, deck: q(2), with: 'x', tier: 2, programs: [SOLVENT] }).programs).toEqual([{ id: 'solvent', label: 'SOLVENT', alarm: 0 }]);
  });

  it('quiet marks the pool', () => {
    expect(poolOf(check(), { stats: HICKS, deck: DECK, with: 'x', programs: [SCRUB] }).quiet).toBe(true);
    expect(poolOf(check(), { stats: HICKS, deck: DECK, with: 'x' }).quiet).toBeUndefined();
  });

  it('programs never change dice', () => {
    const all = [SOLVENT, LEECH, P('skeleton-key', 'reflex', 'position'), P('voicebox', 'cool', 'effect'), P('sniffer', 'wits', 'effect'), P('spike', 'body', 'position'), SCRUB];
    expect(poolOf(check({ grid: true }), { stats: HICKS, deck: DECK, with: 'x', programs: all }).dice).toBe(poolOf(check({ grid: true }), { stats: HICKS, deck: DECK, with: 'x' }).dice);
  });
});

describe('tier cut (tier effect spec §1)', () => {
  const P = (kind: Program['kind']): Program => ({ id: kind, name: kind.toUpperCase(), stat: 'tech', kind, line: 'x' });
  const Q1: Deck = { ...DECK, quality: 1 };
  const hand = { lift: true, dice: 0 as const, label: 'Hicks', grade: 1 as const };
  const base = { tier: 2, takes: true, deck: null, programs: [] as Program[], grid: false };

  it('tier 1 has no cut', () => expect(tierCut({ ...base, tier: 1 })).toBeNull());
  it('no tier (a quest) has no cut', () => expect(tierCut({ ...base, tier: undefined })).toBeNull());
  it('no cut where the roll fills no TAKE', () => expect(tierCut({ ...base, takes: false })).toBeNull());
  it('tier 2 alone is cut', () => expect(tierCut(base)).toEqual({ label: 'TIER 2 −1', lifted: false }));
  it('a HAND recruit lifts tier 2, not tier 3', () => {
    expect(tierCut({ ...base, call: hand })).toEqual({ label: 'HICKS · HAND', lifted: true });
    expect(tierCut({ ...base, tier: 3, call: hand })).toEqual({ label: 'TIER 3 −1', lifted: false });
  });
  it('a PRO recruit lifts tier 3, a VET tier 4', () => {
    expect(tierCut({ ...base, tier: 3, call: { ...hand, grade: 2 } })?.lifted).toBe(true);
    expect(tierCut({ ...base, tier: 4, call: { ...hand, grade: 3 } })?.lifted).toBe(true);
  });
  it('a GREEN recruit does not lift tier 2', () => expect(tierCut({ ...base, call: { ...hand, grade: 0 } })?.lifted).toBe(false));
  it('a call with no grade (an ability, a contact, the favour) does not lift', () => {
    expect(tierCut({ ...base, call: { lift: false, dice: 1, label: 'FAVOUR' } })?.lifted).toBe(false);
  });
  it('a position or effect program lifts on a matching deck', () => {
    for (const kind of ['position', 'effect'] as const) expect(tierCut({ ...base, deck: DECK, programs: [P(kind)] })).toEqual({ label: 'STALL BUILD Q2', lifted: true });
  });
  it('a program on a Q1 deck does not lift tier 2', () => expect(tierCut({ ...base, deck: Q1, programs: [P('position')] })?.lifted).toBe(false));
  it('a quiet program does not lift', () => expect(tierCut({ ...base, deck: DECK, programs: [P('quiet')] })?.lifted).toBe(false));
  it('a grid roll on a matching deck lifts with no program', () => expect(tierCut({ ...base, deck: DECK, grid: true })?.lifted).toBe(true));
  it('a grid roll on a Q1 deck does not lift', () => expect(tierCut({ ...base, deck: Q1, grid: true })?.lifted).toBe(false));
  it('programs with no deck do not lift (a deck that died)', () => expect(tierCut({ ...base, programs: [P('position')] })?.lifted).toBe(false));
  it('a recruit names the lift before the deck', () => expect(tierCut({ ...base, call: hand, deck: DECK, grid: true })?.label).toBe('HICKS · HAND'));

  const pool = (o: Partial<Parameters<typeof poolOf>[1]> = {}, c = check()) => poolOf(c, { stats: HICKS, deck: null, with: 'nix', tier: 2, ...o });
  it('poolOf: tier 2 alone is SMALL with the part', () => {
    const p = pool();
    expect(p.effect).toBe('small');
    expect(p.effectParts).toContainEqual({ label: 'TIER 2 −1', step: -1 });
    expect(p.tier).toEqual({ label: 'TIER 2 −1', lifted: false });
  });
  it('poolOf: lifted stays FAIR with no part', () => {
    const p = pool({ call: hand });
    expect(p.effect).toBe('fair');
    expect(p.effectParts).toEqual([]);
    expect(p.tier).toEqual({ label: 'HICKS · HAND', lifted: true });
  });
  it('poolOf: [big] at tier 2 is FAIR', () => expect(pool({ tag: 'big' }).effect).toBe('fair'));
  it('poolOf: BOLD at tier 2 is FAIR', () => expect(pool({ trade: 'bold' }).effect).toBe('fair'));
  it('poolOf: an outclassed grid roll is SMALL with a recruit lifting TIER (OUTCLASSED stays)', () => {
    const p = pool({ deck: Q1, call: hand }, check({ grid: true }));
    expect(p.effect).toBe('small');
    expect(p.effectParts).toEqual([{ label: 'OUTCLASSED', step: -1 }]);
  });
  it('poolOf: a roll that fills no TAKE has no tier and no effect', () => {
    const p = pool({ takes: false });
    expect(p.tier).toBeUndefined();
    expect(p.effect).toBeUndefined();
  });
  it('poolOf: no tier given (a quest) has no cut', () => expect(pool({ tier: undefined }).effect).toBe('fair'));
  it('poolOf: tier 1 has no tier field', () => expect(pool({ tier: 1 }).tier).toBeUndefined());
  it('poolOf: path keeps the position before programs, a lift and NEXT ROLL WORSE', () => {
    expect(pool({ call: hand, next: { worse: true } }).path).toEqual({ placed: 'open', lift: true, worse: true });
    expect(pool().path).toEqual({ placed: 'open', lift: false, worse: false });
  });
  it('poolOf: effectRaw is the unclamped sum: below SMALL when the steps run past it', () => {
    expect(pool({ tier: 1 }).effectRaw).toBe(1);
    expect(pool().effectRaw).toBe(0);
    expect(pool({ heat: 6 }).effectRaw).toBe(-1);
    expect(pool({ heat: 6 }).effect).toBe('small');
    expect(pool({ takes: false }).effectRaw).toBeUndefined();
  });
});

describe('an ability press on the pool', () => {
  const who = { stats: HICKS, deck: null, with: 'x', tier: 2 };
  const press = (o: Partial<CallEffect>): CallEffect => ({ lift: false, dice: 0, label: 'Second Look', ...o });
  it('−1d shows as a part, and the next roll is untouched here', () => {
    const p = poolOf(check(), { ...who, press: press({ dice: -1, after: { better: true } }) });
    expect(p.dice).toBe(poolOf(check(), who).dice - 1);
    expect(p.parts).toContainEqual({ label: 'SECOND LOOK', dice: -1 });
    expect(p.position).toBe('open');
  });
  it('a step of effect either way joins the sum', () => {
    expect(poolOf(check(), { ...who, tier: 1, press: press({ step: 1 }) })).toMatchObject({ effect: 'big', effectParts: [{ label: 'Second Look', step: 1 }] });
    expect(poolOf(check(), { ...who, tier: 1, press: press({ step: -1 }) }).effect).toBe('small');
  });
  it('no step where the roll fills no TAKE', () => expect(poolOf(check(), { ...who, takes: false, press: press({ step: 1 }) }).effect).toBeUndefined());
  it('+1d stacks with a call', () => {
    const call: CallEffect = { lift: false, dice: 1, label: 'Hicks' };
    expect(poolOf(check(), { ...who, call, press: press({ dice: 1 }) }).dice).toBe(poolOf(check(), who).dice + 2);
  });
  it('a press from a recruit of the tier\'s grade lifts the cut; a GREEN doesn\'t', () => {
    expect(poolOf(check(), who)).toMatchObject({ effect: 'small', tier: { lifted: false } });
    expect(poolOf(check(), { ...who, press: press({ grade: 1 }) })).toMatchObject({ effect: 'fair', tier: { label: 'SECOND LOOK · HAND', lifted: true } });
    expect(poolOf(check(), { ...who, press: press({ grade: 0 }) })).toMatchObject({ effect: 'small', tier: { lifted: false } });
  });
  it('a called GREEN and a HAND press: the press lifts it', () => {
    expect(poolOf(check(), { ...who, call: { lift: true, dice: 0, label: 'Dez', grade: 0 }, press: press({ grade: 1 }) }).tier?.lifted).toBe(true);
  });
  it('a press that lifts position moves it a step, on top of a call', () => {
    expect(poolOf(check({ base: 40 }), { ...who, call: { lift: true, dice: 0, label: 'Dez' }, press: press({ lift: true }) }).position).toBe('dark');
  });
  it('greed\'s ALARM counts for its own roll: crossing 2 makes it a step worse', () => {
    expect(poolOf(check(), { ...who, alarm: 1, press: press({ step: 1, alarm: 1 }) }).position).toBe('wire');
    expect(poolOf(check(), { ...who, alarm: 0, press: press({ step: 1, alarm: 1 }) }).position).toBe('open');
    expect(poolOf(check(), { ...who, alarm: 1, call: { ...press({ step: 1, alarm: 1 }) } }).position).toBe('wire');
  });
  it('a setup left for this roll: a position better, after NEXT ROLL WORSE; +1d', () => {
    expect(poolOf(check(), { ...who, next: { better: true } }).position).toBe('dark');
    expect(poolOf(check(), { ...who, next: { worse: true, better: true } }).position).toBe('open');
    const p = poolOf(check(), { ...who, next: { die: true } });
    expect(p.dice).toBe(poolOf(check(), who).dice + 1);
    expect(p.parts).toContainEqual({ label: 'SET UP', dice: 1 });
  });
});

describe('gambles (ability pass spec §2)', () => {
  it('gambleResult: 4+ wins, 1–3 loses', () => {
    expect([1, 3, 4, 6].map((d) => gambleResult(d, 'cost'))).toEqual(['worse', 'worse', 'clean', 'clean']);
    expect([1, 3, 4, 6].map((d) => gambleResult(d, 'miss'))).toEqual(['worse', 'worse', 'cost', 'cost']);
  });
  it('gambleDie: a die, the same for the same seed', () => {
    const dice = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(gambleDie);
    expect(dice.every((d) => d >= 1 && d <= 6)).toBe(true);
    expect(new Set(dice).size).toBeGreaterThan(1);
    expect(gambleDie('a')).toBe(dice[0]);
  });
  it('gambleFaces: the kept die reads the new top, and the faces roll to the new result', () => {
    for (const [faces, keep, top, kind] of [[[4, 2], 'high', 6, 'clean'], [[5, 4], 'high', 2, 'miss'], [[3, 1], 'high', 5, 'cost'], [[5, 4], 'low', 6, 'clean'], [[6, 5], 'low', 3, 'miss'], [[2, 6], 'low', 5, 'cost']] as const) {
      expect(resultOf(gambleFaces([...faces], keep, top), keep, 'open').kind).toBe(kind);
    }
  });
});

describe('an angle (tier 3 contracts spec §3)', () => {
  const base = { tier: 3, takes: true, deck: null, programs: [], grid: false, angle: true };
  const hand = { lift: false, dice: 0 as const, label: 'X', grade: 1 as const };
  it('alone, the cut stays and the card says why', () => expect(tierCut(base)).toEqual({ label: 'ANGLE NEEDS CREW', lifted: false }));
  it('any recruit on it skips the cut, by a call or a press', () => {
    expect(tierCut({ ...base, call: hand })).toEqual({ label: 'ANGLE', lifted: true });
    expect(tierCut({ ...base, press: hand })).toEqual({ label: 'ANGLE', lifted: true });
  });
  it('a contact or the favour, with no grade, does not', () => expect(tierCut({ ...base, call: { ...hand, grade: undefined } })?.lifted).toBe(false));
  it('does nothing where no cut applies', () => expect(tierCut({ ...base, tier: 1 })).toBeNull());
  const stats = { body: 4, reflex: 6, tech: 6, cool: 6, wits: 6, edge: 4 };
  const check = { stat: 'tech' as const, base: 55, grid: false, crew: [], red: false, mods: [], angle: true as const };
  const who = { stats, deck: null, with: 'x', tier: 3 };
  it('a recruit of the tier adds a step of effect', () => {
    expect(poolOf(check, who).effect).toBe('small');
    expect(poolOf(check, { ...who, call: hand }).effect).toBe('fair');
    expect(poolOf(check, { ...who, call: { ...hand, grade: 2 } }).effect).toBe('big');
    expect(poolOf(check, { ...who, press: { ...hand, grade: 3 } }).effect).toBe('big');
  });
  it('on a plain card a PRO gets no extra step', () => expect(poolOf({ ...check, angle: undefined }, { ...who, call: { ...hand, grade: 2 } }).effect).toBe('fair'));
});

describe('PRO and VET in the pool (tier 3 beat play spec §2)', () => {
  const stats = { body: 4, reflex: 6, tech: 2, cool: 9, wits: 6, edge: 4 };
  const check = { stat: 'tech' as const, base: 55, grid: true, crew: [], red: false, mods: [] };
  const who = { stats, deck: null, with: 'x' };
  const eff = { lift: false, dice: 0 as const, label: 'X' };
  it('One More Thing takes COOL dice and leaves the grid', () => {
    const p = poolOf(check, { ...who, press: { ...eff, stat: 'cool' } });
    expect(p.stat).toBe('COOL');
    expect(p.dice).toBe(4);
    expect(p.parts.map((x) => x.label)).not.toContain('NO DECK');
  });
  it('Calm Voice lifts the cut but not OUTCLASSED', () => {
    const deck = { id: 'd', name: 'D', quality: 1 as const, heat: 0, traits: [] };
    const p = poolOf(check, { ...who, deck, tier: 3, next: { noCut: true } });
    expect(p.tier).toEqual({ label: 'INSIDE INFORMATION', lifted: true });
    expect(p.effectParts!.map((x) => x.label)).toContain('OUTCLASSED');
  });
});
