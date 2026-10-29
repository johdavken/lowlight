// The blackout mask's floor (spec 2026-10-27, from the mask pass's review): water and the gaps between districts are
// nobody's ground, but a district's lamp pools and glints fall on them. Within a lamp's reach they take the nearest
// district's index, so they go dark with it; open water further out stays 0. Only the mask pass sees this floor.

import { inside, ownerAt, toBorder } from '../../shared/district-lookup';

type P = [number, number];

/** Rows of cells [row, firstCol, lastCol, index] at `step` map px over the map: each cell's district index (inside a
 * border: that one, first in order; else the nearest within `reach`). Cells left out are 0. */
export function maskFloor(districts: { id: string; border: P[] }[], w: number, h: number, reach: number, step: number): { step: number; runs: [number, number, number, number][] } {
  const runs: [number, number, number, number][] = [];
  const cols = Math.ceil(w / step), rows = Math.ceil(h / step);
  for (let r = 0; r < rows; r++) {
    let run: [number, number, number, number] | null = null;
    for (let c = 0; c < cols; c++) {
      const id = ownerAt([(c + 0.5) * step, (r + 0.5) * step], districts, reach);
      if (run && run[3] === id && id) run[2] = c;
      else {
        if (run) runs.push(run);
        run = id ? [r, c, c, id] : null;
      }
    }
    if (run) runs.push(run);
  }
  return { step, runs };
}
