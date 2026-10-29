import { describe, expect, it } from 'vitest';
import { fillReveal, revealPx } from './fill';
import { blank, blitOver, type Img } from './image';

const W = 100, H = 60;
const opaque = (img: Img, x: number, y: number) => img.data[(y * img.w + x) * 4 + 3] === 255;
function solid(rgba: number[], keep: (x: number, y: number) => boolean): Img {
  const img = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (keep(x, y)) img.data.set(rgba, (y * W + x) * 4);
  return img;
}
const maskWhere = (f: (x: number, y: number) => boolean) => {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = f(x, y) ? 1 : 0;
  return m;
};

describe('revealPx', () => {
  it('reveal strip = camera travel × parallax difference, scaled to band px', () => {
    expect(revealPx(1.0, 0.4, 1)).toEqual({ rx: 15, ry: 4 });
    expect(revealPx(0.4, 0.1, 2)).toEqual({ rx: 16, ry: 4 });
  });
});

describe('fillReveal', () => {
  const inFg = (x: number) => x >= 60 && x < 80;

  it('opaqueAll (back layer): no transparent pixel remains, colors come from the layer', () => {
    const back = solid([40, 20, 90, 255], (x) => x < 30 || x >= 80);
    const out = fillReveal(back, maskWhere((x) => x >= 30 && x < 80), 15, 4, true);
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255);
    expect([...out.data.slice(((10 * W) + 50) * 4, ((10 * W) + 50) * 4 + 3)]).toEqual([40, 20, 90]);
  });

  it('room layer: fills only the strip just inside the nearer mask edge; elsewhere stays transparent', () => {
    const room = solid([200, 100, 50, 255], (x) => x >= 30 && x < 60);
    const out = fillReveal(room, maskWhere((x) => inFg(x)), 15, 4, false);
    expect(opaque(out, 62, 30)).toBe(true); // just behind the fg edge, next to room pixels
    expect(opaque(out, 10, 30)).toBe(false); // genuinely empty (back shows through)
    expect(opaque(out, 90, 30)).toBe(false); // outside the nearer mask: untouched
  });

  it('opaqueAll fills only the reveal strip by extension; hidden areas get one flat average color (no streaks)', () => {
    const back = blank(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < 30; x++) back.data.set(x % 2 ? [200, 40, 120, 255] : [20, 20, 60, 255], (y * W + x) * 4);
    const out = fillReveal(back, maskWhere((x) => x >= 30), 5, 2, true);
    const at = (x: number, y: number) => [...out.data.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
    expect(at(90, 30)).toEqual(at(60, 10)); // far inside the hidden area: one flat color
    expect(at(90, 30)).toEqual([110, 30, 90, 255]); // = average of the layer's own pixels
  });

  it('a layer with no pixels at all fills opaqueAll with black instead of hanging', () => {
    const out = fillReveal(blank(4, 4), new Uint8Array(16), 2, 2, true);
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255);
  });

  it('Review Focus 3: after fill, compositing at max camera offsets shows no transparent pixel', () => {
    const back = solid([40, 20, 90, 255], (x) => x < 30 || x >= 80);
    const room = solid([200, 100, 50, 255], (x) => x >= 30 && x < 60);
    const fg = solid([10, 10, 10, 255], (x) => inFg(x));
    const nearBack = maskWhere((x) => x >= 30 && x < 80);
    const nearRoom = maskWhere((x) => inFg(x));
    const backF = fillReveal(back, nearBack, revealPx(0.4, 0.1, 1).rx, revealPx(0.4, 0.1, 1).ry, true);
    const roomF = fillReveal(room, nearRoom, revealPx(1.0, 0.4, 1).rx, revealPx(1.0, 0.4, 1).ry, false);
    for (const [dx, dy] of [[24, 6], [-24, -6], [24, -6], [-24, 6]]) {
      const comp = blank(W, H);
      blitOver(comp, backF, Math.round(dx * 0.1), Math.round(dy * 0.1));
      blitOver(comp, roomF, Math.round(dx * 0.4), Math.round(dy * 0.4));
      blitOver(comp, fg, dx, dy);
      for (let y = 8; y < H - 8; y++) for (let x = 26; x < W - 26; x++) expect(opaque(comp, x, y)).toBe(true);
    }
  });
});
