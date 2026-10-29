import type { Img } from './image';

/** Estimates depth for an image: one value per pixel at the image's resolution, 0 = near … 1 = far. */
export type DepthEstimator = (img: Img) => Promise<Float32Array>;

export const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';

/** Depth Anything predicts relative *inverse* depth (larger = nearer): normalize by min/max and invert. */
export function normalizeInverseDepth(raw: Float32Array): Float32Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of raw) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const out = new Float32Array(raw.length);
  const span = hi - lo;
  for (let i = 0; i < raw.length; i++) out[i] = span > 0 ? 1 - (raw[i] - lo) / span : 0.5;
  return out;
}

/** Bilinear resize of a single-channel float map. */
export function resizeFloat(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, Math.min(sh - 1, ((y + 0.5) * sh) / dh - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, Math.min(sw - 1, ((x + 0.5) * sw) / dw - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const top = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const bot = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * dw + x] = top * (1 - ty) + bot * ty;
    }
  }
  return out;
}

/** The real estimator: Depth Anything V2 (small) via transformers.js, ONNX on CPU. Downloads once, then cached. */
export function transformersDepth(): DepthEstimator {
  let estimator: ((input: unknown) => Promise<unknown>) | undefined;
  return async (img) => {
    try {
      const tf = await import('@huggingface/transformers');
      estimator ??= (await tf.pipeline('depth-estimation', DEPTH_MODEL, { dtype: 'fp32' })) as unknown as (
        input: unknown,
      ) => Promise<unknown>;
      const rgb = new Uint8ClampedArray(img.w * img.h * 3);
      for (let i = 0, j = 0; i < img.data.length; i += 4, j += 3) rgb.set(img.data.subarray(i, i + 3), j);
      const result = (await estimator(new tf.RawImage(rgb, img.w, img.h, 3))) as {
        predicted_depth: { data: Float32Array; dims: number[] };
      };
      const dims = result.predicted_depth.dims;
      const [ph, pw] = dims.slice(-2);
      const resized = resizeFloat(Float32Array.from(result.predicted_depth.data), pw, ph, img.w, img.h);
      return normalizeInverseDepth(resized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`depth model unavailable: ${msg} — check the network and re-run; it is cached after the first download`);
    }
  };
}

/** 8-bit grey preview of a depth map (white = near). */
export function depthToPng(d: Float32Array, w: number, h: number): Img {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i++) {
    const v = Math.round((1 - d[i]) * 255);
    data.set([v, v, v, 255], i * 4);
  }
  return { w, h, data };
}
