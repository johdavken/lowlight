/** Her `[room: …]` line, the room as it is right now: Lowlight's server (Room.summary) and the SillyTavern package both write it. */
import type { Atmosphere, LightDef, SceneDef } from './types';

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function lightLabel(light: LightDef): string {
  return `${light.id} "${light.label}" ${light.color} ${pct(light.intensity)}${light.outside ? ' outside' : ''}`;
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
}): string {
  const { scene, atmosphere, lights } = o;
  const weatherText = atmosphere.weather === 'none' ? 'clear' : `${atmosphere.weather} ${pct(atmosphere.weatherLevel)}`;
  const lightsText = lights.map(lightLabel).join(', ');
  // "moods", not "presets": the word in front of her every turn leaked into the story ("Quiet preset ought to do it", 2026-10-14).
  const presets = Object.keys(scene.presets).join(', ') || 'none';
  const where = o.district ? `, ${o.district}` : '';
  const places = o.places.length > 0 ? ` · places: ${o.places.map((s) => `${s.id} "${s.name}"`).join(', ')}` : '';
  const ways = o.ways.length > 0 ? ` · ways out: ${o.ways.map((e) => `${e.id} "${e.name}" (${e.way})`).join(', ')}` : '';
  return `[room: ${scene.id} "${scene.name}"${where} · ambient ${atmosphere.ambient} ${pct(atmosphere.ambientLevel)} · ${weatherText} · fog ${pct(atmosphere.fog)} · lights: ${lightsText} · moods: ${presets}${places}${ways}]`;
}
