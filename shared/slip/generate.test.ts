import { describe, expect, test } from 'vitest';
import type { Tier } from '../gig/rules';
import { generateSlip, SLIP_TIERS, SLIP_TRIES } from './generate';
import { illegal, SLIP_MAX, startSlip, step, type SlipBoard } from './rules';
import { bfsClean, naiveSeen } from './solve';

/** SLIP_SEEDS=500 runs the spec's full sweep; the default keeps the suite quick. */
const N = Number(process.env.SLIP_SEEDS ?? 40);
const seeds = Array.from({ length: N }, (_, i) => i + 1);

function replayClean(b: SlipBoard): boolean {
  let s = startSlip(b);
  for (const a of b.solution) {
    if (illegal(b, s, a)) return false;
    s = step(b, s, a).state;
  }
  return s.over === 'out' && s.heat === 0;
}

test('the tier table and the try limit', () => {
  expect(SLIP_TRIES).toBe(400);
  expect(SLIP_TIERS.easy).toEqual({ W: 5, H: 4, nodes: 10, extra: 3, guards: ['postpace'], cams: ['fixed'], hide: 1, exitIsEntry: true });
  expect(SLIP_TIERS.medium).toEqual({ W: 6, H: 5, nodes: 15, extra: 6, guards: ['loopany', 'postpace'], cams: ['sweep'], hide: 2, exitIsEntry: false });
  expect(SLIP_TIERS.hard).toEqual({ W: 7, H: 6, nodes: 20, extra: 8, guards: ['loop', 'pace', 'post'], cams: ['fixed', 'sweep'], hide: 2, exitIsEntry: false });
});

test('deterministic: the same tier and seed give the same board and solution', () => {
  expect(generateSlip('medium', 11)).toEqual(generateSlip('medium', 11));
});

test('mockup parity: the same boards as the playable mockup', () => {
  const hard = generateSlip('hard', 7)!;
  expect([hard.nodes.length, hard.solution.length, hard.tries, hard.entry, hard.target, hard.exit]).toEqual([20, 19, 3, 17, 2, 14]);
  const easy = generateSlip('easy', 3)!;
  expect([easy.solution.length, easy.tries, easy.entry, easy.target, easy.exit]).toEqual([10, 5, 5, 9, 5]);
  const medium = generateSlip('medium', 11)!;
  expect([medium.solution.length, medium.tries, medium.entry, medium.target, medium.exit]).toEqual([14, 1, 10, 5, 14]);
});

describe.each<Tier>(['easy', 'medium', 'hard'])('%s boards', (tier) => {
  const started = Date.now();
  const boards = seeds.map((seed) => generateSlip(tier, seed));
  const ms = (Date.now() - started) / N;

  test(`every seed 1..${N} is generated, replays clean, and gets the naive route seen`, () => {
    const tries = boards.map((b) => b?.tries ?? Infinity);
    console.log(`slip ${tier}: ${N} seeds, ${ms.toFixed(1)} ms a board, tries avg ${(tries.reduce((a, b) => a + b, 0) / N).toFixed(1)} max ${Math.max(...tries)}`);
    for (const b of boards) {
      expect(b).not.toBeNull();
      expect(replayClean(b!)).toBe(true);
      expect(naiveSeen(b!)).toBe(true);
    }
  });

  test('tier shape: nodes, guards, cameras, HIDE, EXIT; nothing watches within 2 of ENTRY', () => {
    const T = SLIP_TIERS[tier];
    for (const b of boards as SlipBoard[]) {
      expect(b.max).toBe(SLIP_MAX[tier]);
      expect(b.nodes).toHaveLength(T.nodes);
      expect(b.guards).toHaveLength(T.guards.length);
      expect(b.cams.map((c) => c.kind)).toEqual(T.cams);
      expect(b.nodes.filter((n) => n.type === 'HIDE')).toHaveLength(T.hide);
      expect(b.exit === b.entry).toBe(T.exitIsEntry);
      const near = (id: number) => b.dist[b.entry][id] <= 2;
      for (const g of b.guards) for (const [n] of g.poses) expect(near(n)).toBe(false);
      for (const c of b.cams) {
        expect(near(c.node)).toBe(false);
        for (const d of c.dirs) expect(near(b.nodes[c.node].adj[d])).toBe(false);
      }
    }
  });

  if (tier === 'hard')
    test('hard: no clean route without tools or HIDE', () => {
      for (const b of boards as SlipBoard[]) expect(bfsClean(b, { noTools: true, noHide: true })).toMatchObject({ actions: null, capped: false });
    });
});
