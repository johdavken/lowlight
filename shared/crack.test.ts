import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hintLine, likeness, makeTerminal, parseWords, playTerminal, type Terminal } from './crack';

const WORDS7 = ['LACQUER', 'CARTING', 'GHOSTLY', 'SCRIPTS', 'KARASUS', 'MERIDAN', 'CORTEXS', 'MIRAGEN', 'LACKING', 'RIBBONS', 'SENTRYS', 'VELVETS', 'STRANDS', 'CHROMES', 'PATCHES', 'BOOTHED'];
const make = (o: Partial<Parameters<typeof makeTerminal>[0]> = {}): Terminal =>
  makeTerminal({ seed: 'run-1|door|talk', length: 7, words: WORDS7, extraBracket: false, strikeOne: false, ghost: false, hint: null, tries: 4, ...o });
const duds = (t: Terminal) => t.words.map((w) => w.word).filter((w) => w !== t.password);

describe('the dump', () => {
  it('the look never moves the draw', () => {
    expect(make({ skin: 'amber', deck: 'Old Karasu deck' })).toEqual(make({ skin: 'ice', deck: null }));
  });
  it('words sit in the lines, apart; brackets hold only junk; the password is a candidate', () => {
    const t = make();
    expect(t.lines).toHaveLength(32);
    for (const l of t.lines) expect(l).toHaveLength(12);
    expect(t.words).toHaveLength(12);
    for (const w of t.words) expect(t.lines[w.line].slice(w.col, w.col + 7)).toBe(w.word);
    const cells = new Set<string>();
    for (const w of t.words) for (let i = -1; i <= 7; i++) {
      const k = `${w.line}:${w.col + i}`;
      if (i >= 0 && i < 7) expect(cells.has(k)).toBe(false);
      cells.add(k);
    }
    expect(t.brackets).toHaveLength(3);
    for (const b of t.brackets) {
      const inside = t.lines[b.line].slice(b.from + 1, b.to);
      expect(inside).not.toMatch(/[A-Z]/);
      expect('[({<').toContain(t.lines[b.line][b.from]);
    }
    expect(t.words.map((w) => w.word)).toContain(t.password);
  });
  it('candidates by length: 10 for 5–6, 12 for 7, 14 for 8–9', () => {
    const five = Array.from({ length: 16 }, (_, i) => `ABC${String.fromCharCode(65 + i)}${String.fromCharCode(70 + i)}`);
    expect(makeTerminal({ seed: 's', length: 5, words: five, extraBracket: false, strikeOne: false, ghost: false, hint: null, tries: 4 }).words).toHaveLength(10);
    const nine = Array.from({ length: 16 }, (_, i) => `ABCDEFG${String.fromCharCode(65 + i)}${String.fromCharCode(70 + i)}`);
    expect(makeTerminal({ seed: 's', length: 9, words: nine, extraBracket: false, strikeOne: false, ghost: false, hint: null, tries: 4 }).words).toHaveLength(14);
  });
  it('the same seed gives the same terminal', () => {
    expect(make()).toEqual(make());
    expect(make({ seed: 'other' }).password === make().password && make({ seed: 'other' }).lines.join() === make().lines.join()).toBe(false);
  });
});

describe('likeness', () => {
  it('letters equal at the same place', () => {
    expect(likeness('LACQUER', 'LACKING')).toBe(3);
  });
});

describe('playing', () => {
  it('a wrong word costs a try and logs likeness; the right word grants', () => {
    const t = make();
    const d = duds(t)[0];
    const r = playTerminal(t, [{ word: d }, { word: t.password }]);
    expect(r.log[0]).toMatchObject({ likeness: likeness(d, t.password) });
    expect(r.triesLeft).toBe(3);
    expect(r.state).toBe('granted');
  });
  it('tries reaching 0 locks', () => {
    const t = make({ tries: 2 });
    const [a, b] = duds(t);
    expect(playTerminal(t, [{ word: a }, { word: b }]).state).toBe('locked');
  });
  it('brackets 1–2 remove a dud; the third resets tries once; a fourth (stall build) removes another; a used bracket does nothing', () => {
    const t = make({ extraBracket: true });
    expect(t.brackets).toHaveLength(4);
    const [a] = duds(t);
    const r = playTerminal(t, [{ bracket: 0 }, { bracket: 1 }, { word: a }, { bracket: 2 }, { bracket: 2 }, { bracket: 3 }]);
    expect(r.log.filter((l) => l.removed)).toHaveLength(3);
    expect(r.log.filter((l) => l.reset)).toHaveLength(1);
    expect(r.triesLeft).toBe(4);
    for (const l of r.log) if (l.removed) expect(l.removed).not.toBe(t.password);
  });
  it('strikeOne and ghost', () => {
    const t = make({ strikeOne: true, ghost: true });
    expect(t.struck).toHaveLength(1);
    expect(t.struck[0]).not.toBe(t.password);
    expect(t.password[t.ghost!.index]).toBe(t.ghost!.letter);
  });
});

describe('hints and words', () => {
  it('hintLine names a letter the dud has and the password lacks', () => {
    const line = hintLine('ember', 'LACQUER', 'GHOSTLY');
    expect(line).toMatch(/^Ember: not the one with the [ACQUER]$/);
  });
  it('the live word list parses with no warnings', () => {
    const r = parseWords(fs.readFileSync('world/gear/words.md', 'utf8'));
    expect(r.warnings).toEqual([]);
    for (const n of [5, 6, 7, 8, 9]) {
      expect(r.byLength[n].length).toBeGreaterThanOrEqual(14);
      for (const w of r.byLength[n]) expect(w).toMatch(new RegExp(`^[A-Z]{${n}}$`));
    }
  });
  it('a short length warns', () => {
    expect(parseWords('## 5\nABCDE\n').warnings.length).toBeGreaterThan(0);
  });
});
