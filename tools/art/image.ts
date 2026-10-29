import fs from 'node:fs';
import { PNG } from 'pngjs';

/** An RGBA image, row-major, 4 bytes per pixel. The pipeline's in-memory currency. */
export interface Img {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function blank(w: number, h: number): Img {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function fromPNG(png: PNG): Img {
  return { w: png.width, h: png.height, data: new Uint8ClampedArray(png.data) };
}

export function toPNG(img: Img): PNG {
  const png = new PNG({ width: img.w, height: img.h });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return png;
}

export function readPng(file: string): Img {
  return fromPNG(PNG.sync.read(fs.readFileSync(file)));
}

export function writePng(file: string, img: Img): void {
  fs.writeFileSync(file, PNG.sync.write(toPNG(img)));
}

/** A copy of the rectangle (x, y, w, h), clamped to the image bounds. */
export function crop(img: Img, x: number, y: number, w: number, h: number): Img {
  const x0 = Math.max(0, Math.min(img.w, Math.round(x)));
  const y0 = Math.max(0, Math.min(img.h, Math.round(y)));
  const cw = Math.max(0, Math.min(img.w - x0, Math.round(w)));
  const ch = Math.max(0, Math.min(img.h - y0, Math.round(h)));
  const out = blank(cw, ch);
  for (let row = 0; row < ch; row++) {
    const s = ((y0 + row) * img.w + x0) * 4;
    out.data.set(img.data.subarray(s, s + cw * 4), row * cw * 4);
  }
  return out;
}

export function scaleNearest(img: Img, w: number, h: number): Img {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1, Math.floor((y * img.h) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.floor((x * img.w) / w));
      const s = (sy * img.w + sx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return out;
}

/** Draws `src` over `dst` at (x, y) with straight-alpha "over" compositing. */
export function blitOver(dst: Img, src: Img, x: number, y: number): void {
  for (let sy = 0; sy < src.h; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dst.h) continue;
    for (let sx = 0; sx < src.w; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= dst.w) continue;
      const s = (sy * src.w + sx) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa === 0) continue;
      const d = (dy * dst.w + dx) * 4;
      const da = dst.data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[d + c] = Math.round((src.data[s + c] * sa + dst.data[d + c] * da * (1 - sa)) / oa);
      }
      dst.data[d + 3] = Math.round(oa * 255);
    }
  }
}
