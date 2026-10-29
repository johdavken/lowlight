import crypto from 'node:crypto';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import type { Face } from '../../shared/types';

export const THUMB_W = 208;
export const THUMB_H = 240;
export const CROP_WIDTH = 0.3;
/** The crop box's height:width ratio (120:104, i.e. THUMB_H:THUMB_W). */
const CROP_ASPECT = 120 / 104;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** The sprite-pixel crop box (integers), 104:120, 30% of the sprite's width, centred on the face then kept inside it. */
export function cropBox(w: number, h: number, face: Face): { x: number; y: number; w: number; h: number } {
  let bw = Math.round(w * CROP_WIDTH);
  let bh = Math.round(bw * CROP_ASPECT);
  if (bh > h) {
    bh = h;
    bw = Math.round(h / CROP_ASPECT);
  }
  const x = clamp(Math.round(face.x * w - bw / 2), 0, w - bw);
  const y = clamp(Math.round(face.y * h - bh / 2), 0, h - bh);
  return { x, y, w: bw, h: bh };
}

/** Reads one RGBA source pixel (premultiplied isn't stored; caller weights by alpha itself). */
function pixelAt(src: PNG, x: number, y: number): [number, number, number, number] {
  const i = (y * src.width + x) * 4;
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
}

/** Box-filter downscale: each output pixel averages the source pixels its box covers, weighting colour by alpha. */
function boxFilter(src: PNG, box: { x: number; y: number; w: number; h: number }): Buffer {
  const out = Buffer.alloc(THUMB_W * THUMB_H * 4);
  for (let oy = 0; oy < THUMB_H; oy++) {
    const sy0 = box.y + Math.floor((oy * box.h) / THUMB_H);
    const sy1 = Math.max(sy0 + 1, box.y + Math.floor(((oy + 1) * box.h) / THUMB_H));
    for (let ox = 0; ox < THUMB_W; ox++) {
      const sx0 = box.x + Math.floor((ox * box.w) / THUMB_W);
      const sx1 = Math.max(sx0 + 1, box.x + Math.floor(((ox + 1) * box.w) / THUMB_W));
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aWeight = 0;
      let aSum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const [r, g, b, a] = pixelAt(src, sx, sy);
          const w = a / 255;
          rSum += r * w;
          gSum += g * w;
          bSum += b * w;
          aWeight += w;
          aSum += a;
          count += 1;
        }
      }
      const i = (oy * THUMB_W + ox) * 4;
      if (aWeight > 0) {
        out[i] = Math.round(rSum / aWeight);
        out[i + 1] = Math.round(gSum / aWeight);
        out[i + 2] = Math.round(bSum / aWeight);
      }
      out[i + 3] = count > 0 ? Math.round(aSum / count) : 0;
    }
  }
  return out;
}

/** Nearest-neighbour upscale (or resize) from the crop box to the thumbnail size. */
function nearest(src: PNG, box: { x: number; y: number; w: number; h: number }): Buffer {
  const out = Buffer.alloc(THUMB_W * THUMB_H * 4);
  for (let oy = 0; oy < THUMB_H; oy++) {
    const sy = box.y + Math.min(box.h - 1, Math.floor((oy * box.h) / THUMB_H));
    for (let ox = 0; ox < THUMB_W; ox++) {
      const sx = box.x + Math.min(box.w - 1, Math.floor((ox * box.w) / THUMB_W));
      const [r, g, b, a] = pixelAt(src, sx, sy);
      const i = (oy * THUMB_W + ox) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return out;
}

/** A 208×240 PNG head-crop of `src`, centred on `face`: box-filtered down, nearest-neighbour up. */
export function renderThumb(src: PNG, face: Face): Buffer {
  const box = cropBox(src.width, src.height, face);
  const data = box.w < THUMB_W || box.h < THUMB_H ? nearest(src, box) : boxFilter(src, box);
  const out = new PNG({ width: THUMB_W, height: THUMB_H });
  data.copy(out.data);
  return PNG.sync.write(out);
}

interface CacheEntry {
  key: string;
  etag: string;
  png: Buffer;
}

/**
 * In-memory thumbnail cache, keyed by sprite file + face point (so two records sharing a sprite
 * with different faces don't evict each other); bounded by replacing the entry for the same
 * `file|face` when the file's mtime changes.
 */
export function createThumbs(warn: (msg: string) => void): { get(file: string, face: Face): { etag: string; png: Buffer } | null } {
  const cache = new Map<string, CacheEntry>();
  const warned = new Set<string>();

  return {
    get(file: string, face: Face): { etag: string; png: Buffer } | null {
      let mtimeMs: number;
      try {
        mtimeMs = fs.statSync(file).mtimeMs;
      } catch {
        if (!warned.has(file)) {
          warned.add(file);
          warn(`thumbnail '${file}': could not stat it`);
        }
        return null;
      }
      const cacheKey = `${file}|${face.x},${face.y}`;
      const key = `${cacheKey}|${mtimeMs}`;
      const existing = cache.get(cacheKey);
      if (existing && existing.key === key) return { etag: existing.etag, png: existing.png };

      let src: PNG;
      try {
        src = PNG.sync.read(fs.readFileSync(file));
      } catch {
        if (!warned.has(file)) {
          warned.add(file);
          warn(`thumbnail '${file}': could not decode it`);
        }
        return null;
      }
      warned.delete(file);
      const png = renderThumb(src, face);
      const etag = `"${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}"`;
      cache.set(cacheKey, { key, etag, png });
      return { etag, png };
    },
  };
}
