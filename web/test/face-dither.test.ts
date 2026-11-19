import { describe, expect, it } from 'vitest';
import { DISSOLVE_STEPS, ditherKeep, ditherMask } from '../src/ui/face-dither';

/** The cells a mask shows, read from its SVG's rects. */
function maskCells(url: string): Set<string> {
  const svg = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
  return new Set([...svg.matchAll(/<rect x='(\d)' y='(\d)'/g)].map((m) => `${m[1]},${m[2]}`));
}

describe('ditherKeep', () => {
  it('matches ditherMask cell for cell, at every step, both ways, tiled', () => {
    for (let step = 1; step <= DISSOLVE_STEPS; step++)
      for (const incoming of [true, false]) {
        const cells = maskCells(ditherMask(step, incoming));
        for (let cy = 0; cy < 8; cy++)
          for (let cx = 0; cx < 8; cx++) expect(ditherKeep(step, cx, cy, incoming), `${step} ${incoming} ${cx},${cy}`).toBe(cells.has(`${cx % 4},${cy % 4}`));
      }
  });
});
