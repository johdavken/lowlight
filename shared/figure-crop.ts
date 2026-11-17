/**
 * The game's portrait crop of a figure, as shares of the picture, for the PERSONA page's face box and preview.
 * It mirrors server/src/thumb.ts cropBox (which pulls in node modules, so the browser can't import it);
 * figure-crop.node.test.ts keeps the two the same.
 */
export const FIGURE_W = 1024;
export const FIGURE_H = 1536;
const CROP_WIDTH = 0.3;
const CROP_ASPECT = 120 / 104;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function figureCrop(face: { x: number; y: number }, w = FIGURE_W, h = FIGURE_H): { x: number; y: number; w: number; h: number } {
  let bw = Math.round(w * CROP_WIDTH);
  let bh = Math.round(bw * CROP_ASPECT);
  if (bh > h) {
    bh = h;
    bw = Math.round(h / CROP_ASPECT);
  }
  const x = clamp(Math.round(face.x * w - bw / 2), 0, w - bw);
  const y = clamp(Math.round(face.y * h - bh / 2), 0, h - bh);
  return { x: x / w, y: y / h, w: bw / w, h: bh / h };
}
