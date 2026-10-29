import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { blank, type Img } from './image';
import { snapLayer } from './pixel';
import type { Band } from './guide';
import type { LayerDef } from '../../shared/types';

const band: Band = { s: 1536 / 528, top: 119, h: 785, widest: 528 };
const palette: string[] = JSON.parse(fs.readFileSync('tools/palette.json', 'utf8'));

function noisy(w: number, h: number): Img {
  const img = blank(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = (i * 37) % 256;
    img.data[i * 4 + 1] = (i * 11) % 256;
    img.data[i * 4 + 2] = (i * 5) % 256;
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

describe('snapLayer', () => {
  for (const [id, parallax, width] of [['back', 0.1, 485], ['room', 0.4, 500], ['fg', 1, 528]] as const) {
    it(`${id} (parallax ${parallax}) snaps to ${width}×270 with palette colors only`, () => {
      const out = snapLayer(noisy(1536, 785), { id, src: `${id}.png`, parallax } as LayerDef, band, palette);
      expect([out.w, out.h]).toEqual([width, 270]);
      const set = new Set(palette.map((h) => h.toLowerCase()));
      // Collected, then asserted once: an expect per pixel takes seconds under load.
      const alphas = new Set<number>();
      const offPalette = new Set<string>();
      for (let i = 0; i < out.data.length; i += 4) {
        if (out.data[i + 3] === 0) continue;
        alphas.add(out.data[i + 3]);
        const hex = '#' + [0, 1, 2].map((k) => out.data[i + k].toString(16).padStart(2, '0')).join('');
        if (!set.has(hex)) offPalette.add(hex);
      }
      expect([...alphas].filter((a) => a !== 255)).toEqual([]);
      expect([...offPalette]).toEqual([]);
    });
  }
});
