/** Her `[room: …]` line, the room as it is right now: Lowlight's server (Room.summary) and the SillyTavern package both write it. */
import { LIGHT_GROUPS, groupOf, groupShare, ownShare } from './light-share';
import type { Atmosphere, LightDef, SceneDef } from './types';

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function lightLabel(light: LightDef): string {
  return `${light.id} "${light.label}" ${light.color} ${pct(light.intensity)}${light.outside ? ' outside' : ''}`;
}

/** A member's share is under its group's by more than this: it's named with its own level. */
const APART = 0.1;

/**
 * The lights as their groups (light groups): `inside 60% (monitors, clamp lamp); outside 100% (porthole)`, each group's
 * share of how the room is lit, its lights by label, and a light set apart from the rest with its own level.
 */
export function groupedLights(lights: readonly LightDef[], painted?: ReadonlyMap<string, number>): string {
  const parts: string[] = [];
  for (const g of LIGHT_GROUPS) {
    const members = lights.filter((l) => groupOf(l) === g);
    const share = groupShare(lights, g, painted);
    if (members.length === 0 || share === null) continue;
    const names = members.map((l) => (share - ownShare(l, painted) > APART ? `${l.label} ${pct(l.intensity)}` : l.label));
    parts.push(`${g} ${pct(share)} (${names.join(', ')})`);
  }
  return parts.join('; ') || 'none';
}

export function roomLine(o: {
  scene: SceneDef;
  atmosphere: Atmosphere;
  lights: LightDef[];
  /** The district's display name ("Karasu"), when the room has one. */
  district?: string;
  /** Her other places (not this room, not a way out of it). */
  places: { id: string; name: string }[];
  /** This room's ways out. */
  ways: { id: string; name: string; way: string }[];
  /** The lights as their groups (Lowlight) instead of one by one with ids and colours (default, the SillyTavern package). */
  groups?: boolean;
  /** The scene's painted lights, so a group a dark mood recorded at 0 still reads against how the room is lit. */
  painted?: readonly LightDef[];
  /** Name the weather (default). Lowlight's turns leave it out unless it's news: in every turn's line, she wrote the rain into most replies. */
  weather?: boolean;
}): string {
  const { scene, atmosphere, lights } = o;
  const weatherText = atmosphere.weather === 'none' ? 'clear' : `${atmosphere.weather} ${pct(atmosphere.weatherLevel)}`;
  const lightsText = o.groups ? groupedLights(lights, o.painted ? new Map(o.painted.map((l) => [l.id, l.intensity])) : undefined) : lights.map(lightLabel).join(', ');
  // "moods", not "presets": the word in front of her every turn leaked into the story ("Quiet preset ought to do it", 2026-10-14).
  const presets = Object.keys(scene.presets).join(', ') || 'none';
  const where = o.district ? `, ${o.district}` : '';
  const places = o.places.length > 0 ? ` · places: ${o.places.map((s) => `${s.id} "${s.name}"`).join(', ')}` : '';
  const ways = o.ways.length > 0 ? ` · ways out: ${o.ways.map((e) => `${e.id} "${e.name}" (${e.way})`).join(', ')}` : '';
  const weather = o.weather === false ? '' : ` · ${weatherText}`;
  return `[room: ${scene.id} "${scene.name}"${where} · ambient ${atmosphere.ambient} ${pct(atmosphere.ambientLevel)}${weather} · fog ${pct(atmosphere.fog)} · lights: ${lightsText} · moods: ${presets}${places}${ways}]`;
}
