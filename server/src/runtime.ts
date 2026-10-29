import { fittingPhotos } from '../../shared/photos';
import { photoMoment } from './photos';
import { gigsFromEnv, rollsFromEnv } from './mission-run';
import type { CrewState } from '../../shared/crew-fold';
import { heatIn } from '../../shared/mission';
import type { StockItem } from '../../shared/stock';
import type { Deck } from '../../shared/gear';
import type { RoomRegistry } from './rooms';
import { completeOnce, completeOnceWithUsage, NARRATOR_MAX_TOKENS, NARRATOR_TEMPERATURE } from './scenario';
import { SCRIBE_TEMPERATURE, SCRIBE_TIMEOUT_MS, ScribeRunner, plansApply, promisesApply } from './scribe-runner';
import type { CompletionMessage } from './turn';
import type { LoreSelection } from '../../shared/lore';
import type { LeadsForTurn } from '../../shared/leads';
import { parseMap } from '../../shared/map-schema';
import fs from 'node:fs';
import path from 'node:path';
import type { CrewView, LinkState, OtherInfo, Present, ServerEvent } from '../../shared/types';
import type { AgentRecord, SpriteRecord } from './agents';
import { wearingEntries } from './wearing';
import { ChatRelay } from './chat-relay';
import { openDb, type Db, type RebuildResult } from './db';
import { isConnected } from './agents';
import type { Backend } from './backend';
import { createDirectBackend, type DirectBackend } from './direct';
import { createModelCatalog, createModelPicker, type ModelPicker } from './model-catalog';
import { createExpressionControl, type ExpressionControl } from './expressions';
import { residentInfo, sceneResidents, type ResidentRecord } from './residents';
import { createHub, PICK_CHECK_TIMEOUT_MS, type Hub } from './hub';
import { makeDiceLiner } from './dice';
import { recentLines } from './encounter';
import type { OtherVoice } from './instructions';
import { presenceNote } from './others';
import { Journal } from './journal';
import { identityWithOverride } from './playthrough-identity';
import type { Player } from './players';
import { Room } from './room-state';
import type { SceneRegistry } from './scenes';
import { dispatchTool, type ToolContext } from './tools';
import type { CheckpointPort } from './world';
import { nowOf, standingControl, storedStanding, trustControl } from './standing';
import { bandOf, standingBlock } from '../../shared/standing';
import { flagsOf, PICK_CHECK_MAX_TOKENS, PICK_RECENT_LINES, pickCheckMessages, type QuestEntry } from '../../shared/quests';
import type { Extra } from '../../shared/extras';
import type { Settings } from './settings';
import { MODEL_PICKS } from './default-models';
import { StoryMood } from './story-mood';
import { cityLine } from '../../shared/outage';
import { sameWeather, weatherOf, type CityWeather } from '../../shared/city-weather';

/** Her liar's dice line: what was said just before (lines), and room for one short JSON answer (spec §4). */
const DICE_RECENT_LINES = 12;
const DICE_LINE_MAX_TOKENS = 200;

const PROBE_CACHE_MS = 15_000;

/** Everything one connected agent's room needs, built once and kept for the server's lifetime. */

/** Missions' checks roll from NIX_TEST_ROLLS in e2e (one sequence for the whole server, read at the first roll); otherwise at random. */
let testRolls: (() => number) | undefined | null = null;
const roll = () => {
  if (testRolls === null) testRolls = rollsFromEnv();
  return testRolls ? testRolls() : 1 + Math.floor(Math.random() * 100);
};

export interface AgentRuntime {
  id: string;
  room: Room;
  /** Her room journal and recap. */
  journal: Journal;
  /** What her tools reach (her turns and the dev panel both run them against this). */
  tools: ToolContext;
  /** Everyone else in her room now, as her model is told about them. */
  othersNow: () => OtherVoice[];
  /** Tells her tabs who's here when that changed (the clock moved, someone came or went); never the same list twice. */
  refreshOthers: () => void;
  /** Everyone who could speak in her replies, as the feed splits them. */
  voices: () => OtherInfo[];
  db: Db;
  relay: ChatRelay;
  hub: Hub;
  /** Her room following the story (story moods spec §3): the world checks it when the clock moves. */
  storyMood: StoryMood;
  /** City weather (spec §4): her room takes the city's weather if you're with her (the first room gives it when there's none). */
  takeCityWeather: () => void;
  /** What runs her turns. */
  backend: Backend;
  /** A direct character: switch her model (a player setting; null: back to her default). */
  setModel?: (id: string | null) => void;
  /** A direct character: her model picker, for the model select routes. */
  models?: ModelPicker;
  /** A direct character: her provider credit, as last read (null: unknown). */
  credit?: () => number | null;
  /** A direct character: her current model's short label (the catalog's when it loads). */
  modelLabel?: () => Promise<string>;
  /** A direct character: one non-streaming request to her current model (scenario cards' narrator). */
  narrate?: (messages: CompletionMessage[]) => Promise<string>;
  /** Probes her provider and updates the room's link status (broadcast to her tabs if it changed). */
  checkHealth(): Promise<void>;
  /** A rebuild's changes go live: the room restores to what the database now holds, and changed panels refresh. */
  applyRebuild(r: RebuildResult): void;
  /** Her provider's reachability with her key, for the landing page (cached 15 s). */
  probe(): Promise<LinkState>;
  /** The key changed: forget every cached status and recheck (her tabs see the new link). */
  resetProbe(): Promise<void>;
  close(): void;
}

export interface RuntimeOptions {
  /** The deck (spec 2026-10-23 §5): a text turn's events for this contact, for the deck's sockets. */
  onText?: (contact: string, e: ServerEvent, player: string) => void;
  /** Who has texted you unseen (promised texts spec §6), for a tab that joins. */
  unreadTexts?: () => { id: string; name: string }[];
  /** Her plans (spec 2026-10-21 §4): the rooms that stand at a city map place, by scene id, with the map's name. */
  planPlaces?: () => { id: string; name: string }[];
  /** The player's settings: the linked key and each character's model. */
  settings: Settings;
  /** The player's data folder (settings.json, playthroughs/). */
  dataDir: string;
  /** The world's state: her room.db is `<stateDir>/<id>/room.db` (the active playthrough's chars/). */
  stateDir: string;
  /** Scene errors of her pack, shown in her dev panel. */
  sceneErrors: string[];
  /**
   * Who can visit (the app's world: the playthrough's player, with its persona). Its default player is who
   * her conversation is with when no one else is named: rows from before players belong to them.
   */
  players: { defaultId: string; resolve(id: string): Player };
  /** The city map's data, for travel (the hub re-reads it per move). */
  mapFile?: string;
  /** Gig briefs (world/gigs/), for the hub's checks on a finished run. */
  gigsDir?: string;
  /** Papers' data (world/papers/), to regenerate a finished papers run's board. */
  papersDir?: string;
  /** The lore book's ids, for papers' reasons. */
  loreIds?: () => ReadonlySet<string>;
  /** Every place's resident (fixed characters), by id; the rooms name theirs. */
  residents?: Map<string, ResidentRecord>;
  /** What another contact's model is told about one she shares a room with: her who's-here block, voice.md, faces, tagline; null when unknown. */
  describeOther?: (id: string) => { voice: string; file: string; faces: string[]; tagline: string } | null;
  /** Someone's sprite record, for what they have on; null when unknown. A contact's is read now, so Studio edits count; a resident's loads once at startup (app.ts), so her lines need a game restart. */
  wardrobe?: (id: string) => SpriteRecord | null;
  /** How the strip draws someone here (their tile and file card); absent: a plain tile in their name. */
  lookOf?: (p: Present) => OtherInfo;
  /** Her world: checkpoints at a conversation's end and on travel, and where the playthrough is. */
  checkpoints?: CheckpointPort;
  /** The contacts she could introduce (share_contact), and whom the player already knows. */
  contacts?: ToolContext['contacts'];
  /** The lore book's entries for a turn (see ChatRelayDeps.lore). */
  lore?: (sceneId: string, recent: string[], force?: readonly string[]) => LoreSelection;
  /** Her leads for a turn with `player` (see ChatRelayDeps.leads). */
  leads?: (contactId: string, player: string, recent: string[], replaced: readonly string[]) => LeadsForTurn;
  /** Quest lines (spec 2026-10-16): the book, and the map place a room's scene stands at. */
  quests?: {
    book(): QuestEntry[];
    extras?(): Extra[];
    decks?(): Deck[];
    placeOf(sceneId: string): string | null;
    placeName(placeId: string): string;
    contactName(id: string): string;
    /** Small jobs (spec 2026-10-19): a place's district, the terminal words, the fixers' stock. */
    districtOf?(placeId: string): string | null;
    words?(): string[];
    stock?(): Record<string, StockItem[]>;
    /** Crew (spec 2026-10-19 §4): the CREW screen's view; null without a playthrough. */
    crewView?(): CrewView | null;
    /** Crew (§2): the folded crew state; null without a playthrough. */
    crewState?(): CrewState | null;
  };
}

/** The map's name for a district folder (`velvet` → Velvet), else the folder itself. */
function districtNames(mapFile: string | undefined): (district: string) => string {
  try {
    const parsed = mapFile && fs.existsSync(mapFile) ? parseMap(JSON.parse(fs.readFileSync(mapFile, 'utf8'))) : null;
    const names = new Map(parsed?.ok ? parsed.map.districts.map((d) => [d.id, d.name]) : []);
    return (d) => names.get(d) ?? d;
  } catch {
    return (d) => d;
  }
}

export function createAgentRuntime(rec: AgentRecord, rooms: RoomRegistry, opts: RuntimeOptions): AgentRuntime {
  if (!isConnected(rec)) throw new Error(`agent '${rec.info.id}' is not connected`);
  const { id, name, accent, avatarKind } = rec.info;
  const dir = path.join(opts.stateDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const player = opts.players.defaultId;
  const db = openDb(path.join(dir, 'room.db'), { defaultPlayer: player });
  // No turn survives a restart: a reply still `streaming` belonged to a process that died mid-turn.
  db.recoverAfterCrash();
  // Every room in the city is reachable (the map walks you anywhere); hers are where she takes you herself.
  const room = new Room(rooms, db.loadRoom(), {
    mine: rec.info.rooms,
    start: rec.info.startRoom,
    legacyDistrict: rec.info.legacyDistrict,
    districtName: districtNames(opts.mapFile),
  });
  const journal = new Journal(db);
  const cp = opts.checkpoints;
  if (cp) {
    room.onChange((c) => {
      // A rebuild restoring another scene moves the playthrough there; it's no journey, so no checkpoint.
      if (c.op.tool === 'restore') {
        if (c.transition !== undefined) cp.moved(id);
        return;
      }
      if (c.op.tool !== 'go_to') return;
      // Her schedule moving her (source world) is no journey: no checkpoint, just where she is.
      if (c.source === 'world') {
        cp.moved(id);
        return;
      }
      // Her own move happens mid-turn: its checkpoint waits for the turn to end (no half-written reply in it).
      if (c.source === 'agent') cp.checkpoint({ trigger: 'travel', contactId: id, name: `${name} took you to ${cp.placeName(c.state.sceneId)}` });
      cp.moved(id);
    });
    // Walked in where the playthrough says she is (her schedule's place): her room opens there.
    const at = cp.placeFor(id);
    if (at && at !== room.state.sceneId) room.setScene({ id: at }, 'world');
  }
  // A direct character: her model (a player setting, not world state), the linked key (read per
  // request, so linking or unlinking applies at once), OpenRouter's model list and the MODEL menu.
  // Her identity: this playthrough's own (chars/<id>/identity.md) when it has one, else the shared file.
  const direct = rec.direct && { ...rec.direct, identity: identityWithOverride(dir, rec.direct.identity) };
  const settings = opts.settings;
  /** SYS → NARRATOR THINKING, read on every call (OpenRouter only): the narrator's calls and her dice lines. */
  const narratorThinking = () => (direct?.provider === 'openrouter' ? { thinking: settings.narratorThinking() } : {});
  const apiKey = (): string | null => (direct?.keyName == null ? '' : settings.key(direct.keyName));
  const modelStore = direct
    ? {
        get: () => settings.characterModel(id) ?? direct.defaultModel,
        set: (m: string | null) => {
          settings.setCharacterModel(id, m === direct.defaultModel ? null : m);
          if (m !== null) settings.pushRecent(m);
        },
      }
    : null;
  const catalog = direct ? createModelCatalog({ baseUrl: direct.baseUrl, apiKey }) : null;
  let directBackend: DirectBackend | null = null;
  const picker =
    direct && modelStore && catalog
      ? createModelPicker({
          catalog,
          defaultModel: direct.defaultModel,
          provider: direct.provider,
          curated: () => [...MODEL_PICKS.map((p) => p.id), ...settings.recentModels()],
          store: modelStore,
          credit: async () => {
            await directBackend!.probe();
            return directBackend!.credit();
          },
        })
      : null;

  // The city's residents: who stands in which room (a room naming an unknown one runs without).
  const byScene = sceneResidents(rooms.list(), opts.residents ?? new Map(), (m) => console.warn(`[residents] ${m}`));
  const residentFor = (sceneId: string): ResidentRecord | null => byScene.get(sceneId) ?? null;

  // The hub reads the relay lazily (the relay needs the hub's emit), so it's assigned right after.
  let relay!: ChatRelay;
  let hub!: Hub;
  const expressionNames = Object.keys(rec.sprite?.expressions ?? {});
  // Who's here (spec 2026-10-11 §2): the world's list at a clock, or (no world) the room's resident.
  const present = (clock: number | null): Present[] => {
    if (cp) return cp.othersHere(id, room.state.sceneId, clock ?? undefined);
    const r = residentFor(room.state.sceneId);
    return r ? [{ id: r.id, kind: 'resident', name: r.name, pronoun: r.pronoun }] : [];
  };
  /** What her model is told about one of them: a resident's record, else the contact's file via the app. */
  const voiceOf = (p: Present): OtherVoice => {
    const r = p.kind === 'resident' ? (opts.residents?.get(p.id) ?? null) : null;
    if (r) return { ...p, voice: r.voice(), file: null, faces: Object.keys(r.sprite.expressions) };
    const d = opts.describeOther?.(p.id) ?? null;
    return { ...p, voice: d?.voice ?? '', file: d?.file ?? null, faces: d?.faces ?? [], ...(d?.tagline ? { tagline: d.tagline } : {}) };
  };
  /** Everyone here at `clock`, then anyone here at `before` who has since left (her model plays the goodbye). */
  const othersAt = (clock: number | null, before: number | null): OtherVoice[] => {
    const now = present(clock);
    const gone = before === null ? [] : present(before).filter((p) => !now.some((n) => n.id === p.id));
    return [...now, ...gone].map(voiceOf);
  };
  const look = (p: Present): OtherInfo => opts.lookOf?.(p) ?? { ...p, accent: '#7fe9ff', thumb: null, sprite: null, face: { x: 0.5, y: 0.15 }, tagline: '', facts: [] };
  /** The clock of her latest settled reply to the pair her tabs follow; null when none. */
  const lastReplyClock = (): number | null =>
    db.recentMessages(relay.activePlayer, 20, 'scene').findLast((m) => m.role === 'agent' && m.status !== 'streaming' && m.clock !== undefined)?.clock ?? null;
  // Each other's face control, made when they're first here, and again when their faces change (Studio).
  const otherFaces = new Map<string, { names: string; control: ExpressionControl }>();
  // Anyone leaving is still here for the reply that plays their goodbye: their face can change in it.
  const othersWithFaces = () =>
    othersAt(cp?.clockNow() ?? null, lastReplyClock()).flatMap((o) => {
      if (o.faces.length === 0) return [];
      const names = o.faces.join(',');
      let held = otherFaces.get(o.id);
      if (!held || held.names !== names) {
        held = { names, control: createExpressionControl({ names: o.faces, db, relay: () => relay, emit: (e, p) => hub.emit(e, p), field: { other: o.id } }) };
        otherFaces.set(o.id, held);
      }
      return [{ id: o.id, name: o.name, expressions: held.control }];
    });
  /**
   * Who's here now, as the strip draws them, and anyone here at her last reply who has since left:
   * their tile stays until her next reply (the one that plays their goodbye) ends.
   */
  const othersInfo = (): OtherInfo[] => {
    const now = present(cp?.clockNow() ?? null);
    const then = lastReplyClock();
    const gone = then === null ? [] : present(then).filter((p) => !now.some((n) => n.id === p.id));
    return [...now, ...gone].map(look);
  };
  const voicesInfo = (): OtherInfo[] => (cp ? cp.voices(id) : present(null)).map(look);
  /** The list her tabs last heard (ids, in order); null until the first refresh. */
  let othersKey: string | null = null;
  const refreshOthers = () => {
    const list = othersInfo();
    const voices = voicesInfo();
    const key = `${list.map((o) => o.id).join(',')}|${voices.map((o) => o.id).join(',')}`;
    if (key === othersKey) return;
    othersKey = key;
    hub.emit({ type: 'others', others: list, voices });
  };
  /** On a clock move or a move: who's here, and the line (her place can change with her schedule). */
  const refreshAround = () => {
    refreshOthers();
    hub?.refreshComms();
  };
  const tools: ToolContext = {
    // Comms (spec 2026-10-20 §2): on the line, the room's tools aren't hers.
    comms: () => relay?.commsNow(tools.player())?.on === true,
    room,
    journal,
    others: othersWithFaces,
    self: [id, name],
    player: () => relay.activePlayer,
    replyId: () => relay.activeMessageId,
    replyTurn: () => relay.activeTurn,
    toolLine: (t) => hub.appendToolLine(t, relay.activePlayer),
    playSound: (scene, name, player) => hub.emit({ type: 'sound', scene, name }, player),
    share: (r) => db.shareContact(r),
    // give_lead: the leads this turn offers her; a given lead belongs to the turn's player and reply.
    leads: {
      offered: () => relay.offeredLeads().map((l) => ({ id: l.id, title: l.title })),
      give: (leadId, details, messageId) => db.giveLead({ id: leadId, player: relay.activePlayer, details, messageId, at: Date.now() }),
    },
    ...(opts.contacts ? { contacts: opts.contacts } : {}),
    // shift_standing: direct characters in a playthrough, for its player (Standing spec §4).
    ...(direct && cp
      ? {
          standing: standingControl({
            db,
            player: () => relay.activePlayer,
            start: (p) => cp.standingStart(id, p),
            config: () => cp.standingConfig(id),
            shared: () => cp.sharedStanding(),
            inCharacter: () => relay.activeInCharacter,
          }),
        }
      : {}),
    // pass_time: in a playthrough.
    ...(direct && cp ? { clock: { now: () => relay.turnNow(), pass: (m: number) => relay.passTime(m) } } : {}),
    expressions:
      expressionNames.length > 0
        ? createExpressionControl({ names: expressionNames, db, relay: () => relay, emit: (e, p) => hub.emit(e, p) })
        : null,
  };
  // The scribe (spec 2026-10-15): her bookkeeping, one call on her model after each reply, in a playthrough.
  /** Rewinds so far: a delayed end-of-scene save made before one is called off. */
  let rewinds = 0;
  const standingFor = (p: string) => (cp && cp.standingStart(id, p) !== null ? standingControl({ db, player: () => p, start: (q) => cp.standingStart(id, q), config: () => cp.standingConfig(id), shared: () => cp.sharedStanding() }) : null);
  // Photos on the deck (spec 2026-10-23): what fits her now, from where her schedule has her, and a sent photo's caption.
  const photoCaption = (photoId: string) => rec.photos?.find((p) => p.id === photoId)?.caption ?? null;
  // At the turn's own clock (a promised text is stamped when it came due, mid review I2), else now.
  const photosNow = (at: number | null) => {
    const clock = at ?? cp?.clockNow() ?? null;
    if (!cp || clock === null || !rec.photos?.length) return [];
    return fittingPhotos(rec.photos, photoMoment(rec.sprite, cp.placeAt(id, clock), clock));
  };
  const scribe =
    direct && cp && modelStore
      ? new ScribeRunner({
          db,
          journal,
          photoCaption,
          selfName: rec.info.name,
          selfPronoun: rec.info.pronoun,
          playerName: (p) => opts.players.resolve(p).name,
          roomLine: () => room.summary(),
          standing: standingFor,
          standingLine: (p) => {
            const start = cp.standingStart(id, p);
            if (start === null) return null;
            const now = nowOf(storedStanding(db, p, null), start, cp.standingConfig(id), cp.sharedStanding());
            return `${now.word} (trust ${now.values.trust}, warmth ${now.values.warmth})`;
          },
          setLight: (p, lightId, intensity) => dispatchTool({ ...tools, player: () => p }, 'set_light', { light_id: lightId, intensity }, 'world'),
          passTime: (p, r, minutes) => relay.scribePass(p, r.id, r.take, minutes),
          // Her plans: in a stamped in-character turn, not on comms (spec 2026-10-21 §4, §5).
          plan: (p, r) => {
            const reply = db.getMessage(p, r.id);
            const line = reply?.replyTo ? db.getMessage(p, reply.replyTo) : undefined;
            if (!plansApply(reply, line, relay.commsNow(p)?.on === true)) return null;
            // Her plans name the map's places and the rooms of her day (her home is often off the map).
            const map = opts.planPlaces?.() ?? [];
            const places = cp?.promisePlaces ? cp.promisePlaces(id, map) : map;
            return places.length > 0 ? { places, ...(line?.mode === 'text' ? {} : { here: room.state.sceneId }), onSet: () => relay.emitPlanCard(p) } : null;
          },
          herDay: () => cp?.dayLine?.(id) ?? null,
          storyClock: () => cp?.clockNow?.() ?? null,
          // Promised texts (spec 2026-10-23 §4): from any stamped in-character reply, comms included.
          promise: (p, r) => {
            const reply = db.getMessage(p, r.id);
            const line = reply?.replyTo ? db.getMessage(p, reply.replyTo) : undefined;
            if (!promisesApply(reply, line)) return null;
            const map = opts.planPlaces?.() ?? [];
            const places = cp?.promisePlaces ? cp.promisePlaces(id, map) : map;
            return places.length > 0 ? { places } : null;
          },
          complete: (messages, o) =>
            completeOnceWithUsage({
              baseUrl: direct.baseUrl,
              apiKey: apiKey(),
              model: modelStore.get(),
              messages,
              temperature: SCRIBE_TEMPERATURE,
              maxTokens: o.maxTokens,
              ...(direct.provider === 'openrouter' ? { thinking: 'auto' as const } : {}),
              signal: o.signal,
            }).then((r) => ({ text: r.text, ...(r.tokensIn !== null ? { tokensIn: r.tokensIn } : {}), ...(r.tokensOut !== null ? { tokensOut: r.tokensOut } : {}) })),
          log: (text) => hub.emit({ type: 'dev_log', level: 'info', text }),
          around: (p, messageId, fn) => hub.withToolLineReply(p, messageId, fn),
          standingShifted: (p, word) => hub.appendToolLine(`${rec.info.name} · now: ${word}`, p),
        })
      : null;
  // Her liar's dice round lines (spec §4): a small side call on her own model.
  const diceLine =
    direct && modelStore
      ? makeDiceLiner({
          identity: direct.identity,
          roomName: () => rooms.list().find((sc) => sc.id === room.state.sceneId)?.name ?? room.state.sceneId,
          you: (p) => opts.players.resolve(p).name,
          her: rec.info.name,
          expressions: expressionNames,
          recent: (p) => recentLines(db.recentMessages(p, undefined, 'scene'), { player: opts.players.resolve(p).name, contact: rec.info.name }).slice(-DICE_RECENT_LINES),
          narrate: (messages, signal) =>
            completeOnce({ baseUrl: direct.baseUrl, apiKey: apiKey(), model: modelStore.get(), messages, temperature: NARRATOR_TEMPERATURE, maxTokens: DICE_LINE_MAX_TOKENS, ...narratorThinking(), signal }),
        })
      : undefined;
  // The quest pick check (quest lines spec §3): a small side call on her model, before a line reaches her.
  const pickCheck =
    direct && modelStore && opts.quests
      ? async (p: string, line: string, signal: AbortSignal): Promise<string> => {
          const at = relay.questCheck(p);
          if (!at) return '{"pick":null}';
          const recent = recentLines(db.recentMessages(p, undefined, 'scene'), { player: opts.players.resolve(p).name, contact: rec.info.name }).slice(-PICK_RECENT_LINES);
          return completeOnce({
            baseUrl: direct.baseUrl,
            apiKey: apiKey(),
            model: modelStore.get(),
            messages: pickCheckMessages({ beat: at.beat, choices: at.choices, recent, line }),
            temperature: 0,
            maxTokens: PICK_CHECK_MAX_TOKENS,
            ...(direct.provider === 'openrouter' ? { thinking: 'auto' as const } : {}),
            timeoutMs: PICK_CHECK_TIMEOUT_MS,
            signal,
          });
        }
      : undefined;
  hub = createHub({
    ...(opts.unreadTexts ? { unreadTexts: opts.unreadTexts } : {}),
    ...(cp ? { herPlace: () => cp.herPlace(id), herScheduled: () => cp.scheduledRoomOf(id) } : {}),
    room,
    journal,
    tools,
    db,
    player,
    scenes: rooms.list(),
    sceneErrors: opts.sceneErrors,
    residents: Object.fromEntries([...new Set(byScene.values())].map((r) => [r.id, residentInfo(r)])),
    // A connecting tab gets the list as it is; the room's own key (what every tab last heard) stays.
    others: othersInfo,
    voices: voicesInfo,
    // Her face cut from her sprite when she has one (the who's-here thumb), else her mask portrait.
    portrait: { url: avatarKind === 'face' ? `/api/agents/${id}/thumb` : `/api/agents/${id}/avatar`, kind: avatarKind, accent, name, pronoun: rec.info.pronoun, sprite: rec.info.sprite },
    getRelay: () => relay,
    ...(diceLine ? { diceLine } : {}),
    ...(pickCheck ? { pickCheck } : {}),
    ...(picker ? { models: picker } : {}),
    ...(opts.mapFile ? { mapFile: opts.mapFile } : {}),
    ...(opts.gigsDir ? { gigsDir: opts.gigsDir } : {}),
    ...(opts.papersDir ? { papersDir: opts.papersDir } : {}),
    ...(opts.loreIds ? { loreIds: opts.loreIds } : {}),
    dataDir: opts.dataDir,
    ...(cp
      ? {
          // Map travel: the relay is idle, so this checkpoint holds the room being left.
          beforeTravel: ({ from, to }: { from: string | null; to: string }) =>
            cp.checkpoint({ trigger: 'travel', contactId: id, name: `Left ${from ?? cp.placeName(room.state.sceneId)} → ${to}` }),
          onJoin: () => cp.entered(id),
          tie: (p: string) => cp.tieFor(id, p),
          clock: () => cp.clockNow(),
          power: () => cp.powerNow(room.state.sceneId),
          powerOut: () => {
            const at = cp.clockNow();
            if (at !== null) cp.cutPower(id, null, at, room.state.sceneId);
          },
        }
      : {}),
  });
  // A new place has new people in it (after the world has heard she moved).
  room.onChange((c) => {
    if (c.op.tool === 'go_to' || (c.op.tool === 'restore' && c.transition !== undefined)) refreshOthers();
  });
  if (direct && modelStore && catalog) {
    directBackend = createDirectBackend({
      setup: direct,
      tools,
      model: modelStore,
      apiKey,
      onNotice: (text) => hub.emit({ type: 'notice', text }),
      labelFor: (m) => catalog.labelFor(m),
    });
  }
  // Only a connected (direct) character gets a runtime.
  if (!directBackend) throw new Error(`agent '${id}': no model to run her turns`);
  const backend: Backend = directBackend;
  relay = new ChatRelay({
    roll,
    ...(gigsFromEnv() ? { testGig: gigsFromEnv() } : {}),
    // Comms (spec 2026-10-20 §2): her place's name (her schedule, else where the line began) and yours; a dropped line goes solo.
    ...(cp
      ? {
          goSolo: () => cp.dropLine(),
          commsPlaces: () => {
            const her = cp.herPlace(id);
            return her ? { her: cp.placeName(her), you: cp.placeName(room.state.sceneId) } : null;
          },
        }
      : {}),
    // A job's trust stake (Intake board spec §2): a standing move in a playthrough, for its player.
    ...(cp ? { trust: trustControl({ db, name: rec.info.name, start: (p) => cp.standingStart(id, p), config: () => cp.standingConfig(id), shared: () => cp.sharedStanding() }) } : {}),
    backend,
    photosNow,
    photoCaption,
    // Ties: her line on the player from his background, while it applies (read every turn).
    tie: (p) => cp?.tieFor(id, p) ?? null,
    // The story clock: each turn's row is stamped with it, and every tab hears it move.
    ...(cp ? { cutPower: (rowId: string, at: number) => cp.cutPower(id, rowId, at, room.state.sceneId), cityLine: (clock: number) => {
      const p = cp.powerOf(room.state.sceneId, clock);
      return p.outage ? cityLine(cp.districtName(p.district), p.outage.from) : null;
    }, clockNow: () => cp.clockNow(), onClock: () => cp.clockChanged(), onLiveClock: () => cp.storyClock(id), scheduleLine: (clock: number) => cp.scheduleLine(id, clock), planCard: () => { const c = cp.planCard(id); return c ? { name: rec.info.name, ...c } : null; }, planNote: (mode, raw) => cp.planNote(id, mode, raw), planLeave: () => cp.planLeave(id), planNow: () => cp.planNow?.(id) ?? null } : {}),
    ...(direct ? { identity: direct.identity } : {}),
    db,
    players: opts.players,
    room,
    journal,
    emit: (e, p) => {
      hub.emit(e, p);
      // A rewind or a removal can cut texts too: the deck re-reads the thread (deck spec §3).
      if (e.type === 'messages_removed' && p !== undefined) opts.onText?.(id, e, p);
    },
    emitText: (e, p) => opts.onText?.(id, e, p),
    self: () => ({ name: rec.info.name, pronoun: rec.info.pronoun }),
    instructions: rec.instructions,
    oocInstructions: rec.oocInstructions,
    agentName: rec.info.name,
    ...(opts.lore ? { lore: opts.lore } : {}),
    ...(opts.leads ? { leads: (p: string, recent: string[], replaced: readonly string[]) => opts.leads!(id, p, recent, replaced) } : {}),
    // Quest lines (spec 2026-10-16): direct characters in a playthrough, for its player.
    ...(direct && cp && opts.quests
      ? {
          quests: {
            contact: id,
            book: () => opts.quests!.book(),
            extras: () => opts.quests!.extras?.() ?? [],
            status: (p: string) => cp.questStatus(p) ?? [],
            placeId: () => opts.quests!.placeOf(room.state.sceneId),
            placeName: (pid: string) => opts.quests!.placeName(pid),
            contactName: (cid: string) => opts.quests!.contactName(cid),
            ctx: (p: string) => {
              const status = cp.questStatus(p);
              if (status === null) return null;
              const start = cp.standingStart(id, p);
              const now = start === null ? null : nowOf(storedStanding(db, p, null), start, cp.standingConfig(id), cp.sharedStanding());
              // Missions (spec 2026-10-18): the player's heat, the deck they hold and their stats.
              const kit = cp.kitOf(p);
              const decks = opts.quests!.decks?.() ?? [];
              // Heat is the district's you stand in (small jobs spec §2); a job's own reads its district's (the relay's runCtx).
              const placeId = opts.quests!.placeOf(room.state.sceneId);
              const district = placeId ? (opts.quests!.districtOf?.(placeId) ?? null) : null;
              const kitCtx = kit ? { heat: heatIn(kit.kit, district), deck: decks.find((d) => d.id === kit.kit.deck) ?? null, stats: kit.stats } : {};
              return { flags: flagsOf(status), trust: now ? bandOf(now.values.trust) : null, warmth: now ? bandOf(now.values.warmth) : null, with: id, ...kitCtx };
            },
            kit: (p: string, at?: number) => cp.kitOf(p, at)?.kit ?? { deck: null, sol: 0, heat: {}, rep: {}, cover: { burner: 0, 'fall-guy': 0 }, edgeLeft: 0, edgeMax: 0 },
            decks: () => opts.quests!.decks?.() ?? [],
            districtOf: (placeId: string) => opts.quests!.districtOf?.(placeId) ?? null,
            // The nightly boards are seeded by the playthrough (small jobs spec §2).
            boardSeed: () => cp.active?.()?.id ?? '',
            words: () => opts.quests!.words?.() ?? [],
            stock: () => opts.quests!.stock?.() ?? {},
            crewView: () => opts.quests!.crewView?.() ?? null,
            crewState: () => opts.quests!.crewState?.() ?? null,
          },
        }
      : {}),
    // Standing (spec 2026-10-13 §5): direct characters in a playthrough, for its player.
    ...(direct && cp
      ? {
          standing: (p: string, replaced: string | null) => {
            const start = cp.standingStart(id, p);
            if (start === null) return null;
            const cfg = cp.standingConfig(id);
            const shared = cp.sharedStanding();
            const now = nowOf(storedStanding(db, p, replaced), start, cfg, shared);
            return standingBlock({ player: opts.players.resolve(p).name, values: now.values, cfg, shared });
          },
        }
      : {}),
    others: othersAt,
    // Outfit wears (spec 2026-10-19 §4): hers and the others' follow the scene, the player's the YOU sheet.
    ...(opts.wardrobe
      ? {
          wearing: (player: Player, others: readonly OtherVoice[]) =>
            wearingEntries({ self: { id, name, pronoun: rec.info.pronoun }, sceneId: room.state.sceneId, player, playerOutfit: cp?.outfitOf?.(player.id) ?? null, others, wardrobe: opts.wardrobe! }),
        }
      : {}),
    presence: (before, after) =>
      before === null || after === null ? null : presenceNote(present(before), present(after), (o) => cp?.nextPlaceOf(o, after) ?? null),
    ...(cp
      ? {
          onTurnEnd: ({ player, mode, ok, reply }: { player: string; mode: string | undefined; ok: boolean; reply: { id: string; take: number } | null }) => {
            // A text (deck spec §3) has no "here": you aren't together, so her going plan always stands.
            if (scribe && ok && reply && mode !== 'ooc') scribe.afterTurn(player, reply, mode === 'end' ? 'end' : 'turn', mode === 'text' ? undefined : room.state.sceneId);
            // A text (deck spec §2) never moves you: no turnEnded (it would put you in her room), no save of its own;
            // but a save queued while it typed is taken now (mid review I1).
            if (mode === 'text') {
              cp.settle?.();
              return;
            }
            // The end-of-scene save waits for the scribe's recap and dossier, so it holds them; a rewind or a
            // load in the meantime calls it off (it would save the wrong story).
            const ptAtEnd = cp.active?.()?.id ?? null;
            const rewindsAtEnd = rewinds;
            const save = () => {
              if (rewinds !== rewindsAtEnd || (cp.active?.()?.id ?? null) !== ptAtEnd) return;
              cp.checkpoint({ trigger: 'end', contactId: id, name: `Talk with ${name} ended` });
            };
            if (mode === 'end' && ok) {
              if (scribe) void scribe.wait(SCRIBE_TIMEOUT_MS).then(save);
              else save();
            }
            cp.turnEnded(id);
            refreshOthers();
          },
          ...(scribe
            ? {
                beforeTurn: () => scribe.wait(),
                onTakeReplaced: (messageId: string) => scribe.takeReplaced(messageId),
                onTakesCollapsed: (messageId: string, keep: number) => scribe.takesCollapsed(messageId, keep),
                onRewind: () => {
                  rewinds++;
                  scribe.abortAll();
                },
              }
            : {}),
          beforeRewind: () => cp.checkpointNow({ trigger: 'rewind', contactId: id, name: 'Before rewind' }),
        }
      : {}),
    onRebuild: (r: RebuildResult) => runtime.applyRebuild(r),
  });

  // Moods from story state (spec 2026-10-20 §3): on the world clock, for the player of the turn.
  const storyMood = new StoryMood({
    room: { scene: () => room.scene(), applyPreset: (a, src) => room.applyPreset(a, src), setPower: (a, src) => room.setPower(a, src) },
    power: () => cp?.powerOf(room.state.sceneId).outage ?? null,
    meta: { get: (k) => db.getMeta(k), set: (k, v) => db.setMeta(k, v), delete: (k) => db.deleteMeta(k) },
    now: () => cp?.clockNow() ?? null,
    jobOn: (p) => relay.jobOn(p ?? cp?.playerNow() ?? relay.activePlayer),
    herTurnChange: () => relay.activeMessageId !== null && herChangeIn === relay.activeMessageId,
  });
  /** The reply she last changed the room's look in (her own mood or lights, not a move). */
  let herChangeIn: string | null = null;
  // Walking into a room resets it to its defaults: it opens on the mood the story calls for. After the
  // move has reached every listener (the tabs see the new room before its mood).
  let closed = false;
  /** Room changes not made by the world so far: one after the move (her own mood in the same round) wins over the story's. */
  let changes = 0;
  /** City weather (spec §4): a room painted with no weather neither takes it nor gives it. */
  const hasWeather = () => room.scene().defaults.weather !== 'none';
  /** The city weather this room last gave, kept in her history (story meta), so a rewind knows when it undid one. */
  const GIVEN = 'cityWeather.given';
  let lastGiven = db.getMeta(GIVEN);
  /** Her room gives the city its weather (while you're with her), and her history keeps that it did. */
  const giveCityWeather = (w: CityWeather) => {
    if (!cp || cp.cityWeatherFor(id) === 'away') return;
    lastGiven = JSON.stringify(w);
    db.setMeta(GIVEN, lastGiven);
    cp.weatherChanged(id, w);
  };
  const takeCityWeather = () => {
    if (closed || !cp || !hasWeather()) return;
    const city = cp.cityWeatherFor(id);
    if (city === 'away') return;
    const here = weatherOf(room.state.atmosphere);
    if (!city) giveCityWeather(here);
    else if (!sameWeather(city, here)) room.setAtmosphere({ weather: city.weather, weather_level: city.level }, 'world');
  };
  /**
   * After a rewind or swipe: the city's weather goes back only when a weather change of hers was undone
   * (what her history says she last gave changed); either way her room then takes the city's.
   */
  const cityWeatherAfterRebuild = () => {
    if (closed || !cp || !hasWeather()) return;
    const given = db.getMeta(GIVEN);
    if (given !== lastGiven) {
      lastGiven = given;
      if (given !== null && cp.cityWeatherFor(id) !== 'away') cp.weatherChanged(id, JSON.parse(given) as CityWeather);
    }
    takeCityWeather();
  };
  /** The room's weather as of its last change: only an actual weather change gives the city's (Task 3 review I1). */
  let lastWeather = weatherOf(room.state.atmosphere);
  room.onChange((c) => {
    if (c.source !== 'world') changes++;
    const at = changes;
    if (c.source === 'agent' && c.op.tool !== 'go_to') herChangeIn = relay.activeMessageId;
    const now = weatherOf(c.state.atmosphere);
    const changed = !sameWeather(now, lastWeather);
    lastWeather = now;
    // The room's weather changed (not the move, whose weather is only its painted default, nor a rewind's restore,
    // which cityWeatherAfterRebuild settles): the city's follows.
    if (!closed && changed && c.op.tool !== 'go_to' && c.op.tool !== 'restore' && hasWeather()) giveCityWeather(now);
    if (c.op.tool !== 'go_to') return;
    // Not once the runtime has closed (a branch or a playthrough switch right after the move): its db is gone.
    queueMicrotask(() => {
      if (closed) return;
      // Walking in: the city's weather, then the story's mood; the tabs hear whether this room has power.
      takeCityWeather();
      if (cp) hub.emit({ type: 'power', ...cp.powerNow(room.state.sceneId) });
      storyMood.check(changes === at ? 'enter' : 'note');
    });
  });
  // A room opened on the contact you're with (you joined her before her room was open) takes the city's weather.
  queueMicrotask(takeCityWeather);

  let probed: { at: number; state: LinkState } | null = null;
  const runtime: AgentRuntime = {
    id,
    room,
    journal,
    tools,
    othersNow: () => othersAt(cp?.clockNow() ?? null, null),
    refreshOthers: refreshAround,
    voices: voicesInfo,
    db,
    relay,
    hub,
    storyMood,
    takeCityWeather,
    backend,
    ...(modelStore && directBackend && catalog
      ? {
          setModel: (m: string | null) => modelStore.set(m),
          credit: () => directBackend!.credit(),
          // The dial-in page waits at most 1.5 s on OpenRouter's list for a nicer label.
          modelLabel: () => catalog.labelSoon(modelStore.get(), 1_500),
          narrate: (messages: CompletionMessage[]) =>
            completeOnce({ baseUrl: direct!.baseUrl, apiKey: apiKey(), model: modelStore.get(), messages, temperature: NARRATOR_TEMPERATURE, maxTokens: NARRATOR_MAX_TOKENS, ...narratorThinking() }),
        }
      : {}),
    ...(picker ? { models: picker } : {}),
    applyRebuild(r) {
      if (r.roomChanged) room.restore(db.loadRoom());
      cityWeatherAfterRebuild();
      // A narrator's power cut goes with its encounter row (blackouts phase 3 §2).
      if (cp) {
        const player = cp.playerNow() ?? relay.activePlayer;
        cp.outagesAfterRebuild(id, (rid) => db.getMessage(player, rid) !== undefined);
        // The clock can stay where a rewind left the room (a WAIT floor): her room follows the power now (review M1).
        cp.storyClock(id);
      }
      journal.announce(r);
      // A rewind can turn the comms line on or off (comms review I3): the tabs hear it.
      if (r.quests) hub.refreshComms();
    },
    async checkHealth() {
      const ok = (await backend.probe()) === 'ok';
      // After a 401 the link stays down until a turn succeeds (or the key is relinked).
      hub.setLinkStatus(ok && !relay.authFailed ? 'ok' : 'down');
    },
    async probe() {
      if (probed && Date.now() - probed.at < PROBE_CACHE_MS) return probed.state;
      const state = await backend.probe();
      probed = { at: Date.now(), state };
      return state;
    },
    async resetProbe() {
      probed = null;
      directBackend.resetProbe();
      relay.clearAuthFailed();
      await runtime.checkHealth();
    },
    close() {
      closed = true;
      db.close();
    },
  };
  return runtime;
}
