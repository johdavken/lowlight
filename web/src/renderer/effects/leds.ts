/**
 * LED blink: the separate glowing dots inside a box, each on its own steady rhythm. Pure; the
 * display lives with the effects layer.
 */

type Rect4 = readonly [number, number, number, number];

export interface Dot {
  /** The dot's first pixel (its rhythm is seeded from it). */
  x: number;
  y: number;
  /** Indexes into the full map. */
  pixels: number[];
}

/** 8-connected islands of `alpha > 0` inside `rect`, from a map `w` px wide. */
export function findDots(alpha: Uint8Array, w: number, rect: Rect4): Dot[] {
  const h = Math.floor(alpha.length / w);
  const [rx, ry, rw, rh] = rect;
  const x0 = Math.max(0, Math.floor(rx)), y0 = Math.max(0, Math.floor(ry));
  const x1 = Math.min(w, Math.ceil(rx + rw)), y1 = Math.min(h, Math.ceil(ry + rh));
  const seen = new Uint8Array(alpha.length);
  const dots: Dot[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const start = y * w + x;
      if (!alpha[start] || seen[start]) continue;
      seen[start] = 1;
      const pixels: number[] = [];
      const stack = [start];
      while (stack.length > 0) {
        const p = stack.pop()!;
        pixels.push(p);
        const px = p % w, py = (p - px) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if ((dx || dy) && nx >= x0 && ny >= y0 && nx < x1 && ny < y1) {
              const n = ny * w + nx;
              if (alpha[n] && !seen[n]) {
                seen[n] = 1;
                stack.push(n);
              }
            }
          }
        }
      }
      dots.push({ x, y, pixels });
    }
  }
  return dots;
}

/** A stable 0..1 hash of a position and a salt. */
function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2246822519, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface DotPhase {
  period: number;
  duty: number;
  offset: number;
}

/** A dot's rhythm: period 0.6–3 s (÷ rate), on 20–80 % of it, with its own offset. */
export function dotPhase(x: number, y: number, rate: number): DotPhase {
  const period = (0.6 + 2.4 * hash(x, y, 1)) / rate;
  return { period, duty: 0.2 + 0.6 * hash(x, y, 2), offset: hash(x, y, 3) * period };
}

const FADE = 0.06;

/** 0..1 at time `t`, with 60 ms fades; steady on under reduced motion. */
export function dotAlpha(t: number, p: DotPhase, reduced: boolean): number {
  if (reduced) return 1;
  const phase = (((t + p.offset) % p.period) + p.period) % p.period;
  const onFor = p.duty * p.period;
  return phase < onFor ? Math.min(1, phase / FADE) : Math.max(0, 1 - (phase - onFor) / FADE);
}
