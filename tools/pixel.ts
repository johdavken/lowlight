import { PNG } from 'pngjs';

/** A colour as 0..255 channels: [r, g, b, a]. */
export type RGBA = readonly [number, number, number, number];

export const CLEAR: RGBA = [0, 0, 0, 0];

/** Parse `#rrggbb` into an RGBA tuple with the given alpha. */
export function rgba(hex: string, a = 255): RGBA {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, a];
}

/** Linear blend of two colours (t = 0 gives `a`, t = 1 gives `b`), rounded to whole channels. */
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  const l = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return [l(0), l(1), l(2), l(3)];
}

/** Same colour with a different alpha. */
export function withAlpha(c: RGBA, a: number): RGBA {
  return [c[0], c[1], c[2], a];
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered-dither threshold for pixel (x, y), in (0, 1). */
export function bayer4(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/** Seeded PRNG (mulberry32). Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A transparent RGBA pixel buffer with integer-coordinate drawing; writes outside the canvas are clipped. */
export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  /** Overwrite one pixel. */
  set(x: number, y: number, c: RGBA): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set(c, (y * this.width + x) * 4);
  }

  /** Read one pixel (CLEAR outside the canvas). */
  get(x: number, y: number): RGBA {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return CLEAR;
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  /** Composite one pixel source-over the existing one. */
  blend(x: number, y: number, c: RGBA): void {
    const sa = c[3] / 255;
    if (sa >= 1) return this.set(x, y, c);
    if (sa <= 0) return;
    const d = this.get(x, y);
    const da = d[3] / 255;
    const oa = sa + da * (1 - sa);
    const ch = (i: number) => Math.round((c[i] * sa + d[i] * da * (1 - sa)) / oa);
    this.set(x, y, [ch(0), ch(1), ch(2), Math.round(oa * 255)]);
  }

  /** Overwrite a rectangle. */
  fillRect(x: number, y: number, w: number, h: number, c: RGBA): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.data.set(c, (yy * this.width + xx) * 4);
    }
  }

  /** Encode as a PNG (deterministic for identical pixels). */
  toPNG(): Buffer {
    const png = new PNG({ width: this.width, height: this.height });
    png.data.set(this.data);
    return PNG.sync.write(png);
  }
}
