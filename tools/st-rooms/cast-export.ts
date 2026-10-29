// Lowlight's cast as SillyTavern files: a card per character (their face as the avatar, their identity or voice sheet,
// Lowlight's roleplay guide, the lore book; no greeting: the extension has her write it live), their faces as whole-figure expression sprites, the
// playable ones as personas, and cast.json. Two targets: a package folder (cast/…, what the public package installs
// from) or a SillyTavern user folder (your own, as npm run st-cast always did).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cardData, labelFaces, pngWithCard, type CastCharacter, type CastJson } from './cast';
import { worldInfoFrom } from './lore';

interface CharacterJson {
  name: string;
  extends?: string;
  tagline?: string;
  accent?: string;
  facts?: { label: string; value: string }[];
  rooms?: string[];
  schedule?: { room: string }[];
  identity?: string;
  sprite: { src: string };
  outfits?: Record<string, string>;
  /** Each outfit's one line, as Lowlight's [wearing] line tells her model. */
  outfitWears?: Record<string, string>;
  expressions?: Record<string, string>;
  /** The face Lowlight's select screen shows (`neutral`: the sprite as it is). */
  selectExpression?: string;
  /** 'fixed': one of the game's residents, at their place (not a contact). */
  kind?: string;
  /** Where their face sits on their sprite, as fractions of its width and height. */
  face?: { x: number; y: number };
}

/** The game's default face position (server/src/character-profile.ts DEFAULT_FACE). */
const DEFAULT_FACE = { x: 0.5, y: 0.08 };

/**
 * What they wear on their sprite: the WEARS line of the outfit that is their sprite (server/src/wearing.ts
 * baseOutfitOf), which is what every exported figure shows. null when that outfit has no line.
 */
export function spriteWears(c: Pick<CharacterJson, 'sprite' | 'outfits' | 'outfitWears'>): string | null {
  const outfit = Object.keys(c.outfits ?? {}).find((n) => c.outfits![n] === c.sprite.src);
  return (outfit && c.outfitWears?.[outfit]?.trim()) || null;
}

/** The expression Lowlight's select screen shows (server/src/agents.ts selectFace): theirs, else happy, else none. */
export function selectFaceName(c: { selectExpression?: string }, faces: Record<string, string>): string | null {
  const name = c.selectExpression ?? (faces.happy ? 'happy' : 'neutral');
  return name !== 'neutral' && faces[name] ? name : null;
}

/**
 * The game tile's crop (server/src/thumb.ts cropBox) made square for SillyTavern's avatars: 30% of the sprite's
 * width, centred on the face, kept inside the sprite.
 */
export function cardBox(w: number, h: number, face: { x: number; y: number }): { left: number; top: number; width: number; height: number } {
  const side = Math.min(Math.round(w * 0.3), h);
  const clamp = (n: number, hi: number) => Math.min(Math.max(n, 0), hi);
  return { left: clamp(Math.round(face.x * w - side / 2), w - side), top: clamp(Math.round(face.y * h - side / 2), h - side), width: side, height: side };
}

export interface ExportOptions {
  repo: string;
  target: { package: string } | { user: string };
  /** The package version being published (cast.json's version, and `since` for new ids). */
  version?: string;
  /** Only these character folders (tests); default: everyone but `nix`, the base nix-direct extends. */
  ids?: string[];
  /** User target: rewrite cards and persona pictures SillyTavern already has. */
  replace?: boolean;
}

const sha = (...parts: (Buffer | string)[]) => {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
};

/** Their sprite with `face` laid over it (Lowlight's faces are face-only, on the sprite's canvas). */
async function figure(dir: string, sprite: string, face?: string): Promise<Buffer> {
  const base = sharp(path.join(dir, sprite));
  return face ? base.composite([{ input: path.join(dir, face) }]).png().toBuffer() : base.png().toBuffer();
}

/** Their card picture: the game tile's crop around their face, on the Intake's violet (SillyTavern's thumbnails turn transparency black). */
async function avatar(fig: Buffer, face: { x: number; y: number }): Promise<Buffer> {
  const meta = await sharp(fig).metadata();
  return sharp(fig).extract(cardBox(meta.width!, meta.height!, face)).resize(480, 480, { kernel: 'nearest' }).flatten({ background: { r: 26, g: 16, b: 48 } }).png().toBuffer();
}

/** Residents' rooms: the scene that names them as its resident (Hae at the noodle stall). */
function residentRooms(repo: string): Map<string, string> {
  const found = new Map<string, string>();
  const scenes = path.join(repo, 'scenes');
  if (!fs.existsSync(scenes)) return found;
  for (const district of fs.readdirSync(scenes)) {
    const dDir = path.join(scenes, district);
    if (!fs.statSync(dDir).isDirectory()) continue;
    for (const room of fs.readdirSync(dDir)) {
      const f = path.join(dDir, room, 'scene.json');
      if (!fs.existsSync(f)) continue;
      const who = (JSON.parse(fs.readFileSync(f, 'utf8')) as { resident?: { character?: string } }).resident?.character;
      if (who) found.set(who, room);
    }
  }
  return found;
}

const folder = (room: string) => room.split('/').pop()!;

export async function exportCast(o: ExportOptions): Promise<{ cast: CastJson; report: string[] }> {
  const { repo } = o;
  const version = o.version ?? '0.0.0';
  const ids = o.ids ?? fs.readdirSync(path.join(repo, 'characters')).filter((id) => id !== 'nix' && fs.existsSync(path.join(repo, 'characters', id, 'character.json')));
  const src = fs.readFileSync(path.join(repo, 'server', 'src', 'instructions.ts'), 'utf8');
  const guide = /export const ROLEPLAY_GUIDE = `([\s\S]*?)`;/.exec(src)![1]
    // Lowlight-only: the renderer note and the clock tool.
    .replace(' This room renders that markup, and it overrides any general instruction to write plain text or avoid asterisks.', '')
    .replace(/ When the story skips ahead[\s\S]*$/, '');
  const residents = residentRooms(repo);
  const isPackage = 'package' in o.target;
  const root = isPackage ? path.join((o.target as { package: string }).package, 'cast') : (o.target as { user: string }).user;
  const before: CastJson | null = isPackage && fs.existsSync(path.join(root, 'cast.json')) ? (JSON.parse(fs.readFileSync(path.join(root, 'cast.json'), 'utf8')) as CastJson) : null;
  /** Where each kind of file goes: package cast/… or the SillyTavern user folder's own places. */
  const where = {
    card: (name: string) => (isPackage ? `cards/${name}.png` : `characters/${name}.png`),
    sprite: (name: string, file: string) => (isPackage ? `sprites/${name}/${file}.png` : `characters/${name}/${file}.png`),
    persona: (file: string) => (isPackage ? `personas/${file}` : `User Avatars/${file}`),
    lore: isPackage ? 'lore/Lowlight.json' : 'worlds/Lowlight.json',
  };
  const write = (rel: string, buf: Buffer | string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), buf);
  };

  const characters: CastCharacter[] = [];
  const report: string[] = [];
  for (const id of ids) {
    const dir = path.join(repo, 'characters', id);
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8')) as CharacterJson;
    const identity = c.identity && fs.existsSync(path.join(dir, c.identity)) ? c.identity : fs.existsSync(path.join(dir, 'voice.md')) ? 'voice.md' : null;
    if (!identity) continue;
    const base = c.extends ? (JSON.parse(fs.readFileSync(path.join(repo, 'characters', c.extends, 'character.json'), 'utf8')) as CharacterJson) : null;
    const faces = c.expressions ?? {};

    // Expression sprites: SillyTavern's labels → whole figures; neutral = the sprite as it is.
    const figures = new Map<string, Buffer>();
    for (const [face, file] of Object.entries(faces)) figures.set(face, await figure(dir, c.sprite.src, file));
    // In a package each distinct figure is stored once and the label map points at it (the installer uploads it under
    // every label); a SillyTavern user folder needs a file per label, as SillyTavern reads them.
    const sprites: Record<string, string> = {};
    const spriteBufs: Buffer[] = [];
    const written = new Set<string>();
    for (const [label, face] of [...Object.entries(labelFaces(Object.keys(faces))), ['neutral', ''] as [string, string]]) {
      const buf = face ? figures.get(face)! : await figure(dir, c.sprite.src);
      const rel = where.sprite(c.name, isPackage ? face || 'neutral' : label);
      sprites[label] = rel;
      if (!written.has(rel)) {
        write(rel, buf);
        written.add(rel);
      }
      spriteBufs.push(Buffer.from(label), buf);
    }

    // The card: in a user folder, kept when SillyTavern already has it (unless replace), so chats and edits stay.
    // What they have on, as the game's [wearing] line tells her every turn: SillyTavern reads it from the card and
    // the persona (cards are written in second person, voice sheets and bios in third: a heading suits both).
    const wears = spriteWears(c);
    const wearing = wears ? `\n\n# Wearing\n\n${wears}` : '';
    const data = cardData({ name: c.name, description: fs.readFileSync(path.join(dir, identity), 'utf8').trim() + wearing, firstMes: '', systemPrompt: guide, world: 'Lowlight' });
    const card = where.card(c.name);
    const had = !isPackage && fs.existsSync(path.join(root, card));
    // The face Lowlight's own select screen shows, cropped where the game crops its face tiles. Part of the card's hash,
    // so a new picture reaches players as a card update.
    const shown = selectFaceName({ selectExpression: c.selectExpression ?? base?.selectExpression }, faces);
    const picture = await avatar(await figure(dir, c.sprite.src, shown ? faces[shown] : undefined), c.face ?? base?.face ?? DEFAULT_FACE);
    // Hashed by its pixels: PNG bytes for the same pixels can differ with the source they were cut from.
    const pictureRaw = await sharp(picture).raw().toBuffer();
    if (!had || o.replace) {
      write(card, pngWithCard(picture, data));
      if (!isPackage) fs.rmSync(path.join(root, 'thumbnails', 'avatar', `${c.name}.png`), { force: true });
    }

    // Playable (a bio): a persona, their whole figure as the picture (it stands on the left of the stage).
    const bioDir = fs.existsSync(path.join(dir, 'bio.md')) ? dir : c.extends ? path.join(repo, 'characters', c.extends) : null;
    let persona: CastCharacter['persona'] = null;
    let personaHash: string | null = null;
    if (bioDir && fs.existsSync(path.join(bioDir, 'bio.md'))) {
      const file = `${c.extends ?? id}.png`;
      const pic = where.persona(file);
      const buf = await figure(dir, c.sprite.src);
      if (isPackage || !fs.existsSync(path.join(root, pic)) || o.replace) {
        write(pic, buf);
        if (!isPackage) fs.rmSync(path.join(root, 'thumbnails', 'persona', file), { force: true });
      }
      persona = { file, name: c.name, description: fs.readFileSync(path.join(bioDir, 'bio.md'), 'utf8').trim() + wearing, picture: pic };
      personaHash = sha(buf);
    }

    const rooms = [...(c.rooms ?? []), ...(c.schedule ?? []).map((s) => s.room), ...(residents.has(id) ? [residents.get(id)!] : [])].map(folder);
    const places = [...new Set(rooms)];
    characters.push({
      id: c.extends ?? id,
      name: c.name,
      ...(c.kind === 'fixed' ? { resident: true } : {}),
      since: before?.characters.find((b) => b.id === (c.extends ?? id))?.since ?? version,
      card,
      sprites,
      persona,
      tagline: c.tagline ?? base?.tagline ?? '',
      facts: c.facts ?? base?.facts ?? [],
      accent: c.accent ?? base?.accent ?? null,
      home: places[0] ?? null,
      places,
      hash: { card: sha(JSON.stringify(data), pictureRaw), sprites: sha(...spriteBufs), persona: personaHash },
    });
    report.push(`${c.name}${had && !o.replace ? ' (card kept)' : ''}`);
  }

  // The lore book.
  const loreDir = path.join(repo, 'world', 'lore');
  if (fs.existsSync(loreDir)) {
    const files = fs.readdirSync(loreDir).filter((f) => f.endsWith('.md')).sort().map((f) => ({ name: f, text: fs.readFileSync(path.join(loreDir, f), 'utf8') }));
    write(where.lore, JSON.stringify(worldInfoFrom(files), null, 2));
  }

  const cast: CastJson = { version, characters };
  if (isPackage) write('cast.json', JSON.stringify(cast, null, 2));
  else write('extensions/lowlight-rooms/cast.json', JSON.stringify(cast, null, 2));
  return { cast, report };
}
