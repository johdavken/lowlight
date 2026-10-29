import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { doorFits, exitPlaces, locateRoom, sideRooms } from './exits';
import { MAX_EXIT_WAY, sceneSchema } from './scene-schema';
import type { CityMapData, Place } from './map-schema';
import type { SceneDef } from './types';

// The live stall, without the exits it has now (each test sets its own).
const stall = () => {
  const { exits: _live, ...s } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scenes', 'karasu', 'noodle-stall', 'scene.json'), 'utf8'));
  return s;
};
const exit = (to: string, way = 'down the back stairs') => ({ to, way });

describe('exits in scene.json', () => {
  it('a room without exits is fine', () => {
    expect(sceneSchema.parse(stall()).exits).toBeUndefined();
  });

  it('keeps up to four', () => {
    const exits = ['a', 'b', 'c', 'd'].map((x) => exit(`karasu/${x}`));
    expect(sceneSchema.parse({ ...stall(), exits }).exits).toEqual(exits);
  });

  it('refuses a fifth', () => {
    const exits = ['a', 'b', 'c', 'd', 'e'].map((x) => exit(`karasu/${x}`));
    expect(sceneSchema.safeParse({ ...stall(), exits }).success).toBe(false);
  });

  it(`refuses a way longer than ${MAX_EXIT_WAY}`, () => {
    expect(sceneSchema.safeParse({ ...stall(), exits: [exit('karasu/a', 'x'.repeat(MAX_EXIT_WAY + 1))] }).success).toBe(false);
  });

  it('refuses a way on two lines', () => {
    expect(sceneSchema.safeParse({ ...stall(), exits: [exit('karasu/a', 'down\nand out')] }).success).toBe(false);
  });

  it('refuses the same room twice', () => {
    const r = sceneSchema.safeParse({ ...stall(), exits: [exit('karasu/a'), exit('karasu/a', 'again')] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('duplicate exit');
  });
});

const place = (id: string, scene: string | undefined, extra: Partial<Place> = {}): Place => ({ id, name: id, district: 'karasu', pin: [0, 0], ...(scene ? { scene } : {}), ...extra });
const map = (places: Place[]): CityMapData => ({ version: 1, image: 'm.webp', districts: [], places });
const room = (id: string, name: string, exits?: { to: string; way: string }[]): Pick<SceneDef, 'id' | 'name' | 'district' | 'exits'> => ({
  id,
  name,
  district: id.split('/')[0],
  ...(exits ? { exits } : {}),
});

describe('exitPlaces', () => {
  const blocks = room('karasu/dead-blocks', 'The Dead Blocks');

  it("gives an exit room off the map its own place, its district and its home", () => {
    const m = map([place('hicks-room', 'karasu/hicks-room')]);
    const got = exitPlaces(m, [room('karasu/hicks-room', "Hicks's room", [exit('karasu/dead-blocks')]), blocks]);
    expect(got.get('karasu/dead-blocks')).toEqual({ placeId: 'dead-blocks', districtId: 'karasu', home: 'hicks-room', name: 'The Dead Blocks' });
  });

  it('the home is the holder listed first on the map', () => {
    const m = map([place('public-landing', 'karasu/public-landing'), place('hicks-room', 'karasu/hicks-room')]);
    const got = exitPlaces(m, [room('karasu/hicks-room', 'H', [exit('karasu/dead-blocks')]), room('karasu/public-landing', 'P', [exit('karasu/dead-blocks')]), blocks]);
    expect(got.get('karasu/dead-blocks')?.home).toBe('public-landing');
  });

  it('a pinned map room is left out, exit or not', () => {
    const m = map([place('hicks-room', 'karasu/hicks-room'), place('zhou-flat', 'karasu/zhou-flat')]);
    const got = exitPlaces(m, [room('karasu/hicks-room', 'H', [exit('karasu/zhou-flat')]), room('karasu/zhou-flat', 'Z')]);
    expect(got.has('karasu/zhou-flat')).toBe(false);
  });

  it('a side place keeps its own map id and name, with its home from the exits', () => {
    const m = map([place('hicks-room', 'karasu/hicks-room'), place('haes-noodles', 'karasu/noodle-stall', { side: true, name: "Hae's Noodles" })]);
    const got = exitPlaces(m, [room('karasu/hicks-room', 'H', [exit('karasu/noodle-stall')]), room('karasu/noodle-stall', 'Noodle Stall')]);
    expect(got.get('karasu/noodle-stall')).toEqual({ placeId: 'haes-noodles', districtId: 'karasu', home: 'hicks-room', name: "Hae's Noodles" });
  });

  it('an exit room whose id clashes with a map place warns and gets no place', () => {
    const warn = vi.fn();
    const m = map([place('hicks-room', 'karasu/hicks-room'), place('dead-blocks', undefined)]);
    const got = exitPlaces(m, [room('karasu/hicks-room', 'H', [exit('karasu/dead-blocks')]), blocks], warn);
    expect(got.has('karasu/dead-blocks')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("a room off the map with only a way out (Nix's apartment off her landing)", () => {
  it("belongs to the pinned place its exit leads to: its own place id, that place as its home", () => {
    const m = map([place('nix-walk-up', 'karasu/walk-up-landing')]);
    const got = exitPlaces(m, [room('karasu/walk-up-landing', 'Landing'), room('karasu/nix-apartment', "Nix's apartment", [exit('karasu/walk-up-landing', 'out to the landing')])]);
    expect(got.get('karasu/nix-apartment')).toEqual({ placeId: 'nix-apartment', districtId: 'karasu', home: 'nix-walk-up', name: "Nix's apartment" });
  });

  it('a room with no exits and no map place still has no place', () => {
    const m = map([place('nix-walk-up', 'karasu/walk-up-landing')]);
    expect(exitPlaces(m, [room('karasu/walk-up-landing', 'Landing'), room('karasu/zhou-flat', 'Z')]).has('karasu/zhou-flat')).toBe(false);
  });
});

describe('locateRoom', () => {
  const m = map([place('hicks-room', 'karasu/hicks-room')]);
  const exits = exitPlaces(m, [room('karasu/hicks-room', 'H', [exit('karasu/dead-blocks')]), room('karasu/dead-blocks', 'The Dead Blocks')]);

  it('a map room is its map place', () => {
    expect(locateRoom(m, exits, 'karasu/hicks-room')).toEqual({ placeId: 'hicks-room', districtId: 'karasu' });
  });

  it('an exit room is its own place', () => {
    expect(locateRoom(m, exits, 'karasu/dead-blocks')).toEqual({ placeId: 'dead-blocks', districtId: 'karasu' });
  });

  it('anything else is nowhere', () => {
    expect(locateRoom(m, exits, 'karasu/zhou-flat')).toEqual({ placeId: null, districtId: null });
  });
});

describe('doorFits (clickable doors spec §2)', () => {
  const res = [1536, 864] as const;
  it('takes a whole-number box inside the picture', () => expect(doorFits([1240, 190, 190, 560], res)).toBe(true));
  it.each([
    ['outside on the right', [1500, 10, 50, 50]],
    ['outside at the bottom', [10, 850, 50, 20]],
    ['negative', [-1, 0, 20, 20]],
    ['too small', [10, 10, 7, 40]],
    ['not whole numbers', [10.5, 10, 20, 20]],
    ['three numbers', [10, 10, 20]],
    ['not an array', 'door'],
  ])('refuses a box %s', (_n, door) => expect(doorFits(door, res)).toBe(false));
});

describe('sideRooms', () => {
  const walkway = place('hicks-walkway', 'karasu/hicks-gallery');
  const rooms = [
    room('karasu/hicks-gallery', 'Walkway', [exit('karasu/hicks-room'), exit('karasu/zhou-flat')]),
    room('karasu/hicks-room', 'Room', [exit('karasu/hicks-gallery'), exit('karasu/dead-blocks')]),
    room('karasu/zhou-flat', 'Flat', [exit('karasu/hicks-gallery')]),
    room('karasu/dead-blocks', 'The Dead Blocks', [exit('karasu/hicks-room'), exit('karasu/sixth-floor')]),
    room('karasu/sixth-floor', 'The Sixth Floor', [exit('karasu/dead-blocks')]),
  ];

  it('lists the rooms reached through a pinned room, nested by the way in, with side places by their map names', () => {
    const m = map([walkway, place('hicks-room', 'karasu/hicks-room', { name: "Hicks's room", side: true }), place('zhou-flat', 'karasu/zhou-flat', { name: "The twins' place", side: true })]);
    expect(sideRooms(m, rooms).get('hicks-walkway')).toEqual([
      { room: 'karasu/hicks-room', name: "Hicks's room", inside: [{ room: 'karasu/dead-blocks', name: 'The Dead Blocks', inside: [{ room: 'karasu/sixth-floor', name: 'The Sixth Floor', inside: [] }] }] },
      { room: 'karasu/zhou-flat', name: "The twins' place", inside: [] },
    ]);
  });

  it('stops at pinned rooms, and a room reached from two pins goes to the nearer, then the first on the map', () => {
    const alley = place('alley', 'karasu/dead-blocks');
    const got = sideRooms(map([walkway, alley]), rooms);
    expect(got.get('hicks-walkway')).toEqual([
      { room: 'karasu/hicks-room', name: 'Room', inside: [] },
      { room: 'karasu/zhou-flat', name: 'Flat', inside: [] },
    ]);
    expect(got.get('alley')).toEqual([{ room: 'karasu/sixth-floor', name: 'The Sixth Floor', inside: [] }]);
  });

  it('a room reached from two pins goes to the nearer, even when the farther comes first on the map', () => {
    const far = place('far', 'karasu/far');
    const near = place('near', 'karasu/near');
    const rs = [room('karasu/far', 'Far', [exit('karasu/hall')]), room('karasu/hall', 'Hall', [exit('karasu/den')]), room('karasu/near', 'Near', [exit('karasu/den')]), room('karasu/den', 'Den')];
    const got = sideRooms(map([far, near]), rs);
    expect(got.get('far')).toEqual([{ room: 'karasu/hall', name: 'Hall', inside: [] }]);
    expect(got.get('near')).toEqual([{ room: 'karasu/den', name: 'Den', inside: [] }]);
  });

  it('a room the same distance from two pins goes to the first on the map', () => {
    const rs = [room('karasu/a', 'A', [exit('karasu/den')]), room('karasu/b', 'B', [exit('karasu/den')]), room('karasu/den', 'Den')];
    expect([...sideRooms(map([place('b', 'karasu/b'), place('a', 'karasu/a')]), rs).keys()]).toEqual(['b']);
    expect([...sideRooms(map([place('a', 'karasu/a'), place('b', 'karasu/b')]), rs).keys()]).toEqual(['a']);
  });

  it('a pin with nothing inside has no entry, and a room no exit leads to is never listed', () => {
    const got = sideRooms(map([place('stall', 'karasu/noodle-stall')]), [room('karasu/noodle-stall', 'Stall'), room('karasu/nix-apartment', 'Home', [exit('karasu/noodle-stall')])]);
    expect(got.size).toBe(0);
  });

  it('skips an exit to a room that has no scene', () => {
    expect(sideRooms(map([walkway]), [room('karasu/hicks-gallery', 'Walkway', [exit('karasu/nowhere')])]).size).toBe(0);
  });
});
