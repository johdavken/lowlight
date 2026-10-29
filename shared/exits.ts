/**
 * Room exits (room exits spec §4): a room reached through another room's exit, not from a map pin, still
 * has a place for quests, lore and the map. One off the map takes the last part of its room id; a map
 * place marked `side` keeps its own. Its home is the first map place whose room has an exit to it.
 */
import type { CityMapData } from './map-schema';
import type { SceneDef } from './types';

export interface ExitPlace {
  placeId: string;
  districtId: string | null;
  /** The map place whose pin stands in for it: the first, in the map's order, whose room exits to it. */
  home: string | null;
  name: string;
}

type ExitRoom = Pick<SceneDef, 'id' | 'name' | 'district' | 'exits'>;

/** Each exit room's and side place's place, keyed by room id. Pinned map rooms aren't in it. */
export function exitPlaces(map: CityMapData | null, rooms: readonly ExitRoom[], warn?: (m: string) => void): Map<string, ExitPlace> {
  const places = map?.places ?? [];
  const targets = new Set(rooms.flatMap((r) => (r.exits ?? []).map((e) => e.to)));
  const homeOf = (roomId: string): string | null => {
    for (const p of places) {
      if (p.side || !p.scene) continue;
      const holder = rooms.find((r) => r.id === p.scene);
      if (holder?.exits?.some((e) => e.to === roomId)) return p.id;
    }
    return null;
  };
  const out = new Map<string, ExitPlace>();
  for (const r of rooms) {
    const onMap = places.find((p) => p.scene === r.id);
    if (onMap) {
      if (onMap.side) out.set(r.id, { placeId: onMap.id, districtId: onMap.district, home: homeOf(r.id), name: onMap.name });
      continue;
    }
    // Off the map: a room an exit leads to, or one whose way out leads to a pinned place (a private room
    // only its owner takes you into, like Nix's apartment off her landing), which then stands at that place.
    const outTo = (r.exits ?? []).map((e) => places.find((p) => p.scene === e.to && !p.side)).find((p) => p !== undefined);
    if (!targets.has(r.id) && !outTo) continue;
    const placeId = r.id.split('/').pop()!;
    if (places.some((p) => p.id === placeId)) {
      warn?.(`room '${r.id}': its place id '${placeId}' is already a map place; the map place wins`);
      continue;
    }
    out.set(r.id, { placeId, districtId: r.district ?? null, home: homeOf(r.id) ?? outTo?.id ?? null, name: r.name });
  }
  return out;
}

/** A room inside a map pin: reached through its room's exits, not from the map; and the rooms reached through it. */
export interface SideRoom {
  room: string;
  name: string;
  inside: SideRoom[];
}

/**
 * Each pinned place's side rooms, for the map's pin list: every room reached through exits without
 * crossing another pinned room, nested by the way in. A room reachable from two pins goes to the nearer,
 * then to the first on the map. A pin with nothing inside has no entry.
 */
export function sideRooms(map: CityMapData | null, rooms: readonly ExitRoom[]): Map<string, SideRoom[]> {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const names = exitPlaces(map, rooms);
  const pins = (map?.places ?? []).filter((p) => !p.side && p.scene && byId.has(p.scene));
  const pinnedRooms = new Set(pins.map((p) => p.scene!));
  const node = new Map<string, SideRoom>();
  const out = new Map<string, SideRoom[]>();
  // One search from every pin at once, in map order: the nearer pin claims a room first.
  const queue: { room: string; list: SideRoom[] }[] = [];
  for (const p of pins) {
    const list: SideRoom[] = [];
    out.set(p.id, list);
    queue.push({ room: p.scene!, list });
  }
  for (let i = 0; i < queue.length; i++) {
    const { room, list } = queue[i];
    for (const e of byId.get(room)?.exits ?? []) {
      const to = byId.get(e.to);
      if (!to || pinnedRooms.has(to.id) || node.has(to.id)) continue;
      const n: SideRoom = { room: to.id, name: names.get(to.id)?.name ?? to.name, inside: [] };
      node.set(to.id, n);
      list.push(n);
      queue.push({ room: to.id, list: n.inside });
    }
  }
  for (const [id, list] of out) if (!list.length) out.delete(id);
  return out;
}

/** A room's place and district: its map place, else its exit place, else nowhere. */
export function locateRoom(map: CityMapData | null, exits: ReadonlyMap<string, ExitPlace>, sceneId: string): { placeId: string | null; districtId: string | null } {
  const place = map?.places.find((p) => p.scene === sceneId);
  if (place) return { placeId: place.id, districtId: place.district };
  const e = exits.get(sceneId);
  return e ? { placeId: e.placeId, districtId: e.districtId } : { placeId: null, districtId: null };
}

/** A door box's smallest side, in room px (clickable doors spec §2). */
export const MIN_DOOR = 8;

/** A door box that fits the room's picture: four whole numbers, at least MIN_DOOR on a side, all inside. */
export function doorFits(door: unknown, resolution: readonly [number, number]): door is [number, number, number, number] {
  if (!Array.isArray(door) || door.length !== 4 || !door.every((v) => Number.isInteger(v))) return false;
  const [x, y, w, h] = door as number[];
  return x >= 0 && y >= 0 && w >= MIN_DOOR && h >= MIN_DOOR && x + w <= resolution[0] && y + h <= resolution[1];
}
