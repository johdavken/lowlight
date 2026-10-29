import { CAMERA_MAX_X, CAMERA_MAX_Y } from '../../web/src/renderer/camera';
import type { Img } from './image';

/**
 * How far (band px) a nearer layer at parallax `pFront` can slide past a layer at `pBack`,
 * horizontally and vertically, at maximum camera travel.
 */
export function revealPx(pFront: number, pBack: number, s: number): { rx: number; ry: number } {
  const dp = Math.max(0, pFront - pBack);
  return { rx: Math.ceil(Math.ceil(CAMERA_MAX_X * dp) * s), ry: Math.ceil(Math.ceil(CAMERA_MAX_Y * dp) * s) };
}

/** Box-dilates a 0/1 mask by (rx, ry), separably. */
function dilate(mask: Uint8Array, w: number, h: number, rx: number, ry: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    let run = -1;
    // forward/backward passes mark everything within rx of a set pixel
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) run = x;
      if (run >= 0 && x - run <= rx) tmp[y * w + x] = 1;
    }
    run = -1;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) run = x;
      if (run >= 0 && run - x <= rx) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    let run = -1;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) run = y;
      if (run >= 0 && y - run <= ry) out[y * w + x] = 1;
    }
    run = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) run = y;
      if (run >= 0 && run - y <= ry) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * Fills the parts of a rear layer that parallax can reveal from behind nearer layers, by
 * breadth-first edge extension (each target pixel takes the average of its already-filled
 * 8-neighbours). Targets are the pixels hidden under the nearer layers within (rx, ry) of their edge.
 * With `opaqueAll` (the back layer) every remaining pixel then gets one flat average color.
 */
export function fillReveal(layer: Img, nearerMask: Uint8Array, rx: number, ry: number, opaqueAll: boolean): Img {
  const { w, h } = layer;
  const out: Img = { w, h, data: new Uint8ClampedArray(layer.data) };
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < filled.length; i++) filled[i] = out.data[i * 4 + 3] === 255 ? 1 : 0;

  // Targets: pixels hidden under the nearer layers within (rx, ry) of their edge — the only
  // hidden pixels parallax can ever reveal.
  const target = new Uint8Array(w * h);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < outside.length; i++) outside[i] = nearerMask[i] ? 0 : 1;
  const nearEdge = dilate(outside, w, h, rx, ry);
  for (let i = 0; i < target.length; i++) target[i] = nearerMask[i] && nearEdge[i] && !filled[i] ? 1 : 0;
  if (opaqueAll) {
    // The back layer must also cover gaps that aren't under a nearer layer at all.
    for (let i = 0; i < target.length; i++) if (!filled[i] && !nearerMask[i]) target[i] = 1;
  }

  // Breadth-first edge extension: every target pixel is visited once, in order of distance from
  // the layer's own pixels, and takes the average of its already-filled 8-neighbours.
  const queue = new Int32Array(w * h);
  const queued = new Uint8Array(w * h);
  let head = 0;
  let tail = 0;
  const enqueueTargetsAround = (p: number) => {
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
        const q = yy * w + xx;
        if (target[q] && !filled[q] && !queued[q]) {
          queued[q] = 1;
          queue[tail++] = q;
        }
      }
    }
  };
  for (let i = 0; i < filled.length; i++) if (filled[i]) enqueueTargetsAround(i);
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
        const q = yy * w + xx;
        if (!filled[q]) continue;
        r += out.data[q * 4];
        g += out.data[q * 4 + 1];
        b += out.data[q * 4 + 2];
        n++;
      }
    }
    out.data.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), 255], p * 4);
    filled[p] = 1;
    enqueueTargetsAround(p);
  }

  if (opaqueAll) {
    // Never-revealed hidden areas get one flat color (the average of the layer's own pixels), so
    // nothing streaky or glowing is invented there; with no own pixels at all, black.
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < layer.data.length; i += 4) {
      if (layer.data[i + 3] !== 255) continue;
      r += layer.data[i];
      g += layer.data[i + 1];
      b += layer.data[i + 2];
      n++;
    }
    const flat = n > 0 ? [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255] : [0, 0, 0, 255];
    for (let i = 0; i < filled.length; i++) if (!filled[i]) out.data.set(flat, i * 4);
  }
  return out;
}
