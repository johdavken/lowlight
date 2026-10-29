/** Test helpers for Slip: hand-drawn boards. Not a test file (vitest only runs *.test.ts). */
import { allDistances } from './paths';
import { DU, DV, type Dir, type SlipBoard, type SlipNode, type SlipNodeType } from './rules';

const TYPE: Record<string, SlipNodeType> = { E: 'ENTRY', T: 'TARGET', X: 'EXIT', H: 'HIDE', '.': 'plain' };

/** A board from rows of cells: E entry, T target, X exit, H hide, . floor, space nothing. Neighbours are linked; u is the column, v the row. */
export function grid(rows: string[], extra: Partial<SlipBoard> = {}): SlipBoard {
  const nodes: SlipNode[] = [];
  const cell = new Map<string, number>();
  rows.forEach((row, v) =>
    [...row].forEach((ch, u) => {
      if (ch === ' ') return;
      cell.set(`${u},${v}`, nodes.length);
      nodes.push({ id: nodes.length, u, v, type: TYPE[ch], adj: [-1, -1, -1, -1] });
    }),
  );
  for (const n of nodes)
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const m = cell.get(`${n.u + DU[d]},${n.v + DV[d]}`);
      if (m !== undefined) n.adj[d] = m;
    }
  const find = (t: SlipNodeType) => nodes.find((n) => n.type === t)?.id ?? -1;
  const entry = find('ENTRY');
  return {
    tier: 'medium',
    seed: 1,
    W: Math.max(...rows.map((r) => r.length)),
    H: rows.length,
    max: 8,
    nodes,
    dist: allDistances(nodes),
    entry,
    target: find('TARGET'),
    exit: find('EXIT') >= 0 ? find('EXIT') : entry,
    guards: [],
    cams: [],
    par: 0,
    tries: 1,
    solution: [],
    ...extra,
  };
}

/** The node at (u, v). */
export const at = (b: SlipBoard, u: number, v = 0): number => b.nodes.find((n) => n.u === u && n.v === v)!.id;
