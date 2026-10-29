import type { Band } from './guide';
import type { BuildSpec } from './core';

const FRAME_W = 480;

/**
 * Assigns every band pixel to a layer (index into `layerIds`, ordered back → front) by depth
 * (0 near … 1 far; four-layer scenes add `skyFartherThan` for the sky), then applies the art spec's forced rectangles (later rules win).
 */
export function labelLayers(depth: Float32Array, w: number, h: number, spec: Pick<BuildSpec, 'depth'>, band: Band, layerIds: string[]): Uint8Array {
  if (layerIds.length > 4) throw new Error('art: scenes with more than 4 layers are not supported yet');
  const { backFartherThan, fgNearerThan, skyFartherThan } = spec.depth;
  const four = layerIds.length === 4;
  if (four && skyFartherThan === undefined) throw new Error('art spec: depth.skyFartherThan is required for 4-layer scenes');
  const front = layerIds.length - 1;
  // Four layers: sky / far / mid / fg. Three: back / middle / front. Two: back / front.
  const far = four ? 1 : 0;
  const middle = four ? 2 : layerIds.length >= 3 ? 1 : front;
  const labels = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) {
    const d = depth[i];
    labels[i] = four && d > skyFartherThan! ? 0 : d > backFartherThan ? far : d < fgNearerThan ? front : middle;
  }

  const frameOffset = (band.widest - FRAME_W) / 2;
  for (const [n, f] of spec.depth.force.entries()) {
    const idx = layerIds.indexOf(f.layer);
    if (idx < 0) throw new Error(`art spec: depth.force.${n}.layer: unknown layer '${f.layer}'; available: ${layerIds.join(', ')}`);
    const [rx, ry, rw, rh] = f.rect;
    const x0 = Math.max(0, Math.round((rx + frameOffset) * band.s));
    const x1 = Math.min(w, Math.round((rx + rw + frameOffset) * band.s));
    const y0 = Math.max(0, Math.round(ry * band.s));
    const y1 = Math.min(h, Math.round((ry + rh) * band.s));
    for (let y = y0; y < y1; y++) {
      if (f.minDepth === undefined && f.maxDepth === undefined) {
        labels.fill(idx, y * w + x0, y * w + x1);
        continue;
      }
      // With minDepth, only pixels at least that far are claimed (e.g. the city behind window glass,
      // not the couch standing in front of it); with maxDepth, only pixels at most that far (a lamp
      // pole, not the wall behind it).
      const min = f.minDepth ?? 0, max = f.maxDepth ?? 1;
      for (let i = y * w + x0; i < y * w + x1; i++) if (depth[i] >= min && depth[i] <= max) labels[i] = idx;
    }
  }
  return labels;
}

/** Relabels 4-connected islands smaller than `minPx` to the majority label on their boundary. */
export function removeSpecks(labels: Uint8Array, w: number, h: number, minPx: number): void {
  if (minPx <= 1) return;
  const seen = new Uint8Array(labels.length);
  const stack: number[] = [];
  const island: number[] = [];
  for (let start = 0; start < labels.length; start++) {
    if (seen[start]) continue;
    const label = labels[start];
    island.length = 0;
    const border = new Map<number, number>();
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const p = stack.pop()!;
      island.push(p);
      const x = p % w;
      const y = (p - x) / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0) continue;
        if (labels[q] === label) {
          if (!seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        } else {
          border.set(labels[q], (border.get(labels[q]) ?? 0) + 1);
        }
      }
    }
    if (island.length >= minPx || border.size === 0) continue;
    let best = label;
    let bestCount = -1;
    for (const [l, c] of border) if (c > bestCount) [best, bestCount] = [l, c];
    for (const p of island) labels[p] = best;
  }
}

export function maskOf(labels: Uint8Array, idx: number): Uint8Array {
  const m = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) m[i] = labels[i] === idx ? 1 : 0;
  return m;
}
