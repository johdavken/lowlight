import { describe, expect, it } from 'vitest';
import { rectToShape } from '../../shared/weather-area';
import { beadTarget, Glass, GLASS_PX, glassAmount, glassAreaPx, nextWetness, runnerRate } from '../src/renderer/effects/glass';

const WINDOW = [rectToShape([100, 100, 300, 200])];
const FRAME: [number, number] = [1000, 600];

/** Steps the glass `secs` seconds at 30 fps; returns the last frame. */
function run(g: Glass, secs: number, weather: 'rain' | 'snow' | 'none', level: number, reduced = false) {
  let out = g.step(0, weather, level, reduced);
  for (let t = 0; t < secs; t += 1 / 30) out = g.step(1 / 30, weather, level, reduced);
  return out;
}

describe('glass', () => {
  it('glassAmount reads 0–3, 1 by default', () => {
    expect(glassAmount(undefined)).toBe(1);
    expect(glassAmount(2)).toBe(2);
    expect(glassAmount(9)).toBe(3);
    expect(glassAmount(-1)).toBe(0);
  });

  it('glassAreaPx is the shapes\' area, or the whole frame without any', () => {
    expect(glassAreaPx(WINDOW, FRAME)).toBe(60000);
    expect(glassAreaPx(undefined, FRAME)).toBe(600000);
  });

  it('beads scale with the glass, the amount and the wetness, and are capped', () => {
    expect(beadTarget(60000, 1, 1)).toBeGreaterThan(beadTarget(60000, 1, 0.5));
    expect(beadTarget(60000, 2, 1)).toBeGreaterThan(beadTarget(60000, 1, 1));
    expect(beadTarget(60000, 1, 0)).toBe(0);
    expect(beadTarget(10_000_000, 3, 1)).toBeLessThanOrEqual(500);
  });

  it('runners come only in rain, faster in harder rain', () => {
    expect(runnerRate(60000, 1, 'snow', 1)).toBe(0);
    expect(runnerRate(60000, 1, 'rain', 0)).toBe(0);
    expect(runnerRate(60000, 1, 'rain', 1)).toBeGreaterThan(runnerRate(60000, 1, 'rain', 0.3));
  });

  it('wetness rises toward the rain level in seconds and dries slowly after', () => {
    let w = 0;
    for (let i = 0; i < 6 * 30; i++) w = nextWetness(w, 1 / 30, 'rain', 0.8);
    expect(w).toBeCloseTo(0.8, 2);
    for (let i = 0; i < 10 * 30; i++) w = nextWetness(w, 1 / 30, 'none', 0);
    expect(w).toBeGreaterThan(0.3);
    for (let i = 0; i < 25 * 30; i++) w = nextWetness(w, 1 / 30, 'none', 0);
    expect(w).toBe(0);
  });

  it('a room entered in rain is already wet', () => {
    const g = new Glass(1, WINDOW, FRAME, 1);
    const first = g.step(0, 'rain', 1, false);
    expect(first.beads.length).toBe(beadTarget(60000, 1, 1));
  });

  it('dry glass in snow or no weather draws nothing', () => {
    expect(run(new Glass(1, WINDOW, FRAME, 1), 3, 'snow', 1).beads).toHaveLength(0);
    expect(run(new Glass(1, WINDOW, FRAME, 1), 3, 'none', 0).beads).toHaveLength(0);
  });

  it('every bead sits on the glass, on the art\'s pixel grid', () => {
    const notched = [[[100, 100], [400, 100], [400, 300], [300, 300], [300, 200], [200, 200], [200, 300], [100, 300]] as [number, number][]];
    const out = run(new Glass(3, notched, FRAME, 2), 4, 'rain', 1);
    expect(out.beads.length).toBeGreaterThan(50);
    for (const b of out.beads) {
      expect(b.x % GLASS_PX).toBe(0);
      expect(b.y % GLASS_PX).toBe(0);
      const inNotch = b.x > 200 && b.x < 300 && b.y > 200;
      expect(inNotch).toBe(false);
      expect(b.x >= 100 && b.x < 400 && b.y >= 100 && b.y < 300).toBe(true);
    }
  });

  it('runners run down and leave a fading trail', () => {
    const g = new Glass(5, WINDOW, FRAME, 2);
    let sawRunner = false, sawTrail = false;
    const ys = new Map<number, number>();
    g.step(0, 'rain', 1, false);
    for (let i = 0; i < 20 * 30; i++) {
      const out = g.step(1 / 30, 'rain', 1, false);
      if (out.runners.length) sawRunner = true;
      if (out.trail.length) sawTrail = true;
      for (const t of out.trail) expect(t.alpha).toBeLessThanOrEqual(0.35);
      out.runners.forEach((r) => {
        const prev = ys.get(r.id);
        if (prev !== undefined) expect(r.y).toBeGreaterThanOrEqual(prev);
        ys.set(r.id, r.y);
      });
    }
    expect(sawRunner).toBe(true);
    expect(sawTrail).toBe(true);
  });

  it('beads linger after the rain stops, then dry away', () => {
    const g = new Glass(2, WINDOW, FRAME, 1);
    const wet = run(g, 3, 'rain', 1).beads.length;
    const soon = run(g, 5, 'none', 0).beads.length;
    expect(soon).toBeGreaterThan(wet * 0.5);
    expect(run(g, 40, 'none', 0).beads).toHaveLength(0);
  });

  it('with reduced motion the beads stay but nothing runs', () => {
    const g = new Glass(4, WINDOW, FRAME, 3);
    const out = run(g, 10, 'rain', 1, true);
    expect(out.beads.length).toBeGreaterThan(0);
    expect(out.runners).toHaveLength(0);
    expect(out.trail).toHaveLength(0);
  });

  it('repeats from the same seed', () => {
    const a = run(new Glass(9, WINDOW, FRAME, 1), 2, 'rain', 1);
    const b = run(new Glass(9, WINDOW, FRAME, 1), 2, 'rain', 1);
    expect(a).toEqual(b);
  });
});
