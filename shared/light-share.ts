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

/**
 * The room's two light groups (light groups, 2026-11-12): `inside` is every light the room paints itself, `outside`
 * the city through its windows. She calls one by name and every light in it moves at once, as a share of how the
 * room is lit, so dimming the room keeps its balance; one fixture at a time barely showed on screen.
 */
export const LIGHT_GROUPS = ['inside', 'outside'] as const;
export type LightGroup = (typeof LIGHT_GROUPS)[number];

export function groupOf(light: LightDef): LightGroup {
  return light.outside ? 'outside' : 'inside';
}

/** `id` as a group name (any case, quotes and spaces trimmed), or null. */
export function asGroup(id: string): LightGroup | null {
  const g = id.trim().replace(/^"|"$/g, '').toLowerCase();
  return (LIGHT_GROUPS as readonly string[]).includes(g) ? (g as LightGroup) : null;
}

/**
 * A light's level at its group's 100%: its base, or the scene's painted level (`painted`, by id) when the base is 0,
 * so a group a dark mood recorded as off can still be brought back.
 */
export function fullLevel(light: LightDef, painted?: ReadonlyMap<string, number>): number {
  const b = light.base ?? light.intensity;
  return b > 0 ? b : (painted?.get(light.id) ?? 0);
}

/** A light's level as a share of its full level (1 = as lit); a light with no full level reads 1 when on, 0 when off. */
export function ownShare(light: LightDef, painted?: ReadonlyMap<string, number>): number {
  const full = fullLevel(light, painted);
  return full > 0 ? light.intensity / full : light.intensity > 0 ? 1 : 0;
}

/**
 * A group's level: the brightest share any of its lights is at (1 = as lit), so a room with one lamp off still reads
 * as lit with that lamp named apart; null for a group with no lights.
 */
export function groupShare(lights: readonly LightDef[], group: LightGroup, painted?: ReadonlyMap<string, number>): number | null {
  const members = lights.filter((l) => groupOf(l) === group);
  return members.length === 0 ? null : Math.max(...members.map((l) => ownShare(l, painted)));
}

/** The lights with every member of `group` at `share` of its full level (each at most 1), and `flicker` when given. */
export function setGroup(
  lights: readonly LightDef[],
  group: LightGroup,
  share: number,
  o: { flicker?: number; painted?: ReadonlyMap<string, number> } = {},
): LightDef[] {
  return lights.map((l) =>
    groupOf(l) !== group
      ? l
      : { ...l, intensity: Math.min(1, Math.round(fullLevel(l, o.painted) * share * 1000) / 1000), ...(o.flicker !== undefined ? { flicker: o.flicker } : {}) },
  );
}
