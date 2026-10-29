// Builds the Lowlight Rooms extension for SillyTavern: the renderer bundle, the glue and the rooms.
//   npm run st-rooms                                    (Intake + noodle stall)
//   npm run st-rooms -- --rooms all
//   npm run st-rooms -- --rooms the-tilt,noodle-stall --out <SillyTavern>/data/default-user/extensions/lowlight-rooms
import fs from 'node:fs';
import { copyMapRender } from './map-copy';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { mapRules } from './map-rules';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** --public: the package build. No restricted sound ships: rooms lose their sound/ folders, and rain, thunder, room beds
 * and menu cues are the CC0 picks in cc0-sounds.json (files in tools/st-rooms/cc0/), or silent. */
const isPublic = process.argv.includes('--public');

const out = path.resolve(arg('out') ?? path.join(os.homedir(), 'Projects/SillyTavern/data/default-user/extensions/lowlight-rooms'));

/** Every room folder in scenes/<district>/<folder>/ with a scene.json, by folder name. */
function roomFolders(): Map<string, string> {
  const found = new Map<string, string>();
  const scenes = path.join(repo, 'scenes');
  for (const district of fs.readdirSync(scenes, { withFileTypes: true })) {
    if (!district.isDirectory()) continue;
    for (const room of fs.readdirSync(path.join(scenes, district.name), { withFileTypes: true })) {
      const dir = path.join(scenes, district.name, room.name);
      if (room.isDirectory() && fs.existsSync(path.join(dir, 'scene.json'))) found.set(room.name, dir);
    }
  }
  return found;
}

const all = roomFolders();
const wanted = (arg('rooms') ?? 'lowlight-intake,noodle-stall').split(',').map((r) => r.trim()).filter(Boolean);
const rooms = wanted.length === 1 && wanted[0] === 'all' ? [...all.keys()].sort() : wanted;
const missing = rooms.filter((r) => !all.has(r));
if (missing.length) {
  console.error(`No room folder: ${missing.join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
await build({
  root: repo,
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: out,
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: path.join(here, 'entry.ts'), formats: ['es'], fileName: () => 'lowlight-room.js', cssFileName: 'lowlight-room' },
    // One file, so a rebuild never leaves stale chunks in the extension folder.
    rollupOptions: { output: { codeSplitting: false } },
  },
});

for (const file of fs.readdirSync(path.join(here, 'extension'))) {
  fs.copyFileSync(path.join(here, 'extension', file), path.join(out, file));
}

// Rooms: replaced wholesale, sounds included (not in a public build). Their districts' songs go flat in rooms/_music/
// (a room without a district reads its songs from its base's _music/).
fs.rmSync(path.join(out, 'rooms'), { recursive: true, force: true });
for (const room of rooms) {
  fs.cpSync(all.get(room)!, path.join(out, 'rooms', room), { recursive: true, filter: (src) => !(isPublic && path.basename(src) === 'sound') });
}
fs.mkdirSync(path.join(out, 'rooms', '_music'), { recursive: true });
for (const district of fs.readdirSync(path.join(repo, 'scenes'))) {
  const music = path.join(repo, 'scenes', district, '_music');
  if (!fs.existsSync(music)) continue;
  for (const song of fs.readdirSync(music)) {
    const to = path.join(out, 'rooms', '_music', song);
    if (fs.existsSync(to)) throw new Error(`Two districts have a song called ${song}`);
    fs.copyFileSync(path.join(music, song), to);
  }
}

// The shared sounds, and sound-map.json saying which exist (the extension asks for nothing else): the game's own
// recordings for the author's own build; the CC0 picks for a public one.
interface SoundMap {
  rain: { light: string; heavy: string } | null;
  thunder: string[];
  /** Public builds: each room's CC0 bed (null: the rooms' own beds). */
  beds: Record<string, { src: string; level: number }> | null;
  cues: Record<string, string>;
}
fs.rmSync(path.join(out, 'sound'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'sound'), { recursive: true });
let soundMap: SoundMap;
if (isPublic) {
  const cc0 = JSON.parse(fs.readFileSync(path.join(here, 'cc0-sounds.json'), 'utf8')) as Omit<SoundMap, 'thunder'> & { thunder: string[] };
  const files = [
    ...(cc0.rain ? [cc0.rain.light, cc0.rain.heavy] : []),
    ...cc0.thunder.map((t) => `thunder/${t}`),
    ...Object.values(cc0.beds ?? {}).map((b) => b.src),
    ...Object.values(cc0.cues),
  ];
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(out, 'sound', f)), { recursive: true });
    fs.copyFileSync(path.join(here, 'cc0', f), path.join(out, 'sound', f));
  }
  soundMap = { rain: cc0.rain, thunder: cc0.thunder, beds: cc0.beds ?? {}, cues: cc0.cues };
} else {
  for (const f of ['rain-light.ogg', 'rain-heavy.ogg']) fs.copyFileSync(path.join(repo, 'web', 'public', 'sound', f), path.join(out, 'sound', f));
  fs.cpSync(path.join(repo, 'web', 'public', 'sound', 'thunder'), path.join(out, 'sound', 'thunder'), { recursive: true });
  // The menu cues (the select screen's move, lock and VS).
  fs.cpSync(path.join(repo, 'web', 'public', 'sound', 'ui'), path.join(out, 'sound', 'ui'), { recursive: true });
  soundMap = {
    rain: { light: 'rain-light.ogg', heavy: 'rain-heavy.ogg' },
    thunder: fs.readdirSync(path.join(out, 'sound', 'thunder')),
    beds: null,
    cues: Object.fromEntries(fs.readdirSync(path.join(out, 'sound', 'ui')).map((f) => [f.replace(/\.ogg$/, ''), `ui/${f}`])),
  };
}
fs.writeFileSync(path.join(out, 'sound-map.json'), JSON.stringify(soundMap));

fs.writeFileSync(path.join(out, 'rooms.json'), JSON.stringify(rooms));
// Each room's name and district (the map's name for it), for her room line: { folder: { name, district } }.
const districtNames = new Map<string, string>(
  ((JSON.parse(fs.readFileSync(path.join(repo, 'map', 'lowlight.json'), 'utf8')) as { districts?: { id: string; name: string }[] }).districts ?? []).map((d) => [d.id, d.name]),
);
const meta: Record<string, { name: string; district: string | null }> = {};
for (const room of rooms) {
  const dir = all.get(room)!;
  const sceneName = (JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8')) as { name?: string }).name ?? room;
  meta[room] = { name: sceneName, district: districtNames.get(path.basename(path.dirname(dir))) ?? null };
}
fs.writeFileSync(path.join(out, 'rooms-meta.json'), JSON.stringify(meta));

// The city map: its data and picture, and the map's rules from the game's stylesheet (its own map.css is in the bundle).
fs.mkdirSync(path.join(out, 'map'), { recursive: true });
fs.copyFileSync(path.join(repo, 'map', 'lowlight.json'), path.join(out, 'map', 'lowlight.json'));
fs.copyFileSync(path.join(repo, 'web', 'public', 'map', 'lowlight.webp'), path.join(out, 'map', 'lowlight.webp'));
// The rendered city map, when there's a render (spec 2026-10-25 §6): the package's map shows it in place of the painting.
if (copyMapRender(repo, out)) console.log('The rendered city map: copied.');
fs.writeFileSync(path.join(out, 'map-game.css'), mapRules(fs.readFileSync(path.join(repo, 'web', 'src', 'ui', 'style.css'), 'utf8')));

console.log(`Lowlight Rooms → ${out}\n${rooms.length} rooms: ${rooms.join(', ')}\nReload SillyTavern to pick it up.`);
