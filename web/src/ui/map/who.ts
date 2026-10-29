/** Who's where on the city map: residents at their pins, you and your contact where your room is, and each pin's side rooms. */
import type { CityMapData } from '../../../../shared/map-schema';
import type { ResidentInfo, SceneDef } from '../../../../shared/types';
import { exitPlaces, sideRooms, type SideRoom } from '../../../../shared/exits';
import { residentOf } from '../../room/resident';
import { hereFor, type MapPerson, type WhoIsWhere } from './city-map';

export interface MapWhoInputs {
  map: CityMapData;
  rooms: SceneDef[];
  /** Your room, named in full (`karasu/noodle-stall`), as the map's places link them; null off the map. */
  sceneId: string | null;
  residents: Record<string, ResidentInfo>;
  /** Your persona, or null for the default player ('You', no face). */
  player: { id: string; name: string } | null;
  contact: { id: string; name: string; accent: string };
  busy: boolean;
  gigBlock: string | null;
}

export function mapWho(o: MapWhoInputs): WhoIsWhere {
  const { map: m, rooms } = o;
  // Each pin's side rooms, and the pin each one is inside (information only on the map).
  const inside = Object.fromEntries(sideRooms(m, rooms));
  // A side room stands at its home place (room exits spec §4); one further in, at the pin whose list has it.
  const here = hereFor(m, o.sceneId, exitPlaces(m, rooms), inside);
  const pinOf = new Map<string, string>();
  const walk = (pinId: string, list: SideRoom[]): void => list.forEach((r) => (pinOf.set(r.room, pinId), walk(pinId, r.inside)));
  for (const [pinId, list] of Object.entries(inside)) walk(pinId, list);
  // Places' residents are always at their place, wherever you are; one in a side room shows on its pin's list.
  const fixed: MapPerson[] = [];
  for (const scene of rooms) {
    const r = residentOf(scene, o.residents);
    const place = r ? (pinOf.get(scene.id) ?? m.places.find((p) => p.scene === scene.id && !p.side)?.id) : undefined;
    if (r && place) fixed.push({ place, room: scene.id, id: r.id, name: r.name, role: 'fixed', accent: r.accent, face: r.thumb });
  }
  if (!here) return { people: fixed, busy: o.busy, gigBlock: o.gigBlock, inside };
  const room = o.sceneId ?? undefined;
  const thumb = (id: string) => `/api/agents/${encodeURIComponent(id)}/thumb`;
  const people: MapPerson[] = [
    ...fixed,
    // No persona: the default player, 'you' everywhere else in the room, with no face to show.
    o.player
      ? { place: here, room, id: o.player.id, name: o.player.name, role: 'you', accent: '#7fe9ff', face: thumb(o.player.id) }
      : { place: here, room, id: 'you', name: 'You', role: 'you', accent: '#7fe9ff', face: null },
    { place: here, room, id: o.contact.id, name: o.contact.name, role: 'contact', accent: o.contact.accent, face: thumb(o.contact.id) },
  ];
  // In a side room you stand at its home, but GO there still walks you back into that room.
  const away = m.places.find((p) => p.id === here)?.scene !== o.sceneId;
  return { here, ...(away ? { away: true } : {}), people, busy: o.busy, gigBlock: o.gigBlock, inside };
}
