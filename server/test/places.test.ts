import { describe, expect, it, vi } from 'vitest';
import { cityPlaces } from '../src/places';
import type { CityMapData } from '../../shared/map-schema';

const MAP: CityMapData = {
  version: 1,
  image: 'm.webp',
  districts: [],
  places: [
    { id: 'hicks-room', name: "Hicks's room", district: 'karasu', pin: [0, 0], scene: 'karasu/hicks-room' },
    { id: 'haes-noodles', name: "Hae's Noodles", district: 'karasu', pin: [1, 1], scene: 'karasu/noodle-stall' },
  ],
};
const ROOMS = [
  { id: 'karasu/hicks-room', name: "Hicks's room", district: 'karasu', exits: [{ to: 'karasu/dead-blocks', way: 'down the back stairs' }] },
  { id: 'karasu/noodle-stall', name: 'Noodle Stall', district: 'karasu' },
  { id: 'karasu/dead-blocks', name: 'The Dead Blocks', district: 'karasu' },
];

describe('the city places (room exits spec §4)', () => {
  const places = cityPlaces(MAP, ROOMS);

  it('quests know the exit places alongside the map places', () => {
    expect([...places.placeIds()].sort()).toEqual(['dead-blocks', 'haes-noodles', 'hicks-room']);
  });

  it('an exit room is at its own place, in its district', () => {
    expect(places.locate('karasu/dead-blocks')).toEqual({ placeId: 'dead-blocks', districtId: 'karasu' });
    expect(places.locate('karasu/noodle-stall')).toEqual({ placeId: 'haes-noodles', districtId: 'karasu' });
  });

  it("an exit place is named by its room's name", () => {
    expect(places.placeName('dead-blocks')).toBe('The Dead Blocks');
    expect(places.placeName('haes-noodles')).toBe("Hae's Noodles");
    expect(places.placeName('nowhere')).toBe('nowhere');
  });

  it('passes clashes on as warnings', () => {
    const warn = vi.fn();
    cityPlaces({ ...MAP, places: [...MAP.places, { id: 'dead-blocks', name: 'X', district: 'karasu', pin: [2, 2] }] }, ROOMS, warn);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
