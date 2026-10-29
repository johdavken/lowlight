import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import os from 'node:os';
import { PACKAGE_ALLOW, checkShipList, publicAudio, publicPackageAudio } from './guard';

const credits = fs.readFileSync(path.join(__dirname, '../../sounds/CREDITS.md'), 'utf8');
const allowed = publicAudio(credits);

describe('publish guard', () => {

  it('songs pass', () => {
    expect(checkShipList(['rooms/_music/Nix.ogg', 'rooms/_music/What Hae Serves.ogg'], allowed, PACKAGE_ALLOW)).toEqual([]);
  });

  it('outside the allowlist stops it', () => {
    expect(checkShipList(['art/nix/nix.kra', 'data/settings.json'], allowed, PACKAGE_ALLOW)).toEqual(['art/nix/nix.kra', 'data/settings.json']);
  });

  it('the real credits: songs, the ElevenLabs rain and room beds, and the CC0 cues go in (CREDITS decides, as for the public repo)', () => {
    const repo = path.join(__dirname, '../..');
    const files = ['rooms/_music/Nix.ogg', 'sound/rain-light.ogg', 'sound/thunder/near-1.ogg', 'rooms/lowlight-intake/sound/office-heater.ogg', 'rooms/noodle-stall/sound/street-crowd-sizzle.ogg', 'sound/mission/tick.ogg', 'sound/music/Glass Floor (Glass Door Remix).ogg'];
    expect(checkShipList(files, publicPackageAudio(files, repo, credits), PACKAGE_ALLOW)).toEqual([]);
  });

  it('a restricted room sound, rain or song stops it, and so does audio CREDITS never mentions', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'st-guard-'));
    for (const f of ['scenes/k/bar/sound/bed.ogg', 'scenes/k/_music/Song.ogg', 'web/public/sound/rain-light.ogg', 'web/public/sound/new.ogg']) {
      fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
      fs.writeFileSync(path.join(repo, f), 'ogg');
    }
    const fixture = [
      '## Files', '', '| File (in each scene folder) | Used by | Source | Edits |', '|---|---|---|---|', '| `sound/bed.ogg` | k/bar | GDC 2017 · x · `a.wav` | — |', '',
      '### Shared (all scenes): `web/public/sound/`', '', '| File | Used for | Source | Edits |', '|---|---|---|---|', '| `rain-light.ogg` | rain | GDC · y · `b.wav` | — |', '',
      '## Music: Suno (Pro plan)', '', '| File | Used for | Source | Edits |', '|---|---|---|---|', '| `scenes/k/_music/Song.ogg` | song | Suno · "Song" | — |', '',
    ].join('\n');
    const files = ['rooms/bar/sound/bed.ogg', 'sound/rain-light.ogg', 'sound/new.ogg', 'rooms/_music/Song.ogg'];
    expect(checkShipList(files, publicPackageAudio(files, repo, fixture), PACKAGE_ALLOW)).toEqual(['rooms/bar/sound/bed.ogg', 'sound/rain-light.ogg', 'sound/new.ogg']);
    fs.rmSync(repo, { recursive: true, force: true });
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
