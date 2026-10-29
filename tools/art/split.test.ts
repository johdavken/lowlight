import { describe, expect, it } from 'vitest';
import { labelLayers, maskOf, removeSpecks } from './split';
import type { ArtSpec } from './spec';
import type { Band } from './guide';

const spec = (force: ArtSpec['depth']['force'] = []) =>
  ({ depth: { backFartherThan: 0.6, fgNearerThan: 0.2, force }, minSpeckPx: 0 }) as unknown as ArtSpec;
// A band where 1 scene px = 1 band px and the widest frame is 480 (no frame offset).
const unitBand: Band = { s: 1, top: 0, h: 270, widest: 480 };

describe('labelLayers', () => {
  it('bands depth into back / room / fg (indices back→front)', () => {
    const d = new Float32Array([0.9, 0.4, 0.1]);
    expect([...labelLayers(d, 3, 1, spec(), unitBand, ['back', 'room', 'fg'])]).toEqual([0, 1, 2]);
  });

  it('four layers: sky / far / mid / fg by three depth cuts', () => {
    const sp = { depth: { skyFartherThan: 0.9, backFartherThan: 0.6, fgNearerThan: 0.3, force: [] } };
    const d = new Float32Array([0.95, 0.7, 0.5, 0.1]);
    expect([...labelLayers(d, 4, 1, sp, unitBand, ['sky', 'far', 'mid', 'fg'])]).toEqual([0, 1, 2, 3]);
  });

  it('four layers need skyFartherThan', () => {
    const d = new Float32Array([0.95]);
    expect(() => labelLayers(d, 1, 1, spec(), unitBand, ['sky', 'far', 'mid', 'fg'])).toThrow('art spec: depth.skyFartherThan is required for 4-layer scenes');
  });

  it('five layers are refused', () => {
    expect(() => labelLayers(new Float32Array(1), 1, 1, spec(), unitBand, ['a', 'b', 'c', 'd', 'e'])).toThrow('art: scenes with more than 4 layers are not supported yet');
  });

  it('with two layers the middle band goes to the front layer', () => {
    const d = new Float32Array([0.9, 0.4, 0.1]);
    expect([...labelLayers(d, 3, 1, spec(), unitBand, ['back', 'fg'])]).toEqual([0, 1, 1]);
  });

  it('a forced rect wins over depth: a "near" window forced to back', () => {
    const w = 480, h = 270;
    const d = new Float32Array(w * h).fill(0.05); // everything near
    const labels = labelLayers(d, w, h, spec([{ layer: 'back', rect: [10, 10, 20, 20] }]), unitBand, ['back', 'room', 'fg']);
    expect(labels[15 * w + 15]).toBe(0);
    expect(labels[5 * w + 5]).toBe(2);
  });

  it('a force rect with minDepth only claims pixels at least that far (couch in front of a window stays room)', () => {
    const w = 480, h = 270;
    const d = new Float32Array(w * h).fill(0.4); // room depth (between fgNearerThan 0.2 and backFartherThan)
    for (let y = 10; y < 20; y++) for (let x = 10; x < 30; x++) d[y * w + x] = 0.95; // city through the glass
    const sp = { depth: { backFartherThan: 0.99, fgNearerThan: 0.2, force: [{ layer: 'back', rect: [10, 10, 30, 20], minDepth: 0.9 }] }, minSpeckPx: 0 } as unknown as ArtSpec;
    const labels = labelLayers(d, w, h, sp, unitBand, ['back', 'room', 'fg']);
    expect(labels[15 * w + 15]).toBe(0); // far enough → forced to back (depth alone would say room)
    expect(labels[25 * w + 15]).toBe(1); // inside the rect but nearer (couch) → stays room
  });

  it('a force rect with maxDepth only claims pixels at most that far (a lamp pole, not the wall behind it)', () => {
    const w = 480, h = 270;
    const d = new Float32Array(w * h).fill(0.6); // wall depth (room)
    for (let y = 10; y < 30; y++) for (let x = 18; x < 22; x++) d[y * w + x] = 0.4; // the pole
    const sp = { depth: { backFartherThan: 0.99, fgNearerThan: 0.2, force: [{ layer: 'fg', rect: [10, 10, 20, 20], maxDepth: 0.5 }] }, minSpeckPx: 0 } as unknown as ArtSpec;
    const labels = labelLayers(d, w, h, sp, unitBand, ['back', 'room', 'fg']);
    expect(labels[15 * w + 20]).toBe(2); // near enough → forced to fg (depth alone would say room)
    expect(labels[15 * w + 12]).toBe(1); // inside the rect but farther (wall) → stays room
  });

  it('maps scene rects through the band scale and the widest-frame offset', () => {
    const band: Band = { s: 2, top: 0, h: 540, widest: 500 }; // frame offset (500-480)/2 = 10 scene px
    const w = 1000, h = 540;
    const d = new Float32Array(w * h).fill(0.05);
    const labels = labelLayers(d, w, h, spec([{ layer: 'back', rect: [0, 0, 5, 5] }]), band, ['back', 'room', 'fg']);
    expect(labels[2 * w + 20]).toBe(0); // scene (0,0) → band ((0+10)*2, 0)
    expect(labels[2 * w + 18]).toBe(2); // just left of the rect
  });

  it('rejects a force rect naming a layer the scene does not have', () => {
    expect(() => labelLayers(new Float32Array(4), 2, 2, spec([{ layer: 'sky', rect: [0, 0, 1, 1] }]), unitBand, ['back', 'fg'])).toThrow(
      /force.*sky/,
    );
  });

});

describe('removeSpecks', () => {
  it('an island smaller than minPx takes the surrounding label; a big one stays', () => {
    const w = 10, h = 10;
    const labels = new Uint8Array(w * h).fill(1);
    labels[22] = 0; labels[23] = 0; labels[32] = 0; // 3-pixel island
    for (let y = 5; y < 9; y++) for (let x = 5; x < 9; x++) labels[y * w + x] = 2; // 16-pixel island
    removeSpecks(labels, w, h, 5);
    expect(labels[22]).toBe(1);
    expect(labels[32]).toBe(1);
    expect(labels[6 * w + 6]).toBe(2);
  });
});

describe('maskOf', () => {
  it('returns 1 where the label matches', () => {
    expect([...maskOf(new Uint8Array([0, 1, 1, 2]), 1)]).toEqual([0, 1, 1, 0]);
  });
});
