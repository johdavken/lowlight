import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { audioStatus, uncredited, uncreditedSources } from './credits';
import { awkwardTemp, writeTree } from './fixture';

/** CREDITS.md as sounds/CREDITS.md writes it: a scene table with Used by, the shared table, music, Studio's picks, splash lines. */
const CREDITS = `# Sound credits

Replaced \`scenes/r/_music/Old.ogg\` on 2026-10-06; see \`world/splash/old.png\` too.

## Files

| File (in each scene folder) | Used by | Source | Edits |
|---|---|---|---|
| \`sound/bed.ogg\` † | r/a, q/c | GDC · \`orig.wav\` | loop |

### Shared (all scenes): \`web/public/sound/\`

| File | Used for | Source | Edits |
|---|---|---|---|
| \`rain.ogg\` † | Rain | GDC | loop |
| \`ui/click.ogg\` | Select | GDC | fade |

## Music

| File | Used for | Source | Edits |
|---|---|---|---|
| \`scenes/r/_music/Song (Remastered).ogg\` | Theme | Suno | full |
| \`web/public/sound/music/Theme.ogg\` | Title | Suno | full |

## Library picks

- a: sound/keep/kettle.ogg ← GDC / Foley / kettle.wav (Sonniss GDC bundle, royalty-free)

## Splash images

- \`world/splash/pic.png\` — made by Farban
- \`world/districts/karasu.webp\` — made by ChatGPT
`;

describe('uncredited', () => {
  let tmp: string;
  let stage: string;
  let webDist: string;
  beforeEach(() => {
    tmp = awkwardTemp('credits');
    stage = path.join(tmp, 'stage');
    webDist = path.join(tmp, 'web');
    writeTree(stage, {
      'scenes/r/a/sound/bed.ogg': 'ogg',
      'scenes/r/a/sound/keep/kettle.ogg': 'ogg',
      'scenes/r/a/room.png': 'png',
      'scenes/r/_music/Song (Remastered).ogg': 'ogg',
      'world/splash/pic.png': 'png',
      'world/splash/splashes.json': '{}',
      'world/districts/karasu.webp': 'webp',
      'world/districts/districts.json': '{}',
    });
    writeTree(webDist, { 'sound/rain.ogg': 'ogg', 'sound/ui/click.ogg': 'ogg', 'sound/music/Theme.ogg': 'ogg', 'index.html': '' });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('passes every file CREDITS lists, in each of its forms', () => {
    expect(uncredited(stage, webDist, CREDITS)).toEqual([]);
  });

  it('lists every uncredited audio and splash file, never room art or splashes.json', () => {
    expect(uncredited(stage, webDist, '')).toEqual([
      'scenes/r/_music/Song (Remastered).ogg',
      'scenes/r/a/sound/bed.ogg',
      'scenes/r/a/sound/keep/kettle.ogg',
      'web/sound/music/Theme.ogg',
      'web/sound/rain.ogg',
      'web/sound/ui/click.ogg',
      'world/districts/karasu.webp',
      'world/splash/pic.png',
    ]);
  });

  it('a menu-only theme song in world/splash/music/ needs a credit too; history/ never does', () => {
    writeTree(stage, { 'world/splash/music/Neon Rain.ogg': 'ogg', 'world/splash/history/2026-old.ogg': 'ogg' });
    expect(uncredited(stage, webDist, CREDITS)).toEqual(['world/splash/music/Neon Rain.ogg']);
    expect(uncredited(stage, webDist, `${CREDITS}\n- \`world/splash/music/Neon Rain.ogg\` — made by Farban\n`)).toEqual([]);
  });

  it("a room's own sound is credited only for the rooms its Used by names (minor)", () => {
    writeTree(stage, { 'scenes/q/b/sound/bed.ogg': 'ogg', 'scenes/q/c/sound/bed.ogg': 'ogg' });
    expect(uncredited(stage, webDist, CREDITS)).toEqual(['scenes/q/b/sound/bed.ogg']);
  });

  it('a path mentioned in prose is not a credit (minor)', () => {
    writeTree(stage, { 'scenes/r/_music/Old.ogg': 'ogg', 'world/splash/old.png': 'png' });
    expect(uncredited(stage, webDist, CREDITS)).toEqual(['scenes/r/_music/Old.ogg', 'world/splash/old.png']);
  });

  it("a web sound isn't credited by a scene's music line that ends the same way (minor)", () => {
    writeTree(webDist, { 'sound/music/Song (Remastered).ogg': 'ogg' });
    expect(uncredited(stage, webDist, CREDITS)).toEqual(['web/sound/music/Song (Remastered).ogg']);
  });

  it('uncreditedSources reads the repo in place (no stage): shipped packs, web/public/sound, the splash library minus history (minor)', () => {
    const repo = awkwardTemp('repo');
    writeTree(repo, {
      'scenes/r/a/sound/bed.ogg': 'ogg',
      'scenes/r/_music/Song (Remastered).ogg': 'ogg',
      'scenes/q/b/sound/other.ogg': 'ogg',
      'web/public/sound/rain.ogg': 'ogg',
      'web/public/sound/ui/click.ogg': 'ogg',
      'web/public/sound/music/Theme.ogg': 'ogg',
      'web/public/_audition/try.ogg': 'ogg',
      'world/splash/pic.png': 'png',
      'world/splash/history/old.png': 'png',
    });
    expect(uncreditedSources(repo, ['r'], CREDITS)).toEqual([]);
    expect(uncreditedSources(repo, ['r', 'q'], CREDITS)).toEqual(['scenes/q/b/sound/other.ogg']);
    expect(uncreditedSources(repo, ['r'], '')).toEqual(['scenes/r/_music/Song (Remastered).ogg', 'scenes/r/a/sound/bed.ogg', 'web/sound/music/Theme.ogg', 'web/sound/rain.ogg', 'web/sound/ui/click.ogg', 'world/splash/pic.png']);
  });

  it('a Patrons section credits no files, even a name that looks like a credit line', () => {
    const repo = awkwardTemp('repo');
    writeTree(repo, {
      'scenes/r/a/sound/bed.ogg': 'ogg',
      'scenes/r/a/sound/keep/sneaky.ogg': 'ogg',
      'web/public/sound/extra.ogg': 'ogg',
      'world/splash/pic.png': 'png',
    });
    const patrons = `
## Patrons

Thank you to everyone on Patreon who backs Lowlight.

- Ada
- \`web/public/sound/extra.ogg\` Fan
- a: sound/keep/sneaky.ogg ← Zed
`;
    const without = uncreditedSources(repo, ['r'], CREDITS);
    expect(without).toEqual(['scenes/r/a/sound/keep/sneaky.ogg', 'web/sound/extra.ogg']);
    expect(uncreditedSources(repo, ['r'], CREDITS + patrons)).toEqual(without);
  });

  it('a section after Patrons still credits its files (minor)', () => {
    const repo = awkwardTemp('repo');
    writeTree(repo, { 'web/public/sound/extra.ogg': 'ogg' });
    const text = '## Patrons\n\n- Ada\n\n## Later sounds\n\n- `web/public/sound/extra.ogg` — GDC\n';
    expect(uncreditedSources(repo, [], text)).toEqual([]);
  });

  it('the real CREDITS.md still credits what it lists (scene rows and shared sounds included)', () => {
    const repo = path.join(__dirname, '..', '..');
    const text = fs.readFileSync(path.join(repo, 'sounds', 'CREDITS.md'), 'utf8');
    writeTree(stage, {
      'scenes/karasu/the-tilt/sound/AMBIENT_-_Small_Cafe_Interior_-_01.ogg': 'ogg',
      'scenes/karasu/lowlight-intake/sound/office-heater.ogg': 'ogg',
      'scenes/karasu/ribbon-rooftop/sound/industry-night.ogg': 'ogg',
      'scenes/karasu/_music/Nix.ogg': 'ogg',
    });
    writeTree(webDist, { 'sound/rain-light.ogg': 'ogg', 'sound/thunder/far-1.ogg': 'ogg', 'sound/music/Lost in Lowlight.ogg': 'ogg' });
    const missing = uncredited(stage, webDist, text);
    for (const f of ['scenes/karasu/the-tilt/sound/AMBIENT_-_Small_Cafe_Interior_-_01.ogg', 'scenes/karasu/lowlight-intake/sound/office-heater.ogg', 'scenes/karasu/ribbon-rooftop/sound/industry-night.ogg', 'scenes/karasu/_music/Nix.ogg', 'web/sound/rain-light.ogg', 'web/sound/thunder/far-1.ogg', 'web/sound/music/Lost in Lowlight.ogg']) {
      expect(missing).not.toContain(f);
    }
  });
});

describe('audioStatus', () => {
  const status = audioStatus(fs.readFileSync('sounds/CREDITS.md', 'utf8'));

  it('reads public and restricted audio from the real CREDITS.md', () => {
    expect(status('web/public/sound/mission/tick.ogg')).toBe('public'); // Glitch Noises
    expect(status('web/public/sound/mission/start.ogg')).toBe('restricted'); // JDSherbert
    expect(status('web/public/sound/mission/read-ok.ogg')).toBe('restricted'); // Bleeoop
    expect(status('web/public/sound/gig/traced.ogg')).toBe('restricted'); // CC0 + Sonniss mix
    expect(status('web/public/sound/ui/move.ogg')).toBe('restricted');
    expect(status('web/public/sound/music/Lost in Lowlight.ogg')).toBe('public'); // Suno
    expect(status('world/splash/music/Glass Floor (Glass Door Remix).ogg')).toBe('public');
    expect(status('scenes/karasu/lowlight-intake/sound/office-heater.ogg')).toBe('public'); // ElevenLabs scene row, Used by
    expect(status('scenes/karasu/the-tilt/sound/AMBIENT_-_Small_Cafe_Interior_-_01.ogg')).toBe('public'); // ElevenLabs, once a Studio pick
    expect(status('web/public/sound/thunder/near-1.ogg')).toBe('public'); // ElevenLabs
    expect(status('web/public/sound/new-thing.ogg')).toBe('unlisted');
  });

  it('a file credited both free and restricted is restricted (final review)', () => {
    const both = audioStatus(`## Music: Suno (Pro plan)

| File | Used for | Source | Edits |
|---|---|---|---|
| \`web/public/sound/x.ogg\` | a | Suno · "X" | — |

## Files

### Shared (all scenes): \`web/public/sound/\`

| File | Used for | Source | Edits |
|---|---|---|---|
| \`x.ogg\` | a | GDC 2017 · y · \`y.wav\` | — |

## Library picks (Sonniss GDC bundles)

- stall: sound/bed.ogg ← Sonniss / x.wav
`);
    expect(both('web/public/sound/x.ogg')).toBe('restricted');
  });

  it('a Studio pick is restricted in any pack', () => {
    const picks = audioStatus('## Library picks (Sonniss GDC bundles)\n\n- stall: sound/keep/bed.ogg ← Sonniss / x.wav\n');
    expect(picks('scenes/karasu/stall/sound/keep/bed.ogg')).toBe('restricted');
    expect(picks('scenes/strand/stall/sound/keep/bed.ogg')).toBe('restricted');
  });

  it('knows every audio file on disk', () => {
    // Read from disk, not git: the public export has no .git, and holds the restricted files back.
    const audio = ['scenes', 'web/public/sound', 'world']
      .flatMap((d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name).split(path.sep).join('/')))
      .filter((f) => /\.(ogg|mp3|wav|flac)$/i.test(f) && !f.startsWith('world/splash/history/'));
    expect(audio.length).toBeGreaterThan(0);
    expect(audio.filter((f) => status(f) === 'unlisted')).toEqual([]);
  });
});
