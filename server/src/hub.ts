import type { CipherState } from '../../shared/cipher';
import { readHabits } from './habits';
import type { CommsState } from '../../shared/comms';
import { TRAVEL_LINE_MAX } from '../../shared/arrival';
import { SCENE_TEXT_MAX } from '../../shared/scenario';
import type { WebSocket } from 'ws';
import type { ChatMessage, OtherInfo, ResidentInfo, ChatMode, ClientEvent, ControlRejection, LinkStatus, Note, SceneDef, ServerEvent, Source } from '../../shared/types';
import type { Db } from './db';
import type { Result, Room, RoomChange } from './room-state';
import type { ModelPicker } from './model-catalog';
import { NO_LINK_NOTICE, type ChatRelay } from './chat-relay';
import { dispatchTool, type ToolContext } from './tools';
import { formatToolLine } from './tool-line';
import type { Journal } from './journal';
import { greetDue } from './greet';
import { parseEncounter } from '../../shared/encounter';
import fs from 'node:fs';
import { parseMap, type CityMapData } from '../../shared/map-schema';
import { DEFAULT_GIGS_DIR, DEFAULT_MAP_FILE, DEFAULT_PAPERS_DIR } from './config';
import { papersBoard } from '../../shared/papers/generate';
import { ruleText } from '../../shared/papers/rules';
import { loadPapersData, markFirstNightSeen } from './papers';

import { loadGigBriefs, readMap } from './gigs';
import type { DiceLiner } from './dice';
import { cleanStake, isRoundRecord, parseDiceSnapshot } from '../../shared/dice/text';
import { gigKind, parseGigSnapshot, RESULTS_FOR, tierMax, type Brief, type GigKind, type GigResult } from '../../shared/gig/brief';
/** Every gig result a big job's route can report (big jobs spec §3). */
const GIG_RESULTS: readonly GigResult[] = [...new Set(Object.values(RESULTS_FOR).flat())];
import { parsePick } from '../../shared/quests';
import { EMPTY_QUEST_STATE } from '../../shared/types';
import { exitPlaces } from '../../shared/exits';

export interface HubDeps {
  /** The playthrough's Cipher for `player` (cipher spec §2.9), for the dev panel; absent: none. */
  cipher?: (player: string) => CipherState | null;
  /** Who is dark now and whether this room is (blackouts phase 3 §4), sent to every tab as it joins. */
  power?: () => { dark: string[]; here: { name: string; since: number } | null };
  /** The admin panel's POWER OUT: this room's district goes dark (blackouts phase 3, for checks). */
  powerOut?: () => void;
  /** Who has texted you unseen (promised texts spec §6), sent to every tab as it joins. */
  unreadTexts?: () => { id: string; name: string }[];
  room: Room;
  /** Her journal: its changes go out as journal/recap events; the player's panel edits come in here. */
  journal: Journal;
  db: Db;
  /** The default player: whose pair a tool line falls to when the relay names none. */
  player: string;
  scenes: SceneDef[];
  sceneErrors: string[];
  /** The residents this pack's scenes name (resident id → her look), sent with the scene list. */
  residents?: Record<string, ResidentInfo>;
  /** Who's here now besides you and her, for a tab that connects (the strip); absent: no one. */
  others?: () => OtherInfo[];
  /** Everyone who could speak in her replies (how the feed splits them), for a tab that connects. */
  voices?: () => OtherInfo[];
  /** Who this room belongs to; defaults to Nix (the single-agent setup). */
  portrait?: Omit<Extract<ServerEvent, { type: 'portrait' }>, 'type'>;
  /** Where her body is while you're on comms (spec 2026-10-20 §1): her scheduled room, else where the line began. */
  herPlace?: () => string | null;
  /** Her scheduled room now, on comms or not (null: no schedule, or free): no going ON COMMS to where she is. */
  herScheduled?: () => string | null;
  /** Lazy — the relay is constructed after the hub (it needs `hub.emit`), so this is read at call time. */
  getRelay: () => ChatRelay;
  /** What her tools reach; the dev panel runs them against this. */
  tools: ToolContext;
  /** Her model picker (her MODEL menu); absent in tests that don't need one. */
  models?: ModelPicker;
  /** The city map's data, re-read for every move (travel). */
  mapFile?: string;
  /** Gig briefs (world/gigs/), re-read for every finished run. */
  gigsDir?: string;
  /** Papers' data (world/papers/), re-read to regenerate a finished run's board (Papers spec §4.1). */
  papersDir?: string;
  /** Where the first-night marker lives (Papers spec §2.8). Default ./data. */
  dataDir?: string;
  /** The lore book's ids, for papers' reasons. */
  loreIds?: () => ReadonlySet<string>;
  /** Her liar's dice round line (a side call on her model); absent in tests that don't need one. */
  diceLine?: DiceLiner;
  /** A map move is about to happen (the relay is idle): `from` is the map's name for where you are, if it has one. */
  beforeTravel?(t: { from: string | null; to: string }): void;
  /** A room page opened (its first socket, not a reconnect) as `player`: the world hears the player is with her. */
  onJoin?(player: string): void;
  /** Her line on `player` from his background (ties), shown on an empty dossier page; null: none. */
  tie?(player: string): string | null;
  /** The playthrough's story clock, sent to a tab as it joins. */
  clock?(): number | null;
  /** The quest pick check (spec §3): her model's raw answer on whether `line` acts out a choice at the beat here. Absent: nothing to ask it with. */
  pickCheck?: (player: string, line: string, signal: AbortSignal) => Promise<string>;
}

/** A pick check that hasn't answered by now sends the line on as talk. */
export const PICK_CHECK_TIMEOUT_MS = 6000;
/** A held line CONFIRM sends back, at most. */
const QUEST_SAID_MAX = 2000;
/** A terminal's moves (small jobs spec §4): a few dozen at most (14 words, 4 brackets, guesses after a reset). */
const CRACK_MOVES_MAX = 60;
const validMoves = (m: unknown): boolean =>
  Array.isArray(m) &&
  m.length <= CRACK_MOVES_MAX &&
  m.every((x) => typeof x === 'object' && x !== null && (('word' in x && typeof x.word === 'string' && x.word.length <= 9 && Object.keys(x).length === 1) || ('bracket' in x && Number.isInteger(x.bracket) && Object.keys(x).length === 1)));

export interface Hub {
  readonly linkStatus: LinkStatus;
  /** Comms (spec 2026-10-20): re-send the line to every tab when it changed (a rewind, a clock move); `player` defaults to the hub's. */
  refreshComms(player?: string): void;
  /**
   * Passed as `ChatRelay`'s `emit` dep: tracks `link` status and the model. With `player` the event
   * belongs to that pair (message, nix_delta, tool_line, messages_removed) and only its tabs get it;
   * without, it is the room's and every tab gets it.
   */
  emit(e: ServerEvent, player?: string): void;
  /** A tab visiting as `player` (already resolved): it sees the room plus that pair's dossier only. `entered`: a room page's first socket. */
  addClient(ws: WebSocket, player: string, o?: { entered?: boolean }): void;
  setLinkStatus(status: LinkStatus): void;
  /** Re-broadcasts the model picker's event to every tab (the model select routes call this after a change). Resolves immediately when there's no picker. */
  modelsChanged(): Promise<void>;
  /** Ends every open tab with `code` (the runtime is closing). */
  closeAll(code: number): void;
  /** Shows a tool line in `player`'s pair's tabs, on the reply in progress when it's that pair's. */
  appendToolLine(text: string, player: string): void;
  /** Runs `fn` with its tool lines going to `player`'s reply `messageId` (the Residual writes after the reply it read). */
  withToolLineReply<T>(player: string, messageId: string, fn: () => T): T;
}

/** Nix's default portrait, served from web/public (dev) or dist/web (production). */
export const DEFAULT_PORTRAIT_URL = '/portraits/nix.png';



/** How many residual runs the dev panel's RESIDUAL section shows. */
const RESIDUAL_RUNS_SHOWN = 50;
const CONTROL_REASONS = ['busy', 'not-latest', 'unknown', 'empty'] as const;

function send(ws: WebSocket, e: ServerEvent): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Checks an untrusted parsed client frame against the `ClientEvent` shapes. Returns the event,
 * or a human-readable reason it was rejected (sent back to that client as a `dev_log`).
 */
export function validateClientEvent(v: unknown): ClientEvent | string {
  if (!isPlainObject(v)) return 'client event must be a JSON object';
  switch (v.type) {
    case 'user_message':
      if (typeof v.text !== 'string') return "user_message needs a string 'text'";
      if (v.mode !== undefined && v.mode !== 'rp' && v.mode !== 'ooc' && v.mode !== 'end') return "user_message 'mode' must be 'rp', 'ooc' or 'end'";
      if (v.leave !== undefined && typeof v.leave !== 'boolean') return "user_message 'leave' must be a boolean";
      if (v.leave === true && v.mode !== 'end') return "user_message 'leave' needs mode 'end'";
      if (v.talk !== undefined && typeof v.talk !== 'boolean') return "user_message 'talk' must be a boolean";
      return { type: 'user_message', text: v.text, mode: v.mode ?? 'rp', ...(v.leave === true ? { leave: true } : {}), ...(v.talk === true ? { talk: true } : {}) };
    case 'fixer_buy':
      if (typeof v.item !== 'string' || v.item === '' || v.item.length > 80) return "fixer_buy needs a string 'item'";
      return { type: 'fixer_buy', item: v.item };
    case 'crew': {
      const x = v.action as Record<string, unknown> | undefined;
      const str = (k: string) => typeof x?.[k] === 'string' && (x[k] as string) !== '' && (x[k] as string).length <= 80;
      if (!x || !str('recruit')) return "crew needs an 'action' with a string 'recruit'";
      if (x.do === 'hire' || x.do === 'recall' || x.do === 'doc' || x.do === 'bail' || x.do === 'letgo' || x.do === 'leave') return { type: 'crew', action: { do: x.do, recruit: x.recruit as string } };
      if (x.do === 'send') return str('errand') ? { type: 'crew', action: { do: 'send', recruit: x.recruit as string, errand: x.errand as string } } : "crew send needs a string 'errand'";
      return 'crew: unknown action';
    }
    case 'quest_continue':
      if (typeof v.id !== 'string' || v.id === '') return "quest_continue needs a string 'id'";
      return { type: 'quest_continue', id: v.id };
    case 'quest_start':
      if (typeof v.id !== 'string' || v.id === '') return "quest_start needs a string 'id'";
      return { type: 'quest_start', id: v.id };
    case 'quest_choose':
      if (typeof v.id !== 'string' || typeof v.beat !== 'string' || typeof v.choice !== 'string') return "quest_choose needs string 'id', 'beat' and 'choice'";
      if (v.said !== undefined && (typeof v.said !== 'string' || v.said.length > QUEST_SAID_MAX)) return `quest_choose 'said' must be a string of at most ${QUEST_SAID_MAX} characters`;
      if (v.moves !== undefined && !validMoves(v.moves)) return `quest_choose 'moves' must be at most ${CRACK_MOVES_MAX} of { word } or { bracket }`;
      // Big jobs: the read's three words; a route's gig result and the seed it was dealt from.
      if (v.read !== undefined && !(Array.isArray(v.read) && v.read.length === 3 && v.read.every((w) => typeof w === 'string' && w.length <= 40))) return "quest_choose 'read' must be three words of at most 40 characters";
      const gig = v.gig as { result?: unknown; seed?: unknown } | undefined;
      if (gig !== undefined && !(isPlainObject(gig) && GIG_RESULTS.includes(gig.result as GigResult) && Number.isInteger(gig.seed) && (gig.seed as number) >= 0)) return "quest_choose 'gig' must be { result, seed }";
      return {
        type: 'quest_choose',
        id: v.id,
        beat: v.beat,
        choice: v.choice,
        ...(typeof v.said === 'string' ? { said: v.said } : {}),
        ...(v.moves !== undefined ? { moves: v.moves as ({ word: string } | { bracket: number })[] } : {}),
        ...(v.read !== undefined ? { read: v.read as [string, string, string] } : {}),
        ...(gig !== undefined ? { gig: { result: gig.result as GigResult, seed: gig.seed as number } } : {}),
      };
    case 'quest_walk':
      if (typeof v.id !== 'string' || v.id === '') return "quest_walk needs a string 'id'";
      return { type: 'quest_walk', id: v.id };
    case 'retry':
      if (typeof v.messageId !== 'string') return "retry needs a string 'messageId'";
      return { type: 'retry', messageId: v.messageId };
    case 'dev_action': {
      if (typeof v.tool !== 'string') return "dev_action needs a string 'tool'";
      const args = v.args ?? {};
      if (!isPlainObject(args)) return "dev_action 'args' must be an object";
      // 'nix' is the pre-multi-agent name for 'agent', still accepted.
      const as = v.as === 'nix' ? 'agent' : v.as;
      if (as !== undefined && as !== 'agent' && as !== 'dev') return "dev_action 'as' must be 'agent' or 'dev'";
      return { type: 'dev_action', tool: v.tool, args, ...(as !== undefined ? { as } : {}) };
    }
    case 'journal_edit':
      if (typeof v.id !== 'string') return "journal_edit needs a string 'id'";
      if (v.text !== undefined && typeof v.text !== 'string') return "journal_edit 'text' must be a string";
      if (v.pinned !== undefined && typeof v.pinned !== 'boolean') return "journal_edit 'pinned' must be a boolean";
      if (v.about !== undefined && v.about !== 'me' && v.about !== 'you') return "journal_edit 'about' must be 'me' or 'you'";
      if (v.keys !== undefined && !(Array.isArray(v.keys) && v.keys.every((k) => typeof k === 'string'))) return "journal_edit 'keys' must be an array of strings";
      return {
        type: 'journal_edit',
        id: v.id,
        ...(v.text !== undefined ? { text: v.text as string } : {}),
        ...(v.pinned !== undefined ? { pinned: v.pinned as boolean } : {}),
        ...(v.about !== undefined ? { about: v.about as 'me' | 'you' } : {}),
        ...(v.keys !== undefined ? { keys: v.keys as string[] } : {}),
      };
    case 'journal_delete':
      if (typeof v.id !== 'string') return "journal_delete needs a string 'id'";
      return { type: 'journal_delete', id: v.id };
    case 'journal_restore': {
      const n = v.note;
      const whole =
        isPlainObject(n) &&
        typeof n.id === 'string' &&
        typeof n.text === 'string' &&
        typeof n.pinned === 'boolean' &&
        typeof n.createdAt === 'number' &&
        typeof n.updatedAt === 'number' &&
        (n.editedBy === 'agent' || n.editedBy === 'user') &&
        (n.about === 'me' || n.about === 'you');
      if (!whole) return 'journal_restore needs a whole note';
      const { id, text, pinned, createdAt, updatedAt, editedBy, about, keys } = n as unknown as Note;
      const keyList = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : undefined;
      return { type: 'journal_restore', note: { id, text, pinned, createdAt, updatedAt, editedBy, about, ...(keyList ? { keys: keyList } : {}) } };
    }
    case 'recap_seen':
      return { type: 'recap_seen' };
    case 'residual_runs':
      return { type: 'residual_runs' };
    case 'greet':
      // The opening the arrival screen sets (spec 2026-10-27 §3); the relay keeps it only on a new game.
      if (v.opening !== undefined && (typeof v.opening !== 'string' || v.opening.length > SCENE_TEXT_MAX)) return `greet's 'opening' must be a string of at most ${SCENE_TEXT_MAX} characters`;
      return { type: 'greet', ...(typeof v.opening === 'string' ? { opening: v.opening } : {}) };
    case 'let_her_go':
      // Your typed last line rides with it, as with LEAVE: she answers it in her goodbye.
      if (v.text !== undefined && typeof v.text !== 'string') return "let_her_go's 'text' must be a string";
      return { type: 'let_her_go', ...(typeof v.text === 'string' ? { text: v.text } : {}) };
    case 'plan_drop':
      return { type: 'plan_drop' };
    case 'dossier_page_edit':
      if (typeof v.text !== 'string') return "dossier_page_edit needs a string 'text'";
      return { type: 'dossier_page_edit', text: v.text };
    case 'regenerate':
    case 'continue':
    case 'delete_message':
    case 'rewind':
      if (typeof v.messageId !== 'string') return `${v.type} needs a string 'messageId'`;
      return { type: v.type, messageId: v.messageId };
    case 'travel':
      if (typeof v.place !== 'string') return "travel needs a string 'place'";
      if (v.comms !== undefined && v.comms !== true) return "travel's 'comms' is true or absent";
      if (v.line !== undefined && (typeof v.line !== 'string' || v.line.length > TRAVEL_LINE_MAX)) return `travel's 'line' must be a string of at most ${TRAVEL_LINE_MAX} characters`;
      return { type: 'travel', place: v.place, ...(v.comms === true ? { comms: true as const } : {}), ...(typeof v.line === 'string' ? { line: v.line } : {}) };
    case 'exit':
      if (typeof v.to !== 'string') return "exit needs a string 'to'";
      return { type: 'exit', to: v.to };
    case 'dice': {
      if (typeof v.stake !== 'string' || v.stake !== cleanStake(v.stake)) return "dice needs a one-line 'stake' of at most 60 characters";
      if (v.result !== 'won' && v.result !== 'lost') return "dice needs a 'result' of won or lost";
      if (!Array.isArray(v.rounds) || v.rounds.length < 1 || v.rounds.length > 20 || !v.rounds.every(isRoundRecord)) return "dice needs 1–20 whole 'rounds'";
      if (!Array.isArray(v.lines) || v.lines.length !== v.rounds.length || !v.lines.every((l) => l === null || (typeof l === 'string' && l.length <= 200))) return "dice needs one 'lines' entry per round";
      if (!Number.isInteger(v.seed)) return "dice needs a whole number 'seed'";
      return { type: 'dice', stake: v.stake, result: v.result, rounds: v.rounds, lines: v.lines as (string | null)[], seed: v.seed as number };
    }
    case 'dice_line': {
      if (!Number.isInteger(v.round) || (v.round as number) < 1) return "dice_line needs a whole number 'round' from 1";
      if (typeof v.stake !== 'string' || v.stake !== cleanStake(v.stake)) return "dice_line needs a one-line 'stake' of at most 60 characters";
      if (!isRoundRecord(v.record)) return "dice_line needs a whole round 'record'";
      if (!Number.isInteger(v.seed)) return "dice_line needs the game's whole number 'seed'";
      return { type: 'dice_line', round: v.round as number, record: v.record, stake: v.stake, seed: v.seed as number };
    }
    case 'gig': {
      if (v.kind !== undefined && v.kind !== 'hack' && v.kind !== 'slip' && v.kind !== 'papers') return "gig's 'kind' is hack, slip or papers";
      const kind = gigKind(v as { kind?: GigKind });
      if (typeof v.place !== 'string' || typeof v.brief !== 'string') return "gig needs string 'place' and 'brief'";
      if (!RESULTS_FOR[kind].includes(v.result as GigResult)) return `gig needs a 'result' of ${RESULTS_FOR[kind].join(', ')}`;
      if (!Number.isInteger(v.trace) || !Number.isInteger(v.max) || !Number.isInteger(v.seed)) return "gig needs whole numbers 'trace', 'max' and 'seed'";
      let papers: { overlooked: number | null } | undefined;
      if (v.papers !== undefined) {
        const o = (v.papers as { overlooked?: unknown } | null)?.overlooked;
        if (kind !== 'papers' || (o !== null && !Number.isInteger(o))) return "gig's 'papers' needs a whole number or null 'overlooked'";
        papers = { overlooked: o as number | null };
      }
      return { type: 'gig', ...(v.kind === undefined ? {} : { kind }), place: v.place, brief: v.brief, result: v.result as GigResult, trace: v.trace as number, max: v.max as number, seed: v.seed as number, ...(papers ? { papers } : {}) };
    }
    case 'encounter': {
      // Its shape only: the relay checks the stranger's name against who's here.
      // A broken one goes on as null: the handler tells the tab, so the panel can show it.
      return { type: 'encounter', encounter: parseEncounter(v.encounter, []) };
    }
    case 'set_model':
      if (typeof v.model !== 'string' || v.model.length === 0 || v.model.length > 200) return "set_model needs a 'model' string (1–200 characters)";
      return { type: 'set_model', model: v.model };
    case 'swipe':
      if (typeof v.messageId !== 'string') return "swipe needs a string 'messageId'";
      if (typeof v.index !== 'number' || !Number.isFinite(v.index)) return "swipe needs a number 'index'";
      return { type: 'swipe', messageId: v.messageId, index: v.index };
    case 'edit_message':
      if (typeof v.messageId !== 'string') return "edit_message needs a string 'messageId'";
      if (typeof v.text !== 'string') return "edit_message needs a string 'text'";
      return { type: 'edit_message', messageId: v.messageId, text: v.text };
    case 'restore_message': {
      const m = v.message;
      const whole =
        isPlainObject(m) &&
        typeof m.id === 'string' &&
        (m.role === 'user' || m.role === 'agent') &&
        typeof m.text === 'string' &&
        Array.isArray(m.toolLines) &&
        m.toolLines.every((t) => typeof t === 'string') &&
        typeof m.ts === 'number' &&
        (m.status === 'ok' || m.status === 'streaming' || m.status === 'failed' || m.status === 'lost') &&
        (m.replyTo === undefined || typeof m.replyTo === 'string') &&
        (m.mode === undefined || m.mode === 'ooc' || m.mode === 'end' || m.mode === 'greet' || m.mode === 'travel' || m.mode === 'encounter' || m.mode === 'gig' || m.mode === 'dice' || m.mode === 'text') &&
        (m.expression === undefined || typeof m.expression === 'string') &&
        (m.othersExpressions === undefined ||
          (typeof m.othersExpressions === 'object' && m.othersExpressions !== null && !Array.isArray(m.othersExpressions) && Object.values(m.othersExpressions).every((f) => typeof f === 'string')));
      if (!whole) return 'restore_message needs a whole message';
      // An event's row comes back with its card: its title and the stranger it brought (a broken stranger goes).
      // Her reaction to it carries the mode only (it inherits its prompt's), never a card.
      const eventRow = m.mode === 'encounter' && m.role === 'user';
      const card = eventRow ? parseEncounter({ ...(typeof m.encounter === 'object' && m.encounter !== null ? m.encounter : {}), text: 'x' }, []) : null;
      if (eventRow && !card) return 'restore_message needs a whole message';
      const encounter = card ? { title: card.title, ...(card.stranger ? { stranger: card.stranger } : {}), ...(card.power ? { power: card.power } : {}) } : null;
      // A run's row comes back with its snapshot; her reaction carries the mode only.
      const gig = m.mode === 'gig' && m.role === 'user' ? parseGigSnapshot(m.gig) : null;
      if (m.mode === 'gig' && m.role === 'user' && !gig) return 'restore_message needs a whole message';
      const dice = m.mode === 'dice' && m.role === 'user' ? parseDiceSnapshot(m.dice) : null;
      if (m.mode === 'dice' && m.role === 'user' && !dice) return 'restore_message needs a whole message';
      const { id, role, text, toolLines, ts, status, replyTo, mode, expression, othersExpressions, leave, parting, clock } = m as unknown as ChatMessage;
      return {
        type: 'restore_message',
        message: {
          id,
          role,
          text,
          toolLines,
          ts,
          status,
          ...(replyTo ? { replyTo } : {}),
          ...(mode ? { mode } : {}),
          ...(encounter ? { encounter } : {}),
          ...(gig ? { gig } : {}),
          ...(dice ? { dice } : {}),
          ...(expression ? { expression } : {}),
          ...(othersExpressions && Object.keys(othersExpressions).length > 0 ? { othersExpressions } : {}),
          ...(leave === true && mode === 'end' ? { leave: true as const, ...(parting === 'her' ? { parting: 'her' as const } : {}) } : {}),
          // Its story clock stamp comes back with it, so an undo puts the time back too.
          ...(typeof clock === 'number' && Number.isInteger(clock) && clock >= 0 ? { clock } : {}),
        },
      };
    }
    default:
      return `unknown event type '${String(v.type)}'`;
  }
}

/**
 * The websocket hub: fans room changes out to every connected browser tab and a pair's chat
 * events, dossier notes, recap and tool lines to that pair's tabs only; routes client events
 * (chat, retry, journal edits, dev actions) into the room/relay/journal as the tab's player.
 */
export function createHub(deps: HubDeps): Hub {
  /** Every open tab and the player it visits as. */
  const clients = new Map<WebSocket, string>();
  let linkStatus: LinkStatus = 'down';
  /** The last model pair the relay reported, replayed to tabs that connect later. */
  let model: Extract<ServerEvent, { type: 'model' }> | null = null;
  /** The current portrait, replayed on connect; a later appearance feature changes it via `emit`. */
  let portrait: Extract<ServerEvent, { type: 'portrait' }> = {
    type: 'portrait',
    ...(deps.portrait ?? { url: DEFAULT_PORTRAIT_URL, kind: 'mask', accent: '#ff4f8b', name: 'Nix', pronoun: 'they' }),
  };
  const busyText = `${portrait.name} is still replying — try again in a moment.`;

  function broadcast(e: ServerEvent): void {
    for (const ws of clients.keys()) send(ws, e);
  }

  /** Sends to the tabs of `player`'s pair only. */
  function sendToPair(player: string, e: ServerEvent): void {
    for (const [ws, p] of clients) if (p === player) send(ws, e);
  }

  /** A direct character's full model event (choices, credit) goes to every tab and is replayed on connect. */
  function broadcastModels(picker: ModelPicker): Promise<void> {
    return picker.event().then((full) => {
      model = full;
      broadcast(full);
    });
  }

  function emit(e: ServerEvent, player?: string): void {
    if (e.type === 'model' && deps.models) {
      void broadcastModels(deps.models).catch(() => {});
      return;
    }
    if (player !== undefined) sendToPair(player, e);
    else broadcast(e);
    if (e.type === 'link') linkStatus = e.status;
    if (e.type === 'model') model = e;
    if (e.type === 'portrait') portrait = e;
  }

  function modelsChanged(): Promise<void> {
    return deps.models ? broadcastModels(deps.models) : Promise.resolve();
  }

  function setLinkStatus(status: LinkStatus): void {
    if (status === linkStatus) return;
    linkStatus = status;
    broadcast({ type: 'link', status });
  }

  deps.room.onChange((change: RoomChange) => {
    // A restore shows what a rebuild already left in the database: saving it again would log a new write.
    if (change.op.tool !== 'restore') deps.db.saveRoom(change.state);
    const roomEvent: ServerEvent = {
      type: 'room',
      state: change.state,
      duration: change.duration,
      source: change.source,
      ...(change.transition !== undefined ? { transition: change.transition } : {}),
    };
    broadcast(roomEvent);

    // Her room tool call belongs to the turn in progress (else the last turn's pair); one from
    // the dev panel belongs to the tab that clicked it.
    if (change.source === 'agent') appendToolLine(formatToolLine(change.op, deps.room), toolLinePlayer());
    // A mood the story applied (story moods spec §4) and the power going or coming back (blackouts phase 3) show too, as MOOD; the world's other changes (the Residual's light fixes) stay quiet.
    else if (change.source === 'world' && (change.op.tool === 'apply_mood' || change.op.tool === 'power')) appendToolLine(formatToolLine(change.op, deps.room, 'world'), toolLinePlayer());
  });

  /** The running (else last) turn's player. */
  function activePlayer(): string {
    return deps.getRelay().activePlayer ?? deps.player;
  }

  /** The player of the tab whose dev_action is being dispatched (synchronously), else null. */
  let devOrigin: string | null = null;

  /** While the Residual writes for a reply (withToolLineReply): that pair and reply. */
  let toolLineReply: { player: string; messageId: string } | null = null;

  /** Whose pair an unscoped tool line belongs to: the Residual's reply's, the dev panel tab that caused it, else the running (else last) turn's. */
  function toolLinePlayer(): string {
    return toolLineReply?.player ?? devOrigin ?? activePlayer();
  }

  /**
   * Shows a tool line in `player`'s pair's tabs, adding it to the reply in progress when that reply
   * is this pair's (another pair's line never lands on it).
   */
  function appendToolLine(text: string, player: string): void {
    const messageId =
      toolLineReply !== null && toolLineReply.player === player ? toolLineReply.messageId : player === activePlayer() ? deps.getRelay().activeMessageId : null;
    if (messageId !== null) {
      const message = deps.db.getMessage(player, messageId);
      if (message) {
        deps.db.updateMessage(player, messageId, { toolLines: [...message.toolLines, text] });
      }
    }
    sendToPair(player, { type: 'tool_line', messageId, text });
  }

  const journalEvent = (player: string): ServerEvent => ({ type: 'journal', notes: deps.journal.notes(player) });
  const recapEvent = (player: string): ServerEvent => ({ type: 'recap', ...deps.journal.recap(player) });
  const pageEvent = (player: string): ServerEvent => {
    const page = deps.journal.page(player);
    const tie = page.text === null ? (deps.tie?.(player) ?? null) : null;
    return { type: 'dossier_page', ...page, ...(tie !== null ? { tie } : {}) };
  };
  const pairEvent = { notes: journalEvent, recap: recapEvent, page: pageEvent };

  deps.journal.onChange((change) => {
    if (change.kind === 'notes' && change.player === null) {
      // Her own journal changed (or a note moved in or out of it): every tab gets its own list.
      for (const [ws, p] of clients) send(ws, journalEvent(p));
    } else if (change.player !== null) {
      sendToPair(change.player, pairEvent[change.kind](change.player));
    }
    if (change.source === 'agent' && change.line !== null) appendToolLine(change.line, change.player ?? toolLinePlayer());
  });

  function sendInitialSync(ws: WebSocket, player: string): void {
    send(ws, { type: 'scenes', scenes: deps.scenes, residents: deps.residents ?? {} });
    send(ws, { type: 'others', others: deps.others?.() ?? [], voices: deps.voices?.() ?? [] });
    send(ws, { type: 'room', state: deps.room.state, duration: 0, source: 'restore' });
    const messages = deps.db.recentMessages(player, undefined, 'scene');
    send(ws, { type: 'history', messages, greetDue: greetDue(messages.at(-1), Date.now()) });
    send(ws, journalEvent(player));
    send(ws, recapEvent(player));
    send(ws, pageEvent(player));
    // Quest lines only when there's something to show: a tab starts with none.
    const relay = deps.getRelay();
    const quests = relay.questStateFor?.(player) ?? relay.questState?.(player);
    if (quests && JSON.stringify(quests) !== JSON.stringify(EMPTY_QUEST_STATE)) send(ws, { type: 'quest_state', state: quests });
    // Her plan's card (her plans spec §5), when one is up.
    send(ws, { type: 'link', status: linkStatus });
    const clock = deps.clock?.() ?? null;
    if (clock !== null) send(ws, { type: 'clock', clock });
    if (deps.power) send(ws, { type: 'power', ...deps.power() });
    if (deps.models) {
      void deps.models
        .event()
        .then((full) => send(ws, full))
        .catch(() => {});
    } else if (model) send(ws, model);
    send(ws, portrait);
    // Comms (spec 2026-10-20): the last of the sync, before any scene-load warnings.
    send(ws, commsEvent(player));
    // Her plan's card, null included, so a tab that reconnects drops one it was showing (final review M1).
    const card = relay.planCardFor?.(player);
    if (card !== undefined) send(ws, { type: 'plan_card', card });
    // Who has texted you unseen, empty included: a tab back after a restart drops a stale signal (final review I2).
    if (deps.unreadTexts) send(ws, { type: 'texts_unread', from: deps.unreadTexts() });
    for (const error of deps.sceneErrors) {
      send(ws, { type: 'dev_log', level: 'warn', text: error });
    }
  }

  function rejectBusy(ws: WebSocket, text?: string): void {
    send(ws, { type: 'dev_log', level: 'warn', text: busyText });
    send(ws, { type: 'turn_rejected', reason: 'busy', ...(text !== undefined ? { text } : {}) });
  }

  /** No key linked (a direct character): the draft goes back to its tab, and nothing is stored. */
  function rejectNoLink(ws: WebSocket, text?: string): void {
    send(ws, { type: 'turn_rejected', reason: 'no-link', ...(text !== undefined ? { text } : {}) });
  }

  /** A pick check is running (spec §3): another line now would be checked or sent twice. */
  let pickChecking = false;

  /**
   * While a quest is at a beat here, an in-character line is asked about first: one that acts out a
   * choice is held (quest_pick to this tab, nothing saved). Any failure or a slow answer sends it on.
   * True when the line was held.
   */
  async function heldAsPick(ws: WebSocket, player: string, text: string): Promise<boolean> {
    const active = deps.pickCheck ? deps.getRelay().questState?.(player)?.active : null;
    if (!deps.pickCheck || !active) return false;
    pickChecking = true;
    const call = new AbortController();
    const timer = setTimeout(() => call.abort(), PICK_CHECK_TIMEOUT_MS);
    try {
      const answer = await deps.pickCheck(player, text, call.signal);
      const pick = parsePick(answer, active.choices.map((c) => c.id));
      // Judged against a beat that has since moved on (another tab chose): it goes on as talk.
      const now = deps.getRelay().questState?.(player)?.active;
      if (pick === null || !now || now.id !== active.id || now.beat !== active.beat) return false;
      send(ws, { type: 'quest_pick', id: active.id, beat: active.beat, choice: pick, text });
      return true;
    } catch (err) {
      const why = call.signal.aborted ? `no answer in ${PICK_CHECK_TIMEOUT_MS / 1000}s` : err instanceof Error ? err.message : String(err);
      send(ws, { type: 'dev_log', level: 'warn', text: `quest pick check failed (${why}); sent as talk` });
      return false;
    } finally {
      clearTimeout(timer);
      pickChecking = false;
    }
  }

  async function handleUserMessage(ws: WebSocket, player: string, text: string, mode: ChatMode, leave = false, talk = false): Promise<void> {
    // Checked here (synchronously) rather than from send()'s result: a `busy` result can also
    // mean the provider answered 429, and that message was accepted (it is in the feed as failed).
    // Any pair's turn in progress makes her busy for every tab.
    if (deps.getRelay().busy || pickChecking) return rejectBusy(ws, text);
    if (!deps.getRelay().ready) return rejectNoLink(ws, text);
    // Only a line that will be checked waits: anything else goes on in the same tick, as before quests.
    if (mode === 'rp' && !talk && deps.pickCheck && deps.getRelay().questState?.(player)?.active) {
      if (await heldAsPick(ws, player, text)) return;
      // A turn may have started, or the link dropped, while it ran: the line goes back rather than being lost.
      if (deps.getRelay().busy) return rejectBusy(ws, text);
      if (!deps.getRelay().ready) return rejectNoLink(ws, text);
    }
    await (leave ? deps.getRelay().send(player, text, mode, { leave }) : deps.getRelay().send(player, text, mode));
    // HANG UP ends the line (comms spec §1): the tabs hear it once her sign-off is in.
    if (leave) emitComms(player);
  }

  async function handleRetry(ws: WebSocket, player: string, messageId: string): Promise<void> {
    if (deps.getRelay().busy || pickChecking) return rejectBusy(ws);
    if (!deps.getRelay().ready) return rejectNoLink(ws);
    await deps.getRelay().retry(player, messageId);
  }

  function handleDevAction(ws: WebSocket, player: string, tool: string, args: Record<string, unknown>, as: Source | undefined): void {
    // The dev panel's tools act on this tab's pair, not the running turn's, and their tool lines
    // go to this tab's pair (onto its reply only when that reply is the one in progress).
    if (tool === 'power_out') {
      deps.powerOut?.();
      return;
    }
    devOrigin = player;
    let result: Result;
    try {
      result = dispatchTool({ ...deps.tools, player: () => player }, tool, args, as ?? 'dev');
    } finally {
      devOrigin = null;
    }
    if (!result.ok) {
      send(ws, { type: 'dev_log', level: 'error', text: result.error });
    }
  }

  /**
   * GO on the map: checks the move against the map file (read now, so a broken or changed file is
   * caught), moves the room there as the user, with a glitch, and starts her answer to arriving.
   * A refused move only tells this tab why; nothing changes.
   */
  function travel(ws: WebSocket, player: string, placeId: string, comms = false, said?: string): void {
    // Said on the arrival screen, which keeps your line and lets GO be pressed again (spec 2026-10-27 §4).
    const refuse = (text: string) => send(ws, { type: 'notice', text, for: 'travel' });
    let map: CityMapData;
    try {
      const parsed = parseMap(JSON.parse(fs.readFileSync(deps.mapFile ?? DEFAULT_MAP_FILE, 'utf8')));
      if (!parsed.ok) return refuse("the map isn't available");
      map = parsed.map;
    } catch {
      return refuse("the map isn't available");
    }
    const place = map.places.find((p) => p.id === placeId);
    if (!place) return refuse(`no place '${placeId}'`);
    if (!place.scene) return refuse(`${place.name} has no room yet`);
    if (place.inviteOnly) return refuse(`${place.name} is invite only`);
    if (place.side) return refuse(`${place.name} is reached from another room`);
    // The city is open: any place whose room exists (invite-only ones aside).
    if (!deps.scenes.some((sc) => sc.id === place.scene)) return refuse(`${place.name} has no room yet`);
    const current = deps.room.state.sceneId;
    if (place.scene === current) return refuse(`you're already at ${place.name}`);
    const relay = deps.getRelay();
    if (relay.busy) return refuse('wait for her to finish');
    // No key: no move, no checkpoint and no silent arrival (she couldn't answer it).
    if (!relay.ready) return refuse(NO_LINK_NOTICE);

    // Comms (spec 2026-10-20 §1): ON COMMS needs her deal in force; on the line, GO elsewhere keeps it, GO to her ends it.
    if (comms && !relay.commsCan?.(player)) return refuse("she's not on your line");
    if (comms && place.scene === deps.herScheduled?.()) return refuse("she's there: go with her");
    const line = relay.commsNow?.(player) ?? null;
    const state: CommsState | undefined = line?.on
      ? place.scene === deps.herPlace?.()
        ? { on: false }
        : line
      : comms
        ? { on: true, at: current }
        : undefined;
    // From a side room (reached by an exit, or a side place), it's named too (room exits spec §4).
    walk(ws, player, relay, { scene: place.scene, from: placeName(map, current), to: place.name, ...(state ? { comms: state } : {}), ...(said !== undefined ? { line: said } : {}) });
    emitComms(player, map);
  }

  /** The comms event (spec 2026-10-20): on the line or not, whether `player` can go on it, and her place's name on it. */
  function commsEvent(player: string, map?: CityMapData | null): Extract<ServerEvent, { type: 'comms' }> {
    const relay = deps.getRelay();
    const on = relay.commsNow?.(player)?.on === true;
    let m = map ?? null;
    if (on && m === null) {
      try {
        const parsed = parseMap(JSON.parse(fs.readFileSync(deps.mapFile ?? DEFAULT_MAP_FILE, 'utf8')));
        m = parsed.ok ? parsed.map : null;
      } catch {
        m = null;
      }
    }
    const her = on ? (deps.herPlace?.() ?? null) : null;
    return { type: 'comms', on, can: relay.commsCan?.(player) ?? false, where: her ? (placeName(m, her) ?? deps.scenes.find((s) => s.id === her)?.name ?? her) : null, herAt: deps.herScheduled?.() ?? null };
  }

  /** Every tab hears the line change. */
  function emitComms(player: string, map?: CityMapData | null): void {
    const e = commsEvent(player, map);
    lastComms = JSON.stringify(e);
    emit(e);
  }
  /** The last line sent to every tab, so a refresh with nothing new stays quiet. */
  let lastComms: string | null = null;

  /** A room's place name for a move: its map place, else its exit place (null for a room neither shows). */
  function placeName(map: CityMapData | null, sceneId: string): string | null {
    return map?.places.find((p) => p.scene === sceneId)?.name ?? exitPlaces(map, deps.scenes).get(sceneId)?.name ?? null;
  }

  /** The move itself, for GO and a door alike: the save point, the glitch as the user, then her arrival turn. */
  function walk(ws: WebSocket, player: string, relay: ChatRelay, m: { scene: string; from: string | null; to: string; via?: string; comms?: CommsState; line?: string }): void {
    deps.beforeTravel?.({ from: m.from, to: m.to });
    const go = () => dispatchTool({ ...deps.tools, player: () => player }, 'go_to', { id: m.scene, transition: 'glitch' }, 'user');
    const contact = deps.portrait?.name ?? 'Nix';
    // On comms the move runs under the travel row's stamp (comms review I2), so a rewind past the row undoes both.
    if (m.comms) {
      relay.travel(player, { from: m.from, to: m.to, contact, ...(m.via ? { via: m.via } : {}), ...(m.line !== undefined ? { line: m.line } : {}), comms: m.comms, move: () => {
        const moved = go();
        if (!moved.ok) send(ws, { type: 'notice', text: moved.error, for: 'travel' });
      } }).catch(reportAsyncError(ws, 'travel'));
      return;
    }
    const moved = go();
    // Tagged for the arrival screen, which keeps the line (a door has no screen up: the room shows it in the feed).
    if (!moved.ok) return void send(ws, { type: 'notice', text: moved.error, for: 'travel' });
    relay.travel(player, { from: m.from, to: m.to, contact, ...(m.via ? { via: m.via } : {}), ...(m.line !== undefined ? { line: m.line } : {}) }).catch(reportAsyncError(ws, 'travel'));
  }

  /**
   * A door (clickable doors spec §4): through one of the current room's exits. The server checks the
   * exit, not the click, so a stale page can't go anywhere the room doesn't lead. Refusals tell this tab only.
   */
  function goThrough(ws: WebSocket, player: string, to: string): void {
    const refuse = (text: string) => send(ws, { type: 'notice', text });
    const current = deps.room.state.sceneId;
    const exit = deps.scenes.find((s) => s.id === current)?.exits?.find((e) => e.to === to);
    if (!exit) return refuse('no way there from here');
    const target = deps.scenes.find((s) => s.id === to);
    if (!target) return refuse(`${to} has no room yet`);
    const relay = deps.getRelay();
    if (relay.busy) return refuse('wait for her to finish');
    if (!relay.ready) return refuse(NO_LINK_NOTICE);
    // A broken or missing map only costs the names: the rooms' own names stand in.
    let map: CityMapData | null = null;
    try {
      const parsed = parseMap(JSON.parse(fs.readFileSync(deps.mapFile ?? DEFAULT_MAP_FILE, 'utf8')));
      if (parsed.ok) map = parsed.map;
    } catch {
      map = null;
    }
    const name = (id: string) => placeName(map, id) ?? deps.scenes.find((s) => s.id === id)?.name ?? id;
    // On comms (review I5): a door keeps the line, and a door into her place ends it, as GO does.
    const line = relay.commsNow?.(player) ?? null;
    const state: CommsState | undefined = line?.on ? (to === deps.herPlace?.() ? { on: false } : line) : undefined;
    walk(ws, player, relay, { scene: to, from: name(current), to: name(to), via: exit.way, ...(state ? { comms: state } : {}) });
    if (state) emitComms(player, map);
  }

  /**
   * A finished gig run (spec §6.1): checked against the map and the brief files (read now), then
   * her reaction starts on the brief's snapshot. A refusal tells this tab only, for its hack window.
   */
  function gig(ws: WebSocket, player: string, run: Extract<ClientEvent, { type: 'gig' }>): void {
    const refuse = (text: string) => send(ws, { type: 'notice', text, for: 'gig' });
    const map = readMap(deps.mapFile ?? DEFAULT_MAP_FILE);
    const place = map?.places.find((p) => p.id === run.place);
    if (!map || !place?.gigs) return refuse(`no jobs at ${run.place}`);
    const brief = loadGigBriefs(deps.gigsDir ?? DEFAULT_GIGS_DIR, map, () => {}).find((b) => b.id === run.brief && b.place === place.id);
    if (!brief) return refuse(`no job '${run.brief}' here`);
    const kind = gigKind(run);
    if (kind === 'papers' || gigKind(brief) === 'papers') return papersRun(ws, player, run, brief, place.name, refuse);
    const traceOk =
      run.result === 'traced'
        ? run.trace > run.max && run.trace <= run.max + 20
        : run.result === 'caught'
          ? run.trace >= 0 && run.trace <= run.max + 20
          : run.trace >= 0 && run.trace <= run.max;
    if (kind !== gigKind(brief) || !RESULTS_FOR[kind].includes(run.result) || run.max !== tierMax(kind as 'hack' | 'slip', brief.tier) || !traceOk) return refuse("that run doesn't add up");
    const relay = deps.getRelay();
    if (relay.busy) return refuse('wait for her to finish');
    if (!relay.ready) return refuse(NO_LINK_NOTICE);
    const { title, tier, client, target, take, text } = brief;
    relay
      .gig(player, { ...(kind === 'slip' ? { kind } : {}), title, tier, place: place.name, client, target, take, brief: text, result: run.result, trace: run.trace, max: run.max })
      // Dropped (a turn started first): say so, or the window would wait on a row that never comes.
      .then((r) => {
        if (r === null) refuse('wait for her to finish');
      })
      .catch(reportAsyncError(ws, 'gig'));
  }

  /**
   * A finished papers run (Papers spec §4.1): the board is dealt again from its seed and today's
   * world/papers/, and the run has to add up against it. The client runs the puzzle; this only
   * catches a result that couldn't have come from that board.
   */
  function papersRun(ws: WebSocket, player: string, run: Extract<ClientEvent, { type: 'gig' }>, brief: Brief, placeName: string, refuse: (text: string) => void): void {
    const data = loadPapersData(deps.papersDir ?? DEFAULT_PAPERS_DIR, deps.loreIds?.() ?? new Set(), () => {});
    const board = papersBoard(brief.tier, run.seed, data);
    const overlooked = run.papers?.overlooked ?? null;
    const adds =
      gigKind(run) === 'papers' &&
      gigKind(brief) === 'papers' &&
      RESULTS_FOR.papers.includes(run.result) &&
      run.max === board.cap &&
      run.trace >= 0 &&
      run.trace <= run.max &&
      (run.result !== 'clean' || run.trace <= board.clean) &&
      (overlooked === null || (overlooked >= 0 && overlooked < board.rules.length));
    if (!adds) return refuse("that run doesn't add up");
    const relay = deps.getRelay();
    if (relay.busy) return refuse('wait for her to finish');
    if (!relay.ready) return refuse(NO_LINK_NOTICE);
    if (board.firstNight) markFirstNightSeen(deps.dataDir ?? './data');
    const origins = new Map(data.origins.map((o) => [o.name, o.lore]));
    const bulletin = board.rules.map((r) => ({ text: ruleText(r.rule), why: r.why, lore: r.lore }));
    const extraLore = [...new Set(board.rules.flatMap((r) => (r.rule.f === 'origin' ? [origins.get(r.rule.v)] : [])).filter((x): x is string => !!x && !bulletin.some((b) => b.lore === x)))];
    const { title, tier, client, target, take, text } = brief;
    relay
      .gig(player, {
        kind: 'papers',
        title,
        tier,
        place: placeName,
        client,
        target,
        take,
        brief: text,
        result: run.result,
        trace: run.trace,
        max: run.max,
        papers: { name: board.name, pronoun: board.pronoun, bulletin, overlooked, ...(extraLore.length ? { extraLore } : {}) },
      })
      .then((r) => {
        if (r === null) refuse('wait for her to finish');
      })
      .catch(reportAsyncError(ws, 'gig'));
  }

  /**
   * Her line for a finished liar's dice round (spec §4): one side call on her model, answered to
   * this tab only. Nothing comes back when her model has nothing to say (or takes too long), and
   * nothing when it can't be asked (no link, she's replying): the tray just goes without.
   * A newer round from the same tab aborts the call still running for the last (that line is stale).
   */
  function diceLine(ws: WebSocket, player: string, ev: Extract<ClientEvent, { type: 'dice_line' }>): void {
    const relay = deps.getRelay();
    if (!deps.diceLine || relay.busy || !relay.ready || relay.diceRefusal?.(player)) return;
    diceLineCalls.get(ws)?.abort();
    const call = new AbortController();
    diceLineCalls.set(ws, call);
    deps
      .diceLine(player, { round: ev.round, record: ev.record, stake: ev.stake }, call.signal)
      .then((r) => {
        if (r && !call.signal.aborted) send(ws, { type: 'dice_line', round: ev.round, seed: ev.seed, line: r.line, expression: r.expression });
      })
      .catch(reportAsyncError(ws, 'dice line'))
      .finally(() => {
        if (diceLineCalls.get(ws) === call) diceLineCalls.delete(ws);
      });
  }
  /** Each tab's dice line call in flight (one at a time). */
  const diceLineCalls = new Map<WebSocket, AbortController>();

  /** A finished liar's dice game (spec §5): the row and her reaction. A refusal tells this tab only. */
  function dice(ws: WebSocket, player: string, game: Extract<ClientEvent, { type: 'dice' }>): void {
    const refuse = (text: string) => send(ws, { type: 'notice', text, for: 'dice' });
    const relay = deps.getRelay();
    const across = relay.diceRefusal?.(player);
    if (across) return refuse(across);
    if (relay.busy) return refuse('wait for her to finish');
    if (!relay.ready) return refuse(NO_LINK_NOTICE);
    relay
      .dice(player, { her: portrait.name, stake: game.stake, result: game.result, rounds: game.rounds, lines: game.lines, seed: game.seed })
      // Dropped (a turn started first): say so, or the tray would wait on a row that never comes.
      .then((r) => {
        if (r === null) refuse('wait for her to finish');
      })
      .catch(reportAsyncError(ws, 'dice'));
  }

  /** A refused journal edit goes back to that tab only (the panel shows it inline). */
  function warnIfRefused(ws: WebSocket, result: Result): void {
    if (!result.ok) send(ws, { type: 'dev_log', level: 'warn', text: result.error });
  }

  function reportAsyncError(ws: WebSocket, what: string): (err: unknown) => void {
    return (err) => {
      const text = `${what} failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[hub] ${text}`);
      send(ws, { type: 'dev_log', level: 'error', text });
    };
  }

  /** Runs a message control; a refusal goes back to this tab only. */
  function control(ws: WebSocket, what: string, run: (relay: ChatRelay) => Promise<Result>): void {
    run(deps.getRelay())
      .then((result) => {
        if (!result.ok && (CONTROL_REASONS as readonly string[]).includes(result.error)) {
          send(ws, { type: 'control_rejected', reason: result.error as ControlRejection });
        }
      })
      .catch(reportAsyncError(ws, what));
  }

  function handleEvent(ws: WebSocket, event: ClientEvent): void {
    const player = clients.get(ws) ?? deps.player;
    switch (event.type) {
      case 'regenerate':
        if (!deps.getRelay().ready) return rejectNoLink(ws);
        return control(ws, 'regenerate', (r) => r.regenerate(player, event.messageId));
      case 'swipe':
        return control(ws, 'swipe', (r) => r.swipe(player, event.messageId, event.index));
      case 'continue':
        if (!deps.getRelay().ready) return rejectNoLink(ws);
        return control(ws, 'keep going', (r) => r.continueReply(player, event.messageId));
      case 'edit_message':
        return control(ws, 'edit', (r) => r.edit(player, event.messageId, event.text));
      case 'delete_message':
        return control(ws, 'delete', (r) => r.remove(player, event.messageId));
      case 'restore_message':
        return control(ws, 'undo delete', (r) => r.restore(player, event.message));
      case 'rewind':
        return control(ws, 'rewind', (r) => r.rewind(player, event.messageId));
      case 'set_model': {
        const picker = deps.models;
        // Every room's hub has her picker; one without it (a test hub) has nothing to switch.
        if (!picker) {
          send(ws, { type: 'dev_log', level: 'warn', text: 'set_model: no model picker in this room' });
          return;
        }
        picker
          .choose(event.model)
          .then((why) => (why ? send(ws, { type: 'model_rejected', reason: why }) : broadcastModels(picker)))
          .catch(reportAsyncError(ws, 'set_model'));
        return;
      }
      case 'user_message':
        handleUserMessage(ws, player, event.text, event.mode ?? 'rp', event.leave === true, event.talk === true).catch(reportAsyncError(ws, 'user_message'));
        return;
      case 'quest_continue': {
        // CONTINUE on a quest waiting for the player (quest waits spec §3).
        const relay = deps.getRelay();
        if (pickChecking || relay.busy) return send(ws, { type: 'notice', text: 'wait for her to finish', for: 'quest' });
        relay
          .playDueQuest(player, { ready: true })
          .then((r) => (r === null ? send(ws, { type: 'notice', text: 'nothing to continue yet', for: 'quest' }) : undefined))
          .catch(reportAsyncError(ws, 'quest_continue'));
        return;
      }
      case 'fixer_buy': {
        const r = deps.getRelay().buy(player, event.item);
        if (typeof r === 'string') send(ws, { type: 'notice', text: r, for: 'quest' });
        return;
      }
      case 'crew': {
        const r = deps.getRelay().crew(player, event.action);
        if (typeof r === 'string') send(ws, { type: 'notice', text: r, for: 'crew' });
        return;
      }
      case 'quest_start':
      case 'quest_choose': {
        const relay = deps.getRelay();
        if (pickChecking) return send(ws, { type: 'notice', text: 'wait for her to finish', for: 'quest' });
        const done = event.type === 'quest_start' ? relay.startQuest(player, event.id) : relay.chooseQuest(player, { id: event.id, beat: event.beat, choice: event.choice, ...(event.said !== undefined ? { said: event.said } : {}), ...(event.moves ? { moves: event.moves } : {}), ...(event.read ? { read: event.read } : {}), ...(event.gig ? { gig: event.gig } : {}) });
        done.then((r) => (typeof r === 'string' ? send(ws, { type: 'notice', text: r, for: 'quest' }) : undefined)).catch(reportAsyncError(ws, event.type));
        return;
      }
      case 'quest_walk': {
        deps
          .getRelay()
          .walkAway(player, event.id)
          .then((r) => (typeof r === 'string' ? send(ws, { type: 'notice', text: r, for: 'quest' }) : undefined))
          .catch(reportAsyncError(ws, 'quest_walk'));
        return;
      }
      case 'retry':
        handleRetry(ws, player, event.messageId).catch(reportAsyncError(ws, 'retry'));
        return;
      case 'journal_edit':
        warnIfRefused(ws, deps.journal.note(player, { id: event.id, text: event.text, pinned: event.pinned, about: event.about, keys: event.keys }, 'user'));
        break;
      case 'journal_delete':
        warnIfRefused(ws, deps.journal.forget(player, event.id, 'user'));
        break;
      case 'journal_restore':
        warnIfRefused(ws, deps.journal.restore(player, event.note));
        break;
      case 'recap_seen':
        deps.journal.markRecapSeen(player);
        break;
      case 'residual_runs':
        send(ws, { type: 'residual_runs', runs: deps.db.residualRuns(RESIDUAL_RUNS_SHOWN, player), cipher: deps.cipher?.(player) ?? null, habits: readHabits(deps.db, player) });
        break;
      case 'let_her_go':
        if (!deps.getRelay().ready) return rejectNoLink(ws);
        // A held line is still being judged (mid review M4): not now, and the card the tab hid comes back.
        if (pickChecking) {
          send(ws, { type: 'control_rejected', reason: 'busy' });
          deps.getRelay().resendPlanCard(player);
          return;
        }
        return control(ws, 'let her go', (r) => r.letHerGo(player, event.text ?? ''));
      case 'plan_drop':
        return control(ws, 'go with her', async (r) => r.dropPlan(player));
      case 'greet':
        // Busy, or no longer due (another tab, or they spoke first): no greeting, and nothing to say about it.
        if (!deps.getRelay().busy) deps.getRelay().greet(player, event.opening).catch(reportAsyncError(ws, 'greet'));
        break;
      case 'dossier_page_edit':
        warnIfRefused(ws, deps.journal.setPage(player, event.text, 'user'));
        break;
      case 'dev_action':
        handleDevAction(ws, player, event.tool, event.args, event.as);
        return;
      case 'travel':
        travel(ws, player, event.place, event.comms === true, event.line);
        return;
      case 'exit':
        goThrough(ws, player, event.to);
        return;
      case 'gig':
        gig(ws, player, event);
        return;
      case 'dice_line':
        diceLine(ws, player, event);
        return;
      case 'dice':
        dice(ws, player, event);
        return;
      case 'encounter': {
        // Refused to this tab only, as GO is: the panel shows why.
        const refuse = (text: string) => send(ws, { type: 'notice', text, for: 'encounter' });
        const relay = deps.getRelay();
        if (!event.encounter) return refuse("that isn't an event");
        if (relay.busy) return refuse('wait for her to finish');
        if (!relay.ready) return refuse(NO_LINK_NOTICE);
        relay.encounter(player, event.encounter).catch(reportAsyncError(ws, 'encounter'));
        return;
      }
    }
  }

  function handleRaw(ws: WebSocket, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      send(ws, { type: 'dev_log', level: 'warn', text: 'received invalid JSON' });
      return;
    }
    const event = validateClientEvent(parsed);
    if (typeof event === 'string') {
      send(ws, { type: 'dev_log', level: 'warn', text: event });
      return;
    }
    try {
      handleEvent(ws, event);
    } catch (err) {
      send(ws, { type: 'dev_log', level: 'warn', text: err instanceof Error ? err.message : String(err) });
    }
  }

  function addClient(ws: WebSocket, player: string, o: { entered?: boolean } = {}): void {
    clients.set(ws, player);
    if (o.entered) deps.onJoin?.(player);
    sendInitialSync(ws, player);
    ws.on('message', (data: Buffer | string) => {
      handleRaw(ws, typeof data === 'string' ? data : data.toString('utf8'));
    });
    ws.on('close', () => {
      clients.delete(ws);
      diceLineCalls.get(ws)?.abort();
      diceLineCalls.delete(ws);
    });
  }

  return {
    get linkStatus() {
      return linkStatus;
    },
    refreshComms(player = deps.player) {
      const e = commsEvent(player);
      const key = JSON.stringify(e);
      if (key === lastComms) return;
      lastComms = key;
      emit(e);
    },
    emit,
    addClient,
    setLinkStatus,
    modelsChanged,
    appendToolLine,
    withToolLineReply<T>(player: string, messageId: string, fn: () => T): T {
      const before = toolLineReply;
      toolLineReply = { player, messageId };
      try {
        return fn();
      } finally {
        toolLineReply = before;
      }
    },
    closeAll(code) {
      for (const ws of clients.keys()) ws.close(code);
      clients.clear();
    },
  };
}
