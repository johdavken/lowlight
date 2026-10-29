import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { imageSize } from './image-size';

const bytes = (...b: number[]) => Uint8Array.from(b);
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const riff = (chunk: string, payload: number[]) => {
  const body = [...'WEBP'].map((c) => c.charCodeAt(0)).concat([...chunk].map((c) => c.charCodeAt(0)), [payload.length, 0, 0, 0], payload);
  const size = body.length;
  return Uint8Array.from([...'RIFF'].map((c) => c.charCodeAt(0)).concat([size & 0xff, (size >> 8) & 0xff, 0, 0], body));
};

describe('imageSize', () => {
  it('reads a PNG', () => {
    const png = PNG.sync.write(new PNG({ width: 40, height: 30 }));
    expect(imageSize(png)).toEqual({ type: 'png', width: 40, height: 30 });
  });

  it('reads a JPEG past its APP0 segment to SOF0', () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0, 0, 0);
    expect(imageSize(jpeg)).toEqual({ type: 'jpeg', width: 32, height: 16 });
  });

  it('reads a WebP VP8X canvas', () => {
    const webp = riff('VP8X', [0, 0, 0, 0, ...u24le(319), ...u24le(239)]);
    expect(imageSize(webp)).toEqual({ type: 'webp', width: 320, height: 240 });
  });

  it('reads a WebP VP8L (lossless) header', () => {
    // 14-bit width-1 and height-1 packed little-endian after the 0x2f signature: 100×50.
    const w = 99, h = 49;
    const bits = w | (h << 14);
    const webp = riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff]);
    expect(imageSize(webp)).toEqual({ type: 'webp', width: 100, height: 50 });
  });

  it('reads a WebP VP8 (lossy) frame header', () => {
    const webp = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 1600 & 0xff, 1600 >> 8, 900 & 0xff, 900 >> 8]);
    expect(imageSize(webp)).toEqual({ type: 'webp', width: 1600, height: 900 });
  });

  it('is null for random bytes, an empty buffer and a truncated PNG', () => {
    expect(imageSize(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9))).toBeNull();
    expect(imageSize(new Uint8Array(0))).toBeNull();
    const png = PNG.sync.write(new PNG({ width: 4, height: 4 }));
    expect(imageSize(png.subarray(0, 12))).toBeNull();
  });
});
