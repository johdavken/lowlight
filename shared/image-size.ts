/**
 * An image's type and size from its header, for the splash library's uploads (spec 2026-10-09
 * splash library §3.3): PNG, JPEG or WebP. Never throws; null for anything else or a cut header.
 */
export type ImageType = 'png' | 'jpeg' | 'webp';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b: Uint8Array, at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const u32be = (b: Uint8Array, at: number) => ((b[at]! << 24) >>> 0) + ((b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!);

export function imageSize(buf: Uint8Array): { type: ImageType; width: number; height: number } | null {
  const b = buf;
  const size = (type: ImageType, width: number, height: number) => (width > 0 && height > 0 ? { type, width, height } : null);
  if (b.length >= 24 && PNG_SIG.every((v, i) => b[i] === v) && ascii(b, 12, 'IHDR')) return size('png', u32be(b, 16), u32be(b, 20));
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // Segments after SOI: the first start-of-frame (C0–CF, not C4 DHT, C8 JPG, CC DAC) has the size.
    let at = 2;
    while (at + 4 <= b.length) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1]!;
      if (marker === 0xff) {
        at++;
        continue;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        at += 2;
        continue;
      }
      const len = u16be(b, at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (at + 9 > b.length) return null;
        return size('jpeg', u16be(b, at + 7), u16be(b, at + 5));
      }
      if (len < 2) return null;
      at += 2 + len;
    }
    return null;
  }
  if (b.length >= 16 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) {
    const data = 20;
    // Each chunk checks that its own header is all there.
    const has = (n: number) => b.length >= data + n;
    if (ascii(b, 12, 'VP8X') && has(10)) return size('webp', u24le(b, data + 4) + 1, u24le(b, data + 7) + 1);
    if (ascii(b, 12, 'VP8L') && has(5)) {
      if (b[data] !== 0x2f) return null;
      const bits = (b[data + 1]! | (b[data + 2]! << 8) | (b[data + 3]! << 16) | (b[data + 4]! << 24)) >>> 0;
      return size('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (ascii(b, 12, 'VP8 ') && has(10)) {
      if (b[data + 3] !== 0x9d || b[data + 4] !== 0x01 || b[data + 5] !== 0x2a) return null;
      return size('webp', u16le(b, data + 6) & 0x3fff, u16le(b, data + 8) & 0x3fff);
    }
  }
  return null;
}
