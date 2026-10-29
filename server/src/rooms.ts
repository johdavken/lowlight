/**
 * The city's rooms: every scene in every district folder of `scenes/`, named `<district>/<folder>`
 * (e.g. `karasu/noodle-stall`). A district folder is only how rooms sit on disk; the game names rooms in full.
 * The splash's own folder (`lowlight`) holds no rooms.
 */
import type { SceneDef } from '../../shared/types';
import type { SceneRegistry } from './scenes';
import { currentSceneId } from '../../shared/scene-aliases';
import { doorFits } from '../../shared/exits';

export const SPLASH_DISTRICT = 'lowlight';

/** The rooms by name only: what a character's `rooms` are checked against. */
export interface RoomNames {
  has(id: string): boolean;
  inDistrict(district: string): string[];
  /** Every room's full name, sorted. */
  names(): string[];
}

/** A name-only view of the city, for checks that can't wait to load scene files (Studio's save). */
export function roomNames(names: Iterable<string>): RoomNames {
  const sorted = [...new Set(names)].filter((n) => !n.startsWith(`${SPLASH_DISTRICT}/`)).sort();
  return { has: (id) => sorted.includes(id), inDistrict: (d) => sorted.filter((n) => n.startsWith(`${d}/`)), names: () => [...sorted] };
}

/** The district a full room name sits in. */
export const districtOf = (room: string): string => room.split('/')[0] ?? '';

export interface RoomRegistry extends RoomNames {
  get(id: string): SceneDef | undefined;
  /** Every room, sorted by full name. */
  list(): SceneDef[];
  first(): SceneDef;
  has(id: string): boolean;
  /** A full name, or a bare folder name that only one room in the city has. */
  resolve(name: string): { ok: true; id: string } | { ok: false; error: string };
  /** A district's rooms, full names, sorted. */
  inDistrict(district: string): string[];
}

export function roomRegistry(packs: Map<string, { registry: Pick<SceneRegistry, 'list'> }>, warn: (m: string) => void = () => {}): RoomRegistry {
  const rooms = new Map<string, SceneDef>();
  for (const [district, { registry }] of packs) {
    if (district === SPLASH_DISTRICT) continue;
    for (const scene of registry.list()) rooms.set(`${district}/${scene.id}`, { ...scene, id: `${district}/${scene.id}`, district, folder: scene.id });
  }
  // An exit to a room that isn't there, or to the room itself, is dropped, never a load failure (room exits spec §2).
  for (const [id, scene] of rooms) {
    if (!scene.exits) continue;
    const kept = scene.exits.filter((e) => {
      if (e.to === id) warn(`room '${id}': exit to itself`);
      else if (!rooms.has(e.to)) warn(`room '${id}': exit to unknown room '${e.to}'`);
      else return true;
      return false;
    });
    // A door box off the picture is dropped and its exit kept (clickable doors spec §2).
    const doors = kept.map((e) => {
      if (e.door === undefined || doorFits(e.door, scene.resolution)) return e;
      warn(`room '${id}': door for exit to '${e.to}' isn't inside the picture; dropped`);
      const { door: _bad, ...rest } = e;
      return rest;
    });
    if (kept.length !== scene.exits.length || doors.some((e, i) => e !== kept[i])) rooms.set(id, { ...scene, exits: doors });
  }
  const sorted = [...rooms.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    get: (id) => rooms.get(id),
    list: () => [...sorted],
    first() {
      const [room] = sorted;
      if (!room) throw new Error('the city has no rooms');
      return room;
    },
    has: (id) => rooms.has(id),
    resolve(asked) {
      // She may echo an old ribbon/ id from earlier turns.
      const name = currentSceneId(asked);
      if (rooms.has(name)) return { ok: true, id: name };
      const matches = sorted.filter((r) => r.folder === name).map((r) => r.id);
      if (matches.length === 1) return { ok: true, id: matches[0]! };
      if (matches.length > 1) return { ok: false, error: `'${name}' is more than one room: ${matches.join(', ')}` };
      return { ok: false, error: `no room '${name}'` };
    },
    inDistrict: (district) => sorted.filter((r) => r.district === district).map((r) => r.id),
    names: () => sorted.map((r) => r.id),
  };
}
