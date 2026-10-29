import { sameWeather, type CityWeather } from '../../shared/city-weather';
import { commsKey, parseComms, type CommsState } from '../../shared/comms';
import { dayWords, promisePlaces } from '../../shared/promise';
import { markSeen, MEET_WAIT, parsePlan, planKey, planOver, planPlaceAt, planSeenKey, planTail, withSeen, type Plan, type SeenMark } from '../../shared/plan';
import type { Pronoun } from '../../shared/pronoun';
import { emptyCrewBook, type CrewBook } from '../../shared/crew-book';
import { parseInstance } from '../../shared/crew';
import { foldWithCrew, type CrewEvent, type CrewState } from '../../shared/crew-fold';
import { parseCrewEvents } from './crew-view';
import type { LeadEntry } from '../../shared/leads';
import { parseRun, type QuestEntry, type QuestStatus } from '../../shared/quests';
import type { Kit, KitEvent } from '../../shared/mission';
import { fixerKey, parseFixer } from '../../shared/stock';
import { bookId, repFromEnv, trustFromEnv } from './mission-run';
import { DEFAULT_STATS, edgeMax, type Stats } from '../../shared/stats';
import { DEFAULT_SHARED_STANDING, startValues, wordFor, type SharedStanding, type StoredStanding, type StandingConfig, type StandingValues } from '../../shared/standing';
import { readHeldLeads } from './leads-held';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { blockStartedBetween, DAY, hhmmOf, minuteOfDay, nextBlock, nextBlockStart, nextOccurrence, parseHhmm, scheduledRoom, START, weekdayName, weekdayOf, type Block } from '../../shared/clock';
import type { AroundEntry, ChatMessage, ChatMode, ContactEntry, HeldLead, LeadView, Location, PlaythroughInfo, Present, SaveInfo, SaveTrigger } from '../../shared/types';
import { strangerAt } from '../../shared/encounter';
import { speakerBeats } from '../../shared/beats';
import type { PlaythroughPersona } from '../../shared/persona';
import { contactsAndAround, knownContacts, placesOf, type RosterContact } from './contacts';
import { whoIsHere } from './others';
import { openDb, type Db } from './db';
import { storedStanding } from './standing';
import { withPersona, type createPlayers, type Player } from './players';
import type { LiveDbs, Playthroughs, SaveRequest } from './playthroughs';
import type { AgentRuntime } from './runtime';
import { addNarrated, darkNow, dropUndone, powerOf, type PowerPlace } from './power';
import type { Outage } from '../../shared/outage';

type Players = ReturnType<typeof createPlayers>;

/** `lastLine.text` keeps this many characters. */
export const LAST_LINE_MAX = 120;

export interface Checkpoint {
  trigger: 'end' | 'travel' | 'rewind';
  contactId: string;
  name: string;
}

/** What a runtime tells its world: the hooks behind automatic checkpoints and the playthrough's location. */
export interface CheckpointPort {
  /** The active playthrough's story clock (null without one: the lobby keeps no clock). */
  clockNow(): number | null;
  /** The clock moved: every open room's tabs hear it. */
  clockChanged(): void;
  /** The story moved the clock live with contact `id` (story moods spec §3): her room follows it if you're with her. */
  storyClock(id: string): void;
  /** The active playthrough's player (null in the lobby). */
  playerNow(): string | null;
  /** The city's weather for contact `id`'s room (city weather spec §5): `away` unless you're with her; null until a room has given it. */
  cityWeatherFor(id: string): CityWeather | null | 'away';
  /** Contact `id`'s room has this weather now: the city's, when you're with her (not solo). */
  weatherChanged(id: string, w: CityWeather): void;
  /** Every district dark now (blackouts phase 3 §1): the schedule's and the narrator's; none without a playthrough. */
  darkNow(): Outage[];
  /** A room's district and the outage it's in now (null: it has power; a place on the Ribbon or the Spine always has). */
  powerOf(sceneId: string, clock?: number): { district: string; outage: Outage | null };
  /** A narrator's power cut (§2): the room's district dark from `at` for 90 minutes, unless it already is. `rowId` null: the admin panel's, never undone. */
  cutPower(contactId: string, rowId: string | null, at: number, sceneId: string): void;
  /** After a rewind or swipe of `contactId`: her power cuts whose encounter row is gone are undone. */
  outagesAfterRebuild(contactId: string, hasRow: (id: string) => boolean): void;
  /** A district's name on the map (its id when the map doesn't name it). */
  districtName(id: string): string;
  /** Whether a narrator's power cut can land in `sceneId` now: it has power, and its own (not the Spine's feed). */
  canCut(sceneId: string): boolean;
  /** What a tab in `sceneId` hears (blackouts phase 3 §4): every dark district, and its own room's blackout. */
  powerNow(sceneId: string): { dark: string[]; here: { name: string; since: number } | null };
  /** Taken now when no turn streams; otherwise queued (one per world, the newest wins) until a turn ends. */
  checkpoint(t: Checkpoint): void;
  /**
   * Taken now even while a turn streams (a rewind can't wait: queued, it would land after the
   * lines it should keep). A reply still streaming elsewhere is saved as it stands, and reads as
   * lost when that save is loaded. Never throws: false when it failed (her tabs get a notice).
   */
  checkpointNow(t: Checkpoint): boolean;
  /** The playthrough being played (a delayed save checks it's still the same one); absent in test fakes. */
  active?(): { id: string } | null;
  /** The YOU sheet's outfit for `player` in the active playthrough (theirs only); null when none. Absent in test fakes. */
  outfitOf?(player: string): string | null;
  /** A turn of `contactId` settled: the playthrough's location follows her room, and a queued checkpoint runs. */
  turnEnded(contactId: string): void;
  /** A turn that doesn't touch where you are ended (a text, deck spec §2): a checkpoint queued while it ran is taken now. */
  settle(): void;
  /** `contactId`'s room changed scene. */
  moved(contactId: string): void;
  /** A room page opened on `contactId` (its first socket, not a reconnect): the player is with her now. */
  entered(contactId: string): void;
  /** Where her room should open (the location you were sent to), when the playthrough says you're with her; null otherwise. */
  placeFor(contactId: string): string | null;
  /** Her `[your schedule: …]` prompt line at `clock` (default: now); null without a schedule. */
  scheduleLine(contactId: string, clock?: number): string | null;
  /** Her plan's card (her plans spec §5): a going plan that stands while she's with you, off comms; null otherwise. */
  planCard(contactId: string): { going: string; meet: { place: string; time: string } | null; from: string } | null;
  /**
   * Her plan's line for this turn while she's with you (spec §6): the meeting you came to (a greet), or the one you
   * missed; `spend` when the plan is over and her reply should drop it. Null: nothing to say or spend.
   */
  planNote(contactId: string, mode: ChatMode, raw?: string | null): { line: string | null; spend: boolean } | null;
  /** Her plan's places by name, for her goodbye (mid review M3): whatever the clock or where you are; null without one. */
  planLeave(contactId: string): { going: string; meet: { place: string; time: string } | null } | null;
  /** Where her body is while you're on comms with her (spec 2026-10-20 §1); null when you're not. */
  herPlace(contactId: string): string | null;
  /** The comms line dropped (spec §1): go solo, and every tab hears it (they go to /solo). */
  dropLine(): void;
  /** Her scheduled room at the clock now (null: no schedule, a free block, or no playthrough). */
  scheduledRoomOf(contactId: string): string | null;
  /** Her plan now by place names, unless it's over (deck spec §4); null without one. */
  planNow(contactId: string): { going: { place: string; until: string } | null; meet: { place: string; time: string } | null } | null;
  /** The places she can promise to text from: `map`, plus the rooms of her day (deck controls e2e finding). */
  promisePlaces(contactId: string, map: readonly { id: string; name: string }[]): { id: string; name: string }[];
  /** Her schedule in words for the scribe (deck controls spec §1); null without one. */
  dayLine(contactId: string): string | null;
  /** Where the world places her at `clock` (plan, left-behind, schedule); null while you're with her or with no playthrough. */
  placeAt(contactId: string, clock: number): string | null;
  /** Where she is now as the world places her (plan, left-behind, schedule); null while you're with her or with no playthrough (deck spec §2). */
  whereNow(contactId: string): string | null;
  /** Everyone in `sceneId` at `clock` (default: now) besides `contactId` and the player: the resident first, then contacts in roster order. Without a playthrough, only the resident. */
  othersHere(contactId: string, sceneId: string, clock?: number): Present[];
  /** The map's name for the place of `contactId`'s next schedule block after `clock`; null without a schedule. */
  nextPlaceOf(contactId: string, clock: number): string | null;
  /**
   * Everyone who could speak in `contactId`'s replies, wherever they are now: every resident and
   * every roster contact but her, the player and their namesakes. Her past replies are split by
   * these, so a goodbye stays its speaker's after they've gone.
   */
  voices(contactId: string): Present[];
  /** Her line on `player` from his background (ties), in the active playthrough; null: none. */
  tieFor(contactId: string, player: string): string | null;
  /** Where her standing on `player` starts (Standing spec §3): the tie's start, else her Studio start, else 0/0; null when standing doesn't apply (no playthrough, or anyone but its player). */
  standingStart(contactId: string, player: string): StandingValues | null;
  /** Her `standing` block (want, secret, words); null without one. */
  standingConfig(contactId: string): StandingConfig | null;
  /** The shared words and band lines (world/standing.json). */
  sharedStanding(): SharedStanding;
  /** The leads `player` holds in the active playthrough (Leads spec §4); null when leads don't apply (no playthrough, or anyone but its player). */
  heldLeads(player: string): HeldLead[] | null;
  /** Every quest run `player` has in the active playthrough, in whose room (Quest lines spec §4); null when quests don't apply (no playthrough, or anyone but its player). Read fresh, as held leads are. */
  questStatus(player: string): QuestStatus[] | null;
  /** `player`'s kit now (missions spec §1): their character's stats and starting deck, with every mission run's events folded in, from every contact's room; null when it doesn't apply (no playthrough, or anyone but its player). */
  /** The kit now, or at story-clock minute `at` (events after it left out). */
  /** The kit and the crew folded on one timeline (crew spec §3). */
  kitOf(player: string, at?: number): { kit: Kit; stats: Stats; crew: CrewState } | null;
  /** LEADS: the leads the active playthrough's player holds, open ones first, oldest first within each. Throws 'no-playthrough'. */
  leads(): LeadView[];
  /** The map's name for a scene, else the scene's own name. */
  placeName(sceneId: string): string;
}

/** The active playthrough, the runtimes built against it and who plays in it. */
export interface World extends CheckpointPort {
  active(): PlaythroughInfo | null;
  /** The runtimes' state directory: the active playthrough's chars/, else the lobby's. */
  stateDir(): string;
  /** In a playthrough every visitor is its player (`?as=` is ignored); without one, the roster's players. */
  players: Players;
  /** The first contact whose turn is streaming, or null. */
  busy(): string | null;
  /** Switches worlds: refused while a turn streams; otherwise tabs hear world-changed and every runtime closes. */
  activate(id: string): PlaythroughInfo | { busy: string };
  /** A new playthrough for `player`, activated. */
  create(player: string, startContact: string, name?: string, persona?: PlaythroughPersona): PlaythroughInfo | { busy: string };
  /** Whether `contactId` is a connected contact in the roster. */
  inRoster(contactId: string): boolean;
  /**
   * A manual save of the active playthrough; refused while a turn streams. Saved from a known
   * contact's room (`contactId`), it's at her room and the playthrough moves there; else at its location.
   */
  save(name: string, contactId?: string): SaveInfo | { busy: string };
  /** The save's description of the world as `contactId`'s room has it now. */
  saveRequest(contactId: string, trigger: SaveTrigger, name: string): SaveRequest;
  /** The contacts the player knows in the active playthrough (§7); a location naming one who left the roster is corrected. */
  contacts(): ContactEntry[];
  /** How many contacts the player knows in `pt` (any playthrough, not just the active one); null when its databases can't be read. */
  contactCount(pt: PlaythroughInfo): number | null;
  /** Whether this roster character has a sprite (the load screen's portrait; a persona never changes the body). */
  hasSprite(player: string): boolean;
  /** Whether the player knows `contactId` in the active playthrough (false without one). */
  isKnown(contactId: string): boolean;
  /** Puts the player in a known contact's room, or a stranger's (AROUND LOWLIGHT), at the scene it shows now (and out of solo). */
  setLocation(contactId: string): Location | 'unknown';
  /** AROUND LOWLIGHT: the roster contacts the player doesn't know yet, where each is. Throws 'no-playthrough'. */
  around(): AroundEntry[];
  /** WAIT (between scenes): the clock moves on and never comes back below it. 'bad' for a bad request. Throws 'no-playthrough'. */
  wait(o: { minutes?: unknown; until?: unknown }): { clock: number } | { busy: string } | 'bad';
  /** The active playthrough's story clock. Throws 'no-playthrough'. */
  clock(): number;
  /** WALK OUT: the active playthrough goes solo (idempotent); refused while a turn streams (it would land mid-scene). Throws 'no-playthrough'. */
  goSolo(): PlaythroughInfo | { busy: string };
  /**
   * BRANCH HERE: a new playthrough holding the whole story as it was just after `messageId` in
   * `contactId`'s chat — every contact cut at that line's time, state rebuilt — and activated. The
   * one it came from is never written. Refused while a turn streams; 'unknown' for a line that isn't there.
   */
  branch(contactId: string, messageId: string): PlaythroughInfo | { busy: string } | 'unknown';
}

/** A branch's `forkedFrom.message.excerpt` keeps this many characters of the line. */
export const BRANCH_EXCERPT_MAX = 60;

/**
 * The newest roleplay line in `messages` and who said it: the player's, hers, or — a reply's last
 * paragraph marked `Hae:` — the resident's.
 */
export function lastLine(messages: ChatMessage[], names: { player: string; contact: string; residents: string[] }): SaveInfo['lastLine'] {
  // Your lines and hers in character — her answer to an event or a move too (its prompt row isn't a line).
  const at = messages.findLastIndex(
    (x) => (!x.mode || (x.role === 'agent' && (x.mode === 'encounter' || x.mode === 'quest' || x.mode === 'travel' || x.mode === 'greet'))) && x.status === 'ok' && x.text.trim() !== '',
  );
  if (at < 0) return null;
  const m = messages[at];
  const clip = (text: string) => text.trim().slice(0, LAST_LINE_MAX);
  if (m.role === 'user') return { speaker: names.player, text: clip(m.text) };
  // An event's stranger, if one was here: their paragraph ends her reply under their name.
  const stranger = strangerAt(messages, at)?.name ?? null;
  const last = speakerBeats(m.text, names.residents.map((n) => ({ id: n, name: n })), names.contact, stranger).at(-1)!;
  if (last.who === 'other') return { speaker: last.id!, text: clip(m.text.slice(last.markers.at(-1)![1], last.end)) };
  if (last.who === 'stranger') return { speaker: stranger!, text: clip(m.text.slice(last.markers.at(-1)![1], last.end)) };
  return { speaker: names.contact, text: clip(m.text.slice(last.markers.at(-1)?.[1] ?? last.start, last.end)) };
}

/** The largest clock stamp in a closed contact database, read-only; null when none (or a db from before the clock). */
function maxClockIn(file: string): number | null {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const r = db.prepare("SELECT MAX(clock) AS m FROM messages WHERE status != 'failed'").get() as { m: number | null } | undefined;
      return r?.m ?? null;
    } finally {
      db.close();
    }
  } catch (err) {
    // A database from before the clock has no stamps; anything else is worth knowing (the clock reads low without it).
    const message = err instanceof Error ? err.message : String(err);
    if (!/no such column/.test(message)) console.error(`[clock] ${file}: unreadable: ${message}`);
    return null;
  }
}

export function createWorld(deps: {
  /** The story clock moved (a turn, WAIT): promised texts are checked (spec 2026-10-23 §5). */
  onClockMoved?: () => void;
  playthroughs: Playthroughs;
  basePlayers: Players;
  registry: { all(): AgentRuntime[]; reset(): void };
  personaName(player: string): string;
  /** A contact's display name. */
  contactName(id: string): string;
  /** The map's name for a scene, else the scene's own name. */
  placeName(sceneId: string): string;
  /** Whether a room by this full id is in the city. */
  hasScene(sceneId: string): boolean;
  /** Every resident's name (whose `Name:` paragraphs a reply may end on). */
  residentNames: string[];
  /** The resident a room names, if she loaded; null for none. */
  residentOf?(sceneId: string): { id: string; name: string; pronoun: Pronoun } | null;
  /** Every resident (id and name). */
  residents?(): { id: string; name: string; pronoun: Pronoun }[];
  /** The contacts that can be known: the connected characters, read now. */
  roster(): RosterContact[];
  /** Who `player`'s character knows from his background (roster id → her line); read live. */
  ties?(player: string): Record<string, string>;
  /** The standing starts on `player`'s ties (roster id → values); read live. */
  tieStarts?(player: string): Record<string, Partial<StandingValues>>;
  /** Her `standing` block; read live. */
  standingConfig?(contactId: string): StandingConfig | null;
  /** world/standing.json; read live. */
  sharedStanding?(): SharedStanding;
  /** Her daily schedule (blocks); read live. */
  schedule?(contactId: string): Block[];
  /** The lead book (world/leads/). */
  leadBook?(): LeadEntry[];
  /** The quest book (world/quests). */
  questBook?(): QuestEntry[];
  /** A roster character's stats and starting deck (missions spec §1); read live. Absent: 3s and none. */
  kitStart?(player: string): { stats: Stats; deck: string | null };
  /** A map place's district (small jobs spec §2): where an old mission's district-less heat lands. */
  districtOf?(placeId: string): string | null;
  /** The crew tables (world/crew). */
  crewBook?(): CrewBook;
  /** What seeds the crew's draws and rolls for a playthrough (its id; e2e pins it). */
  crewSeed?(playthroughId: string): string;
  /** Names for crew result lines: a map place's (by place id) and a district's. */
  crewPlaceName?(placeId: string): string;
  districtName?(districtId: string): string;
  /** Blackout rates per district (blackouts phase 3 §1): none, no scheduled blackouts. */
  outageRates?: Record<string, number>;
  /** Where a room stands for its power: its map place's district and structure, or its exit's district. */
  powerPlace?(sceneId: string): PowerPlace | null;
  /** Districts kept dark day and night (NIX_ROOM_OUTAGES): live checks only. */
  forcedOutages?: string[];
}): World {
  const { playthroughs, basePlayers, registry } = deps;
  const runtimeOf = (id: string) => registry.all().find((rt) => rt.id === id);
  /** The checkpoint waiting for the turn in progress to end. */
  let pending: Checkpoint | null = null;

  /** Whose `Name:` paragraphs a reply may end on: every resident, and every contact (someone here), never the player. */
  const speakerNames = (pt: PlaythroughInfo): string[] =>
    [...deps.residentNames, ...deps.roster().filter((c) => c.id !== pt.player).map((c) => c.name)].filter((n) => n !== playerName(pt));

  /** Who the player is called in `pt`: their persona's name, else the character's. */
  const playerName = (pt: PlaythroughInfo): string => pt.persona?.name ?? playerOf(pt.player).name;

  /** The playthrough's player, even when the roster no longer has them (a bare name, no lines). */
  function playerOf(id: string): Player {
    const p = basePlayers.resolve(id);
    return p.id === id ? p : { id, name: id.charAt(0).toUpperCase() + id.slice(1), pronoun: 'they', line: null, whosHere: null, sprite: null };
  }

  const players: Players = {
    get defaultId() {
      return playthroughs.active()?.player ?? basePlayers.defaultId;
    },
    resolve(asParam) {
      const pt = playthroughs.active();
      if (!pt) return basePlayers.resolve(asParam);
      return pt.persona ? withPersona(playerOf(pt.player), pt.persona) : playerOf(pt.player);
    },
  };

  function busy(): string | null {
    return registry.all().find((rt) => rt.relay.busy)?.id ?? null;
  }

  /** WALK OUT (and a dropped comms line): solo, parted from her; refused while a turn streams. */
  function goSoloNow(): PlaythroughInfo | { busy: string } {
    const pt = playthroughs.active();
    if (!pt) throw new Error('no-playthrough');
    const streaming = busy();
    if (streaming) return { busy: streaming };
    if (!pt.solo) {
      // A line that just ended (HANG UP, or dropped) puts her room back at her own place first (comms spec §1).
      const ended = pt.location ? commsOf(pt, pt.location.contactId) : null;
      if (pt.location && ended && !ended.on && ended.at) {
        const blocks = deps.schedule?.(pt.location.contactId) ?? [];
        const place = (blocks.length > 0 ? scheduledRoom(blocks, clockOf(pt)) : null) ?? ended.at;
        const room = runtimeOf(pt.location.contactId)?.room;
        if (room && room.state.sceneId !== place) room.setScene({ id: place }, 'world');
      }
      // You walk out on her: she stays where you left her until her next scheduled change.
      if (pt.location) playthroughs.setParted(pt.id, { ...(pt.parted ?? {}), [pt.location.contactId]: clockOf(pt) });
      playthroughs.setSolo(pt.id, true);
    }
    return playthroughs.get(pt.id)!;
  }

  function activate(id: string): PlaythroughInfo | { busy: string } {
    const info = playthroughs.get(id);
    if (!info) throw new Error(`no playthrough '${id}'`);
    const streaming = busy();
    if (streaming) return { busy: streaming };
    pending = null;
    for (const rt of registry.all()) rt.hub.emit({ type: 'world-changed', playthrough: info.id, location: info.location, ...(info.solo ? { solo: true } : {}) });
    registry.reset();
    playthroughs.setActive(info.id);
    return info;
  }

  /** Contacts with a database in the playthrough. */
  function participants(pt: PlaythroughInfo): string[] {
    const chars = playthroughs.charsDir(pt.id);
    if (!fs.existsSync(chars)) return [];
    return fs
      .readdirSync(chars, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(chars, e.name, 'room.db')))
      .map((e) => e.name)
      .sort();
  }

  /**
   * The story clock (spec 2026-10-10): derived, never stored — the largest stamp left in any of
   * `pt`'s contact databases, never below its WAIT floor, START with neither. A rewind, a branch or a
   * load cut stamps with their rows, so the clock follows them.
   */
  function clockOf(pt: PlaythroughInfo): number {
    let m = Math.max(START, pt.clockFloor ?? 0);
    for (const id of participants(pt)) {
      const open = runtimeOf(id)?.db;
      const stamp = open ? open.maxClock() : maxClockIn(path.join(playthroughs.charsDir(pt.id), id, 'room.db'));
      if (stamp !== null && stamp > m) m = stamp;
    }
    return m;
  }

  /** Every participant's database: her runtime's, or one opened just for `use` (closed after). */
  function withDbs<T>(pt: PlaythroughInfo, use: (dbs: Map<string, Db>) => T): T {
    const dbs = new Map<string, Db>();
    const opened: Db[] = [];
    try {
      for (const id of participants(pt)) {
        let db = runtimeOf(id)?.db;
        if (!db) {
          db = openDb(path.join(playthroughs.charsDir(pt.id), id, 'room.db'), { defaultPlayer: pt.player });
          opened.push(db);
        }
        dbs.set(id, db);
      }
      return use(dbs);
    } finally {
      for (const db of opened) db.close();
    }
  }

  function request(pt: PlaythroughInfo, dbs: Map<string, Db>, contactId: string, trigger: SaveTrigger, name: string): SaveRequest {
    const room = runtimeOf(contactId)?.room;
    const db = dbs.get(contactId);
    return {
      kind: trigger === 'manual' ? 'manual' : 'checkpoint',
      trigger,
      name,
      location: room ? { contactId, sceneId: room.state.sceneId } : pt.location,
      timeOfDay: room ? room.state.atmosphere.timeOfDay : null,
      participants: [...dbs.keys()],
      ...(pt.solo ? { solo: true } : {}),
      clock: clockOf(pt),
      lastLine: db
        ? lastLine(db.allMessages(pt.player), { player: playerName(pt), contact: deps.contactName(contactId), residents: speakerNames(pt).filter((n) => n !== deps.contactName(contactId)) })
        : null,
    };
  }

  function write(pt: PlaythroughInfo, contactId: string, trigger: SaveTrigger, name: string): SaveInfo | 'unchanged' {
    return withDbs(pt, (dbs) => playthroughs.save(pt.id, request(pt, dbs, contactId, trigger, name), dbs as LiveDbs));
  }

  /** Never throws: a failed checkpoint is logged and told to her tabs, and play goes on. */
  /** True when the world is saved as it stands (written, or unchanged since the newest save). */
  function take(t: Checkpoint): boolean {
    try {
      const pt = playthroughs.active();
      if (pt) write(pt, t.contactId, t.trigger, t.name);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[checkpoint] ${t.name}: ${message}`);
      runtimeOf(t.contactId)?.hub.emit({ type: 'notice', text: `Checkpoint failed: ${message}` });
      return false;
    }
  }

  /** The playthrough's location: where `contactId`'s room is now. */
  function touch(contactId: string): void {
    placesMemo = null;
    const pt = playthroughs.active();
    const room = runtimeOf(contactId)?.room;
    if (!pt || !room) return;
    try {
      // Moving to her from someone else (a turn ending in another tab): you've left that one where she is.
      const prev = pt.location?.contactId;
      const moved = prev !== undefined && prev !== contactId && !pt.solo;
      const parted = moved || pt.parted?.[contactId] !== undefined ? { ...(pt.parted ?? {}) } : null;
      if (parted && moved) parted[prev!] = clockOf(pt);
      if (parted) delete parted[contactId];
      playthroughs.touch(pt.id, { contactId, sceneId: room.state.sceneId }, parted ? { parted } : {});
      // You're with her now: her room takes the city's weather, once the change in progress has reached everyone.
      queueMicrotask(() => runtimeOf(contactId)?.takeCityWeather());
      // Someone moved (or was left somewhere): every room's strip may change.
      for (const rt of registry.all()) rt.refreshOthers();
    } catch (err) {
      console.error(`[playthrough] location not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** `pt`'s ties: its player's, when he plays as written or with EDIT (CUSTOM is someone else; an old persona has no kind). */
  function tiesOf(pt: PlaythroughInfo): Record<string, string> {
    if (pt.persona && pt.persona.kind !== 'edit') return {};
    return deps.ties?.(pt.player) ?? {};
  }

  /** Where her standing on `pt`'s player starts: ties count only as tiesOf has them (as written or EDIT). */
  function standingStartOf(pt: PlaythroughInfo, contactId: string): StandingValues {
    const tie = tiesOf(pt)[contactId] !== undefined ? (deps.tieStarts?.(pt.player)[contactId] ?? null) : null;
    const start = startValues(tie, deps.standingConfig?.(contactId) ?? null);
    // Test-only (e2e): NIX_TEST_TRUST sets where trust starts for that player and contact.
    const seeded = trustFromEnv().find((t) => t.player === pt.player && t.contact === contactId);
    return seeded ? { ...start, trust: seeded.trust } : start;
  }

  /** How `pt`'s lists name places and people: her open room's scene first, then her database's. */
  /**
   * Every contact's place in `pt` at `clock`, read once per tick: one turn asks for it from every
   * runtime (each tab's strip, the prompt, the tools) at the same clock.
   */
  let placesMemo: { key: string; places: Map<string, string> } | null = null;
  /** The last kitOf: the same playthrough, clock and database fingerprints fold the same (crew spec §3). */
  let kitMemo: { key: string; value: { kit: Kit; stats: Stats; crew: CrewState } } | null = null;
  function placesAt(pt: PlaythroughInfo, clock: number): Map<string, string> {
    const key = `${pt.id}@${clock}`;
    if (placesMemo?.key === key) return placesMemo.places;
    const places = placesOf(playthroughs.charsDir(pt.id), pt, deps.roster(), namesOf(pt, clock));
    placesMemo = { key, places };
    setImmediate(() => {
      if (placesMemo?.key === key) placesMemo = null;
    });
    return places;
  }

  /** Names and places for `pt`'s contact lists, at `at` (default: now). */
  function namesOf(pt: PlaythroughInfo, at?: number) {
    let clock: number | null = at ?? null;
    const now = () => (clock ??= clockOf(pt));
    return {
      placeName: deps.placeName,
      hasScene: deps.hasScene,
      playerName: playerName(pt),
      residentNames: speakerNames(pt),
      ties: tiesOf(pt),
      // Standing (spec 2026-10-13 §6): her word and values, from what's stored or where it starts.
      standing: (id: string, onDisk: StoredStanding | null) => {
        // Mid-regenerate (before the new take opens) the old take's move is still on disk: show standing before it.
        const rt = runtimeOf(id);
        const replacing = rt?.relay.replacingReply ?? null;
        const stored = replacing && rt ? storedStanding(rt.db, pt.player, replacing) : onDisk;
        const values = stored ? { trust: stored.trust, warmth: stored.warmth } : standingStartOf(pt, id);
        const shared = deps.sharedStanding?.() ?? DEFAULT_SHARED_STANDING;
        return { word: wordFor(values, deps.standingConfig?.(id) ?? null, shared), ...values, last: stored?.moves.at(-1)?.reason ?? null };
      },
      // Her plan's tail for her row (spec 2026-10-21 §7).
      planTail: (id: string) => {
        // With her, she's right there: no tail (final review M7).
        if (!pt.solo && pt.location?.contactId === id) return null;
        const p = planOf(pt, id);
        return p ? planTail(p, now(), deps.placeName) : null;
      },
      // Where she is now: her schedule's place (when it has her), else her open room's scene.
      liveScene: (id: string) => scheduledPlace(pt, id, now) ?? runtimeOf(id)?.room.state.sceneId ?? null,
    };
  }

  /**
   * Where her schedule has her now (spec 2026-10-10 §4), or null: no schedule, with you (her room
   * stays yours), free, or left behind — you parted from her and none of her blocks has started since.
   */
  function scheduledPlace(pt: PlaythroughInfo, contactId: string, now: () => number = () => clockOf(pt)): string | null {
    const blocks = deps.schedule?.(contactId) ?? [];
    const withYou = !pt.solo && pt.location?.contactId === contactId;
    // On comms (spec 2026-10-20 §1) she isn't with you: her schedule places her, else where the line began.
    const comms = withYou ? commsOf(pt, contactId) : null;
    if (comms?.on) return (blocks.length > 0 ? scheduledRoom(blocks, now()) : null) ?? comms.at;
    if (withYou) return null;
    const clock = now();
    // Her plan (spec 2026-10-21 §3) comes before her schedule, and works without one.
    const plan = planOf(pt, contactId);
    const planned = plan ? planPlaceAt(plan, clock) : null;
    if (planned) return planned;
    if (blocks.length === 0) return null;
    // A parting later than the clock was rewound away: it never happened.
    const parted = pt.parted?.[contactId];
    if (parted !== undefined && parted <= clock && !blockStartedBetween(blocks, parted, clock)) return null;
    return scheduledRoom(blocks, clock);
  }

  /** Her plan with `pt`'s player (spec 2026-10-21 §2); null: none, or her room isn't open. */
  function planOf(pt: PlaythroughInfo, contactId: string, raw?: string | null): Plan | null {
    const db = runtimeOf(contactId)?.db;
    const plan = parsePlan(raw !== undefined ? raw : (db?.getMeta(planKey(pt.player)) ?? null));
    return plan && db ? withSeen(plan, db.getMeta(planSeenKey(pt.player)), clockOf(pt)) : plan;
  }

  /** Comms on `pt`'s player in `contactId`'s room (null: none stored, or her room isn't open). */
  function commsOf(pt: PlaythroughInfo, contactId: string): CommsState | null {
    return parseComms(runtimeOf(contactId)?.db.getMeta(commsKey(pt.player)) ?? null);
  }

  /**
   * `[your schedule: …]` for her prompt (with you), or null without a schedule. A start more than a
   * day away is named by its weekday (spec 2026-10-20 weekdays): `free until Monday 20:00, then …`.
   */
  function scheduleLineOf(pt: PlaythroughInfo, contactId: string, at?: number): string | null {
    const blocks = deps.schedule?.(contactId) ?? [];
    if (blocks.length === 0) return null;
    const clock = at ?? clockOf(pt);
    const name = (room: string) => deps.placeName(room);
    const when = (start: number) => (start - clock <= DAY ? hhmmOf(minuteOfDay(start)) : `${weekdayName(weekdayOf(start))} ${hhmmOf(minuteOfDay(start))}`);
    const current = blocks.find((b) => scheduledRoom([b], clock) !== null) ?? null;
    const next = nextBlockStart(blocks, clock);
    if (!current) return next ? `[your schedule: free until ${when(next.at)}, then ${name(next.block.room)}]` : null;
    // The same block again only when it's more than a day off (a daily block reads as before, on its start minute too).
    const shown = next && (next.block !== current || next.at - clock > DAY) ? next : null;
    const then = shown ? `; then ${name(shown.block.room)} ${when(shown.at)}–${hhmmOf(shown.block.to)}` : '';
    return `[your schedule: ${name(current.room)} until ${hhmmOf(current.to)}${then}]`;
  }

  /** The known contacts of `pt`, as its databases have them. */
  function known(pt: PlaythroughInfo): ContactEntry[] {
    return knownContacts(playthroughs.charsDir(pt.id), pt, deps.roster(), namesOf(pt));
  }

  /** Who the player knows in `pt` and who's around (AROUND LOWLIGHT), from one read of its databases. */
  function people(pt: PlaythroughInfo): { known: ContactEntry[]; around: AroundEntry[] } {
    return contactsAndAround(playthroughs.charsDir(pt.id), pt, deps.roster(), namesOf(pt));
  }

  /** City weather (spec §5): you're with her and in her room (on comms her room is far from you: it neither gives nor takes). */
  /** Whether turns are happening with contact `id` (her room follows the story): where you are, or, before a first turn has set that, the contact you started with (live check, blackouts phase 3). */
  function playingWith(pt: PlaythroughInfo, id: string): boolean {
    return !pt.solo && (pt.location?.contactId ?? pt.startContact) === id;
  }

  function withHer(pt: PlaythroughInfo, id: string): boolean {
    return !pt.solo && pt.location?.contactId === id && runtimeOf(id)?.relay.commsNow(pt.player)?.on !== true;
  }

  function setLocation(contactId: string): Location | 'unknown' {
    const pt = playthroughs.active();
    if (!pt) throw new Error('no-playthrough');
    // A known contact, or a stranger you walk in on (AROUND LOWLIGHT); never yourself, never a resident.
    const both = people(pt);
    const entry = both.known.find((c) => c.id === contactId) ?? both.around.find((c) => c.contactId === contactId);
    if (!entry) return 'unknown';
    // Where she is (worked out before you join her): her schedule's place, else her room as it is.
    const sceneId = entry.sceneId;
    const room = runtimeOf(contactId)?.room;
    // Her schedule moved her while you were apart: her open room goes there, quietly (no journey).
    if (room && room.state.sceneId !== sceneId) room.setScene({ id: sceneId }, 'world');
    const location = { contactId, sceneId };
    // Walking in on her during her meeting (spec 2026-10-21 §6): she sees you came. Back after it, having
    // left her before it began: she waited for nothing.
    const plan = planOf(pt, contactId);
    const clock = clockOf(pt);
    const left = pt.parted?.[contactId];
    const seenDb = runtimeOf(contactId)?.db;
    const seen = (mark: SeenMark) => seenDb?.setMeta(planSeenKey(pt.player), markSeen(seenDb.getMeta(planSeenKey(pt.player)), plan!.from, mark, clock));
    // Joining her where she went, while she's there: her going is done (final review M3).
    if (plan?.going && !plan.joined && clock < plan.going.until && sceneId === plan.going.place) seen('joined');
    if (plan?.meet && !plan.met && clock >= plan.meet.at && clock < plan.meet.at + MEET_WAIT) seen('met');
    else if (plan?.meet && !plan.met && !plan.missed && clock >= plan.meet.at + MEET_WAIT && left !== undefined && left <= plan.meet.at) seen('missed');
    // You leave whoever you were with: she stays there until her next scheduled change.
    const parted = { ...(pt.parted ?? {}) };
    const prev = pt.location?.contactId;
    if (prev && prev !== contactId && !pt.solo) parted[prev] = clockOf(pt);
    delete parted[contactId];
    playthroughs.touch(pt.id, location, { ...(pt.solo ? { solo: false as const } : {}), parted });
    // Joining her where her room already is (no move): it takes the city's weather (Task 3 review I1).
    queueMicrotask(() => runtimeOf(contactId)?.takeCityWeather());
    return location;
  }

  /** The playthrough as blackouts read it: with the always-dark districts of a live check (never written). */
  function powered(pt: PlaythroughInfo): PlaythroughInfo {
    const forced = deps.forcedOutages ?? [];
    if (forced.length === 0) return pt;
    return { ...pt, outages: [...(pt.outages ?? []), ...forced.map((district) => ({ district, from: -1e9, to: 1e12, by: 'narrator' as const, row: null }))] };
  }
  const rates = () => deps.outageRates ?? {};
  const placeOf = (id: string) => deps.powerPlace?.(id) ?? null;
  function powerHere(sceneId: string, clock?: number): { district: string; outage: Outage | null } {
    const pt = playthroughs.active();
    return powerOf(pt ? powered(pt) : null, clock ?? (pt ? clockOf(pt) : 0), rates(), placeOf, sceneId);
  }
  function powerNow(sceneId: string): { dark: string[]; here: { name: string; since: number } | null } {
    const pt = playthroughs.active();
    const dark = pt ? darkNow(powered(pt), clockOf(pt), rates()).map((o) => o.district) : [];
    const p = powerHere(sceneId);
    return { dark, here: p.outage ? { name: deps.districtName?.(p.district) ?? p.district, since: p.outage.from } : null };
  }
  /** Every open room's tabs hear the power as it stands. */
  function emitPower(): void {
    for (const rt of registry.all()) rt.hub.emit({ type: 'power', ...powerNow(rt.room.state.sceneId) });
  }

  /** The power changed without the clock moving (a narrator's cut, a rewind undoing one): the tabs hear it; her room follows, if you're with her. */
  function powerMoved(id: string): void {
    emitPower();
    const pt = playthroughs.active();
    if (!pt || !playingWith(pt, id)) return;
    runtimeOf(id)?.storyMood.check('turn', pt.player);
  }

  function branch(contactId: string, messageId: string): PlaythroughInfo | { busy: string } | 'unknown' {
    const streaming = busy();
    if (streaming) return { busy: streaming };
    const pt = playthroughs.active();
    if (!pt) throw new Error('no-playthrough');
    if (!participants(pt).includes(contactId)) return 'unknown';
    const made = withDbs(pt, (dbs): PlaythroughInfo | 'unknown' => {
      const at = dbs.get(contactId)!.getMessage(pt.player, messageId);
      if (!at) return 'unknown';
      // Copied first, cut in the copy: the playthrough it comes from is never written.
      const info = playthroughs.copyLive(pt.id, dbs as LiveDbs, {
        name: `${pt.name} — branch`,
        player: pt.player,
        startContact: pt.startContact,
        forkedFrom: { playthrough: pt.id, message: { contactId, messageId, excerpt: Array.from(at.text.trim()).slice(0, BRANCH_EXCERPT_MAX).join("") }, name: pt.name },
        location: pt.location,
        // The same nights (blackouts phase 3 §1).
        seed: pt.seed ?? pt.id,
        ...(pt.persona ? { persona: pt.persona } : {}),
        ...(pt.outfit ? { outfit: pt.outfit } : {}),
        // No city weather: the branch is as of its line, so its room (cut and rebuilt there) gives it, as a rewind would.
        // Who you'd left where, as of the line (partings after it never happened in the branch).
        ...(pt.parted ? { parted: Object.fromEntries(Object.entries(pt.parted).filter(([, t]) => t <= (at.clock ?? Infinity))) } : {}),
      });
      try {
        let location: Location | null = null;
        // The narrator's power cuts whose rows the branch keeps (blackouts phase 3 §2); the admin panel's (no row) stay.
        const cuts = pt.outages ?? [];
        const kept = new Set(cuts.filter((o) => o.by !== 'narrator' || !o.row));
        for (const id of dbs.keys()) {
          const db = openDb(path.join(playthroughs.charsDir(info.id), id, 'room.db'), { defaultPlayer: pt.player });
          try {
            // Her chat ends on the line (ties broken by order); everyone else's at its time.
            const cut = [...(id === contactId ? db.deleteAfter(pt.player, messageId) : []), ...db.deleteFrom(at.ts)];
            db.pruneWrites(cut);
            // Elsewhere, what was done after the line (a hand edit, a light) is stamped to an older line of hers: cut by time.
            if (id !== contactId) db.pruneWritesAfter(at.ts);
            db.rebuild();
            for (const o of cuts) if (o.contact === id && o.row && db.getMessage(pt.player, o.row)) kept.add(o);
            const room = id === contactId ? db.loadRoom() : null;
            if (room) location = { contactId, sceneId: room.sceneId };
          } finally {
            db.close();
          }
        }
        // No room of hers yet: her start room (as the branch's own databases have her), not wherever the playthrough was last.
        if (!location) {
          // Never the open rooms: those are the playthrough it comes from (her room there may have moved since the line).
          const branchPt = playthroughs.get(info.id)!;
          const names = { ...namesOf(branchPt), liveScene: () => null };
          const sceneId = knownContacts(playthroughs.charsDir(info.id), branchPt, deps.roster(), names).find((c) => c.id === contactId)?.sceneId;
          if (sceneId) location = { contactId, sceneId };
        }
        location ??= pt.location;
        if (location) playthroughs.touch(info.id, location);
        if (kept.size > 0) playthroughs.setOutages(info.id, cuts.filter((o) => kept.has(o)));
        return playthroughs.get(info.id)!;
      } catch (err) {
        playthroughs.remove(info.id);
        throw err;
      }
    });
    if (made === 'unknown') return made;
    const r = activate(made.id);
    if ('busy' in r) playthroughs.remove(made.id);
    return r;
  }

  return {
    branch,
    active: () => playthroughs.active(),
    outfitOf(player) {
      const pt = playthroughs.active();
      return pt?.player === player ? (pt.outfit ?? null) : null;
    },
    hasSprite(player) {
      const p = basePlayers.resolve(player);
      return p.id === player && p.sprite !== null;
    },
    contactCount(pt) {
      try {
        return known(pt).length;
      } catch (err) {
        console.error(`[playthrough] ${pt.id}: contacts unreadable: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
    stateDir() {
      const pt = playthroughs.active();
      return pt ? playthroughs.charsDir(pt.id) : playthroughs.lobbyCharsDir();
    },
    players,
    busy,
    activate,
    inRoster: (contactId) => deps.roster().some((c) => c.id === contactId),
    create(player, startContact, name, persona) {
      // Checked before creating, so a refused New Game leaves no empty playthrough behind.
      const streaming = busy();
      if (streaming) return { busy: streaming };
      const info = playthroughs.create({ player, startContact, name, personaName: deps.personaName(player), ...(persona ? { persona } : {}) });
      return activate(info.id);
    },
    save(name, contactId) {
      const streaming = busy();
      if (streaming) return { busy: streaming };
      let pt = playthroughs.active();
      if (!pt) throw new Error('no-playthrough');
      // A known contact's room moves the save there; a stranger's only when you're already in it (you walked in).
      const here = contactId !== undefined && (known(pt).some((c) => c.id === contactId) || pt.location?.contactId === contactId);
      // Already with her (in person or on comms): the save is where you are, not a move to her (comms review C1).
      const withHer = !pt.solo && pt.location?.contactId === contactId;
      if (here && !withHer && setLocation(contactId) !== 'unknown') pt = playthroughs.active()!;
      // A manual save is always written ('unchanged' is for checkpoints only).
      return write(pt, pt.location?.contactId ?? pt.startContact, 'manual', name) as SaveInfo;
    },
    saveRequest(contactId, trigger, name) {
      const pt = playthroughs.active();
      if (!pt) throw new Error('no-playthrough');
      return withDbs(pt, (dbs) => request(pt, dbs, contactId, trigger, name));
    },
    checkpoint(t) {
      if (busy()) {
        pending = t;
        return;
      }
      pending = null;
      take(t);
    },
    checkpointNow: take,
    turnEnded(contactId) {
      touch(contactId);
      this.settle();
    },
    settle() {
      if (!pending || busy()) return;
      const t = pending;
      pending = null;
      take(t);
    },
    moved: touch,
    entered(contactId) {
      const pt = playthroughs.active();
      // Already with her: nothing to do. Otherwise a room page opened on her (solo, or a typed URL) means you're with her now.
      if (!pt || (!pt.solo && pt.location?.contactId === contactId)) return;
      try {
        if (setLocation(contactId) === 'unknown') return;
      } catch (err) {
        console.error(`[playthrough] solo not cleared: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    around() {
      const pt = playthroughs.active();
      if (!pt) throw new Error('no-playthrough');
      try {
        return people(pt).around;
      } catch (err) {
        console.error(`[playthrough] around unreadable: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    },
    leads() {
      const pt = playthroughs.active();
      if (!pt) throw new Error('no-playthrough');
      const book = new Map((deps.leadBook?.() ?? []).map((e) => [e.id, e]));
      const met = new Map(known(pt).map((c) => [c.id, c]));
      const rows = (this.heldLeads(pt.player) ?? []).map((h): LeadView => {
        const e = book.get(h.id)!;
        const c = met.get(e.to);
        return { id: h.id, title: e.title, details: h.details, to: e.to, toName: deps.contactName(e.to), place: e.place, portrait: c?.portrait ?? null, met: c !== undefined, followed: h.followed };
      });
      return [...rows.filter((r) => !r.followed), ...rows.filter((r) => r.followed)];
    },
    heldLeads(player) {
      const pt = playthroughs.active();
      if (!pt || pt.player !== player) return null;
      return readHeldLeads(playthroughs.charsDir(pt.id), player, deps.leadBook?.() ?? []);
    },
    questStatus(player) {
      const pt = playthroughs.active();
      if (!pt || pt.player !== player) return null;
      const prefix = `quest.${player}.`;
      return withDbs(pt, (dbs) =>
        [...dbs].flatMap(([contact, db]) =>
          db.metaWithPrefix(prefix).flatMap(({ k, v }) => {
            const run = parseRun(v);
            return run ? [{ id: k.slice(prefix.length), contact, run }] : [];
          }),
        ),
      );
    },
    kitOf(player, at) {
      const pt = playthroughs.active();
      if (!pt || pt.player !== player) return null;
      const prefix = `quest.${player}.`;
      const crewPrefix = `crew.${player}.`;
      const book = deps.questBook?.() ?? [];
      // Each run's events, with the district its mission starts in (old heat events carry none); then the fixer's
      // purchases; and each recruit's crew events, merged across room dbs by recruit id.
      const home = new Map<KitEvent, string | null>();
      const crewLists = new Map<string, CrewEvent[]>();
      const prints: string[] = [];
      const events = withDbs(pt, (dbs) =>
        [...dbs.entries()].flatMap(([id, db]) => {
          prints.push(`${id}:${db.fingerprint().join(',')}`);
          for (const { k, v } of db.metaWithPrefix(crewPrefix)) {
            const rid = k.slice(crewPrefix.length);
            crewLists.set(rid, [...(crewLists.get(rid) ?? []), ...parseCrewEvents(v)]);
          }
          return [
            ...db.metaWithPrefix(prefix).flatMap(({ k, v }) => {
              const starts = book.find((q) => q.id === bookId(k.slice(prefix.length)))?.starts;
              const district = starts ? (deps.districtOf?.(starts) ?? null) : null;
              const evs = (parseRun(v)?.kit ?? []) as KitEvent[];
              for (const e of evs) home.set(e, district);
              return evs;
            }),
            ...parseFixer(db.getMeta(fixerKey(player))),
          ];
        }),
      );
      const now = at ?? clockOf(pt);
      const key = `${pt.id}|${player}|${at ?? '-'}|${now}|${prints.join(';')}`;
      if (kitMemo?.key === key) return kitMemo.value;
      const start = deps.kitStart?.(player) ?? { stats: DEFAULT_STATS, deck: null };
      const seeded = repFromEnv(player).map((rep): KitEvent => ({ at: START, rep }));
      const kept = [...seeded, ...(at === undefined ? events : events.filter((e) => e.at <= at))];
      const crewBook = deps.crewBook?.() ?? emptyCrewBook();
      const job = (id: string) => book.find((q) => q.id === id);
      const r = foldWithCrew({
        start: { deck: start.deck, edgeMax: edgeMax(start.stats), from: START },
        kitEvents: kept,
        crew: [...crewLists.values()].map((l) => (at === undefined ? l : l.filter((e) => e.at <= at))),
        now,
        book: crewBook,
        seed: deps.crewSeed?.(pt.id) ?? pt.id,
        instance: (id) =>
          parseInstance(id, {
            book: crewBook,
            districtOfJob: (j) => {
              const q = job(j);
              return q ? (deps.districtOf?.(q.starts) ?? null) : null;
            },
            placeOfJob: (j) => job(j)?.starts ?? null,
          }),
        districtOf: (e) => home.get(e) ?? null,
        names: { place: deps.crewPlaceName, district: deps.districtName, job: (id) => job(id)?.title ?? id },
      });
      const value = { kit: r.kit, stats: start.stats, crew: r.crew };
      kitMemo = { key, value };
      return value;
    },
    tieFor(contactId, player) {
      const pt = playthroughs.active();
      if (!pt || pt.player !== player) return null;
      return tiesOf(pt)[contactId] ?? null;
    },
    standingStart(contactId, player) {
      const pt = playthroughs.active();
      if (!pt || pt.player !== player) return null;
      return standingStartOf(pt, contactId);
    },
    standingConfig(contactId) {
      return deps.standingConfig?.(contactId) ?? null;
    },
    sharedStanding() {
      return deps.sharedStanding?.() ?? DEFAULT_SHARED_STANDING;
    },
    storyClock(id) {
      const pt = playthroughs.active();
      if (!pt || !playingWith(pt, id)) return;
      runtimeOf(id)?.storyMood.check('turn', pt.player);
    },
    playerNow() {
      return playthroughs.active()?.player ?? null;
    },
    cityWeatherFor(id) {
      const pt = playthroughs.active();
      if (!pt || !withHer(pt, id)) return 'away';
      return pt.weather ?? null;
    },
    darkNow() {
      const pt = playthroughs.active();
      return pt ? darkNow(powered(pt), clockOf(pt), rates()) : [];
    },
    powerOf: powerHere,
    powerNow,
    canCut(sceneId) {
      const pt = playthroughs.active();
      if (!pt || powerHere(sceneId).outage) return false;
      return addNarrated(pt, rates(), placeOf, { contact: '', row: null, at: clockOf(pt), sceneId }) !== null;
    },
    cutPower(contactId, rowId, at, sceneId) {
      const pt = playthroughs.active();
      if (!pt || powerHere(sceneId, at).outage) return;
      const next = addNarrated(pt, rates(), placeOf, { contact: contactId, row: rowId, at, sceneId });
      if (!next) return;
      playthroughs.setOutages(pt.id, next);
      powerMoved(contactId);
    },
    outagesAfterRebuild(contactId, hasRow) {
      const pt = playthroughs.active();
      if (!pt?.outages) return;
      const next = dropUndone(pt.outages, contactId, hasRow);
      if (!next) return;
      playthroughs.setOutages(pt.id, next);
      powerMoved(contactId);
    },
    districtName(id) {
      return deps.districtName?.(id) ?? id;
    },
    weatherChanged(id, w) {
      const pt = playthroughs.active();
      if (!pt || !withHer(pt, id)) return;
      if (pt.weather && sameWeather(pt.weather, w)) return;
      playthroughs.setWeather(pt.id, w);
    },
    clockNow() {
      // The lobby (no playthrough) keeps no clock.
      const pt = playthroughs.active();
      return pt ? clockOf(pt) : null;
    },
    clockChanged() {
      placesMemo = null;
      const pt = playthroughs.active();
      if (!pt) return;
      const clock = clockOf(pt);
      // A parting later than the clock was cut away (rewind, delete): it never happened.
      const later = Object.entries(pt.parted ?? {}).filter(([, at]) => at > clock);
      if (later.length > 0) playthroughs.setParted(pt.id, Object.fromEntries(Object.entries(pt.parted!).filter(([, at]) => at <= clock)));
      for (const rt of registry.all()) {
        rt.hub.emit({ type: 'clock', clock });
        rt.hub.emit({ type: 'power', ...powerNow(rt.room.state.sceneId) });
        rt.refreshOthers();
        // What a quest row shows can move with the clock (a crew errand landing, tonight's board): sent only if it changed.
        rt.relay.emitQuestState();
      }
      deps.onClockMoved?.();
    },
    clock() {
      const pt = playthroughs.active();
      if (!pt) throw new Error('no-playthrough');
      return clockOf(pt);
    },
    wait(o) {
      const pt = playthroughs.active();
      if (!pt) throw new Error('no-playthrough');
      const minutes = o.minutes;
      const until = typeof o.until === 'string' ? parseHhmm(o.until) : null;
      const byMinutes = typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;
      if ((minutes !== undefined) === (o.until !== undefined)) return 'bad';
      if (minutes !== undefined && !byMinutes) return 'bad';
      if (o.until !== undefined && until === null) return 'bad';
      const streaming = busy();
      if (streaming) return { busy: streaming };
      const now = clockOf(pt);
      let next = byMinutes ? now + (minutes as number) : nextOccurrence(now, until!);
      // A quest in the room you're in waiting for an hour before that: the wait stops there, so it happens (quest waits, final review I1).
      for (const rt of registry.all()) {
        if (pt.solo || pt.location?.contactId !== rt.id) continue;
        const stop = rt.relay.questWaitStop(pt.player);
        if (stop !== null && stop > now && stop < next) next = stop;
      }
      playthroughs.setClockFloor(pt.id, next);
      placesMemo = null;
      for (const rt of registry.all()) {
        rt.hub.emit({ type: 'clock', clock: next });
        rt.hub.emit({ type: 'power', ...powerNow(rt.room.state.sceneId) });
        rt.refreshOthers();
        // Quest rows can change with the clock (a crew errand landing, tonight's board): sent only if they did.
        rt.relay.emitQuestState();
        // A quest waiting for this hour plays now (quest waits spec §3), only in the room you're in: one parked on
        // someone you've left waits until you're back with them (review C1).
        if (!pt.solo && pt.location?.contactId === rt.id) {
          rt.storyMood.check('turn', pt.player);
          void rt.relay.playDueQuest(pt.player).catch(() => {});
        }
      }
      deps.onClockMoved?.();
      return { clock: next };
    },
    goSolo() {
      return goSoloNow();
    },
    placeName: deps.placeName,
    placeFor(contactId) {
      const pt = playthroughs.active();
      // Her room opening where the playthrough says you are with her (walked in): the place you were sent to.
      return pt && pt.location?.contactId === contactId ? pt.location.sceneId : null;
    },
    scheduleLine(contactId, clock) {
      const pt = playthroughs.active();
      return pt ? scheduleLineOf(pt, contactId, clock) : null;
    },
    planNote(contactId, mode, raw) {
      const pt = playthroughs.active();
      if (!pt || pt.solo || pt.location?.contactId !== contactId || mode === 'ooc') return null;
      const plan = planOf(pt, contactId, raw);
      if (!plan) return null;
      const clock = clockOf(pt);
      const hm = (m: number) => hhmmOf(minuteOfDay(m));
      if (plan.meet && plan.met && mode === 'greet' && clock < plan.meet.at + MEET_WAIT) return { line: `[plan: you said you'd meet them here at ${hm(plan.meet.at)}]`, spend: false };
      if (!planOver(plan, clock)) return null;
      if (plan.meet && plan.missed) return { line: `[you waited at ${deps.placeName(plan.meet.place)} from ${hm(plan.meet.at)} to ${hm(plan.meet.at + MEET_WAIT)}; they never came]`, spend: true };
      return { line: null, spend: true };
    },
    planLeave(contactId) {
      const pt = playthroughs.active();
      const plan = pt ? planOf(pt, contactId) : null;
      if (!plan?.going) return null;
      const meet = plan.meet ? { place: deps.placeName(plan.meet.place), time: hhmmOf(minuteOfDay(plan.meet.at)) } : null;
      return { going: deps.placeName(plan.going.place), meet };
    },
    planCard(contactId) {
      const pt = playthroughs.active();
      if (!pt || pt.solo || pt.location?.contactId !== contactId || commsOf(pt, contactId)?.on) return null;
      const plan = planOf(pt, contactId);
      // Already there (you walked in on her at the place she went to): nothing to see her off from (final review I2).
      if (!plan?.going || plan.joined || clockOf(pt) >= plan.going.until || pt.location.sceneId === plan.going.place) return null;
      const meet = plan.meet ? { place: deps.placeName(plan.meet.place), time: hhmmOf(minuteOfDay(plan.meet.at)) } : null;
      return { going: deps.placeName(plan.going.place), meet, from: plan.from };
    },
    dropLine() {
      const r = goSoloNow();
      if ('busy' in r) return;
      for (const rt of registry.all()) rt.hub.emit({ type: 'world-changed', playthrough: r.id, location: r.location, solo: true });
    },
    planNow(contactId) {
      const pt = playthroughs.active();
      const plan = pt ? planOf(pt, contactId) : null;
      if (!pt || !plan) return null;
      const now = clockOf(pt);
      if (planOver(plan, now)) return null;
      const going = plan.going && now < plan.going.until ? { place: deps.placeName(plan.going.place), until: hhmmOf(minuteOfDay(plan.going.until)) } : null;
      const meet = plan.meet ? { place: deps.placeName(plan.meet.place), time: hhmmOf(minuteOfDay(plan.meet.at)) } : null;
      return going || meet ? { going, meet } : null;
    },
    promisePlaces(contactId, map) {
      return promisePlaces(map, deps.schedule?.(contactId) ?? [], (room) => deps.placeName(room));
    },
    dayLine(contactId) {
      return dayWords(deps.schedule?.(contactId) ?? [], (room) => deps.placeName(room));
    },
    placeAt(contactId, clock) {
      const pt = playthroughs.active();
      return pt ? scheduledPlace(pt, contactId, () => clock) : null;
    },
    whereNow(contactId) {
      const pt = playthroughs.active();
      return pt ? scheduledPlace(pt, contactId) : null;
    },
    scheduledRoomOf(contactId) {
      const pt = playthroughs.active();
      const blocks = deps.schedule?.(contactId) ?? [];
      return pt && blocks.length > 0 ? scheduledRoom(blocks, clockOf(pt)) : null;
    },
    herPlace(contactId) {
      const pt = playthroughs.active();
      if (!pt || pt.solo || pt.location?.contactId !== contactId || !commsOf(pt, contactId)?.on) return null;
      return scheduledPlace(pt, contactId);
    },
    othersHere(contactId, sceneId, clock) {
      const pt = playthroughs.active();
      // The lobby keeps no clock and no contacts' places: only the room's resident.
      if (!pt) return whoIsHere({ sceneId, resident: deps.residentOf?.(sceneId) ?? null, contacts: [], exclude: [] });
      const places = placesAt(pt, clock ?? clockOf(pt));
      const contacts = deps.roster().flatMap((c) => (places.has(c.id) ? [{ id: c.id, name: c.name, pronoun: c.pronoun, sceneId: places.get(c.id)! }] : []));
      return whoIsHere({ sceneId, resident: deps.residentOf?.(sceneId) ?? null, contacts, exclude: [contactId, pt.player], excludeNames: [deps.contactName(contactId), playerName(pt)] });
    },
    voices(contactId) {
      const pt = playthroughs.active();
      const skip = new Set([deps.contactName(contactId), ...(pt ? [playerName(pt)] : [])].map((n) => n.toLowerCase()));
      const residents: Present[] = (deps.residents?.() ?? []).map((r) => ({ id: r.id, kind: 'resident', name: r.name, pronoun: r.pronoun }));
      const contacts: Present[] = deps
        .roster()
        .filter((c) => c.id !== contactId && c.id !== pt?.player)
        .map((c) => ({ id: c.id, kind: 'contact', name: c.name, pronoun: c.pronoun }));
      return [...residents, ...contacts].filter((p) => !skip.has(p.name.toLowerCase()));
    },
    nextPlaceOf(contactId, clock) {
      const next = nextBlock(deps.schedule?.(contactId) ?? [], clock);
      return next ? deps.placeName(next.room) : null;
    },
    contacts() {
      const pt = playthroughs.active();
      if (!pt) return [];
      const { known: list, around } = people(pt);
      const at = pt.location;
      // A stranger's room (walked in on from AROUND LOWLIGHT) is somewhere you can be, too.
      if (at && !list.some((c) => c.id === at.contactId) && !around.some((c) => c.contactId === at.contactId)) {
        // Her character is gone (§8): the start contact, else the first one known.
        const next = list.find((c) => c.id === pt.startContact) ?? list[0];
        if (next) playthroughs.touch(pt.id, { contactId: next.id, sceneId: next.sceneId });
      }
      return list;
    },
    isKnown(contactId) {
      const pt = playthroughs.active();
      return pt ? known(pt).some((c) => c.id === contactId) : false;
    },
    setLocation,
  };
}
