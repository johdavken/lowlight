import crypto from 'node:crypto';
import fs from 'node:fs';
import { SRGB_BYTE_TO_LINEAR, linearSrgbToOklab } from '../../shared/color';
import { blank, type Img } from './image';
import type { Rect } from './spec';

/**
 * 1 where a pixel is opaque, bright (OKLab L ≥ minLuma) and colorful (OKLab chroma ≥ minChroma).
 * Inside a `boxes` rect (image px) that box's own `minLuma` applies instead, so a dim screen can glow.
 */
export function findGlow(img: Img, minLuma: number, minChroma: number, boxes: { rect: Rect; minLuma: number }[] = []): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  const luma = new Float32Array(m.length).fill(minLuma);
  for (const { rect: [bx, by, bw, bh], minLuma: l } of boxes) {
    for (let y = Math.max(0, by); y < Math.min(img.h, by + bh); y++) {
      for (let x = Math.max(0, bx); x < Math.min(img.w, bx + bw); x++) luma[y * img.w + x] = l;
    }
  }
  for (let i = 0; i < m.length; i++) {
    const o = i * 4;
    if (img.data[o + 3] < 255) continue;
    const [L, a, b] = linearSrgbToOklab(
      SRGB_BYTE_TO_LINEAR[img.data[o]],
      SRGB_BYTE_TO_LINEAR[img.data[o + 1]],
      SRGB_BYTE_TO_LINEAR[img.data[o + 2]],
    );
    if (L >= luma[i] && Math.hypot(a, b) >= minChroma) m[i] = 1;
  }
  return m;
}

/**
 * Splits glow candidates into per-light maps (candidates inside that light's scene rect, shifted
 * by `layerOffsetX` for layers wider than the 480 frame) and a general always-on map. Maps hold
 * only glow pixels; empty maps are omitted (general → null).
 */
export function splitGlow(
  img: Img,
  glowMask: Uint8Array,
  lights: Record<string, Rect>,
  layerOffsetX: number,
): { general: Img | null; perLight: Record<string, Img> } {
  const owner = new Int32Array(glowMask.length).fill(-1);
  const ids = Object.keys(lights);
  ids.forEach((id, n) => {
    const [rx, ry, rw, rh] = lights[id];
    const x0 = Math.max(0, Math.round(rx + layerOffsetX));
    const x1 = Math.min(img.w, Math.round(rx + rw + layerOffsetX));
    for (let y = Math.max(0, ry); y < Math.min(img.h, ry + rh); y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * img.w + x;
        if (glowMask[i] && owner[i] < 0) owner[i] = n;
      }
    }
  });
  const maps = new Map<number, Img>();
  for (let i = 0; i < glowMask.length; i++) {
    if (!glowMask[i]) continue;
    const key = owner[i];
    if (!maps.has(key)) maps.set(key, blank(img.w, img.h));
    maps.get(key)!.data.set(img.data.subarray(i * 4, i * 4 + 4), i * 4);
  }
  const perLight: Record<string, Img> = {};
  ids.forEach((id, n) => {
    const m = maps.get(n);
    if (m) perLight[id] = m;
  });
  return { general: maps.get(-1) ?? null, perLight };
}

/** The art with glow candidates outlined in red, for reviewing what will glow. */
export function glowPreview(img: Img, glowMask: Uint8Array): Img {
  const out: Img = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) };
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!glowMask[y * img.w + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h || glowMask[yy * img.w + xx]) continue;
        out.data.set([255, 0, 0, 255], (yy * img.w + xx) * 4);
      }
    }
  }
  return out;
}

/**
 * Remembers the hash of each glow map as the pipeline generated it, keyed by `<target>/<file>`
 * (relative, so the lock survives a clone or a moved repo). An installed map whose bytes differ from
 * the generated hash — or that exists without any entry — was made or edited by hand.
 */
export class GlowLock {
  private hashes: Record<string, string>;

  constructor(private readonly file: string) {
    this.hashes = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>) : {};
  }

  isHandEdited(key: string, installedFile: string): boolean {
    if (!fs.existsSync(installedFile)) return false;
    const recorded = this.hashes[key];
    return recorded === undefined || sha256(fs.readFileSync(installedFile)) !== recorded;
  }

  /** True when the installed file is exactly what a build recorded under any of `keys`. */
  isGenerated(keys: string[], installedFile: string): boolean {
    if (!fs.existsSync(installedFile)) return false;
    const hash = sha256(fs.readFileSync(installedFile));
    return keys.some((k) => this.hashes[k] === hash);
  }

  /** Records the bytes the pipeline generated (never a kept hand edit). */
  record(key: string, generated: Buffer): void {
    this.hashes[key] = sha256(generated);
  }

  save(): void {
    fs.writeFileSync(this.file, `${JSON.stringify(this.hashes, null, 2)}\n`);
  }
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
