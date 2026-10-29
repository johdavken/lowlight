import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { blank, crop, writePng, type Img } from './image';
import { loadMaster, scaleTo } from './master';
import type { Band } from './guide';
import { tempDir } from '../../server/test/fixtures/temp-dir';

const band: Band = { s: 1536 / 528, top: 119, h: 785, widest: 528 };
const tmp = () => tempDir('art-master-');
/** Byte-for-byte equality: spreading millions of bytes into `toEqual` takes seconds. */
const sameBytes = (a: Img, b: Img) => Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength).equals(Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength));

function gradient(w: number, h: number): Img {
  const img = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      img.data[o] = (x * 7) % 256;
      img.data[o + 1] = (y * 3) % 256;
      img.data[o + 2] = 90;
      img.data[o + 3] = 255;
    }
  }
  return img;
}

describe('loadMaster', () => {
  it('rejects a square image with a message naming the sizes', () => {
    const f = path.join(tmp(), 'master.png');
    writePng(f, blank(1024, 1024));
    expect(() => loadMaster(f, band)).toThrow('master.png is 1024×1024; need a 1536×1024 landscape image like guide.png');
  });

  it('rejects a portrait image', () => {
    const f = path.join(tmp(), 'master.png');
    writePng(f, blank(1024, 1536));
    expect(() => loadMaster(f, band)).toThrow(/1024×1536/);
  });

  it('rejects a file that is not a PNG', () => {
    const f = path.join(tmp(), 'master.png');
    fs.writeFileSync(f, 'not an image');
    expect(() => loadMaster(f, band)).toThrow(/not a PNG/);
  });

  it('rejects a missing master with the handoff instructions', () => {
    expect(() => loadMaster(path.join(tmp(), 'master.png'), band)).toThrow(/no master\.png/);
  });

  it('scales a 3072×2048 master to 1536×1024 and returns the band rows', () => {
    const f = path.join(tmp(), 'master.png');
    const big = gradient(3072, 2048);
    writePng(f, big);
    const out = loadMaster(f, band);
    expect([out.w, out.h]).toEqual([1536, 785]);
    const expected = crop(scaleTo(big, 1536, 1024), 0, band.top, 1536, band.h);
    expect(sameBytes(out, expected)).toBe(true);
  });

  it('accepts an exact 1536×1024 master unchanged inside the band', () => {
    const f = path.join(tmp(), 'master.png');
    const m = gradient(1536, 1024);
    writePng(f, m);
    expect(sameBytes(loadMaster(f, band), crop(m, 0, band.top, 1536, band.h))).toBe(true);
  });
});
