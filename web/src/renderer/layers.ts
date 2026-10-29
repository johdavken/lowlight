import { sceneDir } from '../scene-paths';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { SceneDef } from '../../../shared/types';
import { CAMERA_MAX_X, CAMERA_MAX_Y } from './camera';
import type { FrameSize } from '../../../shared/frame';

const MISSING_FILL = 0x120a1c;

/** One parallax layer: its diffuse display object and (if it has one) its emissive sprite. */
export interface Layer {
  id: string;
  parallax: number;
  /** Horizontal camera margin in px (texture width − the room's frame width). */
  margin: number;
  /** Vertical edge padding in px added above and below at load time. */
  padY: number;
  diffuse: Sprite | Graphics;
  emissive: Sprite | null;
  /** Per-light glow maps; their alpha follows the named light's current brightness. */
  perLightEmissive: { lightId: string; sprite: Sprite }[];
}

/** Vertical padding a layer needs so camera breathing never exposes its top/bottom edge. */
export function layerPadY(parallax: number): number {
  return Math.ceil(CAMERA_MAX_Y * parallax);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Loads a layer image and extends it by `padY` px above and below, repeating its edge rows,
 * so vertical camera travel shows the layer's own edge instead of a gap (the art has no vertical margin).
 */
async function loadPaddedTexture(url: string, padY: number): Promise<Texture> {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height + padY * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, padY);
  if (padY > 0) {
    ctx.drawImage(img, 0, 0, img.width, 1, 0, 0, img.width, padY);
    ctx.drawImage(img, 0, img.height - 1, img.width, 1, 0, padY + img.height, img.width, padY);
  }
  return Texture.from(canvas);
}

/**
 * Builds every layer of a scene. A diffuse image that fails to load becomes a solid #120a1c
 * rectangle and `warn('layer <id> failed to load')` is called. A missing emissive map is skipped.
 */
export async function loadLayers(scene: SceneDef, warn: (msg: string) => void, sceneBase = '/scenes/'): Promise<Layer[]> {
  const base = sceneDir(scene, sceneBase);
  const [frameW, frameH] = scene.resolution;
  return Promise.all(
    scene.layers.map(async (def): Promise<Layer> => {
      const padY = layerPadY(def.parallax);
      let diffuse: Sprite | Graphics;
      let margin: number;
      try {
        const tex = await loadPaddedTexture(base + def.src, padY);
        diffuse = new Sprite(tex);
        margin = Math.max(0, tex.width - frameW);
      } catch {
        warn(`layer ${def.id} failed to load`);
        margin = Math.ceil(def.parallax * CAMERA_MAX_X * 2);
        diffuse = new Graphics().rect(0, 0, frameW + margin, frameH + padY * 2).fill(MISSING_FILL);
      }
      let emissive: Sprite | null = null;
      if (def.emissive) {
        try {
          emissive = new Sprite(await loadPaddedTexture(base + def.emissive, padY));
        } catch {
          emissive = null;
        }
      }
      const perLightEmissive: { lightId: string; sprite: Sprite }[] = [];
      for (const [lightId, file] of Object.entries(def.emissiveLights ?? {})) {
        try {
          perLightEmissive.push({ lightId, sprite: new Sprite(await loadPaddedTexture(base + file, padY)) });
        } catch {
          warn(`glow map ${file} for light ${lightId} failed to load`);
        }
      }
      return { id: def.id, parallax: def.parallax, margin, padY, diffuse, emissive, perLightEmissive };
    }),
  );
}

/**
 * Positions a layer for the given camera offset (parallax-1 px). The camera is continuous;
 * the layer's final offset is rounded to whole render-texture pixels so art pixels stay crisp.
 */
export function placeLayer(layer: Layer, cam: { x: number; y: number }): void {
  const x = Math.round(-layer.margin / 2 + cam.x * layer.parallax);
  const y = Math.round(-layer.padY + cam.y * layer.parallax);
  layer.diffuse.position.set(x, y);
  layer.emissive?.position.set(x, y);
  for (const g of layer.perLightEmissive) g.sprite.position.set(x, y);
}

export function destroyLayers(layers: Layer[], from: { diffuse: Container; emissive: Container }): void {
  for (const l of layers) {
    from.diffuse.removeChild(l.diffuse);
    l.diffuse.destroy({ texture: true, textureSource: true });
    if (l.emissive) {
      from.emissive.removeChild(l.emissive);
      l.emissive.destroy({ texture: true, textureSource: true });
    }
    for (const g of l.perLightEmissive) {
      from.emissive.removeChild(g.sprite);
      g.sprite.destroy({ texture: true, textureSource: true });
    }
  }
}

/** The frame size after a scene load: the room's own size, but only if this load is still the latest. */
export function frameAfterLoad(current: FrameSize, loaded: SceneDef, won: boolean): FrameSize {
  return won ? loaded.resolution : current;
}
