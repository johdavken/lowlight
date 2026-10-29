// Exports Lowlight's cast into SillyTavern: a card per character (with their face as the avatar, their faces as
// whole-figure expression sprites, Lowlight's lore book and roleplay guide), and the playable ones as personas.
//   npm run st-cast                        (skips cards SillyTavern already has: your chats and edits stay)
//   npm run st-cast -- --replace           (rewrites those cards too)
//   npm run st-cast -- --user <SillyTavern>/data/default-user
// Personas: their pictures go into User Avatars/, and the extension adds their names and descriptions on its next
// load (cast.json), never overwriting a persona you've edited. Reload SillyTavern afterwards.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cardData, labelFaces, pngWithCard } from './cast';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const user = path.resolve(arg('user') ?? path.join(os.homedir(), 'Projects/SillyTavern/data/default-user'));
const extension = path.join(user, 'extensions', 'lowlight-rooms');
const replace = process.argv.includes('--replace');
if (!fs.existsSync(path.join(user, 'characters'))) {
  console.error(`No SillyTavern user folder at ${user}`);
  process.exit(1);
}

interface CharacterJson {
  name: string;
  tagline?: string;
  accent?: string;
  pronoun?: string;
  facts?: { label: string; value: string }[];
  rooms?: string[];
  schedule?: { room: string }[];
  identity?: string;
  sprite: { src: string };
  expressions?: Record<string, string>;
  outfits?: Record<string, string>;
}

/** Who goes over: Lowlight's folder, and whether they're playable (a persona: they have a bio). `nix` is the old base nix-direct extends. */
const CAST = fs
  .readdirSync(path.join(repo, 'characters'))
  .filter((id) => id !== 'nix' && fs.existsSync(path.join(repo, 'characters', id, 'character.json')));

const src = fs.readFileSync(path.join(repo, 'server', 'src', 'instructions.ts'), 'utf8');
const guide = /export const ROLEPLAY_GUIDE = `([\s\S]*?)`;/.exec(src)![1]
  // Lowlight-only: the renderer note and the clock tool.
  .replace(' This room renders that markup, and it overrides any general instruction to write plain text or avoid asterisks.', '')
  .replace(/ When the story skips ahead[\s\S]*$/, '');

/** One of their real greetings from the newest playthrough that has one ('' when none). */
function greeting(id: string): string {
  const root = path.join(repo, 'data', 'playthroughs');
  if (!fs.existsSync(root)) return '';
  const dbs = fs
    .readdirSync(root)
    .map((pt) => path.join(root, pt, 'chars', id, 'room.db'))
    .filter((f) => fs.existsSync(f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const f of dbs) {
    try {
      const db = new DatabaseSync(f, { readOnly: true });
      const row = db.prepare("SELECT text FROM messages WHERE mode = 'greet' AND role = 'agent' AND status = 'ok' AND length(text) BETWEEN 120 AND 1200 ORDER BY id DESC LIMIT 1").get() as { text?: string } | undefined;
      db.close();
      if (row?.text) return row.text.trim();
    } catch {
      // A locked or old database: try the next.
    }
  }
  return '';
}

/** Their sprite with `face` laid over it (Lowlight's faces are face-only, on the sprite's canvas). */
async function figure(dir: string, sprite: string, face?: string): Promise<Buffer> {
  const base = sharp(path.join(dir, sprite));
  return face ? base.composite([{ input: path.join(dir, face) }]).png().toBuffer() : base.png().toBuffer();
}

/** A square crop around their face, on the Intake's violet (SillyTavern's thumbnails turn transparency black). */
async function avatar(fig: Buffer, faceFile: string | undefined, dir: string): Promise<Buffer> {
  let box = { left: 380, top: 40, width: 300, height: 300 };
  if (faceFile) {
    const { info } = await sharp(path.join(dir, faceFile)).trim().toBuffer({ resolveWithObject: true });
    const cx = -(info.trimOffsetLeft ?? 0) + info.width / 2;
    const cy = -(info.trimOffsetTop ?? 0) + info.height / 2;
    const side = Math.round(Math.max(info.width, info.height) * 2.2);
    box = { left: Math.max(0, Math.round(cx - side / 2)), top: Math.max(0, Math.round(cy - side / 2.4)), width: side, height: side };
  }
  const meta = await sharp(fig).metadata();
  box.width = Math.min(box.width, meta.width! - box.left);
  box.height = Math.min(box.height, meta.height! - box.top);
  return sharp(fig)
    .extract(box)
    .resize(480, 480, { kernel: 'nearest' })
    .flatten({ background: { r: 26, g: 16, b: 48 } })
    .png()
    .toBuffer();
}

/** Residents' rooms: the scene that names them as its resident (Hae at the noodle stall). */
const residentRoom = new Map<string, string>();
for (const district of fs.readdirSync(path.join(repo, 'scenes'))) {
  const dDir = path.join(repo, 'scenes', district);
  if (!fs.statSync(dDir).isDirectory()) continue;
  for (const room of fs.readdirSync(dDir)) {
    const f = path.join(dDir, room, 'scene.json');
    if (!fs.existsSync(f)) continue;
    const who = (JSON.parse(fs.readFileSync(f, 'utf8')) as { resident?: { character?: string } }).resident?.character;
    if (who) residentRoom.set(who, room);
  }
}

const personas: { file: string; name: string; description: string }[] = [];
/** What the select screen shows for each character (by their SillyTavern name): tagline, facts, accent, home room folder. */
const characters: { name: string; tagline: string; facts: { label: string; value: string }[]; accent: string | null; home: string | null }[] = [];
const report: string[] = [];
for (const id of CAST) {
  const dir = path.join(repo, 'characters', id);
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8')) as CharacterJson;
  const identity = c.identity && fs.existsSync(path.join(dir, c.identity)) ? c.identity : fs.existsSync(path.join(dir, 'voice.md')) ? 'voice.md' : null;
  if (!identity) continue;
  const faces = c.expressions ?? {};
  const firstFace = Object.values(faces)[0];

  // Expression sprites: SillyTavern's labels → whole figures; neutral = the sprite as it is.
  const sprites = path.join(user, 'characters', c.name);
  fs.mkdirSync(sprites, { recursive: true });
  const figures = new Map<string, Buffer>();
  for (const [face, file] of Object.entries(faces)) figures.set(face, await figure(dir, c.sprite.src, file));
  for (const [label, face] of Object.entries(labelFaces(Object.keys(faces)))) fs.writeFileSync(path.join(sprites, `${label}.png`), figures.get(face)!);
  fs.writeFileSync(path.join(sprites, 'neutral.png'), await figure(dir, c.sprite.src));

  // The card: kept if SillyTavern already has it (unless --replace), so chats and edits there stay.
  const cardFile = path.join(user, 'characters', `${c.name}.png`);
  const had = fs.existsSync(cardFile);
  if (!had || replace) {
    const face = Object.entries(faces).find(([k]) => k === 'annoyed')?.[1] ?? firstFace;
    const pic = await avatar(await figure(dir, c.sprite.src, face), face, dir);
    const card = cardData({ name: c.name, description: fs.readFileSync(path.join(dir, identity), 'utf8').trim(), firstMes: greeting(id), systemPrompt: guide, world: 'Lowlight' });
    fs.writeFileSync(cardFile, pngWithCard(pic, card));
    fs.rmSync(path.join(user, 'thumbnails', 'avatar', `${c.name}.png`), { force: true });
  }

  // Playable (a bio): a persona, their whole figure as the picture (it stands on the left of the stage).
  const bioDir = fs.existsSync(path.join(dir, 'bio.md')) ? dir : id === 'nix-direct' ? path.join(repo, 'characters', 'nix') : null;
  if (bioDir && fs.existsSync(path.join(bioDir, 'bio.md'))) {
    const file = `${id === 'nix-direct' ? 'nix' : id}.png`;
    const pic = path.join(user, 'User Avatars', file);
    if (!fs.existsSync(pic) || replace) {
      fs.writeFileSync(pic, await figure(dir, c.sprite.src));
      fs.rmSync(path.join(user, 'thumbnails', 'persona', file), { force: true });
    }
    personas.push({ file, name: c.name, description: fs.readFileSync(path.join(bioDir, 'bio.md'), 'utf8').trim() });
  }
  // A character that extends another (nix-direct → nix) takes its select details from there when it has none.
  const base = (c as { extends?: string }).extends ? (JSON.parse(fs.readFileSync(path.join(repo, 'characters', (c as { extends?: string }).extends!, 'character.json'), 'utf8')) as CharacterJson) : null;
  const home = c.rooms?.[0] ?? c.schedule?.[0]?.room ?? residentRoom.get(id) ?? null;
  characters.push({
    name: c.name,
    tagline: c.tagline ?? base?.tagline ?? '',
    facts: c.facts ?? base?.facts ?? [],
    accent: c.accent ?? base?.accent ?? null,
    home: home ? home.split('/').pop()! : null,
  });
  report.push(`${c.name}${had && !replace ? ' (card kept)' : ''}`);
}

fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(path.join(extension, 'cast.json'), JSON.stringify({ personas, characters }, null, 2));
console.log(`Cast → ${user}\n${report.length} characters: ${report.join(', ')}\n${personas.length} personas: ${personas.map((p) => p.name).join(', ')}\nReload SillyTavern to see them.`);
