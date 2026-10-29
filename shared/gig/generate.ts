/**
 * The seeded board generator (spec §3.5): columns from ENTRY to TARGET, links to the nearest nodes
 * in the next column, the tier's special nodes scattered over the middle, then the solver decides.
 * Deterministic for a seed: every random draw comes from `rng(seed)`.
 */
import { TIER_MAX, type Board, type GigNode, type NodeType, type Tier } from './rules';
import { parOf, solve } from './solve';

export const TIERS: Record<Tier, { cols: [number, number][]; specials: NodeType[] }> = {
  easy: { cols: [[2, 2], [2, 2], [1, 1]], specials: ['TRAP', 'ICE2'] },
  medium: { cols: [[2, 3], [2, 3], [2, 2], [1, 2]], specials: ['TRAP', 'TRAP', 'ICE2', 'ICE3', 'CACHE', 'SENTRY'] },
  hard: {
    cols: [[2, 3], [3, 3], [3, 3], [2, 3], [1, 2]],
    specials: ['TRAP', 'TRAP', 'TRAP', 'ICE2', 'ICE3', 'ICE3', 'CACHE', 'SENTRY', 'SENTRY', 'KEY'],
  },
};

const TRIES = 400;
const JITTER = 0.035;

/** mulberry32. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GigBoardError extends Error {}

function tryBoard(tier: Tier, seed: number, r: () => number): Omit<Board, 'best' | 'par' | 'routes'> | null {
  const between = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const sizes = [1, ...TIERS[tier].cols.map(([lo, hi]) => between(lo, hi)), 1];
  const nodes: GigNode[] = [];
  const cols: GigNode[][] = sizes.map((n, col) =>
    Array.from({ length: n }, (_, j) => {
      const jitter = n > 1 ? (r() - 0.5) * 2 * JITTER : 0;
      const node: GigNode = { id: nodes.length, type: col === 0 ? 'ENTRY' : col === sizes.length - 1 ? 'TARGET' : 'RELAY', col, row: (j + 1) / (n + 1) + jitter };
      nodes.push(node);
      return node;
    }),
  );
  const links = new Map<string, [number, number]>();
  const link = (a: GigNode, b: GigNode) => links.set(a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`, a.id < b.id ? [a.id, b.id] : [b.id, a.id]);
  const nearest = (to: GigNode, among: GigNode[]) => [...among].sort((p, q) => Math.abs(p.row - to.row) - Math.abs(q.row - to.row));
  for (let c = 0; c < cols.length - 1; c++) {
    const here = cols[c];
    const next = cols[c + 1];
    const reached = new Set<GigNode>();
    for (const a of here) {
      const near = nearest(a, next);
      link(a, near[0]);
      reached.add(near[0]);
      if (near[1] && (here.length === 1 || r() < 0.45)) (link(a, near[1]), reached.add(near[1]));
    }
    for (const b of next) if (!reached.has(b)) link(nearest(b, here)[0], b);
    if (c > 0) for (let j = 0; j < here.length - 1; j++) if (r() < 0.3) link(here[j], here[j + 1]);
  }
  const middle = nodes.filter((n) => n.type === 'RELAY');
  const specials = TIERS[tier].specials;
  if (middle.length < specials.length + 1) return null;
  for (let i = middle.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }
  specials.forEach((t, i) => (middle[i].type = t));
  return { tier, seed, max: TIER_MAX[tier], nodes, links: [...links.values()], entry: 0, target: nodes.length - 1 };
}

/** A fair board for the seed: two routes or more, the best costing 35–65% of the maximum. */
export function generate(tier: Tier, seed: number): Board {
  const r = rng(seed);
  const max = TIER_MAX[tier];
  for (let i = 0; i < TRIES; i++) {
    const b = tryBoard(tier, seed, r);
    if (!b) continue;
    const s = solve(b);
    if (s.routes >= 2 && s.best >= Math.ceil(max * 0.35) && s.best <= Math.floor(max * 0.65)) {
      return { ...b, best: s.best, par: parOf(max, s.best), routes: s.routes };
    }
  }
  throw new GigBoardError(`no fair ${tier} board for seed ${seed}`);
}
