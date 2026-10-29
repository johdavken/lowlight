import { describe, expect, it } from 'vitest';
import { Plume, plumeAmount, plumeLean, PUFF_PX, puffPixels, PUFF_SIZES, puffSize, type PuffView } from '../src/renderer/effects/plume';

const BOX: [number, number, number, number] = [100, 200, 40, 120];

/** Steps `secs` at 30 fps and returns every frame's puffs. */
function frames(p: Plume, secs: number) {
  const out: PuffView[][] = [];
  for (let t = 0; t < secs; t += 1 / 30) out.push(p.step(1 / 30));
  return out;
}

describe('plume', () => {
  it('plumeAmount reads 0–3, 1 by default; plumeLean -1…1, 0 by default', () => {
    expect(plumeAmount(undefined)).toBe(1);
    expect(plumeAmount(5)).toBe(3);
    expect(plumeAmount(-1)).toBe(0);
    expect(plumeLean(undefined)).toBe(0);
    expect(plumeLean(2)).toBe(1);
    expect(plumeLean(-2)).toBe(-1);
  });

  it('steam fills the box within a couple of seconds; the puffs rise from the bottom edge and fade by the top', () => {
    const p = new Plume(1, BOX, 'steam', 1, 0);
    const all = frames(p, 6);
    const last = all[all.length - 1];
    expect(last.length).toBeGreaterThan(8);
    const [x, y, w, h] = BOX;
    for (const puff of all.flat()) {
      expect(puff.y).toBeLessThanOrEqual(y + h);
      expect(puff.y).toBeGreaterThanOrEqual(y - puff.size);
      expect(puff.alpha).toBeGreaterThanOrEqual(0);
      expect(puff.alpha).toBeLessThanOrEqual(0.8);
      expect(puff.x).toBeGreaterThan(x - w);
      expect(puff.x).toBeLessThan(x + 2 * w);
    }
    // Near the top, puffs are fainter than in the body of the plume.
    const high = last.filter((q) => q.y < y + h * 0.2);
    const body = last.filter((q) => q.y > y + h * 0.4 && q.y < y + h * 0.8);
    if (high.length && body.length) expect(Math.max(...high.map((q) => q.alpha))).toBeLessThan(Math.max(...body.map((q) => q.alpha)));
  });

  it('puffs swell as they rise', () => {
    const p = new Plume(2, BOX, 'steam', 1, 0);
    const last = frames(p, 6).at(-1)!;
    const low = last.filter((q) => q.y + q.size / 2 > BOX[1] + BOX[3] * 0.75);
    const high = last.filter((q) => q.y + q.size / 2 < BOX[1] + BOX[3] * 0.4);
    expect(low.length && high.length).toBeTruthy();
    const avg = (a: { size: number }[]) => a.reduce((s, q) => s + q.size, 0) / a.length;
    expect(avg(high)).toBeGreaterThan(avg(low));
  });

  it('smoke is thinner and fainter than steam', () => {
    const steam = frames(new Plume(3, BOX, 'steam', 1, 0), 8).slice(-60).flat();
    const smoke = frames(new Plume(3, BOX, 'smoke', 1, 0), 8).slice(-60).flat();
    const avg = (a: { size: number }[]) => a.reduce((s, q) => s + q.size, 0) / a.length;
    expect(avg(smoke)).toBeLessThan(avg(steam));
    expect(Math.max(...smoke.map((q) => q.alpha))).toBeLessThan(Math.max(...steam.map((q) => q.alpha)));
  });

  it('more amount, more puffs; none at 0', () => {
    const count = (a: number) => frames(new Plume(4, BOX, 'steam', a, 0), 6).slice(-30).reduce((s, f) => s + f.length, 0);
    expect(count(2)).toBeGreaterThan(count(1));
    expect(count(0)).toBe(0);
  });

  it('lean carries the plume sideways as it rises', () => {
    const centre = (lean: number) => {
      const top = frames(new Plume(5, BOX, 'steam', 1, lean), 6).slice(-30).flat().filter((q) => q.y < BOX[1] + BOX[3] * 0.4);
      return top.reduce((s, q) => s + q.x + q.size / 2, 0) / top.length;
    };
    expect(centre(1)).toBeGreaterThan(centre(0) + 10);
    expect(centre(-1)).toBeLessThan(centre(0) - 10);
  });

  it('every puff sits on the art grid and uses one of the puff sizes', () => {
    for (const q of frames(new Plume(6, BOX, 'smoke', 2, 0.5), 5).flat()) {
      expect(q.x % PUFF_PX).toBe(0);
      expect(q.y % PUFF_PX).toBe(0);
      expect(PUFF_SIZES).toContain(q.size);
    }
  });

  it('repeats from the same seed', () => {
    expect(frames(new Plume(7, BOX, 'steam', 1, 0), 2)).toEqual(frames(new Plume(7, BOX, 'steam', 1, 0), 2));
  });

  it('puffSize snaps a radius to the nearest puff size, within the range', () => {
    expect(puffSize(0)).toBe(PUFF_SIZES[0]);
    expect(puffSize(1000)).toBe(PUFF_SIZES.at(-1));
    expect(PUFF_SIZES).toContain(puffSize(13));
  });

  it('puffPixels is a soft disc: opaque-ish centre, clear corners, a few alpha steps', () => {
    const cells = 8;
    const px = puffPixels(cells);
    expect(px.length).toBe(cells * cells * 4);
    const a = (x: number, y: number) => px[(y * cells + x) * 4 + 3];
    expect(a(cells / 2, cells / 2)).toBeGreaterThan(150);
    expect(a(0, 0)).toBe(0);
    const levels = new Set(Array.from({ length: cells * cells }, (_, i) => px[i * 4 + 3]));
    expect(levels.size).toBeLessThanOrEqual(5);
  });
});
