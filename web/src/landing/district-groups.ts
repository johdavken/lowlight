/**
 * The select screen grouped by district (spec 2026-10-25): the roster's order, where each tile sits,
 * the label over each group, and which tile ↑/↓ reaches. Pure: the flow and the grid both read it.
 */

/** The RANDOM tile's id: always first, at row 0, column 0. */
export const RANDOM = '?random';

export interface GroupEntry {
  id: string;
  name: string;
  connected: boolean;
  group: string | null;
}

export interface Layout {
  /** Each tile's place, by tile index. */
  pos: { col: number; row: number }[];
  rows: number;
  /** A label over each group's run of tiles on its first row (none for characters without a group). */
  labels: { group: string; col: number; row: number; span: number }[];
}

function byNameThenId(a: GroupEntry, b: GroupEntry): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/** RANDOM, then the groups largest first (ties by district id), then those with no group; connected first, then by name, inside each. */
export function orderTiles(entries: GroupEntry[]): string[] {
  const groups = new Map<string, GroupEntry[]>();
  const loose: GroupEntry[] = [];
  for (const e of entries) {
    if (e.group === null) loose.push(e);
    else groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
  }
  const inside = (list: GroupEntry[]) => [...list.filter((e) => e.connected).sort(byNameThenId), ...list.filter((e) => !e.connected).sort(byNameThenId)];
  const ordered = [...groups.entries()].sort(([ga, a], [gb, b]) => b.length - a.length || ga.localeCompare(gb));
  return [RANDOM, ...ordered.flatMap(([, list]) => inside(list).map((e) => e.id)), ...inside(loose).map((e) => e.id)];
}

/**
 * Places `ids` (orderTiles' order) in rows of `columns`: RANDOM at 0,0; each group runs left to right
 * and starts the next row only when it doesn't fit what's left (a group wider than a row fills whole
 * rows, labelled on its first).
 */
export function layoutTiles(ids: string[], groupOf: (id: string) => string | null, columns: number): Layout {
  const pos: Layout['pos'] = [];
  const labels: Layout['labels'] = [];
  let row = 0;
  let col = 0;
  let i = 0;
  if (ids[0] === RANDOM) {
    pos.push({ col: 0, row: 0 });
    col = 1;
    i = 1;
  }
  while (i < ids.length) {
    const group = groupOf(ids[i]!);
    let n = 0;
    while (i + n < ids.length && groupOf(ids[i + n]!) === group) n++;
    // A group starts a fresh row when it won't fit; characters without one just carry on.
    if (group !== null && n > columns - col && col > 0) {
      row++;
      col = 0;
    }
    if (group !== null) labels.push({ group, col, row, span: Math.min(n, columns - col) });
    for (let k = 0; k < n; k++) {
      if (col >= columns) {
        row++;
        col = 0;
      }
      pos.push({ col, row });
      col++;
    }
    i += n;
  }
  return { pos, rows: pos.length ? Math.max(...pos.map((p) => p.row)) + 1 : 0, labels };
}

/** The tile in the row above or below with the nearest column (ties: the left one); `index` when that row has none. */
export function stepVertical(layout: Layout, index: number, dir: 'up' | 'down'): number {
  const here = layout.pos[index];
  if (!here) return index;
  const target = here.row + (dir === 'up' ? -1 : 1);
  let best = index;
  let bestDist = Infinity;
  layout.pos.forEach((p, j) => {
    if (p.row !== target) return;
    const d = Math.abs(p.col - here.col);
    if (d < bestDist || (d === bestDist && p.col < layout.pos[best]!.col)) {
      best = j;
      bestDist = d;
    }
  });
  return best;
}

/** A group's label: the district's name upper-cased, a leading "The" dropped over a single tile. */
export function labelText(name: string, span: number): string {
  const up = name.toUpperCase();
  return span === 1 ? up.replace(/^THE\s+/, '') : up;
}
