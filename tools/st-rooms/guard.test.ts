import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ALLOW, checkShipList, publicAudio } from './guard';

const credits = fs.readFileSync(path.join(__dirname, '../../sounds/CREDITS.md'), 'utf8');
const allowed = publicAudio(credits);

describe('publish guard', () => {
  it('a restricted sound stops it', () => {
    expect(checkShipList(['rooms/noodle-stall/sound/street-crowd-sizzle.ogg'], allowed, PACKAGE_ALLOW)).toEqual(['rooms/noodle-stall/sound/street-crowd-sizzle.ogg']);
  });

  it('songs pass', () => {
    expect(checkShipList(['rooms/_music/Nix.ogg', 'rooms/_music/What Hae Serves.ogg'], allowed, PACKAGE_ALLOW)).toEqual([]);
  });

  it('outside the allowlist stops it', () => {
    expect(checkShipList(['art/nix/nix.kra', 'data/settings.json'], allowed, PACKAGE_ALLOW)).toEqual(['art/nix/nix.kra', 'data/settings.json']);
  });

  it('the real credits: songs and CC0 in, Sonniss and mixes out', () => {
    expect(checkShipList(['rooms/_music/Nix.ogg'], allowed, PACKAGE_ALLOW)).toEqual([]);
    expect(checkShipList(['sound/rain-light.ogg', 'rooms/lowlight-intake/sound/office-heater.ogg'], allowed, PACKAGE_ALLOW)).toHaveLength(2);
    expect([...allowed].length).toBeGreaterThanOrEqual(10);
  });

  it('audio is cleared by its path, not its name: a restricted file named like a cleared one stops it', () => {
    const credits = '| `mission/fail.ogg` | x | CC0 · Glitch Noises | none |\n| `papers/fail.ogg` | y | GDC 2019 · Sonniss | none |';
    const ok = publicAudio(credits);
    expect(checkShipList(['sound/mission/fail.ogg'], ok, PACKAGE_ALLOW)).toEqual([]);
    expect(checkShipList(['sound/papers/fail.ogg'], ok, PACKAGE_ALLOW)).toEqual(['sound/papers/fail.ogg']);
  });

  it("the package's own CC0 credits add their files", () => {
    const pkg = publicAudio('| `sound/rain-light.ogg` | rain | CC0 · Freesound · someone | none |');
    expect(checkShipList(['sound/rain-light.ogg'], pkg, PACKAGE_ALLOW)).toEqual([]);
  });

  it('an allowed tree passes: the bundle, rooms, map, cast, licenses', () => {
    const tree = ['index.js', 'lowlight-room.js', 'style.css', 'manifest.json', 'rooms.json', 'rooms/the-tilt/room.png', 'rooms/the-tilt/scene.json', 'map/lowlight.webp', 'cast/cast.json', 'cast/cards/Cass.png', 'LICENSE', 'CONTENT-LICENSE', 'README.md', 'CHANGELOG.md', 'CREDITS.md', 'sound-map.json'];
    expect(checkShipList(tree, allowed, PACKAGE_ALLOW)).toEqual([]);
  });
});
