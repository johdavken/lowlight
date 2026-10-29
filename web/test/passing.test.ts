import { describe, expect, it } from 'vitest';
import { passEvery, Passing, passStrength, type PassDef, type PassLight } from '../src/renderer/effects/passing';

const CAR: PassDef = { rect: [200, 300, 400, 120] };

/** Runs `secs` at 30 fps; returns each frame's light (or null). */
function run(p: Passing, secs: number, reduced = false) {
  const out: (PassLight | null)[] = [];
  for (let t = 0; t < secs; t += 1 / 30) out.push(p.step(1 / 30, reduced));
  return out;
}

describe('passing light', () => {
  it('passEvery reads 5–300 s, 25 by default; passStrength 0–1, 1 by default', () => {
    expect(passEvery(undefined)).toBe(25);
    expect(passEvery(1)).toBe(5);
    expect(passEvery(900)).toBe(300);
    expect(passStrength(undefined)).toBe(1);
    expect(passStrength(2)).toBe(1);
    expect(passStrength(-1)).toBe(0);
  });

  it('nothing passes on entering the room; passes come about every `every` seconds', () => {
    const p = new Passing(1, [{ ...CAR, every: 10 }]);
    const frames = run(p, 200);
    expect(frames.slice(0, 30).every((l) => l === null)).toBe(true);
    let starts = 0;
    frames.forEach((l, i) => {
      if (l && !frames[i - 1]) starts++;
    });
    expect(starts).toBeGreaterThanOrEqual(12);
    expect(starts).toBeLessThanOrEqual(30);
  });

  it('a car slides along the middle of its box, end to end, fading in and out', () => {
    const p = new Passing(2, [{ ...CAR, every: 5 }]);
    const frames = run(p, 60);
    const start = frames.findIndex((l) => l !== null);
    const end = frames.indexOf(null, start);
    const pass = frames.slice(start, end).map((l) => l!);
    expect(pass.length).toBeGreaterThan(30);
    for (const l of pass) {
      expect(l.pos[1]).toBe(360);
      expect(l.pos[0]).toBeGreaterThanOrEqual(200);
      expect(l.pos[0]).toBeLessThanOrEqual(600);
      expect(l.color).toBe(pass[0].color);
    }
    const xs = pass.map((l) => l.pos[0]);
    const rising = xs[xs.length - 1] > xs[0];
    xs.slice(1).forEach((x, i) => (rising ? expect(x).toBeGreaterThanOrEqual(xs[i]) : expect(x).toBeLessThanOrEqual(xs[i])));
    const mid = pass[Math.floor(pass.length / 2)].intensity;
    expect(pass[0].intensity).toBeLessThan(mid);
    expect(pass[pass.length - 1].intensity).toBeLessThan(mid);
  });

  it('both directions happen', () => {
    const p = new Passing(3, [{ ...CAR, every: 5 }]);
    const frames = run(p, 300);
    const dirs = new Set<number>();
    frames.forEach((l, i) => {
      const next = frames[i + 1];
      if (l && next) dirs.add(Math.sign(next.pos[0] - l.pos[0]));
    });
    expect(dirs.has(1) && dirs.has(-1)).toBe(true);
  });

  it('police alternate red and blue as they pass; a drone is cyan and drifts up and down', () => {
    const police = run(new Passing(4, [{ ...CAR, every: 5, source: 'police' }]), 30).filter((l) => l !== null);
    expect(new Set(police.map((l) => l!.color)).size).toBe(2);
    const drone = run(new Passing(5, [{ ...CAR, every: 5, source: 'drone' }]), 40).filter((l) => l !== null);
    expect(new Set(drone.map((l) => l!.color))).toEqual(new Set([drone[0]!.color]));
    expect(new Set(drone.map((l) => l!.pos[1])).size).toBeGreaterThan(1);
  });

  it('strength scales the light; 0 never lights', () => {
    const peak = (strength: number) => Math.max(...run(new Passing(6, [{ ...CAR, every: 5, strength }]), 30).map((l) => l?.intensity ?? 0));
    expect(peak(0.5)).toBeCloseTo(peak(1) / 2, 5);
    expect(peak(0)).toBe(0);
  });

  it('only one passes at a time, however many paths a room has', () => {
    const p = new Passing(7, [{ ...CAR, every: 5 }, { rect: [700, 100, 300, 80], every: 5 }, { rect: [0, 0, 100, 100], every: 5 }]);
    const lights = run(p, 120);
    expect(lights.filter((l) => l !== null).length).toBeGreaterThan(0);
    // step returns a single light or null by construction; every path gets its turn.
    const ys = new Set(lights.filter((l) => l !== null).map((l) => l!.pos[1]));
    expect(ys.size).toBe(3);
  });

  it('reduced motion: nothing passes', () => {
    expect(run(new Passing(8, [{ ...CAR, every: 5 }]), 60, true).every((l) => l === null)).toBe(true);
  });

  it('repeats from the same seed', () => {
    expect(run(new Passing(9, [{ ...CAR, every: 5 }]), 30)).toEqual(run(new Passing(9, [{ ...CAR, every: 5 }]), 30));
  });
});
