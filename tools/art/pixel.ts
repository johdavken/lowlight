import type { Hex, LayerDef } from '../../shared/types';
import { snapImage } from '../palette-snap';
import { layerWidth, type Band } from './guide';
import { crop, fromPNG, toPNG, type Img } from './image';

const FRAME_H = 270;

/**
 * Cuts one layer's frame out of the band-scale image (centered in the widest frame) and snaps it
 * to the scene's pixel grid and palette: `layerWidth(parallax) × 270`, binary alpha.
 */
export function snapLayer(bandLayer: Img, layer: LayerDef, band: Band, palette: Hex[]): Img {
  const w = layerWidth(layer.parallax);
  const x0 = ((band.widest - w) / 2) * band.s;
  const cut = crop(bandLayer, x0, 0, w * band.s, bandLayer.h);
  return fromPNG(snapImage(toPNG(cut), { width: w, height: FRAME_H, palette }));
}
