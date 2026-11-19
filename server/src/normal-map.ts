/**
 * A stage figure's normal map, made from its sprite alone (figure lighting spec 2026-11-16 §1).
 *
 * Height = a rounded dome over the silhouette (distance from the edge, eased so limbs read round and
 * the torso doesn't bulge past `round` px), smoothed by `smooth` px so anything narrow (a neck, an arm)
 * curves over instead of folding along the middle, plus a little of the blurred luminance (`detail`)
 * for folds and features. Normals come from the height's slope, averaged over each `px`-sized art
 * pixel so snapped art keeps hard pixels. Encoded OpenGL style: rgb = n × 0.5 + 0.5, x right, y up,
 * z out of the screen; alpha follows the sprite's.
 *
 * About half a second of work for a 1024×1536 sprite, so it yields to the event loop as it goes.
 */
import { PNG } from 'pngjs';

/** Bump when the output changes, so cached maps are made again. */
export const NORMAL_MAP_VERSION = 1;

export interface NormalMapOptions {
  /** The art's pixel size: 2 for snapped sprites, 1 otherwise. */
  px: 1 | 2;
  /** How far in the dome flattens, px. */
  round?: number;
  /** The dome's blur, px. */
  smooth?: number;
  /** How much luminance relief rides on the dome. */
  detail?: number;
  /** The luminance's blur, px. */
  blur?: number;
}

export const NORMAL_MAP_DEFAULTS = { round: 70, smooth: 12, detail: 6, blur: 3 } as const;

const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));
/** Rows between breaths in the long loops. */
const ROWS = 64;

/** A separable box blur, `passes` times (≈ gaussian), radius `r`. */
async function blur(a: Float32Array, W: number, H: number, r: number, passes = 3): Promise<Float32Array> {
  let cur = a;
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      if (y % ROWS === 0) await breathe();
      const row = y * W;
      let s = 0;
      for (let x = -r; x <= r; x++) s += cur[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = s / n;
        s += cur[row + Math.min(W - 1, x + r + 1)] - cur[row + Math.max(0, x - r)];
      }
    }
    const out = new Float32Array(W * H);
    for (let x = 0; x < W; x++) {
      if (x % ROWS === 0) await breathe();
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = s / n;
        s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    cur = out;
  }
  return cur;
}

export async function normalMap(rgba: Uint8Array, W: number, H: number, opts: NormalMapOptions): Promise<Uint8Array> {
  const { px: PX } = opts;
  const ROUND = opts.round ?? NORMAL_MAP_DEFAULTS.round;
  const SMOOTH = opts.smooth ?? NORMAL_MAP_DEFAULTS.smooth;
  const DETAIL = opts.detail ?? NORMAL_MAP_DEFAULTS.detail;
  const BLUR = opts.blur ?? NORMAL_MAP_DEFAULTS.blur;
  const N = W * H;
  const alpha = new Float32Array(N);
  const luma = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    alpha[i] = rgba[i * 4 + 3] / 255;
    luma[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  }

  // Chamfer distance (3-4) from the nearest transparent pixel.
  const INF = 1e9;
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = alpha[i] > 0.5 ? INF : 0;
  const d = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dist[y * W + x]);
  for (let y = 0; y < H; y++) {
    if (y % ROWS === 0) await breathe();
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (dist[i] !== 0) dist[i] = Math.min(dist[i], d(x - 1, y) + 3, d(x, y - 1) + 3, d(x - 1, y - 1) + 4, d(x + 1, y - 1) + 4);
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    if (y % ROWS === 0) await breathe();
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (dist[i] !== 0) dist[i] = Math.min(dist[i], d(x + 1, y) + 3, d(x, y + 1) + 3, d(x + 1, y + 1) + 4, d(x - 1, y + 1) + 4);
    }
  }

  // A quarter circle: steep at the edge, flat at ROUND px in; then smoothed, so the distance field's
  // crease along the middle of anything narrow rounds off.
  const dome = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (alpha[i] < 0.5) continue;
    const t = Math.min(1, dist[i] / 3 / ROUND);
    dome[i] = ROUND * Math.sqrt(1 - (1 - t) * (1 - t));
  }
  const round = SMOOTH > 0 ? await blur(dome, W, H, SMOOTH) : dome;
  const detail = await blur(luma, W, H, BLUR);
  const height = new Float32Array(N);
  for (let i = 0; i < N; i++) if (alpha[i] >= 0.5) height[i] = round[i] + DETAIL * detail[i];
  const h = await blur(height, W, H, 2, 2);

  const out = new Uint8Array(N * 4);
  for (let by = 0; by < H; by += PX) {
    if (by % ROWS === 0) await breathe();
    for (let bx = 0; bx < W; bx += PX) {
      let nx = 0;
      let ny = 0;
      let n = 0;
      let a = 0;
      let cells = 0;
      for (let y = by; y < Math.min(H, by + PX); y++)
        for (let x = bx; x < Math.min(W, bx + PX); x++) {
          const i = y * W + x;
          cells++;
          a += alpha[i];
          if (alpha[i] < 0.5) continue;
          nx -= (h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)]) / 2;
          // Image y runs down; the map's runs up.
          ny += (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) / 2;
          n++;
        }
      let px = [128, 128, 255];
      if (n > 0) {
        nx /= n;
        ny /= n;
        const len = Math.hypot(nx, ny, 1);
        px = [nx / len, ny / len, 1 / len].map((c) => Math.round(c * 127.5 + 127.5));
      }
      const A = Math.round((a / cells) * 255);
      for (let y = by; y < Math.min(H, by + PX); y++)
        for (let x = bx; x < Math.min(W, bx + PX); x++) out.set([px[0], px[1], px[2], A], (y * W + x) * 4);
    }
  }
  return out;
}

/** A PNG's normal map, as a PNG of the same size. */
export async function normalMapPng(png: Buffer, opts: NormalMapOptions): Promise<Buffer> {
  const img = PNG.sync.read(png);
  const out = new PNG({ width: img.width, height: img.height });
  out.data.set(await normalMap(img.data, img.width, img.height, opts));
  return PNG.sync.write(out);
}
