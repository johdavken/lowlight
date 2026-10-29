/**
 * The city's places for the game (room exits spec §4): the map's, plus each exit room's and side place's,
 * so quests can wait at them, lore can name them and the quest panel can name them back.
 */
import { exitPlaces, locateRoom, type ExitPlace } from '../../shared/exits';
import type { CityMapData } from '../../shared/map-schema';
import type { SceneDef } from '../../shared/types';

export interface CityPlaces {
  exits: ReadonlyMap<string, ExitPlace>;
  locate(sceneId: string): { placeId: string | null; districtId: string | null };
  /** Every place id a quest may name. */
  placeIds(): Set<string>;
  placeName(placeId: string): string;
  /** A place's district (small jobs spec §2): the map's, or an exit place's; null for none. */
  districtOf(placeId: string): string | null;
}

export function cityPlaces(map: CityMapData | null, rooms: readonly Pick<SceneDef, 'id' | 'name' | 'district' | 'exits'>[], warn?: (m: string) => void): CityPlaces {
  const exits = exitPlaces(map, rooms, warn);
  return {
    exits,
    locate: (sceneId) => locateRoom(map, exits, sceneId),
    placeIds: () => new Set([...(map?.places.map((p) => p.id) ?? []), ...[...exits.values()].map((e) => e.placeId)]),
    placeName: (placeId) => map?.places.find((p) => p.id === placeId)?.name ?? [...exits.values()].find((e) => e.placeId === placeId)?.name ?? placeId,
    districtOf: (placeId) => map?.places.find((p) => p.id === placeId)?.district ?? [...exits.values()].find((e) => e.placeId === placeId)?.districtId ?? null,
  };
}
