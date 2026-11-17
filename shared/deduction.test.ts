import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parseCaseFile, type CaseFile } from './cases';
import { accuseOpen, applyBoardMove, boardView, cleanBoard, freshBoard, type BoardState } from './deduction';

// The board's rules (deduction board spec §3), on the real case.
const r = parseCaseFile('the-fourteenth', fs.readFileSync('world/cases/the-fourteenth.md', 'utf8'), { extras: null });
if (!r.ok) throw new Error(JSON.stringify(r.problems));
const C: CaseFile = r.entry;
const HELD = ['HAND', 'BOWL', 'DOOR', 'PENN', 'ALIBI', 'NEVER', 'TAB', 'CALL', 'SHUTTER', 'HESK', 'DATE', 'CASS'];
const play = (s: BoardState, m: Parameters<typeof applyBoardMove>[3], held = HELD) => applyBoardMove(C, s, held, m);

describe('the board', () => {
  it('a clashing pair files its deduction and says its text', () => {
    const o = play(freshBoard(C), { kind: 'pair', a: 'BOWL', b: 'HAND' });
    expect(o.state.filed).toEqual(['STEADY']);
    expect(o.said).toBe(C.deductions.get('STEADY')!.text);
    expect(o.state.tried['BOWL|HAND']).toBe('filed');
    expect(o.state.patience).toBe(3);
  });
  it('a second route files nothing new and costs nothing', () => {
    const held = [...HELD, 'SOLD', 'LEDGER'];
    const a = play(freshBoard(C), { kind: 'pair', a: 'NEVER', b: 'SOLD' }, held).state;
    const b = play(a, { kind: 'pair', a: 'LEDGER', b: 'NEVER' }, held);
    expect(b.state.filed).toEqual(['LT']);
    expect(b.said).toBe('You knew that already. LT holds.');
    expect(b.state.patience).toBe(3);
  });
  it('a bounce costs one patience and says the near miss, or "They can both be true."', () => {
    const a = play(freshBoard(C), { kind: 'pair', a: 'ALIBI', b: 'TAB' });
    expect(a.state.patience).toBe(2);
    expect(a.said).toBe('People close a tab and stay. Cass would know if she left.');
    const b = play(a.state, { kind: 'pair', a: 'HESK', b: 'BOWL' });
    expect(b.said).toBe('They can both be true.');
    expect(b.state.patience).toBe(1);
  });
  it('a pair already tried costs nothing and is marked', () => {
    const a = play(freshBoard(C), { kind: 'pair', a: 'ALIBI', b: 'TAB' }).state;
    const b = play(a, { kind: 'pair', a: 'TAB', b: 'ALIBI' });
    expect(b.state.patience).toBe(2);
    expect(b.state.tried['ALIBI|TAB']).toBe('bounced');
  });
  it('a pair with a card not held is refused (Review Focus 4)', () => {
    const o = play(freshBoard(C), { kind: 'pair', a: 'NEVER', b: 'SOLD' });
    expect(o.refused).toMatch(/SOLD/);
    expect(o.state).toEqual(freshBoard(C));
  });
  it("filing respects the deduction's blank; a none deduction can go in any blank", () => {
    let s = play(freshBoard(C), { kind: 'pair', a: 'HAND', b: 'BOWL' }).state;
    s = play(s, { kind: 'pair', a: 'PENN', b: 'DOOR' }).state;
    expect(play(s, { kind: 'file', deduction: 'STEADY', blank: 'WHO' }).refused).toMatch(/HOW/);
    expect(play(s, { kind: 'file', deduction: 'STEADY', blank: 'HOW' }).state.blanks.HOW).toBe('STEADY');
    expect(play(s, { kind: 'file', deduction: 'PENNSOLD', blank: 'WHY' }).state.blanks.WHY).toBe('PENNSOLD');
    expect(play(s, { kind: 'file', deduction: 'OUT', blank: 'WHO' }).refused).toMatch(/OUT/);
  });
  it('filing moves a deduction out of any other blank', () => {
    let s = play(freshBoard(C), { kind: 'pair', a: 'PENN', b: 'DOOR' }).state;
    s = play(s, { kind: 'file', deduction: 'PENNSOLD', blank: 'WHO' }).state;
    s = play(s, { kind: 'file', deduction: 'PENNSOLD', blank: 'WHY' }).state;
    expect(s.blanks).toEqual({ WHY: 'PENNSOLD' });
    expect(play(s, { kind: 'unfile', blank: 'WHY' }).state.blanks).toEqual({});
  });
  it('naming toggles', () => {
    const a = play(freshBoard(C), { kind: 'name', suspect: 'K.' }).state;
    expect(a.suspect).toBe('K.');
    expect(play(a, { kind: 'name', suspect: null }).state.suspect).toBeNull();
    expect(play(a, { kind: 'name', suspect: 'NOBODY' }).refused).toBeDefined();
  });
  it('accuse is refused until open; open with three filled and a suspect, or at patience 0', () => {
    let s = freshBoard(C);
    expect(play(s, { kind: 'accuse' }).refused).toBeDefined();
    for (const [a, b] of [['HAND', 'BOWL'], ['ALIBI', 'CASS'], ['PENN', 'DOOR']]) s = play(s, { kind: 'pair', a, b }).state;
    for (const [d, b] of [['OUT', 'WHO'], ['STEADY', 'HOW'], ['PENNSOLD', 'WHY']] as const) s = play(s, { kind: 'file', deduction: d, blank: b }).state;
    expect(accuseOpen(s)).toBe(false);
    s = play(s, { kind: 'name', suspect: 'K.' }).state;
    expect(accuseOpen(s)).toBe(true);
    expect(play(s, { kind: 'accuse' }).verdict).toBe('thin');
  });
  it("at patience 0 the verdict comes from what's filed (Review Focus 2)", () => {
    let s = play(freshBoard(C), { kind: 'pair', a: 'HAND', b: 'BOWL' }).state;
    s = play(s, { kind: 'file', deduction: 'STEADY', blank: 'HOW' }).state;
    for (const [a, b] of [['ALIBI', 'TAB'], ['HESK', 'BOWL'], ['CALL', 'SHUTTER']]) s = play(s, { kind: 'pair', a, b }).state;
    expect(s.patience).toBe(0);
    expect(accuseOpen(s)).toBe(true);
    expect(play(s, { kind: 'pair', a: 'ALIBI', b: 'CASS' }).refused).toBeDefined();
    s = play(s, { kind: 'name', suspect: 'K.' }).state;
    expect(play(s, { kind: 'accuse' }).verdict).toBe('thin');
    expect(play(play(s, { kind: 'name', suspect: 'HESK' }).state, { kind: 'accuse' }).verdict).toBe('wrong-hesk');
  });
  it('cleanBoard drops a deduction id the case no longer has (Review Focus 3)', () => {
    const s: BoardState = { ...freshBoard(C), filed: ['STEADY', 'GONE'], blanks: { HOW: 'STEADY', WHY: 'GONE' } };
    expect(cleanBoard(C, s)).toMatchObject({ filed: ['STEADY'], blanks: { HOW: 'STEADY' } });
  });
  it('boardView lists the missing cards with their missed lines', () => {
    const v = boardView(C, freshBoard(C), HELD);
    expect(v.hand.map((c) => c.id)).toEqual(HELD.filter((id) => C.cards.has(id)).sort((a, b) => [...C.cards.keys()].indexOf(a) - [...C.cards.keys()].indexOf(b)));
    expect(v.missing).toContainEqual({ source: 'THE DEAD-CART', missed: 'Job 1: the roll to find the crew missed.' });
    expect(v.missing.filter((m) => m.source === "PENN'S BOOK")).toHaveLength(1);
    expect(v.suspects.map((s) => s.slug)).toEqual(['k', 'dr-penn', 'hesk']);
    expect(v.accuseOpen).toBe(false);
  });
});

describe('the board on a saved run', () => {
  it('survives parseRun', async () => {
    const { parseRun } = await import('./quests');
    let s = applyBoardMove(C, freshBoard(C), HELD, { kind: 'pair', a: 'HAND', b: 'BOWL' }).state;
    s = applyBoardMove(C, s, HELD, { kind: 'file', deduction: 'STEADY', blank: 'HOW' }).state;
    const run = parseRun(JSON.stringify({ beat: 'wall', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1, day: 1, board: s }));
    expect(run?.board).toEqual(s);
  });
});


describe('barks on the board view (The Fourteenth voice script)', () => {
  it('a board with clips carries them, grouped, with the groups its deductions set off; without clips it has none', () => {
    const clips = { bounce1: ['/a.ogg'], kat: ['/k.ogg'] };
    const v = boardView(C, freshBoard(C), HELD, undefined, clips);
    expect(v.barks).toEqual({ clips, on: C.barksOn });
    expect(boardView(C, freshBoard(C), HELD).barks).toBeUndefined();
    expect(boardView(C, freshBoard(C), HELD, undefined, {}).barks).toBeUndefined();
  });
  it("The Fourteenth's kat bark is set off by OUT and LT", () => {
    expect(C.barksOn).toEqual({ kat: ['OUT', 'LT'] });
  });
});
