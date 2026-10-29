/**
 * The art build core: master band + depth + a layer stack + build settings → layers, glow maps and
 * glow clusters. No file IO, so the CLI (`pipeline.ts`) and Scene Studio share it exactly.
 */
import { toHex } from '../../shared/color';
import type { Hex, LayerDef } from '../../shared/types';
import { fillReveal, revealPx } from './fill';
import { findGlow, glowPreview, splitGlow } from './glow';
import { layerWidth, type Band } from './guide';
import { blank, type Img } from './image';
import { snapLayer } from './pixel';
import { labelLayers, maskOf, removeSpecks } from './split';

const FRAME_W = 480;
const FRAME_H = 270;

/** `[x, y, w, h]` in frame (scene) px. */
export type Rect = [number, number, number, number];

/** The judgment part of an art spec: depth cuts, force boxes, speck size, glow detection, light boxes. */
export interface BuildSpec {
  depth: {
    backFartherThan: number;
    fgNearerThan: number;
    /** Four-layer (exterior) scenes only: farther than this is sky. */
    skyFartherThan?: number;
    force: { layer: string; rect: Rect; minDepth?: number; maxDepth?: number }[];
  };
  minSpeckPx: number;
  /** Flat rooms only: the first master row of the 864-row crop (0 .. 160). */
  cropTop?: number;
  glow: {
    minLuma: number;
    minChroma: number;
    lights: Record<string, Rect>;
    /** Flat rooms only: a light's own minLuma inside its glow box (a dim screen). */
    lightMinLuma?: Record<string, number>;
  };
  weatherRegion?: Rect;
}

/** An island of glow pixels, in frame coords: a candidate light. */
export interface GlowCluster {
  layer: string;
  box: Rect;
  px: number;
  color: Hex;
  peak: [number, number];
}

export interface BuiltLayer {
  def: LayerDef;
  /** The finished layer (filled, palette-snapped). */
  img: Img;
  /** The layer with glow candidates outlined, for review. */
  glowPreview: Img;
  /** Always-on glow (null when there is none). */
  general: Img | null;
  /** Glow following each light, by light id (only lights with candidates). */
  perLight: Record<string, Img>;
}

/** Where the renderer places a layer at camera 0, as the x offset of the frame inside the layer. */
export function layerOffsetX(parallax: number): number {
  return -Math.round(-(layerWidth(parallax) - FRAME_W) / 2);
}

/**
 * 8-connected islands of `mask` (at least `minPx` pixels) with box, size, mean color and brightest
 * pixel, converted from layer px to frame px (minus `offsetX`) and clipped to the frame.
 */
export function findClusters(
  img: Img,
  mask: Uint8Array,
  minPx: number,
  offsetX: number,
  layer: string,
  frame: readonly [number, number] = [FRAME_W, FRAME_H],
): GlowCluster[] {
  const { w, h } = img;
  const seen = new Uint8Array(mask.length);
  const out: GlowCluster[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let px = 0, r = 0, g = 0, b = 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    let peak = start, peakLuma = -1;
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w, y = (p - x) / w;
      const o = p * 4;
      px++;
      r += img.data[o];
      g += img.data[o + 1];
      b += img.data[o + 2];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      const luma = 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2];
      if (luma > peakLuma || (luma === peakLuma && p < peak)) { peakLuma = luma; peak = p; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) {
          const n = ny * w + nx;
          if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
    }
    if (px < minPx) continue;
    const fx0 = Math.max(0, x0 - offsetX), fx1 = Math.min(frame[0], x1 + 1 - offsetX);
    const fy0 = Math.max(0, y0), fy1 = Math.min(frame[1], y1 + 1);
    if (fx1 <= fx0 || fy1 <= fy0) continue;
    const peakX = peak % w;
    const peakY = (peak - peakX) / w;
    out.push({
      layer,
      box: [fx0, fy0, fx1 - fx0, fy1 - fy0],
      px,
      color: toHex([r / px / 255, g / px / 255, b / px / 255]),
      peak: [Math.min(frame[0] - 1, Math.max(0, peakX - offsetX)), peakY],
    });
  }
  return out;
}

/** split → fill → pixel → glow. `band` is the master's scene band; `depth` matches it pixel for pixel. */
export function buildRoom(input: {
  band: Img;
  bandInfo: Band;
  layers: LayerDef[];
  spec: BuildSpec;
  depth: Float32Array;
  palette: Hex[];
}): { layers: BuiltLayer[]; clusters: GlowCluster[] } {
  const { band: img, bandInfo, layers, spec, depth, palette } = input;

  // split
  const labels = labelLayers(depth, img.w, img.h, spec, bandInfo, layers.map((l) => l.id));
  removeSpecks(labels, img.w, img.h, Math.round(spec.minSpeckPx * bandInfo.s * bandInfo.s));

  // fill + pixel
  const built: BuiltLayer[] = [];
  const clusters: GlowCluster[] = [];
  layers.forEach((layer, i) => {
    const own = maskOf(labels, i);
    const raw = blank(img.w, img.h);
    for (let k = 0; k < own.length; k++) if (own[k]) raw.data.set(img.data.subarray(k * 4, k * 4 + 4), k * 4);
    let filled = raw;
    if (i < layers.length - 1) {
      const nearer = new Uint8Array(labels.length);
      for (let k = 0; k < labels.length; k++) nearer[k] = labels[k] > i ? 1 : 0;
      const pFront = Math.max(...layers.slice(i + 1).map((l) => l.parallax));
      const { rx, ry } = revealPx(pFront, layer.parallax, bandInfo.s);
      filled = fillReveal(raw, nearer, rx, ry, i === 0);
    }
    // Glow is detected on the layer's own painted pixels only, never on filled-in ones.
    const ownSnapped = snapLayer(raw, layer, bandInfo, palette);
    const out = snapLayer(filled, layer, bandInfo, palette);

    // glow
    const mask = findGlow(ownSnapped, spec.glow.minLuma, spec.glow.minChroma);
    // Same offset the renderer uses to place the layer (placeLayer: round(-margin / 2) at camera 0).
    const offsetX = layerOffsetX(layer.parallax);
    const { general, perLight } = splitGlow(ownSnapped, mask, spec.glow.lights, offsetX);
    clusters.push(...findClusters(ownSnapped, mask, spec.minSpeckPx, offsetX, layer.id));
    built.push({ def: layer, img: out, glowPreview: glowPreview(out, mask), general, perLight });
  });
  return { layers: built, clusters };
}
