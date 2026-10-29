import { describe, expect, it } from 'vitest';
import type { LightDef, Weather } from '../../shared/types';
import { RAIN_BASE_COLOR, streakSlope, WeatherSystem, type Particle } from '../src/renderer/weather';

const W = 480;
const H = 270;
const DT = 1 / 60;

function light(pos: [number, number], color: string, radius = 120, intensity = 1): LightDef {
  return { id: `l${pos[0]}_${pos[1]}`, label: 'test light', pos, color, intensity, radius, flicker: 0 };
}

/** Steps the system for `seconds` and returns the last frame's particles. */
function run(ws: WeatherSystem, seconds: number, kind: Weather, level: number, lights: LightDef[] = []): Particle[] {
  let out: Particle[] = [];
  for (let t = 0; t < seconds; t += DT) out = ws.step(DT, kind, level, lights);
  return out;
}

/** Mean downward speed (px/s) over 1 s, tracking each particle by index and skipping respawns. */
function meanFallSpeed(kind: Weather): number {
  const ws = new WeatherSystem(W, H, 11);
  let prev = run(ws, 4, kind, 1).map((p) => p.y);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const cur = ws.step(DT, kind, 1, []);
    for (let j = 0; j < Math.min(prev.length, cur.length); j++) {
      const dy = cur[j].y - prev[j];
      if (dy >= 0 && dy < H / 2) {
        sum += dy / DT;
        n++;
      }
    }
    prev = cur.map((p) => p.y);
  }
  return sum / n;
}

describe('WeatherSystem', () => {
  it('returns no particles for none', () => {
    const ws = new WeatherSystem(W, H, 1);
    expect(run(ws, 2, 'none', 1)).toHaveLength(0);
  });

  it('settles to the max count at level 1 and about half at level 0.5', () => {
    expect(run(new WeatherSystem(W, H, 2), 5, 'rain', 1)).toHaveLength(400);
    const half = run(new WeatherSystem(W, H, 3), 5, 'rain', 0.5).length;
    expect(half).toBeGreaterThanOrEqual(180);
    expect(half).toBeLessThanOrEqual(220);
  });

  it('settles to each kind max count', () => {
    expect(run(new WeatherSystem(W, H, 4), 5, 'snow', 1)).toHaveLength(250);
    expect(run(new WeatherSystem(W, H, 4), 5, 'ash', 1)).toHaveLength(180);
    expect(run(new WeatherSystem(W, H, 4), 5, 'dust', 1)).toHaveLength(120);
  });

  it('thins out when the level drops', () => {
    const ws = new WeatherSystem(W, H, 5);
    run(ws, 5, 'rain', 1);
    const n = run(ws, 5, 'rain', 0.25).length;
    expect(n).toBeGreaterThanOrEqual(90);
    expect(n).toBeLessThanOrEqual(110);
  });

  // Checked with plain comparisons into a `violations` array rather than one `expect()` per
  // particle per frame (4 kinds × 360 frames × up to 400 particles — hundreds of thousands of
  // calls): that drove this test past 3.4 s, close enough to Vitest's 5 s default timeout that
  // it flaked under CPU contention during a full suite run. One `expect` at the end keeps the
  // same coverage at a small fraction of the cost.
  it('keeps every particle inside the frame plus an 8 px margin', () => {
    const violations: Array<{ kind: string; x: number; y: number }> = [];
    for (const kind of ['rain', 'snow', 'ash', 'dust'] as const) {
      const ws = new WeatherSystem(W, H, 6);
      for (let t = 0; t < 6; t += DT) {
        for (const p of ws.step(DT, kind, 1, [])) {
          if (p.x < -8 || p.x > W + 8 || p.y < -8 || p.y > H + 8) {
            violations.push({ kind, x: p.x, y: p.y });
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('tints rain near a light toward its color and leaves distant rain at the base color', () => {
    const lights = [light([100, 135], '#ff0000', 60)];
    const ps = run(new WeatherSystem(W, H, 7), 3, 'rain', 1, lights);
    const near = ps.filter((p) => Math.hypot(p.x - 100, p.y - 135) < 30);
    const far = ps.filter((p) => Math.hypot(p.x - 100, p.y - 135) > 80);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    for (const p of near) {
      expect(p.color).not.toBe(RAIN_BASE_COLOR);
      expect((p.color >> 16) & 0xff).toBeGreaterThan((RAIN_BASE_COLOR >> 16) & 0xff);
    }
    for (const p of far) expect(p.color).toBe(RAIN_BASE_COLOR);
    expect(RAIN_BASE_COLOR).toBe(0x96b4ff);
  });

  it('makes snow and ash fall slower than rain', () => {
    const rain = meanFallSpeed('rain');
    expect(meanFallSpeed('snow')).toBeLessThan(rain);
    expect(meanFallSpeed('ash')).toBeLessThan(rain);
  });

  it('keeps every particle and its whole streak inside a weather region', () => {
    const region: [number, number, number, number] = [300, 40, 120, 90];
    const [rx, ry, rw, rh] = region;
    for (const kind of ['rain', 'snow', 'ash', 'dust'] as const) {
      const ws = new WeatherSystem(W, H, 12);
      ws.setRegion(region);
      let seen = 0;
      for (let t = 0; t < 4; t += DT) {
        for (const p of ws.step(DT, kind, 1, [])) {
          seen++;
          // Streaks (len > 1) run from the head back along the wind; dots are a single pixel.
          const points = [[p.x, p.y]];
          if (p.len > 1) points.push([p.x - streakSlope(kind) * p.len, p.y - p.len]);
          else points.push([p.x + 1, p.y + 1]);
          for (const [x, y] of points) {
            expect(x).toBeGreaterThanOrEqual(rx - 1e-9);
            expect(x).toBeLessThanOrEqual(rx + rw + 1e-9);
            expect(y).toBeGreaterThanOrEqual(ry - 1e-9);
            expect(y).toBeLessThanOrEqual(ry + rh + 1e-9);
          }
        }
      }
      expect(seen).toBeGreaterThan(0);
    }
  });

  it('scales the particle count to the region area', () => {
    const ws = new WeatherSystem(W, H, 13);
    ws.setRegion([0, 0, W / 2, H]);
    const n = run(ws, 5, 'rain', 1).length;
    expect(n).toBeGreaterThanOrEqual(180);
    expect(n).toBeLessThanOrEqual(220);
  });

  it('clearing the region restores the whole frame', () => {
    const ws = new WeatherSystem(W, H, 14);
    ws.setRegion([0, 0, 50, 50]);
    run(ws, 2, 'rain', 1);
    ws.setRegion(null);
    expect(run(ws, 5, 'rain', 1)).toHaveLength(400);
  });

  it('is deterministic for a given seed', () => {
    const a = run(new WeatherSystem(W, H, 9), 1, 'snow', 1);
    const b = run(new WeatherSystem(W, H, 9), 1, 'snow', 1);
    expect(a).toEqual(b);
  });
});
