import { photoMoment } from './photos';
import { fittingPhotos } from '../../shared/photos';
import crypto from 'node:crypto';
import { DEFAULT_CREW_DIR, loadCrewBook } from './crew-book-load';
import { crewView } from './crew-view';
import { boardPlaces, postedJobs, storyDay } from '../../shared/board';
import { registerScenarioRoutes } from './scenario-routes';
import { registerEncounterRoutes } from './encounter-routes';
import { registerSuggestRoutes } from './suggest-routes';
import { SUGGEST_RECENT_LINES, suggestPrompt } from './suggest';
import { readSummary } from './summary';
import { encounterPrompt, sceneNow } from './encounter';
import { outageRates } from './outage-rates';
import { artNarration, scenePrompt } from './scenario';
import { loreBlock } from '../../shared/lore';
import { capAtWordBoundary } from '../../shared/persona';
import { loreGlossary, selectLore } from '../../shared/lore';
import { cityPlaces } from './places';
import { loadLoreBook } from './lore';
import { DEFAULT_LEADS_DIR, loadLeadBook } from './leads';
import { DEFAULT_QUESTS_DIR, loadQuestBook } from './quests';
import { DEFAULT_EXTRAS_DIR, extraImages, loadExtras } from './extras';
import { DEFAULT_GEAR_DIR, loadDecks, loadStock, loadWords } from './gear';
import { DEFAULT_STATS } from '../../shared/stats';
import { heatIn, hottest, repTier } from '../../shared/mission';
import type { CrewView, KitView } from '../../shared/types';
import { extrasKnown } from '../../shared/extras';
import { sharedStandingReader } from './standing';
import { leadsFor } from '../../shared/leads';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { registerSplashRoutes } from './splash-routes';
import { registerDistrictRoutes } from './district-routes';
import type { AgentInfo, ChatMessage, LinkState, OtherInfo, PlaythroughInfo, Present, ServerEvent } from '../../shared/types';
import { DEFAULT_GIGS_DIR, DEFAULT_MAP_FILE, DEFAULT_PAPERS_DIR, OPENROUTER_BASE_URL, type Config } from './config';
import { AGENT_ID_RE, isConnected, loadAgents, type AgentRecord } from './agents';
import { baseOutfitOf } from './wearing';
import { characterFile, knowsReader, knowsStartsReader, loadCharacter, scheduleReader, standingConfigReader } from './character';
import { roomRegistry, SPLASH_DISTRICT } from './rooms';
import { loadPacks, type SceneRegistry } from './scenes';
import { createDeck, type Deck } from './deck';
import { createPromiseChecker } from './promises';
import { createAgentRuntime, type AgentRuntime } from './runtime';
import { readPersonaCharacterId } from './persona';
import { createPlayers, whosHereBlock } from './players';
import { splitBio } from './character-profile';
import { createThumbs } from './thumb';
import { registerGigRoute } from './gigs';
import { registerPapersRoutes } from './papers';
import { registerMapRoute } from './map-route';
import { registerPlaythroughRoutes } from './playthrough-routes';
import { loadResidents, residentInfo, sceneResidents } from './residents';
import { gameSongs } from './songs';
import { soundPresent } from './sound-present';
import { createPlaythroughs } from './playthroughs';
import { createWorld, type World } from './world';
import { parseMap } from '../../shared/map-schema';
import type { Playthroughs } from './playthroughs';
import { openSettings, type Settings } from './settings';
import { registerLinkRoutes } from './link-routes';
import { createModelCatalog } from './model-catalog';
import { registerBugReportRoutes } from './bug-report-routes';
import { readTurns } from './bug-report';
import { formatClock, START } from '../../shared/clock';
import { narratorPowerLine } from '../../shared/outage';
import os from 'node:os';

export interface BuildAppDeps {
  /** The player's settings (main passes its own; default: data/settings.json under cfg.dataDir). */
  settings?: Settings;
}

export interface BuiltApp {
  app: FastifyInstance;
  /** The agent list as last loaded (refreshed on every /api/agents request). */
  agents(): AgentRecord[];
  /** The runtime for a connected agent (created on first use), or null. */
  runtime(id: string): Promise<AgentRuntime | null>;
  /** Every runtime built in the current world. */
  runtimes(): AgentRuntime[];
  /** The active playthrough and the runtimes' state directory. */
  world: World;
  /** The playthroughs on disk and their saves. */
  playthroughs: Playthroughs;
  close(): Promise<void>;
}

export interface AgentListEntry extends AgentInfo {
  link: LinkState;
  /** Her room as she left it (connected agents with a saved room only). */
  room: { scene: string; weather: string; weatherLevel: number; fog: number; state: import('../../shared/types').RoomState } | null;
  /** Each pair's recap text the player hasn't seen yet, by player id. */
  recaps: Record<string, string>;
  /** Where a new game with her starts: her start room's name and its default time and weather (null: unknown room). */
  start: { name: string; timeOfDay: string | null; weather: string | null } | null;
}

const ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** A host name on its own, lowercased, without the port ("[::1]:7700" → "[::1]"). */
function bareHost(hostPort: string): string {
  return hostPort.toLowerCase().replace(/:\d+$/, '');
}

function originAllowedFor(origin: string | undefined, extra: readonly string[] = []): boolean {
  if (origin === undefined || ORIGIN_RE.test(origin)) return true;
  const m = /^https?:\/\/([^/]+)$/i.exec(origin);
  return m !== null && extra.includes(bareHost(m[1]));
}

// Loopback names only, any port. Checked on every request (HTTP and the /ws upgrade) so a
// DNS-rebinding page — same-origin with an attacker hostname that resolves to 127.0.0.1 —
// cannot read /api/bootstrap's token or open /ws.
const HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function hostAllowed(host: string | undefined, extra: readonly string[] = []): boolean {
  return host !== undefined && (HOST_RE.test(host) || extra.includes(bareHost(host)));
}

/** Constant-time token check — never short-circuits on length or content. */
function tokenEquals(given: string | undefined, token: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

const API_PREFIXES = ['/api', '/ws', '/scenes'];

export async function buildApp(cfg: Config, deps: BuildAppDeps = {}): Promise<BuiltApp> {
  const extraHosts = cfg.allowedHosts ?? [];
  const originAllowed = (origin: string | undefined): boolean => originAllowedFor(origin, extraHosts);
  const packs = await loadPacks(cfg.scenesDir);
  for (const [pack, { errors }] of packs) for (const e of errors) console.warn(`[scenes/${pack}] ${e}`);
  const cityRooms = roomRegistry(packs, (m) => console.warn(`[scenes] ${m}`));
  // Every district's scene errors, for every contact's dev panel (they all reach every room).
  const cityErrors = [...packs].filter(([d]) => d !== SPLASH_DISTRICT).flatMap(([d, { errors }]) => errors.map((e) => `[scenes/${d}] ${e}`));

  // The deck catalog: read once at startup, before the characters that name their starting deck.
  const decks = loadDecks(cfg.gearDir ?? DEFAULT_GEAR_DIR, (m) => console.warn(m));
  // The fixers' stock (small jobs spec §5), read once at startup like the decks.
  const stock = loadStock(cfg.gearDir ?? DEFAULT_GEAR_DIR, decks, (m) => console.warn(m));
  const words = loadWords(cfg.gearDir ?? DEFAULT_GEAR_DIR, (m) => console.warn(m));
  // The crew tables (crew spec §1–§2), read once at startup like the decks.
  const crewBook = loadCrewBook(cfg.crewDir ?? DEFAULT_CREW_DIR, (m) => console.warn(m));
  /** The crew's seed: the playthrough's id. Test-only (e2e): NIX_TEST_CREW_SEED pins it, so hires and rolls repeat. */
  const crewSeed = (ptId: string) => process.env.NIX_TEST_CREW_SEED || ptId;
  const settings = deps.settings ?? openSettings(cfg.dataDir);
  let records: AgentRecord[] = [];
  const reloadAgents = (): AgentRecord[] => {
    records = loadAgents({
      charactersDir: cfg.charactersDir,
      dataDir: cfg.dataDir,
      rooms: cityRooms,
      openrouterBaseUrl: cfg.openrouterBaseUrl,
      decks: new Set(decks.map((d) => d.id)),
      warn: (m) => console.warn(`[agents] ${m}`),
    });
    return records;
  };
  reloadAgents();
  // Places' residents (Hae at the noodle stall): read once at startup, like the persona.
  const residents = loadResidents(cfg.charactersDir, (m) => console.warn(`[residents] ${m}`));
  // The character persona/persona.json names is the default player (old databases' rows are theirs),
  // even when it doesn't load. Who you are in a playthrough is the playthrough's own persona.
  const characterId = readPersonaCharacterId(cfg.personaDir);
  // The lore book: read once at startup, against the map as it is now (restart after editing either).
  const loreMap = (() => {
    try {
      const parsed = parseMap(JSON.parse(fs.readFileSync(cfg.mapFile ?? DEFAULT_MAP_FILE, 'utf8')));
      return parsed.ok ? parsed.map : null;
    } catch {
      return null;
    }
  })();
  // Exit rooms and side places are places too (room exits spec §4).
  const places = cityPlaces(loreMap, cityRooms.list(), (m) => console.warn(`[scenes] ${m}`));
  // Her plans (spec 2026-10-21 §4): a plan names a room that stands at a map place.
  const planPlaces = () =>
    cityRooms.list().flatMap((r) => {
      const at = places.locate(r.id).placeId;
      return at ? [{ id: r.id, name: places.placeName(at) }] : [];
    });
  const loreBook = loadLoreBook(cfg.loreDir, loreMap, (m) => console.warn(m), [...places.exits.values()].map((e) => e.placeId));
  const loreIds = new Set(loreBook.map((e) => e.id));
  // The lead book: read once at startup, against the contacts as they are now (restart after editing either).
  const leadBook = loadLeadBook(cfg.leadsDir ?? DEFAULT_LEADS_DIR, new Set(records.filter(isConnected).map((r) => r.info.id)), (m) => console.warn(m));
  // Stranger faces: read once at startup, before the quest book that names them (restart after adding faces).
  const extrasDir = cfg.extrasDir ?? DEFAULT_EXTRAS_DIR;
  const extras = loadExtras(extrasDir, (m) => console.warn(m));
  const extrasPng = extraImages(extrasDir, extras);
  // The quest book: read once at startup, against the contacts, the map and the extras as they are now (restart after editing).
  const questBook = loadQuestBook(
    cfg.questsDir ?? DEFAULT_QUESTS_DIR,
    { roster: new Set(records.filter(isConnected).map((r) => r.info.id)), places: places.placeIds(), extras: extrasKnown(extras), decks: new Set(decks.map((d) => d.id)) },
    (m) => console.warn(m),
  );
  const lore = (sceneId: string, recent: string[], force?: readonly string[]) => selectLore(loreBook, { ...places.locate(sceneId), recent, ...(force ? { force } : {}) });
  /** What a room's art shows: its art prompt's narration (art/scenes/<folder>.md, see artNarration), else its scene description. */
  function roomArt(folder: string, description: string | undefined): string | null {
    try {
      const text = artNarration(fs.readFileSync(path.join(cfg.artScenesDir ?? './art/scenes', `${folder}.md`), 'utf8'));
      if (text) return capAtWordBoundary(text, 1200);
    } catch {
      // No art prompt: the scene's own description will do.
    }
    return description?.trim() || null;
  }
  // Who can visit: resolved against the current roster, so a character connected later counts.
  const players = createPlayers({ records: () => records, characterId });

  /** The map's name for a scene (read now, as travel does), else the room's own name. */
  function placeName(sceneId: string): string {
    try {
      const parsed = parseMap(JSON.parse(fs.readFileSync(cfg.mapFile ?? DEFAULT_MAP_FILE, 'utf8')));
      const place = parsed.ok ? parsed.map.places.find((p) => p.scene === sceneId) : undefined;
      if (place) return place.name;
    } catch {
      // No map: the room's name will do.
    }
    return cityRooms.get(sceneId)?.name ?? sceneId;
  }

  const runtimes = new Map<string, AgentRuntime>();
  /**
   * Whether a world switch has closed the first runtimes. Those were health-checked by whoever
   * started the server; a rebuilt one checks its own link, or it reads down until the next poll.
   */
  let rebuilt = false;
  /** The built runtimes; `reset()` closes them all (their tabs too), so the next request rebuilds in the new world. */
  const registry = {
    all: () => [...runtimes.values()],
    reset() {
      if (runtimes.size > 0) rebuilt = true;
      for (const rt of runtimes.values()) {
        rt.hub.closeAll(4410);
        rt.close();
      }
      runtimes.clear();
      // A new world: every deck gets its threads once the switch is done (deck spec Review Focus 1).
      queueMicrotask(() => deck?.refresh());
    },
  };
  let deck: Deck | null = null;
  let promises: { check(): Promise<void> } | null = null;
  const playthroughs = createPlaythroughs(cfg.playthroughsDir);
  /** A bad `knows` warns once per message, not on every contacts read. */
  const warned = new Set<string>();
  const warnOnce = (m: string) => {
    if (warned.has(m)) return;
    warned.add(m);
    console.warn(`[ties] ${m}`);
  };
  const readKnows = knowsReader(cfg.charactersDir, warnOnce);
  // Standing (spec 2026-10-13): tie starts, each character's block and the shared words, read live.
  const readTieStarts = knowsStartsReader(cfg.charactersDir, warnOnce);
  const readStandingConfig = standingConfigReader(cfg.charactersDir, warnOnce);
  const sharedStanding = sharedStandingReader(cfg.standingFile ?? './world/standing.json', warnOnce);
  /**
   * Another contact as her model is told about him when they share a room (spec 2026-10-11 §3): his
   * who's-here block and his voice.md when his file names one, read now. Never his identity.md.
   */
  const describeOther = (id: string) => {
    const r = records.find((x) => x.info.id === id);
    if (!r) return null;
    const dir = path.join(cfg.charactersDir, id);
    let voice = '';
    try {
      const file = loadCharacter(dir)?.voice;
      const at = file ? characterFile(dir, file) : null;
      voice = at ? fs.readFileSync(at, 'utf8').trim() : '';
    } catch {
      voice = '';
    }
    return {
      voice,
      file: whosHereBlock(r.info.name, r.info.pronoun, { tagline: r.info.tagline, bio: r.info.bio, facts: r.info.facts }),
      faces: Object.keys(r.sprite?.expressions ?? {}),
      tagline: r.info.tagline,
    };
  };
  /** How the strip draws someone here: a resident's look, or a contact's from the select screen's file. */
  const lookOf = (p: Present): OtherInfo => {
    const fallback = { ...p, accent: '#7fe9ff', thumb: null, sprite: null, face: { x: 0.5, y: 0.15 }, tagline: '', facts: [] };
    if (p.kind === 'resident') {
      const r = residents.get(p.id);
      if (!r) return fallback;
      const info = residentInfo(r);
      return { ...p, accent: info.accent, thumb: info.thumb, sprite: info.sprite, face: r.face, tagline: '', facts: [] };
    }
    const r = records.find((x) => x.info.id === p.id);
    return r ? { ...p, accent: r.info.accent, thumb: r.info.thumb, sprite: r.info.sprite, face: r.info.face, tagline: r.info.tagline, facts: r.info.facts } : fallback;
  };
  /** The encounter narrator's few words on each other here, at most. */
  const OTHER_VOICE_MAX = 200;
  const world = createWorld({
    onClockMoved: () => void promises?.check(),
    playthroughs,
    basePlayers: players,
    registry,
    personaName: (player) => {
      const p = players.resolve(player);
      return p.id === player ? p.name : player.charAt(0).toUpperCase() + player.slice(1);
    },
    contactName: (id) => records.find((r) => r.info.id === id)?.info.name ?? id,
    kitStart: (id) => {
      const info = records.find((r) => r.info.id === id)?.info;
      return { stats: info?.stats ?? DEFAULT_STATS, deck: info?.deck ?? null };
    },
    placeName,
    hasScene: (id) => cityRooms.has(id),
    residentNames: [...residents.values()].map((r) => r.name),
    // Read per call, so a room installed from Studio names hers at once (the runtimes warn about unknown ones).
    residentOf: (sceneId) => {
      const r = sceneResidents(cityRooms.list(), residents, () => {}).get(sceneId);
      return r ? { id: r.id, name: r.name, pronoun: r.pronoun } : null;
    },
    residents: () => [...residents.values()].map((r) => ({ id: r.id, name: r.name, pronoun: r.pronoun })),
    ties: readKnows,
    tieStarts: readTieStarts,
    standingConfig: readStandingConfig,
    sharedStanding,
    leadBook: () => leadBook,
    questBook: () => questBook,
    districtOf: (placeId) => places.districtOf(placeId),
    crewBook: () => crewBook,
    crewSeed,
    crewPlaceName: (placeId) => places.placeName(placeId),
    districtName: (id) => loreMap?.districts.find((d) => d.id === id)?.name ?? id,
    // Blackouts phase 3: rates from map/city/districts/, read once at start; a room's place says where it stands.
    outageRates: cfg.outageRates ?? outageRates(cfg.mapFile ?? DEFAULT_MAP_FILE),
    forcedOutages: cfg.forcedOutages ?? [],
    powerPlace: (sceneId) => {
      const place = loreMap?.places.find((p) => p.scene === sceneId);
      if (place) return { district: place.district, on: place.on ?? null };
      const at = places.locate(sceneId);
      return at.districtId ? { district: at.districtId, on: null } : null;
    },
    schedule: scheduleReader(cfg.charactersDir, (r) => cityRooms.has(r), warnOnce),
    roster: () =>
      records
        .filter(isConnected)
        .map(({ info, avatarFile }) => ({ id: info.id, name: info.name, pronoun: info.pronoun, accent: info.accent, startRoom: info.startRoom, avatar: avatarFile !== null, thumb: info.thumb !== null, legacyDistrict: info.legacyDistrict, bio: info.bio, facts: info.facts })),
  });
  deck = createDeck({
    world,
    runtime,
    minded: (id) => records.some((r) => r.info.id === id && isConnected(r)),
    pronoun: (id) => records.find((r) => r.info.id === id)?.info.pronoun ?? 'she',
    placeName,
    meta: (id, key) => metaOf(id, key),
    onUnread: (from) => {
      for (const rt of runtimes.values()) rt.hub.emit({ type: 'texts_unread', from });
    },
    // The thread list reads her last text from her database, without starting her (final review #9).
    lastText: (id, player) => {
      const rt = runtimes.get(id);
      if (rt) return rt.db.recentMessages(player, 5, 'text').filter((m) => !m.promised).at(-1);
      const file = path.join(world.stateDir(), id, 'room.db');
      if (!fs.existsSync(file)) return undefined;
      let db: DatabaseSync;
      try {
        db = new DatabaseSync(file, { readOnly: true });
      } catch {
        return undefined;
      }
      try {
        const row = db.prepare("SELECT id, role, text, status, clock, ts FROM messages WHERE player = ? AND mode = 'text' AND (leave IS NULL OR leave <> 3) ORDER BY ts DESC, rowid DESC LIMIT 1").get(player) as
          | { id: string; role: 'user' | 'agent'; text: string; status: ChatMessage['status']; clock: number | null; ts: number }
          | undefined;
        return row ? { id: row.id, role: row.role, text: row.text, status: row.status, ts: row.ts, toolLines: [], mode: 'text', ...(row.clock !== null ? { clock: row.clock } : {}) } : undefined;
      } catch {
        return undefined;
      } finally {
        db.close();
      }
    },
  });
  // Promised texts (spec 2026-10-23 §5): checked on every clock move, sent through the deck's queue.
  const metaOf = (id: string, key: string): string | null => {
    const rt = runtimes.get(id);
    if (rt) return rt.db.getMeta(key);
    const file = path.join(world.stateDir(), id, 'room.db');
    if (!fs.existsSync(file)) return null;
    // One unreadable database skips only her (mid review M5).
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(file, { readOnly: true });
    } catch {
      return null;
    }
    try {
      return (db.prepare('SELECT v FROM meta WHERE k = ?').get(key) as { v: string } | undefined)?.v ?? null;
    } catch {
      return null;
    } finally {
      db.close();
    }
  };
  promises = createPromiseChecker({
    active: () => world.active(),
    now: () => world.clockNow(),
    contacts: () => world.contacts().filter((c) => records.some((r) => r.info.id === c.id && isConnected(r))).map((c) => c.id),
    read: metaOf,
    store: async (id) => (await runtime(id))?.db ?? null,
    withYou: (id) => {
      const pt = world.active();
      return !!pt && !pt.solo && pt.location?.contactId === id;
    },
    placeAt: (id, clock) => world.placeAt(id, clock),
    partedAt: (id) => world.active()?.parted?.[id] ?? null,
    placeName,
    fire: (id, o) => deck?.promised(id, o) ?? Promise.resolve(false),
    log: (line) => console.log(`[promises] ${line}`),
  });
  if (cfg.autoPlaythrough && !world.active()) {
    const first = records.find(isConnected);
    if (first) world.create(players.defaultId, first.info.id);
  }

  const creating = new Map<string, Promise<AgentRuntime | null>>();
  async function runtime(id: string): Promise<AgentRuntime | null> {
    if (!AGENT_ID_RE.test(id)) return null;
    const existing = runtimes.get(id);
    if (existing) return existing;
    const pending = creating.get(id);
    if (pending) return pending;
    const p = (async () => {
      let rec = records.find((r) => r.info.id === id);
      if (!rec || !isConnected(rec)) rec = reloadAgents().find((r) => r.info.id === id); // connected since startup?
      if (!rec || !isConnected(rec)) return null;
      if (cityRooms.names().length === 0) throw new Error(`no rooms in ${cfg.scenesDir}`);
      const rt = createAgentRuntime(rec, cityRooms, {
        onText: (contact, e, player) => deck?.onText(contact, e, player),
        unreadTexts: () => deck?.unreadNow() ?? [],
        settings,
        planPlaces,
        dataDir: cfg.dataDir,
        stateDir: world.stateDir(),
        sceneErrors: cityErrors,
        players: world.players,
        mapFile: cfg.mapFile ?? DEFAULT_MAP_FILE,
        gigsDir: cfg.gigsDir ?? DEFAULT_GIGS_DIR,
        papersDir: cfg.papersDir ?? DEFAULT_PAPERS_DIR,
        loreIds: () => loreIds,
        residents,
        describeOther,
        wardrobe: (who) => records.find((r) => r.info.id === who)?.sprite ?? residents.get(who)?.sprite ?? null,
        lookOf,
        lore,
        quests: {
          book: () => questBook,
          extras: () => extras,
          decks: () => decks,
          placeOf: (sceneId) => places.locate(sceneId).placeId,
          placeName: (placeId) => places.placeName(placeId),
          contactName: (id) => records.find((r) => r.info.id === id)?.info.name ?? id,
          districtOf: (placeId) => places.districtOf(placeId),
          words: () => words,
          stock: () => stock,
          crewView: () => crewViewNow(),
          crewState: () => {
            const pt = world.active();
            return pt ? (world.kitOf(pt.player)?.crew ?? null) : null;
          },
        },
        // Leads apply to the playthrough's player only; a take being rewritten doesn't hold what it replaces.
        leads: (contactId, player, recent, replaced) => {
          const held = world.heldLeads(player);
          if (held === null) return { onMind: [], offer: [], receive: [] };
          return leadsFor(leadBook, contactId, new Map(held.filter((h) => !replaced.includes(h.id)).map((h) => [h.id, h.details])), recent);
        },
        checkpoints: world,
        contacts: {
          list: () => records.filter(isConnected).map(({ info }) => ({ id: info.id, name: info.name, pronoun: info.pronoun })),
          isKnown: (contactId) => world.isKnown(contactId),
        },
      });
      runtimes.set(id, rt);
      if (rebuilt) void rt.checkHealth().catch((err: Error) => console.error(`agent ${id}: health check failed: ${err.message}`));
      return rt;
    })();
    creating.set(id, p);
    try {
      return await p;
    } finally {
      creating.delete(id);
    }
  }

  const app = Fastify();

  app.addHook('onRequest', async (req, reply) => {
    if (hostAllowed(req.headers.host, extraHosts)) return;
    if (req.headers.upgrade !== undefined) {
      // A refused websocket upgrade: answer on the raw socket and close it, so the half-open
      // upgrade socket can't linger (and hold up app.close()).
      reply.hijack();
      req.raw.socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    return reply.code(403).send({ error: 'host not allowed' });
  });

  await app.register(fastifyWebsocket);
  await app.register(fastifyStatic, { root: path.resolve(cfg.scenesDir), prefix: '/scenes/' });

  if (cfg.webDist) {
    const webDistDir = path.resolve(cfg.webDist);
    await app.register(fastifyStatic, { root: webDistDir, prefix: '/', decorateReply: false });

    app.setNotFoundHandler((req, reply) => {
      const isApi = API_PREFIXES.some((p) => req.url.startsWith(p));
      if (req.method === 'GET' && !isApi) {
        reply.type('text/html').send(fs.createReadStream(path.join(webDistDir, 'index.html')));
      } else {
        reply.code(404).send({ error: 'not found' });
      }
    });
  }

  app.get('/api/bootstrap', async () => ({ token: cfg.token }));

  app.get('/api/agents', async () => {
    const list = reloadAgents();
    const startOf = (id: string): AgentListEntry['start'] => {
      const r = cityRooms.get(id);
      return r ? { name: r.name, timeOfDay: r.defaults?.timeOfDay ?? null, weather: r.defaults?.weather ?? null } : null;
    };
    const agents: AgentListEntry[] = await Promise.all(
      list.map(async (rec): Promise<AgentListEntry> => {
        let rt: AgentRuntime | null = null;
        try {
          rt = isConnected(rec) ? await runtime(rec.info.id) : null;
        } catch (err) {
          // One agent's broken room must not take the whole directory down with it.
          console.error(`agent ${rec.info.id}: room failed to open: ${(err as Error).message}`);
          return { ...rec.info, link: 'room-error', room: null, recaps: {}, start: startOf(rec.info.startRoom) };
        }
        const state = rt?.room.state;
        const scene = state ? rt!.room.scene() : null;
        const recaps = rt ? rt.journal.unseenRecaps() : {};
        return {
          ...rec.info,
          ...(rt?.modelLabel ? { modelLabel: await rt.modelLabel() } : {}),
          link: rt ? await rt.probe() : 'unknown',
          room:
            state && scene
              ? { scene: scene.name, weather: state.atmosphere.weather, weatherLevel: state.atmosphere.weatherLevel, fog: state.atmosphere.fog, state }
              : null,
          recaps,
          start: startOf(rec.info.startRoom),
        };
      }),
    );
    return { agents };
  });

  const sendAvatar = (id: string, hiDpi: boolean, reply: import('fastify').FastifyReply) => {
    const rec = records.find((r) => r.info.id === id);
    if (!rec?.avatarFile) return reply.code(404).send({ error: 'no avatar' });
    // A mask portrait may ship a sharper @2x sibling (portrait.png → portrait@2x.png).
    const twoX = rec.avatarFile.replace(/(\.png)$/i, '@2x$1');
    const file = hiDpi && fs.existsSync(twoX) ? twoX : rec.avatarFile;
    return reply.type('image/png').header('Cache-Control', 'no-cache').send(fs.createReadStream(file));
  };
  app.get<{ Params: { id: string } }>('/api/agents/:id/avatar', (req, reply) => sendAvatar(req.params.id, false, reply));
  app.get<{ Params: { id: string } }>('/api/agents/:id/avatar@2x', (req, reply) => sendAvatar(req.params.id, true, reply));

  /**
   * Who visits: the active playthrough's player (with its persona), else who `?as=` names (unknown
   * or missing → the default player). Null when there's nothing to say about them (no line: 'you'
   * without a persona file, or a default character that isn't in the roster).
   */
  const outfitNames = (id: string) => {
    const rec = records.find((r) => r.info.id === id);
    return rec?.sprite ? Object.keys(rec.sprite.outfits) : [];
  };
  const visitor = (as: unknown) => {
    const player = world.players.resolve(typeof as === 'string' ? as : undefined);
    return player.line === null ? null : player;
  };
  // Lore words in the box and the quest panel (feedback 2026-10-19): each entry's keys and its hover card, street versions first.
  const glossary = loreGlossary(loreBook);
  app.get('/api/lore/glossary', async () => ({ glossary }));
  // Missions (spec 2026-10-18 §4): the YOU sheet's stats, heat, sol and deck for the active playthrough's player; null without one.
  app.get('/api/kit', async () => {
    const pt = world.active();
    const k = pt ? world.kitOf(pt.player) : null;
    if (!k) return { kit: null };
    // Where you stand: the room of the contact you're with (small jobs spec §2).
    const contact = pt!.location?.contactId ?? pt!.startContact;
    const sceneId = runtimes.get(contact)?.room.state.sceneId ?? pt!.location?.sceneId ?? null;
    const here = sceneId ? places.locate(sceneId).districtId : null;
    const hot = hottest(k.kit);
    return {
      kit: {
        deck: decks.find((d) => d.id === k.kit.deck) ?? null,
        sol: k.kit.sol,
        heat: hot?.heat ?? 0,
        heatHere: heatIn(k.kit, here),
        hottest: hot,
        rep: k.kit.rep,
        cover: k.kit.cover,
        edgeLeft: k.kit.edgeLeft,
        edgeMax: k.kit.edgeMax,
        stats: k.stats,
        crewLatest: k.crew.latest,
      } satisfies KitView,
    };
  });
  // CREW (crew spec §4): the roster, tonight's hires and errands with their odds, and the results; null without a playthrough.
  app.get('/api/crew', async () => ({ crew: crewViewNow() }));
  /** The CREW screen's view for the active playthrough's player (the route and the relay's checks); null without one. */
  function crewViewNow(): CrewView | null {
    const pt = world.active();
    const k = pt ? world.kitOf(pt.player) : null;
    if (!pt || !k) return null;
    const contact = pt.location?.contactId ?? pt.startContact;
    const sceneId = runtimes.get(contact)?.room.state.sceneId ?? pt.location?.sceneId ?? null;
    const here = sceneId ? places.locate(sceneId).placeId : null;
    const now = world.clockNow() ?? START;
    const day = storyDay(now);
    const mapPlaces = loreMap?.places ?? [];
    const districts = [...new Set(mapPlaces.map((p) => p.district))];
    const posted = boardPlaces(questBook).flatMap((place) => {
      const district = places.districtOf(place) ?? '';
      return postedJobs({ book: questBook, place, tier: repTier(k.kit.rep[district] ?? 0), day, seed: pt.id }).map((job) => ({ job, place, district }));
    });
    return crewView({
      crew: k.crew,
      kit: k.kit,
      book: crewBook,
      now,
      seed: crewSeed(pt.id),
      places: mapPlaces.filter((p) => p.hires && p.hires.length > 0).map((p) => ({ id: p.id, name: p.name, district: p.district, hires: p.hires! })),
      extras,
      posted,
      here,
      districts,
      names: { job: (id) => questBook.find((q) => q.id === id)?.title ?? id, district: (id) => loreMap?.districts.find((d) => d.id === id)?.name ?? id },
    });
  }
  app.get<{ Querystring: { as?: string } }>('/api/persona', async (req) => {
    const p = visitor(req.query.as);
    if (!p) return { persona: null };
    // The character sheet's look: her accent and outfit names come from the roster record.
    const rec = records.find((r) => r.info.id === p.id);
    const outfits = outfitNames(p.id);
    // What the active playthrough's player wears; one the character file no longer has reads as none.
    const pt = world.active();
    const outfit = pt?.player === p.id && pt.outfit !== undefined && outfits.includes(pt.outfit) ? pt.outfit : undefined;
    const baseOutfit = (rec?.sprite ? baseOutfitOf(rec.sprite) : null) ?? undefined;
    // Faces from actions: the player's figure shows their faces, on the route theirs use as a contact.
    const faces = Object.keys(rec?.sprite?.expressions ?? {});
    // FILE on YOU (spec 2026-10-28 §1): under a persona, its background and no facts, as the city is told; else the select screen's file.
    const persona = pt?.player === p.id ? pt.persona : undefined;
    const bio = persona ? splitBio(persona.background) : (rec?.info.bio ?? []);
    const facts = persona ? [] : (rec?.info.facts ?? []);
    return {
      persona: {
        id: p.id,
        name: p.name,
        sprite: p.sprite ? { url: `/api/persona/sprite?as=${encodeURIComponent(p.id)}`, crop: p.sprite.crop, ...(p.sprite.height !== undefined ? { height: p.sprite.height } : {}), ...(p.sprite.pixel ? { pixel: true } : {}) } : null,
        ...(rec ? { accent: rec.info.accent } : {}),
        ...(p.tagline ? { tagline: p.tagline } : {}),
        ...(outfits.length > 0 ? { outfits } : {}),
        ...(outfit ? { outfit } : {}),
        ...(baseOutfit ? { baseOutfit } : {}),
        ...(faces.length > 0 ? { expressions: Object.fromEntries(faces.map((n) => [n, `/api/agents/${p.id}/sprite/${n}`])) } : {}),
        ...(bio.length > 0 ? { bio } : {}),
        ...(facts.length > 0 ? { facts } : {}),
      },
    };
  });
  // The YOU sheet's wardrobe: the player's outfit in the active playthrough (null: the plain sprite).
  app.post('/api/persona/outfit', async (req, reply) => {
    if (!originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    const pt = world.active();
    if (!pt) return reply.code(409).send({ error: 'no-playthrough' });
    const body = req.body;
    const outfit = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).outfit : undefined;
    if (outfit !== null && (typeof outfit !== 'string' || !outfitNames(pt.player).includes(outfit))) return reply.code(400).send({ error: 'unknown-outfit' });
    playthroughs.setOutfit(pt.id, outfit);
    return outfit === null ? {} : { outfit };
  });
  // A character's figure (the persona never changes the body): `?as=<id>` names the character,
  // whichever playthrough is active (the load screen asks for each one's); no `?as=`, the visitor's.
  app.get<{ Querystring: { as?: string } }>('/api/persona/sprite', (req, reply) => {
    const id = typeof req.query.as === 'string' ? req.query.as : visitor(undefined)?.id;
    const p = id === undefined ? null : players.resolve(id);
    const sprite = p && p.id === id ? p.sprite : null;
    if (!sprite) return reply.code(404).send({ error: 'no persona sprite' });
    return reply.type('image/png').header('Cache-Control', 'no-cache').send(fs.createReadStream(sprite.file));
  });

  app.get<{ Params: { id: string } }>('/api/agents/:id/sprite', (req, reply) => {
    const rec = records.find((r) => r.info.id === req.params.id);
    if (!rec?.sprite) return reply.code(404).send({ error: 'no sprite' });
    return reply.type('image/png').header('Cache-Control', 'no-cache').send(fs.createReadStream(rec.sprite.file));
  });

  app.get<{ Params: { id: string; name: string } }>('/api/agents/:id/sprite/:name', (req, reply) => {
    const rec = records.find((r) => r.info.id === req.params.id);
    const file = rec?.sprite && Object.hasOwn(rec.sprite.expressions, req.params.name) ? rec.sprite.expressions[req.params.name] : undefined;
    if (!file) return reply.code(404).send({ error: 'no expression' });
    return reply.type('image/png').header('Cache-Control', 'no-cache').send(fs.createReadStream(file));
  });

  app.get<{ Params: { id: string; name: string } }>('/api/agents/:id/outfit/:name', (req, reply) => {
    const rec = records.find((r) => r.info.id === req.params.id);
    const file = rec?.sprite && Object.hasOwn(rec.sprite.outfits, req.params.name) ? rec.sprite.outfits[req.params.name] : undefined;
    if (!file) return reply.code(404).send({ error: 'no outfit' });
    return reply.type('image/png').header('Cache-Control', 'no-cache').send(fs.createReadStream(file));
  });

  // Photos on the deck (spec 2026-10-23 §1): her pool's files, and which of them fit her now (Studio's FITS NOW).
  app.get<{ Params: { id: string; photo: string } }>('/api/agents/:id/photo/:photo', (req, reply) => {
    const photo = records.find((r) => r.info.id === req.params.id)?.photos?.find((p) => p.id === req.params.photo);
    if (!photo) return reply.code(404).send({ error: 'no photo' });
    return reply.type('image/webp').header('Cache-Control', 'no-cache').send(fs.createReadStream(photo.file));
  });
  app.get<{ Params: { id: string } }>('/api/agents/:id/photos/now', (req, reply) => {
    const rec = records.find((r) => r.info.id === req.params.id);
    if (!rec) return reply.code(404).send({ error: 'no character' });
    const m = photoMoment(rec.sprite, world.whereNow(rec.info.id), world.clockNow() ?? START);
    return { scene: m.scene, outfit: m.outfit, band: m.band, fits: fittingPhotos(rec.photos ?? [], m).map((p) => p.id) };
  });

  const thumbs = createThumbs((m) => console.warn(`[thumbs] ${m}`));

  // A resident's images, as an agent's (same headers, same 404s).
  const png = (reply: import('fastify').FastifyReply, file: string | undefined, what: string) =>
    file ? reply.type('image/png').header('Cache-Control', 'no-cache').send(fs.createReadStream(file)) : reply.code(404).send({ error: `no ${what}` });
  app.get<{ Params: { id: string } }>('/api/residents/:id/sprite', (req, reply) => png(reply, residents.get(req.params.id)?.sprite.file, 'sprite'));
  app.get<{ Params: { id: string; name: string } }>('/api/residents/:id/sprite/:name', (req, reply) => {
    const faces = residents.get(req.params.id)?.sprite.expressions;
    return png(reply, faces && Object.hasOwn(faces, req.params.name) ? faces[req.params.name] : undefined, 'expression');
  });
  app.get<{ Params: { id: string; name: string } }>('/api/residents/:id/outfit/:name', (req, reply) => {
    const outfits = residents.get(req.params.id)?.sprite.outfits;
    return png(reply, outfits && Object.hasOwn(outfits, req.params.name) ? outfits[req.params.name] : undefined, 'outfit');
  });
  app.get<{ Params: { id: string } }>('/api/residents/:id/thumb', (req, reply) => {
    const rec = residents.get(req.params.id);
    const thumb = rec ? thumbs.get(rec.sprite.file, rec.face) : null;
    if (!thumb) return reply.code(404).send({ error: 'no thumbnail' });
    if (req.headers['if-none-match'] === thumb.etag) return reply.code(304).header('Cache-Control', 'no-cache').header('ETag', thumb.etag).send();
    return reply.type('image/png').header('Cache-Control', 'no-cache').header('ETag', thumb.etag).send(thumb.png);
  });
  // A stranger's face (stranger faces spec §2).
  // A quest's picture (quest art): world/quests/art/<file>, read per request (a new picture shows without a restart).
  const QUEST_ART = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(png|webp|jpg)$/;
  app.get<{ Params: { file: string } }>('/api/quests/art/:file', (req, reply) => {
    const m = QUEST_ART.exec(req.params.file);
    const file = m ? path.join(cfg.questsDir ?? DEFAULT_QUESTS_DIR, 'art', req.params.file) : null;
    if (!file || !fs.existsSync(file)) return reply.code(404).send({ error: 'no such picture' });
    return reply.type(m![1] === 'jpg' ? 'image/jpeg' : `image/${m![1]}`).header('Cache-Control', 'no-cache').send(fs.readFileSync(file));
  });
  app.get<{ Params: { id: string } }>('/api/extras/:id', (req, reply) => {
    const face = extrasPng.get(req.params.id);
    if (!face) return reply.code(404).send({ error: 'no such extra' });
    if (req.headers['if-none-match'] === face.etag) return reply.code(304).header('Cache-Control', 'no-cache').header('ETag', face.etag).send();
    return reply.type('image/png').header('Cache-Control', 'no-cache').header('ETag', face.etag).send(face.png);
  });
  app.get<{ Params: { id: string } }>('/api/agents/:id/thumb', (req, reply) => {
    const rec = records.find((r) => r.info.id === req.params.id);
    if (!rec?.sprite) return reply.code(404).send({ error: 'no thumbnail' });
    const thumb = thumbs.get(rec.sprite.file, rec.info.face);
    if (!thumb) return reply.code(404).send({ error: 'no thumbnail' });
    if (req.headers['if-none-match'] === thumb.etag) return reply.code(304).header('Cache-Control', 'no-cache').header('ETag', thumb.etag).send();
    return reply.type('image/png').header('Cache-Control', 'no-cache').header('ETag', thumb.etag).send(thumb.png);
  });

  /** Looks an id up in the roster (reloaded, so a just-added character.json is seen) and decides the GET/POST 404/409s. */
  async function findDirectRuntime(
    id: string,
    reply: import('fastify').FastifyReply,
  ): Promise<AgentRuntime | null> {
    const rec = reloadAgents().find((r) => r.info.id === id);
    if (!rec) {
      reply.code(404).send({ error: 'unknown agent' });
      return null;
    }
    if (rec.info.backend !== 'direct') {
      reply.code(409).send({ error: 'not-direct' });
      return null;
    }
    const rt = await runtime(id);
    if (!rt?.models) {
      reply.code(409).send({ error: 'not-connected' });
      return null;
    }
    return rt;
  }

  app.get<{ Params: { id: string } }>('/api/agents/:id/models', async (req, reply) => {
    const rt = await findDirectRuntime(req.params.id, reply);
    if (!rt) return;
    return rt.models!.event();
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/agents/:id/model', async (req, reply) => {
    const body = req.body;
    const model = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).model : undefined;
    // null: back to her default.
    if (model !== null && (typeof model !== 'string' || model.length < 1 || model.length > 200)) {
      return reply.code(400).send({ error: 'bad-model' });
    }
    const rt = await findDirectRuntime(req.params.id, reply);
    if (!rt) return;
    const why = await rt.models!.choose(model);
    if (why) return reply.code(400).send({ error: why });
    // Saved: the broadcast to her open tabs is best-effort and must not turn the save into a 500.
    void rt.hub.modelsChanged().catch((err) => console.warn(`[model] ${req.params.id}: broadcast failed after saving ${model ?? 'her default'}:`, err));
    return reply.code(204).send();
  });

  registerMapRoute(app, cfg.mapFile ?? DEFAULT_MAP_FILE);
  registerGigRoute(app, { gigsDir: cfg.gigsDir ?? DEFAULT_GIGS_DIR, mapFile: cfg.mapFile ?? DEFAULT_MAP_FILE });
  registerPapersRoutes(app, { papersDir: cfg.papersDir ?? DEFAULT_PAPERS_DIR, dataDir: cfg.dataDir, loreIds: () => loreIds });
  const openrouterUrl = cfg.openrouterBaseUrl ?? OPENROUTER_BASE_URL;
  registerLinkRoutes(app, {
    settings,
    baseUrl: openrouterUrl,
    catalog: createModelCatalog({ baseUrl: openrouterUrl, apiKey: () => settings.key('openrouter') }),
    runtimes: () => [...runtimes.values()],
    originAllowed,
  });
  registerPlaythroughRoutes(app, world, playthroughs, originAllowed);
  // Bug reports: the game's state as the player left it, sent to the relay or saved (spec 2026-10-11 bug report).
  registerBugReportRoutes(app, {
    relayUrl: cfg.bugRelayUrl ?? null,
    logFile: cfg.logFile ?? null,
    reportsDir: cfg.reportsDir ?? path.join(cfg.dataDir, 'bug-reports'),
    version: cfg.appVersion ?? '0.0.0',
    build: cfg.appBuild ?? null,
    keys: () => [settings.key('openrouter') ?? ''],
    originAllowed,
    context: () => {
      const pt = world.active();
      const turns = pt ? reportTurns(pt, 1) : [];
      return { playthroughName: pt?.name ?? null, hasTurns: turns.length > 0 };
    },
    state: async (includeTurns) => {
      const pt = world.active();
      // Solo: between scenes, with no one (location still names the contact you walked out on).
      const contactId = pt && !pt.solo ? (pt.location?.contactId ?? null) : null;
      // Only a room already open says who's here now; a report never builds a runtime (that would move the game).
      const rt = contactId ? runtimes.get(contactId) : undefined;
      const sceneId = rt?.room.state.sceneId ?? (contactId ? pt?.location?.sceneId : null) ?? null;
      const present = contactId ? [contactId, ...(rt ? rt.othersNow().map((o) => o.id) : [])] : [];
      const models = Object.fromEntries(
        present.flatMap((id) => {
          const m = settings.characterModel(id) ?? records.find((x) => x.info.id === id)?.info.modelLabel ?? null;
          return m ? [[id, m]] : [];
        }),
      );
      const clock = world.clockNow();
      return {
        version: cfg.appVersion ?? '0.0.0',
        build: cfg.appBuild ?? null,
        os: `${os.platform()} ${os.release()} ${os.arch()}`,
        runtime: [`Node ${process.versions.node}`, ...(process.versions.electron ? [`Electron ${process.versions.electron}`] : [])].join(' · '),
        playthrough: pt ? { id: pt.id, name: pt.name } : null,
        room: sceneId && contactId ? { sceneId, contactId } : null,
        present,
        models,
        clock: clock === null ? null : formatClock(clock),
        turns: includeTurns && pt ? reportTurns(pt, 10) : [],
      };
    },
  });
  /** The last turns with the contact the playthrough is with (or last was), from her database, read-only. */
  function reportTurns(pt: PlaythroughInfo, limit: number): { speaker: string; text: string }[] {
    const contactId = pt.location?.contactId ?? pt.startContact;
    const contact = records.find((r) => r.info.id === contactId)?.info.name ?? contactId;
    const you = world.players.resolve(undefined);
    return readTurns(path.join(world.stateDir(), contactId, 'room.db'), you.id, { player: you.name, contact }, limit);
  }
  // Scenario cards: a narrator (her model, your key) writes three openings for a new game.
  registerScenarioRoutes(app, {
    originAllowed,
    busy: () => world.busy(),
    target: (ai) => {
      const direct = records.find((r) => r.info.id === ai)?.direct;
      if (!direct) return null;
      return {
        kind: 'direct',
        // Her key (none needed for an address without auth).
        ready: () => direct.keyName === null || Boolean(settings.key(direct.keyName)),
        narrate: async (messages) => {
          const rt = await runtime(ai);
          if (!rt?.narrate) throw new Error('her model is not reachable');
          return rt.narrate(messages);
        },
      };
    },
    // The arrival screen's opening (spec 2026-10-27 §3): the playthrough's player, persona and all, in her room as it stands.
    promptFor: async (ai, steer) => {
      const rec = records.find((r) => r.info.id === ai);
      const rt = rec ? await runtime(ai) : null;
      const room = rt ? cityRooms.get(rt.room.state.sceneId) : undefined;
      if (!rec || !rt || !room) return null;
      const you = world.players.resolve(undefined);
      const picks = selectLore(loreBook, { ...places.locate(room.id), recent: [] }).picks.map((p) => p.entry);
      const { timeOfDay, weather } = rt.room.state.atmosphere;
      return scenePrompt({
        room: { name: room.name, art: roomArt(room.folder ?? room.id, room.description), timeOfDay, weather },
        lore: loreBlock(picks),
        you: you.whosHere ?? `[who's here: ${you.name}]`,
        her: whosHereBlock(rec.info.name, rec.info.pronoun, { tagline: rec.info.tagline, bio: rec.info.bio, facts: rec.info.facts }),
        player: you.name,
        steer,
      });
    },
  });

  // Encounter cards: three events for this moment in her room, from the room as it stands.
  registerEncounterRoutes(app, {
    originAllowed,
    busy: () => world.busy(),
    target: (ai) => {
      const direct = records.find((r) => r.info.id === ai)?.direct;
      if (!direct) return null;
      return {
        kind: 'direct',
        ready: () => direct.keyName === null || Boolean(settings.key(direct.keyName)),
        narrate: async (messages) => {
          const rt = await runtime(ai);
          if (!rt?.narrate) throw new Error('her model is not reachable');
          return rt.narrate(messages);
        },
      };
    },
    promptFor: async (ai) => {
      const rec = records.find((r) => r.info.id === ai);
      const rt = rec ? await runtime(ai) : null;
      const room = rt ? cityRooms.get(rt.room.state.sceneId) : undefined;
      if (!rec || !rt || !room) return null;
      // The visiting player, with this playthrough's persona.
      const you = world.players.resolve(undefined);
      const rows = rt.db.allMessages(you.id);
      // A few words each: a contact's tagline, a resident's voice cut short (a voice.md can run long).
      const others = rt.othersNow().map((o) => ({ name: o.name, pronoun: o.pronoun, voice: (o.kind === 'contact' ? o.tagline || o.voice : o.voice).slice(0, OTHER_VOICE_MAX) }));
      const { recent, loreRecent, stranger } = sceneNow(rows, { player: you.name, contact: rec.info.name, others: others.map((o) => o.name) });
      const picks = selectLore(loreBook, { ...places.locate(room.id), recent: loreRecent }).picks.map((p) => p.entry);
      const reserved = [you.name, rec.info.name, ...others.map((o) => o.name)];
      const { timeOfDay, weather } = rt.room.state.atmosphere;
      // Blackouts phase 3 §2: the narrator hears the power's out, and can't cut it again.
      const power = world.powerOf(rt.room.state.sceneId);
      return {
        reserved,
        // No power card where it can't land: already dark, or the Spine's own feed (final review M1).
        dark: !world.canCut(rt.room.state.sceneId),
        messages: encounterPrompt({
          power: power.outage ? narratorPowerLine(world.districtName(power.district), power.outage.from) : null,
          room: { name: room.name, art: roomArt(room.folder ?? room.id, room.description), timeOfDay, weather },
          lore: loreBlock(picks),
          you: you.whosHere ?? `[who's here: ${you.name}]`,
          her: whosHereBlock(rec.info.name, rec.info.pronoun, { tagline: rec.info.tagline, bio: rec.info.bio, facts: rec.info.facts }),
          others,
          stranger,
          recent,
          reserved,
        }),
      };
    },
  });

  // SUGGEST: her model drafts the player's next line for the chat box, from the room as it stands.
  registerSuggestRoutes(app, {
    originAllowed,
    busy: () => world.busy(),
    target: (ai) => {
      const direct = records.find((r) => r.info.id === ai)?.direct;
      if (!direct) return null;
      return {
        kind: 'direct',
        ready: () => direct.keyName === null || Boolean(settings.key(direct.keyName)),
        narrate: async (messages) => {
          const rt = await runtime(ai);
          if (!rt?.narrate) throw new Error('her model is not reachable');
          return rt.narrate(messages);
        },
      };
    },
    promptFor: async (ai, steer, travel) => {
      const rec = records.find((r) => r.info.id === ai);
      const rt = rec ? await runtime(ai) : null;
      const room = rt ? cityRooms.get(rt.room.state.sceneId) : undefined;
      if (!rec || !rt || !room) return null;
      // Whoever is talking to her (her last turn's player; the playthrough's, persona and all, when there is one).
      const you = world.players.resolve(rt.relay.activePlayer);
      const rows = rt.db.allMessages(you.id);
      const others = rt.othersNow().map((o) => ({ name: o.name, pronoun: o.pronoun, voice: (o.kind === 'contact' ? o.tagline || o.voice : o.voice).slice(0, OTHER_VOICE_MAX) }));
      const names = { player: you.name, contact: rec.info.name, others: others.map((o) => o.name) };
      const { recent, loreRecent, stranger } = sceneNow(rows, names, SUGGEST_RECENT_LINES);
      const picks = selectLore(loreBook, { ...places.locate(room.id), recent: loreRecent }).picks.map((p) => p.entry);
      const { timeOfDay, weather } = rt.room.state.atmosphere;
      return {
        player: you.name,
        others: [rec.info.name, ...others.map((o) => o.name), ...(stranger ? [stranger.name] : [])],
        messages: suggestPrompt({
          player: you.name,
          pronoun: you.pronoun,
          room: { name: room.name, art: roomArt(room.folder ?? room.id, room.description), timeOfDay, weather },
          lore: loreBlock(picks),
          you: you.whosHere ?? `[who's here: ${you.name}]`,
          her: whosHereBlock(rec.info.name, rec.info.pronoun, { tagline: rec.info.tagline, bio: rec.info.bio, facts: rec.info.facts }),
          others,
          stranger,
          summary: readSummary(rt.db, you.id)?.text ?? null,
          recent,
          steer,
          travel: travel ? { ...travel, contact: rec.info.name } : null,
        }),
      };
    },
  });

  app.get<{ Params: { pack: string } }>('/api/packs/:pack/scenes', async (req, reply) => {
    const pack = packs.get(req.params.pack);
    if (!pack) return reply.code(404).send({ error: `no scene pack '${req.params.pack}'` });
    return { base: `/scenes/${req.params.pack}/`, scenes: pack.registry.list() };
  });

  /** Every song in the game, for the dial-in's shuffle after the theme. */
  // The splash library (Studio's SPLASH tab): the images switched on, and their files.
  registerSplashRoutes(app, cfg.splashDir ?? './world/splash', (m) => console.warn(m), cfg.scenesDir);
  registerDistrictRoutes(app, {
    dir: cfg.districtsDir ?? './world/districts',
    districts: () => loreMap?.districts ?? [],
    places: () => loreMap?.places ?? [],
    lore: () => loreBook,
    warn: (m) => console.warn(m),
  });
  app.get('/api/songs', async () => ({ songs: gameSongs(cfg.scenesDir) }));
  // What sounds are on disk, read per request (Studio installs them while the server runs).
  const webSoundDir = cfg.webSoundDir ?? (cfg.webDist ? path.join(cfg.webDist, 'sound') : './web/public/sound');
  app.get('/api/sound-present', async () => ({ files: soundPresent(webSoundDir, cfg.scenesDir) }));

  // The deck (spec 2026-10-23 §5): its own socket, never a room's, so opening it doesn't enter one.
  app.get('/ws/deck', { websocket: true }, (socket, req) => {
    const query = req.query as { token?: string };
    if (!tokenEquals(query.token, cfg.token)) {
      socket.close(4401, 'invalid token');
      return;
    }
    if (!originAllowed(req.headers.origin)) {
      socket.close(4403, 'origin not allowed');
      return;
    }
    deck?.attach(socket);
  });

  app.get<{ Params: { id: string } }>('/ws/:id', { websocket: true }, async (socket, req) => {
    const query = req.query as { token?: string; as?: string | string[]; enter?: string };
    if (!tokenEquals(query.token, cfg.token)) {
      socket.close(4401, 'invalid token');
      return;
    }
    if (!originAllowed(req.headers.origin)) {
      socket.close(4403, 'origin not allowed');
      return;
    }
    if (!world.active()) {
      socket.send(JSON.stringify({ type: 'notice', text: 'no playthrough' } satisfies ServerEvent));
      socket.close(4409, 'no playthrough');
      return;
    }
    const rt = await runtime(req.params.id);
    if (!rt) {
      socket.close(4404, 'no connected agent');
      return;
    }
    // Who this tab visits as: the playthrough's player (`?as=` is ignored in a playthrough).
    // enter=1: the page's first socket (a room opened), not a reconnect.
    rt.hub.addClient(socket, world.players.resolve(typeof query.as === 'string' ? query.as : undefined).id, { entered: query.enter === '1' });
  });

  return {
    app,
    agents: () => records,
    runtime,
    runtimes: () => [...runtimes.values()],
    world,
    playthroughs,
    async close() {
      await app.close();
      for (const rt of runtimes.values()) rt.close();
    },
  };
}
