import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { pairKey, parseCaseFile, slugOf, verdictOf, verdictsOf, type CaseFile } from './cases';

const CASE = `---
title: Test Case
patience: 3
suspects:
  - K. | face-k | Sweeps the bar.
  - DR. PENN | face-p | Runs a back room.
  - HESK | face-h | Paid by the head.
answer: "K. | WHO: OUT | HOW: STAGED, STEADY | WHY: LT"
---

# cards
- HAND [body] THE NOTE: Port used. A day of shaking. | from: free
- PORT [body] THE CART: Port still sealed. | from: roll:cart | missed: Job 1: the roll missed.
- BOWL [street] HAE: Steady hands at eleven. | from: free
- ALIBI [said] K. SAYS: At the bar till close. | from: free
- CASS [street] CASS: She left before half ten. | from: roll:cass
- NEVER [said] K. SAYS: Never sold a thing. | from: free
- SOLD [notebook] NOTEBOOK: What I sold. | from: dug
- LEDGER [grid] PENN'S BOOK: LT is the sweeper. | from: roll:crack
- TAB [street] THE TILL: Tab closed 22:15. | from: free

# deductions
- STAGED → HOW: The vial was put in his hand.
- STEADY → HOW: It was not an edit.
- OUT → WHO: K. lied about where she was.
- LT → WHY: K. is LOW TIDE.

# clashes
- HAND × PORT → STAGED
- HAND × BOWL → STEADY
- ALIBI × CASS → OUT
- NEVER × SOLD → LT
- NEVER × LEDGER → LT

# near misses
- ALIBI × TAB: People close a tab and stay.
`;
const extras = new Set(['face-k', 'face-p', 'face-h']);
const ok = (text = CASE): CaseFile => {
  const r = parseCaseFile('test-case', text, { extras });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const problems = (text: string) => {
  const r = parseCaseFile('test-case', text, { extras });
  return r.ok ? [] : r.problems.map((p) => p.message).join(' / ');
};

describe('case files (deduction board spec §1)', () => {
  it('parses cards, deductions, clashes, near misses and the answer', () => {
    const c = ok();
    expect([c.cards.size, c.deductions.size, c.clashes.size, c.near.size]).toEqual([9, 4, 5, 1]);
    expect(c.cards.get('LEDGER')!.from).toEqual({ roll: 'crack' });
    expect(c.cards.get('SOLD')!.from).toBe('dug');
    expect(c.cards.get('PORT')!.missed).toBe('Job 1: the roll missed.');
    expect(c.cards.get('HAND')).toMatchObject({ kind: 'body', source: 'THE NOTE', line: 'Port used. A day of shaking.' });
    expect(c.answer).toEqual({ suspect: 'K.', right: { WHO: ['OUT'], HOW: ['STAGED', 'STEADY'], WHY: ['LT'] } });
    expect(c.suspects.map((s) => s.slug)).toEqual(['k', 'dr-penn', 'hesk']);
    expect(c.patience).toBe(3);
    expect(slugOf('DR. PENN')).toBe('dr-penn');
    expect(c.near.get(pairKey('TAB', 'ALIBI'))).toBe('People close a tab and stay.');
  });
  it('two pairs can file one deduction', () => {
    const c = ok();
    expect(c.clashes.get(pairKey('NEVER', 'SOLD'))).toBe('LT');
    expect(c.clashes.get(pairKey('LEDGER', 'NEVER'))).toBe('LT');
  });
  it('problems', () => {
    expect(problems(CASE.replace('- HAND × PORT → STAGED', '- HAND × NOPE → STAGED'))).toMatch(/unknown card 'NOPE'/);
    expect(problems(CASE.replace('- HAND × PORT → STAGED', '- HAND × PORT → NOPE'))).toMatch(/unknown deduction 'NOPE'/);
    expect(problems(CASE.replace('- NEVER × LEDGER → LT', '- NEVER × LEDGER → LT\n- TAB × ALIBI → OUT'))).toMatch(/listed twice/);
    expect(problems(CASE.replace('- NEVER × LEDGER → LT', '- NEVER × LEDGER → LT\n- PORT × HAND → STAGED'))).toMatch(/listed twice/);
    expect(problems(CASE.replace('- HAND × BOWL → STEADY\n', ''))).toMatch(/no clash files 'STEADY'/);
    expect(problems(CASE.replace('WHY: LT', 'WHY: OUT'))).toMatch(/answer WHY: 'OUT' fills WHO/);
    expect(problems(CASE.replace('face-h', 'face-x'))).toMatch(/no extra 'face-x'/);
    expect(problems(CASE.replace('[grid]', '[smell]'))).toMatch(/kind/);
    expect(problems(CASE.replace('from: dug', 'from: maybe'))).toMatch(/from/);
  });
  it('verdictOf', () => {
    const c = ok();
    expect(verdictOf(c, { suspect: 'K.', blanks: { WHO: 'OUT', HOW: 'STEADY', WHY: 'LT' } })).toBe('holds');
    expect(verdictOf(c, { suspect: 'K.', blanks: { WHO: 'OUT', HOW: 'STEADY' } })).toBe('thin');
    expect(verdictOf(c, { suspect: 'K.', blanks: { WHO: 'LT' } })).toBe('hunch');
    expect(verdictOf(c, { suspect: 'DR. PENN', blanks: { WHO: 'OUT', HOW: 'STEADY', WHY: 'LT' } })).toBe('wrong-dr-penn');
    expect(verdictOf(c, { suspect: null, blanks: {} })).toBe('hunch');
  });
  it('verdictsOf lists every reachable verdict', () => {
    expect(verdictsOf(ok())).toEqual(['holds', 'thin', 'hunch', 'wrong-dr-penn', 'wrong-hesk']);
  });
  it('the real case file parses', () => {
    const ids = new Set((JSON.parse(fs.readFileSync('world/extras/extras.json', 'utf8')) as { id: string }[]).map((e) => e.id));
    const r = parseCaseFile('the-fourteenth', fs.readFileSync('world/cases/the-fourteenth.md', 'utf8'), { extras: ids });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect([r.entry.cards.size, r.entry.deductions.size, r.entry.clashes.size, r.entry.near.size]).toEqual([17, 5, 6, 7]);
  });
});

describe('barks: a case names the deductions that set off a bark group (The Fourteenth voice script, kat)', () => {
  it('reads barks: as group → deduction ids', () => {
    expect(ok(CASE.replace('patience: 3\n', 'patience: 3\nbarks:\n  kat: OUT, LT\n')).barksOn).toEqual({ kat: ['OUT', 'LT'] });
    expect(ok().barksOn).toEqual({});
  });
  it('a bark named for a deduction the case lacks is a problem', () => {
    expect(problems(CASE.replace('patience: 3\n', 'patience: 3\nbarks:\n  kat: OUT, GONE\n'))).toContain("kat: no deduction 'GONE'");
  });
});
