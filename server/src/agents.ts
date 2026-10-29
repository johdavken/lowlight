import { resolvePhotos } from './photos';
import type { Photo } from '../../shared/photos';
import fs from 'node:fs';
import path from 'node:path';
import { modelLabel } from '../../shared/model-label';
import type { AgentInfo, Crop, SpriteRef } from '../../shared/types';
import { AGENT_ID_RE, characterFile, deckOf, diceSettings, loadCharacter, statsOf, resolveExpressions, resolveOutfitByScene, resolveOutfitWears, resolveOutfits, resolveSprite, type Character } from './character';
import { DEFAULT_FACE, resolveProfile, type CharacterProfile, type ProfileSource } from './character-profile';
import { OPENROUTER_BASE_URL } from './config';
import { oldProfileIdentity } from '../../shared/identity';
import type { RoomNames } from './rooms';
import { oocInstructions, roomInstructions } from './instructions';

/** Valid agent ids: character folder names that are safe in URLs and paths. */
export { AGENT_ID_RE } from './character';
const DEFAULT_ACCENT = '#7fe9ff';
/** Where a character without rooms of her own lives: the neutral rooms. */
export const DEFAULT_ROOMS = ['default/workspace', 'default/rooftop'];

export interface ResolvedRooms {
  rooms: string[];
  /** The first of her rooms: where she is when there's no saved room. */
  startRoom: string;
  /** The old `scenePack` she was given, if any (completes saved room ids from before rooms). */
  legacyDistrict: string | null;
  /** Her select-screen group, a district: her own `group`, else her first room's district; null in the neutral rooms. */
  group: string | null;
}

/**
 * Her rooms: her own `rooms`, else the character she extends (one field each, like her look). The old
 * `scenePack: X` still reads, as every room in district X. With none, the neutral rooms; with none of
 * those in the city either, its first room.
 */
function resolveRooms(own: Character | null | undefined, base: Character | null, opts: LoadAgentsOptions, warn: (m: string) => void): ResolvedRooms {
  const from = own && (own.rooms !== undefined || own.scenePack !== undefined) ? own : base;
  let legacyDistrict: string | null = null;
  let listed: string[] = [];
  if (from?.rooms !== undefined) listed = from.rooms;
  else if (from?.scenePack !== undefined) {
    warn('scenePack is now rooms');
    legacyDistrict = from.scenePack;
    listed = opts.rooms.inDistrict(from.scenePack);
    if (listed.length === 0) warn(`no rooms in '${from.scenePack}'`);
  }
  const rooms = listed.filter((r) => {
    if (opts.rooms.has(r)) return true;
    warn(`no room '${r}'; skipping it`);
    return false;
  });
  // The neutral rooms (`default/…`) belong to no district.
  const first = rooms.length ? (rooms[0]!.split('/')[0] ?? null) : null;
  const derived = first === 'default' ? null : first;
  const group = groupOf(own?.group ?? base?.group, derived, opts, warn);
  if (rooms.length) return { rooms, startRoom: rooms[0]!, legacyDistrict, group };
  const defaults = DEFAULT_ROOMS.filter((r) => opts.rooms.has(r));
  if (defaults.length) return { rooms: defaults, startRoom: defaults[0]!, legacyDistrict, group };
  return { rooms: [], startRoom: opts.rooms.names()[0] ?? '', legacyDistrict, group };
}

/** Her explicit group when the city has rooms in that district (else a warning), otherwise `derived`. */
function groupOf(explicit: string | undefined, derived: string | null, opts: LoadAgentsOptions, warn: (m: string) => void): string | null {
  if (explicit === undefined) return derived;
  if (opts.rooms.inDistrict(explicit).length > 0) return explicit;
  warn(`group: no district '${explicit}' in the city; using ${derived ?? 'none'}`);
  return derived;
}

export interface AgentRecord {
  info: AgentInfo;
  /** The image served as her avatar (her character portrait); null → monogram. */
  avatarFile: string | null;
  /** Her full-body stage sprite, its crop, her other faces and outfits; null when she has none. */
  sprite: SpriteRecord | null;
  instructions: string;
  oocInstructions: string;
  /** A direct character's model connection (never sent to the browser); null for a mindless one. */
  direct: DirectSetup | null;
  /** Why a direct character isn't connected; null otherwise. */
  connectionError: string | null;
  /** Photos she can send by text (photos spec §1), from her own folder; absent or empty: none. */
  photos?: Photo[];
}

/** How a direct character reaches her model. */
export interface DirectSetup {
  provider: 'openrouter' | 'openai-compatible';
  baseUrl: string;
  /** Which key in data/settings.json she uses; null: none (an openai-compatible address without auth). */
  keyName: string | null;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  /** Reads her identity text now (live: edits apply on her next turn); throws if unreadable. */
  identity: () => string;
}

export const DEFAULT_TEMPERATURE = 0.9;
/** Room for a reasoning model's thinking too: on OpenRouter it counts toward max_tokens. */
export const DEFAULT_MAX_TOKENS = 1500;

/** Connected: a direct character that loaded. */
export function isConnected(rec: AgentRecord): boolean {
  return rec.direct !== null;
}

export interface LoadAgentsOptions {
  charactersDir: string;
  dataDir: string;
  /** Scene packs that exist; an unknown pack falls back to the default one. */
  /** The city's rooms, which her `rooms` must name. */
  rooms: RoomNames;
  /** The deck catalog's ids (missions spec §1): a starting deck outside it warns and is none. Absent: any id. */
  decks?: ReadonlySet<string>;
  /** Where OpenRouter is reached (default OPENROUTER_BASE_URL). */
  openrouterBaseUrl?: string;
  warn: (msg: string) => void;
}

/**
 * Builds the agent list from `characters/<id>/`: a folder with a backend is a direct character, one
 * without is mindless (listed, nothing to talk to). A base a direct character extends is her look,
 * not a record of its own.
 */
export function loadAgents(opts: LoadAgentsOptions): AgentRecord[] {
  const records: AgentRecord[] = [];
  if (fs.existsSync(opts.charactersDir)) {
    const entries = fs.readdirSync(opts.charactersDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    // A base a direct character extends is her twin's look, not a second record (see loadDirect).
    const extendedByDirect = new Set<string>();
    for (const entry of entries) {
      const raw = readRawCharacter(path.join(opts.charactersDir, entry.name));
      if (raw && raw.kind !== 'fixed' && 'backend' in raw && !oldProfileIdentity(raw.identity) && typeof raw.extends === 'string' && raw.extends.length > 0) extendedByDirect.add(raw.extends);
    }

    for (const entry of entries) {
      const id = entry.name;
      const dir = path.join(opts.charactersDir, entry.name);
      const raw = readRawCharacter(dir);
      // A place's resident (residents.ts) is never a contact, whatever else her file says.
      if (raw?.kind === 'fixed') continue;
      const declaresBackend = raw !== null && 'backend' in raw;
      if (!AGENT_ID_RE.test(id)) {
        if (raw !== null) opts.warn(`skipping character '${id}': not a valid agent id (lowercase letters, digits, - and _)`);
        continue;
      }
      if (declaresBackend && oldProfileIdentity(raw?.identity)) {
        // Her mind was a profile on the old agent server, which is gone: she stays on the roster, with no mind.
        opts.warn(`character '${id}': identity '${String(raw.identity)}' named a profile on the old agent server, which is gone; she loads with no mind (give her an identity.md)`);
      } else if (declaresBackend) {
        records.push(loadDirect(id, opts));
        continue;
      }
      // Mindless: no backend (or an old profile identity), and not a direct character's base.
      if (extendedByDirect.has(id)) continue;
      if (!fs.existsSync(path.join(dir, 'character.json'))) continue; // no character.json: skip silently
      try {
        records.push(loadMindless(id, opts));
      } catch (err) {
        opts.warn(`skipping character '${id}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return records.sort((a, b) => a.info.id.localeCompare(b.info.id));
}

/** `character.json` as a raw JSON object, or null when it's missing, unreadable or not an object. */
function readRawCharacter(dir: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8')) as unknown;
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const capitalized = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** Her resolved sprite: file and crop, her other faces (name → file), outfits (name → file), scene → outfit name and outfit → what she wears. */
export type SpriteRecord = {
  file: string;
  crop: Crop;
  /** How tall she stands on stage (0.5–1); absent: full height. */
  height?: number;
  /** Snapped art (Studio SNAP): drawn with hard pixels. */
  pixel?: true;
  expressions: Record<string, string>;
  outfits: Record<string, string>;
  outfitByScene: Record<string, string>;
  /** Outfit name → one line on what she has on in it (server-side only: her model is told, the client isn't). */
  outfitWears: Record<string, string>;
};

/** Outfits and the scene → outfit map from one character file, resolved in its folder. */
function resolveWardrobe(dir: string, c: Character | null | undefined, warn: (msg: string) => void): Pick<SpriteRecord, 'outfits' | 'outfitByScene' | 'outfitWears'> {
  const outfits = resolveOutfits(dir, c?.outfits, warn);
  return { outfits, outfitByScene: resolveOutfitByScene(c?.outfitByScene, outfits, warn), outfitWears: resolveOutfitWears(c?.outfitWears, outfits, warn) };
}

const hasWardrobe = (c: Character | null | undefined) => c?.outfits !== undefined || c?.outfitByScene !== undefined || c?.outfitWears !== undefined;

/** The select face's URL: her `selectExpression` (`neutral` = none), else `happy` when she has it. */
function selectFace(id: string, expressions: Record<string, string>, chosen: string | undefined, warn: (msg: string) => void): string | null {
  const name = chosen ?? (expressions.happy ? 'happy' : 'neutral');
  if (name === 'neutral') return null;
  if (!expressions[name]) {
    warn(`select face '${name}' isn't one of her expressions`);
    return null;
  }
  return `/api/agents/${id}/sprite/${name}`;
}

/** The public sprite ref for an agent's resolved sprite: each optional key is left out when it would be empty. */
function spriteRef(id: string, sprite: Omit<SpriteRecord, 'file'>, select: string | undefined, warn: (msg: string) => void): SpriteRef {
  const names = Object.keys(sprite.expressions);
  const outfits = Object.keys(sprite.outfits);
  return {
    url: `/api/agents/${id}/sprite`,
    crop: sprite.crop,
    ...(sprite.height !== undefined ? { height: sprite.height } : {}),
    ...(sprite.pixel ? { pixel: true } : {}),
    ...(names.length > 0 ? { expressions: Object.fromEntries(names.map((n) => [n, `/api/agents/${id}/sprite/${n}`])) } : {}),
    ...(outfits.length > 0 ? { outfits: Object.fromEntries(outfits.map((n) => [n, `/api/agents/${id}/outfit/${n}`])) } : {}),
    ...(Object.keys(sprite.outfitByScene).length > 0 ? { outfitByScene: sprite.outfitByScene } : {}),
    // Without faces there's nothing to choose (an explicit `neutral` with faces is sent as null).
    ...(names.length > 0 || select !== undefined ? { selectFace: selectFace(id, sprite.expressions, select, warn) } : {}),
  };
}

/** The look and dossier fields shared by direct and mindless characters. */
interface Look {
  avatarFile: string | null;
  avatarKind: AgentInfo['avatarKind'];
  sprite: SpriteRecord | null;
  /** Her select face's name, following the sprite like her expressions do. */
  selectExpression: string | undefined;
  rooms: ResolvedRooms;
  description: string;
  accent: string;
  profile: CharacterProfile;
}

/**
 * Portrait, sprite + expressions (own-vs-inherited), scene pack, description, accent and dossier
 * fields — her own field (from her folder), else the extended character's (from its folder).
 * Warnings read `character '<id>': …`, same wording for direct and mindless characters.
 */
function resolveLook(id: string, own: Character, charDir: string, base: Character | null, baseDir: string | null, opts: LoadAgentsOptions): Look {
  const warn = (m: string) => opts.warn(`character '${id}': ${m}`);
  const pick = <K extends 'portrait' | 'sprite'>(k: K): [string, Character[K]] | null =>
    own[k] !== undefined ? [charDir, own[k]] : base && baseDir && base[k] !== undefined ? [baseDir, base[k]] : null;
  const portrait = pick('portrait');
  const avatarFile = portrait ? characterFile(portrait[0], portrait[1] as string) : null;
  if (portrait && !avatarFile) warn(`portrait '${portrait[1]}' is missing; using a monogram`);
  const spriteFrom = pick('sprite');
  const spriteBase = spriteFrom ? resolveSprite(spriteFrom[0], spriteFrom[1], warn, 'using her portrait') : null;
  // Expressions follow the sprite's own source: her own sprite → her own expressions; an inherited sprite → the base's.
  // With no sprite anywhere, hers are the ones that count (and they need a sprite).
  const ownSprite = spriteFrom === null || spriteFrom[0] === charDir;
  const exprRaw = ownSprite ? own.expressions : base?.expressions;
  const expressions = spriteBase && exprRaw !== undefined ? resolveExpressions(spriteFrom![0], exprRaw, warn) : {};
  if (!ownSprite && own.expressions !== undefined) {
    warn('expressions without her own sprite are ignored');
  } else if (!spriteBase && exprRaw !== undefined) {
    warn('expressions need a sprite; ignoring them');
  }
  // Outfits follow the sprite the same way.
  const wardrobeFrom = ownSprite ? own : base;
  const wardrobe = spriteBase && hasWardrobe(wardrobeFrom) ? resolveWardrobe(spriteFrom![0], wardrobeFrom, warn) : { outfits: {}, outfitByScene: {}, outfitWears: {} };
  if (!ownSprite && hasWardrobe(own)) {
    warn('outfits without her own sprite are ignored');
  } else if (!spriteBase && hasWardrobe(wardrobeFrom)) {
    warn('outfits need a sprite; ignoring them');
  }
  const sprite = spriteBase ? { ...spriteBase, expressions, ...wardrobe } : null;
  const rooms = resolveRooms(own, base, opts, warn);
  const description = own.description ?? base?.description ?? '';
  const accent = own.accent ?? base?.accent ?? DEFAULT_ACCENT;
  const profileSources: ProfileSource[] = base ? [{ dir: charDir, c: own }, { dir: baseDir!, c: base }] : [{ dir: charDir, c: own }];
  const profile = resolveProfile(profileSources, description, warn);
  const selectExpression = (ownSprite ? own : base)?.selectExpression;
  return { avatarFile, avatarKind: sprite ? 'face' : avatarFile ? 'mask' : 'monogram', sprite, selectExpression, rooms, description, accent, profile };
}

/**
 * A character folder with no backend and not a direct character's base: listed but with no mind — no runtime, no model, nothing to talk to.
 * `extends` works the same one-level way as for direct characters; a missing, malformed or
 * two-level base warns once and she loads without it.
 */
function loadMindless(id: string, opts: LoadAgentsOptions): AgentRecord {
  const charDir = path.join(opts.charactersDir, id);
  const own = loadCharacter(charDir)!;

  let base: Character | null = null;
  let baseDir: string | null = own.extends ? path.join(opts.charactersDir, own.extends) : null;
  if (own.extends) {
    try {
      base = baseDir && AGENT_ID_RE.test(own.extends) ? loadCharacter(baseDir) : null;
    } catch {
      base = null;
    }
    if (!base) {
      opts.warn(`character '${id}': extends: no character '${own.extends}'`);
      baseDir = null;
    } else if (base.extends) {
      opts.warn(`character '${id}': extends: '${own.extends}' itself extends '${base.extends}' (one level only)`);
      base = null;
      baseDir = null;
    }
  }
  const name = own.name ?? base?.name ?? capitalized(id);
  const look = resolveLook(id, own, charDir, base, baseDir, opts);

  return {
    info: {
      id,
      name,
      pronoun: own.pronoun ?? base?.pronoun ?? 'they',
      description: look.description,
      accent: look.accent,
      avatarKind: look.avatarKind,
      ...look.rooms,
      // Missions spec §1: her own stats and starting deck, else the extended character's.
      stats: statsOf(own.stats !== undefined ? own : base, (m) => opts.warn(`character '${id}': ${m}`)),
      deck: deckOf(own.deck !== undefined ? own : base, opts.decks, (m) => opts.warn(`character '${id}': ${m}`)),
      connected: false,
      sprite: look.sprite ? spriteRef(id, look.sprite, look.selectExpression, (m) => opts.warn(`character '${id}': ${m}`)) : null,
      backend: 'none',
      modelLabel: null,
      connectionError: null,
      tagline: look.profile.tagline,
      bio: look.profile.bio,
      facts: look.profile.facts,
      face: look.profile.face,
      thumb: look.sprite ? `/api/agents/${id}/thumb` : null,
    },
    avatarFile: look.avatarFile,
    sprite: look.sprite,
    instructions: roomInstructions(name),
    oocInstructions: oocInstructions(name),
    direct: null,
    connectionError: null,
  };
}

/** A character that runs on a model directly. Anything wrong → listed, not connected, with the reason. */
/** Her rooms from her files alone (and the one she extends), for a character that can't connect: where she is doesn't depend on that. */
function roomsOnFile(charDir: string, opts: LoadAgentsOptions): ResolvedRooms {
  try {
    const own = loadCharacter(charDir);
    const base = own?.extends && AGENT_ID_RE.test(own.extends) ? loadCharacter(path.join(opts.charactersDir, own.extends)) : null;
    return resolveRooms(own, base, opts, () => {});
  } catch {
    return resolveRooms(null, null, opts, () => {});
  }
}

function loadDirect(id: string, opts: LoadAgentsOptions): AgentRecord {
  const charDir = path.join(opts.charactersDir, id);
  const fail = (why: string, name = capitalized(id)): AgentRecord => {
    opts.warn(`character '${id}' can't connect: ${why}`);
    return {
      info: {
        id, name, pronoun: 'they', description: '', accent: DEFAULT_ACCENT, avatarKind: 'monogram', ...roomsOnFile(charDir, opts),
        connected: false, sprite: null, backend: 'direct', modelLabel: null, connectionError: why,
        tagline: '', bio: [], facts: [], face: DEFAULT_FACE, thumb: null,
      },
      avatarFile: null, sprite: null, instructions: roomInstructions(name), oocInstructions: oocInstructions(name),
      direct: null, connectionError: why,
    };
  };

  let own: Character;
  try {
    own = loadCharacter(charDir)!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg.slice(msg.indexOf('character.json')));
  }
  const backend = own.backend!;

  let base: Character | null = null;
  const baseDir = own.extends ? path.join(opts.charactersDir, own.extends) : null;
  if (own.extends) {
    try {
      base = baseDir && AGENT_ID_RE.test(own.extends) ? loadCharacter(baseDir) : null;
    } catch {
      base = null;
    }
    if (!base) return fail(`extends: no character '${own.extends}'`, own.name);
    if (base.extends) return fail(`extends: '${own.extends}' itself extends '${base.extends}' (one level only)`, own.name);
  }
  const name = own.name ?? base?.name ?? capitalized(id);

  if (!own.identity) return fail('identity: a direct character needs one (identity.md)', name);
  const identityFile = characterFile(charDir, own.identity);
  if (!identityFile) return fail(`identity: '${own.identity}' is missing or outside her folder`, name);
  const identityPath = identityFile;

  // The key itself is linked in the game (data/settings.json) and read by her runtime per request.
  const keyName = backend.keyName ?? (backend.provider === 'openrouter' ? 'openrouter' : null);

  const look = resolveLook(id, own, charDir, base, baseDir, opts);

  // Room: her own field (from her folder), else the extended character's (from its folder).
  const pick = <K extends 'instructions' | 'ooc'>(k: K): [string, Character[K]] | null =>
    own[k] !== undefined ? [charDir, own[k]] : base && baseDir && base[k] !== undefined ? [baseDir, base[k]] : null;
  const text = (from: [string, string | undefined] | null): string | null => {
    const file = from && from[1] ? characterFile(from[0], from[1]) : null;
    return file ? fs.readFileSync(file, 'utf8').trim() : null;
  };

  const direct: DirectSetup = {
    provider: backend.provider,
    baseUrl: backend.provider === 'openrouter' ? (opts.openrouterBaseUrl ?? OPENROUTER_BASE_URL) : backend.baseUrl!,
    keyName,
    defaultModel: backend.model,
    temperature: backend.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: backend.maxTokens ?? DEFAULT_MAX_TOKENS,
    identity: () => fs.readFileSync(identityPath, 'utf8'),
  };
  return {
    info: {
      id,
      name,
      pronoun: own.pronoun ?? base?.pronoun ?? 'they',
      description: look.description,
      accent: look.accent,
      avatarKind: look.avatarKind,
      ...look.rooms,
      connected: true,
      sprite: look.sprite ? spriteRef(id, look.sprite, look.selectExpression, (m) => opts.warn(`character '${id}': ${m}`)) : null,
      // Missions spec §1: her own stats and starting deck, else the extended character's.
      stats: statsOf(own.stats !== undefined ? own : base, (m) => opts.warn(`character '${id}': ${m}`)),
      deck: deckOf(own.deck !== undefined ? own : base, opts.decks, (m) => opts.warn(`character '${id}': ${m}`)),
      // Liar's dice: her own settings, else the extended character's, else the defaults.
      dice: diceSettings(own.dice !== undefined ? own : base),
      backend: 'direct',
      modelLabel: modelLabel(backend.model),
      connectionError: null,
      tagline: look.profile.tagline,
      bio: look.profile.bio,
      facts: look.profile.facts,
      face: look.profile.face,
      thumb: look.sprite ? `/api/agents/${id}/thumb` : null,
    },
    avatarFile: look.avatarFile,
    sprite: look.sprite,
    instructions: text(pick('instructions') as [string, string] | null) ?? roomInstructions(name),
    oocInstructions: text(pick('ooc') as [string, string] | null) ?? oocInstructions(name),
    direct,
    connectionError: null,
    // Photos spec §1: her own pool only (an extended character's photos aren't hers).
    photos: resolvePhotos(charDir, own.photos, Object.keys(look.sprite?.outfits ?? {}), opts.rooms, (m) => opts.warn(`character '${id}': ${m}`)),
  };
}
