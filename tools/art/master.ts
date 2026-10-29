import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { blank, crop, fromPNG, type Img } from './image';
import { GUIDE_H, GUIDE_W, type Band } from './guide';
import { FLAT_FRAME } from '../../shared/frame';

const ASPECT_TOLERANCE = 0.02;

/** Area-averaged resize (alpha-weighted color). Used to bring larger masters down to 1536×1024. */
export function scaleTo(img: Img, w: number, h: number): Img {
  if (img.w === w && img.h === h) return { w, h, data: new Uint8ClampedArray(img.data) };
  const out = blank(w, h);
  const fx = img.w / w;
  const fy = img.h / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * fy;
    const y1 = y0 + fy;
    for (let x = 0; x < w; x++) {
      const x0 = x * fx;
      const x1 = x0 + fx;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const wgt = wx * wy;
          const i = (Math.min(img.h - 1, sy) * img.w + Math.min(img.w - 1, sx)) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al * wgt;
          g += img.data[i + 1] * al * wgt;
          b += img.data[i + 2] * al * wgt;
          a += al * wgt;
          area += wgt;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round((a / area) * 255);
    }
  }
  return out;
}

/** Loads the ChatGPT-made master, checks it, normalizes it to 1536×1024 and returns the scene band. */
export function loadMaster(file: string, band: Band): Img {
  const name = path.basename(file);
  if (!fs.existsSync(file)) {
    throw new Error(
      `no ${name} — run --stage guide, make the image in ChatGPT, and save it to ${path.relative(process.cwd(), file) || file}`,
    );
  }
  let img: Img;
  try {
    img = fromPNG(PNG.sync.read(fs.readFileSync(file)));
  } catch {
    throw new Error(`${name} is not a PNG — save the ChatGPT image as PNG`);
  }
  const wantAspect = GUIDE_W / GUIDE_H;
  const aspect = img.w / img.h;
  if (img.w < GUIDE_W || Math.abs(aspect - wantAspect) / wantAspect > ASPECT_TOLERANCE) {
    throw new Error(`${name} is ${img.w}×${img.h}; need a ${GUIDE_W}×${GUIDE_H} landscape image like guide.png`);
  }
  return crop(scaleTo(img, GUIDE_W, GUIDE_H), 0, band.top, GUIDE_W, band.h);
}

/** The flat frame's rows taken from the 1536×1024 master: `cropTop` .. `cropTop + 864`. */
export const CROP_MAX = 1024 - FLAT_FRAME[1];

/** Loads the master for a flat room: same checks as `loadMaster`, scaled to 1536×1024, 864 rows from `cropTop`. */
export function loadFlatMaster(file: string, cropTop: number): Img {
  if (!Number.isInteger(cropTop) || cropTop < 0 || cropTop > CROP_MAX) throw new Error(`cropTop must be 0 .. ${CROP_MAX}`);
  return loadMaster(file, { s: 1, top: cropTop, h: FLAT_FRAME[1], widest: FLAT_FRAME[0] });
}
