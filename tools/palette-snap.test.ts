import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { PNG } from 'pngjs';
import { PixelCanvas, rgba } from './pixel';
import { parseArgs, snapImage } from './palette-snap';
import type { Hex } from '../shared/types';

const PALETTE: Hex[] = [
  '#040209',
  '#ff3c8a',
  '#7fe9ff',
  '#ffb347',
  '#9b5cff',
  '#f2e6d8',
];

function gradientPng(width: number, height: number): PNG {
  const c = new PixelCanvas(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = x / (width - 1);
      c.set(x, y, [Math.round(t * 255), Math.round((1 - t) * 255), 128, 255]);
    }
  }
  return PNG.sync.read(c.toPNG());
}

function solidPng(width: number, height: number, hex: Hex): PNG {
  const c = new PixelCanvas(width, height);
  c.fillRect(0, 0, width, height, rgba(hex));
  return PNG.sync.read(c.toPNG());
}

describe('snapImage', () => {
  it('downscales a 960x540 gradient to 480x270', () => {
    const input = gradientPng(960, 540);
    const out = snapImage(input, { width: 480, height: 270, palette: PALETTE });
    expect(out.width).toBe(480);
    expect(out.height).toBe(270);
  });

  it('maps every opaque pixel to an exact palette color', () => {
    const input = gradientPng(960, 540);
    const out = snapImage(input, { width: 480, height: 270, palette: PALETTE });
    const paletteSet = new Set(PALETTE.map((h) => h.toLowerCase()));
    const offPalette = new Set<string>();
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) continue;
      const hex = `#${[0, 1, 2]
        .map((k) => out.data[i + k].toString(16).padStart(2, '0'))
        .join('')}`;
      if (!paletteSet.has(hex)) offPalette.add(hex);
    }
    expect([...offPalette]).toEqual([]);
  });

  it('only produces alpha values of 0 or 255', () => {
    const input = gradientPng(960, 540);
    const out = snapImage(input, { width: 480, height: 270, palette: PALETTE });
    const alphas = new Set<number>();
    for (let i = 3; i < out.data.length; i += 4) alphas.add(out.data[i]);
    expect([...alphas].filter((a) => a !== 0 && a !== 255)).toEqual([]);
  });

  it('a pure palette color survives exactly', () => {
    const hex = '#ff3c8a';
    const input = solidPng(960, 540, hex);
    const out = snapImage(input, { width: 480, height: 270, palette: PALETTE });
    const at = (x: number, y: number) => {
      const i = (y * out.width + x) * 4;
      return `#${[0, 1, 2].map((k) => out.data[i + k].toString(16).padStart(2, '0')).join('')}`;
    };
    expect(at(0, 0)).toBe(hex);
    expect(at(240, 135)).toBe(hex);
    expect(out.data[(135 * out.width + 240) * 4 + 3]).toBe(255);
  });

  it('throws on aspect mismatch with reduced ratios', () => {
    const input = gradientPng(800, 600); // 4:3
    expect(() => snapImage(input, { width: 480, height: 270, palette: PALETTE })).toThrow(
      'aspect mismatch: got 4:3, expected 16:9',
    );
  });

  it('allows a wider input to pass when it matches the explicit target width (parallax margin)', () => {
    const input = gradientPng(1008, 540); // 504:270, matches target
    const out = snapImage(input, { width: 504, height: 270, palette: PALETTE });
    expect([out.width, out.height]).toEqual([504, 270]);
  });
});

describe('parseArgs', () => {
  const defaultPalette = '/default/palette.json';

  it('defaults width/height/palette and resolves positional paths', () => {
    const args = parseArgs(['in.png', 'out.png'], defaultPalette);
    expect(args.inPath).toBe('in.png');
    expect(args.outPath).toBe('out.png');
    expect(args.width).toBe(480);
    expect(args.height).toBe(270);
    expect(args.palettePath).toBe(defaultPalette);
  });

  it('parses explicit --width/--height/--palette flags', () => {
    const args = parseArgs(
      ['in.png', 'out.png', '--width', '504', '--height', '270', '--palette', 'my.json'],
      defaultPalette,
    );
    expect(args.width).toBe(504);
    expect(args.height).toBe(270);
    expect(args.palettePath).toBe(path.resolve('my.json'));
  });

  it('rejects a missing input/output path', () => {
    expect(() => parseArgs([], defaultPalette)).toThrow('usage: palette-snap');
  });

  it.each(['abc', '-480', '0', '3.5', ''])('rejects a non-positive-integer --width (%s)', (bad) => {
    expect(() => parseArgs(['in.png', 'out.png', '--width', bad], defaultPalette)).toThrow(
      `invalid --width: ${bad} (must be a positive integer)`,
    );
  });

  it.each(['abc', '-270', '0'])('rejects a non-positive-integer --height (%s)', (bad) => {
    expect(() => parseArgs(['in.png', 'out.png', '--height', bad], defaultPalette)).toThrow(
      `invalid --height: ${bad} (must be a positive integer)`,
    );
  });
});
