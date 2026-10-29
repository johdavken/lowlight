/**
 * The full-knowledge solver (spec §3.5): every simple path from ENTRY to TARGET, played exactly by
 * the rules (watch penalties, traps, caches, the key), plus the PULL. Path-based, so it can miss a
 * cheaper branching route (a side trip for the key): conservative, so an accepted board is winnable.
 */
import { takeCost, watchers, type Board } from './rules';

export type Unsolved = Omit<Board, 'best' | 'par' | 'routes'>;

export function solve(unsolved: Unsolved): { best: number; path: number[] | null; routes: number } {
  const b = unsolved as Board;
  const adj = b.nodes.map(() => [] as number[]);
  for (const [x, y] of b.links) adj[x].push(y), adj[y].push(x);
  let best = Infinity;
  let bestPath: number[] | null = null;
  let routes = 0;
  const onPath = new Set([b.entry]);
  const path = [b.entry];

  const score = (): number => {
    const held = new Set([b.entry]);
    let trace = 0;
    let key = false;
    for (const id of path.slice(1)) {
      trace += takeCost(b, id, key) + watchers(b, held);
      const t = b.nodes[id].type;
      if (t === 'TRAP') trace += 3;
      if (t === 'CACHE') trace = Math.max(0, trace - 2);
      if (t === 'KEY') key = true;
      held.add(id);
      if (trace > b.max) return Infinity;
    }
    trace += 1 + watchers(b, held);
    return trace > b.max ? Infinity : trace;
  };

  const walk = (id: number): void => {
    if (id === b.target) {
      routes++;
      const s = score();
      if (s < best) (best = s), (bestPath = [...path]);
      return;
    }
    for (const m of adj[id]) {
      if (onPath.has(m)) continue;
      onPath.add(m);
      path.push(m);
      walk(m);
      path.pop();
      onPath.delete(m);
    }
  };
  walk(b.entry);
  return { best, path: bestPath, routes };
}

/** CLEAN's line: two over the best route (room to scout a little), never past the maximum. */
export function parOf(max: number, best: number): number {
  return Math.min(max, best + 2);
}
