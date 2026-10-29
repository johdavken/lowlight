import path from 'node:path';
import { isFlat } from '../../shared/frame';
import type { SceneDef } from '../../shared/types';
import { blank, blitOver, readPng, scaleNearest, type Img } from './image';
import type { ArtSpec } from './spec';

export const GUIDE_W = 1536;
export const GUIDE_H = 1024;
const FRAME_H = 270;

export const GUIDE_INSTRUCTION =
  'Repaint this image as a finished scene, keeping the exact composition and the position of every object; keep the canvas 1536×1024 landscape; the top and bottom strips may be loose.';

/** Where the scene sits inside the 1536×1024 guide/master: a centered horizontal band. */
export interface Band {
  /** Scale from scene px (widest layer frame) to band px. */
  s: number;
  top: number;
  h: number;
  /** Width of the widest layer, in scene px. */
  widest: number;
}

/**
 * `shift` moves the band down the master by that many rows (negative: up), so a master whose subject
 * came out low can be re-framed without a new image; the guide itself is always centered.
 */
export function computeBand(scene: SceneDef, shift = 0): Band {
  const { widest, height } = sceneFrame(scene);
  const s = GUIDE_W / widest;
  const h = Math.round(height * s);
  const centered = Math.floor((GUIDE_H - h) / 2);
  const min = -centered, max = GUIDE_H - h - centered;
  if (shift < min || shift > max) {
    throw new Error(`art spec: bandShift ${shift} leaves the ${GUIDE_W}×${GUIDE_H} master; it can be ${min} .. ${max}`);
  }
  return { s, top: centered + shift, h, widest };
}

/** The scene's widest layer and its height: a flat room is its own one image; a 480 room's layers are 270 tall. */
function sceneFrame(scene: SceneDef): { widest: number; height: number } {
  if (scene.resolution && isFlat(scene.resolution)) return { widest: scene.resolution[0], height: scene.resolution[1] };
  return { widest: Math.max(...scene.layers.map((l) => layerWidth(l.parallax))), height: FRAME_H };
}

export function layerWidth(parallax: number): number {
  return parallax > 0 ? 480 + Math.ceil(parallax * 48) : 480;
}

/**
 * All diffuse layers, back to front, each centered in the widest frame over opaque black. Narrower
 * layers are edge-extended sideways to the full width, so the guide has no bare side bars for the
 * image model to copy.
 */
export function compositeScene(sceneDir: string, scene: SceneDef): Img {
  const { widest, height } = sceneFrame(scene);
  const out = blank(widest, height);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
  for (const layer of scene.layers) {
    blitOver(out, extendTo(readPng(path.join(sceneDir, layer.src)), widest), 0, 0);
  }
  return out;
}

/** Centers `img` in a `w`-wide canvas, repeating its outermost columns into the margins. */
function extendTo(img: Img, w: number): Img {
  if (img.w >= w) return img;
  const out = blank(w, img.h);
  const left = Math.floor((w - img.w) / 2);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(img.w - 1, x - left));
      const s = (y * img.w + sx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return out;
}

/** The guide image (scene band + edge-extended strips) and the prompt to paste into ChatGPT. */
export function buildGuide(
  sceneDir: string,
  scene: SceneDef,
  spec: ArtSpec,
  style: string,
): { guide: Img; band: Band; prompt: string } {
  const band = computeBand(scene);
  const scaled = scaleNearest(compositeScene(sceneDir, scene), GUIDE_W, band.h);
  const guide = blank(GUIDE_W, GUIDE_H);
  const rowBytes = GUIDE_W * 4;
  for (let y = 0; y < GUIDE_H; y++) {
    const sy = Math.max(0, Math.min(band.h - 1, y - band.top));
    guide.data.set(scaled.data.subarray(sy * rowBytes, (sy + 1) * rowBytes), y * rowBytes);
  }
  const prompt = `${style.trim()}\n\n${spec.brief.trim()}\n\n${GUIDE_INSTRUCTION}\n`;
  return { guide, band, prompt };
}
