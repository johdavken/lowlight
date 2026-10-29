import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Hex, LayerDef } from '../../shared/types';
import { buildRoom, findClusters, type BuildSpec } from './core';
import { computeBand } from './guide';
import { blank, type Img } from './image';
import { fakeDepth, fixtureMaster } from './test-fixture';
import { crop } from './image';
import { scaleTo } from './master';

/** A w×h image with opaque blobs: [x, y, w, h, rgb]. Mask = the blob pixels. */
function blobs(w: number, h: number, list: [number, number, number, number, [number, number, number]][]): { img: Img; mask: Uint8Array } {
  const img = blank(w, h);
  const mask = new Uint8Array(w * h);
  for (const [bx, by, bw, bh, rgb] of list) {
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      img.data.set([...rgb, 255], (y * w + x) * 4);
      mask[y * w + x] = 1;
    }
  }
  return { img, mask };
}

describe('findClusters', () => {
  it('finds each island with its box, size, mean color and brightest point', () => {
    const { img, mask } = blobs(40, 20, [[2, 3, 6, 6, [200, 40, 120]], [20, 10, 6, 6, [40, 200, 220]]]);
    img.data.set([255, 255, 255, 255], (5 * 40 + 4) * 4); // the brightest pixel of blob 1
    const cl = findClusters(img, mask, 4, 0, 'room');
    expect(cl).toHaveLength(2);
    const [a, b] = [...cl].sort((p, q) => p.box[0] - q.box[0]);
    expect(a).toMatchObject({ layer: 'room', box: [2, 3, 6, 6], px: 36, peak: [4, 5] });
    expect(b).toMatchObject({ box: [20, 10, 6, 6], px: 36, color: '#28c8dc', peak: [20, 10] });
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('drops islands smaller than minPx; an empty mask gives none', () => {
    const { img, mask } = blobs(40, 20, [[2, 3, 3, 1, [255, 0, 0]]]);
    expect(findClusters(img, mask, 4, 0, 'room')).toEqual([]);
    expect(findClusters(blank(40, 20), new Uint8Array(800), 4, 0, 'room')).toEqual([]);
  });

  it('reports boxes in frame coords (layer px minus the layer offset), clipped to the frame', () => {
    const { img, mask } = blobs(528, 270, [[100, 50, 6, 6, [255, 120, 0]], [2, 50, 10, 6, [255, 120, 0]]]);
    const cl = findClusters(img, mask, 4, 24, 'fg');
    const near = cl.find((c) => c.box[0] === 76)!;
    expect(near.box).toEqual([76, 50, 6, 6]);
    expect(near.peak).toEqual([76, 50]);
    expect(cl.every((c) => c.box[0] >= 0 && c.box[0] + c.box[2] <= 480)).toBe(true);
  });
});

describe('buildRoom', () => {
  it('builds a room from a draft-like stack with no placeholder scene, and finds the lamp', async () => {
    const layers: LayerDef[] = [
      { id: 'back', src: 'back.png', parallax: 0.1 },
      { id: 'room', src: 'room.png', parallax: 0.4 },
      { id: 'fg', src: 'fg.png', parallax: 1 },
    ];
    const bandInfo = computeBand({ layers } as never);
    const band = crop(scaleTo(fixtureMaster(), 1536, 1024), 0, bandInfo.top, 1536, bandInfo.h);
    const depth = await fakeDepth()(band);
    const spec: BuildSpec = { depth: { backFartherThan: 0.7, fgNearerThan: 0.3, force: [] }, minSpeckPx: 4, glow: { minLuma: 0.62, minChroma: 0.08, lights: {} } };
    const palette = JSON.parse(fs.readFileSync(path.join('tools', 'palette.json'), 'utf8')) as Hex[];
    const out = buildRoom({ band, bandInfo, layers, spec, depth, palette });
    expect(out.layers.map((l) => [l.img.w, l.img.h])).toEqual([[485, 270], [500, 270], [528, 270]]);
    const lamp = out.clusters.find((c) => Math.abs(c.peak[0] - 93) <= 6 && Math.abs(c.peak[1] - 146) <= 6);
    expect(lamp).toBeDefined();
  });
});
