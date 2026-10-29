import { parsePhotoReply, photoForModel, photosLine, type Photo } from '../../shared/photos';
import type { TrustControl } from './standing';
import { commsKey, parseComms, type CommsState } from '../../shared/comms';
import { arrangementActive, arrangementKey, arrangementLine, parseArrangement, type Arrangement } from '../../shared/arrangement';
import type { ChatMessage, ChatMode, CrewAction, CrewView, Debrief, PlanCard, QuestState, RoomState, ServerEvent, Take } from '../../shared/types';
import { BAIL, DOC } from '../../shared/crew';
import type { CrewEvent, CrewState } from '../../shared/crew-fold';
import { crewKey, parseCrewEvents } from './crew-view';
import { EMPTY_QUEST_STATE } from '../../shared/types';
import type { Db, RebuildResult } from './db';
import { roomChanges, type Room, type Result } from './room-state';
import { buildMessages, HISTORY_WINDOW, type Turn } from './history';
import { MAX_TEXT_CHARS, splitBubbles, textsBlock } from '../../shared/texts';
import { parsePromise, promiseKey, promiseSpentKey, promiseTriesKey } from '../../shared/promise';
import type { Pronoun } from '../../shared/pronoun';
import { readSummary } from './summary';
import type { Backend } from './backend';
import { TurnError, STREAM_OPEN_EVENT, type CompletionMessage, type ModelPair } from './turn';
import { wearingLine, type WearEntry } from './wearing';
import { TEXT_HEADING, TEXT_INSTRUCTIONS, promisedLine, textPlanLine, textWhereLine, herLeaveInstructions, END_SCENE_INSTRUCTIONS, LEAVE_INSTRUCTIONS, COMMS_BACK_INSTRUCTIONS, COMMS_DROP_LINE, COMMS_HANGUP_INSTRUCTIONS, COMMS_TRAVEL_INSTRUCTIONS, commsLine, beatLine, RP_HEADING, GREET_INSTRUCTIONS, SCENE_GREET_INSTRUCTIONS, GREET_PLACEHOLDER, LIGHTS_LINE, OOC_INSTRUCTIONS, ROLEPLAY_GUIDE, ROOM_INSTRUCTIONS, TRAVEL_INSTRUCTIONS, TRAVEL_LINE, ENCOUNTER_INSTRUCTIONS, QUEST_INSTRUCTIONS, MISSION_OPEN, MISSION_CLOSE, JOB_AFTER_READ, JOB_AFTER_GIG, GIG_INSTRUCTIONS, DICE_INSTRUCTIONS, endSceneText, othersBlock, strangerBlock, type OtherVoice } from './instructions';
import { echoLine } from './echoes';
import { parsePlan, planKey, planSeenKey } from '../../shared/plan';
import { encounterText, parseEncounter, strangerAt, type Encounter } from '../../shared/encounter';
import { gigActionLine, gigText, RESULTS_FOR, type GigResult, type GigSnapshot } from '../../shared/gig/brief';
import { diceActionLine, diceText, type DiceSnapshot } from '../../shared/dice/text';
import { arrivalLine, greetDue } from './greet';
import { formatClock, hhmmOf, promptClock, START, TURN_COST } from '../../shared/clock';
import { pageLine, type Journal } from './journal';
import type { Player } from './players';
import { LORE_WINDOW, loreBlock, loreLogLine, mentionsKeys, type LoreSelection } from '../../shared/lore';
import { leadsBlock, leadsLogLine, type LeadEntry, type LeadsForTurn } from '../../shared/leads';
import { sceneBlock, WRITTEN_SCENE_TITLE } from '../../shared/scenario';
import { moveLine } from '../../shared/arrival';
import type { Extra } from '../../shared/extras';
import { beatAt, beatText, isJob, ownedBy, postsOpen, nightMinuteOf, mentionsFlag, chooseVariant, fillTimes, flagsOf, holds, openQuests, pickLine, stepMinutes, type CrackPick, questWaitBlock, startWait, waitDue, waitLine, type Outcome, type RunWait, questBlock, questKey, questRowText, shownChoices, type Beat, type CondCtx, type QuestEntry, type QuestRun, type QuestStatus } from '../../shared/quests';
import { oneLine } from './persona';
import { bookId, buildDebrief, clientsBlock, jobBlock, BURNER, READ, READ_BEAT, READ_NOW, coverCards, coveredLoss, crackLine, crackSetup, deckDies, drawsFor, effectEvent, FALL_GUY, fallGuyFee, jobRunId, missionOpenBlock, missionSummary, payFor, playerKitLine, rerollCards, REROLL, rollLine, seedFor, TAKE } from './mission-run';
import { heatIn, oddsOf, outcomeTier, repDelta, repTier, TIER_NAMES, type CoverId, type Kit, type KitEvent, type Tier } from '../../shared/mission';
import { postedBig, postedJobs, storyDay } from '../../shared/board';
import { bigRep, bigStake, GIG_OUTCOME, GIG_RESULT_LINE, gigBrief, gigOf, gigSeed, goPassed, nightMinute, scoreRead, WALK_AWAY_REP, wordBank } from '../../shared/bigjob';
import { makeTerminal, playTerminal, type TerminalSetup } from '../../shared/crack';
import { buyEvent, canBuy, fixerKey, itemName, parseFixer, type StockItem } from '../../shared/stock';
import type { Deck } from '../../shared/gear';
import { DEFAULT_STATS } from '../../shared/stats';
import { kitLine } from '../../shared/kit-line';
import type { BigRun, Choice, Roll } from '../../shared/quests';

/** A turn that found no key linked (unlinked mid-session): the player relinks at select. */
export const NO_LINK_NOTICE = '// NO LINK — RELINK AT SELECT';

export interface ChatRelayDeps {
  /** The deck's texts (spec 2026-10-23 §5): a text turn's events go here, never to the room's tabs. */
  emitText?: (e: ServerEvent, player: string) => void;
  /** The photos that fit her at `clock` (photos spec §2: a promised text's is when it's stamped); absent or empty: none offered. */
  photosNow?: (clock: number | null) => Photo[];
  /** A photo's caption by id, from her whole pool; null when it's gone (photos spec §4). */
  photoCaption?: (id: string) => string | null;
  /** Her plan as it stands now, by place names (deck spec §4): what she texted holds. Null: none, or over. */
  planNow?: (player: string) => { going: { place: string; until: string } | null; meet: { place: string; time: string } | null } | null;
  /** Who she is, for the deck's prompts and the [texts] block: her name and pronoun. */
  self?: () => { name: string; pronoun: Pronoun };
  /** The story clock now (minutes since Day 1 00:00); absent: no clock (stamps and [time] left out). */
  clockNow?: () => number | null;
  /** A power cut card was picked (blackouts phase 3 §2): the room's district goes dark from its row's clock. */
  cutPower?: (rowId: string, at: number) => void;
  /** The clock moved (a turn's row was stamped): the world tells every tab. */
  onClock?: () => void;
  /** The story moved the clock live (a new turn row, her pass_time, the scribe's backstop), never a swipe or rewind: the room may follow the story (story moods spec §3). */
  onLiveClock?: () => void;
  /** Her `[your schedule: …]` line for this turn (null: no schedule). */
  scheduleLine?: (clock: number) => string | null;
  /** `[city: the power is out across Karasu since 22:00]` while her room's district is dark at `clock` (blackouts phase 3 §5). */
  cityLine?: (clock: number) => string | null;
  /**
   * Her plan's card for `player` (her plans spec §5): a going plan that stands while she's with you, off comms;
   * null otherwise. Absent: plans don't apply.
   */
  planCard?: (player: string) => { name: string; going: string; meet: { place: string; time: string } | null; from: string } | null;
  /**
   * Her plan's line for this turn (spec §6), and whether her reply spends the plan; null: nothing. `raw` stands in
   * for the stored plan (a regenerate reads it as it was before the take it replaces spent it).
   */
  planNote?: (mode: ChatMode, raw?: string | null) => { line: string | null; spend: boolean } | null;
  /** Her plan's places by name for her goodbye, whatever the card's checks say (mid review M3). */
  planLeave?: (player: string) => { going: string; meet: { place: string; time: string } | null } | null;
  /** Her line on a visitor from his background (ties); null: none. Read every turn. */
  tie?: (player: string) => string | null;
  /** What runs her turns. */
  backend: Backend;
  db: Db;
  /**
   * Who can visit: each turn belongs to one player–AI pair. Its player's "who's here" block goes in
   * the system message and its `[you: …]` line ends the context lines.
   */
  players: { defaultId: string; resolve(id: string): Player };
  room: Room;
  /** Her journal: its pinned notes, and her recap after a long gap, ride along with each turn. */
  journal?: Journal;
  /** `player` is set for one pair's events (message, nix_delta, messages_removed); unset for the room's. */
  emit: (e: ServerEvent, player?: string) => void;
  instructions?: string;
  /** A direct character's identity (her SOUL), read each turn and put first in the system message. */
  identity?: () => string;
  /**
   * Everyone else here at `clock` (the turn's), plus anyone who was here at `before` (her last
   * reply's) and has since left, so she can play the goodbye; read each turn. Absent: no one.
   */
  others?: (clock: number | null, before: number | null) => OtherVoice[];
  /**
   * What everyone on stage has on (outfit wears spec 2026-10-19): her entry, the turn's player's and
   * `others`' (this turn's, empty out of character), each kept only when it has a line. Absent: no line.
   */
  wearing?: (player: Player, others: readonly OtherVoice[]) => WearEntry[];
  /** The `[X heads out …]` / `[X comes in.]` lines between her last reply's clock and this turn's; null when no one came or went. */
  presence?: (before: number | null, after: number | null) => string | null;
  /** Her display name (default Nix): an event's stranger can't take it. */
  agentName?: string;
  /**
   * The lore book's entries for this turn: the room's scene, and recent text (this turn's first, then older lines, newest first).
   * `force`: entries a finished papers run hands her, the bulletin's and its origins' (Papers spec §4.2).
   */
  lore?: (sceneId: string, recent: string[], force?: readonly string[]) => LoreSelection;
  /**
   * Leads (spec 2026-10-12): this turn's for `player`, from `recent` (the lore window, this turn's
   * text first). `replaced`: leads the take being rewritten gave, which the new take hasn't (yet).
   * Read every in-character turn; absent: no leads.
   */
  leads?: (player: string, recent: string[], replaced: readonly string[]) => LeadsForTurn;
  /**
   * Standing (spec 2026-10-13 §5): her `[how you feel about …]` block on `player` this turn; null: none.
   * `replaced`: the reply a regenerate rewrites (its old take's move doesn't count), else null. Read every in-character turn.
   */
  standing?: (player: string, replaced: string | null) => string | null;
  /**
   * Quest lines (spec 2026-10-16): the book, every run `player` has in the playthrough (in whose room),
   * what conditions read for `player` with this contact (null: quests don't apply), and the map place
   * the room stands at. Absent: no quests.
   */
  quests?: {
    contact: string;
    book(): QuestEntry[];
    /** The extras library, for strangers' faces (stranger faces spec §5); absent: none. */
    extras?(): Extra[];
    status(player: string): QuestStatus[];
    ctx(player: string): CondCtx | null;
    placeId(): string | null;
    /** Names for the panel: a contact's, a map place's. */
    contactName(id: string): string;
    placeName(id: string): string;
    /** Missions (spec 2026-10-18): the player's kit now (sol, heat, deck, EDGE left), and the deck catalog. Absent: no kit, no decks. */
    kit?(player: string, at?: number): Kit;
    decks?(): Deck[];
    /** Small jobs (spec 2026-10-19): a map place's district (rep, heat, the board's tier); absent: none. */
    districtOf?(placeId: string): string | null;
    /** What seeds the nightly boards: the playthrough's id. */
    boardSeed?(): string;
    /** The terminal word list (world/gear/words.md), every length. */
    words?(): string[];
    /** The fixers' stock by board place (world/gear/stock.md). */
    stock?(): Record<string, StockItem[]>;
    /** Crew (spec 2026-10-19 §4): the CREW screen's view for the playthrough's player; null without one. */
    crewView?(): CrewView | null;
    /** Crew (§2): the folded crew state (prep and scouting on tonight's jobs); null without a playthrough. */
    crewState?(): CrewState | null;
  };
  /** A check's roll, 1–100 (missions spec §3). Default: Math.random; tests and e2e pass their own. */
  roll?: () => number;
  /** Test-only (e2e, NIX_TEST_GIG): every big job's route resolves to this without its gig window. */
  testGig?: 'clean' | 'close' | 'fail';
  /** Comms (spec 2026-10-20 §2): her place's name and yours while on the line. */
  commsPlaces?: (player: string) => { her: string; you: string } | null;
  /** The line dropped (comms spec §1): the playthrough goes solo and every tab hears it. */
  goSolo?: () => void;
  /** A job's trust stake (Intake board spec §2): her word before/after, and the move on the job's last row. */
  trust?: TrustControl;
  /** The out-of-character note for this agent (defaults to Nix's legacy text). */
  oocInstructions?: string;
  /** Abort a stream that yields no frame for this long (keepalive comments don't count): a backstop under the backend's own stall timeout. */
  streamIdleMs?: number;
  /** A turn settled (the relay is idle again): `mode` is its prompt's, `ok` whether her reply landed. */
  onTurnEnd?(t: { player: string; mode: string | undefined; ok: boolean; leave?: boolean; reply: { id: string; take: number } | null }): void;
  /** Before a turn asks her model: the last reply's scribe, if it's still running (scribe spec §2). */
  beforeTurn?(): Promise<void>;
  /** A reply's shown take is about to change or go (regenerate, swipe, delete): work reading it stops. */
  onTakeReplaced?(messageId: string): void;
  /** Lines are about to be cut (rewind): work reading them stops. */
  onRewind?(): void;
  /** A reply's shown take `keep` just became its only take (take 0): work reading it follows. */
  onTakesCollapsed?(messageId: string, keep: number): void;
  /** The story tables were rebuilt from the write log (rewind, swipe, a take opening or failing, delete, undo): show what changed. */
  onRebuild?(r: RebuildResult): void;
  /** Just before REWIND HERE deletes anything: the checkpoint that can bring the undone path back. False: it failed, so nothing is deleted. */
  beforeRewind?(): boolean;
}

const DEFAULT_STREAM_IDLE_MS = 120_000;
const IDLE = Symbol('idle');

/**
 * What a turn writes: a new reply, a new take of her latest reply (regenerate), or more of her
 * latest reply (keep going).
 */
type Target = { kind: 'new' } | { kind: 'take'; reply: ChatMessage } | { kind: 'continue'; reply: ChatMessage };

/** Her reply as it was before a take / keep-going turn opened it, to put back if the turn fails. */
interface Before {
  text: string;
  toolLines: string[];
  status: ChatMessage['status'];
  takes: { takes: Take[]; index: number } | null;
  model?: string;
  expression?: string;
  othersExpressions?: Record<string, string>;
  clock?: number;
}

const OK: Result = { ok: true, text: 'ok' };

function samePair(a: ModelPair | null, b: ModelPair): boolean {
  return a !== null && a.model === b.model && a.provider === b.provider;
}

/**
 * Relays chat turns between the browser and her model. Lowlight owns the conversation: each turn
 * sends the room note, the room's recent history and `[room: …] + userText` through her backend,
 * streams the reply back as `nix_delta` events, and persists it + the link status.
 */
/** A choice's tags on a pick: the flags it sets (over `flags`), its extra minutes, and its ALARM steps. */
function tagsOf(choice: Choice, flags: Record<string, string>): { flags: Record<string, string>; minutes: number; alarm: number } {
  const out = { flags: { ...flags }, minutes: 0, alarm: 0 };
  for (const t of choice.tags) {
    if (t.kind === 'set') out.flags[t.name] = t.value;
    else if (t.kind === 'clock') out.minutes += t.minutes;
    else if (t.kind === 'alarm') out.alarm += t.delta;
  }
  return out;
}

const TAKE_RANK = { full: 0, part: 1, none: 2 } as const;
/** A job's take and blown after `outcome` (small jobs spec §3): the worst take seen stays (none, then part, then full); a blown line sticks. */
const withTake = (run: QuestRun, outcome: Outcome): Pick<QuestRun, 'take' | 'blown'> => {
  const next = outcome.effects.take;
  const take = next && (!run.take || TAKE_RANK[next] > TAKE_RANK[run.take]) ? next : run.take;
  const blown = run.blown === true || outcome.effects.blown === true;
  return { ...(take ? { take } : {}), ...(blown ? { blown: true } : {}) };
};

/** A big job's run after `outcome` (big jobs spec §2): its clue found, its places marked or revealed (once each). */
const withBig = (run: QuestRun, outcome: Outcome, patch: Partial<BigRun> = {}): Pick<QuestRun, 'big'> => {
  if (!run.big) return {};
  const e = outcome.effects;
  const marks = [...run.big.marks];
  for (const m of [...(e.marks ?? []), ...(e.reveals ?? [])]) if (!marks.some((x) => x.place === m.place)) marks.push(m);
  const clues = e.clue && !run.big.clues.includes(e.clue) ? [...run.big.clues, e.clue] : run.big.clues;
  return { big: { ...run.big, marks, clues, ...patch } };
};

/** ALARM after `n` more steps, 0–3 (small jobs spec §3). */
const alarmPlus = (alarm: number | undefined, n: number) => Math.min(3, (alarm ?? 0) + n);


/** Which feed a row belongs to: the deck's texts, or the scene (deck spec §3). */
const feedOf = (m: ChatMessage): 'text' | 'scene' => (m.mode === 'text' ? 'text' : 'scene');
export class ChatRelay {
  private turnActive = false;
  /**
   * A row moved the clock live and the room hasn't checked yet: it does once the row's state is written
   * (a quest run's ALARM) and her reply is open (so a mood's line lands on it), or when the turn ends.
   */
  private liveClockPending = false;
  /** This turn's story clock base (its line's stamp) and the minutes she's passed in it. */
  private turnBase: number | null = null;
  private turnPassed = 0;
  private _activeMessageId: string | null = null;
  private _authFailed = false;
  private lastEmittedModel: ModelPair | null = null;
  /** The running turn's target (turns run one at a time). */
  private target: Target = { kind: 'new' };
  private before: Before | null = null;
  /** A keep going's start in the write log (its writes are the rows after it). */
  private continueMark = 0;
  /** The model that wrote the running turn (from stream.open, else the requested one). */
  private turnModel: string | undefined;
  /**
   * The pair the running call works on: set (after the busy check) by every public method, so
   * during a turn it is the turn's player — no other call can change it until the turn settles.
   */
  private pid: string;
  /** Who the running (or, when idle, the last) turn is with. */
  private turnPlayer: Player | null = null;
  /** The running turn's mode (null when idle): an out-of-character turn moves no standing. */
  private turnMode: ChatMessage['mode'] | null = null;
  /** Where she was for the last text sent (a RETRY of a failed text reads it again). */
  private textPlace = 'her place';
  /** The photos this text turn offered (photos spec §3): her `[photo: id]` must be one of them. */
  private offeredPhotos: ReadonlySet<string> = new Set();
  /** A regenerate's reply until its new take opens (the old take's writes still stand until then); else null. */
  private replacing: string | null = null;
  get replacingReply(): string | null {
    return this.replacing;
  }
  /** Whether the running turn is in character (true when idle). */
  get activeInCharacter(): boolean {
    return this.turnMode !== 'ooc';
  }
  /** The leads the running turn offers her (give_lead); empty when idle. */
  private turnOffer: LeadEntry[] = [];

  private readonly backend: Backend;

  constructor(private readonly deps: ChatRelayDeps) {
    this.backend = deps.backend;
    this.pid = deps.players.defaultId;
  }

  /** The turn's story clock now: the line's stamp plus what she's passed so far (null outside a stamped turn). */
  turnNow(): number | null {
    return this.turnBase === null ? null : this.turnBase + this.turnPassed;
  }

  /** pass_time: she skips `minutes` in this turn; her reply's clock moves with it. Null outside a stamped turn. */
  passTime(minutes: number): number | null {
    if (!this.turnActive || this.turnBase === null) return null;
    this.turnPassed += minutes;
    const now = this.turnBase + this.turnPassed;
    if (this._activeMessageId !== null) this.deps.db.updateMessage(this.pair(), this._activeMessageId, { clock: now });
    this.deps.onClock?.();
    this.deps.onLiveClock?.();
    return now;
  }

  /**
   * The scribe's time backstop (spec 2026-10-20): her finished reply `id`, take `take`, told time she
   * didn't pass; its clock moves on by `minutes`, the shown take's `passed` with it. Refused once a later
   * row exists or the story clock moved on elsewhere (the next line is already stamped), or while a turn runs.
   */
  scribePass(player: string, id: string, take: number, minutes: number): Result {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    const { db } = this.deps;
    const reply = db.getMessage(this.pair(), id);
    if (!reply || reply.role !== 'agent') return { ok: false, error: 'unknown' };
    if (reply.clock === undefined) return { ok: false, error: 'no clock' };
    const t = db.getTakes(this.pair(), id);
    if ((t?.index ?? 0) !== take) return { ok: false, error: 'not shown' };
    if (db.allMessages(this.pair()).at(-1)?.id !== id) return { ok: false, error: 'too late' };
    // The story clock is every contact's latest stamp (and the WAIT floor): moved on elsewhere, too late here too.
    if ((this.deps.clockNow?.() ?? reply.clock) > reply.clock) return { ok: false, error: 'too late' };
    const clock = reply.clock + minutes;
    db.updateMessage(this.pair(), id, { clock });
    if (t) {
      const line = reply.replyTo ? db.getMessage(this.pair(), reply.replyTo) : undefined;
      const base = line?.clock ?? reply.clock;
      db.setTakes(this.pair(), id, t.takes.map((k, i) => (i === take ? { ...k, passed: clock - base } : k)), t.index);
    }
    this.deps.onClock?.();
    this.deps.onLiveClock?.();
    this.emitPair({ type: 'message', message: db.getMessage(this.pair(), id)! });
    return { ok: true, text: formatClock(clock) };
  }

  /** The leads the running turn offers her (give_lead reads them); empty when idle. */
  offeredLeads(): LeadEntry[] {
    return this.turnActive ? this.turnOffer : [];
  }

  get activeMessageId(): string | null {
    return this._activeMessageId;
  }

  /** Counts the replies she has started writing: a regenerate or keep-going reuses its message id, not this. */
  private _turn = 0;
  get activeTurn(): number {
    return this._turn;
  }

  /** The player of the turn in progress, else of the last turn, else the default player. */
  get activePlayer(): string {
    return this.turnPlayer?.id ?? this.deps.players.defaultId;
  }

  /** Starts a call for `player`'s pair: an unknown id falls back to the default player. */
  private enter(player: string): void {
    this.pid = this.deps.players.resolve(player).id;
  }

  /**
   * The pair this call reads, writes and emits for. During a turn it must be the turn's player: a
   * mismatch means another call re-entered (say, an `await` slipped in before `runTurn`) and would
   * write one pair's rows or events into another's — fail loudly instead.
   */
  private pair(): string {
    if (this.turnActive && this.turnPlayer !== null && this.pid !== this.turnPlayer.id) throw new Error('relay: pair mismatch');
    return this.pid;
  }

  /** A pair's event: only that player's tabs should see it. */
  private emitPair(e: ServerEvent): void {
    // A text turn and text rows belong to the deck (spec 2026-10-23 §5): the room's tabs never see them.
    if (this.turnMode === 'text' || (e.type === 'message' && e.message.mode === 'text')) {
      this.deps.emitText?.(e, this.pair());
      return;
    }
    this.deps.emit(e, this.pair());
  }

  /**
   * True after the provider rejected the API key, until a turn succeeds or the key is relinked:
   * the health poll must not report the link OK while this is set.
   */
  get authFailed(): boolean {
    return this._authFailed;
  }

  /** True from `send()`/`retry()` until that turn settles; a new turn now would be rejected as busy. */
  get busy(): boolean {
    return this.turnActive;
  }

  /** False while a direct character has no key linked: no turn can start (nothing is stored). */
  get ready(): boolean {
    return this.backend.ready?.() ?? true;
  }

  /** A new key was linked: the last 401 no longer says anything about the link. */
  clearAuthFailed(): void {
    this._authFailed = false;
  }

  /** Moving on from her reply (answering, an event, a move) keeps the take on screen; the other takes go. */
  private keepShownTake(): void {
    const latest = this.latest();
    if (latest?.role === 'agent' && latest.takes) {
      // The shown take becomes the only one (take 0), and so do its writes.
      this.deps.db.collapseTakes(latest.id, latest.takes.index);
      this.deps.onTakesCollapsed?.(latest.id, latest.takes.index);
      this.deps.db.setTakes(this.pair(), latest.id, null, 0);
      this.emitPair({ type: 'message', message: this.deps.db.getMessage(this.pair(), latest.id)! });
    }
  }

  /**
   * A text on the deck (spec 2026-10-23 §2, §4): your text and her reply, as `mode: 'text'` rows that only the deck
   * shows. `place` is where she is as she reads it (her schedule or plan says; the deck works it out).
   */
  async sendText(player: string, text: string, place: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    if (text.length > MAX_TEXT_CHARS) return { ok: false, error: 'too-long' };
    if (text.trim().length === 0) return { ok: false, error: 'empty' };
    this.enter(player);
    this.textPlace = place;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: text.trim(), toolLines: [], ts: Date.now(), status: 'ok', mode: 'text' };
    this.insertTurnRow(userMessage);
    this.emitPair({ type: 'message', message: userMessage });
    return this.runTurn(userMessage);
  }

  /**
   * A promised text (promised texts spec §5): she said she'd text, and it came due at `due`. A hidden line stamped
   * `due` stands in for yours; her reply is her text, at the same minute. Kept, the promise goes under her reply.
   */
  async sendPromised(player: string, o: { about: string; due: number; where: string; place: string; from: string }): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    // Still the promise that came due (mid review I1): cancelled or replaced while it waited, it isn't sent.
    const standing = parsePromise(this.deps.db.getMeta(promiseKey(this.pid)));
    if (!standing || standing.from !== o.from) return { ok: false, error: 'stale' };
    // She has texted you since it came due ("home yet?" — "yeah, just in"): it's kept, and spent under that text.
    const since = this.deps.db.recentMessages(this.pid, 20, 'text').find((m) => m.role === 'agent' && m.status === 'ok' && (m.clock ?? -1) >= o.due);
    if (since) {
      this.deps.db.withStamp({ messageId: since.id, take: 0 }, () => this.deps.db.deleteMeta(promiseKey(this.pid)));
      this.deps.db.deleteMeta(promiseTriesKey(this.pid));
      return { ok: false, error: 'already' };
    }
    this.textPlace = o.place;
    const you = this.deps.players.resolve(this.pid).name;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: promisedLine({ you, about: o.about, where: o.where }), toolLines: [], ts: Date.now(), status: 'ok', mode: 'text', promised: true, clock: o.due };
    this.deps.db.insertMessage(this.pair(), userMessage);
    this.emitPair({ type: 'message', message: userMessage });
    const r = await this.runTurn(userMessage);
    // The turn spends the promise under her reply's take (runTurn's finally), so a REGEN spends it again.
    if (!r.ok) {
      // Nothing of a failed try stays behind: the next try writes its own line (promised texts minor 1).
      this.deps.db.deleteMessage(this.pair(), userMessage.id);
      this.emitPair({ type: 'messages_removed', ids: [userMessage.id] });
    }
    return r;
  }

  /** `leave` (LEAVE) marks an end line that walks out; ignored on any other mode. */
  async send(player: string, text: string, mode: ChatMode = 'rp', o: { leave?: boolean; parting?: 'her' } = {}): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    if (text.trim().length === 0 && mode !== 'end') return { ok: false, error: 'empty' };

    this.keepShownTake();

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      toolLines: [],
      ts: Date.now(),
      status: 'ok',
      ...(mode !== 'rp' ? { mode } : {}),
      ...(mode === 'end' && o.leave ? { leave: true as const, ...(o.parting === 'her' ? { parting: 'her' as const } : {}) } : {}),
    };
    this.insertTurnRow(userMessage);
    // HANG UP (comms spec §1): LEAVE on comms ends the line, under this row's stamp.
    const line = mode === 'end' && o.leave ? this.commsNow(this.pid) : null;
    if (line?.on) this.deps.db.setMeta(commsKey(this.pid), JSON.stringify({ on: false, at: line.at } satisfies CommsState));
    this.emitPair({ type: 'message', message: userMessage });

    return this.runTurn(userMessage);
  }

  /**
   * Her greeting as `player` walks in: a hidden greet line, then her reply to it. Dropped (null)
   * while a turn is running or when no greeting is due — another tab got there first, or they
   * spoke first.
   */
  async greet(player: string, opening?: string): Promise<Result | null> {
    if (this.turnActive || !this.ready) return null;
    this.enter(player);
    if (!greetDue(this.latest(), Date.now())) return null;

    // The arrival screen's opening (spec 2026-10-27 §3): a written scene, on a new game only, before the greeting.
    const scene = opening?.trim() ?? '';
    if (scene && this.deps.db.recentMessages(this.pid, 1).length === 0) {
      const row: ChatMessage = { id: `scene-${crypto.randomUUID()}`, role: 'user', text: scene, toolLines: [], ts: Date.now(), status: 'ok', mode: 'scene', scene: { title: WRITTEN_SCENE_TITLE, source: 'written' } };
      this.deps.db.insertMessage(this.pid, row);
      this.emitPair({ type: 'message', message: row });
    }

    const row: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: '', toolLines: [], ts: Date.now(), status: 'ok', mode: 'greet' };
    this.insertTurnRow(row);
    this.emitPair({ type: 'message', message: row });
    return this.runTurn(row);
  }

  /**
   * GO on the map: the room has already moved, and `player` and she arrive together. Saves the move
   * as an action line (the whole move is in it, so a regenerate sees the same thing), then her
   * answer to arriving. Dropped (null) while a turn is running.
   */
  async travel(player: string, move: { from: string | null; to: string; contact: string; via?: string; comms?: CommsState; line?: string; move?: () => unknown }): Promise<Result | null> {
    if (this.turnActive || !this.ready) return null;
    this.enter(player);
    const name = this.deps.players.resolve(this.pid).name;
    const said = move.line?.trim() ?? '';
    const moved = moveLine({ you: name, contact: move.contact, from: move.from, to: move.to, ...(move.via ? { via: move.via } : {}), ...(move.comms ? { comms: move.comms } : {}) });
    // Your line on the way (arrival screen spec §4) rides in the same row, so rewind and regenerate keep the two together.
    const text = said ? `${moved}\n\n${said}` : moved;
    this.keepShownTake();
    const row: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, toolLines: [], ts: Date.now(), status: 'ok', mode: 'travel' };
    this.insertTurnRow(row);
    // Under this row's stamp, so rewind takes the room's move and the line back with the row (comms review I2).
    move.move?.();
    if (move.comms) this.deps.db.setMeta(commsKey(this.pid), JSON.stringify(move.comms));
    this.emitPair({ type: 'message', message: row });
    return this.runTurn(row);
  }

  /**
   * A finished gig run (gig runs spec §6.2): saves the action line with the run's snapshot (a copy,
   * so a regenerate sees the same run), then her reaction. Dropped (null) while a turn is running.
   */
  async gig(player: string, run: Omit<GigSnapshot, 'you'>): Promise<Result | null> {
    if (this.turnActive || !this.ready) return null;
    this.enter(player);
    const snapshot: GigSnapshot = { you: this.deps.players.resolve(this.pid).name, ...run };
    this.keepShownTake();
    const row: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: gigActionLine(snapshot), toolLines: [], ts: Date.now(), status: 'ok', mode: 'gig', gig: snapshot };
    this.insertTurnRow(row);
    this.emitPair({ type: 'message', message: row });
    return this.runTurn(row);
  }

  /**
   * A finished liar's dice game (liar's dice spec §5.2): saves the action line with the game's
   * snapshot, then her reaction. Dropped (null) while a turn is running.
   */
  async dice(player: string, game: Omit<DiceSnapshot, 'you'>): Promise<Result | null> {
    if (this.turnActive || !this.ready) return null;
    this.enter(player);
    const snapshot: DiceSnapshot = { you: this.deps.players.resolve(this.pid).name, ...game };
    this.keepShownTake();
    const row: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: diceActionLine(snapshot), toolLines: [], ts: Date.now(), status: 'ok', mode: 'dice', dice: snapshot };
    this.insertTurnRow(row);
    this.emitPair({ type: 'message', message: row });
    return this.runTurn(row);
  }

  /**
   * DRAW (encounter cards): an event cuts in. Saves it as an encounter row, then her reaction to it.
   * Its stranger is dropped when their name is already taken (you, her, anyone else here).
   * Dropped (null) while a turn is running or with no key.
   */
  async encounter(player: string, e: Encounter): Promise<Result | null> {
    if (this.turnActive || !this.ready) return null;
    this.enter(player);
    const others = this.deps.others?.(this.deps.clockNow?.() ?? null, null) ?? [];
    const reserved = [this.deps.players.resolve(this.pid).name, this.deps.agentName ?? 'Nix', ...others.map((o) => o.name)];
    // The hub has checked its shape; this is the backstop (and drops a stranger whose name is taken).
    const event = parseEncounter(e, reserved);
    if (!event) return null;
    this.keepShownTake();
    const row: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: event.text,
      toolLines: [],
      ts: Date.now(),
      status: 'ok',
      mode: 'encounter',
      encounter: { title: event.title, ...(event.stranger ? { stranger: event.stranger } : {}), ...(event.power ? { power: event.power } : {}) },
    };
    this.insertTurnRow(row);
    // Her reply sees the dark room and the [city] line.
    if (event.power === 'out') {
      const at = row.clock ?? this.deps.clockNow?.() ?? null;
      if (at !== null) this.deps.cutPower?.(row.id, at);
    }
    this.emitPair({ type: 'message', message: row });
    return this.runTurn(row);
  }

  /** The quest at a beat in this room for `player`, with its file's quest and beat; or why it can't go on. */
  private questHere(player: string): { status: QuestStatus; q: QuestEntry | undefined; beat: Beat | undefined; wait: RunWait | null } | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    // A run at a beat comes before a parked one: a big job's read can come up while another quest waits here.
    const open = qs.status(player).filter((s) => s.contact === qs.contact && !s.run.done);
    const status = open.find((s) => s.run.beat !== null) ?? open.find((s) => s.run.wait !== null);
    if (!status) return null;
    const q = qs.book().find((e) => e.id === bookId(status.id));
    const wait = status.run.beat === null ? status.run.wait : null;
    return { status, q, beat: q && status.run.beat !== null ? beatAt(q, status.run.beat, status.run.variant) : undefined, wait };
  }

  /** Whether a parked run's quest file still has what it waits for (the beat, and the missed path). */
  private waitIntact(q: QuestEntry | undefined, w: RunWait): boolean {
    const has = (id: string) => Boolean(q && (q.beats.has(id) || q.outcomes.has(id)));
    return Boolean(q) && q!.beats.has(w.to) && (w.else === null || has(w.else));
  }

  /** What the room shows of quest lines for `player` (spec §3): QUEST's list and the cards. One quest at a beat here at a time. */
  questState(player: string): QuestState {
    const qs = this.deps.quests;
    const ctx = qs?.ctx(player) ?? null;
    if (!qs || !ctx) return { ...EMPTY_QUEST_STATE };
    const book = qs.book();
    const titleOf = (id: string) => book.find((e) => e.id === id)?.title ?? id;
    // Quests at a beat or waiting in someone else's room: listed here so they're never lost (quest waits spec §4).
    const elsewhere = qs
      .status(player)
      .filter((s) => s.contact !== qs.contact && !s.run.done && (s.run.beat !== null || s.run.wait !== null || s.run.big?.section === 'legwork'))
      .map((s) => ({ id: bookId(s.id), title: titleOf(bookId(s.id)), contact: s.contact, contactName: qs.contactName(s.contact), next: s.run.wait ? waitLine(s.run.wait, qs.placeName) : null }));
    const fixer = this.fixerFor(player);
    const none: QuestState = { ...EMPTY_QUEST_STATE, elsewhere, ...(fixer ? { fixer } : {}) };
    const here = this.questHere(player);
    if (here) {
      const changed = { ...none, changed: `${here.q?.title ?? here.status.id} has changed since you started it` };
      if (here.wait) {
        if (!this.waitIntact(here.q, here.wait)) return changed;
        const w = here.wait;
        const waiting = { id: here.q!.id, title: here.q!.title, next: waitLine(w, qs.placeName), at: w.at ? qs.placeName(w.at) : null, from: w.from, by: w.by, ready: w.ready, here: w.at === null || w.at === qs.placeId(), ...(w.comms ? { comms: true as const } : {}) };
        // A big job in legwork keeps its panel while another quest waits here (the wait stays on the list); CONTINUE's card comes first.
        const legwork = w.ready && waiting.here ? null : this.legworkView(player, book);
        return { ...none, waiting, ...(legwork ? { active: legwork } : {}) };
      }
      // A big job at its read (big jobs spec §3): the sentence and the word bank.
      if (here.q?.kind === 'big' && here.status.run.beat === READ_BEAT && here.q.read) {
        const { q, status } = here;
        const big = status.run.big!;
        return {
          ...none,
          active: {
            id: q.id,
            title: q.title,
            beat: READ_BEAT,
            choices: [],
            ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}),
            alarm: status.run.alarm ?? 0,
            edge: qs.kit?.(player).edgeLeft ?? 0,
            heat: this.runCtx(q, status.run, ctx, player).heat ?? 0,
            pay: q.payRange ?? [0, 0],
            big: {
              section: 'read',
              go: hhmmOf(q.go ?? 0),
              left: null,
              clues: big.clues.map((id) => ({ id, text: q.clues.get(id)?.text ?? id })),
              marks: [],
              read: { parts: q.read!.parts, bank: wordBank(q, big.clues, questKey(this.pair(), status.id)) },
            },
          },
        };
      }
      if (!here.q || !here.beat) return changed;
      const { q, beat, status } = here;
      const run = status.run;
      const rctx = this.runCtx(q, run, ctx, player);
      const kit = qs.kit?.(player);
      const cracks: Record<string, TerminalSetup> = {};
      const routes: NonNullable<NonNullable<QuestState['active']>['big']>['routes'] = {};
      let cards: NonNullable<QuestState['active']>['choices'];
      // A blown job waiting on cover (spec §5–§6): the pick that blew it and the debrief as it stands come with the cards.
      const pc = run.pendingCover;
      const blown = pc ? { text: fillTimes(pc.text, (this.deps.clockNow?.() ?? 0) + pc.minutes), ...(pc.pick ? { pick: pc.pick } : {}), debrief: this.jobEnd(q, run, pc, null, player).debrief } : null;
      if (pc) cards = coverCards(kit?.cover ?? { burner: 0, 'fall-guy': 0 }, this.coverLoss(q, run), run.pay);
      else if (run.pending) cards = rerollCards(kit?.edgeLeft ?? 0);
      else
        cards = shownChoices(beat, rctx).map((c) => {
          const setup = c.crack && isJob(q) ? this.crackSetupFor(status.id, beat.id, c, rctx) : null;
          if (setup) cracks[c.id] = setup;
          // A big job's route (big jobs spec §3): its gig as it stands for you, the board it deals, its seed.
          if (c.gig && q.kind === 'big') {
            const g = gigOf(c.gig, rctx);
            routes![c.id] = { ...g, seed: gigSeed(questKey(this.pair(), status.id), beat.id, c.id), brief: gigBrief(q, g.kind, g.tier, c.line) };
          }
          return { id: c.id, line: c.line, ...(c.check ? { odds: this.oddsFor(c, rctx, beat, { q, run, player }) } : {}), ...(c.check?.red ? { red: true as const } : {}), ...(setup ? { crack: { length: setup.length, tries: setup.tries } } : {}) };
        });
      const job = isJob(q) ? { alarm: run.alarm ?? 0, edge: kit?.edgeLeft ?? 0, heat: rctx.heat ?? 0, pay: q.payRange ?? ([0, 0] as [number, number]), ...(run.pending ? { rolled: { choice: run.pending.choice, chance: run.pending.chance, rolls: run.pending.rolls } } : {}) } : {};
      return {
        ...none,
        active: { id: q.id, title: q.title, beat: beat.id, choices: cards, ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}), ...job, ...(Object.keys(cracks).length ? { crack: cracks } : {}), ...(blown ? { blown } : {}), ...(q.kind === 'big' && run.big ? { big: this.bigStrip(q, run, routes!) } : {}) },
      };
    }
    const legwork = this.legworkView(player, book);
    const quests = openQuests(
      // A quest line's posts: window gates its listing too (arrangement spec §1: The Chair on her shift).
      book.filter((q) => !isJob(q) && postsOpen(q.posts, this.deps.clockNow?.() ?? 0)),
      { placeId: qs.placeId(), contact: qs.contact, started: qs.status(player), ctx },
    );
    // In the book's order, quests and tonight's jobs together.
    const listed = new Set([...quests, ...this.openJobs(player, book, ctx)]);
    const open = book.filter((q) => listed.has(q));
    // Crew (spec §2): a SCOUT shows tonight's draws and pay (the run key seeds them, so they're the ones the run gets); a CASE says so.
    const crew = qs.crewState?.() ?? null;
    const day = this.storyDay();
    const crewRow = (q: QuestEntry) => {
      const runId = jobRunId(q, day);
      const key = questKey(player, runId);
      return {
        ...(crew?.scouted.includes(runId) ? { scouted: { draws: drawsFor(q, key), pay: payFor(q, key) } } : {}),
        ...(crew?.prep[runId]?.cased ? { cased: true as const } : {}),
      };
    };
    return { ...none, open: open.map((q) => ({ id: q.id, title: q.title, pitch: q.pitch, timed: q.timed, ...(q.kind === 'mission' ? { mission: { pay: q.pay, tier: q.tier, ...(q.payRange ? { range: q.payRange } : {}), ...crewRow(q), ...(ownedBy(q) ? { own: qs.contactName(ownedBy(q)!) } : {}), ...(q.trust ? { trust: true as const } : {}), ...(this.capped(q, player) ? { capped: qs.contactName(qs.contact) } : {}), ...(q.commsAt ? { comms: qs.placeName(q.commsAt) } : {}) } } : {}), ...(q.kind === 'big' ? { big: { tier: q.tier, range: q.payRange, stake: bigStake(q) } } : {}) })), ...(legwork ? { active: legwork } : {}) };
  }

  /** The fixer's stock where you stand, with what you can buy (small jobs spec §5); null away from a board with stock. */
  private fixerFor(player: string): NonNullable<QuestState['fixer']> | null {
    const qs = this.deps.quests;
    const place = qs?.placeId() ?? null;
    const items = place ? qs?.stock?.()[place] : undefined;
    if (!qs || !place || !items?.length) return null;
    const kit = qs.kit?.(player);
    const tier = repTier(kit?.rep[qs.districtOf?.(place) ?? 'unknown'] ?? 0);
    const decks = qs.decks?.() ?? [];
    return { place, items: items.map((item) => ({ id: item.id, name: itemName(item, decks), price: item.price, tier: item.tier, state: canBuy({ item, sol: kit?.sol ?? 0, tier }) })) };
  }

  /**
   * BUY at the fixer (small jobs spec §5): one kit event on `fixer.<player>`, stamped to the latest row
   * so rewind undoes it. A string is why not.
   */
  buy(player: string, itemId: string): Result | string {
    if (this.turnActive) return 'wait for her to finish';
    this.enter(player);
    const qs = this.deps.quests;
    const place = qs?.placeId() ?? null;
    const stock = place ? (qs?.stock?.()[place] ?? []) : [];
    const item = stock.find((s) => s.id === itemId);
    if (!qs || !place || !item) return "the fixer here doesn't sell that";
    // A crack card's terminal is built from the deck you hold: nothing changes hands mid-job.
    const book = qs.book();
    // Only while a job's beat is up (its cards could change under you); a big job's legwork between scenes is fine.
    if (qs.status(this.pid).some((s) => !s.run.done && (s.run.beat !== null || s.run.wait !== null) && isJob(book.find((q) => q.id === bookId(s.id)) ?? { kind: 'quest' }))) return 'not while a job is in progress';
    const district = qs.districtOf?.(place) ?? 'unknown';
    const kit = qs.kit?.(this.pid);
    const state = canBuy({ item, sol: kit?.sol ?? 0, tier: repTier(kit?.rep[district] ?? 0) });
    const name = itemName(item, qs.decks?.() ?? []);
    if (state === 'locked') return `${name} needs ${TIER_NAMES[item.tier - 1]} in ${district}`;
    if (state === 'short') return `${name} costs ${item.price} sol`;
    const key = fixerKey(this.pair());
    const event = buyEvent({ item, at: this.deps.clockNow?.() ?? 0, current: kit?.deck ?? null, placeStock: stock });
    this.deps.db.setMeta(key, JSON.stringify([...parseFixer(this.deps.db.getMeta(key)), event]));
    this.emitQuestState();
    return OK;
  }

  /**
   * A CREW action (crew spec §4): one crew event on `crew.<player>.<recruitId>`, stamped to the latest row so
   * rewind undoes it, checked against the folded view first. A string is why not.
   */
  crew(player: string, a: CrewAction): Result | string {
    if (this.turnActive) return 'wait for her to finish';
    this.enter(player);
    const view = this.deps.quests?.crewView?.() ?? null;
    if (!view) return 'no crew in this playthrough';
    const at = this.deps.clockNow?.() ?? START;
    const write = (id: string, ev: CrewEvent): Result => {
      const key = crewKey(this.pair(), id);
      this.deps.db.setMeta(key, JSON.stringify([...parseCrewEvents(this.deps.db.getMeta(key)), ev]));
      this.deps.emit({ type: 'crew_changed' }, this.pair());
      return OK;
    };
    const first = (name: string) => name.split(' ')[0];
    if (a.do === 'hire') {
      if (view.roster.some((m) => m.recruit.id === a.recruit)) return 'already hired';
      const found = view.hires.flatMap((h) => h.cards.flatMap((c) => (c.recruit?.id === a.recruit ? [{ h, c }] : [])))[0];
      if (!found || !found.c.recruit) return "that hire isn't on tonight's list";
      if (view.here !== found.h.place) return `you hire at ${found.h.name}`;
      if (view.used >= view.slots) return 'no free slot';
      if (view.sol < found.c.cost) return `${first(found.c.recruit.name)} costs ${found.c.cost} sol`;
      return write(a.recruit, { type: 'hire', at, recruit: found.c.recruit, place: found.h.place, cost: found.c.cost });
    }
    const m = view.roster.find((x) => x.recruit.id === a.recruit);
    if (!m || m.state === 'gone') return 'no one by that name';
    const name = first(m.recruit.name);
    switch (a.do) {
      case 'send': {
        if (m.state === 'out') return `${name}'s still out. Back ${hhmmOf(((m.due ?? at) % 1440 + 1440) % 1440)}.`;
        if (m.state === 'hurt') return `${name}'s hurt`;
        if (m.state === 'held') return `${name}'s held by SDG`;
        if (m.busy) return `${name}'s busy tonight`;
        const e = view.errands.find((x) => x.id === a.errand);
        if (!e) return "that errand isn't open tonight";
        if (e.taken) return "that errand's taken tonight";
        return write(a.recruit, { type: 'send', at, errand: a.errand });
      }
      case 'recall':
        return m.state === 'out' ? write(a.recruit, { type: 'recall', at }) : `${name} isn't out`;
      case 'doc':
        if (m.state !== 'hurt') return `${name} isn't hurt`;
        if (view.sol < DOC) return `the doc costs ${DOC} sol`;
        return write(a.recruit, { type: 'doc', at });
      case 'bail': {
        if (m.state !== 'held') return `${name} isn't held`;
        const cost = BAIL[m.recruit.grade];
        if (view.sol < cost) return `bail is ${cost} sol`;
        return write(a.recruit, { type: 'bail', at, cost });
      }
      case 'leave':
        return m.state === 'held' ? write(a.recruit, { type: 'leave', at }) : `${name} isn't held`;
      case 'letgo':
        return write(a.recruit, { type: 'letgo', at });
    }
  }

  /** A big job of this room's in legwork: its status and quest; null with none. */
  private legworkRun(): { status: QuestStatus; q: QuestEntry } | null {
    const qs = this.deps.quests!;
    const status = qs.status(this.pid).find((s) => s.contact === qs.contact && !s.run.done && s.run.beat === null && s.run.wait === null && s.run.big?.section === 'legwork');
    const q = status && qs.book().find((e) => e.id === bookId(status.id));
    return status && q?.kind === 'big' ? { status, q } : null;
  }

  /**
   * Legwork (big jobs spec §2–§3), with nothing at a beat here: past the go hour the read comes up;
   * else arriving at a marked, unvisited place with a scene plays it. Silent rows. Null: nothing to play.
   */
  private async playLegwork(): Promise<Result | null> {
    const lw = this.legworkRun();
    if (!lw) return null;
    const { q, status } = lw;
    const big = status.run.big!;
    const now = this.deps.clockNow?.() ?? 0;
    if (goPassed(q, big.started, now)) return this.toRead(q, status, '*The go hour. Time to say what\'s going on.*');
    const place = this.deps.quests!.placeId();
    if (!place || !big.marks.some((m) => m.place === place) || big.visited.includes(place)) return null;
    const ctx = this.runCtx(q, status.run, this.deps.quests!.ctx(this.pid)!, this.pid);
    const scene = [...q.beats.values()].find((vs) => vs[0].at === place);
    const visited = { ...status.run, big: { ...big, visited: [...big.visited, place] }, at: Date.now() };
    // A marked place with no scene is a dead end: visited, nothing plays.
    const chosen = scene ? chooseVariant(q, scene[0].id, ctx) : null;
    if (!chosen) {
      this.deps.db.setMeta(questKey(this.pair(), status.id), JSON.stringify(visited));
      this.emitQuestState();
      return null;
    }
    const drawn = this.drawFace(chosen.beat.stranger, status.run.faces ?? {});
    const row = this.questRow(q, [beatText(chosen.beat, ctx)], { beat: chosen.beat }, undefined, drawn.face, { run: status.id });
    return this.questTurn(row, status.id, { ...visited, beat: chosen.beat.id, variant: chosen.variant, ...(drawn.faces ? { faces: drawn.faces } : {}) }, 0, false, 0);
  }

  /** The read comes up (big jobs spec §3): the run stands on it (`!read`), with a silent row saying so. */
  private async toRead(q: QuestEntry, status: QuestStatus, text: string): Promise<Result> {
    const row = this.questRow(q, [text], { beat: null }, undefined, undefined, { run: status.id });
    return this.questTurn(row, status.id, { ...status.run, beat: READ_BEAT, variant: 0, big: { ...status.run.big!, section: 'read' }, at: Date.now() }, 0, false, 0);
  }

  /** A big job here waiting in legwork (big jobs spec §5): its strip, clues and the marked places still to visit, with READ IT NOW. */
  private legworkView(player: string, book: QuestEntry[]): QuestState['active'] {
    const qs = this.deps.quests!;
    const status = qs.status(player).find((s) => s.contact === qs.contact && !s.run.done && s.run.beat === null && s.run.wait === null && s.run.big?.section === 'legwork');
    const q = status && book.find((e) => e.id === bookId(status.id));
    if (!status || !q || q.kind !== 'big') return null;
    const big = status.run.big!;
    const now = this.deps.clockNow?.() ?? 0;
    const passed = goPassed(q, big.started, now);
    const goAt = big.started - nightMinute(big.started) + nightMinuteOf(q.go ?? 0);
    return {
      id: q.id,
      title: q.title,
      beat: '!legwork',
      choices: [{ id: READ_NOW, line: 'READ IT NOW' }],
      ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}),
      alarm: status.run.alarm ?? 0,
      edge: qs.kit?.(player).edgeLeft ?? 0,
      heat: this.runCtx(q, status.run, qs.ctx(player)!, player).heat ?? 0,
      pay: q.payRange ?? [0, 0],
      big: {
        section: 'legwork',
        go: hhmmOf(q.go ?? 0),
        left: passed ? null : goAt - now,
        clues: big.clues.map((id) => ({ id, text: q.clues.get(id)?.text ?? id })),
        marks: big.marks.filter((m) => !big.visited.includes(m.place)).map((m) => ({ place: m.place, name: qs.placeName(m.place), line: m.line })),
      },
    };
  }

  /** Today's story day (small jobs spec §2): it turns at 06:00. */
  private storyDay(): number {
    return storyDay(this.deps.clockNow?.() ?? START);
  }

  /** A job's district (its board's); null without districts. */
  private districtOf(q: QuestEntry): string | null {
    return this.deps.quests?.districtOf?.(q.starts) ?? null;
  }

  /**
   * The jobs open here (small jobs spec §2): at this board, with this contact, after their condition, posted
   * tonight for your rep tier in its district, not run today, and not in progress anywhere.
   */
  private openJobs(player: string, book: QuestEntry[], ctx: CondCtx): QuestEntry[] {
    const qs = this.deps.quests!;
    const place = qs.placeId();
    if (!place) return [];
    const started = qs.status(player);
    const day = this.storyDay();
    // The board posted at 06:00: your tier as it stood then, so rep won tonight doesn't reshuffle it.
    const kit = qs.kit?.(player, 360 + day * 1440);
    const seed = qs.boardSeed?.() ?? '';
    // One big job at a time (big jobs spec §1): one in progress anywhere keeps the boards' big jobs down.
    const bigRunning = started.some((s) => !s.run.done && book.find((q) => q.id === bookId(s.id))?.kind === 'big');
    return book.filter((q) => {
      if (q.kind === 'big') {
        if (bigRunning || q.starts !== place || (q.with !== null && !q.with.includes(qs.contact)) || !holds(q.after, ctx)) return false;
        const tier = repTier(kit?.rep[this.districtOf(q) ?? 'unknown'] ?? 0);
        if (postedBig({ book, place, tier, day, seed }) !== q.id) return false;
        return !started.some((s) => bookId(s.id) === q.id && (s.id === jobRunId(q, day) || s.run.endDay === day));
      }
      if (q.kind !== 'mission' || q.starts !== place || (q.with !== null && !q.with.includes(qs.contact)) || !holds(q.after, ctx)) return false;
      // A job's posts: window (Intake board spec §1) gates listing only; a started run carries on.
      if (!postsOpen(q.posts, this.deps.clockNow?.() ?? 0)) return false;
      // A desk job is played on comms (spec 2026-10-20 §3): it lists only while her deal is in force (final review I5).
      if (q.commsAt && !this.commsCan(player)) return false;
      const tier = repTier(kit?.rep[this.districtOf(q) ?? 'unknown'] ?? 0);
      if (!postedJobs({ book, place, tier, day, seed }).includes(q.id)) return false;
      return !started.some((s) => bookId(s.id) === q.id && (s.id === jobRunId(q, day) || !s.run.done || s.run.endDay === day));
    });
  }

  /**
   * What conditions read on a run (small jobs spec §1–§3): a job's own flags (its draws) over the
   * playthrough's, its ALARM, and the heat in its district.
   */
  private runCtx(q: QuestEntry, run: QuestRun | null, ctx: CondCtx, player: string): CondCtx {
    if (!isJob(q)) return ctx;
    const qs = this.deps.quests!;
    const district = this.districtOf(q);
    const kit = district ? qs.kit?.(player) : undefined;
    // Quests' flags, then this run's own: another job's (or last night's) prep never carries in.
    const book = qs.book();
    const quests = qs.status(player).filter((s) => !isJob(book.find((e) => e.id === bookId(s.id)) ?? { kind: 'quest' }));
    // A big job's time conditions read the hour within its night (big jobs spec §2).
    const night = q.kind === 'big' ? { night: nightMinute(this.deps.clockNow?.() ?? 0) } : {};
    return { ...ctx, flags: { ...flagsOf(quests), ...(run?.flags ?? {}) }, alarm: run?.alarm ?? 0, ...(kit ? { heat: heatIn(kit, district) } : {}), ...night };
  }

  /** A big job's strip at a beat (big jobs spec §5): section, go hour, clues, the marks still to visit (legwork), its routes. */
  private bigStrip(q: QuestEntry, run: QuestRun, routes: NonNullable<NonNullable<QuestState['active']>['big']>['routes']): NonNullable<NonNullable<QuestState['active']>['big']> {
    const big = run.big!;
    const now = this.deps.clockNow?.() ?? 0;
    const goAt = big.started - nightMinute(big.started) + nightMinuteOf(q.go ?? 0);
    const legwork = big.section === 'legwork';
    return {
      section: big.section,
      go: hhmmOf(q.go ?? 0),
      left: legwork && now < goAt ? goAt - now : null,
      clues: big.clues.map((id) => ({ id, text: q.clues.get(id)?.text ?? id })),
      marks: legwork ? big.marks.filter((m) => !big.visited.includes(m.place)).map((m) => ({ place: m.place, name: this.deps.quests!.placeName(m.place), line: m.line })) : [],
      ...(routes && Object.keys(routes).length ? { routes } : {}),
      ...(this.deps.testGig ? { gigAuto: true as const } : {}),
    };
  }

  /** The read (big jobs spec §3): three different bank words, scored; the flags join the run; a wrong read starts at ALARM 1; her line answers the row. */
  private async readPick(q: QuestEntry, status: QuestStatus, picks: [string, string, string]): Promise<Result | string> {
    const passed = 'that choice has passed';
    const run0 = status.run;
    const big = run0.big!;
    const bank = wordBank(q, big.clues, questKey(this.pair(), status.id));
    if (new Set(picks).size !== 3 || picks.some((w) => !bank.includes(w))) return passed;
    const sc = scoreRead(q, picks);
    const flags = { ...run0.flags, ...sc.flags };
    const alarm = sc.level === 'wrong' ? Math.max(1, run0.alarm ?? 0) : (run0.alarm ?? 0);
    const ctx = this.runCtx(q, { ...run0, flags, alarm }, this.deps.quests!.ctx(this.pid)!, this.pid);
    const chosen = chooseVariant(q, q.read!.next, ctx);
    if (!chosen) return passed;
    // The sentence as made, never which blanks were right.
    const made = q.read!.parts.map((p, i) => p + (picks[i] ?? '')).join('').trim();
    const row = this.questRow(q, [`*${made}*`, beatText(chosen.beat, ctx)], { beat: chosen.beat }, undefined, undefined, { run: status.id, after: 'read' });
    const run: QuestRun = { ...run0, beat: chosen.beat.id, variant: chosen.variant, flags, alarm, picks: [...run0.picks, { beat: READ_BEAT, choice: READ }], big: { ...big, section: 'approach', read: { picks, level: sc.level } }, at: Date.now() };
    return this.questTurn(row, status.id, run, 0, true, 0);
  }

  /**
   * A route (big jobs spec §3): its gig's result, checked against the route's seed and kind (or NIX_TEST_GIG's),
   * picks the clean, close or failed outcome; her line answers the row.
   */
  private async gigPick(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, choice: Choice, o: { said?: string; gig?: { result: GigResult; seed: number } }): Promise<Result | string> {
    const passed = 'that choice has passed';
    const g = gigOf(choice.gig!, ctx);
    const seed = gigSeed(questKey(this.pair(), status.id), beat.id, choice.id);
    let result: GigResult;
    if (o.gig) {
      if (o.gig.seed !== seed || !RESULTS_FOR[g.kind].includes(o.gig.result)) return passed;
      result = o.gig.result;
    } else if (this.deps.testGig) result = this.deps.testGig === 'fail' ? RESULTS_FOR[g.kind][2] : this.deps.testGig;
    else return passed;
    const outcome = q.outcomes.get([choice.to, choice.close ?? '', choice.fail ?? ''][GIG_OUTCOME[result]]);
    if (!outcome) return passed;
    const t = tagsOf(choice, status.run.flags);
    const line = o.said?.trim() || pickLine(choice.line);
    return this.jobStep({
      q,
      status,
      ctx,
      outcome,
      texts: [line, `*${g.kind.toUpperCase()} · ${g.tier.toUpperCase()} — ${GIG_RESULT_LINE[result]}.*`],
      pick: { choice: choice.id, line },
      record: { beat: beat.id, choice: choice.id },
      minutes: t.minutes,
      kitBefore: status.run.kit ?? [],
      alarm: alarmPlus(status.run.alarm, t.alarm),
      flags: t.flags,
      answer: true,
      after: 'gig',
      big: { section: 'out', gig: { choice: choice.id, kind: g.kind, tier: g.tier, seed, result } },
    });
  }

  /** WALK AWAY (big jobs spec §4): before the approach, a big job ends for −5 rep in its district, no heat, no debrief. A string is why not. */
  async walkAway(player: string, id: string): Promise<Result | string> {
    if (this.turnActive) return 'wait for her to finish';
    if (!this.ready) return NO_LINK_NOTICE;
    this.enter(player);
    const qs = this.deps.quests;
    const status = qs?.status(this.pid).find((s) => s.contact === qs.contact && !s.run.done && s.run.big && bookId(s.id) === id);
    const q = status && qs!.book().find((e) => e.id === id);
    if (!status || !q) return 'no job to walk away from';
    if (status.run.big!.section !== 'legwork' && status.run.big!.section !== 'read') return "you can't walk away now";
    const district = this.districtOf(q) ?? 'unknown';
    const at = this.deps.clockNow?.() ?? 0;
    const run: QuestRun = {
      ...status.run,
      beat: null,
      variant: 0,
      wait: null,
      done: true,
      endDay: this.storyDay(),
      pending: null,
      pendingCover: null,
      kit: [...(status.run.kit ?? []), { at, rep: { district, delta: -WALK_AWAY_REP } }],
      at: Date.now(),
    };
    const row = this.questRow(q, [`*You walk away from ${q.title}.*`], { beat: null }, undefined, undefined, { run: status.id });
    return this.questTurn(row, status.id, run, 0, false, 0);
  }

  /** A blown job's rep loss before cover. */
  private coverLoss(q: QuestEntry, run: QuestRun): number {
    return q.kind === 'big' ? bigRep(q, this.tierOf(run)) : repDelta(q.tier, this.tierOf(run));
  }

  /** A job's tier from its run (spec §3): the take its outcomes last set (else full), a blown line anywhere, its ALARM. */
  private tierOf(run: QuestRun): Tier {
    return outcomeTier({ take: run.take ?? 'full', blown: run.blown === true, alarm: run.alarm ?? 0 });
  }

  /** A crack card's terminal for run `runId` (null with no words of its length). */
  private crackSetupFor(runId: string, beat: string, c: Choice, ctx: CondCtx): TerminalSetup | null {
    const seed = seedFor(questKey(this.pair(), runId), beat, c.id);
    return crackSetup({ seed, tag: c.crack!, ctx, words: this.deps.quests?.words?.() ?? [], stats: ctx.stats ?? DEFAULT_STATS });
  }

  /** One sentence on what the player carries and how hot they are (missions spec §4); null without a kit or with nothing to say. */
  private kitLineFor(player: Player): string | null {
    const qs = this.deps.quests;
    const kit = qs?.kit?.(player.id);
    const place = qs?.placeId() ?? null;
    return kit ? kitLine(player.name, kit, qs?.decks?.() ?? [], place ? (qs?.districtOf?.(place) ?? null) : null) : null;
  }

  /** A checked choice's odds for the player in `ctx` (missions spec §2): prep modifiers, the beat's stranger's temper, ALARM. */
  private oddsFor(c: Choice, ctx: CondCtx, beat?: Beat, job?: { q: QuestEntry; run: QuestRun; player?: string }) {
    const tf = beat?.stranger?.temper;
    const t = tf ? ctx.flags[tf] : undefined;
    const extra = job ? this.crewExtras(job.q, job.run, c, job.player) : [];
    return oddsOf(c.check!, { stats: ctx.stats ?? DEFAULT_STATS, deck: ctx.deck ?? null, with: ctx.with, alarm: ctx.alarm ?? 0, ctx, temper: t === 'easy' || t === 'hard' ? t : null, ...(extra.length ? { extra } : {}) });
  }

  /**
   * Crew prep's default bonuses (crew spec §2), for a job whose file doesn't read the flag itself: a clean CASE
   * gives +10 on its first checked pick, clean RECORDS +10 on every grid check.
   */
  private crewExtras(q: QuestEntry, run: QuestRun, c: Choice, player = this.pid): { delta: number; label: string }[] {
    if (!isJob(q) || !c.check) return [];
    const out: { delta: number; label: string }[] = [];
    const checkedBefore = run.picks.some((p) => (q.beats.get(p.beat) ?? []).some((b) => b.choices.some((ch) => ch.id === p.choice && ch.check)));
    if (run.flags.cased === 'clean' && !checkedBefore && !mentionsFlag(q, 'cased')) out.push({ delta: 10, label: 'CASED' });
    if (run.flags.records === 'clean' && c.check.grid && !mentionsFlag(q, 'records')) out.push({ delta: 10, label: 'RECORDS' });
    // The arrangement (spec 2026-10-20 §2): her +10 on COOL and WITS while it's in force, unless the choice names her.
    const qs = this.deps.quests;
    if (qs && (c.check.stat === 'cool' || c.check.stat === 'wits') && !c.check.crew.some((x) => x.contact === qs.contact) && this.arrangementNow(player)?.active) {
      out.push({ delta: 10, label: qs.contactName(qs.contact) });
    }
    return out;
  }

  /** What the pick check reads (spec §3): the beat here as one line and its shown choices; null with no quest at a beat. */
  questCheck(player: string): { beat: string; choices: { id: string; line: string }[] } | null {
    const here = this.questHere(player);
    const ctx = this.deps.quests?.ctx(player) ?? null;
    if (!here?.beat || !here.q || !ctx) return null;
    const rctx = this.runCtx(here.q, here.status.run, ctx, player);
    return { beat: oneLine(fillTimes(beatText(here.beat, rctx), this.deps.clockNow?.() ?? 0)), choices: shownChoices(here.beat, rctx).map((c) => ({ id: c.id, line: c.line })) };
  }

  /** Her `[quest]` block for `player`'s quest at a beat here; null without one. */
  private questBlockFor(player: string, shown: boolean): string | null {
    const here = this.questHere(player);
    const ctx = this.deps.quests?.ctx(player) ?? null;
    if (here?.wait && here.q && this.waitIntact(here.q, here.wait)) return questWaitBlock(here.q.title, waitLine(here.wait, this.deps.quests!.placeName));
    const now = this.deps.clockNow?.() ?? 0;
    return here?.q && here.beat && ctx ? fillTimes(questBlock(here.q, here.beat, this.runCtx(here.q, here.status.run, ctx, player), oneLine, shown), now) : null;
  }

  /**
   * A mission row's note (missions spec §3): her opening line on its first beat, with the job and the
   * player; her closing line on its end, with the run's summary. Null: not a mission, or a beat in between.
   */
  private missionNote(row: ChatMessage): string | null {
    const qs = this.deps.quests;
    const qd = row.quest;
    const q = qd ? qs?.book().find((e) => e.id === qd.id) : undefined;
    if (!qs || !qd || !q || !isJob(q)) return null;
    // A row she doesn't answer has no note (a big job's take, scenes, the go hour, walking away; a job's middle beats).
    if (qd.silent) return null;
    // A big job's lines mid-job (big jobs spec §4): after the read, after the gig.
    if (qd.after === 'read') return JOB_AFTER_READ;
    if (qd.after === 'gig' && qd.beat !== null) return JOB_AFTER_GIG;
    const run = qs.status(this.pid).find((s) => s.id === (qd.run ?? q.id) && s.contact === qs.contact)?.run;
    if (qd.beat === null && !qd.waiting) return run ? `${MISSION_CLOSE}\n\n${missionSummary(q, run, qs.decks?.() ?? [], qd.debrief)}` : MISSION_CLOSE;
    // The first beat, before any pick: a wait-resumed beat has no pick either, but comes later.
    if (!qd.pick && qd.beat === q.first && (run?.picks.length ?? 0) === 0) {
      const ctx = qs.ctx(this.pid);
      const name = this.turnPlayer?.name ?? this.pid;
      return `${MISSION_OPEN}\n\n${missionOpenBlock(q, playerKitLine(name, ctx?.stats ?? DEFAULT_STATS, ctx?.deck ?? null, ctx?.heat ?? 0))}`;
    }
    return null;
  }

  /** A mission's beat between the first and the last (missions spec §3): she never answers it, so REGENERATE and RETRY don't either. */
  private silentMissionRow(m: ChatMessage): boolean {
    if (m.role !== 'user' || m.mode !== 'quest' || !m.quest) return false;
    const q = this.deps.quests?.book().find((e) => e.id === m.quest!.id);
    if (q === undefined || !isJob(q)) return false;
    // Rows say whether she answers them (since the silent mark); a small job's rows from before it go by the old rule.
    if (m.quest.silent) return true;
    return q.kind === 'mission' && this.missionNote(m) === null;
  }

  /** What each pair's tabs last heard of quest lines (a tab starts with none). */
  private readonly questShown = new Map<string, string>();

  /**
   * Sends this pair's quest state to its tabs when it changed since they last heard: after a quest
   * move, a rebuild, or any turn (a move on the map, a standing shift, a flag set elsewhere).
   */
  emitQuestState(player = this.pid): void {
    // Her plan's card rides with the story state: a rebuild, a turn or a move can change it (her plans spec §5).
    this.emitPlanCard(player);
    if (!this.deps.quests) return;
    const state = this.questState(player);
    const json = JSON.stringify(state);
    if ((this.questShown.get(player) ?? JSON.stringify(EMPTY_QUEST_STATE)) === json) return;
    this.questShown.set(player, json);
    this.deps.emit({ type: 'quest_state', state }, player);
  }

  /** This turn's reply spends her plan (spec §6). */
  private planSpend = false;

  /** What each pair's tabs last heard of her plan's card. */
  private readonly planShown = new Map<string, string>();

  /** Her plan's card as the page shows it; null: none; undefined: plans don't apply in this room. */
  planCardFor(player: string): PlanCard | null | undefined {
    if (!this.deps.planCard) return undefined;
    const c = this.deps.planCard(player);
    return c ? { name: c.name, going: c.going, meet: c.meet ? `${c.meet.place} at ${c.meet.time}` : null, from: c.from } : null;
  }

  /** Sends `player`'s tabs her plan's card when it changed since they last heard (her plans spec §5). */
  emitPlanCard(player = this.pid): void {
    if (!this.deps.planCard) return;
    const card = this.planCardFor(player) ?? null;
    const json = JSON.stringify(card);
    if ((this.planShown.get(player) ?? 'null') === json) return;
    this.planShown.set(player, json);
    this.deps.emit({ type: 'plan_card', card }, player);
  }

  /** LET HER GO (her plans spec §5): her parting row (your typed last line, if any), then her goodbye on her leave note. The plan stands. */
  async letHerGo(player: string, text = ''): Promise<Result> {
    if (this.turnActive) return this.refusedPlan(player, 'busy');
    if (!this.deps.planCard?.(player)) return this.refusedPlan(player, 'no-plan');
    return this.send(player, text.trim(), 'end', { leave: true, parting: 'her' });
  }

  /** A refused LET HER GO / GO WITH HER: the page hid the card when it was clicked, so it hears it again (final review I1). */
  private refusedPlan(player: string, error: string): Result {
    this.resendPlanCard(player);
    return { ok: false, error };
  }

  /** Sends the card again even if unchanged: the page hid it for an answer that didn't go through. */
  resendPlanCard(player = this.pid): void {
    this.planShown.delete(player);
    this.emitPlanCard(player);
  }

  /**
   * For a regenerate, the stored plan as it stood before the take being replaced spent it: `[raw]`; otherwise `[]`
   * (read the plan as stored). The new take's rebuild comes after this turn's lines are built.
   */
  private planBeforeTake(): [string | null] | [] {
    if (this.target.kind !== 'take') return [];
    const id = this.target.reply.id;
    const rows = this.deps.db.writes().filter((w) => w.kind === 'meta' && w.key === planKey(this.pid));
    const last = rows.at(-1);
    if (!last || last.messageId !== id || last.value !== null) return [];
    return [rows.findLast((w) => w.messageId !== id)?.value ?? null];
  }

  /** GO WITH HER (her plans spec §5): the plan goes, under the reply that made it, so a rewind brings it back. */
  dropPlan(player: string): Result {
    if (this.turnActive) return this.refusedPlan(player, 'busy');
    this.enter(player);
    const { db } = this.deps;
    const plan = parsePlan(db.getMeta(planKey(this.pair())));
    // Only with a card up (mid review M5): a stale tab can't drop a meeting she made while you were apart.
    if (!plan || !this.deps.planCard?.(player)) return this.refusedPlan(player, 'no-plan');
    const from = db.getMessage(this.pair(), plan.from);
    db.withStamp({ messageId: plan.from, take: from?.takes?.index ?? 0 }, () => db.deleteMeta(planKey(this.pair())));
    this.emitPlanCard(player);
    return OK;
  }

  /** Her leave note for a parting row: where her plan sends her, as the card names it. */
  private herLeaveNote(): string {
    const c = this.deps.planLeave?.(this.pid) ?? this.deps.planCard?.(this.pid);
    return herLeaveInstructions(c?.going ?? 'where you said', c?.meet ?? null);
  }

  /** A tab joined: it starts from nothing, so the next change reaches it. Returns what it should show now. */
  questStateFor(player: string): QuestState {
    const state = this.questState(player);
    this.questShown.set(player, JSON.stringify(state));
    return state;
  }

  /**
   * Writes a quest row and its run (stamped to the row: the write log undoes both together), then her
   * reaction. `base` replaces the row's turn cost (a job's pick costs its own minutes, small jobs spec §3).
   */
  private async questTurn(row: ChatMessage, id: string, run: QuestRun, minutes: number, reply = true, base?: number, after?: () => void): Promise<Result> {
    this.keepShownTake();
    // A row she won't answer says so, so the tabs don't wait for her (she'd stay "transmitting").
    if (!reply && row.quest) row.quest.silent = true;
    // Time tokens ({time +40m}) read the hour this row stands at (feedback 2026-10-19), insertTurnRow's stamp.
    const now = this.deps.clockNow?.() ?? null;
    if (now !== null) row.text = fillTimes(row.text, now + (base ?? TURN_COST.quest) + minutes);
    this.insertTurnRow(row, minutes, base);
    this.deps.db.setMeta(questKey(this.pair(), id), JSON.stringify(run));
    after?.();
    this.emitPair({ type: 'message', message: row });
    this.emitQuestState();
    // A mission's beats between the first and the last play without her (missions spec §3): the room follows now.
    if (!reply) this.flushLiveClock();
    return reply ? this.runTurn(row) : OK;
  }

  /** QUEST (spec §3): starts a quest open here with its first beat. A string is why not. */
  async startQuest(player: string, id: string): Promise<Result | string> {
    if (this.turnActive) return 'wait for her to finish';
    if (!this.ready) return NO_LINK_NOTICE;
    this.enter(player);
    const q = this.questState(this.pid).open.some((o) => o.id === id) ? this.deps.quests!.book().find((e) => e.id === id) : undefined;
    const ctx = this.deps.quests?.ctx(this.pid) ?? null;
    if (!q || !ctx) return "that quest isn't open here";
    // The arrangement's nights cap (spec 2026-10-20 §2): greyed in the list, refused here.
    if (this.capped(q, this.pid)) return `${this.deps.quests!.contactName(this.deps.quests!.contact).toLowerCase()} is done tonight`;
    // A job (small jobs spec §1): keyed by its day, its draws and pay made now, from the run's key, before its first beat is chosen.
    const mission = isJob(q);
    const day = this.storyDay();
    const runId = mission ? jobRunId(q, day) : q.id;
    const key = questKey(this.pair(), runId);
    const draws = mission ? drawsFor(q, key) : {};
    // Crew prep on this job tonight (crew spec §2) joins the run's flags beside its draws.
    const flags = mission ? { ...draws, ...(this.deps.quests?.crewState?.()?.prep[runId] ?? {}) } : {};
    const pay = mission ? payFor(q, key) : null;
    const job: Partial<QuestRun> = mission ? { draws, alarm: 0, day, startDeck: ctx.deck?.id ?? null, ...(pay !== null ? { pay } : {}) } : {};
    // A big job (big jobs spec §1): its night started now; the ask marks the first places.
    if (q.kind === 'big') job.big = { section: 'legwork', started: this.deps.clockNow?.() ?? 0, marks: [], visited: [], clues: [] };
    const rctx = this.runCtx(q, { flags, alarm: 0 } as QuestRun, ctx, this.pid);
    const chosen = chooseVariant(q, q.first, rctx);
    if (!chosen) return "that quest isn't open here";
    const { beat, variant } = chosen;
    const drawn = this.drawFace(beat.stranger, {});
    const row = this.questRow(q, [beatText(beat, rctx)], { beat }, undefined, drawn.face, mission ? { run: runId } : {});
    return this.questTurn(row, runId, { beat: beat.id, variant, wait: null, picks: [], flags: { ...flags }, done: false, at: Date.now(), ...(drawn.faces ? { faces: drawn.faces } : {}), ...job }, 0);
  }

  /**
   * A card, or CONFIRM on a held line (spec §3): one row of the pick line, the outcome and the next
   * beat. `said` is the player's own line when CONFIRM sent it; `moves` a crack card's terminal moves. A string is why not.
   */
  async chooseQuest(player: string, o: { id: string; beat: string; choice: string; said?: string; moves?: CrackPick['moves']; read?: [string, string, string]; gig?: { result: GigResult; seed: number } }): Promise<Result | string> {
    if (this.turnActive) return 'wait for her to finish';
    if (!this.ready) return NO_LINK_NOTICE;
    this.enter(player);
    const passed = 'that choice has passed';
    // READ IT NOW (big jobs spec §3): from legwork, with nothing at a beat here.
    if (o.choice === READ_NOW) {
      const h = this.questHere(this.pid);
      const lw = h && !h.wait ? null : this.legworkRun();
      return lw && lw.q.id === o.id ? this.toRead(lw.q, lw.status, "*You've seen enough. Time to say what's going on.*") : passed;
    }
    const here = this.questHere(this.pid);
    // The read (big jobs spec §3): three words from the bank.
    if (o.choice === READ) {
      if (!here?.q || here.q.kind !== 'big' || here.q.id !== o.id || here.status.run.beat !== READ_BEAT || !o.read) return passed;
      return this.readPick(here.q, here.status, o.read);
    }
    const ctx0 = this.deps.quests?.ctx(this.pid) ?? null;
    if (!here || !here.q || !here.beat || !ctx0 || here.q.id !== o.id || here.beat.id !== o.beat) return passed;
    const { q, beat, status } = here;
    const ctx = this.runCtx(q, status.run, ctx0, this.pid);
    if (status.run.pendingCover) return o.choice === BURNER || o.choice === FALL_GUY || o.choice === TAKE ? this.coverPick(q, status, o.choice) : passed;
    const pending = status.run.pending ?? null;
    if (pending ? o.choice !== REROLL && o.choice !== TAKE : o.choice === REROLL || o.choice === TAKE) return passed;
    // A parked check resolves whatever its own roll did to `needs` (its heat, a dead deck): the cards are already up.
    const choice = pending ? beat.choices.find((c) => c.id === pending.choice) : shownChoices(beat, ctx).find((c) => c.id === o.choice);
    if (choice && isJob(q)) {
      if (choice.gig && !pending) return this.gigPick(q, beat, status, ctx, choice, o);
      if (choice.crack && !pending) return this.crackPick(q, beat, status, ctx, choice, o);
      if (choice.check) return this.checkedPick(q, beat, status, ctx, choice, o);
      const outcome = q.outcomes.get(choice.to);
      if (!outcome) return passed;
      const t = tagsOf(choice, status.run.flags);
      const line = o.said?.trim() || pickLine(choice.line);
      return this.jobStep({ q, status, ctx, outcome, texts: [line], pick: { choice: choice.id, line }, record: { beat: beat.id, choice: choice.id }, minutes: t.minutes, kitBefore: status.run.kit ?? [], alarm: alarmPlus(status.run.alarm, t.alarm), flags: t.flags });
    }
    const outcome = choice ? q.outcomes.get(choice.to) : undefined;
    if (!choice || !outcome) return passed;
    const { flags, minutes } = tagsOf(choice, status.run.flags);
    const line = o.said?.trim() || pickLine(choice.line);
    const step = this.followOutcome(q, outcome, { ...ctx, flags: { ...ctx.flags, ...flags } }, this.rowClock(minutes));
    const drawn = this.drawFace(step.beat?.stranger ?? null, status.run.faces ?? {});
    const row = this.questRow(q, [line, ...step.texts], step, { choice: choice.id, line }, drawn.face);
    const run: QuestRun = { ...step.run, picks: [...status.run.picks, { beat: beat.id, choice: choice.id }], flags, at: Date.now(), ...((drawn.faces ?? status.run.faces) ? { faces: drawn.faces ?? status.run.faces } : {}), ...(status.run.kit?.length ? { kit: status.run.kit } : {}) };
    // The arrangement (spec 2026-10-20 §1): the deal is written under this row's stamp, so rewind takes it back.
    const deal = outcome.effects.arrangement;
    const dealFor = this.pid;
    const since = this.deps.clockNow?.() ?? 0;
    const after = deal ? () => this.deps.db.setMeta(arrangementKey(dealFor), JSON.stringify({ role: 'operator', ...deal, since } satisfies Arrangement)) : undefined;
    return this.questTurn(row, status.id, run, minutes, true, undefined, after);
  }

  /**
   * A mission's checked pick, or REROLL / TAKE IT on one that failed (missions spec §3): roll, and on a
   * fail with EDGE left park it (no row) for the reroll cards, unless it's red; else the pick line, the
   * result line and what follows (jobStep), with the kit events (deck heat, a dead deck, +1 heat and ALARM on a fail).
   */
  private async checkedPick(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, choice: Choice, o: { choice: string; said?: string }): Promise<Result> {
    const run0 = status.run;
    const pending = run0.pending ?? null;
    const deck = ctx.deck ?? null;
    const district = this.districtOf(q);
    const odds = pending ? { stat: pending.stat, chance: pending.chance } : this.oddsFor(choice, ctx, beat, { q, run: run0 });
    const events: KitEvent[] = [];
    const t = tagsOf(choice, run0.flags);
    const at = this.jobClock(q, t.minutes);
    const heat = (n: number): KitEvent => ({ at, heat: n, ...(district ? { district } : {}) });
    let rolls = pending ? pending.rolls : [];
    let died = false;
    if (o.choice !== TAKE) {
      if (pending) events.push({ at, edge: -1 });
      const r = Math.min(100, Math.max(1, Math.round(this.deps.roll?.() ?? 1 + Math.floor(Math.random() * 100))));
      rolls = [...rolls, r];
      // The deck's heat on every grid use, pass or fail; a fragile deck can die on a bad roll.
      if (choice.check!.grid && deck && deck.heat) events.push(heat(deck.heat));
      if (deckDies(deck, choice.check!.grid, r)) {
        events.push({ at, deck: null });
        died = true;
      }
    }
    const pass = rolls.length > 0 && rolls[rolls.length - 1] <= odds.chance && o.choice !== TAKE;
    const kitBefore = [...(run0.kit ?? []), ...events];
    const edgeLeft = this.deps.quests?.kit?.(this.pid).edgeLeft ?? 0;
    // A red check is one shot (small jobs spec §3): no REROLL, whatever EDGE is left.
    if (!pass && o.choice !== TAKE && !choice.check!.red && edgeLeft - (pending ? 1 : 0) > 0) {
      // Parked: the cards turn into REROLL / TAKE IT; nothing is posted until it resolves.
      this.deps.db.setMeta(questKey(this.pair(), status.id), JSON.stringify({ ...run0, kit: kitBefore, pending: { beat: beat.id, choice: choice.id, stat: odds.stat, chance: odds.chance, rolls }, at: Date.now() }));
      this.emitQuestState();
      return OK;
    }
    const outcome = q.outcomes.get(pass ? choice.to : choice.fail!);
    if (!outcome) return { ok: false, error: 'that choice has passed' };
    const roll: Roll = { stat: odds.stat, chance: odds.chance, rolls, pass };
    const line = o.said?.trim() || pickLine(choice.line);
    const texts = [line, rollLine(odds, pass), ...(died ? [`*The ${deck!.name} dies.*`] : [])];
    return this.jobStep({
      q,
      status,
      ctx,
      outcome,
      texts,
      pick: { choice: choice.id, line, roll },
      record: { beat: beat.id, choice: choice.id, roll },
      minutes: t.minutes,
      kitBefore: [...kitBefore, ...(pass ? [] : [heat(1)])],
      alarm: alarmPlus(run0.alarm, t.alarm + (pass ? 0 : 1)),
      flags: t.flags,
    });
  }

  /**
   * A crack card (small jobs spec §4): the terminal rebuilt from its seed, the sent moves scored on it.
   * Cracked: the pass outcome; locked out or walked away: the fail outcome and ALARM +1.
   */
  private async crackPick(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, choice: Choice, o: { choice: string; said?: string; moves?: CrackPick['moves'] }): Promise<Result | string> {
    // No moves: the terminal hasn't been played (a typed line, a stale tab). An empty list is a walk-away.
    if (o.moves === undefined) return 'open the terminal to crack it';
    const setup = this.crackSetupFor(status.id, beat.id, choice, ctx);
    if (!setup) return 'that terminal has no words to show';
    const moves = o.moves;
    const played = playTerminal(makeTerminal(setup), moves);
    const granted = played.state === 'granted';
    const outcome = q.outcomes.get(granted ? choice.to : choice.fail!);
    if (!outcome) return 'that choice has passed';
    const t = tagsOf(choice, status.run.flags);
    const line = o.said?.trim() || pickLine(choice.line);
    const crack: CrackPick = { moves, state: granted ? 'granted' : 'locked', tries: played.log.filter((l) => l.likeness !== undefined).length };
    return this.jobStep({
      q,
      status,
      ctx,
      outcome,
      texts: [line, crackLine(granted)],
      pick: { choice: choice.id, line },
      record: { beat: beat.id, choice: choice.id, crack },
      minutes: t.minutes,
      kitBefore: status.run.kit ?? [],
      alarm: alarmPlus(status.run.alarm, t.alarm + (granted ? 0 : 1)),
      flags: t.flags,
    });
  }

  /**
   * A job's pick lands on `outcome` (small jobs spec §3): the row (the pick's texts, the outcome, the next
   * beat) costs the job's minutes plus the choice's; the outcome's effects join the kit. At `→ end` the
   * tier is settled: blown with cover held parks for the cover cards, else the job finishes.
   */
  private async jobStep(o: {
    q: QuestEntry;
    status: QuestStatus;
    ctx: CondCtx;
    outcome: Outcome;
    texts: string[];
    pick: { choice: string; line: string; roll?: Roll };
    record: QuestRun['picks'][number];
    minutes: number;
    kitBefore: KitEvent[];
    alarm: number;
    flags: Record<string, string>;
    /** Her line answers this row though the job goes on (big jobs: after the gig). */
    answer?: boolean;
    /** Which of her mid-job lines it is (her note for it). */
    after?: 'gig';
    /** A big job's own state after this pick (its gig, its section). */
    big?: Partial<BigRun>;
  }): Promise<Result> {
    const { q, status } = o;
    const run0 = status.run;
    const at = this.jobClock(q, o.minutes);
    const step = this.followOutcome(q, o.outcome, { ...o.ctx, flags: { ...o.ctx.flags, ...o.flags }, alarm: o.alarm }, at);
    const effect = effectEvent(o.outcome.effects, at, { pay: run0.pay ?? null, district: this.districtOf(q) });
    const drawn = this.drawFace(step.beat?.stranger ?? null, run0.faces ?? {});
    const faces = drawn.faces ?? run0.faces;
    const run: QuestRun = {
      ...run0,
      ...step.run,
      picks: [...run0.picks, o.record],
      flags: o.flags,
      alarm: o.alarm,
      ...withTake(run0, o.outcome),
      ...withBig(run0, o.outcome, o.big),
      kit: [...o.kitBefore, ...(effect ? [effect] : [])],
      pending: null,
      at: Date.now(),
      ...(faces ? { faces } : {}),
    };
    const texts = [...o.texts, ...step.texts];
    const cost = stepMinutes(q) + o.minutes;
    if (!step.run.done) return this.questTurn(this.questRow(q, texts, step, o.pick, drawn.face, { run: status.id, ...(o.after ? { after: o.after } : {}) }), status.id, run, cost, o.answer === true, 0);
    const end = { outcome: o.outcome.id, text: texts.filter((t) => t !== '').join('\n\n'), pick: o.pick, minutes: cost };
    const held = this.deps.quests?.kit?.(this.pid).cover;
    // A trust job's loss can't be covered (Intake board spec §2): no cover cards, nothing spent.
    if (this.tierOf(run) === 'blown' && !q.trust && held && (held.burner > 0 || held['fall-guy'] > 0)) {
      // Parked before its row (plan ruling 5): the run stays at its beat, with this pick's events, until a cover card.
      this.deps.db.setMeta(questKey(this.pair(), status.id), JSON.stringify({ ...run, beat: run0.beat, variant: run0.variant, wait: run0.wait, done: false, pendingCover: end }));
      this.emitQuestState();
      return OK;
    }
    return this.finishJob(q, status.id, run, end, null);
  }

  /**
   * A job's end (small jobs spec §2, §5): the rep change for its tier (cover softening a blown one), the
   * cover and rep events, the finished run and its debrief. Also the preview under the cover cards (cover null).
   */
  private jobEnd(q: QuestEntry, run: QuestRun, end: NonNullable<QuestRun['pendingCover']>, cover: CoverId | null, player: string): { done: QuestRun; debrief: Debrief } {
    const tier = this.tierOf(run);
    const district = this.districtOf(q) ?? 'unknown';
    const at = (this.deps.clockNow?.() ?? 0) + end.minutes;
    // A trust stake (Intake board spec §2) moves her standing instead of rep, and cover never softens it.
    const trust = this.trustDelta(q, tier);
    // A big job's stake (big jobs spec §4), else the small job's rep for its tier.
    const delta = trust !== null ? 0 : coveredLoss(q.kind === 'big' ? bigRep(q, tier) : repDelta(q.tier, tier), tier === 'blown' ? cover : null);
    const extra: KitEvent[] = [];
    if (cover) extra.push({ at, cover: { id: cover, delta: -1 }, ...(cover === 'fall-guy' && fallGuyFee(run.pay) ? { sol: -fallGuyFee(run.pay) } : {}) });
    if (delta !== 0) extra.push({ at, rep: { district, delta } });
    const before = this.deps.quests?.kit?.(player).rep[district] ?? 0;
    // The arrangement's retainer (spec 2026-10-20 §2): on the night's first job with her while it's in force,
    // from the sol held before this job pays; short, it isn't charged (her trust takes it, in finishJob).
    const deal = this.arrangementNow(player);
    const qs = this.deps.quests;
    const owes = deal !== null && deal.active && deal.done === 0 && q.kind === 'mission' && ownedBy(q) !== qs?.contact;
    const paid = owes && (qs?.kit?.(player).sol ?? 0) >= deal!.a.retainer;
    const retainer: KitEvent[] = paid ? [{ at, sol: -deal!.a.retainer }] : [];
    const done: QuestRun = { ...run, beat: null, variant: 0, wait: null, done: true, endDay: this.storyDay(), pending: null, pendingCover: null, kit: [...(run.kit ?? []), ...extra, ...retainer], at: Date.now() };
    const preview = trust !== null && trust !== 0 ? (this.deps.trust?.preview(player, trust) ?? null) : null;
    const trustLine = trust === null ? undefined : preview && preview.before !== preview.after ? { name: preview.name, before: preview.before, after: preview.after } : null;
    // Her closing line hears any move, word change or not (a clamped one isn't a move).
    const moved = preview && preview.moved !== 0 ? (preview.moved > 0 ? 'up' : 'down') : undefined;
    // The debrief's sol is the job's own; the retainer has its own line.
    const debrief = buildDebrief({ q, run: { ...done, kit: [...(run.kit ?? []), ...extra] }, tier, district, before, delta, cover, ...(trustLine !== undefined ? { trust: trustLine } : {}), ...(moved ? { trustMoved: moved } : {}) });
    if (owes) debrief.retainer = { name: qs!.contactName(qs!.contact), amount: deal!.a.retainer, paid };
    return { done, debrief };
  }

  /** A job's trust move for its tier: +W clean, −L blown, 0 messy; null when its stake is rep. */
  private trustDelta(q: QuestEntry, tier: Tier): number | null {
    if (!q.trust) return null;
    return tier === 'clean' ? q.trust[0] : tier === 'blown' ? -q.trust[1] : 0;
  }

  /** A cover card on a parked blown job (small jobs spec §5): one held, or TAKE IT. A string is why not. */
  private async coverPick(q: QuestEntry, status: QuestStatus, choice: string): Promise<Result | string> {
    const end = status.run.pendingCover!;
    const cover: CoverId | null = choice === BURNER ? 'burner' : choice === FALL_GUY ? 'fall-guy' : null;
    const held = this.deps.quests?.kit?.(this.pid).cover;
    if (cover && !(held && held[cover] > 0)) return 'that choice has passed';
    if (!q.outcomes.has(end.outcome)) return 'that choice has passed';
    return this.finishJob(q, status.id, status.run, end, cover);
  }

  /**
   * A job's last row (small jobs spec §2, §5, §6): the rep change for its tier (cover softening a blown
   * one), the debrief on the row, and her closing turn.
   */
  private async finishJob(q: QuestEntry, runId: string, run: QuestRun, end: NonNullable<QuestRun['pendingCover']>, cover: CoverId | null): Promise<Result> {
    const { done, debrief } = this.jobEnd(q, run, end, cover, this.pid);
    const row = this.questRow(q, [end.text], { beat: null }, end.pick, undefined, { run: runId, debrief });
    const trust = this.trustDelta(q, this.tierOf(run));
    const player = this.pid;
    const unpaid = debrief.retainer?.paid === false;
    // Written after the run, under the row's stamp, so rewind takes it back with the row: the trust stake, and an unpaid retainer's −1.
    const after =
      trust || unpaid
        ? () => {
            if (trust) this.deps.trust?.move(player, trust, `Night job: ${q.title}, ${this.tierOf(run)}`, row.id);
            if (unpaid) this.deps.trust?.move(player, -1, 'Unpaid retainer', row.id);
          }
        : undefined;
    return this.questTurn(row, runId, done, end.minutes, true, 0, after);
  }

  /**
   * A beat's stranger's face (stranger faces spec §5): a fixed id; for `any <tag>`, the face this run
   * already drew for that name while it still has the tag, else a new draw; with no `face:` line, the
   * face drawn for that name before. `faces` is the run's map with it recorded (undefined: unchanged).
   */
  private drawFace(stranger: Beat['stranger'], faces: Record<string, string>): { face?: string; faces?: Record<string, string> } {
    if (!stranger) return {};
    const lib = this.deps.quests?.extras?.() ?? [];
    const before = faces[stranger.name];
    const f = stranger.face;
    let face: string | undefined;
    if (f === null) face = before;
    else if ('id' in f) face = f.id;
    else if (before && lib.some((e) => e.id === before && e.tags.includes(f.tag))) face = before;
    else {
      const pool = lib.filter((e) => e.tags.includes(f.tag)).map((e) => e.id).sort();
      face = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : undefined;
    }
    if (face === undefined) return {};
    return { face, ...(face !== before ? { faces: { ...faces, [stranger.name]: face } } : {}) };
  }

  /** The clock a quest row about to be stored will carry (insertTurnRow's stamp). */
  private rowClock(extraMinutes: number): number {
    return (this.deps.clockNow?.() ?? 0) + TURN_COST.quest + extraMinutes;
  }

  /** The clock a job's pick row will carry (small jobs spec §3): the job's minutes plus the choice's, not the quest row's cost. */
  private jobClock(q: QuestEntry, extraMinutes: number): number {
    return (this.deps.clockNow?.() ?? 0) + stepMinutes(q) + extraMinutes;
  }

  /**
   * Where an outcome leads (quest waits spec §3): its text, then the next beat (its version chosen now),
   * or a wait that parks the run, or the end. The run fields it settles; picks, flags and `at` are the caller's.
   */
  private followOutcome(q: QuestEntry, outcome: Outcome, ctx: CondCtx, clock: number): { texts: string[]; beat: Beat | null; run: Pick<QuestRun, 'beat' | 'variant' | 'wait' | 'done'> } {
    if (outcome.to === 'end') return { texts: [outcome.text], beat: null, run: { beat: null, variant: 0, wait: null, done: true } };
    // A big job's ask or scene hands back to legwork (big jobs spec §2): no beat, not over.
    if (outcome.to === 'back') return { texts: [outcome.text], beat: null, run: { beat: null, variant: 0, wait: null, done: false } };
    if (outcome.wait) return { texts: [outcome.text], beat: null, run: { beat: null, variant: 0, wait: startWait(outcome, clock), done: false } };
    const chosen = chooseVariant(q, outcome.to, ctx);
    return { texts: [outcome.text, chosen ? beatText(chosen.beat, ctx) : ''], beat: chosen?.beat ?? null, run: { beat: chosen?.beat.id ?? null, variant: chosen?.variant ?? 0, wait: null, done: chosen === null } };
  }

  /** A quest row: the shown texts, and the snapshot of where it left the quest. */
  private questRow(q: QuestEntry, texts: string[], step: { beat: Beat | null; run?: Pick<QuestRun, 'wait'> }, pick?: { choice: string; line: string; roll?: Roll }, face?: string, job: Pick<NonNullable<ChatMessage['quest']>, 'run' | 'debrief' | 'after'> = {}): ChatMessage {
    return {
      id: crypto.randomUUID(),
      role: 'user',
      text: texts.filter((t) => t !== '').join('\n\n'),
      toolLines: [],
      ts: Date.now(),
      status: 'ok',
      mode: 'quest',
      quest: {
        id: q.id,
        title: q.title,
        beat: step.beat?.id ?? null,
        ...(pick ? { pick } : {}),
        ...(step.run?.wait ? { waiting: true as const } : {}),
        ...(step.beat?.stranger ? { stranger: { name: step.beat.stranger.name, voice: step.beat.stranger.voice, ...(face ? { face } : {}) } } : {}),
        ...job,
      },
    };
  }

  /**
   * Where a WAIT should stop (final review I1): the hour the quest here waits for, while you're where it
   * happens and it's still ahead, so waiting at the Intake brings the Sentinel rather than skipping past
   * him into the missed path. Null: nothing to stop for.
   */
  questWaitStop(player: string): number | null {
    const qs = this.deps.quests;
    const here = qs ? this.questHere(player) : null;
    const w = here?.wait;
    if (!qs || !w || !this.waitIntact(here!.q, w) || w.ready) return null;
    const now = this.deps.clockNow?.() ?? null;
    if (now === null || now >= w.from) return null;
    if (w.at !== null && w.at !== qs.placeId()) return null;
    return w.from;
  }

  /**
   * A parked run whose wait is due (or missed) plays now (quest waits spec §3): after a turn, on WAIT, on
   * CONTINUE (`ready`). Only while idle, only in the quest's room, at most one row. Null: nothing to play.
   */
  async playDueQuest(player: string, o: { ready?: boolean } = {}): Promise<Result | null> {
    const qs = this.deps.quests;
    if (!qs || this.turnActive || !this.ready) return null;
    this.enter(player);
    const here = this.questHere(this.pid);
    const ctx = qs.ctx(this.pid);
    // Nothing at a beat or waiting here: a big job's legwork may have a scene or its go hour (big jobs spec §2–§3).
    if (!here && ctx) return this.playLegwork();
    if (!here?.wait || !ctx) return null;
    // Another quest parked here, not due (or changed): legwork goes on around it.
    if (!here.q || !this.waitIntact(here.q, here.wait)) return this.playLegwork();
    const { q, wait, status } = here;
    const due = waitDue(wait, { now: this.deps.clockNow?.() ?? 0, placeId: qs.placeId(), ready: o.ready === true, comms: this.commsNow(this.pid)?.on === true });
    if (due === 'wait') return this.playLegwork();
    const target = due === 'due' ? wait.to : wait.else!;
    const clock = this.rowClock(0);
    const outcome = q.outcomes.get(target);
    let step: ReturnType<ChatRelay['followOutcome']>;
    if (outcome) step = this.followOutcome(q, outcome, ctx, clock);
    else {
      const chosen = chooseVariant(q, target, ctx);
      if (!chosen) return null;
      step = { texts: [beatText(chosen.beat, ctx)], beat: chosen.beat, run: { beat: chosen.beat.id, variant: chosen.variant, wait: null, done: false } };
    }
    const drawn = this.drawFace(step.beat?.stranger ?? null, status.run.faces ?? {});
    const mission = isJob(q);
    const row = this.questRow(q, step.texts, step, undefined, drawn.face, mission ? { run: status.id } : {});
    // A mission's outcome reached by its wait (or its missed path) does what it says to the kit, as a pick's would.
    const effect = mission && outcome ? effectEvent(outcome.effects, clock, { pay: status.run.pay ?? null, district: this.districtOf(q) }) : null;
    const kit = [...(status.run.kit ?? []), ...(effect ? [effect] : [])];
    const run: QuestRun = { ...status.run, ...step.run, ...(mission && outcome ? withTake(status.run, outcome) : {}), at: Date.now(), ...(drawn.faces ? { faces: drawn.faces } : {}), ...(kit.length ? { kit } : {}) };
    // A job ended by its wait settles its tier and debrief like a pick's ending; no cover is offered there.
    if (mission && step.run.done && outcome) return this.finishJob(q, status.id, run, { outcome: outcome.id, text: step.texts.filter((t) => t !== '').join('\n\n'), minutes: TURN_COST.quest }, null);
    return this.questTurn(row, status.id, run, 0, !mission || step.run.done);
  }

  /** `place`: a text's (deck spec §2) — where she is now; only the deck retries a text, and it always says where. */
  async retry(player: string, userMessageId: string, place?: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);

    const existing = this.line(userMessageId);
    if (!existing || existing.role !== 'user') return { ok: false, error: 'unknown message' };
    if (existing.mode === 'text') {
      if (place === undefined) return { ok: false, error: 'text' };
      this.textPlace = place;
    }
    if (this.silentMissionRow(existing)) return { ok: false, error: 'mission-beat' };

    this.deps.db.updateMessage(this.pair(), existing.id, { status: 'ok' });
    const userMessage: ChatMessage = { ...existing, status: 'ok' };
    this.emitPair({ type: 'message', message: userMessage });

    return this.runTurn(userMessage);
  }

  private async runTurn(userMessage: ChatMessage, target: Target = { kind: 'new' }): Promise<Result> {
    this.turnActive = true;
    this.target = target;
    // The story clock for this turn: the line's stamp; keep going carries on from what the reply had already passed.
    this.turnBase = userMessage.clock ?? null;
    this.turnPassed = target.kind === 'continue' && this.turnBase !== null ? Math.max(0, (target.reply.clock ?? this.turnBase) - this.turnBase) : 0;
    this.turnPlayer = this.deps.players.resolve(this.pid);
    this.turnMode = userMessage.mode;
    this.replacing = target.kind === 'take' ? target.reply.id : null;
    let ok = false;
    let reply: { id: string; take: number } | null = null;
    try {
      await this.deps.beforeTurn?.();
      const model = await this.currentModel();
      const result = await this.consumeStream(userMessage, model);
      // The reply this turn wrote, and the take its writes were stamped with.
      const stamp = this.deps.db.stamp();
      if (this._activeMessageId !== null && stamp.messageId === this._activeMessageId) reply = { id: this._activeMessageId, take: stamp.take ?? 0 };
      ok = result.ok;
      return result;
    } catch (err) {
      if (target.kind === 'new') return this.handleTurnError(err, userMessage);
      // A regenerate / keep going that failed: her reply goes back as it was; the player's line is fine.
      this.restoreExisting();
      return this.classifyError(err);
    } finally {
      // A turn that never opened her reply still lets the room follow its line.
      this.flushLiveClock();
      this.turnActive = false;
      this.turnMode = null;
      this.replacing = null;
      this.turnOffer = [];
      this.turnBase = null;
      this.turnPassed = 0;
      this._activeMessageId = null;
      this.deps.db.setReplyStamp(null);
      this.target = { kind: 'new' };
      this.before = null;
      // Her sign-off is in: the line drops (under her reply's stamp), and you're solo.
      const dropped = this.dropLine && ok ? this.commsNow(this.pid) : null;
      if (dropped?.on) {
        this.deps.db.setMeta(commsKey(this.pid), JSON.stringify({ on: false, at: dropped.at } satisfies CommsState));
        this.deps.goSolo?.();
      } else if (ok && userMessage.leave && (userMessage.parting === 'her' || this.hungUpBy(userMessage.id))) {
        // HANG UP (final review I1), or LET HER GO (her plans §5): her sign-off is in, and you're solo — no STAY
        // that would leave her beside you.
        this.deps.goSolo?.();
      }
      this.dropLine = false;
      // Her plan was over and her reply said what it had to (spec §6): it goes, under her reply's take, so a
      // regenerate brings it back for the new take to spend (final review M-a).
      if (ok && this.planSpend && reply) {
        const take = this.deps.db.getMessage(this.pair(), reply.id)?.takes?.index ?? 0;
        this.deps.db.withStamp({ messageId: reply.id, take }, () => {
          this.deps.db.deleteMeta(planKey(this.pid));
          this.deps.db.deleteMeta(planSeenKey(this.pid));
        });
        this.emitPlanCard();
      }
      this.planSpend = false;
      // A promised text (promised texts spec §5) spends its promise under the take that said it (mid review I1):
      // a REGEN or a swipe keeps it spent, and a rewind past her text brings it back.
      if (ok && reply && userMessage.promised) {
        this.deps.db.withStamp({ messageId: reply.id, take: reply.take }, () => this.deps.db.deleteMeta(promiseKey(this.pid)));
        this.deps.db.deleteMeta(promiseTriesKey(this.pid));
      }
      this.deps.onTurnEnd?.({ player: this.pid, mode: userMessage.mode, ok, ...(userMessage.leave ? { leave: true } : {}), reply: ok ? reply : null });
      this.emitQuestState();
      // A quest waiting for this moment (her reply crossed the hour, a move arrived) plays now (quest waits spec §3).
      // Not after OOC (an aside) or a goodbye (END SCENE / LEAVE): the beat waits for the next line in character, or WAIT.
      if (ok && userMessage.mode !== 'ooc' && userMessage.mode !== 'end' && userMessage.mode !== 'text') void this.playDueQuest(this.pid).catch(() => {});
    }
  }

  // ── Message controls ──────────────────────────────────────────────────────────────────────

  private latest(feed: 'scene' | 'text' = 'scene'): ChatMessage | undefined {
    // A feed's newest line: the room's controls act on the scene, the deck's on texts (deck controls spec §2).
    return this.deps.db.allMessages(this.pair()).findLast((m) => (feed === 'text' ? m.mode === 'text' && !m.promised : m.mode !== 'text'));
  }

  /**
   * The newest line on screen, which the message controls act on: a greet line is never shown, so
   * one left behind (her greeting deleted) doesn't hide the line before it.
   */
  private latestShown(feed: 'scene' | 'text' = 'scene'): ChatMessage | undefined {
    if (feed === 'text') return this.latest('text');
    return this.deps.db
      .allMessages(this.pair())
      .findLast((m) => !(m.role === 'user' && m.mode === 'greet') && m.mode !== 'scene' && m.mode !== 'text');
  }

  /** A line the message controls may act on: the opening scene is set at NEW GAME and never one. */
  private line(id: string): ChatMessage | undefined {
    const m = this.deps.db.getMessage(this.pair(), id);
    return m?.mode === 'scene' ? undefined : m;
  }

  /** The line the player wrote that `reply` answers. */
  private promptOf(reply: ChatMessage): ChatMessage | undefined {
    const byId = reply.replyTo ? this.deps.db.getMessage(this.pair(), reply.replyTo) : undefined;
    if (byId) return byId;
    const all = this.deps.db.allMessages(this.pair());
    return all.slice(0, all.findIndex((m) => m.id === reply.id)).reverse().find((m) => m.role === 'user');
  }

  /** Regenerate: a new take of her latest reply, or — when the story ends on the player's line — a reply to it. */
  /** `place`: for a text, where she is now (final review I2: a REGEN mustn't reuse a stale place). */
  async regenerate(player: string, id: string, place?: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    const m = this.line(id);
    if (!m) return { ok: false, error: 'unknown' };
    if (m.mode === 'text' && place !== undefined) this.textPlace = place;
    if (this.latestShown(feedOf(m))?.id !== id) return { ok: false, error: 'not-latest' };
    if (this.silentMissionRow(m)) return { ok: false, error: 'mission-beat' };
    if (m.role === 'user') {
      if (m.status !== 'ok') this.deps.db.updateMessage(this.pair(), id, { status: 'ok' });
      const prompt = { ...m, status: 'ok' as const };
      this.emitPair({ type: 'message', message: prompt });
      return this.runTurn(prompt);
    }
    const prompt = this.promptOf(m);
    if (!prompt) return { ok: false, error: 'unknown' };
    this.deps.onTakeReplaced?.(id);
    return this.runTurn(prompt, { kind: 'take', reply: m });
  }

  /** Shows another take of her latest reply; that take is what she sees next. */
  async swipe(player: string, id: string, index: number): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    const shown = this.deps.db.getMessage(this.pair(), id);
    if (!shown) return { ok: false, error: 'unknown' };
    if (this.latestShown(feedOf(shown))?.id !== id) return { ok: false, error: 'not-latest' };
    const t = this.deps.db.getTakes(this.pair(), id);
    if (!t) return { ok: false, error: 'unknown' };
    const i = Math.max(0, Math.min(Math.trunc(index), t.takes.length - 1));
    this.deps.onTakeReplaced?.(id);
    this.deps.db.setTakes(this.pair(), id, t.takes, i);
    // The shown take's time: her line's clock plus what that take passed.
    const reply = this.deps.db.getMessage(this.pair(), id)!;
    const line = reply.replyTo ? this.deps.db.getMessage(this.pair(), reply.replyTo) : null;
    const clock = line?.clock !== undefined ? { clock: line.clock + (t.takes[i].passed ?? 0) } : {};
    this.deps.db.updateMessage(this.pair(), id, { status: t.takes[i].lost ? 'lost' : 'ok', ...clock });
    if (line?.clock !== undefined) this.deps.onClock?.();
    this.emitPair({ type: 'message', message: this.deps.db.getMessage(this.pair(), id)! });
    // The shown take's notes, scene and the rest come back with it.
    this.rebuild();
    return OK;
  }

  /** Keep going: more of her latest reply, appended to it. */
  async continueReply(player: string, id: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    const m = this.deps.db.getMessage(this.pair(), id);
    if (!m) return { ok: false, error: 'unknown' };
    if (this.latestShown(feedOf(m))?.id !== id || m.role !== 'agent') return { ok: false, error: 'not-latest' };
    const prompt = this.promptOf(m);
    if (!prompt) return { ok: false, error: 'unknown' };
    // A scribe still reading this reply would land inside the keep going (a failure drops it): it stops, and re-reads after.
    this.deps.onTakeReplaced?.(id);
    return this.runTurn(prompt, { kind: 'continue', reply: m });
  }

  /** Edits any line (her shown take, for her replies); nothing after it changes. */
  async edit(player: string, id: string, text: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    if (text.trim().length === 0) return { ok: false, error: 'empty' };
    if (!this.line(id)) return { ok: false, error: 'unknown' };
    this.deps.db.updateMessage(this.pair(), id, { text });
    const t = this.deps.db.getTakes(this.pair(), id);
    if (t) {
      t.takes[t.index] = { ...t.takes[t.index], text };
      this.deps.db.setTakes(this.pair(), id, t.takes, t.index);
    }
    this.emitPair({ type: 'message', message: this.deps.db.getMessage(this.pair(), id)! });
    return OK;
  }

  async remove(player: string, id: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    if (!this.line(id)) return { ok: false, error: 'unknown' };
    this.deps.onTakeReplaced?.(id);
    this.deps.db.deleteMessage(this.pair(), id);
    this.emitPair({ type: 'messages_removed', ids: [id] });
    // Its writes stay in the log (an undo brings them back) but stop counting.
    this.rebuild();
    // Its stamp went with it: the story clock may be earlier now.
    this.deps.onClock?.();
    return OK;
  }

  /**
   * DELETE on the deck (deck controls spec §2): this text and every later text of the pair go, scene lines stay. What
   * the cut replies wrote (plans, promises) goes with them, and the story clock may be earlier now.
   */
  async deleteTexts(player: string, id: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    const m = this.line(id);
    if (!m) return { ok: false, error: 'unknown' };
    if (m.mode !== 'text') return { ok: false, error: 'not-text' };
    const rows = this.deps.db.allMessages(this.pair());
    // Her promised text goes with the hidden line it answered (mid review I2).
    const prompt = m.role === 'agent' && m.replyTo ? rows.find((r) => r.id === m.replyTo && r.promised) : undefined;
    const from = prompt?.id ?? id;
    const cut = rows.slice(rows.findIndex((r) => r.id === from)).filter((r) => r.mode === 'text');
    for (const r of cut) {
      this.deps.onTakeReplaced?.(r.id);
      this.deps.db.deleteMessage(this.pair(), r.id);
    }
    this.emitPair({ type: 'messages_removed', ids: cut.map((r) => r.id) });
    this.rebuild();
    this.spendCutPromise(cut);
    this.deps.onClock?.();
    return OK;
  }

  /**
   * A promised text was cut (a rewind, a DELETE): the promise its reply had spent is back in the story, but it's been
   * answered once — mark it spent for good, so it isn't sent again (deck controls spec §3.6).
   */
  private spendCutPromise(cut: readonly ChatMessage[]): void {
    if (!cut.some((m) => m.promised)) return;
    const back = parsePromise(this.deps.db.getMeta(promiseKey(this.pid)));
    if (back) this.deps.db.setMeta(promiseSpentKey(this.pid), back.from);
  }

  /** EDIT on the deck (deck controls spec §2): your latest text, changed, and her reply to it written again as a new take. */
  async editText(player: string, id: string, text: string, place?: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    const m = this.line(id);
    if (!m || m.mode !== 'text' || m.role !== 'user') return { ok: false, error: 'unknown' };
    const reply = this.latest('text');
    if (!reply || reply.role !== 'agent' || reply.replyTo !== id) return { ok: false, error: 'not-latest' };
    const before = m.text;
    const edited = await this.edit(player, id, text.trim());
    if (!edited.ok) return edited;
    const r = await this.regenerate(player, reply.id, place);
    // No new reply: your text goes back to what she answered (mid review I4).
    if (!r.ok) await this.edit(player, id, before);
    return r;
  }

  /** Undo of a delete: the line as the page held it, back in its place in time. */
  async restore(player: string, m: ChatMessage): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    // Ids are global: one held by any pair (this one's, or another's) can't come back here.
    if (this.deps.db.messageExists(m.id)) return { ok: false, error: 'unknown' };
    const { takes: _takes, ...line } = m;
    const restored: ChatMessage = { ...line, status: line.status === 'streaming' ? 'lost' : line.status };
    this.deps.db.insertMessage(this.pair(), restored);
    this.emitPair({ type: 'message', message: this.deps.db.getMessage(this.pair(), m.id)! });
    this.rebuild();
    this.deps.onClock?.();
    return OK;
  }

  /** Deletes every line after `id`, and what they wrote; a checkpoint first keeps the undone path loadable. */
  async rewind(player: string, id: string): Promise<Result> {
    if (this.turnActive) return { ok: false, error: 'busy' };
    this.enter(player);
    if (!this.deps.db.getMessage(this.pair(), id)) return { ok: false, error: 'unknown' };
    // Nothing after it: nothing to undo, and no checkpoint spent on it. (Texts count: a rewind cuts later ones too.)
    if (this.deps.db.allMessages(this.pair()).at(-1)?.id === id) return OK;
    // No checkpoint, no rewind: what it deletes can't be brought back otherwise.
    if (this.deps.beforeRewind?.() === false) return { ok: false, error: 'checkpoint' };
    this.deps.onRewind?.();
    // One transaction: a rebuild that fails leaves every line and its writes where they were.
    const all = this.deps.db.allMessages(this.pair());
    const later = all.slice(all.findIndex((m) => m.id === id) + 1);
    const { ids, rebuilt } = this.deps.db.cutAfter(this.pair(), id);
    if (ids.length > 0) this.emitPair({ type: 'messages_removed', ids });
    this.spendCutPromise(later);
    this.deps.onRebuild?.(rebuilt);
    this.emitQuestState();
    // The cut lines' stamps went with them: the story clock is back at the line's time.
    this.deps.onClock?.();
    return OK;
  }

  /** Rebuilds the story tables from the write log and shows what changed. */
  private rebuild(show?: { messageId: string; take: number }): void {
    const r = this.deps.db.rebuild(show ? { show } : undefined);
    this.deps.onRebuild?.(r);
    this.emitQuestState();
  }

  /** Opens her existing reply for a take / keep-going turn, remembering how it was. */
  private openExisting(): ChatMessage {
    this.replacing = null;
    const { db } = this.deps;
    const target = this.target as Exclude<Target, { kind: 'new' }>;
    const current = db.getMessage(this.pair(), target.reply.id)!;
    this.before = {
      text: current.text,
      toolLines: current.toolLines,
      status: current.status,
      takes: db.getTakes(this.pair(), current.id),
      ...(current.clock !== undefined ? { clock: current.clock } : {}),
      ...(current.model ? { model: current.model } : {}),
      ...(current.expression ? { expression: current.expression } : {}),
      ...(current.othersExpressions ? { othersExpressions: current.othersExpressions } : {}),
    };
    if (target.kind === 'take')
      // A new take starts back at its line's time; its own pass_time moves it.
      db.updateMessage(this.pair(), current.id, { text: '', toolLines: [], status: 'streaming', expression: undefined, othersExpressions: undefined, ...(this.turnBase !== null ? { clock: this.turnBase } : {}) });
    // The replaced take's skip is gone: the clock may be earlier now.
    if (target.kind === 'take' && this.turnBase !== null) this.deps.onClock?.();
    else db.updateMessage(this.pair(), current.id, { status: 'streaming' });
    const opened = db.getMessage(this.pair(), current.id)!;
    this.emitPair({ type: 'message', message: opened });
    this._activeMessageId = opened.id;
    this._turn++;
    if (target.kind === 'take') {
      // A new take (finishTake appends it at the end): she writes from the state before the reply
      // it replaces, so the shown take's writes are set aside until a swipe brings them back.
      const take = this.before.takes?.takes.length ?? 1;
      // That index may have been used before (a take that failed, or takes collapsed by an answer since rewound): start it empty.
      db.dropTakeWrites(opened.id, take);
      db.setReplyStamp({ messageId: opened.id, take });
      this.rebuild({ messageId: opened.id, take });
    } else {
      // Keep going adds to the shown take; if it fails, what it wrote goes (from this mark on).
      this.continueMark = db.lastSeq();
      db.setReplyStamp({ messageId: opened.id, take: this.before.takes?.index ?? 0 });
    }
    return opened;
  }

  /** Puts her reply back as it was before the take / keep-going turn opened it. */
  private restoreExisting(): void {
    const prev = this.before;
    if (this.target.kind === 'new' || !prev) return;
    const id = this.target.reply.id;
    this.deps.db.setTakes(this.pair(), id, prev.takes?.takes ?? null, prev.takes?.index ?? 0);
    this.deps.db.updateMessage(this.pair(), id, {
      text: prev.text,
      toolLines: prev.toolLines,
      status: prev.status,
      expression: prev.expression,
      othersExpressions: prev.othersExpressions,
      clock: prev.clock,
    });
    this.emitPair({ type: 'message', message: this.deps.db.getMessage(this.pair(), id)! });
    this.deps.onClock?.();
    // A failed keep going takes back what it wrote; a failed take never shows. Either way the state is as before.
    if (this.target.kind === 'continue') this.deps.db.dropWritesSince(id, this.continueMark);
    this.rebuild();
  }

  /** Adds the streamed text as her reply's newest take and shows it. */
  private finishTake(text: string, lost: boolean): void {
    const { db } = this.deps;
    const prev = this.before!;
    const id = (this.target as { reply: ChatMessage }).reply.id;
    const takes: Take[] = prev.takes
      ? [...prev.takes.takes]
      : [
          {
            text: prev.text,
            toolLines: prev.toolLines,
            ts: (this.target as { reply: ChatMessage }).reply.ts,
            ...(prev.status === 'lost' ? { lost: true } : {}),
            ...(prev.model ? { model: prev.model } : {}),
            ...(prev.expression ? { expression: prev.expression } : {}),
            ...(prev.othersExpressions ? { othersExpressions: prev.othersExpressions } : {}),
            ...(prev.clock !== undefined && this.turnBase !== null && prev.clock > this.turnBase ? { passed: prev.clock - this.turnBase } : {}),
          },
        ];
    const current = db.getMessage(this.pair(), id)!;
    takes.push({
      text,
      toolLines: current.toolLines,
      ts: Date.now(),
      ...(lost ? { lost: true } : {}),
      ...(this.turnModel ? { model: this.turnModel } : {}),
      ...(current.expression ? { expression: current.expression } : {}),
      ...(current.othersExpressions ? { othersExpressions: current.othersExpressions } : {}),
      ...(this.turnPassed > 0 ? { passed: this.turnPassed } : {}),
    });
    db.setTakes(this.pair(), id, takes, takes.length - 1);
    db.updateMessage(this.pair(), id, { status: lost ? 'lost' : 'ok' });
    this.emitPair({ type: 'message', message: db.getMessage(this.pair(), id)! });
  }

  /** Keep going finished: the reply (and its shown take) now holds the longer text. */
  private finishContinue(text: string): void {
    const { db } = this.deps;
    const id = (this.target as { reply: ChatMessage }).reply.id;
    db.updateMessage(this.pair(), id, { text, status: 'ok' });
    const t = db.getTakes(this.pair(), id);
    if (t) {
      const current = db.getMessage(this.pair(), id)!;
      t.takes[t.index] = { ...t.takes[t.index], text, toolLines: current.toolLines, expression: current.expression, othersExpressions: current.othersExpressions, ...(this.turnPassed > 0 ? { passed: this.turnPassed } : {}) };
      db.setTakes(this.pair(), id, t.takes, t.index);
    }
    this.emitPair({ type: 'message', message: db.getMessage(this.pair(), id)! });
  }

  /**
   * What a turn sends as history: everything before the player's line — or, to keep going, everything
   * through her reply as it stood before this turn opened it.
   */
  private turnHistory(userMessage: ChatMessage): ChatMessage[] {
    const target = this.target;
    if (target.kind !== 'continue') return this.historyBefore(userMessage);
    const asItStood = { text: this.before?.text ?? target.reply.text, status: 'ok' as const };
    return this.historyThrough(target.reply).map((m) => (m.id === target.reply.id ? { ...m, ...asItStood } : m));
  }

  /** The room's messages up to and including `m`, oldest first. */
  private historyThrough(m: ChatMessage): ChatMessage[] {
    const all = this.deps.db.recentMessages(this.pair(), HISTORY_WINDOW, feedOf(m));
    const at = all.findIndex((x) => x.id === m.id);
    return at >= 0 ? all.slice(0, at + 1) : all;
  }

  /** The room's messages before `userMessage`, oldest first (what's on screen above it). */
  private historyBefore(userMessage: ChatMessage): ChatMessage[] {
    const all = this.deps.db.recentMessages(this.pair(), HISTORY_WINDOW, feedOf(userMessage)); // oldest first
    const at = all.findIndex((m) => m.id === userMessage.id);
    return at >= 0 ? all.slice(0, at) : all.filter((m) => m.id !== userMessage.id);
  }

  /**
   * Her current model + provider (her saved choice, read every turn so a switch counts next turn);
   * `null` if the backend can't say. Emits `model` when the pair changes.
   */
  private async currentModel(): Promise<ModelPair | null> {
    const pair = await this.backend.currentModel();
    if (pair === null) return null;
    if (!samePair(this.lastEmittedModel, pair)) {
      this.lastEmittedModel = pair;
      this.deps.emit({ type: 'model', model: pair.model, provider: pair.provider });
    }
    return pair;
  }

  /** A turn's user row, stamped with the story clock plus its kind's cost (spec 2026-10-10 story clock), then stored. */
  private insertTurnRow(row: ChatMessage, extraMinutes = 0, base = TURN_COST[row.mode ?? 'rp']): void {
    const now = this.deps.clockNow?.() ?? null;
    if (now !== null) row.clock = now + base + extraMinutes;
    this.deps.db.insertMessage(this.pair(), row);
    if (now !== null) {
      this.deps.onClock?.();
      this.liveClockPending = true;
    }
  }

  /** The room follows a row's live clock move now (story moods spec §3), once. */
  private flushLiveClock(): void {
    if (!this.liveClockPending) return;
    this.liveClockPending = false;
    this.deps.onLiveClock?.();
  }

  /** `[time: Day N, HH:MM]` when the world keeps a clock, then `[city: …]` while her district is dark, then her schedule line when she has one. */
  private timeLine(): string | null {
    // This turn's own time (its line's, plus what she's passed in it), not a replaced take's.
    const now = this.turnNow() ?? this.deps.clockNow?.() ?? null;
    if (now === null) return null;
    return [promptClock(now), this.deps.cityLine?.(now) ?? null, this.deps.scheduleLine?.(now) ?? null].filter((l): l is string => l !== null).join('\n');
  }

  /** The clock of her last reply before this turn (not the take a regenerate replaces, not one still streaming); null when none. */
  private previousClock(userMessage: ChatMessage): number | null {
    const replaced = this.target.kind === 'take' ? this.target.reply.id : null;
    const at = (m: ChatMessage) => m.id === userMessage.id;
    const rows = this.deps.db.recentMessages(this.pair(), 20, 'scene');
    const upTo = rows.findIndex(at);
    return (
      (upTo < 0 ? rows : rows.slice(0, upTo)).findLast((m) => m.role === 'agent' && m.id !== replaced && m.status !== 'streaming' && m.clock !== undefined)?.clock ?? null
    );
  }

  /**
   * The lines before their words: what changed in the room or on anyone since her last turn, the lights rule, then her
   * journal line, (after a long gap) her recap, and who she is talking to. Who came or went (`presence`) follows the time.
   * The whole `[room: …]` and `[wearing: …]` lines head the turn instead (headLines).
   */
  private contextLines(userMessage: ChatMessage, player: Player, presence: string | null = null, recent: readonly string[] = [], wearing: string | null = null): string[] {
    const { journal, db } = this.deps;
    const kit = this.kitLineFor(player);
    const job = this.jobLineFor(userMessage);
    // In character only, like the lights line: no client pitched in an OOC aside or an END SCENE recap.
    const inCharacter = userMessage.mode !== 'ooc' && userMessage.mode !== 'end';
    const clients = inCharacter ? this.clientsLineFor() : null;
    const deal = inCharacter ? this.arrangementNow() : null;
    const arrangement = deal ? arrangementLine({ player: player.name, ...deal }) : null;
    const you = [player.line, kit, job, clients, arrangement].filter((x): x is string => Boolean(x)).join('\n') || null;
    // On comms you didn't arrive together, and walking back to her she greets you (comms review I4): no TRAVEL_LINE for either.
    const commsTravel = userMessage.mode === 'travel' && (this.commsNow(this.pid)?.on === true || this.hungUpBy(userMessage.id));
    const arrival = userMessage.mode === 'greet' ? this.arrival(userMessage) : userMessage.mode === 'travel' && !commsTravel ? TRAVEL_LINE : null;
    // Comms (spec 2026-10-20 §2): where she is and where you are, in character only; she's not there to touch the lights.
    const places = userMessage.mode !== 'ooc' && userMessage.mode !== 'end' && this.commsNow(this.pid)?.on ? (this.deps.commsPlaces?.(this.pid) ?? null) : null;
    // The deal stepped back while on the line (spec §1): this reply signs off, then the line drops (turn end).
    this.dropLine = places !== null && !this.commsCan(this.pid);
    const comms = places ? `${commsLine({ herPlace: places.her, yourPlace: places.you, player: player.name })}${this.dropLine ? `\n${COMMS_DROP_LINE}` : ''}` : null;
    // In character, the lights rule opens the lines by their words, after any change (not OOC, not an END SCENE's recap turn, not from her desk).
    const lights = userMessage.mode === 'ooc' || userMessage.mode === 'end' || comms ? null : LIGHTS_LINE;
    // A plain in-character turn: the length and their-part rules, last before their words (prompt measurement 2026-10-20).
    const beat = userMessage.mode === undefined ? beatLine(player.name) : null;
    // What she keeps writing, right before the beat (the lantern in eight replies running).
    const echo = beat ? this.echoLineFor(userMessage) : null;
    // Her plan (spec 2026-10-21 §6): the meeting you came to, or the one you missed; her reply spends an ended plan.
    const planNote = this.deps.planNote ? this.deps.planNote(userMessage.mode ?? 'rp', ...this.planBeforeTake()) : null;
    this.planSpend = planNote?.spend === true;
    const plan = planNote?.line ?? null;
    const [since, clothes] = this.changedLines(userMessage, wearing);
    if (!journal) return [since, lights, clothes, this.timeLine(), comms, presence, arrival, plan, you, echo, beat].filter((l): l is string => l !== null);
    // The gap is measured from the latest message that isn't this turn's own user message (a retry
    // reuses an old one) or the reply now streaming.
    const last = db
      .recentMessages(this.pair(), 20, 'scene')
      .filter((m) => m.id !== userMessage.id && m.status !== 'streaming')
      .reduce<number | null>((max, m) => (max === null || m.ts > max ? m.ts : max), null);
    const greeting = userMessage.mode === 'greet';
    return [since, lights, clothes, this.timeLine(), comms, presence, journal.journalLine(this.pair(), recent), journal.previouslyLine(this.pair(), last, greeting), arrival, plan, you, echo, beat].filter(
      (l): l is string => l !== null,
    );
  }

  /**
   * What heads the turn, ahead of its blocks: the whole room as it is now and what everyone wears. They sat right before
   * their words until 2026-10-23, and GLM wrote the paper lantern and her bare feet into eight replies running.
   */
  private headLines(wearing: string | null): string[] {
    return [this.deps.room.summary(), wearing].filter((l): l is string => l !== null);
  }

  /**
   * The room's changes since she was last shown it, and the wearing line when it changed; each null when nothing did.
   * What she was shown is kept per pair in meta `seen.<pair>` (not story meta: a rewind leaves it, and at worst one turn
   * names a change twice or misses one the room line at the head already shows). A retake of the same line compares
   * against the turn before it.
   */
  private changedLines(userMessage: ChatMessage, wearing: string | null): [string | null, string | null] {
    type Seen = { room: RoomState; wearing: string | null };
    const key = `seen.${this.pair()}`;
    const stored = ((): (Seen & { id: string; prev: Seen | null }) | null => {
      try {
        return JSON.parse(this.deps.db.getMeta(key) ?? 'null');
      } catch {
        return null;
      }
    })();
    const before = stored === null ? null : stored.id === userMessage.id ? stored.prev : { room: stored.room, wearing: stored.wearing };
    const now: Seen = { room: this.deps.room.state, wearing };
    this.deps.db.setMeta(key, JSON.stringify({ id: userMessage.id, ...now, prev: before }));
    if (before === null) return [null, null];
    return [roomChanges(before.room, now.room), wearing !== null && wearing !== before.wearing ? wearing : null];
  }

  /** The [you keep writing …] line from her last replies before this turn, minus what they just brought up; null when she isn't repeating. */
  private echoLineFor(userMessage: ChatMessage): string | null {
    const lines = this.turnHistory(userMessage).filter((m) => m.status === 'ok' && m.text !== '' && m.mode !== 'scene' && m.mode !== 'ooc');
    const hers = lines.filter((m) => m.role === 'agent').map((m) => m.text);
    const theirs = [...lines.filter((m) => m.role === 'user').map((m) => m.text).slice(-1), userMessage.text];
    return echoLine(hers, theirs);
  }

  /**
   * The arrangement here (spec 2026-10-20 §2): the deal, whether it's in force (her trust high), and tonight's
   * count of jobs run with her that ended this story day (her own clients' jobs don't count). Null with no deal.
   */
  private arrangementNow(player = this.pid): { a: Arrangement; active: boolean; done: number } | null {
    const a = parseArrangement(this.deps.db.getMeta(arrangementKey(player)));
    if (!a) return null;
    const qs = this.deps.quests;
    const day = this.storyDay();
    const book = qs?.book() ?? [];
    const done = (qs?.status(player) ?? []).filter((s) => {
      const q = book.find((e) => e.id === bookId(s.id));
      // Small jobs only: a big job is its own night, outside the deal (final review I1).
      return s.contact === qs!.contact && q !== undefined && q.kind === 'mission' && s.run.done && s.run.endDay === day && ownedBy(q) !== qs!.contact;
    }).length;
    return { a, active: arrangementActive(a, this.deps.trust?.now(player) ?? null), done };
  }

  /** Comms on `player` in this room (spec 2026-10-20), as stored; null with none. */
  commsNow(player = this.pid): CommsState | null {
    return parseComms(this.deps.db.getMeta(commsKey(player)));
  }

  /** Set while building a turn on comms whose deal has stepped back: her reply signs off and the line drops. */
  private dropLine = false;

  /** Whether row `id` ended a comms line (HANG UP): it wrote `{ on: false }` over a line that was on. */
  private hungUpBy(id: string): boolean {
    const key = commsKey(this.pid);
    const writes = this.deps.db.writes().filter((w) => w.kind === 'meta' && w.key === key);
    const at = writes.findIndex((w) => w.messageId === id);
    return at > 0 && parseComms(writes[at].value ?? null)?.on === false && parseComms(writes[at - 1].value ?? null)?.on === true;
  }

  /** Liar's dice is a table game (comms review I6): not with her on the line. Null when it's allowed. */
  diceRefusal(player: string): string | null {
    return this.commsNow(player)?.on ? "she's on comms: no dice across the line" : null;
  }

  /** Whether `player` can go on comms with her: an arrangement in force (comms spec §1). */
  commsCan(player: string): boolean {
    return this.arrangementNow(player)?.active ?? false;
  }

  /** Whether the deal's nights are used up tonight for job `q` (spec §2): her own clients' jobs never are. */
  private capped(q: QuestEntry, player: string): boolean {
    const deal = this.arrangementNow(player);
    return deal !== null && deal.active && deal.done >= deal.a.nights && q.kind === 'mission' && ownedBy(q) !== this.deps.quests?.contact;
  }

  /** Her clients line (Intake board spec §3): her own jobs open where she stands, while no job runs here. */
  private clientsLineFor(): string | null {
    const qs = this.deps.quests;
    const ctx = qs?.ctx(this.pid) ?? null;
    if (!qs || !ctx) return null;
    if (this.questHere(this.pid) || this.legworkRun()) return null;
    const own = this.openJobs(this.pid, qs.book(), ctx).filter((q) => ownedBy(q) === qs.contact);
    // A desk job (comms spec §3) says where.
    return own.length > 0 ? clientsBlock(own.map((q) => ({ title: q.title, pitch: q.commsAt ? `${q.pitch ?? ''} (at ${qs.placeName(q.commsAt)})`.trim() : q.pitch }))) : null;
  }

  /**
   * Whether a job is under way for `player` (story moods spec §2): a run not done that has ALARM up,
   * or a big job whose go hour has come. The room goes tense while it is.
   */
  jobOn(player: string): boolean {
    const qs = this.deps.quests;
    if (!qs) return false;
    const now = this.deps.clockNow?.() ?? 0;
    const book = qs.book();
    return qs.status(player).some(({ id, run }) => {
      if (run.done) return false;
      if ((run.alarm ?? 0) >= 1) return true;
      const q = run.big ? book.find((e) => e.id === bookId(id)) : undefined;
      return q !== undefined && q.kind === 'big' && goPassed(q, run.big!.started, now);
    });
  }

  /** Her [job] block (big jobs spec §4): while a big job of this room runs; on a travel turn to a marked place, its line. */
  private jobLineFor(userMessage: ChatMessage): string | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    const status = qs.status(this.pid).find((s) => s.contact === qs.contact && !s.run.done && s.run.big);
    const q = status && qs.book().find((e) => e.id === bookId(status.id));
    if (!status || !q || q.kind !== 'big') return null;
    const big = status.run.big!;
    const now = this.deps.clockNow?.() ?? 0;
    const goAt = big.started - nightMinute(big.started) + nightMinuteOf(q.go ?? 0);
    const place = qs.placeId();
    const mark = userMessage.mode === 'travel' && big.section === 'legwork' ? big.marks.find((m) => m.place === place && !big.visited.includes(m.place)) : undefined;
    return jobBlock({
      title: q.title,
      section: big.section === 'read' ? 'the read' : big.section === 'approach' ? 'the approach' : big.section,
      go: hhmmOf(q.go ?? 0),
      left: big.section === 'legwork' && now < goAt ? goAt - now : null,
      here: mark?.line ?? null,
      clues: big.clues.map((id) => q.clues.get(id)?.text ?? id),
    });
  }

  /** The pair's opening scene while it's on: its scene row, with no END SCENE after it but the one this turn answers. */
  private openingScene(userMessage: ChatMessage, all: ChatMessage[]): ChatMessage | null {
    const at = all.findIndex((m) => m.mode === 'scene');
    if (at < 0) return null;
    const ended = all.slice(at + 1).some((m) => m.mode === 'end' && m.role === 'user' && m.id !== userMessage.id && m.status !== 'failed');
    return ended ? null : all[at];
  }

  /** True while her greeting is the scene's first beat: no reply of hers follows the scene row but this greeting's own. */
  private sceneUnplayed(scene: ChatMessage, greetRow: ChatMessage, all: ChatMessage[]): boolean {
    return !all.slice(all.findIndex((m) => m.id === scene.id) + 1).some((m) => m.role === 'agent' && m.replyTo !== greetRow.id && m.status !== 'failed' && m.mode !== 'text');
  }

  /**
   * Text for choosing lore: this turn's (when there is one), then up to LORE_WINDOW older lines of
   * this pair, newest first, then the opening scene's text while it's on (never once it has ended).
   */
  private loreRecent(userMessage: ChatMessage, turnText: string | null, scene: ChatMessage | null): string[] {
    const older = this.deps.db
      .recentMessages(this.pair(), LORE_WINDOW + 2, 'scene')
      // Not this turn's own line, and not the take a regenerate replaces (the model never sees it either).
      .filter((m) => m.id !== userMessage.id && !(this.target.kind === 'take' && m.id === this.target.reply.id) && m.text !== '' && m.mode !== 'scene')
      .map((m) => m.text)
      .reverse()
      .slice(0, LORE_WINDOW);
    const recent = turnText !== null && turnText !== '' ? [turnText, ...older] : older;
    return scene ? [...recent, scene.text] : recent;
  }

  /** The `[arrival: …]` line for a greeting: measured from the line before her greet row. */
  private arrival(greetRow: ChatMessage): string {
    const all = this.deps.db.allMessages(this.pair());
    const at = all.findIndex((m) => m.id === greetRow.id);
    // The opening scene isn't a line: after it alone, it's still a first meeting.
    // Story time when the world keeps a clock (a WAIT on /solo moves it, not the wall).
    const clock = greetRow.clock ?? this.deps.clockNow?.() ?? null;
    return arrivalLine(all.slice(0, Math.max(at, 0)).findLast((m) => m.mode !== 'scene' && m.mode !== 'text'), Date.now(), { known: (this.deps.tie?.(this.pid) ?? null) !== null, clock });
  }

  /**
   * A text turn's request (deck spec §4): her identity and the texting rules; the texts so far, led by the rolling
   * summary; and your text with the time and where she is. No room, lights, travel, dice or comms lines.
   */
  private textPrompt(userMessage: ChatMessage): CompletionMessage[] {
    const { db } = this.deps;
    const player = this.turnPlayer ?? this.deps.players.resolve(this.pair());
    // What she knows, as in a scene: her page on them after her identity, her journal in the turn.
    const { journal } = this.deps;
    const page = journal ? pageLine(player.name, journal.page(player.id).text, this.deps.tie?.(player.id) ?? null) : null;
    const instructions = [this.deps.identity?.(), page, `${TEXT_HEADING}\n\n${TEXT_INSTRUCTIONS}`].filter(Boolean).join('\n\n');
    // This text and the thread's latest texts, newest first: what brings up her notes and lore (a text forgot Venn).
    const older = db
      .recentMessages(this.pair(), LORE_WINDOW + 2, 'text')
      .filter((m) => m.id !== userMessage.id && !(this.target.kind === 'take' && m.id === this.target.reply.id) && m.text !== '')
      .map((m) => m.text)
      .reverse()
      .slice(0, LORE_WINDOW);
    const recentText = [userMessage.text, ...older];
    const lore = this.deps.lore ? this.deps.lore(this.deps.room.state.sceneId, recentText) : null;
    const loreText = lore ? loreBlock(lore.picks.map((p) => p.entry)) : null;
    const standingText = this.deps.standing?.(player.id, null) ?? null;
    // Photos spec §3: the ones that fit her now, read fresh each turn (a REGEN or EDIT too).
    const offered = this.deps.photosNow?.(userMessage.clock ?? null) ?? [];
    this.offeredPhotos = new Set(offered.map((p) => p.id));
    const contextLines = [this.timeLine(), journal?.journalLine(this.pair(), recentText) ?? null, textWhereLine({ place: this.textPlace, you: player.name }), photosLine(offered), textPlanLine(this.deps.planNow?.(player.id) ?? null, player.name)].filter((l): l is string => Boolean(l));
    const turn: Turn = { kind: 'reply', contextLines, text: userMessage.text, blocks: [loreText, standingText].filter((b): b is string => Boolean(b)) };
    // Her sent photo reads as its caption (photos spec §4), never as the stored marker; your lines stay as you typed them.
    const history = this.historyBefore(userMessage).map((m) => (m.role === 'agent' ? { ...m, text: photoForModel(m.text, this.captionOf) } : m));
    return buildMessages({ instructions, history, turn, summary: readSummary(db, this.pair()), alwaysSummary: true });
  }

  private readonly captionOf = (id: string): string | null => this.deps.photoCaption?.(id) ?? null;

  /** The [texts] block for a scene turn (deck spec §3), or null when nothing was texted in the last story day. */
  private textsNote(player: Player): string | null {
    const now = this.turnNow() ?? this.deps.clockNow?.() ?? null;
    if (now === null) return null;
    const her = this.deps.self?.().name ?? 'them';
    return textsBlock(this.deps.db.recentMessages(this.pair(), 200, 'text'), now, { you: player.name, her }, this.captionOf);
  }

  /** A scene turn's request: her identity and the room's rules, the history, and this turn with its blocks. */
  private scenePrompt(userMessage: ChatMessage): CompletionMessage[] {
    const { db, emit, room } = this.deps;
    // The opening scene (scenario cards), while it's on and the turn is in character.
    // One read of the pair's history for the scene's checks.
    const all = userMessage.mode === 'ooc' ? [] : db.allMessages(this.pair());
    const scene = userMessage.mode === 'ooc' ? null : this.openingScene(userMessage, all);
    const greet = scene && this.sceneUnplayed(scene, userMessage, all) ? SCENE_GREET_INSTRUCTIONS : GREET_INSTRUCTIONS;
    // The room note stays in the system message (it's the same every turn); the mode's own note rides with the turn.
    const note = userMessage.mode === 'ooc' ? (this.deps.oocInstructions ?? OOC_INSTRUCTIONS) : `${RP_HEADING}\n\n${this.deps.instructions ?? ROOM_INSTRUCTIONS}\n\n${ROLEPLAY_GUIDE}`;
    const modeNote =
      userMessage.mode === 'end'
        ? userMessage.leave
          ? userMessage.parting === 'her'
            ? this.herLeaveNote()
            : this.hungUpBy(userMessage.id)
              ? COMMS_HANGUP_INSTRUCTIONS
              : LEAVE_INSTRUCTIONS
          : END_SCENE_INSTRUCTIONS
        : userMessage.mode === 'greet'
          ? greet
          : userMessage.mode === 'travel'
            ? this.commsNow(this.pid)?.on
              ? COMMS_TRAVEL_INSTRUCTIONS
              : this.hungUpBy(userMessage.id)
                ? COMMS_BACK_INSTRUCTIONS
                : TRAVEL_INSTRUCTIONS
            : userMessage.mode === 'encounter'
              ? ENCOUNTER_INSTRUCTIONS
              : userMessage.mode === 'quest'
                ? (this.missionNote(userMessage) ?? QUEST_INSTRUCTIONS)
              : userMessage.mode === 'gig'
                ? GIG_INSTRUCTIONS
                : userMessage.mode === 'dice'
                  ? DICE_INSTRUCTIONS
                  : null;
    const player = this.turnPlayer ?? this.deps.players.resolve(this.pair());
    // Her identity, then who is here and her dossier page on them (this pair only), then the room/OOC note.
    const page = this.deps.journal ? pageLine(player.name, this.deps.journal.page(player.id).text, this.deps.tie?.(player.id) ?? null) : null;
    // Everyone else here she voices too, and who came or went since her last reply (in character only).
    const inCharacter = userMessage.mode !== 'ooc';
    // A greeting or a move: you've only just arrived, so no one came or went while you were here.
    const arriving = userMessage.mode === 'greet' || userMessage.mode === 'travel';
    const before = inCharacter && !arriving ? this.previousClock(userMessage) : null;
    const now = this.turnNow() ?? this.deps.clockNow?.() ?? null;
    const others = inCharacter ? (this.deps.others?.(now, before) ?? []) : [];
    const othersNote = others.length > 0 ? othersBlock(others) : null;
    const wearing = this.deps.wearing ? wearingLine(this.deps.wearing(player, others)) : null;
    const presence = inCharacter ? (this.deps.presence?.(before, now) ?? null) : null;
    // An event's stranger, while they're here at the line this turn answers (in character only).
    const stranger = userMessage.mode === 'ooc' ? null : strangerAt(all, all.findIndex((m) => m.id === userMessage.id));
    const strangerNote = stranger ? strangerBlock(stranger) : null;
    const target = this.target;
    const turnText =
      userMessage.mode === 'end'
        ? endSceneText(userMessage.text, userMessage.parting === 'her' ? 'her' : userMessage.leave === true)
        : userMessage.mode === 'greet'
          ? GREET_PLACEHOLDER
          : userMessage.mode === 'encounter'
            ? encounterText({ title: userMessage.encounter?.title ?? '', text: userMessage.text }, oneLine)
            : userMessage.mode === 'quest'
              ? questRowText({ title: userMessage.quest?.title ?? '', text: userMessage.text, run: userMessage.quest?.run }, oneLine)
            : userMessage.mode === 'gig' && userMessage.gig
              ? gigText(userMessage.gig)
              : userMessage.mode === 'dice' && userMessage.dice
                ? diceText(userMessage.dice)
                : userMessage.text;
    // The lore for this room and what was just said: her identity, then the book's block.
    const recentText = this.loreRecent(userMessage, target.kind === 'continue' ? null : turnText, scene);
    const papers = userMessage.mode === 'gig' ? userMessage.gig?.papers : undefined;
    const force = papers ? [...new Set([...papers.bulletin.map((b) => b.lore), ...(papers.extraLore ?? [])])] : null;
    const lore = this.deps.lore ? (force ? this.deps.lore(room.state.sceneId, recentText, force) : this.deps.lore(room.state.sceneId, recentText)) : null;
    if (lore) emit({ type: 'dev_log', level: 'info', text: loreLogLine(lore) });
    const loreText = lore ? loreBlock(lore.picks.map((p) => p.entry)) : null;
    // Leads (in character only): what's on her mind, what she could give, and what you hold that points to her.
    // A regenerate reads the table before the new take's rebuild: what the old take gave isn't held in the new one.
    const replaced = target.kind === 'take' ? db.leadsGiven(player.id).filter((l) => l.messageId === target.reply.id).map((l) => l.id) : [];
    const leads = inCharacter && this.deps.leads ? this.deps.leads(player.id, recentText, replaced) : null;
    this.turnOffer = leads?.offer ?? [];
    if (leads) {
      emit({ type: 'dev_log', level: 'info', text: leadsLogLine(leads) });
      // Raising a lead you hold with the one it points to follows it up: stamped to this turn's line, so a rewind takes it back.
      if (target.kind !== 'continue' && userMessage.mode !== 'greet') {
        for (const { entry } of leads.receive) {
          const key = `lead.${player.id}.${entry.id}.followed`;
          if (mentionsKeys(turnText, entry.keys) && db.getMeta(key) === null) db.setMeta(key, '1');
        }
      }
    }
    const leadsText = leads ? leadsBlock(leads) : null;
    const sceneText = scene ? sceneBlock({ title: scene.scene?.title ?? '', text: scene.text }, oneLine) : null;
    // Standing (in character only): how she feels about them, after her page on them.
    // A regenerate is prompted from standing before the reply it rewrites: the old take's move is still in the table.
    const standingText = inCharacter ? (this.deps.standing?.(player.id, target.kind === 'take' ? target.reply.id : null) ?? null) : null;
    // Cache-friendly order (scribe spec §7): what rarely changes in the system message; what changes turn to turn with the turn.
    const instructions = [this.deps.identity?.(), note, sceneText, player.whosHere, othersNote].filter(Boolean).join('\n\n');
    // The quest at a beat here (in character only): the beat, the shown choices and their view (quest lines spec §3).
    const questText = inCharacter ? this.questBlockFor(player.id, userMessage.mode === 'quest' && target.kind !== 'continue') : null;
    // Texts from the last story day (deck spec §3): the scene knows what was said on the deck.
    const textsNote = inCharacter ? this.textsNote(player) : null;
    const blocks = [modeNote, loreText, page, standingText, leadsText, questText, strangerNote, textsNote].filter((b): b is string => Boolean(b));
    const turn: Turn =
      target.kind === 'continue'
        ? { kind: 'continue', blocks }
        : {
            kind: 'reply',
            head: this.headLines(wearing),
            contextLines: this.contextLines(userMessage, player, presence, recentText, wearing),
            text: turnText,
            blocks,
          };
    return buildMessages({ instructions, history: this.turnHistory(userMessage), turn, summary: readSummary(db, this.pair()) });
  }

  private async consumeStream(userMessage: ChatMessage, model: ModelPair | null): Promise<Result> {
    const { db, emit } = this.deps;
    this.turnModel = model?.model;
    const target = this.target;
    // A text on the deck (spec 2026-10-23 §4) has its own prompt, and no tools.
    const textTurn = userMessage.mode === 'text';
    const messages = textTurn ? this.textPrompt(userMessage) : this.scenePrompt(userMessage);
    const idleMs = this.deps.streamIdleMs ?? DEFAULT_STREAM_IDLE_MS;
    const abort = new AbortController();
    const gen = this.backend.streamTurn({ messages, model, regenerate: target.kind === 'take', ...(textTurn ? { noTools: true } : {}) }, abort.signal);

    let nixMessage: ChatMessage | undefined;
    let opened = false;
    // Keep going adds to her reply as it stood; a take starts empty.
    let buffer = target.kind === 'continue' ? (this.before?.text ?? target.reply.text) : '';
    let firstText = true;
    let finalStatus: 'ok' | 'run_failed' | undefined;

    while (true) {
      let next: IteratorResult<{ event: string; data: unknown }> | typeof IDLE;
      try {
        next = await this.nextOrIdle(gen, idleMs);
      } catch (err) {
        if (opened) return this.finalizeLost(nixMessage!, buffer, true);
        // Nothing has been yielded yet (not even the stream-open frame), so a non-TurnError
        // here is a dropped signal, not a classifiable failure (auth/busy/credit/unreachable…)
        // — let those still bubble up for handleTurnError() to classify.
        if (err instanceof TurnError) throw err;
        return this.failDroppedBeforeFrame(userMessage);
      }
      if (next === IDLE) {
        // The stream is open but has sent nothing (keepalives at most) for too long.
        abort.abort();
        emit({ type: 'dev_log', level: 'error', text: `Stream idle for ${Math.round(idleMs / 1000)}s; giving up` });
        if (nixMessage) return this.finalizeLost(nixMessage, buffer, true);
        return this.failDroppedBeforeFrame(userMessage);
      }
      if (next.done) break;

      const frame = next.value;
      opened = true;
      const usedModel = (frame.data as { model?: unknown } | undefined)?.model;
      if (frame.event === STREAM_OPEN_EVENT && typeof usedModel === 'string') this.turnModel = usedModel;
      // The reply opens on the first thing the stream yields — normally the synthetic
      // stream-open frame right after HTTP 200 — so tool lines Nix makes before her first SSE
      // frame attach to (and persist with) this message, and clients go busy immediately.
      if (!nixMessage && target.kind !== 'new') {
        nixMessage = this.openExisting();
      } else if (!nixMessage) {
        nixMessage = {
          id: crypto.randomUUID(),
          role: 'agent',
          text: '',
          toolLines: [],
          ts: Date.now(),
          status: 'streaming',
          replyTo: userMessage.id,
          ...(userMessage.mode ? { mode: userMessage.mode } : {}),
          ...(this.turnModel ? { model: this.turnModel } : {}),
          // Her reply is at the clock of the line it answers (plus any time she passes, set when it settles).
          ...(userMessage.clock !== undefined ? { clock: userMessage.clock + this.turnPassed } : {}),
        };
        db.insertMessage(this.pair(), nixMessage);
        this.emitPair({ type: 'message', message: nixMessage });
        this._activeMessageId = nixMessage.id;
        this._turn++;
        // The line's clock move: before her take's stamp, so a mood it brings holds in every take of this reply.
        this.flushLiveClock();
        // Her writes from here on belong to this reply's first take.
        db.setReplyStamp({ messageId: nixMessage.id, take: 0 });
      }

      switch (frame.event) {
        case STREAM_OPEN_EVENT:
          break;
        case 'assistant.delta': {
          let delta = (frame.data as { delta?: string } | undefined)?.delta ?? '';
          // A reply opens on its first words: blank lines (or spaces) before them are dropped, even
          // split across deltas, so they never take lines at the top of the box.
          if (buffer === '') delta = delta.replace(/^\s+/, '');
          if (delta === '') break;
          // Keep going: a space between her text and the rest, unless she ended on whitespace.
          if (firstText && delta.length > 0) {
            if (target.kind === 'continue' && buffer.length > 0 && !/\s$/.test(buffer) && !/^\s/.test(delta)) delta = ` ${delta}`;
            firstText = false;
          }
          buffer += delta;
          this.emitPair({ type: 'nix_delta', messageId: nixMessage.id, delta });
          break;
        }
        case 'run.completed':
          finalStatus = 'ok';
          break;
        case 'run.failed':
          finalStatus = 'run_failed';
          break;
        case 'run.cancelled':
          finalStatus = 'run_failed';
          break;
        default:
          // tool.*, assistant.commentary, tool.progress, run.started, message.started, done
          break;
      }
    }

    if (!nixMessage) {
      this.restoreExisting();
      // A text that never got a word back is NOT DELIVERED, to RETRY (deck spec §2).
      if (textTurn && target.kind === 'new') this.failPrompt(userMessage);
      return { ok: false, error: 'lost' };
    }

    if (finalStatus === 'ok' && textTurn) {
      // Her texts as bubbles (deck spec §4) — a new take too (deck controls spec §2); nothing left once the *actions* go is a text that didn't arrive.
      // Photos spec §3: her photo only if this turn offered it; a stray marker goes, her words stay.
      const sent = parsePhotoReply(buffer, this.offeredPhotos);
      for (const id of sent.dropped) emit({ type: 'dev_log', level: 'info', text: `photo: '${id}' not offered; dropped` });
      const bubbles = splitBubbles(sent.text);
      if (bubbles.length === 0) return this.finalizeLost(nixMessage, '', false);
      buffer = bubbles.join('\n');
    }

    if (finalStatus === 'ok' && target.kind !== 'new') {
      this._authFailed = false;
      if (target.kind === 'take') this.finishTake(buffer, false);
      else this.finishContinue(buffer);
      emit({ type: 'link', status: 'ok' });
      return OK;
    }

    if (finalStatus === 'ok') {
      this._authFailed = false;
      db.updateMessage(this.pair(), nixMessage.id, { text: buffer, status: 'ok' });
      // Re-read from the db rather than spreading the local `nixMessage`: the hub may have
      // appended tool_line entries to this message's toolLines in the db while the turn was
      // streaming, and a final emit built from the stale local copy would clobber them back to [].
      this.emitPair({ type: 'message', message: db.getMessage(this.pair(), nixMessage.id)! });
      emit({ type: 'link', status: 'ok' });
      return { ok: true, text: 'ok' };
    }

    // run.failed / run.cancelled, or the stream ended with no terminal run event
    return this.finalizeLost(nixMessage, buffer, finalStatus === undefined);
  }

  /** `gen.next()`, or `IDLE` if it yields nothing within `idleMs`. */
  private nextOrIdle<T>(gen: AsyncGenerator<T>, idleMs: number): Promise<IteratorResult<T> | typeof IDLE> {
    const pending = gen.next();
    // If the idle timer wins, the abandoned next() rejects later (AbortError) — never unhandled.
    pending.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<typeof IDLE>((resolve) => {
      timer = setTimeout(() => resolve(IDLE), idleMs);
    });
    return Promise.race([pending, idle]).finally(() => clearTimeout(timer));
  }

  /** Marks her reply lost (a take or keep-going puts the reply back, or keeps a cut-off take). */
  private finalizeLost(nixMessage: ChatMessage, text: string, emitLinkLost: boolean): Result {
    if (this.target.kind !== 'new') {
      // A cut-off take is kept (marked lost) if any of it arrived; anything else puts the reply back.
      const target = this.target;
      // A text's take that didn't fully arrive is no take: her old text stays (mid review I3).
      const kept = target.kind === 'take' && text.length > 0 && this.before !== null && this.turnMode !== 'text';
      if (kept) this.finishTake(text, true);
      else this.restoreExisting();
      if (emitLinkLost) this.deps.emit({ type: 'link', status: 'lost' });
      return { ok: false, error: 'lost' };
    }
    // A greeting cut off before it said anything leaves no trace: the pair stays due. (A RETRY of
    // one that already said something keeps its line, marked failed.)
    const prompt = nixMessage.replyTo ? this.deps.db.getMessage(this.pair(), nixMessage.replyTo) : undefined;
    // A text that didn't arrive leaves no half reply either: yours is marked NOT DELIVERED, to RETRY (deck spec §2).
    if ((prompt?.mode === 'greet' && text.trim() === '') || prompt?.mode === 'text') {
      this.deps.db.deleteMessage(this.pair(), nixMessage.id);
      this.deps.db.pruneWrites([nixMessage.id]);
      this.emitPair({ type: 'messages_removed', ids: [nixMessage.id] });
      // Whatever it did before it was cut off goes with it.
      this.rebuild();
      this.failPrompt(prompt);
      if (emitLinkLost) this.deps.emit({ type: 'link', status: 'lost' });
      return { ok: false, error: 'lost' };
    }
    this.deps.db.updateMessage(this.pair(), nixMessage.id, { text, status: 'lost' });
    // See the comment in consumeStream(): re-read so any tool_line toolLines aren't clobbered.
    this.emitPair({ type: 'message', message: this.deps.db.getMessage(this.pair(), nixMessage.id)! });
    if (emitLinkLost) this.deps.emit({ type: 'link', status: 'lost' });
    return { ok: false, error: 'lost' };
  }

  /** The stream opened (200) but dropped before any frame parsed, and no nix message exists yet. */
  private failDroppedBeforeFrame(userMessage: ChatMessage): Result {
    const { db, emit } = this.deps;
    if (this.target.kind !== 'new') {
      this.restoreExisting();
      emit({ type: 'link', status: 'lost' });
      return { ok: false, error: 'lost' };
    }
    this.failPrompt(userMessage);
    emit({ type: 'link', status: 'lost' });
    return { ok: false, error: 'lost' };
  }

  private handleTurnError(err: unknown, userMessage: ChatMessage): Result {
    this.failPrompt(userMessage);
    return this.classifyError(err);
  }

  /**
   * A line her reply never answered: marked failed (with RETRY), except a greet line nothing
   * answers yet, which simply goes. A greet line an earlier (lost) greeting answers stays, failed,
   * so that greeting's RETRY still has it.
   */
  private failPrompt(userMessage: ChatMessage): void {
    const { db } = this.deps;
    const answered = db.allMessages(this.pair()).some((m) => m.role === 'agent' && m.replyTo === userMessage.id);
    if (userMessage.mode === 'greet' && !answered) {
      db.deleteMessage(this.pair(), userMessage.id);
      // Hand edits made while it waited were stamped to it (the latest line): they stay, on the line before.
      db.restampWrites(userMessage.id, this.latest()?.id ?? null);
      this.emitPair({ type: 'messages_removed', ids: [userMessage.id] });
      return;
    }
    db.updateMessage(this.pair(), userMessage.id, { status: 'failed' });
    this.emitPair({ type: 'message', message: { ...userMessage, status: 'failed' } });
  }

  /** Reports a turn's failure (link status, dev log, the player's notice) and names it. */
  private classifyError(err: unknown): Result {
    const { emit } = this.deps;
    if (!(err instanceof TurnError)) {
      // Any other unexpected failure anywhere else in the turn.
      const text = err instanceof Error ? err.message : String(err);
      emit({ type: 'dev_log', level: 'error', text });
      emit({ type: 'link', status: 'down' });
      return { ok: false, error: 'unreachable' };
    }

    switch (err.kind) {
      case 'auth':
        this._authFailed = true;
        emit({ type: 'link', status: 'down' });
        emit({ type: 'dev_log', level: 'error', text: 'The provider rejected the API key (401)' });
        // The key is linked in the game: say where to fix it.
        emit({ type: 'notice', text: '// KEY REJECTED — RELINK AT SELECT' });
        return { ok: false, error: 'auth' };
      case 'busy':
        emit({ type: 'notice', text: '// RATE LIMITED' });
        return { ok: false, error: 'busy' };
      case 'credit':
        emit({ type: 'notice', text: '// OPENROUTER CREDIT IS OUT' });
        return { ok: false, error: 'credit' };
      case 'no-link':
        emit({ type: 'notice', text: NO_LINK_NOTICE });
        return { ok: false, error: 'no-link' };
      case 'refused':
        emit({ type: 'notice', text: '// THE PROVIDER REFUSED THIS TURN — TRY ANOTHER MODEL' });
        return { ok: false, error: 'refused' };
      case 'unreachable':
      case 'http':
        emit({ type: 'link', status: 'down' });
        // The key is the player's own: say whether OpenRouter couldn't be reached (or failed itself) or turned the turn down.
        {
          const rejected = err.kind === 'http' && err.status !== undefined && err.status >= 400 && err.status < 500;
          emit({ type: 'notice', text: rejected ? '// OPENROUTER REJECTED THIS TURN' : "// CAN'T REACH OPENROUTER — CHECK YOUR CONNECTION" });
        }
        return { ok: false, error: 'unreachable' };
      default:
        emit({ type: 'link', status: 'down' });
        return { ok: false, error: 'unreachable' };
    }
  }
}
