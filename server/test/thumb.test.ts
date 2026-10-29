import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { cropBox, createThumbs, renderThumb, THUMB_H, THUMB_W } from '../src/thumb';
import type { Face } from '../../shared/types';
import { tempDir } from './fixtures/temp-dir';

/** An opaque PNG, every pixel set by `fill(x, y)`. */
function makePng(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = a;
    }
  }
  return png;
}

function pixel(png: PNG, x: number, y: number): [number, number, number, number] {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

describe('cropBox', () => {
  it('30% of width, 104:120 aspect, centred on the face', () => {
    expect(cropBox(1000, 1500, { x: 0.5, y: 0.5 })).toEqual({ x: 350, y: 577, w: 300, h: 346 });
  });

  it('clamps at each edge', () => {
    expect(cropBox(1000, 1500, { x: 0, y: 0 })).toMatchObject({ x: 0, y: 0 });
    expect(cropBox(1000, 1500, { x: 1, y: 1 })).toMatchObject({ x: 700, y: 1154 });
  });

  it('on a sprite too short for the box shrinks the box to the full height, keeping aspect', () => {
    expect(cropBox(1000, 300, { x: 0.5, y: 0.5 })).toEqual({ x: 370, y: 0, w: 260, h: 300 });
  });
});

describe('renderThumb', () => {
  it('outputs 208×240 with alpha preserved (transparent source corner stays transparent)', () => {
    // 1387×480 gives an exact 2× box (416×480) over the full height, face centred.
    const src = makePng(1387, 480, (x, y) => {
      const inCorner = x >= 486 && x <= 487 && y <= 1;
      return inCorner ? [0, 0, 0, 0] : [255, 255, 255, 255];
    });
    const out = PNG.sync.read(renderThumb(src, { x: 0.5, y: 0.5 }));
    expect(out.width).toBe(THUMB_W);
    expect(out.height).toBe(THUMB_H);
    expect(pixel(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(out, THUMB_W - 1, THUMB_H - 1)).toEqual([255, 255, 255, 255]);
  });

  it('box-averages when shrinking: a 2-colour checker becomes the mid colour', () => {
    const src = makePng(1387, 480, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const out = PNG.sync.read(renderThumb(src, { x: 0.5, y: 0.5 }));
    expect(pixel(out, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it('scales up with nearest-neighbour when the box is smaller than 208×240', () => {
    // 20×20 source → box is 6×7 at (7,7), well under 208×240.
    const src = makePng(20, 20, (x, y) => (x === 7 && y === 7 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const out = PNG.sync.read(renderThumb(src, { x: 0.5, y: 0.5 }));
    expect(pixel(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(out, 100, 100)).toEqual([0, 0, 255, 255]);
  });

  it('box-averages rows as an exact partition: no source row is double-counted at a non-integer ratio', () => {
    // 1442×500 → box {x:505, y:0, w:433, h:500} (face centred): box.h=500 vs THUMB_H=240 is a
    // non-integer ratio, so output rows 0..5 partition source rows [0,2) [2,4) [4,6) [6,8) [8,10) [10,12)
    // — each source row counted exactly once. A row-only gradient lets us check each partition's mean.
    const src = makePng(1442, 500, (_x, y) => {
      const g = Math.min(255, y * 20);
      return [g, g, g, 255];
    });
    const out = PNG.sync.read(renderThumb(src, { x: 0.5, y: 0.5 }));
    const expected = [10, 50, 90, 130, 170, 210];
    for (let oy = 0; oy < expected.length; oy++) {
      expect(pixel(out, 0, oy)).toEqual([expected[oy], expected[oy], expected[oy], 255]);
    }
  });

  it('box-averages columns as an exact partition: no source column is double-counted at a non-integer ratio', () => {
    // Same box as above; box.w=433 vs THUMB_W=208 is also a non-integer ratio. A column-only
    // gradient (relative to the box's left edge, x=505) checks the same partition on the other axis.
    const src = makePng(1442, 500, (x, _y) => {
      const relX = Math.max(0, x - 505);
      const g = Math.min(255, relX * 20);
      return [g, g, g, 255];
    });
    const out = PNG.sync.read(renderThumb(src, { x: 0.5, y: 0.5 }));
    const expected = [10, 50, 90, 130, 170, 210];
    for (let ox = 0; ox < expected.length; ox++) {
      expect(pixel(out, ox, 0)).toEqual([expected[ox], expected[ox], expected[ox], 255]);
    }
  });

  it('box-averages a window with two different colours at different alphas, weighting colour by alpha', () => {
    // Exact 2× box again; the 2×2 window for output (0,0) holds: opaque red, half-alpha blue,
    // opaque green, fully transparent. Colour channels are alpha-weighted (premultiplied); alpha
    // itself is the plain mean of the four raw alphas.
    const src = makePng(1387, 480, (x, y) => {
      if (x === 486 && y === 0) return [255, 0, 0, 255]; // opaque red
      if (x === 487 && y === 0) return [0, 0, 255, 128]; // half-alpha blue
      if (x === 486 && y === 1) return [0, 255, 0, 255]; // opaque green
      if (x === 487 && y === 1) return [0, 0, 0, 0]; // fully transparent
      return [255, 255, 255, 255];
    });
    const out = PNG.sync.read(renderThumb(src, { x: 0.5, y: 0.5 }));
    // aWeight = (255+128+255+0)/255 = 638/255; r = g = 255/aWeight ≈ 101.92 → 102; b = 128/aWeight ≈ 51.16 → 51;
    // alpha = round((255+128+255+0)/4) = round(159.5) = 160.
    expect(pixel(out, 0, 0)).toEqual([102, 102, 51, 160]);
  });

  it('accepts greyscale and 16-bit sources (pngjs normalises to RGBA)', () => {
    const gray = Buffer.alloc(4 * 4, 200);
    const grayFile = PNG.sync.write({ width: 4, height: 4, data: gray } as unknown as PNG, { colorType: 0, inputColorType: 0, bitDepth: 8 });
    const graySrc = PNG.sync.read(grayFile);
    expect(pixel(graySrc, 0, 0)).toEqual([200, 200, 200, 255]);
    const grayOut = PNG.sync.read(renderThumb(graySrc, { x: 0.5, y: 0.5 }));
    expect(grayOut.width).toBe(THUMB_W);
    expect(grayOut.height).toBe(THUMB_H);

    const samples = new Uint16Array(4 * 4 * 4);
    for (let i = 0; i < samples.length; i += 4) {
      samples[i] = 65535;
      samples[i + 1] = 0;
      samples[i + 2] = 0;
      samples[i + 3] = 65535;
    }
    const deepData = Buffer.from(samples.buffer);
    const deepFile = PNG.sync.write({ width: 4, height: 4, data: deepData } as unknown as PNG, {
      colorType: 6,
      inputColorType: 6,
      bitDepth: 16,
      inputHasAlpha: true,
    });
    const deepSrc = PNG.sync.read(deepFile);
    expect(pixel(deepSrc, 0, 0)).toEqual([255, 0, 0, 255]);
    const deepOut = PNG.sync.read(renderThumb(deepSrc, { x: 0.5, y: 0.5 }));
    expect(deepOut.width).toBe(THUMB_W);
    expect(deepOut.height).toBe(THUMB_H);
  });
});

describe('createThumbs', () => {
  let dir: string;
  beforeEach(() => {
    dir = tempDir('nix-thumb-');
  });

  it('caches: same file/mtime/face → same Buffer instance; a new mtime or face → a new one', () => {
    const file = path.join(dir, 'sprite.png');
    fs.writeFileSync(file, PNG.sync.write(new PNG({ width: 20, height: 20 })));
    const warn = () => {};
    const thumbs = createThumbs(warn);
    const face: Face = { x: 0.5, y: 0.5 };

    const first = thumbs.get(file, face);
    const second = thumbs.get(file, face);
    expect(first).not.toBeNull();
    expect(second!.png).toBe(first!.png);
    expect(second!.etag).toBe(first!.etag);

    const otherFace: Face = { x: 0.2, y: 0.2 };
    const third = thumbs.get(file, otherFace);
    expect(third!.png).not.toBe(first!.png);

    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(file, future, future);
    const fourth = thumbs.get(file, face);
    expect(fourth!.png).not.toBe(first!.png);
  });

  it('an undecodable file → null and one warning, even when asked twice', () => {
    const file = path.join(dir, 'bad.png');
    fs.writeFileSync(file, 'not a png');
    const warnings: string[] = [];
    const thumbs = createThumbs((m) => warnings.push(m));
    const face: Face = { x: 0.5, y: 0.5 };

    expect(thumbs.get(file, face)).toBeNull();
    expect(thumbs.get(file, face)).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('two faces sharing a sprite do not evict each other from the cache', () => {
    const file = path.join(dir, 'sprite.png');
    fs.writeFileSync(file, PNG.sync.write(new PNG({ width: 20, height: 20 })));
    const thumbs = createThumbs(() => {});
    const faceA: Face = { x: 0.5, y: 0.5 };
    const faceB: Face = { x: 0.2, y: 0.2 };

    const a1 = thumbs.get(file, faceA);
    const b1 = thumbs.get(file, faceB);
    const a2 = thumbs.get(file, faceA);
    const b2 = thumbs.get(file, faceB);
    expect(a2!.png).toBe(a1!.png);
    expect(b2!.png).toBe(b1!.png);
  });

  it('clears the warned-decode flag for a file once it decodes successfully, so a later failure warns again', () => {
    const file = path.join(dir, 'sprite.png');
    fs.writeFileSync(file, 'not a png');
    const warnings: string[] = [];
    const thumbs = createThumbs((m) => warnings.push(m));
    const face: Face = { x: 0.5, y: 0.5 };

    expect(thumbs.get(file, face)).toBeNull();
    expect(warnings).toHaveLength(1);

    const t1 = new Date(Date.now() + 60_000);
    fs.writeFileSync(file, PNG.sync.write(new PNG({ width: 20, height: 20 })));
    fs.utimesSync(file, t1, t1);
    expect(thumbs.get(file, face)).not.toBeNull();
    expect(warnings).toHaveLength(1);

    const t2 = new Date(Date.now() + 120_000);
    fs.writeFileSync(file, 'not a png again');
    fs.utimesSync(file, t2, t2);
    expect(thumbs.get(file, face)).toBeNull();
    expect(warnings).toHaveLength(2);
  });
});
