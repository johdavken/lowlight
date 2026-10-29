import { describe, expect, it } from 'vitest';
import { lerpOklab, normalizeHex, parseHex, toHex } from './color';

describe('parseHex', () => {
  it('parses a valid hex color into 0..1 channels', () => {
    expect(parseHex('#FF3C8A')).toEqual([1, 60 / 255, 138 / 255]);
  });

  it('requires a leading #', () => {
    expect(parseHex('ff3c8a')).toBeNull();
  });

  it('rejects the wrong length', () => {
    expect(parseHex('#ff3c8')).toBeNull();
  });
});

describe('normalizeHex', () => {
  it('lowercases a valid hex color', () => {
    expect(normalizeHex('#FFB347')).toBe('#ffb347');
  });

  it('returns null for invalid input', () => {
    expect(normalizeHex('not-a-color')).toBeNull();
  });
});

describe('toHex', () => {
  it('formats rgb channels as lowercase hex', () => {
    expect(toHex([1, 60 / 255, 138 / 255])).toBe('#ff3c8a');
  });

  it('clamps out-of-range channels', () => {
    expect(toHex([-1, 2, 0.5])).toBe('#00ff80');
  });
});

describe('lerpOklab', () => {
  it('returns the start color at t=0', () => {
    expect(lerpOklab('#000000', '#ffffff', 0)).toBe('#000000');
  });

  it('returns the end color at t=1', () => {
    expect(lerpOklab('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('interpolates in OKLab, not sRGB', () => {
    expect(lerpOklab('#ff0000', '#0000ff', 0.5)).not.toBe('#800080');
  });
});
