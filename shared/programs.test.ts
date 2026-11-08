import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Deck } from './gear';
import type { Check } from './mission';
import { poolOf } from './dice';
import { asFoil, baseProgramId, belowTier, foilDrop, jobLeans, loadablePrograms, parsePrograms, programFits, programJudge, programQuality, slotsFor, starterPrograms, type Program } from './programs';

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

describe('owned programs (owned programs plan)', () => {
  const catalog = parsePrograms(fs.readFileSync('world/gear/programs.md', 'utf8')).programs;
  const stats = (o: Partial<Record<'body' | 'reflex' | 'tech' | 'cool' | 'wits' | 'edge', number>>) => ({ body: 3, reflex: 3, tech: 3, cool: 3, wits: 3, edge: 3, ...o });

  it('the starter is FIREWALL and the program for the highest stat, ties broken tech, cool, wits, reflex, body', () => {
    expect(starterPrograms(stats({ tech: 7, cool: 7 }), catalog)).toEqual(['firewall', 'solvent']);
    expect(starterPrograms(stats({ cool: 7, wits: 7 }), catalog)).toEqual(['firewall', 'voicebox']);
    expect(starterPrograms(stats({}), catalog)).toEqual(['firewall', 'solvent']);
    expect(starterPrograms(stats({ body: 8, edge: 9 }), catalog)).toEqual(['firewall', 'spike']);
    expect(starterPrograms(stats({ reflex: 6 }), catalog)).toEqual(['firewall', 'skeleton-key']);
    expect(starterPrograms(stats({ wits: 6 }), catalog)).toEqual(['firewall', 'sniffer']);
  });

  it('the loadable list: owned in catalog order, then each foil held with its count', () => {
    const list = loadablePrograms(catalog, { owned: ['solvent', 'firewall'], foil: { leech: 2, spike: 0 } });
    expect(list.map((p) => [p.id, p.foil ?? false, p.count ?? 1])).toEqual([
      ['solvent', false, 1],
      ['firewall', false, 1],
      ['foil:leech', true, 2],
    ]);
    expect(baseProgramId('foil:leech')).toBe('leech');
    expect(baseProgramId('leech')).toBe('leech');
  });

  it('a foil drop is seeded by the run, about 15 %, and follows the job’s lean', () => {
    const keys = Array.from({ length: 4000 }, (_, i) => `quest.you.job-${i}@3`);
    const drops = keys.map((k) => foilDrop(k, ['cool', 'tech'], catalog));
    expect(foilDrop(keys[0], ['cool'], catalog)).toEqual(foilDrop(keys[0], ['cool'], catalog));
    const rate = drops.filter(Boolean).length / keys.length;
    expect(rate).toBeGreaterThan(0.13);
    expect(rate).toBeLessThan(0.17);
    expect(new Set(drops.filter(Boolean))).toEqual(new Set(['voicebox']));
    const tech = new Set(keys.map((k) => foilDrop(k, ['tech'], catalog)).filter(Boolean));
    expect(tech).toEqual(new Set(['solvent', 'leech']));
    const none = new Set(keys.map((k) => foilDrop(k, [], catalog)).filter(Boolean));
    expect([...none].every((id) => ['solvent', 'leech', 'skeleton-key', 'voicebox', 'sniffer', 'spike'].includes(id!))).toBe(true);
  });

  it('a foil runs where its step can’t move the pool, for the die; never on a red card or the wrong stat', () => {
    const c = (o: Partial<Check> = {}): Check => ({ stat: 'tech', base: 50, grid: false, crew: [], red: false, mods: [], ...o });
    const solvent = asFoil(catalog.find((p) => p.id === 'solvent')!);
    expect(solvent).toMatchObject({ id: 'foil:solvent', foil: true, kind: 'position' });
    expect(programFits(solvent, { position: 'dark', effect: 'fair' }, c(), deck(2))).toBeNull();
    expect(programFits(asFoil(catalog.find((p) => p.id === 'leech')!), { position: 'open' }, c(), deck(2))).toBeNull();
    expect(programFits(solvent, { position: 'open', effect: 'fair' }, c({ red: true }), deck(2))).toBe('ONE SHOT');
    expect(programFits(solvent, { position: 'open', effect: 'fair' }, c({ stat: 'cool' }), deck(2))).toBe('NOTHING TO DO HERE');
    const who = { stats: stats({ tech: 7 }), deck: deck(2), with: 'x', next: { worse: true as const } };
    const check = c({ base: 60 });
    expect(programJudge(solvent, (ps) => poolOf(check, { ...who, programs: ps }), [], check, deck(2))).toBeNull();
    // At the pool's cap its die is gone: in the dark it does nothing, so it's dropped, not burned.
    const capped = { ...who, stats: stats({ tech: 10 }), push: 'dice' as const, extra: [1, 2, 3, 4].map((n) => ({ delta: 1, label: `x${n}` })) };
    expect(programJudge(solvent, (ps) => poolOf(check, { ...capped, programs: ps }), [], check, deck(2))).toBe('ALREADY IN THE DARK');
  });
});
