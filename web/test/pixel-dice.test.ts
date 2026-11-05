import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawDie, faceShown, orientation, PIXEL, rollPixelDice, ROLL_MS } from '../src/room/table/pixel-dice';

describe('pixel dice: the 3D die', () => {
  it('a landed die shows the rolled face, for every face', () => {
    for (const f of [1, 2, 3, 4, 5, 6]) expect(faceShown(orientation(f, [0, 0, 1], 0))).toBe(f);
  });

  it('mid-tumble it can show another face (the spin unwinds onto the right one)', () => {
    const seen = new Set<number>();
    for (let s = 0; s < 6.3; s += 0.3) seen.add(faceShown(orientation(6, [0.3, 0.6, 0.74], s)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('draws solid pixels with hard edges: every pixel is either empty or opaque, and a six shows pips', () => {
    const w = 40;
    const img = new Uint8ClampedArray(w * 40 * 4);
    const ids = new Int16Array(w * 40).fill(-1);
    drawDie(img, ids, w, 0, 20, 20, orientation(6, [0, 0, 1], 0), 'plain');
    const alphas = new Set<number>();
    let pips = 0;
    for (let k = 0; k < img.length; k += 4) {
      alphas.add(img[k + 3]);
      if (img[k + 3] === 255 && img[k] === 0x12 && img[k + 1] === 0x0a && img[k + 2] === 0x22) pips++;
    }
    expect([...alphas].sort()).toEqual([0, 255]);
    expect(pips).toBeGreaterThan(6);
  });
});

describe('pixel dice: the roll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no 2D context: the tray runs undrawn.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a tray sized to the dice, drawn at 1.5× with the faces it rolls', () => {
    const r = rollPixelDice({ faces: [6, 3, 1], red: false, reduced: false });
    const c = r.root.querySelector('canvas')!;
    expect(r.root.className).toBe('tb-roll');
    expect(c.dataset.faces).toBe('6,3,1');
    expect(parseFloat(c.style.width)).toBeCloseTo(c.width * PIXEL);
    expect(r.restWidth).toBeLessThan(parseFloat(c.style.width));
    r.stop();
  });

  it('lands after the roll and the stagger, tapping on each bounce and a quieter settle', async () => {
    const taps: [number, number][] = [];
    const r = rollPixelDice({ faces: [6, 3], red: false, reduced: false, tap: (l, rate) => taps.push([l, rate]) });
    let down = false;
    void r.landed.then(() => (down = true));
    await vi.advanceTimersByTimeAsync(ROLL_MS - 50);
    expect(down).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(down).toBe(true);
    // 2.5 hops: two bounces and a settle, per die.
    expect(taps).toHaveLength(6);
    expect(taps[0][0]).toBeGreaterThan(taps.at(-1)![0]);
    expect(new Set(taps.map((t) => t[1])).size).toBe(2);
  });

  it('red hops once more per die', async () => {
    const taps: number[] = [];
    const r = rollPixelDice({ faces: [4], red: true, reduced: false, tap: (l) => taps.push(l) });
    await vi.advanceTimersByTimeAsync(2000);
    await r.landed;
    expect(taps).toHaveLength(4);
  });

  it('a click lands them at once with one tap, and the rest of the bounces stay quiet', async () => {
    const taps: number[] = [];
    const r = rollPixelDice({ faces: [6, 3, 1], red: false, reduced: false, tap: (l) => taps.push(l) });
    await vi.advanceTimersByTimeAsync(100);
    r.land();
    await r.landed;
    expect(taps).toEqual([0.8]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(taps).toEqual([0.8]);
  });

  it('with frames stopped (a hidden tab) they still land by the clock, with one knock', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const taps: number[] = [];
    const r = rollPixelDice({ faces: [6, 3, 1], red: false, reduced: false, tap: (l) => taps.push(l) });
    let down = false;
    void r.landed.then(() => (down = true));
    await vi.advanceTimersByTimeAsync(ROLL_MS + 2 * 110 + 250);
    expect(down).toBe(true);
    expect(taps).toEqual([0.8]);
    vi.unstubAllGlobals();
  });

  it('reduced motion: down at once, silent', async () => {
    const taps: number[] = [];
    const r = rollPixelDice({ faces: [2], red: false, reduced: true, tap: (l) => taps.push(l) });
    await r.landed;
    expect(taps).toEqual([]);
  });

  it('light marks the lit dice', async () => {
    const r = rollPixelDice({ faces: [6, 6, 2], red: false, reduced: true });
    await r.landed;
    r.light([0, 1], 'kept', false);
    expect(r.root.querySelector('canvas')!.dataset.lit).toBe('0,1');
    r.stop();
  });
});
