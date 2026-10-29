import type { LightDef } from './types';

/** With every indoor light off, the room keeps this share of its ambient. */
export const AMBIENT_FLOOR = 0.25;

/**
 * How much of the room's own indoor light is still on, 0–1: the lights' levels over their bases
 * (a light without one counts as at its own level). Window light doesn't count. A room with no indoor
 * light, or none lit to begin with, reads as fully lit.
 */
export function lightShare(lights: readonly LightDef[]): number {
  let on = 0;
  let own = 0;
  for (const l of lights) {
    if (l.outside) continue;
    on += l.intensity;
    own += l.base ?? l.intensity;
  }
  return own > 0 ? Math.min(1, on / own) : 1;
}

/** The ambient level the room shows: it falls toward AMBIENT_FLOOR as its indoor lights go out. */
export function dimmedAmbientLevel(ambientLevel: number, lights: readonly LightDef[]): number {
  return ambientLevel * (AMBIENT_FLOOR + (1 - AMBIENT_FLOOR) * lightShare(lights));
}

/** The lights with their current levels recorded as their bases (a room loading, a preset). */
export function withBase(lights: readonly LightDef[]): LightDef[] {
  return lights.map((l) => ({ ...l, base: l.intensity }));
}
