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

// Rooms: replaced wholesale, sounds included. Their districts' songs go flat in rooms/_music/ (a room without a
// district reads its songs from its base's _music/).
fs.rmSync(path.join(out, 'rooms'), { recursive: true, force: true });
for (const room of rooms) fs.cpSync(all.get(room)!, path.join(out, 'rooms', room), { recursive: true });
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

// The shared rain and thunder recordings.
fs.rmSync(path.join(out, 'sound'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'sound'), { recursive: true });
for (const f of ['rain-light.ogg', 'rain-heavy.ogg']) fs.copyFileSync(path.join(repo, 'web', 'public', 'sound', f), path.join(out, 'sound', f));
fs.cpSync(path.join(repo, 'web', 'public', 'sound', 'thunder'), path.join(out, 'sound', 'thunder'), { recursive: true });
// The menu cues (the select screen's move, lock and VS).
fs.cpSync(path.join(repo, 'web', 'public', 'sound', 'ui'), path.join(out, 'sound', 'ui'), { recursive: true });
fs.writeFileSync(path.join(out, 'rooms.json'), JSON.stringify(rooms));

// The city map: its data and picture, and the map's rules from the game's stylesheet (its own map.css is in the bundle).
fs.mkdirSync(path.join(out, 'map'), { recursive: true });
fs.copyFileSync(path.join(repo, 'map', 'lowlight.json'), path.join(out, 'map', 'lowlight.json'));
fs.copyFileSync(path.join(repo, 'web', 'public', 'map', 'lowlight.webp'), path.join(out, 'map', 'lowlight.webp'));
// The rendered city map, when there's a render (spec 2026-10-25 §6): the package's map shows it in place of the painting.
if (copyMapRender(repo, out)) console.log('The rendered city map: copied.');
fs.writeFileSync(path.join(out, 'map-game.css'), mapRules(fs.readFileSync(path.join(repo, 'web', 'src', 'ui', 'style.css'), 'utf8')));

console.log(`Lowlight Rooms → ${out}\n${rooms.length} rooms: ${rooms.join(', ')}\nReload SillyTavern to pick it up.`);
