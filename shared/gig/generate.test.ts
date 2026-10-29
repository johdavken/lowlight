import { describe, expect, test } from 'vitest';
import { generate, TIERS } from './generate';
import { act, neighbours, startRun, TIER_MAX, type Board, type Tier } from './rules';
import { parOf, solve } from './solve';

const seeds = Array.from({ length: 500 }, (_, i) => ((i + 1) * 2654435761) >>> 0);

function reachableFromEntry(b: Board): Set<number> {
  const seen = new Set([b.entry]);
  const stack = [b.entry];
  while (stack.length) for (const m of neighbours(b, stack.pop()!)) if (!seen.has(m)) (seen.add(m), stack.push(m));
  return seen;
}

describe.each<Tier>(['easy', 'medium', 'hard'])('%s boards, 500 seeds', (tier) => {
  const max = TIER_MAX[tier];
  const cols = TIERS[tier].cols;
  const boards = seeds.map((seed) => generate(tier, seed));

  test('deterministic for their seed', () => {
    expect(generate(tier, seeds[7])).toEqual(boards[7]);
  });
  test('fair but not free: two routes, best within 35–65% of the maximum, par from best', () => {
    for (const b of boards) {
      expect(b.max).toBe(max);
      expect(b.routes).toBeGreaterThanOrEqual(2);
      expect(b.best).toBeGreaterThanOrEqual(Math.ceil(max * 0.35));
      expect(b.best).toBeLessThanOrEqual(Math.floor(max * 0.65));
      expect(b.par).toBe(parOf(max, b.best));
    }
  });
  test("the tier's size and its special nodes, all reachable", () => {
    const lo = cols.reduce((s, [a]) => s + a, 2);
    const hi = cols.reduce((s, [, z]) => s + z, 2);
    const specials = [...TIERS[tier].specials].sort();
    for (const b of boards) {
      expect(b.nodes.length).toBeGreaterThanOrEqual(lo);
      expect(b.nodes.length).toBeLessThanOrEqual(hi);
      expect(b.nodes.map((n) => n.type).filter((t) => !['ENTRY', 'TARGET', 'RELAY'].includes(t)).sort()).toEqual(specials);
      expect(reachableFromEntry(b).size).toBe(b.nodes.length);
      for (const n of b.nodes) expect(n.row).toBeGreaterThanOrEqual(0), expect(n.row).toBeLessThanOrEqual(1);
    }
  });
  test("the solver's route, played by the rules, wins at exactly its score", () => {
    for (const b of boards) {
      const path = solve(b).path!;
      let s = startRun(b);
      for (const id of path.slice(1)) {
        const r = act(s, { kind: 'enter', node: id });
        if (!r.ok) throw new Error(r.why);
        s = r.state;
      }
      const r = act(s, { kind: 'pull' });
      if (!r.ok) throw new Error(r.why);
      expect(r.state.outcome).not.toBe('traced');
      expect(r.state.trace).toBe(b.best);
    }
  });
});
