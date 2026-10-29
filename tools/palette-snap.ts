/**
 * Palette-snap: turns AI-generated or asset-pack art into pixel-art room layers — downscale to
 * the render grid, quantize to a fixed palette, binary alpha.
 *
 * Usage: `npm run palette-snap -- <in.png> <out.png> [--width 480] [--height 270] [--palette tools/palette.json]`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import type { Hex } from '../shared/types';
import { SRGB_BYTE_TO_LINEAR, linearSrgbToOklab, parseHex, srgbToLinear } from '../shared/color';

export interface SnapOptions {
  width: number;
  height: number;
  palette: Hex[];
  /** Alpha (0..255) at or above which an output pixel is opaque. Default 128. */
  alphaThreshold?: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Throws if `inW:inH` doesn't match `outW:outH` within 1% tolerance. */
function checkAspect(inW: number, inH: number, outW: number, outH: number): void {
  const inRatio = inW / inH;
  const outRatio = outW / outH;
  if (Math.abs(inRatio - outRatio) / outRatio > 0.01) {
    const g1 = gcd(inW, inH);
    const g2 = gcd(outW, outH);
    throw new Error(`aspect mismatch: got ${inW / g1}:${inH / g1}, expected ${outW / g2}:${outH / g2}`);
  }
}

export interface LabEntry {
  hex: Hex;
  lab: [number, number, number];
}

export function buildPaletteLab(palette: Hex[]): LabEntry[] {
  return palette.map((hex) => {
    const rgb = parseHex(hex);
    if (!rgb) throw new Error(`invalid palette color: ${hex}`);
    const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];
    return { hex, lab: linearSrgbToOklab(r, g, b) };
  });
}

/** Nearest palette color to `lab` by OKLab Euclidean distance. */
export function nearestPaletteColor(lab: readonly [number, number, number], table: LabEntry[]): Hex {
  let best = table[0];
  let bestDist = Infinity;
  for (const entry of table) {
    const dl = lab[0] - entry.lab[0];
    const da = lab[1] - entry.lab[1];
    const db = lab[2] - entry.lab[2];
    const dist = dl * dl + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best.hex;
}

/**
 * Area-weighted box-filter sample of one output pixel's source region [x0,x1) x [y0,y1).
 * Averages in linear light, weighted by alpha so transparent source pixels don't bleed color.
 * When the input is an exact multiple of the output, the box boundaries land on integer source
 * pixels, so this reduces to a plain integer box average.
 */
function sampleBox(
  input: PNG,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { r: number; g: number; b: number; coverage: number } {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  let totalArea = 0;
  const sy0 = Math.max(0, Math.floor(y0));
  const sy1 = Math.min(input.height, Math.ceil(y1));
  const sx0 = Math.max(0, Math.floor(x0));
  const sx1 = Math.min(input.width, Math.ceil(x1));
  for (let sy = sy0; sy < sy1; sy++) {
    const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
    if (wy <= 0) continue;
    for (let sx = sx0; sx < sx1; sx++) {
      const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
      if (wx <= 0) continue;
      const area = wx * wy;
      totalArea += area;
      const i = (sy * input.width + sx) * 4;
      const a = input.data[i + 3] / 255;
      sumA += area * a;
      if (a > 0) {
        sumR += area * a * SRGB_BYTE_TO_LINEAR[input.data[i]];
        sumG += area * a * SRGB_BYTE_TO_LINEAR[input.data[i + 1]];
        sumB += area * a * SRGB_BYTE_TO_LINEAR[input.data[i + 2]];
      }
    }
  }
  const coverage = totalArea > 0 ? sumA / totalArea : 0;
  if (sumA <= 0) return { r: 0, g: 0, b: 0, coverage };
  return { r: sumR / sumA, g: sumG / sumA, b: sumB / sumA, coverage };
}

/** Downscale + palette-quantize + binary-alpha an input PNG into a room-ready layer PNG. */
export function snapImage(input: PNG, opts: SnapOptions): PNG {
  const { width: outW, height: outH, palette } = opts;
  const alphaThreshold = opts.alphaThreshold ?? 128;
  checkAspect(input.width, input.height, outW, outH);

  const table = buildPaletteLab(palette);
  const scaleX = input.width / outW;
  const scaleY = input.height / outH;
  const out = new PNG({ width: outW, height: outH });

  for (let oy = 0; oy < outH; oy++) {
    const y0 = oy * scaleY;
    const y1 = y0 + scaleY;
    for (let ox = 0; ox < outW; ox++) {
      const x0 = ox * scaleX;
      const x1 = x0 + scaleX;
      const { r, g, b, coverage } = sampleBox(input, x0, x1, y0, y1);
      const oi = (oy * outW + ox) * 4;
      if (coverage * 255 >= alphaThreshold) {
        const lab = linearSrgbToOklab(r, g, b);
        const hex = nearestPaletteColor(lab, table);
        const rgb = parseHex(hex);
        if (!rgb) throw new Error(`invalid palette color: ${hex}`);
        out.data[oi] = Math.round(rgb[0] * 255);
        out.data[oi + 1] = Math.round(rgb[1] * 255);
        out.data[oi + 2] = Math.round(rgb[2] * 255);
        out.data[oi + 3] = 255;
      } else {
        out.data[oi] = 0;
        out.data[oi + 1] = 0;
        out.data[oi + 2] = 0;
        out.data[oi + 3] = 0;
      }
    }
  }
  return out;
}

function countOpaque(png: PNG): number {
  let n = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 255) n++;
  return n;
}

/** Parses a `--width`/`--height` value: must be a positive integer. Throws a clear message otherwise. */
function parsePositiveInt(name: string, raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`invalid --${name}: ${raw} (must be a positive integer)`);
  }
  const n = parseInt(raw, 10);
  if (n <= 0) {
    throw new Error(`invalid --${name}: ${raw} (must be a positive integer)`);
  }
  return n;
}

export function parseArgs(
  argv: string[],
  defaultPalettePath: string,
): { inPath: string; outPath: string; width: number; height: number; palettePath: string } {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [inPath, outPath] = positional;
  if (!inPath || !outPath) {
    throw new Error(
      'usage: palette-snap <in.png> <out.png> [--width 480] [--height 270] [--palette tools/palette.json]',
    );
  }
  const flag = (name: string, def: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
  };
  return {
    inPath,
    outPath,
    width: parsePositiveInt('width', flag('width', '480')),
    height: parsePositiveInt('height', flag('height', '270')),
    palettePath: path.resolve(flag('palette', defaultPalettePath)),
  };
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { inPath, outPath, width, height, palettePath } = parseArgs(
    process.argv.slice(2),
    path.join(here, 'palette.json'),
  );
  const palette: Hex[] = JSON.parse(fs.readFileSync(palettePath, 'utf8'));
  const input = PNG.sync.read(fs.readFileSync(path.resolve(inPath)));
  const out = snapImage(input, { width, height, palette });
  await fs.promises.writeFile(path.resolve(outPath), PNG.sync.write(out));
  console.log(`wrote ${outPath} ${width}×${height}, ${palette.length}-color palette, ${countOpaque(out)} opaque px`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
