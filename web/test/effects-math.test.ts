import { describe, expect, it } from 'vitest';
import { flashAt, seededRng, strikeInterval, strikeShape, StrikeScheduler } from '../src/renderer/effects/lightning';
import { crt, ScreenPower, snow, snowPixels, STATIC_FRAMES } from '../src/renderer/effects/screen';
import { dotAlpha, dotPhase, findDots } from '../src/renderer/effects/leds';
import { dustAmount, dustCount, dustFade, dustSpread, Motes } from '../src/renderer/effects/dust';

describe('lightning', () => {
  /** Seconds between strikes over a long seeded run at a steady rain level. */
  function intervals(level: number, strikes: number): number[] {
    const s = new StrikeScheduler();
    const rng = seededRng(7);
    const out: number[] = [];
    let t = 0, last = 0;
    while (out.length < strikes) {
      t += 0.25;
      if (s.update(0.25, 'rain', level, rng)) {
        out.push(t - last);
        last = t;
      }
    }
    return out.slice(1); // the first only measures from arming
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('no strike below 0.7 or in other weather', () => {
    for (const [w, level] of [['rain', 0.69], ['snow', 1]] as const) {
      const s = new StrikeScheduler();
      const rng = seededRng(1);
      for (let i = 0; i < 2400; i++) expect(s.update(0.25, w, level, rng)).toBeNull();
    }
  });

  it('strikes about every 30 s at 0.7 and every 8 s at 1.0', () => {
    expect(mean(intervals(0.7, 2000))).toBeGreaterThan(28);
    expect(mean(intervals(0.7, 2000))).toBeLessThan(32);
    expect(mean(intervals(1, 2000))).toBeGreaterThan(7.4);
    expect(mean(intervals(1, 2000))).toBeLessThan(8.6);
  });

  it('intervals jitter within ±40 %', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 500; i++) {
      const v = strikeInterval(1, rng);
      expect(v).toBeGreaterThanOrEqual(8 * 0.6);
      expect(v).toBeLessThanOrEqual(8 * 1.4);
    }
  });

  it('a flash starts at its peak and is dark by its end', () => {
    const s = strikeShape(0, 1);
    expect(flashAt(0, s)).toBeCloseTo(1);
    expect(flashAt(s.duration - 1e-6, s)).toBeCloseTo(0, 3);
    expect(flashAt(s.duration, s)).toBe(0);
    expect(flashAt(-0.1, s)).toBe(0);
  });

  it('a near strike is bright, triple and quick to thunder; a far one dim, single and late', () => {
    expect(strikeShape(0, 1)).toMatchObject({ peak: 1, flickers: 3, delay: 1, duration: 0.5 });
    const far = strikeShape(1, 1);
    expect(far.peak).toBeCloseTo(0.4);
    expect(far).toMatchObject({ flickers: 1, delay: 4 });
    expect(far.duration).toBeCloseTo(0.15);
    expect(strikeShape(0, 0.5).peak).toBeCloseTo(0.5);
    expect(strikeShape(0.5, 1).lift).toBeCloseTo(0.15 * strikeShape(0.5, 1).peak);
  });

  it('crossing 0.7 never strikes at once: the first comes an interval later (Review Focus 3)', () => {
    const s = new StrikeScheduler();
    const rng = seededRng(5);
    s.update(0.25, 'rain', 0.69, rng);
    let t = 0;
    let first: number | null = null;
    while (first === null && t < 120) {
      t += 0.05;
      if (s.update(0.05, 'rain', 0.75, rng)) first = t;
    }
    expect(first).not.toBeNull();
    const meanAt075 = 30 - ((0.75 - 0.7) / 0.3) * 22;
    expect(first!).toBeGreaterThanOrEqual(meanAt075 * 0.6 - 0.05);
  });

  it('a huge dt (a hidden tab resuming) gives at most one strike (Review Focus 4)', () => {
    const s = new StrikeScheduler();
    const rng = seededRng(9);
    s.update(0.25, 'rain', 1, rng);
    let strikes = 0;
    if (s.update(120, 'rain', 1, rng)) strikes++;
    expect(strikes).toBeLessThanOrEqual(1);
  });
});

describe('screen power', () => {
  it('powers off over 0.4 s once its light reaches 0', () => {
    const p = new ScreenPower();
    p.update(0.1, 0.4);
    let offs = 0;
    let wasOn = true;
    let last = p.update(0, 0);
    for (let t = 0; t < 1; t += 0.05) {
      last = p.update(0.05, 0);
      if (wasOn && !last.on) offs++;
      wasOn = last.on;
    }
    expect(offs).toBe(1);
    expect(last).toMatchObject({ on: false, brightness: 0 });
    expect(last.scaleY).toBeLessThan(0.05);
    expect(last.scaleX).toBeLessThan(0.05);
  });

  it('flicker near zero never powers it off (Review Focus 2)', () => {
    const p = new ScreenPower();
    for (let i = 0; i < 200; i++) expect(p.update(0.05, i % 2 ? 0.02 : 0.03).on).toBe(true);
  });

  it('warms up to full brightness over 0.6 s', () => {
    const p = new ScreenPower();
    p.update(0.1, 0);
    let s = p.update(0.3, 0.4);
    expect(s.brightness).toBeGreaterThan(0.3);
    expect(s.brightness).toBeLessThan(0.7);
    s = p.update(0.35, 0.4);
    expect(s).toMatchObject({ on: true, brightness: 1, scaleX: 1, scaleY: 1 });
  });

  it('reduced motion switches instantly', () => {
    const p = new ScreenPower(true);
    p.update(0.1, 0.4);
    expect(p.update(0.01, 0)).toMatchObject({ on: false, brightness: 0 });
    expect(p.update(0.01, 0.4)).toMatchObject({ on: true, brightness: 1 });
  });

  it('crt breathes within ±4 % and rolls a refresh bar at least every 12 s; still under reduced motion', () => {
    let bars = 0;
    let lastBar = 0;
    let longestGap = 0;
    for (let t = 0; t < 60; t += 0.05) {
      const c = crt(t, 0.37, false);
      expect(c.brightness).toBeGreaterThanOrEqual(0.96);
      expect(c.brightness).toBeLessThanOrEqual(1.04);
      if (c.bar !== null) {
        expect(c.bar).toBeGreaterThanOrEqual(0);
        expect(c.bar).toBeLessThanOrEqual(1);
        if (t - lastBar > 1) bars++;
        longestGap = Math.max(longestGap, t - lastBar);
        lastBar = t;
      }
    }
    expect(bars).toBeGreaterThanOrEqual(4);
    expect(longestGap).toBeLessThanOrEqual(12.1);
    expect(crt(12.3, 0.37, true)).toEqual({ brightness: 1, bar: null });
  });
});

describe('leds', () => {
  /** A 20×20 alpha map with two 2×2 dots and one dot outside the box. */
  function map(): Uint8Array {
    const a = new Uint8Array(400);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3], [10, 10], [11, 10], [10, 11], [11, 11], [18, 18]]) a[y * 20 + x] = 255;
    return a;
  }

  it('finds each separate glowing dot inside the box', () => {
    const dots = findDots(map(), 20, [0, 0, 15, 15]);
    expect(dots).toHaveLength(2);
    expect(dots.map((d) => d.pixels.length)).toEqual([4, 4]);
  });

  it('a dot keeps its rhythm, 0.6–3 s at rate 1, twice as fast at rate 2', () => {
    const a = dotPhase(10, 10, 1);
    expect(dotPhase(10, 10, 1)).toEqual(a);
    expect(a.period).toBeGreaterThanOrEqual(0.6);
    expect(a.period).toBeLessThanOrEqual(3);
    expect(a.duty).toBeGreaterThanOrEqual(0.2);
    expect(a.duty).toBeLessThanOrEqual(0.8);
    expect(dotPhase(10, 10, 2).period).toBeCloseTo(a.period / 2);
  });

  it('blinks between 0 and 1 with soft edges; steady under reduced motion', () => {
    const p = dotPhase(4, 7, 1);
    const seen = new Set<number>();
    for (let t = 0; t < 6; t += 0.01) seen.add(Math.round(dotAlpha(t, p, false) * 10));
    expect(seen.has(0)).toBe(true);
    expect(seen.has(10)).toBe(true);
    expect([...seen].some((v) => v > 0 && v < 10)).toBe(true);
    expect(dotAlpha(1.234, p, true)).toBe(1);
  });
});

describe('dust', () => {
  it('30 motes at full brightness, fewer as it dims, none off or under reduced motion', () => {
    expect(dustCount(1, false)).toBe(30);
    expect(dustCount(0.5, false)).toBe(15);
    expect(dustCount(0, false)).toBe(0);
    expect(dustCount(1, true)).toBe(0);
  });

  it('the amount scales the count: true is 100%, 0 is off, 300% triples it', () => {
    expect(dustAmount(true)).toBe(1);
    expect(dustAmount(undefined)).toBe(0);
    expect(dustAmount(false)).toBe(0);
    expect(dustAmount(2.5)).toBe(2.5);
    expect(dustAmount(9)).toBe(3);
    expect(dustCount(1, false, 3)).toBe(90);
    expect(dustCount(0.5, false, 0.5)).toBe(8);
    expect(dustCount(1, false, 0)).toBe(0);
    expect(dustCount(1, true, 3)).toBe(0);
  });

  it('more dust fills more of the pool: 60% at 100%, 80% at 300%', () => {
    expect(dustSpread(1)).toBeCloseTo(0.6);
    expect(dustSpread(3)).toBeCloseTo(0.8);
    expect(dustSpread(0.25)).toBeCloseTo(0.525);
  });

  it('motes are 2–4 px, brightest at the centre', () => {
    const m = new Motes(5);
    const views = m.step(0, [0, 0], 200, 200);
    for (const v of views) {
      expect(v.size).toBeGreaterThanOrEqual(2);
      expect(v.size).toBeLessThanOrEqual(4);
      expect(v.alpha).toBeLessThanOrEqual(0.9);
    }
    expect(new Set(views.map((v) => v.size)).size).toBe(3);
    expect(Math.max(...views.map((v) => v.alpha))).toBeGreaterThan(0.75);
  });

  it('motes fade with the light, gently: a lamp at a quarter still shows half', () => {
    expect(dustFade(1)).toBe(1);
    expect(dustFade(0.25)).toBeCloseTo(0.5);
    expect(dustFade(0)).toBe(0);
  });

  it('motes stay in the pool and drift at 3–8 px/s', () => {
    const m = new Motes(11);
    let prev = m.step(0.1, [500, 300], 200, 30);
    expect(prev).toHaveLength(30);
    for (let i = 0; i < 100; i++) {
      const next = m.step(0.1, [500, 300], 200, 30);
      for (const p of next) expect(Math.hypot(p.x - 500, p.y - 300)).toBeLessThanOrEqual(200);
      for (let k = 0; k < next.length; k++) {
        const moved = Math.hypot(next[k].x - prev[k].x, next[k].y - prev[k].y) / 0.1;
        if (moved < 100) {
          expect(moved).toBeGreaterThanOrEqual(2.9);
          expect(moved).toBeLessThanOrEqual(8.1);
        }
      }
      prev = next;
    }
    expect(m.step(0.1, [500, 300], 200, 10)).toHaveLength(10);
  });
});

describe('screen static', () => {
  it('flips frames at 15 fps, never the same frame twice in a row', () => {
    let prev = -1, flips = 0;
    for (let i = 0; i < 300; i++) {
      const s = snow(i / 60, 0.42, false);
      expect(s.frame).toBeGreaterThanOrEqual(0);
      expect(s.frame).toBeLessThan(STATIC_FRAMES);
      expect(s.ox).toBeGreaterThanOrEqual(0);
      expect(s.ox).toBeLessThan(1);
      if (s.frame !== prev) flips++;
      prev = s.frame;
    }
    expect(flips).toBe(75); // 5 s × 15 fps
  });

  it('rolls a band down once per 4–9 s period, for 1.2 s', () => {
    let running = 0;
    for (let t = 0; t < 90; t += 0.05) {
      const b = snow(t, 0.42, false).band;
      if (b !== null) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(1);
        running += 0.05;
      }
    }
    // 90 s holds 10–22 periods, 1.2 s each.
    expect(running).toBeGreaterThan(10 * 1.2 - 1);
    expect(running).toBeLessThan(23 * 1.2);
  });

  it('reduced motion: one still frame, no band', () => {
    for (const t of [0, 1.3, 7.7]) expect(snow(t, 0.42, true)).toEqual({ frame: 0, ox: 0, oy: 0, band: null });
  });

  it('noise pixels are opaque greys that vary', () => {
    const px = snowPixels(4, 3, seededRng(3));
    expect(px).toHaveLength(4 * 3 * 4);
    const greys = new Set<number>();
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i]).toBe(px[i + 1]);
      expect(px[i]).toBe(px[i + 2]);
      expect(px[i + 3]).toBe(255);
      greys.add(px[i]);
    }
    expect(greys.size).toBeGreaterThan(4);
  });
});
