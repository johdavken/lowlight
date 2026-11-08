import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeRooms, homeWear, homeWearAtTheDoor, waysIn, type RoomLink } from './home-wear';

// A walkway with two flats off it (one reached through the walkway's door, one whose door leads out to it), and a bar.
const city: RoomLink[] = [
  { id: 'k/walkway', entry: true, exits: [{ to: 'k/his-room' }, { to: 'k/twins' }] },
  { id: 'k/his-room', exits: [{ to: 'k/walkway' }] },
  { id: 'k/twins', exits: [{ to: 'k/walkway' }] },
  { id: 'k/landing', entry: true },
  { id: 'k/her-flat', exits: [{ to: 'k/landing' }] },
  { id: 'k/bar' },
  { id: 'k/office' },
];
const ways = waysIn(city);

describe('home wear', () => {
  it('a way in leads to the rooms behind its doors, whichever side the exit is written on', () => {
    expect([...ways.keys()].sort()).toEqual(['k/landing', 'k/walkway']);
    expect([...ways.get('k/walkway')!].sort()).toEqual(['k/his-room', 'k/twins']);
    expect([...ways.get('k/landing')!]).toEqual(['k/her-flat']);
  });

  it('her home rooms are hers behind a door: never the walkway, never a room with no way in', () => {
    expect(homeRooms(['k/twins', 'k/walkway'], ways)).toEqual(['k/twins']);
    expect(homeRooms(['k/office', 'k/her-flat', 'k/landing'], ways)).toEqual(['k/her-flat']);
  });

  it('home wear is what home puts her in and nothing outside her rooms does; never her base', () => {
    const ember = { rooms: ['k/twins', 'k/walkway'], byScene: { 'k/twins': 'home', 'k/walkway': 'home', 'k/bar': 'indoors' }, base: 'outdoors' };
    expect([...homeWear(ember, ways)]).toEqual(['home']);
    // An outfit she also wears at the bar isn't home wear, even if home puts her in it.
    expect([...homeWear({ ...ember, byScene: { 'k/twins': 'indoors', 'k/bar': 'indoors' } }, ways)]).toEqual([]);
    expect([...homeWear({ ...ember, byScene: { 'k/twins': 'outdoors' } }, ways)]).toEqual([]);
  });

  it('flags a way in that dresses her in home wear, and only that', () => {
    const ember = { rooms: ['k/twins', 'k/walkway'], byScene: { 'k/twins': 'home', 'k/walkway': 'home', 'k/bar': 'indoors' }, base: 'outdoors' };
    expect(homeWearAtTheDoor(ember, ways)).toEqual({ 'k/walkway': 'home' });
    expect(homeWearAtTheDoor({ ...ember, byScene: { ...ember.byScene, 'k/walkway': 'indoors' } }, ways)).toEqual({});
    // Her office outfit isn't home wear: the office is hers but isn't behind a way in.
    const nix = { rooms: ['k/office', 'k/her-flat', 'k/landing'], byScene: { 'k/office': 'indoors', 'k/her-flat': 'home', 'k/landing': 'indoors' } };
    expect(homeWearAtTheDoor(nix, ways)).toEqual({});
    expect(homeWearAtTheDoor({ ...nix, byScene: { ...nix.byScene, 'k/landing': 'home' } }, ways)).toEqual({ 'k/landing': 'home' });
  });
});

// The shipped cast and city: nobody's scene map puts them in home wear on a walkway or landing.
describe('characters/ and scenes/', () => {
  const scenes: (RoomLink & { resident?: { character: string } })[] = [];
  for (const district of fs.readdirSync('scenes')) {
    if (district === 'lowlight' || !fs.statSync(path.join('scenes', district)).isDirectory()) continue;
    for (const folder of fs.readdirSync(path.join('scenes', district))) {
      const file = path.join('scenes', district, folder, 'scene.json');
      if (fs.existsSync(file)) scenes.push({ ...JSON.parse(fs.readFileSync(file, 'utf8')), id: `${district}/${folder}` });
    }
  }
  const cityWays = waysIn(scenes);

  it("Hicks's walkway and Nix's walk-up are ways in", () => {
    expect([...cityWays.get('karasu/hicks-gallery')!].sort()).toEqual(['karasu/hicks-room', 'karasu/zhou-flat']);
    expect([...cityWays.get('karasu/walk-up-landing')!]).toEqual(['karasu/nix-apartment']);
  });

  for (const id of fs.readdirSync('characters').filter((d) => fs.existsSync(path.join('characters', d, 'character.json')))) {
    it(`${id} wears no home wear at anyone's door`, () => {
      const c = JSON.parse(fs.readFileSync(path.join('characters', id, 'character.json'), 'utf8'));
      const rooms: string[] = c.rooms ?? scenes.filter((s) => s.resident?.character === id).map((s) => s.id);
      const outfits: Record<string, string> = c.outfits ?? {};
      const src = typeof c.sprite === 'string' ? c.sprite : c.sprite?.src;
      const base = Object.keys(outfits).find((n) => outfits[n] === src) ?? null;
      expect(homeWearAtTheDoor({ rooms, byScene: c.outfitByScene ?? {}, base }, cityWays)).toEqual({});
    });
  }
});
