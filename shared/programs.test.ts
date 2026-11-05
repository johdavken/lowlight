import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Deck } from './gear';
import type { Check } from './mission';
import { poolOf } from './dice';
import { belowTier, jobLeans, parsePrograms, programFits, programJudge, programQuality, slotsFor, type Program } from './programs';

const deck = (quality: Deck['quality']): Deck => ({ id: `q${quality}`, name: `Q${quality}`, quality, heat: 0, traits: [] });
const block = (o: Record<string, string>) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
const good = block({ id: 'solvent', name: 'SOLVENT', stat: 'tech', kind: 'position', line: 'Strips the lacquer back a layer.' });

describe('parsePrograms', () => {
  it('parses the eight starting programs', () => {
    const r = parsePrograms(fs.readFileSync('world/gear/programs.md', 'utf8'));
    expect(r.problems).toEqual([]);
    expect(r.programs.map((p) => p.id)).toEqual(['solvent', 'leech', 'skeleton-key', 'voicebox', 'sniffer', 'spike', 'scrub', 'firewall']);
    expect(r.programs[0]).toMatchObject({ stat: 'tech', kind: 'position' });
    expect(r.programs.find((p) => p.id === 'scrub')?.stat).toBe('any');
    expect(r.programs.find((p) => p.id === 'firewall')?.stat).toBe('any');
  });

  it('skips a bad stat, a bad kind and a repeated id with one problem each', () => {
    const bad = [
      block({ id: 'b1', name: 'B1', stat: 'edge', kind: 'position', line: 'x' }),
      block({ id: 'b2', name: 'B2', stat: 'tech', kind: 'dice', line: 'x' }),
      good,
    ];
    const r = parsePrograms(good + bad.join(''));
    expect(r.programs.map((p) => p.id)).toEqual(['solvent']);
    expect(r.problems).toHaveLength(3);
    expect(r.problems[0]).toMatch(/^b1:/);
    expect(r.problems[1]).toMatch(/^b2:/);
    expect(r.problems[2]).toMatch(/^solvent:/);
  });
});

describe('slots and quality', () => {
  it('slots by quality', () => {
    expect(slotsFor(null)).toBe(0);
    expect([1, 2, 3, 4].map((q) => slotsFor(deck(q as Deck['quality'])))).toEqual([1, 2, 2, 3]);
  });

  it('fine runs a step higher', () => {
    const p = parsePrograms(good).programs[0];
    expect(belowTier(deck(2), p, 3)).toBe(true);
    expect(programQuality(deck(2), { ...p, fine: true })).toBe(3);
    expect(belowTier(deck(2), { ...p, fine: true }, 3)).toBe(false);
    expect(belowTier(deck(1), p, undefined)).toBe(false);
  });
});

describe('programFits (§1.5)', () => {
  const P = (stat: Program['stat'], kind: Program['kind']): Program => ({ id: 'p', name: 'P', stat, kind, line: 'x' });
  const c = (o: Partial<Check> = {}): Check => ({ stat: 'tech', base: 50, grid: false, crew: [], red: false, mods: [], ...o });
  const open = { position: 'open' as const, effect: 'fair' as const };
  it('runs where it can do something', () => {
    expect(programFits(P('tech', 'position'), open, c(), deck(2))).toBeNull();
    expect(programFits(P('any', 'quiet'), open, c({ grid: true }), deck(2))).toBeNull();
  });
  it('refuses with the reason', () => {
    expect(programFits(P('tech', 'position'), open, c({ red: true }), deck(2))).toBe('ONE SHOT');
    expect(programFits(P('cool', 'position'), open, c(), deck(2))).toBe('NOTHING TO DO HERE');
    expect(programFits(P('any', 'firewall'), open, c(), deck(2))).toBe('NOTHING TO DO HERE');
    expect(programFits(P('any', 'quiet'), open, c({ grid: true }), { ...deck(2), traits: ['hidden'] })).toBeNull();
    expect(programFits(P('tech', 'position'), { position: 'dark', effect: 'fair' }, c(), deck(2))).toBe('ALREADY IN THE DARK');
    expect(programFits(P('tech', 'effect'), { position: 'open', effect: 'big' }, c(), deck(2))).toBe('ALREADY BIG');
    expect(programFits(P('tech', 'effect'), { position: 'open' }, c(), deck(2))).toBe('NOTHING TO TAKE HERE');
  });
});

describe('programJudge (Task 5 review I1)', () => {
  const P = (id: string, stat: Program['stat'], kind: Program['kind']): Program => ({ id, name: id.toUpperCase(), stat, kind, line: 'x' });
  const c = (o: Partial<Check> = {}): Check => ({ stat: 'tech', base: 50, grid: false, crew: [], red: false, mods: [], ...o });
  const who = { stats: { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 }, deck: deck(2), with: 'x' };
  it('a position step that NEXT ROLL WORSE undoes from the dark is refused', () => {
    const check = c({ base: 60 });
    const w = { ...who, next: { worse: true as const } };
    expect(programJudge(P('solvent', 'tech', 'position'), (ps) => poolOf(check, { ...w, programs: ps }), [], check, deck(2))).toBe('ALREADY IN THE DARK');
  });
  it('a second effect program past BIG is refused; the first runs', () => {
    const check = c();
    const at = (ps: Program[]) => poolOf(check, { ...who, programs: ps });
    const leech = P('leech', 'tech', 'effect');
    expect(programJudge(leech, at, [], check, deck(2))).toBeNull();
    expect(programJudge(P('drain', 'tech', 'effect'), at, [leech], check, deck(2))).toBe('ALREADY BIG');
  });
  it('quiet always counts', () => {
    const check = c();
    expect(programJudge(P('scrub', 'any', 'quiet'), (ps) => poolOf(check, { ...who, programs: ps }), [], check, deck(2))).toBeNull();
  });
});

describe('jobLeans (§1.2a)', () => {
  const beat = (...stats: (string | null)[]) => ({ choices: stats.map((stat) => ({ check: stat ? { stat } : null })) });
  it('the stats of its checks, most used first, at most three', () => {
    expect(jobLeans({ beats: new Map([['a', [beat('cool', 'tech', null)]], ['b', [beat('tech', 'wits', 'body')]]]) })).toEqual(['tech', 'cool', 'wits']);
    expect(jobLeans({ beats: new Map([['a', [beat(null)]]]) })).toEqual([]);
  });
});
