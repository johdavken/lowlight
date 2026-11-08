import { parsePhotoReply, photoForModel, photosLine, type Photo } from '../../shared/photos';
import { type TrustControl } from './standing';
import { commsKey, parseComms, type CommsState } from '../../shared/comms';
import { arrangementLine } from '../../shared/arrangement';
import type { ChatMessage, ChatMode, ContactCard, CrewView, GuestCard, PlanCard, RoomState, ServerEvent, Take } from '../../shared/types';
import { type Recruit } from '../../shared/crew';
import { crewLine } from '../../shared/crew-line';
import type { CrewState } from '../../shared/crew-fold';
import { type Ability, type Trait } from '../../shared/crew-book';
import type { Db, RebuildResult } from './db';
import { OK, roomChanges, type Room, type Result } from './room-state';
import { buildMessages, HISTORY_WINDOW, type Turn } from './history';
import { MAX_TEXT_CHARS, splitBubbles, textsBlock } from '../../shared/texts';
import { parsePromise, promiseKey, promiseSpentKey, promiseTriesKey } from '../../shared/promise';
import type { Pronoun } from '../../shared/pronoun';
import { readSummary } from './summary';
import type { Backend } from './backend';
import { NO_LINK_NOTICE, TurnError, STREAM_OPEN_EVENT, type CompletionMessage, type ModelPair } from './turn';
import { wearingLine, type WearEntry } from './wearing';
import { whoIsYou, TEXT_HEADING, TEXT_INSTRUCTIONS, promisedLine, textPlanLine, textWhereLine, herLeaveInstructions, END_SCENE_INSTRUCTIONS, LEAVE_INSTRUCTIONS, COMMS_BACK_INSTRUCTIONS, COMMS_DROP_LINE, COMMS_HANGUP_INSTRUCTIONS, COMMS_TRAVEL_INSTRUCTIONS, commsLine, beatLine, RP_HEADING, GREET_INSTRUCTIONS, SCENE_GREET_INSTRUCTIONS, GREET_PLACEHOLDER, LIGHTS_LINE, OOC_INSTRUCTIONS, ROLEPLAY_GUIDE, ROOM_INSTRUCTIONS, TRAVEL_INSTRUCTIONS, TRAVEL_LINE, ENCOUNTER_INSTRUCTIONS, QUEST_INSTRUCTIONS, GIG_INSTRUCTIONS, DICE_INSTRUCTIONS, endSceneText, othersBlock, strangerBlock, type OtherVoice } from './instructions';
import { echoLine } from './echoes';
import { habitsLine, readHabits } from './habits';
import { parsePlan, parseSay, planKey, planSayKey, planSeenKey } from '../../shared/plan';
import { encounterText, parseEncounter, strangerAt, type Encounter } from '../../shared/encounter';
import { gigActionLine, gigText, type GigSnapshot } from '../../shared/gig/brief';
import { diceActionLine, diceText, type DiceSnapshot } from '../../shared/dice/text';
import { arrivalLine, greetDue } from './greet';
import { formatClock, promptClock, TURN_COST } from '../../shared/clock';
import { pageLine, type Journal } from './journal';
import type { Player } from './players';
import { LORE_WINDOW, loreBlock, loreLogLine, mentionsKeys, type LoreLine, type LoreSelection } from '../../shared/lore';
import { leadsBlock, leadsLogLine, type LeadEntry, type LeadsForTurn } from '../../shared/leads';
import { sceneBlock, WRITTEN_SCENE_TITLE } from '../../shared/scenario';
import { moveLine } from '../../shared/arrival';
import type { Extra } from '../../shared/extras';
import { questRowText, type CondCtx, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { oneLine } from './persona';
import { type CostId } from '../../shared/costs';
import { type GmComplete } from './gm';
import { type Kit } from '../../shared/mission';
import { type StockItem } from '../../shared/stock';
import type { Deck } from '../../shared/gear';
import { type Program } from '../../shared/programs';
import { gambleDie } from '../../shared/dice';
import { type JobHire } from '../../shared/quests';
import { JobRunner } from './job-runner';

export { NO_LINK_NOTICE } from './turn';

/** The job game's book: crew, kit, contacts and districts, as the runtime hands them over. */
export type QuestDeps = NonNullable<ChatRelayDeps['quests']>;

export interface ChatRelayDeps {
  /** The GM (roll lifecycle spec §1.4): one call voices a costly roll's dealt costs. Absent (no link): written lines only. */
  gm?: GmComplete;
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
  /** The story moved the clock live (a new turn row, her pass_time, the Residual's backstop), never a swipe or rewind: the room may follow the story (story moods spec §3). */
  onLiveClock?: () => void;
  /** Her `[your schedule: …]` line for this turn (null: no schedule). */
  scheduleLine?: (clock: number) => string | null;
  /** `[city: the power is out across Karasu since 22:00]` while her room's district is dark at `clock` (blackouts phase 3 §5). */
  cityLine?: (clock: number) => string | null;
  /** Her `[you were there: …]` line (witness lines spec §3): what she was in the room for elsewhere. Absent: none. */
  witnessedLine?: (player: string) => string | null;
  /** The scene behind that line, word for word (witness lines, 2026-11-06). Absent: none. */
  witnessedScene?: (player: string) => string | null;
  /**
   * Her plan's card for `player` (her plans spec §5): a going plan that stands while she's with you, off comms;
   * null otherwise. Absent: plans don't apply.
   */
  planCard?: (player: string) => { name: string; going: string; meet: { place: string; time: string } | null; from: string } | null;
  /**
   * Her plan's line for this turn (spec §6), and whether her reply spends the plan; null: nothing. `raw` stands in
   * for the stored plan (a regenerate reads it as it was before the take it replaces spent it).
   */
  planNote?: (mode: ChatMode, raw?: string | null, rawSeen?: string | null) => { line: string | null; spend: boolean } | null;
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
   * `recent` says who wrote each line, and `present` who is in the scene (lore picking spec §2, §3).
   */
  lore?: (sceneId: string, recent: readonly LoreLine[], force?: readonly string[], present?: readonly string[]) => LoreSelection;
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
  /** Her `[cipher]` block (cipher spec §2.6): the open truths she knows; null when she knows none. In character only. */
  cipher?: (player: string) => string | null;
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
    /** The ids of the leads `player` holds; absent: none. */
    heldLeads?(player: string): string[];
    /** Missions (spec 2026-10-18): the player's kit now (sol, heat, deck, EDGE left), and the deck catalog. Absent: no kit, no decks. */
    kit?(player: string, at?: number): Kit;
    decks?(): Deck[];
    /** The program catalog (spec 2026-11-02-programs §1.6); absent: none. */
    programs?(): Program[];
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
    /** Has any contact's room stored `key`? */
    heard?(key: string): boolean;
    /** Contact cards the player holds (contact cards spec §1). */
    contactCards?(): ContactCard[];
    /** Guest files (The Passenger spec, engine §2): someone a mission brings who isn't a contact. */
    guestCards?(): GuestCard[];
    /** The crew book's traits (the hand spec §2: never-held on a call's loss). */
    crewTraits?(): Trait[];
    /** The crew book's abilities (crew abilities spec §2): labels, effects and timings at the table. */
    crewAbilities?(): Ability[];
    /** The GM's written lines by cost (`world/gm/costs.md`, roll lifecycle spec §1.4); absent: the built-in ones. */
    gmWritten?(): Partial<Record<CostId, string[]>>;
    /** The latest `until` any room's `crewTold.<player>` holds (crew spec §5's `[crew]` line); null: none told yet. */
    crewToldUntil?(): number | null;
    /** The recruit a job's `gives: recruit` card draws (crew spec §5), for the debrief's line; absent: no line. */
    jobRecruit?(o: { runKey: string; title: string; place: string; district: string } & JobHire): Recruit;
    /** A district's display name (the favour's line); absent: its id title-cased. */
    districtName?(id: string): string;
  };
  /** A check's dice (the table spec §1): `n` d6 faces for a roll keeping `keep`. Default: random; tests and e2e pass their own. */
  rollDice?: (n: number, keep: 'high' | 'low') => number[];
  /** A gamble's die (tests); else seeded by `gambleDie`. */
  gambleDie?: (seed: string) => number;
  /** A rerun's faces (tests); else seeded by `rerunRoll`. */
  rerunFaces?: (seed: string) => number[];
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
  /** Before a turn asks her model: the last reply's residual, if it's still running (scribe spec §2). */
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

function samePair(a: ModelPair | null, b: ModelPair): boolean {
  return a !== null && a.model === b.model && a.provider === b.provider;
}

/** Which feed a row belongs to: the deck's texts, or the scene (deck spec §3). */
const feedOf = (m: ChatMessage): 'text' | 'scene' => (m.mode === 'text' ? 'text' : 'scene');
/** With no `[crew]` line told yet, the last six story hours (crew spec §5): an old save doesn't recite its history. */
const CREW_LINE_FALLBACK = 360;

/** Whose key a failed turn went to, for the player's notice. */
const providerName = (err: TurnError): string => (err.provider === 'anthropic' ? 'ANTHROPIC' : 'OPENROUTER');

/**
 * Relays chat turns between the browser and her model. Lowlight owns the conversation: each turn
 * sends the room note, the room's recent history and `[room: …] + userText` through her backend,
 * streams the reply back as `nix_delta` events, and persists it + the link status.
 */
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
  /** The offer of the last turn, kept past its end for the Residual. */
  private spentOffer: LeadEntry[] = [];

  private readonly backend: Backend;
  /** The job game (job-runner.ts): it reaches the turn only through the host below. */
  private readonly jobs: JobRunner;

  constructor(private readonly deps: ChatRelayDeps) {
    this.backend = deps.backend;
    this.pid = deps.players.defaultId;
    const relay = this;
    this.jobs = new JobRunner(deps, {
      get pid() {
        return relay.pid;
      },
      enter: (player) => this.enter(player),
      pair: () => this.pair(),
      get busy() {
        return relay.turnActive;
      },
      get ready() {
        return relay.ready;
      },
      get turnPlayerName() {
        return relay.turnPlayer?.name ?? null;
      },
      keepShownTake: () => this.keepShownTake(),
      insertTurnRow: (row, extraMinutes, base) => this.insertTurnRow(row, extraMinutes, base),
      emitPair: (e) => this.emitPair(e),
      flushLiveClock: () => this.flushLiveClock(),
      runTurn: (row) => this.runTurn(row),
      emitPlanCard: (player) => this.emitPlanCard(player),
    });
  }

  // The job game's public moves (job-runner.ts has them and their docs).
  questState(...a: Parameters<JobRunner['questState']>) {
    return this.jobs.questState(...a);
  }
  questStateFor(...a: Parameters<JobRunner['questStateFor']>) {
    return this.jobs.questStateFor(...a);
  }
  questCheck(...a: Parameters<JobRunner['questCheck']>) {
    return this.jobs.questCheck(...a);
  }
  emitQuestState(...a: Parameters<JobRunner['emitQuestState']>) {
    return this.jobs.emitQuestState(...a);
  }
  buy(...a: Parameters<JobRunner['buy']>) {
    return this.jobs.buy(...a);
  }
  carry(...a: Parameters<JobRunner['carry']>) {
    return this.jobs.carry(...a);
  }
  crew(...a: Parameters<JobRunner['crew']>) {
    return this.jobs.crew(...a);
  }
  walkAway(...a: Parameters<JobRunner['walkAway']>) {
    return this.jobs.walkAway(...a);
  }
  startQuest(...a: Parameters<JobRunner['startQuest']>) {
    return this.jobs.startQuest(...a);
  }
  chooseQuest(...a: Parameters<JobRunner['chooseQuest']>) {
    return this.jobs.chooseQuest(...a);
  }
  questWaitStop(...a: Parameters<JobRunner['questWaitStop']>) {
    return this.jobs.questWaitStop(...a);
  }
  playDueQuest(...a: Parameters<JobRunner['playDueQuest']>) {
    return this.jobs.playDueQuest(...a);
  }
  commsNow(...a: Parameters<JobRunner['commsNow']>) {
    return this.jobs.commsNow(...a);
  }
  diceRefusal(...a: Parameters<JobRunner['diceRefusal']>) {
    return this.jobs.diceRefusal(...a);
  }
  commsCan(...a: Parameters<JobRunner['commsCan']>) {
    return this.jobs.commsCan(...a);
  }
  jobOn(...a: Parameters<JobRunner['jobOn']>) {
    return this.jobs.jobOn(...a);
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
   * The Residual's time backstop (spec 2026-10-20): her finished reply `id`, take `take`, told time she
   * didn't pass; its clock moves on by `minutes`, the shown take's `passed` with it. Refused once a later
   * row exists or the story clock moved on elsewhere (the next line is already stamped), or while a turn runs.
   */
  residualPass(player: string, id: string, take: number, minutes: number): Result {
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
  /** The Residual recorded a lead she told (give_lead's line, as a notice), so QUEST and any contract it opens catch up. */
  leadRecorded(player: string, title: string): void {
    this.deps.emit({ type: 'notice', text: `// LEAD — ${title} (JOBS → LEADS)`, for: 'quest' }, player);
    this.jobs.emitQuestState(player);
  }

  offeredLeads(): LeadEntry[] {
    return this.turnActive ? this.turnOffer : [];
  }

  /** What the last turn offered, for the Residual, which runs once it's over. */
  lastOffer(): LeadEntry[] {
    return this.spentOffer;
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
    const line = mode === 'end' && o.leave ? this.jobs.commsNow(this.pid) : null;
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
    // The hub has checked its shape; this is the backstop (and drops a stranger whose name is taken, or a face
    // that isn't one of the extras: the played card comes back from the browser).
    const extras = this.deps.quests?.extras?.() ?? [];
    const event = parseEncounter(e, reserved, { faceOk: (id) => extras.some((x) => x.id === id) });
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
      encounter: {
        title: event.title,
        ...(event.stranger ? { stranger: { name: event.stranger.name, voice: event.stranger.voice, ...(event.stranger.face ? { face: event.stranger.face } : {}) } } : {}),
        ...(event.power ? { power: event.power } : {}),
      },
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

  /** This turn's reply spends her plan (spec §6). */
  private planSpend = false;

  /** What each pair's tabs last heard of her plan's card. */
  private readonly planShown = new Map<string, string>();

  /** Her plan's card as the page shows it; null: none; undefined: plans don't apply in this room. */
  planCardFor(player: string): PlanCard | null | undefined {
    if (!this.deps.planCard) return undefined;
    const c = this.deps.planCard(player);
    // A quest's panel holds the same spot (and the scene is the job): her plan's card waits till it's gone.
    if (c && this.questState(player).active) return null;
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
    if (!this.planCardFor(player)) return this.refusedPlan(player, 'no-plan');
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
  private planBeforeTake(): [string | null, string | null] | [] {
    if (this.target.kind !== 'take') return [];
    const id = this.target.reply.id;
    const metas = this.deps.db.writes().filter((w) => w.kind === 'meta');
    const rows = metas.filter((w) => w.key === planKey(this.pid));
    const last = rows.at(-1);
    if (!last || last.messageId !== id || last.value !== null) return [];
    // The spend took the marks too: the new take's line comes from them (shared plans review).
    const seen = metas.filter((w) => w.key === planSeenKey(this.pid) && w.messageId !== id).at(-1)?.value ?? null;
    return [rows.findLast((w) => w.messageId !== id)?.value ?? null, seen];
  }

  /**
   * Her one-time plan lines (shared plans spec §4, §5): given only on the turn right after the reply that made them.
   * Nothing is spent, so a regenerate of that turn hears them too.
   */
  private planSayLine(userMessage: ChatMessage): string | null {
    if (userMessage.mode === 'ooc' || userMessage.mode === 'end') return null;
    const say = parseSay(this.deps.db.getMeta(planSayKey(this.pid)));
    if (!say) return null;
    const replies = this.deps.db.recentMessages(this.pair(), 20, 'scene').filter((m) => m.role !== 'user' && m.status !== 'streaming' && m.ts < userMessage.ts);
    return replies.at(-1)?.id === say.from ? say.lines.join('\n') : null;
  }

  /**
   * GO WITH HER (her plans spec §5): the plan goes, under the reply that made it, so a rewind brings it back.
   * `going` is the room she was heading for, so the hub can walk you there together.
   */
  dropPlan(player: string): Result & { going?: string } {
    if (this.turnActive) return this.refusedPlan(player, 'busy');
    this.enter(player);
    const { db } = this.deps;
    const plan = parsePlan(db.getMeta(planKey(this.pair())));
    // Only with a card up (mid review M5): a stale tab can't drop a meeting she made while you were apart.
    if (!plan || !this.planCardFor(player)) return this.refusedPlan(player, 'no-plan');
    const from = db.getMessage(this.pair(), plan.from);
    db.withStamp({ messageId: plan.from, take: from?.takes?.index ?? 0 }, () => db.deleteMeta(planKey(this.pair())));
    this.emitPlanCard(player);
    return plan.going ? { ...OK, going: plan.going.place } : OK;
  }

  /** Her leave note for a parting row: where her plan sends her, as the card names it. */
  private herLeaveNote(): string {
    const c = this.deps.planLeave?.(this.pid) ?? this.deps.planCard?.(this.pid);
    return herLeaveInstructions(c?.going ?? 'where you said', c?.meet ?? null);
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
    if (this.jobs.silentMissionRow(existing)) return { ok: false, error: 'mission-beat' };

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
      const dropped = this.dropLine && ok ? this.jobs.commsNow(this.pid) : null;
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
      this.jobs.emitQuestState();
      // A quest waiting for this moment (her reply crossed the hour, a move arrived) plays now (quest waits spec §3).
      // Not after OOC (an aside) or a goodbye (END SCENE / LEAVE): the beat waits for the next line in character, or WAIT.
      if (ok && userMessage.mode !== 'ooc' && userMessage.mode !== 'end' && userMessage.mode !== 'text') void this.jobs.playDueQuest(this.pid).catch(() => {});
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
    if (this.jobs.silentMissionRow(m)) return { ok: false, error: 'mission-beat' };
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
    // A Residual still reading this reply would land inside the keep going (a failure drops it): it stops, and re-reads after.
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
    // An event row's stranger keeps a face only if it's one of the extras (the line comes back from the browser).
    const face = line.encounter?.stranger?.face;
    const extras = this.deps.quests?.extras?.() ?? [];
    if (line.encounter?.stranger && face && !extras.some((x) => x.id === face)) {
      const { face: _face, ...stranger } = line.encounter.stranger;
      line.encounter = { ...line.encounter, stranger };
    }
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
    this.jobs.emitQuestState();
    // The cut lines' stamps went with them: the story clock is back at the line's time.
    this.deps.onClock?.();
    return OK;
  }

  /** Rebuilds the story tables from the write log and shows what changed. */
  private rebuild(show?: { messageId: string; take: number }): void {
    const r = this.deps.db.rebuild(show ? { show } : undefined);
    this.deps.onRebuild?.(r);
    this.jobs.emitQuestState();
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

  /**
   * The `[crew]` line for this turn (crew spec §5): what landed since the last turn any room told, through now. Each
   * landing is told once; a regenerate or retry of the same message tells the same ones. Kept in plain meta
   * `crewTold.<pair>` (not story meta, like `seen.<pair>`: a rewind leaves it, and at worst a landing goes untold).
   */
  private crewLineFor(userMessage: ChatMessage): string | null {
    const crew = this.deps.quests?.crewState?.() ?? null;
    const now = this.deps.clockNow?.() ?? null;
    if (!crew || now === null) return null;
    const key = `crewTold.${this.pair()}`;
    type Told = { messageId: string; since: number; until: number };
    const mine = ((): Told | null => {
      try {
        return JSON.parse(this.deps.db.getMeta(key) ?? 'null') as Told | null;
      } catch {
        return null;
      }
    })();
    let told: Told;
    if (mine?.messageId === userMessage.id) told = mine;
    else {
      const last = this.deps.quests?.crewToldUntil?.() ?? null;
      told = { messageId: userMessage.id, since: last ?? now - CREW_LINE_FALLBACK, until: now };
      this.deps.db.setMeta(key, JSON.stringify(told));
    }
    return crewLine(crew, told.since, told.until);
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
    const kit = this.jobs.kitLineFor(player);
    const job = this.jobs.jobLineFor();
    const board = userMessage.mode !== 'ooc' && userMessage.mode !== 'end' ? this.jobs.boardLineFor(player.name) : null;
    const jobsWith = this.jobs.jobsWithLine();
    // In character only, like the lights line: no client pitched in an OOC aside or an END SCENE recap.
    const inCharacter = userMessage.mode !== 'ooc' && userMessage.mode !== 'end';
    const clients = inCharacter ? this.jobs.clientsLineFor() : null;
    const deal = inCharacter ? this.jobs.arrangementNow() : null;
    const arrangement = deal ? arrangementLine({ player: player.name, ...deal }) : null;
    const witnessed = inCharacter ? (this.deps.witnessedLine?.(player.id) ?? null) : null;
    const witnessedScene = inCharacter ? (this.deps.witnessedScene?.(player.id) ?? null) : null;
    const you = [player.line, kit, jobsWith, witnessed, witnessedScene, ...this.jobs.settledLines(), job, board, clients, arrangement].filter((x): x is string => Boolean(x)).join('\n') || null;
    // On comms you didn't arrive together, and walking back to her she greets you (comms review I4): no TRAVEL_LINE for either.
    const commsTravel = userMessage.mode === 'travel' && (this.jobs.commsNow(this.pid)?.on === true || this.hungUpBy(userMessage.id));
    const arrival = userMessage.mode === 'greet' ? this.arrival(userMessage) : userMessage.mode === 'travel' && !commsTravel ? TRAVEL_LINE : null;
    // Comms (spec 2026-10-20 §2): where she is and where you are, in character only; she's not there to touch the lights.
    const places = userMessage.mode !== 'ooc' && userMessage.mode !== 'end' && this.jobs.commsNow(this.pid)?.on ? (this.deps.commsPlaces?.(this.pid) ?? null) : null;
    // The deal stepped back while on the line (spec §1): this reply signs off, then the line drops (turn end).
    this.dropLine = places !== null && !this.jobs.commsCan(this.pid);
    const comms = places ? `${commsLine({ herPlace: places.her, yourPlace: places.you, player: player.name })}${this.dropLine ? `\n${COMMS_DROP_LINE}` : ''}` : null;
    // In character, the lights rule opens the lines by their words, after any change (not OOC, not an END SCENE's recap turn, not from her desk).
    const lights = userMessage.mode === 'ooc' || userMessage.mode === 'end' || comms ? null : LIGHTS_LINE;
    // A plain in-character turn: the length and their-part rules, last before their words (prompt measurement 2026-10-20).
    const beat = userMessage.mode === undefined ? beatLine(player.name) : null;
    // What she keeps writing, right before the beat (the lantern in eight replies running).
    const echo = beat ? this.echoLineFor(userMessage) : null;
    // What she keeps writing over the longer stretch (habits spec §2): the Residual's rules, before the echo line; not on comms.
    const habits = beat && !comms ? habitsLine(readHabits(this.deps.db, this.pair())?.rules ?? []) : null;
    // Her plan (spec 2026-10-21 §6): the meeting you came to, or the one you missed; her reply spends an ended plan.
    const planNote = this.deps.planNote ? this.deps.planNote(userMessage.mode ?? 'rp', ...this.planBeforeTake()) : null;
    this.planSpend = planNote?.spend === true;
    const plan = [planNote?.line, this.planSayLine(userMessage)].filter(Boolean).join('\n') || null;
    const [since, clothes] = this.changedLines(userMessage, wearing);
    // What the crew did off-screen since the last contact turn (crew spec §5): in character, not her greeting.
    const crew = inCharacter && userMessage.mode !== 'greet' ? this.crewLineFor(userMessage) : null;
    if (!journal) return [since, lights, clothes, this.timeLine(), crew, comms, presence, arrival, plan, you, habits, echo, beat].filter((l): l is string => l !== null);
    // The gap is measured from the latest message that isn't this turn's own user message (a retry
    // reuses an old one) or the reply now streaming.
    const last = db
      .recentMessages(this.pair(), 20, 'scene')
      .filter((m) => m.id !== userMessage.id && m.status !== 'streaming')
      .reduce<number | null>((max, m) => (max === null || m.ts > max ? m.ts : max), null);
    const greeting = userMessage.mode === 'greet';
    return [since, lights, clothes, this.timeLine(), crew, comms, presence, journal.journalLine(this.pair(), recent), journal.previouslyLine(this.pair(), last, greeting), arrival, plan, you, habits, echo, beat].filter(
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

  /** Set while building a turn on comms whose deal has stepped back: her reply signs off and the line drops. */
  private dropLine = false;

  /** Whether row `id` ended a comms line (HANG UP): it wrote `{ on: false }` over a line that was on. */
  private hungUpBy(id: string): boolean {
    const key = commsKey(this.pid);
    const writes = this.deps.db.writes().filter((w) => w.kind === 'meta' && w.key === key);
    const at = writes.findIndex((w) => w.messageId === id);
    return at > 0 && parseComms(writes[at].value ?? null)?.on === false && parseComms(writes[at - 1].value ?? null)?.on === true;
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
   * Each says who wrote it: yours, or hers; the opening scene's counts as yours, as it sets the scene for both.
   */
  private loreRecent(userMessage: ChatMessage, turnText: string | null, scene: ChatMessage | null): LoreLine[] {
    const older = this.deps.db
      .recentMessages(this.pair(), LORE_WINDOW + 2, 'scene')
      // Not this turn's own line, and not the take a regenerate replaces (the model never sees it either).
      .filter((m) => m.id !== userMessage.id && !(this.target.kind === 'take' && m.id === this.target.reply.id) && m.text !== '' && m.mode !== 'scene')
      .map((m): LoreLine => ({ text: m.text, by: m.role === 'user' ? 'you' : 'them' }))
      .reverse()
      .slice(0, LORE_WINDOW);
    const recent: LoreLine[] = turnText !== null && turnText !== '' ? [{ text: turnText, by: 'you' }, ...older] : older;
    return scene ? [...recent, { text: scene.text, by: 'you' }] : recent;
  }

  /** Who is in the scene, for lore (spec §2): her and the turn's player. A scene adds its others; a text has none. */
  private lorePresent(player: string): string[] {
    return [this.deps.self?.().name ?? this.deps.agentName, player].filter((n): n is string => typeof n === 'string' && n !== '');
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
      .map((m): LoreLine => ({ text: m.text, by: m.role === 'user' ? 'you' : 'them' }))
      .reverse()
      .slice(0, LORE_WINDOW);
    const recentLines: LoreLine[] = [{ text: userMessage.text, by: 'you' }, ...older];
    const recentText = recentLines.map((l) => l.text);
    const lore = this.deps.lore ? this.deps.lore(this.deps.room.state.sceneId, recentLines, undefined, this.lorePresent(player.name)) : null;
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
            ? this.jobs.commsNow(this.pid)?.on
              ? COMMS_TRAVEL_INSTRUCTIONS
              : this.hungUpBy(userMessage.id)
                ? COMMS_BACK_INSTRUCTIONS
                : TRAVEL_INSTRUCTIONS
            : userMessage.mode === 'encounter'
              ? ENCOUNTER_INSTRUCTIONS
              : userMessage.mode === 'quest'
                ? `${this.jobs.missionNote(userMessage) ?? QUEST_INSTRUCTIONS}\n\n${whoIsYou((this.turnPlayer ?? this.deps.players.resolve(this.pair())).name)}`
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
              ? questRowText({ title: userMessage.quest?.title ?? '', text: userMessage.text, run: userMessage.quest?.run, heard: userMessage.quest?.heard }, oneLine, player.name)
            : userMessage.mode === 'gig' && userMessage.gig
              ? gigText(userMessage.gig)
              : userMessage.mode === 'dice' && userMessage.dice
                ? diceText(userMessage.dice)
                : userMessage.text;
    // The lore for this room and what was just said: her identity, then the book's block.
    const recentLines = this.loreRecent(userMessage, target.kind === 'continue' ? null : turnText, scene);
    const recentText = recentLines.map((l) => l.text);
    const papers = userMessage.mode === 'gig' ? userMessage.gig?.papers : undefined;
    const force = papers ? [...new Set([...papers.bulletin.map((b) => b.lore), ...(papers.extraLore ?? [])])] : null;
    // Present (spec §2): her, the player and the turn's own others (none out of character), as the [others] line has them.
    const lore = this.deps.lore ? this.deps.lore(room.state.sceneId, recentLines, force ?? undefined, [...this.lorePresent(player.name), ...others.map((o) => o.name)]) : null;
    if (lore) emit({ type: 'dev_log', level: 'info', text: loreLogLine(lore) });
    const loreText = lore ? loreBlock(lore.picks.map((p) => p.entry)) : null;
    // Leads (in character only): what's on her mind, what she could give, and what you hold that points to her.
    // A regenerate reads the table before the new take's rebuild: what the old take gave isn't held in the new one.
    const replaced = target.kind === 'take' ? db.leadsGiven(player.id).filter((l) => l.messageId === target.reply.id).map((l) => l.id) : [];
    const leads = inCharacter && this.deps.leads ? this.deps.leads(player.id, recentText, replaced) : null;
    this.turnOffer = leads?.offer ?? [];
    this.spentOffer = this.turnOffer;
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
    // Contact cards (spec §4): a job elsewhere that went bad after her card played costs her trust now, stamped to this turn's line.
    if (inCharacter && target.kind !== 'continue') {
      this.jobs.contactBurns(player.id);
      this.jobs.guestNotes(player.id);
    }
    const standingText = inCharacter ? (this.deps.standing?.(player.id, target.kind === 'take' ? target.reply.id : null) ?? null) : null;
    // Cache-friendly order (scribe spec §7): what rarely changes in the system message; what changes turn to turn with the turn.
    const instructions = [this.deps.identity?.(), note, sceneText, player.whosHere, othersNote].filter(Boolean).join('\n\n');
    // The quest at a beat here (in character only): the beat, the shown choices and their view (quest lines spec §3).
    const questText = inCharacter ? this.jobs.questBlockFor(player.id, userMessage.mode === 'quest' && target.kind !== 'continue') : null;
    // Texts from the last story day (deck spec §3): the scene knows what was said on the deck.
    const textsNote = inCharacter ? this.textsNote(player) : null;
    // Cipher (spec §2.6): what she keeps from them, after how she feels about them.
    const cipherText = inCharacter ? (this.deps.cipher?.(player.id) ?? null) : null;
    const blocks = [modeNote, loreText, page, standingText, cipherText, leadsText, questText, strangerNote, textsNote].filter((b): b is string => Boolean(b));
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
    return buildMessages({ instructions, history: this.turnHistory(userMessage), turn, summary: readSummary(db, this.pair()), player: player.name });
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
        emit({ type: 'notice', text: `// ${providerName(err)} CREDIT IS OUT` });
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
        // The key is the player's own: say whether its provider couldn't be reached (or failed itself) or turned the turn down.
        {
          const rejected = err.kind === 'http' && err.status !== undefined && err.status >= 400 && err.status < 500;
          const who = providerName(err);
          emit({ type: 'notice', text: rejected ? `// ${who} REJECTED THIS TURN` : `// CAN'T REACH ${who} — CHECK YOUR CONNECTION` });
        }
        return { ok: false, error: 'unreachable' };
      default:
        emit({ type: 'link', status: 'down' });
        return { ok: false, error: 'unreachable' };
    }
  }
}
