import { flickerFactor } from './flicker';

/** Stable 32-bit seed from a light id (FNV-1a), so each light flickers on its own pattern. */
export function idSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The current brightness (0..1) of a light, including flicker — shared by the lighting shader and per-light glow maps. */
export function lightGlowAlpha(light: { id: string; intensity: number; flicker: number }, t: number): number {
  return Math.max(0, Math.min(1, light.intensity * flickerFactor(t, light.flicker, idSeed(light.id))));
}
