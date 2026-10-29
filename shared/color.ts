import type { Hex } from './types';

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Parse a `#rrggbb` hex string into [r,g,b] channels in 0..1. Requires the leading `#` and exactly 6 hex digits. */
export function parseHex(h: string): [number, number, number] | null {
  const m = HEX_RE.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return [r / 255, g / 255, b / 255];
}

/** Format [r,g,b] channels (0..1, clamped) as a lowercase `#rrggbb` string. */
export function toHex(rgb: [number, number, number]): Hex {
  const toByte = (x: number) => Math.round(clamp01(x) * 255);
  const [r, g, b] = rgb;
  const hex = (v: number) => toByte(v).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Validate and lowercase a hex color string. Returns null if invalid. */
export function normalizeHex(h: string): Hex | null {
  const rgb = parseHex(h);
  if (!rgb) return null;
  return toHex(rgb);
}

// sRGB <-> linear

/** sRGB channel (0..1) to linear light. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** `srgbToLinear(v / 255)` for every byte `v`: per-pixel loops index this instead of calling `Math.pow`. */
export const SRGB_BYTE_TO_LINEAR: Float64Array = Float64Array.from({ length: 256 }, (_, v) => srgbToLinear(v / 255));

/** Linear-light channel (0..1) to sRGB. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// Linear sRGB <-> OKLab, matrices from Björn Ottosson's published OKLab conversion.
// https://bottosson.github.io/posts/oklab/

/** Linear-light sRGB (0..1 channels) to OKLab. */
export function linearSrgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

export function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function hexToOklab(h: Hex): [number, number, number] | null {
  const rgb = parseHex(h);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];
  return linearSrgbToOklab(r, g, b);
}

function oklabToHex(lab: [number, number, number]): Hex {
  const [r, g, b] = oklabToLinearSrgb(lab[0], lab[1], lab[2]);
  return toHex([linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linearly interpolate between two hex colors in OKLab space, returning a hex color. */
export function lerpOklab(a: Hex, b: Hex, t: number): Hex {
  const labA = hexToOklab(a);
  const labB = hexToOklab(b);
  if (!labA || !labB) {
    throw new Error(`lerpOklab: invalid hex color (${a}, ${b})`);
  }
  const lab: [number, number, number] = [
    lerp(labA[0], labB[0], t),
    lerp(labA[1], labB[1], t),
    lerp(labA[2], labB[2], t),
  ];
  return oklabToHex(lab);
}
