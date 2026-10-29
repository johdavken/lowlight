/** The scene render texture, which changes size and filtering when a room of another size loads. */
import { RenderTexture, type TextureSource } from 'pixi.js';

/**
 * `dynamic`: a Sprite only listens for its texture's updates when the texture is dynamic, so without
 * it the on-screen view would keep drawing the old size after a resize.
 */
export function createFrameTexture(w: number, h: number): RenderTexture {
  return RenderTexture.create({ width: w, height: h, scaleMode: 'nearest', dynamic: true });
}

/**
 * Linear filtering for flat rooms, nearest for 480 rooms. Setting `scaleMode` alone only changes the
 * style's fields; `style.update()` sends the change on to the GPU sampler.
 */
export function setSmooth(source: TextureSource, smooth: boolean): void {
  source.style.scaleMode = smooth ? 'linear' : 'nearest';
  source.style.update();
}
