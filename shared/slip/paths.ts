/**
 * Slip's shortest paths (spec §2.6): every guard that walks somewhere (a noise, last seen, back to
 * its route) takes the first neighbour, in the order +u, +v, −u, −v, that is one step closer.
 */
import type { Dir, SlipBoard, SlipNode } from './rules';

/** Link distances between every pair of nodes (Infinity when unlinked). */
export function allDistances(nodes: SlipNode[]): number[][] {
  return nodes.map((from) => {
    const d = new Array<number>(nodes.length).fill(Infinity);
    d[from.id] = 0;
    const queue = [from.id];
    for (let i = 0; i < queue.length; i++)
      for (const m of nodes[queue[i]].adj)
        if (m >= 0 && d[m] === Infinity) {
          d[m] = d[queue[i]] + 1;
          queue.push(m);
        }
    return d;
  });
}

/** One step from `from` towards `to`, and the direction taken; [from, -1] when already there or unreachable. */
export function stepToward(board: Pick<SlipBoard, 'nodes' | 'dist'>, from: number, to: number): [number, Dir | -1] {
  const here = board.dist[from][to];
  for (let d = 0; d < 4; d++) {
    const nb = board.nodes[from].adj[d];
    if (nb >= 0 && board.dist[nb][to] === here - 1) return [nb, d as Dir];
  }
  return [from, -1];
}
