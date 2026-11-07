import { parsePhotoReply, photoForModel, photosLine, type Photo } from '../../shared/photos';
import { UNPAID_REASON, type TrustControl } from './standing';
import { commsKey, parseComms, type CommsState } from '../../shared/comms';
import { arrangementActive, arrangementKey, arrangementLine, chairTwoChecks, cutOf, parseArrangement, retainerToCut, type Arrangement, type ChairCheck } from '../../shared/arrangement';
import type { ChatMessage, ChatMode, ContactCard, CrewAction, CrewView, Debrief, PlanCard, QuestState, RoomState, ServerEvent, SetupOffer, HandView, ProgramPreview, Take } from '../../shared/types';
import { BAIL, DOC, jobWords, rescueOpen, type Recruit } from '../../shared/crew';
import { crewLine } from '../../shared/crew-line';
import { agoWords } from '../../shared/witness';
import { STASH_MAX } from '../../shared/goods';
import type { CrewEvent, CrewMember, CrewState } from '../../shared/crew-fold';
import { TIMING, worksInGraft, type Ability, type Grade, type Specialty, type Trait } from '../../shared/crew-book';
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
import { whoIsYou, TEXT_HEADING, TEXT_INSTRUCTIONS, promisedLine, textPlanLine, textWhereLine, herLeaveInstructions, END_SCENE_INSTRUCTIONS, LEAVE_INSTRUCTIONS, COMMS_BACK_INSTRUCTIONS, COMMS_DROP_LINE, COMMS_HANGUP_INSTRUCTIONS, COMMS_TRAVEL_INSTRUCTIONS, commsLine, beatLine, RP_HEADING, GREET_INSTRUCTIONS, SCENE_GREET_INSTRUCTIONS, GREET_PLACEHOLDER, LIGHTS_LINE, OOC_INSTRUCTIONS, ROLEPLAY_GUIDE, ROOM_INSTRUCTIONS, TRAVEL_INSTRUCTIONS, TRAVEL_LINE, ENCOUNTER_INSTRUCTIONS, QUEST_INSTRUCTIONS, MISSION_OPEN, MISSION_CLOSE, GIG_INSTRUCTIONS, DICE_INSTRUCTIONS, endSceneText, othersBlock, strangerBlock, type OtherVoice } from './instructions';
import { echoLine } from './echoes';
import { habitsLine, readHabits } from './habits';
import { parsePlan, parseSay, planKey, planSayKey, planSeenKey } from '../../shared/plan';
import { encounterText, parseEncounter, strangerAt, type Encounter } from '../../shared/encounter';
import { gigActionLine, gigText, type GigKind, type GigSnapshot } from '../../shared/gig/brief';
import { diceActionLine, diceText, type DiceSnapshot } from '../../shared/dice/text';
import { arrivalLine, greetDue } from './greet';
import { formatClock, hhmmOf, promptClock, START, TURN_COST } from '../../shared/clock';
import { pageLine, type Journal } from './journal';
import type { Player } from './players';
import { LORE_WINDOW, loreBlock, loreLogLine, mentionsKeys, type LoreLine, type LoreSelection } from '../../shared/lore';
import { leadsBlock, leadsLogLine, type LeadEntry, type LeadsForTurn } from '../../shared/leads';
import { sceneBlock, WRITTEN_SCENE_TITLE } from '../../shared/scenario';
import { moveLine } from '../../shared/arrival';
import type { Extra } from '../../shared/extras';
import { beatAt, beatAway, beatText, beatViews, fillHire, heardAt, isJob, ownedBy, postsOpen, mentionsFlag, chooseVariant, fillTimes, flagsOf, holds, openQuests, pickLine, stepMinutes, type CrackPick, questWaitBlock, startWait, waitDue, waitLine, type Outcome, type RunWait, questBlock, questKey, questRowText, shownChoices, type Beat, type CondCtx, type QuestEntry, type QuestRun, type QuestStatus } from '../../shared/quests';
import { oneLine } from './persona';
import { boardBlock, bookId, buildDebrief, clientsBlock, contractBlock, BURNER, coverCards, coveredLoss, crackLine, crackSetup, drawsFor, effectEvent, FALL_GUY, fallGuyFee, jobRunId, missionOpenBlock, missionSummary, payFor, playerKitLine, legacyRollLine, REROLL, rollLine, seedFor, STEADY, TAKE, AFTER, COST, RESIST, ARMOUR } from './mission-run';
import { COSTS, dealCosts, firstCost, picksFor, resistPrice, RESIST_CHROME_DIE, type CostId } from '../../shared/costs';
import { writtenLine } from '../../shared/gm-lines';
import { askGm, GM_HOLD_MS, gmMessages, type GmComplete } from './gm';
import { HEAT_MAX, heatIn, outcomeTier, repDelta, repTier, TIER_NAMES, type Check, type CoverId, type Kit, type KitEvent, type Tier } from '../../shared/mission';
import { hashSeed, postedJobs, storyDay } from '../../shared/board';
import { rng } from '../../shared/rng';
import { angleFlags, contractRep, GUEST_ABILITIES, guestFlags, guestId, NIGHT_ALARM_MAX, nightAlarm, WALK_AWAY_REP } from '../../shared/contract';
import { withGuest } from './guest';
import { makeTerminal, playTerminal, type TerminalSetup } from '../../shared/crack';
import { buyEvent, canBuy, fixerKey, itemName, parseFixer, type StockItem } from '../../shared/stock';
import type { Deck } from '../../shared/gear';
import { belowTier, FIREWALL, HOT_LOAD_NERVE, jobLeans, programJudge, slotsFor, type Program } from '../../shared/programs';
import { DEFAULT_STATS } from '../../shared/stats';
import { kitLine } from '../../shared/kit-line';
import { afterEffect, CARRY_ON, rerunRoll, swappedCheck, ALARM_SHIFT, gambleDie, gambleFaces, gambleResult, stepRefusal, crackTake, statDice, ALARM_MAX, effectPushRefusal, fragileDies, kindResult, poolOf, POOL_MAX, PRESS_NERVE, PUSH_NERVE, resultOf, jobTakeSize, tierLine, tradeRefusal, type DiceResult, type Pool, type Effect, type Position, type PushMode, type Trade } from '../../shared/dice';
import { abilityCard, abilityCardId, abilityEffect, abilityNerve, AGAIN_RISK, CALL_VERB, callEffect, pressed, CONTACT_BURN, CONTACT_BURN_REASON, CONTACT_VERB, contactId, crewLines, FAVOUR_BURN, FAVOUR_ON_HOLD, MAX_CONTACTS, favourFor, hardStartTake, type Setup, jobShares, lossOnAgain, MAX_PEOPLE, SPEC_STAT, type Approach, type Call, type CallEffect } from '../../shared/hand';
import { ceilingOf, settleTake, takeOf } from './take-run';
import { effectTagOf, isLegacyPending, isLegacyRoll, isOldRun, parseRun as parseRunOf, withGetaway, withSpring, type Choice, type JobHire, type DealtCost, type DicePending, type DiceRoll, type Roll, type SettledCost } from '../../shared/quests';
import { canOffer, dropTake, heatLeft, lossEvents, nextPushBeat, PRESS, PUSH_BEAT, WALK, walkValue } from './push-run';

/** A turn that found no key linked (unlinked mid-session): the player relinks at select. */
export const NO_LINK_NOTICE = '// NO LINK — RELINK AT SELECT';

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

const OK: Result = { ok: true, text: 'ok' };
/** A dealt roll's picks are all made and settled (roll lifecycle spec §1.3). */
/** A card's preview on a choice; `presses`, on a call, what each ability beside it would make the roll (ability pass spec §1). */
type Play = NonNullable<NonNullable<QuestState['active']>['choices'][number]['plays']>[string];
/** A card's effect with no step, to ask whether a press's step has anything to move. */
const stepless = ({ step: _step, ...e }: CallEffect): CallEffect => e;
/** The ability pass's AFTER A ROLL kinds (spec §2), and what AT THE END `end-cool` takes off. */
const PASS_AFTER = new Set<string>(['gamble-cost', 'gamble-miss', 'trade-alarm', 'trade-nerve', 'rerun', 'undo', 'talk-down', 'take-hit']);
/** The line a blow-up plays as when it's talked down. */
const TALKED_DOWN = '*Your face gets between you and it, and keeps talking. They stay behind so you can walk. You leave with part of it.*';
const END_COOL_HEAT = 2;
const END_COOL_PAY = 20;
/** What Cut a Deal and Paid Off take off the pay, in percent (tier 3 beat play spec §2). */
const SELL_PART_CUT = 25;
const PAY_OFF_CUT = 30;
/** Clean Exit's line. */
const HELD_ALARM = '*Somebody who knows this building better than it knows itself kills the alarm at the panel. It costs you some of what you came for.*';
/** A contract looks for your name anywhere: the Marsh has no board of its own to earn rep on (tier 3 contracts spec §5). */
const bestRep = (kit: Pick<Kit, 'rep'> | undefined): number => Math.max(0, ...Object.values(kit?.rep ?? {}));
/** A contract at its night, not gone in yet. */
const nightOpen = (run: QuestRun): boolean => !run.done && run.contract?.stage === 'night' && !run.setup;
/** Whether a run's job is over: a contract's is at its debrief, though the run waits on for its fallout (`endAt` set by then, as world.ts reads it). */
const jobOver = (run: QuestRun): boolean => run.done || (run.contract?.stage === 'fallout' && run.setup?.endAt !== undefined);
/** Whether a recruit called or pressed on this parked roll: one act a recruit a roll (ability pass spec §1). */
const actedOn = (p: DicePending, rid: string): boolean => p.call?.card === rid || (p.after ?? []).some((c) => c.card === rid);
const rollFills = (q: Pick<QuestEntry, 'kind'>, run: QuestRun): boolean => scoring(q, run) && run.getaway !== true && run.push?.state !== 'playing';
/** Whether Saw It Coming took this card back on this beat (tier 3 beat play spec §2). */
const barredOn = (run: Pick<QuestRun, 'barred'>, beat: string, choice: string): boolean => run.barred?.beat === beat && run.barred.choice === choice;
/** A waiting pass with nothing left to land: no ALARM or heat on the roll, and none on its route. */
function nothingToPay(beat: Beat, run: QuestRun, p: NonNullable<QuestRun['pending']>): boolean {
  if (isLegacyPending(p) || !p.roll.pass || p.cost.alarm > 0 || p.cost.heat > 0) return false;
  const choice = beat.choices.find((c) => c.id === p.choice);
  return !choice || tagsOf(choice, run.flags).alarm <= 0;
}

/** Why a gamble or a trade can't act on this roll, or null (ability pass spec §2). The picks already on it count. */
function afterRefusal(kind: string, q: QuestEntry, run: QuestRun, p: Pick<DicePending, 'roll' | 'cost' | 'beat' | 'choice'> & Partial<DicePending>): string | null {
  const picked = (c: CostId) => (p.settled ?? []).filter((x) => x.cost === c && x.how !== 'resisted' && x.how !== 'armour' && x.how !== 'ability').length;
  // The route's own [alarm +n] lands with the roll too (review M5).
  const route = (q.beats.get(p.beat) ?? []).flatMap((b) => b.choices).find((c) => c.id === p.choice);
  const alarm = (run.alarm ?? 0) + p.cost.alarm + picked('alarm') + (route ? tagsOf(route, run.flags).alarm : 0);
  // PRO and VET on a waiting roll (tier 3 beat play spec §2).
  if (kind === 'rerun' || kind === 'undo' || kind === 'talk-down' || kind === 'take-hit') {
    if (route?.check?.red) return 'ONE SHOT';
    if ((p.settled ?? []).length) return 'before you pick a cost';
    const missed = p.roll.kind === 'miss';
    if (kind === 'rerun') return (p.roll.kind === 'cost' || missed) && !p.roll.gamble && !p.roll.rerun && !p.roll.softened ? null : 'that does nothing on this roll';
    if (kind === 'take-hit') return (p.dealt ?? []).length && p.pick ? null : 'NO COSTS TO TAKE';
    if (!missed) return 'that does nothing on this roll';
    if (kind === 'talk-down') {
      const e = route?.fail ? q.outcomes.get(route.fail)?.effects : undefined;
      return !p.roll.softened && (e?.blown || e?.take === 'none') ? null : 'NOT A BLOW-UP';
    }
    // A card behind `needs` might not show, so only a plain one counts as somewhere to go.
    const cards = run.beat !== null ? (beatAt(q, run.beat, run.variant)?.choices ?? []) : [];
    return cards.some((c) => c.id !== p.choice && !barredOn(run, p.beat, c.id) && !c.tags.some((t) => t.kind === 'needs')) ? null : 'NO OTHER CARD';
  }
  if (kind === 'gamble-cost' || kind === 'gamble-miss') {
    // ONE SHOT means no second go at it.
    if (route?.check?.red) return 'ONE SHOT';
    if (p.roll.kind !== (kind === 'gamble-cost' ? 'cost' : 'miss') || p.roll.gamble || p.roll.rerun || p.roll.softened) return 'that does nothing on this roll';
    if ((p.settled ?? []).length) return 'before you pick a cost';
    // A clean 6 buys off the costs to pick, or fills one more TAKE: with neither to win it can only lose.
    const room = rollFills(q, run) && takeOf(run, q) + kindResult('cost', p.roll.position, p.roll.effect).take < jobTakeSize(q);
    return kind === 'gamble-cost' && !(p.pick ?? 0) && !room ? 'NOTHING TO GAIN' : null;
  }
  if (kind === 'trade-nerve') return alarm >= ALARM_MAX ? 'ALARM IS FULL' : null;
  if (!rollFills(q, run)) return 'NOTHING TO TAKE HERE';
  if (alarm <= 0) return 'NO ALARM TO CLEAR';
  const fill = takeOf(run, q) + kindResult(p.roll.kind, p.roll.position, p.roll.effect).take - (p.roll.lessTake ?? 0) - picked('take');
  return fill <= 0 ? 'NO TAKE TO TRADE' : null;
}
const settledAll = (p: DicePending): boolean => (p.settled ?? []).length >= (p.pick ?? 0) && (p.settled ?? []).every((x) => x.how);

function samePair(a: ModelPair | null, b: ModelPair): boolean {
  return a !== null && a.model === b.model && a.provider === b.provider;
}

/**
 * Relays chat turns between the browser and her model. Lowlight owns the conversation: each turn
 * sends the room note, the room's recent history and `[room: …] + userText` through her backend,
 * streams the reply back as `nix_delta` events, and persists it + the link status.
 */
/** A choice's tags on a pick: the flags it sets (over `flags`), its extra minutes, and its ALARM steps. */
/** The deck a job goes in with: none when the job bars the one you hold. */
const carriedOn = (q: QuestEntry, deck: Deck | null): Deck | null => (deck && q.bars === deck.id ? null : deck);

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

/** ALARM after `n` more steps, 0–3 (small jobs spec §3). */
const alarmPlus = (alarm: number | undefined, n: number) => Math.max(0, Math.min(ALARM_MAX, (alarm ?? 0) + n));


/** Which feed a row belongs to: the deck's texts, or the scene (deck spec §3). */
const feedOf = (m: ChatMessage): 'text' | 'scene' => (m.mode === 'text' ? 'text' : 'scene');
/** With no `[crew]` line told yet, the last six story hours (crew spec §5): an old save doesn't recite its history. */
const CREW_LINE_FALLBACK = 360;

/** Whose key a failed turn went to, for the player's notice. */
const providerName = (err: TurnError): string => (err.provider === 'anthropic' ? 'ANTHROPIC' : 'OPENROUTER');

/** Whether a job's TAKE counts now: always, but a contract's only on its night (tier 3 contracts spec §2). */
const scoring = (q: Pick<QuestEntry, 'kind'>, run: Pick<QuestRun, 'contract'>): boolean => q.kind !== 'contract' || run.contract?.stage === 'night';

/** A program's refusals that mean the rest of the pick already did its work (final review I1): dropped, not refused. */
const COVERED = new Set(['ALREADY IN THE DARK', 'ALREADY BIG']);

/** A job's poster and brief, as a row of the panel carries them. */
const filed = (q: QuestEntry) => ({ ...(q.postedBy ? { postedBy: q.postedBy } : {}), ...(q.brief ? { brief: q.brief } : {}) });

export class ChatRelay {
  /** Cost deals the GM is writing lines for, by player and roll; the value is the call that holds it. */
  private gmWriting = new Map<string, symbol>();
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
    this.emitQuestState(player);
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

  /** The quest at a beat in this room for `player`, with its file's quest and beat; or why it can't go on. */
  private questHere(player: string): { status: QuestStatus; q: QuestEntry | undefined; beat: Beat | undefined; wait: RunWait | null } | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    // A run at a beat comes before a parked one: a contract's report can come up while another quest waits here.
    const open = qs.status(player).filter((s) => s.contact === qs.contact && !s.run.done);
    const status = open.find((s) => s.run.beat !== null) ?? open.find((s) => s.run.wait !== null);
    if (!status) return null;
    const file = qs.book().find((e) => e.id === bookId(status.id));
    // A rescue (crew spec §5) plays at its post's place and tier, with its recruit named.
    const found = file && status.run.spring ? withSpring(file, status.run.spring, this.recruitName(status.run.spring.recruit)) : file;
    // On its getaway (the table spec §2): the stock beat when the file has none of its own.
    const q = found && status.run.getaway ? withGetaway(found) : found;
    const wait = status.run.beat === null ? status.run.wait : null;
    const beat = q && status.run.beat !== null ? beatAt(q, status.run.beat, status.run.variant) : undefined;
    // A parked roll on a choice the file no longer has (a save from before a rewrite) is dropped: the beat's cards show again.
    if (beat && status.run.pending && !beat.choices.some((c) => c.id === status.run.pending!.choice)) {
      const { pending: _stale, ...run } = status.run;
      return { status: { ...status, run }, q, beat, wait };
    }
    return { status, q, beat, wait };
  }

  /** Whether a parked run's quest file still has what it waits for (the beat, and the missed path). */
  private waitIntact(q: QuestEntry | undefined, w: RunWait): boolean {
    const has = (id: string) => Boolean(q && (q.beats.has(id) || q.outcomes.has(id)));
    return Boolean(q) && q!.beats.has(w.to) && (w.else === null || has(w.else));
  }

  /** What the room shows of quest lines for `player` (spec §3): QUEST's list and the cards. One quest at a beat here at a time. */
  questState(player: string): QuestState {
    const qs = this.deps.quests;
    const ctx0 = qs?.ctx(player) ?? null;
    if (!qs || !ctx0) return { ...EMPTY_QUEST_STATE };
    const book = qs.book();
    // The Chair, again (Tier 2 spec §1): the record met sets the derived flag its `after:` reads.
    const record = this.chairRecord(player);
    const ctx: CondCtx = record?.ready ? { ...ctx0, flags: { ...ctx0.flags, deal2: 'ready' } } : ctx0;
    const titleOf = (id: string, run?: QuestRun) => {
      const q = book.find((e) => e.id === id);
      return q ? this.asRun(q, run).title : id;
    };
    // Quests at a beat or waiting in someone else's room: listed here so they're never lost (quest waits spec §4).
    const elsewhere = qs
      .status(player)
      .filter((s) => s.contact !== qs.contact && !s.run.done && (s.run.beat !== null || s.run.wait !== null || nightOpen(s.run)))
      .map((s) => ({ id: bookId(s.id), title: titleOf(bookId(s.id), s.run), ...((art) => (art ? { art: `/api/quests/art/${art}` } : {}))(qs.book().find((e) => e.id === bookId(s.id))?.art), contact: s.contact, contactName: qs.contactName(s.contact), next: s.run.wait ? waitLine(s.run.wait, qs.placeName) : nightOpen(s.run) ? "It's tonight" : null }));
    const fixer = this.fixerFor(player);
    // NERVE gone (the table spec §3): every job is locked until the next 06:00.
    const gone = qs.kit?.(player).nerveGone === true;
    const boards = this.boardsElsewhere(player, book, ctx);
    const none: QuestState = { ...EMPTY_QUEST_STATE, elsewhere, ...(boards.length ? { boards } : {}), ...(fixer ? { fixer } : {}), ...(gone ? { nerveGone: { back: '06:00' } } : {}) };
    const here0 = this.questHere(player);
    // A contract's wait leaves the boards up: the arc runs around your other work (tier 3 contracts spec §2).
    const arc = here0?.q?.contract && here0.wait ? here0 : null;
    const here = arc ? null : here0;
    if (here) {
      const changed = { ...none, changed: `${here.q?.title ?? here.status.id} has changed since you started it` };
      if (here.wait) {
        if (!this.waitIntact(here.q, here.wait)) return changed;
        const w = here.wait;
        const waiting = { id: here.q!.id, title: here.q!.title, next: waitLine(w, qs.placeName), at: w.at ? qs.placeName(w.at) : null, from: w.from, by: w.by, ready: w.ready, here: w.at === null || w.at === qs.placeId(), ...(w.comms ? { comms: true as const } : {}) };
        return { ...none, waiting };
      }
      // A job on its WALK / PRESS ON card (pressing on spec §1): PRESS ON only while the file has a push beat left.
      if (here.q && isJob(here.q) && here.status.run.beat === PUSH_BEAT && here.status.run.push) {
        const { q, status } = here;
        const p = status.run.push!;
        // What WALK pays you: the job's sol so far, after her cut while the deal's in force (Tier 2 spec §2).
        const gross = walkValue(status.run);
        const walk = { sol: gross.sol - this.cutDue(player, q, gross.sol), heat: gross.heat + heatLeft(status.run, false) };
        return {
          ...none,
          active: {
            id: q.id,
            title: q.title,
            ...(q.postedBy ? { postedBy: q.postedBy } : {}),
            beat: PUSH_BEAT,
            choices: [{ id: WALK, line: `WALK — ${walk.sol} SOL · HEAT ${walk.heat < 0 ? `−${-walk.heat}` : `+${walk.heat}`}` },...(nextPushBeat(q, p.stage) ? [{ id: PRESS, line: 'PRESS ON' }] : [])],
            ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}),
            alarm: status.run.alarm ?? 0,
            nerve: { left: qs.kit?.(player).nerveLeft ?? 0, max: qs.kit?.(player).nerveMax ?? 0 },
            heat: this.runCtx(q, status.run, ctx, player).heat ?? 0,
            pay: q.payRange ?? [0, 0],
            take: { filled: takeOf(status.run, q), size: jobTakeSize(q) },
            push: { stage: p.stage, pot: p.pot, walk },
          },
        };
      }
      if (!here.q || !here.beat) return changed;
      const { q, beat, status } = here;
      const run = status.run;
      const rctx = this.runCtx(q, run, ctx, player);
      const kit = qs.kit?.(player);
      const cracks: Record<string, TerminalSetup> = {};
      let cards: NonNullable<QuestState['active']>['choices'];
      // A blown job waiting on cover (spec §5–§6): the pick that blew it and the debrief as it stands come with the cards.
      const pc = run.pendingCover;
      const blown = pc ? { text: fillTimes(pc.text, (this.deps.clockNow?.() ?? 0) + pc.minutes), ...(pc.pick ? { pick: pc.pick } : {}), debrief: this.jobEnd(q, run, pc, null, player, status.id).debrief } : null;
      if (pc) cards = coverCards(kit?.cover ?? { burner: 0, 'fall-guy': 0 }, this.coverLoss(q, run), run.pay);
      // A costly roll waiting (the table spec §3): STEADY / TAKE IT; an old save's parked REROLL gets TAKE IT only.
      // A costly roll waiting (roll lifecycle spec §1): its dealt costs (the job's `costs`), no cards; one parked before
      // the deal, or an old save's REROLL, gets TAKE IT only.
      else if (run.pending) cards = !isLegacyPending(run.pending) && run.pending.dealt ? [] : [{ id: TAKE, line: nothingToPay(beat, run, run.pending) ? CARRY_ON : 'TAKE IT' }];
      else
        cards = shownChoices(beat, rctx).filter((c) => !barredOn(run, beat.id, c.id)).map((c) => {
          const setup = c.crack && isJob(q) ? this.crackSetupFor(status.id, beat.id, c, rctx) : null;
          if (setup) cracks[c.id] = setup;
          const plays = c.check && run.setup && !c.crack ? this.playsFor(c, rctx, beat, { q, run, player }) : null;
          const pool = c.check ? this.poolFor(c, rctx, beat, { q, run, player }) : null;
          // What SAFE / BOLD and PUSH for effect would do here (effect and NERVE spec §1): null where allowed, else why not.
          const trades = pool ? { trade: { safe: tradeRefusal(pool, 'safe'), bold: tradeRefusal(pool, 'bold') }, pushEffect: c.check!.red ? "PUSH can't go on a one-shot card" : effectPushRefusal(pool) } : {};
          const programs = pool && run.setup?.deck && !c.crack ? this.programPreviews(c, rctx, beat, { q, run, player }, pool) : null;
          // The route's own ALARM (a choice's [alarm +n]): it lands on the pick, whatever the dice, so the card says so.
          const routeAlarm = c.tags.reduce((n, t) => n + (t.kind === 'alarm' ? t.delta : 0), 0);
          return { id: c.id, line: c.line, ...(pool ? { pool } : {}), ...(routeAlarm ? { alarm: routeAlarm } : {}), ...trades, ...(c.check?.red ? { red: true as const } : {}), ...(setup ? { crack: { length: setup.length, tries: setup.tries, take: crackTake(q, rctx.deck ?? null) } } : {}), ...(plays ? { plays } : {}), ...(programs ? { programs } : {}) };
        });
      const hand = isJob(q) ? this.handView(q, run) : null;
      const costs = isJob(q) && run.pending && !isLegacyPending(run.pending) && run.pending.dealt ? this.costsView(q, beat, run, run.pending, rctx, player) : null;
      const job = isJob(q) ? { tier: q.tier, ...(run.push?.state === 'playing' ? { pressing: true as const } : {}), ...(hand ? { hand } : {}), ...(costs ? { costs } : {}), ...(scoring(q, run) ? { take: { filled: takeOf(run, q), size: jobTakeSize(q) } } : {}), ...(run.getaway ? { getaway: true as const } : {}), alarm: run.alarm ?? 0, nerve: { left: kit?.nerveLeft ?? 0, max: kit?.nerveMax ?? 0 }, heat: rctx.heat ?? 0, pay: q.payRange ?? ([0, 0] as [number, number]), ...(run.pending ? { rolled: isLegacyPending(run.pending) ? { choice: run.pending.choice, chance: run.pending.chance, rolls: run.pending.rolls } : { choice: run.pending.choice, faces: run.pending.roll.faces, keep: run.pending.roll.keep, kind: run.pending.roll.kind, cost: run.pending.cost, ...(run.pending.roll.saved ? { saved: true as const } : {}), ...(run.pending.roll.gamble ? { gamble: run.pending.roll.gamble } : {}), ...(run.pending.roll.rerun ? { rerun: true as const } : {}), ...(run.pending.roll.lessTake ? { lessTake: run.pending.roll.lessTake } : {}), ...(run.pending.roll.missTake ? { missTake: true as const } : {}), ...(run.pending.roll.effect ? { effect: run.pending.roll.effect } : {}) } } : {}) } : {};
      return {
        ...none,
        active: { id: q.id, title: q.title, ...(q.postedBy ? { postedBy: q.postedBy } : {}), beat: beat.id, ...(beat.song && holds(beat.songWhen ?? null, rctx) ? { song: beat.song } : {}), ...(beat.room ? { room: beat.room, ...(run.setup?.guest ? { roomGuest: run.setup.guest.id } : {}) } : {}), ...(beat.onComms ? { comms: true as const } : {}), ...(beat.onLine ? { onLine: beat.onLine } : {}), choices: cards, ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}), ...job, ...(Object.keys(cracks).length ? { crack: cracks } : {}), ...(blown ? { blown } : {}) },
      };
    }
    const quests = openQuests(
      // A quest line's posts: window gates its listing too (arrangement spec §1: The Chair on her shift).
      book.filter((q) => !isJob(q) && postsOpen(q.posts, this.deps.clockNow?.() ?? 0)),
      { placeId: qs.placeId(), contact: qs.contact, started: qs.status(player), ctx },
    );
    // In the book's order, quests and tonight's jobs together.
    const listed = new Set([...quests, ...this.openJobs(player, book, ctx)]);
    // Tonight's rescues (crew spec §5) are their posts' copies of a spring file: after the rest.
    const open = [...book.filter((q) => listed.has(q)), ...[...listed].filter((q) => q.spring && !book.includes(q))];
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
    // The Chair, again (Tier 2 spec §1): once Tier 1 is struck it lists here locked, with its checklist, until the
    // record, her trust and her shift all hold (then its own `after:` and `posts:` list it open as usual). No deal
    // stored (a hand-edited save): no row, rather than an empty checklist.
    const begun = new Set(qs.status(player).map((s) => bookId(s.id)));
    const tier2Rows = (record ? book : [])
      .filter((q) => !listed.has(q) && !begun.has(q.id) && q.starts === qs.placeId() && (q.after ?? []).some((c) => c.kind === 'flag' && c.name === 'deal2') && holds(q.after, { ...ctx, flags: { ...ctx.flags, deal2: 'ready' }, trust: 'high' }))
      .map((q) => ({ id: q.id, title: q.title, pitch: q.pitch, timed: q.timed, ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}), locked: 'LOCKED', checks: this.chairChecks(player, q) }));
    const rumors = this.rumorsFor(player, book, ctx);
    // What the panel shows of the arc: each piece of groundwork, and whether it can still be walked away from.
    const arcRun = arc?.status;
    const crewNow = qs.crewState?.();
    const nightLeft = (arc?.wait?.from ?? 0) - (this.deps.clockNow?.() ?? 0);
    const arcView = arc?.q?.contract && arcRun?.run.contract
      ? { id: arc.q.id, title: arc.q.title, ...(arc.q.art ? { art: `/api/quests/art/${arc.q.art}` } : {}), next: arcRun.run.contract.stage === 'fallout' ? "It isn't over yet." : nightLeft > 0 ? `The night is in ${Math.ceil(nightLeft / 60)}h.` : "It's tonight.", stage: arcRun.run.contract.stage, walk: arcRun.run.contract.stage === 'waiting', pieces: arc.q.contract.pieces.map((p) => ({ id: p.id, spec: p.spec, state: (crewNow?.reports?.[`${arcRun.id}:${p.id}`] ? 'back' : crewNow?.groundwork?.[arcRun.id]?.some((g) => g.piece === p.id) ? 'out' : 'open') as 'open' | 'out' | 'back' })) }
      : null;
    return { ...none, ...(arcView ? { arc: arcView } : {}), ...(rumors.length ? { rumors } : {}), open: [...open.map((q) => ({ id: q.id, title: q.title, pitch: q.pitch, ...filed(q), timed: q.timed, ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}), ...(gone && isJob(q) ? { locked: 'NERVE GONE — BACK AT 06:00' } : {}), ...(q.kind === 'mission' || q.kind === 'contract' ? { mission: { pay: q.pay, tier: q.tier, ...(q.payRange ? { range: q.payRange } : {}), ...crewRow(q), ...(ownedBy(q) ? { own: qs.contactName(ownedBy(q)!) } : {}), ...(q.trust ? { trust: true as const } : {}), ...(this.capped(q, player) ? { capped: qs.contactName(qs.contact) } : {}), ...(q.commsAt ? { comms: qs.placeName(q.commsAt) } : {}) } } : {}), ...(isJob(q) && (!q.contract || qs.status(player).some((s) => bookId(s.id) === q.id && nightOpen(s.run))) ? { setup: this.setupOffer(q, player) } : {}), ...(isJob(q) && q.once ? { once: true as const } : {}) })), ...tier2Rows] };
  }

  /** A job's SETUP card (the hand spec §1): its district, your tier and heat there, the favour, and the crew ready to bring. */
  private setupOffer(q: QuestEntry, player: string): SetupOffer {
    const qs = this.deps.quests!;
    const district = this.districtOf(q) ?? 'unknown';
    const kit = qs.kit?.(player);
    const rep = kit?.rep[district] ?? 0;
    const heat = kit ? heatIn(kit, district) : 0;
    const crew = (qs.crewState?.()?.members ?? []).filter((m) => m.state === 'ready' && !m.busy);
    const held = qs.ctx(player)?.deck ?? null;
    const deck = carriedOn(q, held);
    const guest = this.guestFor(q);
    return {
      district,
      tier: TIER_NAMES[repTier(rep) - 1],
      heat,
      // The favour and contact cards are on hold (programs spec §2.4): POCKETS is the deck now.
      favour: FAVOUR_ON_HOLD,
      crew: [
        ...crew.map((m) => ({ id: m.recruit.id, name: m.recruit.name, spec: m.recruit.spec, grade: m.recruit.grade, toNext: m.toNext, face: m.recruit.face, traits: this.shownTraits(m), abilities: this.abilityLabels(m.slotted) })),
        ...(guest ? [{ id: guestId(guest.id), name: guest.name, spec: guest.spec, grade: guest.grade, toNext: 0, face: null, traits: [], abilities: this.abilityLabels(guest.abilities), guest: true as const, art: `/contacts/${guest.id}.webp` }] : []),
      ],
      contacts: [],
      deck: deck ? { name: deck.name, quality: deck.quality, slots: slotsFor(deck) } : null,
      ...(held && !deck ? { barred: held.name } : {}),
      // What SETUP can load and what the job leans on (programs spec §1.2a).
      ...(deck ? { programs: (this.deps.quests?.programs?.() ?? []).map((p) => ({ id: p.id, name: p.name, stat: p.stat, kind: p.kind, line: p.line })) } : {}),
      leans: jobLeans(q),
      ...(q.tier >= 2 ? { tierLine: tierLine(q.tier) } : {}),
    };
  }

  /** The crew a job's cards are read from: the roster, and its guest (guest crew spec §5). */
  private crewOn(setup: Pick<Setup, 'guest'> | undefined): CrewMember[] {
    return withGuest(this.deps.quests?.crewState?.()?.members ?? [], setup);
  }

  /** A contract's guest as they'd go in (guest crew spec §2): the card the lead earned, with its grade and abilities. Null: no guest, no card, or none for that trade. */
  private guestFor(q: QuestEntry): NonNullable<Setup['guest']> | null {
    const g = q.contract?.guest;
    const card = g && this.deps.quests?.contactCards?.().find((c) => c.id === g.id);
    const abilities = card && GUEST_ABILITIES[card.spec];
    return g && card && abilities ? { ...card, grade: g.grade, abilities } : null;
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
    return {
      place,
      items: items.map((item) => {
        // A deck's quality beside its price (deck effects spec §3).
        const quality = item.kind === 'deck' ? decks.find((d) => d.id === item.id)?.quality : undefined;
        return { id: item.id, name: itemName(item, decks), price: item.price, tier: item.tier, ...(quality ? { quality } : {}), state: canBuy({ item, sol: kit?.sol ?? 0, tier, owned: kit?.owned ?? [] }) };
      }),
    };
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
    // Only while a job's beat is up (its cards could change under you); a contract's wait is fine.
    if (qs.status(this.pid).some((s) => !s.run.done && (s.run.beat !== null || (s.run.wait !== null && !s.run.contract)) && isJob(book.find((q) => q.id === bookId(s.id)) ?? { kind: 'quest' }))) return 'not while a job is in progress';
    const district = qs.districtOf?.(place) ?? 'unknown';
    const kit = qs.kit?.(this.pid);
    const state = canBuy({ item, sol: kit?.sol ?? 0, tier: repTier(kit?.rep[district] ?? 0), owned: kit?.owned ?? [] });
    const name = itemName(item, qs.decks?.() ?? []);
    if (state === 'locked') return `${name} needs ${TIER_NAMES[item.tier - 1]} in ${district}`;
    if (state === 'short') return `${name} costs ${item.price} sol`;
    if (state === 'owned') return `you already have the ${name}`;
    const key = fixerKey(this.pair());
    const event = buyEvent({ item, at: this.deps.clockNow?.() ?? 0 });
    this.deps.db.setMeta(key, JSON.stringify([...parseFixer(this.deps.db.getMeta(key)), event]));
    this.emitQuestState();
    return OK;
  }

  /**
   * CARRY on the YOU sheet: another deck you own, as a kit event on `fixer.<player>` beside purchases, so
   * rewind undoes it. Not mid-job (a crack's terminal is built from the deck you hold). A string is why not.
   */
  carry(player: string, deckId: string): Result | string {
    if (this.turnActive) return 'wait for her to finish';
    this.enter(player);
    const qs = this.deps.quests;
    if (!qs) return 'no kit in this playthrough';
    const book = qs.book();
    if (qs.status(this.pid).some((s) => !s.run.done && (s.run.beat !== null || (s.run.wait !== null && !s.run.contract)) && isJob(book.find((q) => q.id === bookId(s.id)) ?? { kind: 'quest' }))) return 'not while a job is in progress';
    const kit = qs.kit?.(this.pid);
    if (!kit?.owned.includes(deckId)) return "you don't have that deck";
    if (kit.deck === deckId) return OK;
    const key = fixerKey(this.pair());
    this.deps.db.setMeta(key, JSON.stringify([...parseFixer(this.deps.db.getMeta(key)), { at: this.deps.clockNow?.() ?? 0, deck: deckId, carry: true }]));
    // The job cards' odds don't move (any deck is one die), so the quest state may not: say the kit changed.
    this.deps.emit({ type: 'kit_changed' }, this.pair());
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
      // The jobs' SETUP cards list who's ready (the hand spec §1): they follow a hire, a send, a bail.
      this.emitQuestState();
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
      // A free card (crew spec §5) carries its starting loyalty and, vouched, who vouched.
      const vouched = found.c.from && 'vouched' in found.c.from ? found.c.from.vouched : undefined;
      return write(a.recruit, {
        type: 'hire',
        at,
        recruit: found.c.recruit,
        place: found.h.place,
        cost: found.c.cost,
        ...(found.c.loyalty !== undefined ? { loyalty: found.c.loyalty } : {}),
        ...(vouched ? { vouched } : {}),
      });
    }
    const m = view.roster.find((x) => x.recruit.id === a.recruit);
    if (!m || m.state === 'gone') return 'no one by that name';
    const name = first(m.recruit.name);
    // Their rescue under way (crew spec §5): it ends as it ends; bail or leaving them waits for it.
    // A day from GO IN, across 06:00: one left unfinished doesn't hold them for good.
    const rescuing = (this.deps.quests?.status(this.pid) ?? []).some((s) => s.run.spring?.recruit === m.recruit.id && rescueOpen(s.run, at));
    if (rescuing && (a.do === 'bail' || a.do === 'leave' || a.do === 'spring')) return `${name}'s rescue is under way`;
    switch (a.do) {
      case 'send': {
        const busy = this.notReady(m, at) ?? (m.busy ? `${name}'s busy tonight` : null);
        if (busy) return busy;
        const e = view.errands.find((x) => x.id === a.errand);
        const lotId = /^sell:([^:]+):/.exec(a.errand)?.[1];
        if (lotId && view.stash?.find((l) => l.id === lotId)?.out) return "that lot's already out";
        if (!e) return "that errand isn't open tonight";
        if (e.taken) return "that errand's taken tonight";
        if (e.group === 'collect' && view.stashFull) return 'STASH FULL';
        if (e.lot && !e.odds[a.recruit]) return "can't sell there";
        if (e.cost && view.sol < e.cost) return `that takes ${e.cost} sol`;
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
      case 'spring': {
        // SPRING THEM (crew spec §5): one of the spring files, seeded per recruit and night.
        if (m.state !== 'held') return `${name} isn't held`;
        if (!m.canSpring) return m.springWhy ?? `${name} can't be sprung tonight`;
        const files = this.deps.quests!.book().filter((q) => q.spring).sort((x, y) => x.id.localeCompare(y.id));
        if (files.length === 0) return 'no rescue written';
        const seed = this.deps.quests!.boardSeed?.() ?? '';
        const job = files[Math.floor(rng(hashSeed(`${seed}|spring|${m.recruit.id}|${storyDay(at)}`))() * files.length)].id;
        return write(a.recruit, { type: 'spring', at, job });
      }
      case 'letgo':
        // Not mid-job (the hand): their card, a fence's TAKE and the debrief all count on them until it ends.
        return m.state === 'job' ? `${name}'s on a job` : write(a.recruit, { type: 'letgo', at });
      case 'learn': {
        // KEEP on the oldest open pick (crew abilities spec §4), in any state.
        const p = m.picks[0];
        if (!p) return `no pick waiting for ${name}`;
        if (p.grade !== a.grade || !p.offer.includes(a.ability)) return `that isn't on ${name}'s pick`;
        return write(a.recruit, { type: 'learn', at, ability: a.ability, grade: a.grade });
      }
      case 'slot':
      case 'unslot': {
        // The loadout changes only while they're ready (crew abilities spec §1).
        const busy = this.notReady(m, at);
        if (busy) return busy;
        if (a.do === 'unslot') return m.slotted.includes(a.ability) ? write(a.recruit, { type: 'unslot', at, ability: a.ability }) : "that isn't slotted";
        if (!m.abilities.includes(a.ability)) return `${name} doesn't know that`;
        if (m.slotted.includes(a.ability)) return 'already slotted';
        if (a.out !== undefined) return m.slotted.includes(a.out) ? write(a.recruit, { type: 'slot', at, ability: a.ability, out: a.out }) : "that isn't slotted";
        return m.slotted.length < view.roster.find((x) => x.recruit.id === a.recruit)!.slots ? write(a.recruit, { type: 'slot', at, ability: a.ability }) : 'no free slot';
      }
    }
  }

  /** Why a recruit's loadout can't change and they can't be sent (out, hurt, held, on a job); null: ready. A send also checks busy. */
  private notReady(m: CrewView['roster'][number], at: number): string | null {
    const name = m.recruit.name.split(' ')[0];
    if (m.state === 'out') return `${name}'s still out. Back ${hhmmOf(((m.due ?? at) % 1440 + 1440) % 1440)}.`;
    if (m.state === 'hurt') return `${name}'s hurt`;
    if (m.state === 'held') return `${name}'s held by SDG`;
    if (m.state === 'job') return `${name}'s on a job`;
    return null;
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
  /** Whether a contract's lead is in hand; true for one with no lead. */
  private leadHeld(q: QuestEntry, player: string): boolean {
    const lead = q.contract?.lead;
    return !lead || (this.deps.quests?.heldLeads?.(player) ?? []).includes(lead);
  }

  /** RUMORS: each contract your rep has earned, or whose lead you hold, and you haven't taken, unless you're the one it belongs to. */
  private rumorsFor(player: string, book: QuestEntry[], ctx: CondCtx): NonNullable<QuestState['rumors']> {
    const qs = this.deps.quests!;
    // Rep as the boards read it, at 06:00: a rumor mustn't promise what HERE won't list until the morning.
    const kit = qs.kit?.(player, 360 + this.storyDay() * 1440);
    const started = qs.status(player);
    return book.flatMap((q) => {
      const contact = q.with?.[0];
      if (!q.contract || !contact || contact === player || (q.for && q.for !== player) || !holds(q.after, ctx) || !this.leadHeld(q, player)) return [];
      // A lead lists its contract at once, short of rep, with the rep it needs.
      const short = bestRep(kit) < q.contract.postsAt;
      if ((short && !q.contract.lead) || started.some((s) => bookId(s.id) === q.id)) return [];
      const withThem = qs.contact === contact;
      return [{ id: q.id, line: q.contract.rumor, place: q.starts, placeName: qs.placeName(q.starts), contact, contactName: qs.contactName(contact), here: withThem && qs.placeId() === q.starts, leaving: withThem ? null : qs.contactName(qs.contact), ...(short ? { needs: q.contract.postsAt } : {}) }];
    });
  }

  /**
   * ELSEWHERE's boards (2026-11-01): tonight's missions at every other place, as HERE would list them there. A job
   * tied to someone you aren't with says whose it is; one outside its posting hours says when it opens.
   */
  private boardsElsewhere(player: string, book: QuestEntry[], ctx: CondCtx): NonNullable<QuestState['boards']> {
    const qs = this.deps.quests!;
    const here = qs.placeId();
    const clock = this.deps.clockNow?.() ?? 0;
    const places = new Set([...book.filter((q) => q.kind === 'mission' && q.starts).map((q) => q.starts), ...this.springPosts().map((p) => p.place)]);
    places.delete(here ?? '');
    return [...places]
      .map((place) => ({
        place,
        name: qs.placeName(place),
        jobs: this.openJobs(player, book, ctx, { place, anyContact: true, anyHour: true })
          .filter((q) => q.kind === 'mission')
          .map((q) => ({
            id: q.id,
            title: q.title,
            pitch: q.pitch,
            ...filed(q),
            ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}),
            ...(q.tier !== undefined ? { tier: q.tier } : {}),
            pay: q.pay,
            ...(q.payRange ? { range: q.payRange } : {}),
            ...(q.with && !q.with.includes(qs.contact) ? { with: q.with.map((c) => qs.contactName(c)).join(' or ') } : {}),
            ...(q.posts && !postsOpen(q.posts, clock) ? { opens: hhmmOf(q.posts[0]) } : {}),
            ...(q.commsAt ? { comms: qs.placeName(q.commsAt) } : {}),
            ...(q.once ? { once: true as const } : {}),
          })),
      }))
      .filter((b) => b.jobs.length > 0);
  }

  private openJobs(player: string, book: QuestEntry[], ctx: CondCtx, at?: { place: string; anyContact: true; anyHour: true }): QuestEntry[] {
    const qs = this.deps.quests!;
    const place = at?.place ?? qs.placeId();
    if (!place) return [];
    const withHer = (q: QuestEntry) => at?.anyContact || q.with === null || q.with.includes(qs.contact);
    const started = qs.status(player);
    const day = this.storyDay();
    // The board posted at 06:00: your tier as it stood then, so rep won tonight doesn't reshuffle it.
    const kit = qs.kit?.(player, 360 + day * 1440);
    const seed = qs.boardSeed?.() ?? '';
    return book.filter((q) => {
      if (q.for && q.for !== player) return false;
      // A contract (tier 3 contracts spec §5): offered at its rep, once, with its own contact at its own place.
      if (q.kind === 'contract') {
        // Its night, with its contact: SETUP lists wherever you are.
        if (started.some((s) => bookId(s.id) === q.id && s.contact === qs.contact && nightOpen(s.run))) return true;
        return q.starts === place && withHer(q) && holds(q.after, ctx) && this.leadHeld(q, player) && bestRep(kit) >= (q.contract?.postsAt ?? 0) && !started.some((s) => bookId(s.id) === q.id);
      }
      if (q.kind !== 'mission' || q.starts !== place || !withHer(q) || !holds(q.after, ctx)) return false;
      // A job's posts: window (Intake board spec §1) gates listing only; a started run carries on.
      if (!at?.anyHour && !postsOpen(q.posts, this.deps.clockNow?.() ?? 0)) return false;
      // A desk job is played on comms (spec 2026-10-20 §3): it lists only while her deal is in force (final review I5).
      if (q.commsAt && !this.commsCan(player)) return false;
      const tier = repTier(kit?.rep[this.districtOf(q) ?? 'unknown'] ?? 0);
      // A job for one player is theirs, not the board's: never drawn, only held to the tier it's for.
      if (q.for ? q.tier! > tier : !postedJobs({ book, place, tier, day, seed }).includes(q.id)) return false;
      // A once job (a story that changes the world) never posts again after it ended.
      if (q.once && started.some((s) => bookId(s.id) === q.id && s.run.done)) return false;
      return !started.some((s) => bookId(s.id) === q.id && (s.id === jobRunId(q, day) || !s.run.done || s.run.endDay === day));
    }).concat(
      // Tonight's rescues posted here (crew spec §5), unless one has started tonight.
      this.springPosts()
        .filter((p) => p.place === place && !started.some((s) => bookId(s.id) === p.q.id && (s.id === jobRunId(p.q, day) || !s.run.done)))
        .map((p) => p.q),
    );
  }

  /**
   * Tonight's rescues (crew spec §5): each held recruit sprung today, their spring file as it plays (at the place they
   * were hired, at their grade's tier, with them named).
   */
  private springPosts(): { q: QuestEntry; recruit: string; place: string; tier: 1 | 2 | 3 | 4 }[] {
    const qs = this.deps.quests;
    const book = qs?.book() ?? [];
    const day = this.storyDay();
    return (qs?.crewState?.()?.members ?? []).flatMap((m) => {
      const file = m.state === 'held' && m.spring?.day === day ? book.find((q) => q.spring && q.id === m.spring!.job) : undefined;
      if (!file) return [];
      const post = { place: m.hired.place, tier: (m.recruit.grade + 1) as 1 | 2 | 3 | 4 };
      return [{ q: withSpring(file, post, m.recruit.name.split(' ')[0]), recruit: m.recruit.id, ...post }];
    });
  }

  /** A job's entry as its run plays it: a rescue's copy (crew spec §5), else the file as written. */
  private asRun(q: QuestEntry, run: QuestRun | undefined): QuestEntry {
    return run?.spring ? withSpring(q, run.spring, this.recruitName(run.spring.recruit)) : q;
  }

  /** A recruit's first name from the folded crew; null when they aren't on it. */
  private recruitName(id: string): string | null {
    const m = this.deps.quests?.crewState?.()?.members.find((x) => x.recruit.id === id);
    return m ? m.recruit.name.split(' ')[0] : null;
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
    return { ...ctx, deck: carriedOn(q, ctx.deck ?? null), flags: { ...flagsOf(quests), ...(run?.flags ?? {}) }, alarm: run?.alarm ?? 0, ...(kit ? { heat: heatIn(kit, district) } : {}) };
  }

  /** WALK AWAY: before its night, a contract ends for −5 rep in its district, no heat, no debrief. A string is why not. */
  async walkAway(player: string, id: string): Promise<Result | string> {
    if (this.turnActive) return 'wait for her to finish';
    if (!this.ready) return NO_LINK_NOTICE;
    this.enter(player);
    const qs = this.deps.quests;
    const status = qs?.status(this.pid).find((s) => s.contact === qs.contact && !s.run.done && s.run.contract && bookId(s.id) === id);
    const q = status && qs!.book().find((e) => e.id === id);
    if (!status || !q) return 'no job to walk away from';
    if (status.run.contract && (status.run.contract.stage !== 'waiting' && status.run.setup)) return "you can't walk away now";
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
      // The crew brought come off the job now (the hand spec §1).
      ...(status.run.setup ? { setup: { ...status.run.setup, endAt: at } } : {}),
    };
    const row = this.questRow(q, [`*You walk away from ${q.title}.*`], { beat: null }, undefined, undefined, { run: status.id });
    return this.questTurn(row, status.id, run, 0, false, 0);
  }

  /** A blown job's rep loss before cover. */
  private coverLoss(q: QuestEntry, run: QuestRun): number {
    return q.kind === 'contract' ? contractRep(this.tierOf(run)) : repDelta(q.tier, this.tierOf(run));
  }

  /** A job's tier from its run (spec §3): the take its outcomes last set (else full), a blown line anywhere, its ALARM. */
  private tierOf(run: QuestRun): Tier {
    return outcomeTier({ take: run.take ?? 'full', blown: run.blown === true, alarm: run.alarm ?? 0, paidOff: run.setup?.paidOff === true });
  }

  /** A crack card's terminal for run `runId` (null with no words of its length). */
  private crackSetupFor(runId: string, beat: string, c: Choice, ctx: CondCtx): TerminalSetup | null {
    const seed = seedFor(questKey(this.pair(), runId), beat, c.id);
    return crackSetup({ seed, tag: c.crack!, ctx, words: this.deps.quests?.words?.() ?? [], stats: ctx.stats ?? DEFAULT_STATS });
  }

  /** A guest's `guest-note:` (guest crew spec §3), written to their journal on their next turn, once: pinned while a pin is free. */
  private guestNotes(player: string): void {
    const { quests: qs, journal } = this.deps;
    if (!qs || !journal) return;
    for (const s of qs.status(this.pid)) {
      const text = s.run.guestNote;
      if (!text || s.run.setup?.guest?.id !== qs.contact || !jobOver(s.run)) continue;
      // Under the burn's prefix, so it's story meta like the burn; by its text, so a replay to another ending writes its own.
      const key = `cardBurn.note.${player}.${s.contact}.${s.id}.${hashSeed(text)}`;
      if (this.deps.db.getMeta(key) !== null) continue;
      // Hers, not her dossier on the player. Pins full, its keys are how it comes up; the journal full, it waits for a turn with room.
      const note = { text, about: 'me' as const, keys: [...new Set(text.match(/\b[A-Z][a-z]{3,}\b/g) ?? [])] };
      if (journal.note(player, { ...note, pinned: true }, 'world').ok || journal.note(player, note, 'world').ok) this.deps.db.setMeta(key, '1');
    }
  }

  /**
   * The last jobs done together in her room, in words (`[done together: Back Door — went well, tonight]`): the game
   * remembers them, so she needn't note them. Null with none.
   */
  private contactBurns(player: string): void {
    const qs = this.deps.quests;
    if (!qs || !this.deps.trust) return;
    const card = `contact:${qs.contact}`;
    for (const s of qs.status(this.pid)) {
      const run = s.run;
      const played = (run.calls ?? []).some((c) => c.card === card) || run.setup?.fencedBy === card || run.setup?.guest?.id === qs.contact;
      if (!jobOver(run) || !played || this.tierOf(run) !== 'blown') continue;
      const key = `cardBurn.${player}.${s.contact}.${s.id}`;
      if (this.deps.db.getMeta(key) !== null) continue;
      // Its own id, not the line she answers: a job's trust counts once per row, and her own move on this turn must still count (final review M1).
      this.deps.trust.move(player, CONTACT_BURN, CONTACT_BURN_REASON, `card-burn:${s.contact}:${s.id}`);
      this.deps.db.setMeta(key, '1');
    }
  }

  /** Did this run play her contact card (contact cards spec §4): a call on a check, or her fence at the end. */
  private playedHer(run: QuestRun): boolean {
    const card = `contact:${this.deps.quests?.contact}`;
    return (run.calls ?? []).some((c) => c.card === card) || run.setup?.fencedBy === card || run.setup?.guest?.id === this.deps.quests?.contact;
  }

  /** What endings settled for her, a line each, for as long as the run stands: read from the runs, so a rewind takes it back. */
  private settledLines(): string[] {
    const qs = this.deps.quests;
    if (!qs) return [];
    return qs.status(this.pid).flatMap((s) => (s.run.settles ?? []).filter((l) => l.who === qs.contact)).map((l) => `[settled: ${l.text} This stands, whatever else you've been told.]`);
  }

  private jobsWithLine(): string | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    const book = qs.book();
    const today = this.storyDay();
    const done = qs
      .status(this.pid)
      // Her own jobs, and (contact cards spec §4) jobs elsewhere her card played on.
      .filter((s) => (s.contact === qs.contact || this.playedHer(s.run)) && jobOver(s.run) && s.run.endDay !== undefined && !(s.run.contract && !s.run.setup))
      .flatMap((s) => {
        const file = book.find((e) => e.id === bookId(s.id));
        const q = file && this.asRun(file, s.run);
        return q && isJob(q) ? [{ q, run: s.run }] : [];
      })
      .sort((a, b) => b.run.at - a.run.at)
      .slice(0, 3);
    if (!done.length) return null;
    const how = { clean: 'went well', messy: 'got done, not cleanly', blown: 'went bad' } as const;
    return `[done together: ${done.map(({ q, run }) => `${q.title} — ${how[this.tierOf(run)]}${this.playedHer(run) ? ', you lent a hand' : ''}, ${agoWords(today - run.endDay!)}`).join('; ')}]`;
  }

  /** One sentence on what the player carries and how hot they are (missions spec §4); null without a kit or with nothing to say. */
  private kitLineFor(player: Player): string | null {
    const qs = this.deps.quests;
    const kit = qs?.kit?.(player.id);
    const place = qs?.placeId() ?? null;
    return kit ? kitLine(player.name, kit, qs?.decks?.() ?? [], place ? (qs?.districtOf?.(place) ?? null) : null) : null;
  }

  /** A checked choice's odds for the player in `ctx` (missions spec §2): prep modifiers, the beat's stranger's temper, ALARM. */
  /** A checked choice's pool for this player (the table spec §1), as the card shows it: a pool at 0 or less shows 0. */
  private poolFor(c: Choice, ctx: CondCtx, beat?: Beat, job?: { q: QuestEntry; run: QuestRun; player?: string }, call?: CallEffect, press?: CallEffect): Pool {
    const pool = poolOf(c.check!, { ...this.poolWho(c, ctx, beat, job?.q, job?.run, job?.player), ...(call ? { call } : {}), ...(press ? { press } : {}) });
    // A deck above the tier gives nothing of its own since programs (FIREWALL took its armour): only a job from before shows DECK HOLDS.
    const hollow = pool.deck?.match === 'holds' && job?.run.setup?.deck !== undefined;
    return { ...pool, dice: Math.max(0, pool.dice), ...(hollow ? { deck: { ...pool.deck!, match: null } } : {}) };
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
    return { beat: oneLine(fillTimes(beatText(here.beat, rctx), this.deps.clockNow?.() ?? 0)), choices: shownChoices(here.beat, rctx).filter((c) => !barredOn(here.status.run, here.beat!.id, c.id)).map((c) => ({ id: c.id, line: c.line })) };
  }

  /** Her `[quest]` block for `player`'s quest at a beat here; null without one. */
  private questBlockFor(player: string, shown: boolean): string | null {
    const here = this.questHere(player);
    const ctx = this.deps.quests?.ctx(player) ?? null;
    if (here?.wait && here.q && this.waitIntact(here.q, here.wait)) return questWaitBlock(here.q.title, waitLine(here.wait, this.deps.quests!.placeName));
    const now = this.deps.clockNow?.() ?? 0;
    return here?.q && here.beat && ctx ? fillTimes(questBlock(here.q, { ...here.beat, choices: here.beat.choices.filter((c) => !barredOn(here.status.run, here.beat!.id, c.id)) }, this.runCtx(here.q, here.status.run, ctx, player), oneLine, shown, this.deps.players.resolve(player).name), now) : null;
  }

  /**
   * A mission row's note (missions spec §3): her opening line on its first beat, with the job and the
   * player; her closing line on its end, with the run's summary. Null: not a mission, or a beat in between.
   */
  private missionNote(row: ChatMessage): string | null {
    const qs = this.deps.quests;
    const qd = row.quest;
    const file = qd ? qs?.book().find((e) => e.id === qd.id) : undefined;
    const q = file && qs && qd ? this.asRun(file, qs.status(this.pid).find((s) => s.id === (qd.run ?? file.id) && s.contact === qs.contact)?.run) : file;
    if (!qs || !qd || !q || !isJob(q)) return null;
    // A row she doesn't answer has no note (walking away; a job's middle beats).
    if (qd.silent) return null;
    const run = qs.status(this.pid).find((s) => s.id === (qd.run ?? q.id) && s.contact === qs.contact)?.run;
    if (qd.beat === null && !qd.waiting) {
      if (!run) return MISSION_CLOSE;
      const summary = missionSummary(q, run, qs.decks?.() ?? [], qd.debrief, this.summaryCrew(run, questKey(this.pair(), qd.run ?? q.id)));
      return [MISSION_CLOSE, summary, this.lastView(q, run)].filter(Boolean).join('\n\n');
    }
    // The first beat, before any pick: a wait-resumed beat has no pick either, but comes later.
    // A contract sets out at its night, not its offer (tier 3 contracts spec §2).
    if (!qd.pick && (q.contract ? qd.beat === 'night' : qd.beat === q.first && (run?.picks.length ?? 0) === 0)) {
      const ctx = qs.ctx(this.pid);
      const name = this.turnPlayer?.name ?? this.pid;
      const came = run ? (this.summaryCrew(run, questKey(this.pair(), qd.run ?? q.id))?.came ?? []) : [];
      return `${MISSION_OPEN}\n\n${missionOpenBlock(q, playerKitLine(name, ctx?.stats ?? DEFAULT_STATS, carriedOn(q, ctx?.deck ?? null), ctx?.heat ?? 0), came)}`;
    }
    return null;
  }

  /** The view of the beat a job ended on: the run has no beat by its closing turn, so her [job] block is gone (Run Sheet, playtest). */
  private lastView(q: QuestEntry, run: QuestRun): string | null {
    const last = run.picks.filter((p) => !p.beat.startsWith('!')).at(-1);
    const beat = last ? beatAt(q, last.beat, run.variant) : undefined;
    const ctx = this.deps.quests?.ctx(this.pid) ?? null;
    const views = beat && ctx ? beatViews(beat, this.runCtx(q, run, ctx, this.pid)) : '';
    return views ? `[what you think: ${fillTimes(views, this.deps.clockNow?.() ?? 0)}]` : null;
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
    this.contractNotices(player);
    const state = this.questState(player);
    const json = JSON.stringify(state);
    if ((this.questShown.get(player) ?? JSON.stringify(EMPTY_QUEST_STATE)) === json) return;
    this.questShown.set(player, json);
    this.deps.emit({ type: 'quest_state', state }, player);
    // A rumor says so once (tier 3 contracts spec §5). Not story: a rewind doesn't take back having heard it.
    for (const r of state.rumors ?? []) this.noticeOnce(player, `contractOffer.${player}.${r.id}`, `// A RUMOR — ${r.line} (JOBS → RUMORS)`);
  }

  /** A quest notice, once across the rooms: each room keeps its own db, and one built later hasn't heard. */
  private noticeOnce(player: string, key: string, text: string): void {
    if (this.deps.db.getMeta(key)) return;
    const heard = this.deps.quests?.heard?.(key);
    this.deps.db.setMeta(key, '1');
    if (!heard) this.deps.emit({ type: 'notice', text, for: 'quest' }, player);
  }

  /**
   * A contract says what it wants of you, once each: send your crew when the offer opens the wait, and who has a report
   * that's landed and not played. Not story, as a rumor's. Ahead of `emitQuestState`'s check: a report landing while
   * you're with someone else changes nothing on your panel.
   */
  private contractNotices(player: string): void {
    const qs = this.deps.quests!;
    const once = (key: string, text: string) => this.noticeOnce(player, key, text);
    const landed = qs.crewState?.()?.reports ?? {};
    for (const s of qs.status(player)) {
      const arc = s.run.contract;
      const q = arc && !s.run.done ? qs.book().find((e) => e.id === bookId(s.id)) : undefined;
      if (!arc || !q?.contract) continue;
      const title = q.title.toUpperCase();
      if (arc.stage === 'waiting') once(`contractSend.${player}.${s.id}`, `// ${title} — SEND YOUR CREW (CREW → ERRANDS)`);
      for (const p of q.contract.pieces) {
        if (landed[`${s.id}:${p.id}`] && !arc.reported.includes(p.id)) once(`contractReport.${player}.${s.id}.${p.id}`, `// ${title} — A REPORT IS IN. IT'S WITH ${qs.contactName(s.contact).toUpperCase()}.`);
      }
    }
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
  async startQuest(player: string, id: string, setup?: { approach: Approach; people: string[]; favour: boolean; contacts?: string[]; programs?: string[] }): Promise<Result | string> {
    if (this.turnActive) return 'wait for her to finish';
    if (!this.ready) return NO_LINK_NOTICE;
    this.enter(player);
    // A contract's night: its SETUP comes here, not at the offer (tier 3 contracts spec §2).
    const night = this.deps.quests?.status(this.pid).find((s) => bookId(s.id) === id && s.contact === this.deps.quests?.contact && nightOpen(s.run));
    if (night && setup) return this.goInContract(night, setup);
    // A rescue (crew spec §5) starts as its post plays it.
    const post = this.springPosts().find((p) => p.q.id === id);
    const listedRow = this.questState(this.pid).open.find((o) => o.id === id);
    // A locked Tier 2 row (Tier 2 spec §1) lists with its checklist, but doesn't start.
    if (listedRow?.checks && listedRow.locked) return 'that one is still locked';
    const q = listedRow ? (post?.q ?? this.deps.quests!.book().find((e) => e.id === id)) : undefined;
    if (post && post.place !== this.deps.quests!.placeId()) return "that job isn't open here";
    const ctx = this.deps.quests?.ctx(this.pid) ?? null;
    if (!q || !ctx) return "that job isn't open here";
    // NERVE gone (the table spec §3): no new job until the next 06:00.
    if (isJob(q) && this.deps.quests?.kit?.(this.pid).nerveGone) return 'nerve gone — back at 06:00';
    // The arrangement's nights cap (spec 2026-10-20 §2): greyed in the list, refused here.
    if (this.capped(q, this.pid)) return `${this.deps.quests!.contactName(this.deps.quests!.contact).toLowerCase()} is done tonight`;
    // The hand's SETUP card (spec 2026-10-29-the-hand §1): judged now, against who's ready and the favour as they stand.
    // A rescue (crew spec §5) always carries one: its end frees them through the crew fold, which reads the SETUP.
    const checked = isJob(q) && setup ? this.checkSetup(q, setup) : post ? { approach: 'quiet' as const, people: [], favour: false, programs: [] } : null;
    if (typeof checked === 'string') return checked;
    // Programs loaded at SETUP (programs spec §1.2a) go on the run, apart from the setup itself.
    const loads = checked?.programs ?? [];
    const hand = checked ? { approach: checked.approach, people: checked.people, favour: checked.favour } : null;
    // A job (small jobs spec §1): keyed by its day, its draws and pay made now, from the run's key, before its first beat is chosen.
    const mission = isJob(q);
    const day = this.storyDay();
    const runId = mission ? jobRunId(q, day) : q.id;
    const key = questKey(this.pair(), runId);
    const draws = mission ? drawsFor(q, key) : {};
    // Crew prep on this job tonight (crew spec §2) joins the run's flags beside its draws.
    const flags = mission ? { ...draws, ...(this.deps.quests?.crewState?.()?.prep[runId] ?? {}) } : {};
    // A contract's offer has an opening for someone the contact already knows (tier 3 contracts spec §5).
    if (q.contract && (this.deps.tie?.(this.pid) || this.deps.db.recentMessages(this.pid, 200).some((m) => m.mode === 'text' || m.mode === 'encounter' || m.mode === 'quest'))) (flags as Record<string, string>).met = 'yes';
    const pay = mission ? payFor(q, key) : null;
    // HARD goes in loud (the hand spec §1): ALARM 1, and TAKE 1 from tier 2 up (none on tier 1, balancing 2026-11-01).
    const hard = hand?.approach === 'hard';
    // Each brought recruit's loadout as it stands at GO IN (crew abilities plan ruling 4), kept only when someone has one.
    const members = this.deps.quests?.crewState?.()?.members ?? [];
    const loadout = Object.fromEntries((hand?.people ?? []).map((id) => [id, members.find((m) => m.recruit.id === id)?.slotted ?? []]));
    const abilities = Object.values(loadout).some((l) => l.length > 0) ? { abilities: loadout } : {};
    // The deck carried at GO IN and its slots (programs spec §3): no deck stores slots 0, so the run isn't an old one.
    const carried = carriedOn(q, ctx.deck ?? null);
    const deck = { id: carried?.id ?? '', quality: carried?.quality ?? 1, slots: slotsFor(carried) };
    const job: Partial<QuestRun> = mission ? { draws, alarm: hard ? 1 : 0, day, startDeck: carried?.id ?? null, ...(pay !== null ? { pay } : {}), ...(hand ? { setup: { ...hand, tier: q.tier, ...abilities, at: this.deps.clockNow?.() ?? 0, deck } } : {}), ...(loads.length ? { programs: loads.map((id) => ({ id, at: this.deps.clockNow?.() ?? 0 })) } : {}), ...(hard && hardStartTake(q.tier) > 0 ? { takeFill: hardStartTake(q.tier) } : {}), ...(post ? { spring: { recruit: post.recruit, place: post.place, tier: post.tier } } : {}) } : {};
    const rctx = this.runCtx(q, { flags, alarm: job.alarm ?? 0 } as QuestRun, ctx, this.pid);
    const chosen = chooseVariant(q, q.first, rctx);
    if (!chosen) return "that job isn't open here";
    const { beat, variant } = chosen;
    const drawn = this.drawFace(beat.stranger, {});
    const row = this.questRow(q, [beatText(beat, rctx)], { beat }, undefined, drawn.face, mission ? { run: runId } : {});
    return this.questTurn(row, runId, { beat: beat.id, variant, wait: null, picks: [], flags: { ...flags }, done: false, at: Date.now(), ...(drawn.faces ? { faces: drawn.faces } : {}), ...job }, 0);
  }

  /** GO IN on a contract's night: SETUP as a job's, what groundwork left, then the night's first beat (tier 3 contracts spec §2–§3). */
  private async goInContract(status: QuestStatus, setup: { approach: Approach; people: string[]; favour: boolean; contacts?: string[]; programs?: string[] }): Promise<Result | string> {
    const q = this.deps.quests!.book().find((e) => e.id === bookId(status.id));
    const ctx = this.deps.quests?.ctx(this.pid) ?? null;
    if (!q || !ctx) return "that job isn't open here";
    if (this.deps.quests?.kit?.(this.pid).nerveGone) return 'nerve gone — back at 06:00';
    if (this.deps.quests?.status(this.pid).some((s) => s.id !== status.id && !s.run.done && s.run.beat !== null)) return 'finish what you started first';
    const checked = this.checkSetup(q, setup);
    if (typeof checked === 'string') return checked;
    // A piece that landed after the wait ended still counts: results close here, whether or not its report has played.
    const landed = this.deps.quests?.crewState?.()?.reports ?? {};
    const back = (q.contract?.pieces ?? []).flatMap((p) => (landed[`${status.id}:${p.id}`] ? [[p.id, landed[`${status.id}:${p.id}`].band] as const] : []));
    const results = { ...status.run.contract?.results, ...Object.fromEntries(back) };
    const hard = checked.approach === 'hard';
    const at = this.deps.clockNow?.() ?? 0;
    const guest = q.contract?.guest && checked.people.includes(guestId(q.contract.guest.id)) ? (this.guestFor(q) ?? undefined) : undefined;
    const members = withGuest(this.deps.quests?.crewState?.()?.members ?? [], { guest });
    const loadout = Object.fromEntries(checked.people.map((id) => [id, members.find((m) => m.recruit.id === id)?.slotted ?? []]));
    const flags = { ...status.run.flags, ...angleFlags(results), ...guestFlags({ guest }) };
    const alarm = Math.min(NIGHT_ALARM_MAX, nightAlarm(results) + (hard ? 1 : 0));
    const run0: QuestRun = {
      ...status.run,
      flags,
      alarm,
      ...(status.run.contract ? { contract: { ...status.run.contract, results } } : {}),
      startDeck: carriedOn(q, ctx.deck ?? null)?.id ?? null,
      setup: { approach: checked.approach, people: checked.people, favour: false, tier: q.tier, ...(guest ? { guest } : {}), ...(Object.values(loadout).some((l) => l.length > 0) ? { abilities: loadout } : {}), at, deck: { id: ctx.deck?.id ?? '', quality: ctx.deck?.quality ?? 1, slots: slotsFor(ctx.deck ?? null) } },
      ...(checked.programs.length ? { programs: checked.programs.map((id) => ({ id, at })) } : {}),
      // Always set: with none, TAKE reads a run's picks, and the offer and reports aren't the night's.
      takeFill: hard ? hardStartTake(q.tier) : 0,
    };
    const rctx = this.runCtx(q, run0, ctx, this.pid);
    const chosen = chooseVariant(q, 'night', rctx);
    if (!chosen) return "that job isn't open here";
    const drawn = this.drawFace(chosen.beat.stranger, run0.faces ?? {});
    const row = this.questRow(q, [beatText(chosen.beat, rctx)], { beat: chosen.beat }, undefined, drawn.face, { run: status.id });
    return this.questTurn(row, status.id, { ...run0, beat: chosen.beat.id, variant: chosen.variant, wait: null, at: Date.now(), ...(drawn.faces ? { faces: drawn.faces } : {}) }, 0);
  }

  /** A SETUP card as sent, or why it can't go in: everyone brought ready now, at most MAX_PEOPLE, the favour allowed. */
  private checkSetup(q: QuestEntry, setup: { approach: Approach; people: string[]; favour: boolean; contacts?: string[]; programs?: string[] }): { approach: Approach; people: string[]; favour: boolean; programs: string[] } | string {
    const people = [...new Set(setup.people)];
    if (people.length > MAX_PEOPLE) return `at most ${MAX_PEOPLE} people`;
    const offer = this.setupOffer(q, this.pid);
    const members = this.deps.quests?.crewState?.()?.members ?? [];
    for (const id of people)
      if (!offer.crew.some((c) => c.id === id)) {
        const m = members.find((x) => x.recruit.id === id);
        return m ? `${m.recruit.name.split(' ')[0].toUpperCase()} ISN'T READY` : "that recruit isn't ready";
      }
    // The favour and contact cards are on hold (programs spec §2.4); runs from before keep theirs.
    if (setup.favour) return 'the favour is on hold';
    if ((setup.contacts ?? []).length > 0) return 'contact cards are on hold';
    // Programs loaded at SETUP (programs spec §1.2a): free, into the deck's slots, each in the catalog.
    const programs = [...new Set(setup.programs ?? [])];
    if (programs.length > 0) {
      if (!offer.deck) return 'NO DECK';
      if (programs.some((p) => !offer.programs?.some((x) => x.id === p))) return 'NOT A PROGRAM';
      if (programs.length > offer.deck.slots) return 'NO FREE SLOT';
    }
    return { approach: setup.approach, people, favour: false, programs };
  }

  /**
   * A card, or CONFIRM on a held line (spec §3): one row of the pick line, the outcome and the next
   * beat. `said` is the player's own line when CONFIRM sent it; `moves` a crack card's terminal moves. A string is why not.
   */
  async chooseQuest(player: string, o: { id: string; beat: string; choice: string; push?: boolean | PushMode; trade?: Trade; card?: string; press?: string; programs?: { load: string[]; run: string[] }; said?: string; moves?: CrackPick['moves'] }): Promise<Result | string> {
    if (this.turnActive) return 'wait for her to finish';
    if (!this.ready) return NO_LINK_NOTICE;
    this.enter(player);
    const passed = 'that choice has passed';
    const here = this.questHere(this.pid);
    const ctx0 = this.deps.quests?.ctx(this.pid) ?? null;
    // The WALK / PRESS ON card (pressing on spec §1).
    if (here?.q && ctx0 && here.q.id === o.id && o.beat === PUSH_BEAT && here.status.run.beat === PUSH_BEAT) return this.pushPick(here.q, here.status, ctx0, o.choice);
    if (!here || !here.q || !here.beat || !ctx0 || here.q.id !== o.id || here.beat.id !== o.beat) return passed;
    const { q, beat, status } = here;
    const ctx = this.runCtx(q, status.run, ctx0, this.pid);
    if (status.run.pendingCover) return o.choice === BURNER || o.choice === FALL_GUY || o.choice === TAKE ? this.coverPick(q, status, o.choice) : passed;
    const pending = status.run.pending ?? null;
    // While a roll waits (roll lifecycle spec §1): its costs to pick and settle, AFTER A ROLL abilities; one parked before
    // the deal, TAKE IT; an old save's parked REROLL, TAKE IT only. STEADY is gone.
    const dealt = pending && !isLegacyPending(pending) && pending.dealt ? pending : null;
    if (o.choice === STEADY && pending && !isLegacyPending(pending)) return 'STEADY is gone: pick a cost';
    const waiting = pending ? (isLegacyPending(pending) ? [TAKE] : dealt ? [COST, TAKE, RESIST, ARMOUR, AFTER] : [TAKE, AFTER]) : [];
    // An AFTER A ROLL ability (crew abilities spec §2) goes only on a parked roll.
    if (o.choice === AFTER && !waiting.includes(AFTER)) return "that one goes on a roll that's landed";
    if (pending ? !waiting.includes(o.choice) : o.choice === STEADY || o.choice === TAKE || o.choice === REROLL) return passed;
    if (o.choice === AFTER && pending && !isLegacyPending(pending)) return o.card ? this.afterPress(q, beat, status, ctx, pending, o.card) : "that card isn't in your hand";
    if (dealt && (o.choice === COST || o.choice === TAKE || o.choice === RESIST || o.choice === ARMOUR)) return this.costPick(q, beat, status, ctx, dealt, o.choice, o.card);
    // A parked check resolves whatever its own roll did to `needs` (its heat, a dead deck): the cards are already up.
    const choice = pending ? beat.choices.find((c) => c.id === pending.choice) : shownChoices(beat, ctx).find((c) => c.id === o.choice && !barredOn(status.run, beat.id, c.id));
    // The hand (spec 2026-10-29-the-hand §2): a card goes on a choice that rolls, with the roll; never on a crack, a gig or a parked roll.
    if ((o.card !== undefined || o.press !== undefined) && (!choice || !isJob(q) || !choice.check || choice.crack || pending)) return 'cards only go on a roll';
    if (choice && isJob(q)) {
      const fell = status.run.contract?.stage === 'fallout' ? q.outcomes.get(choice.to) : undefined;
      if (fell) return this.falloutPick(q, beat, status, ctx, choice, fell, o.said);
      if (choice.crack && !pending) return this.crackPick(q, beat, status, ctx, choice, o);
      if (choice.check) return this.checkedPick(q, beat, status, ctx, choice, o);
      const outcome = q.outcomes.get(choice.to);
      if (!outcome) return passed;
      const t = tagsOf(choice, status.run.flags);
      const line = o.said?.trim() || pickLine(choice.line);
      return this.jobStep({ q, status, ctx, outcome, texts: [line], pick: { choice: choice.id, line }, record: { beat: beat.id, choice: choice.id }, minutes: t.minutes, kitBefore: status.run.kit ?? [], alarm: alarmPlus(status.run.alarm, t.alarm), flags: t.flags, take: q.template ? 0 : 1 });
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
    // A cut of each job (Tier 2 spec §2); an old file's retainer converts. Tier 2 when the pick sets chair2 (plan ruling 3).
    const struck = deal ? ({ role: 'operator', tier: flags.chair2 === 'yes' ? 2 : 1, cut: 'cut' in deal ? deal.cut : retainerToCut(deal.retainer), nights: deal.nights, since } satisfies Arrangement) : null;
    const after = struck ? () => this.deps.db.setMeta(arrangementKey(dealFor), JSON.stringify(struck)) : undefined;
    return this.questTurn(row, status.id, run, minutes, true, undefined, after);
  }

  /**
   * A job's checked pick on the table (spec 2026-10-29 §1, §3): roll the pool, PUSH spending 2 NERVE for a die. A roll
   * that costs ALARM or heat parks (no row) for STEADY / TAKE IT, unless the card is red or NERVE is short; else the pick
   * line, the result line and what follows (jobStep), with the kit events (PUSH, the deck's heat, a dead deck, the cost).
   */
  private async checkedPick(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, choice: Choice, o: { choice: string; said?: string; push?: boolean | PushMode; trade?: Trade; card?: string; press?: string; programs?: { load: string[]; run: string[] } }): Promise<Result | string> {
    const run0 = status.run;
    let check = choice.check!;
    const district = this.districtOf(q);
    const t = tagsOf(choice, run0.flags);
    const at = this.jobClock(q, t.minutes);
    const heat = (n: number): KitEvent => ({ at, heat: n, ...(district ? { district } : {}) });
    const line = o.said?.trim() || pickLine(choice.line);
    const nerveLeft = this.deps.quests?.kit?.(this.pid).nerveLeft ?? 0;
    const pending = run0.pending ?? null;
    // An old save's REROLL, parked before the table: TAKE IT plays its fail outcome as it always did.
    if (pending && isLegacyPending(pending)) {
      const outcome = q.outcomes.get(choice.fail!);
      if (!outcome) return 'that choice has passed';
      const roll: Roll = { stat: pending.stat, chance: pending.chance, rolls: pending.rolls, pass: false };
      return this.jobStep({ q, status, ctx, outcome, texts: [line, legacyRollLine(pending, false)], pick: { choice: choice.id, line, roll }, record: { beat: beat.id, choice: choice.id, roll }, minutes: t.minutes, kitBefore: [...(run0.kit ?? []), heat(1)], alarm: alarmPlus(run0.alarm, t.alarm + 1), flags: t.flags });
    }
    // A waiting roll lands (its own events are already on the run): a dealt one once every picked cost is settled
    // (costPick), with what each became; one parked before the deal with its fixed cost.
    if (pending) {
      const settled = pending.dealt ? (pending.settled ?? []) : null;
      const lineOf = (c: CostId) => pending.dealt!.find((d) => d.cost === c)?.line ?? COSTS[c].tag;
      const roll: DiceRoll = { ...pending.roll, ...(settled?.length ? { costs: settled.map((x) => ({ cost: x.cost, how: x.how ?? 'taken', line: lineOf(x.cost) })) } : {}) };
      return this.landRoll({ q, beat, status, ctx, choice, line, t, roll, cost: pending.cost, events: [], died: pending.died ?? null, heat, calls: [...(pending.call ? [pending.call] : []), ...(pending.after ?? [])], ...(settled ? { settled } : {}) });
    }
    // PUSH for dice or for effect, the trade (effect and NERVE spec §1); `push: true` from an old client is dice.
    const push: PushMode | null = o.push === true || o.push === 'dice' ? 'dice' : o.push === 'effect' ? 'effect' : null;
    const trade = o.trade ?? null;
    if (push && check.red) return "PUSH can't go on a one-shot card";
    if (push && nerveLeft < PUSH_NERVE) return 'not enough nerve';
    // A card from the hand (the hand spec §2): its effect at the position ALARM leaves, and whether it's an again-call.
    const hand = o.card !== undefined ? this.handCard(run0, o.card) : null;
    if (typeof hand === 'string') return hand;
    // An ON A ROLL ability beside it (ability pass spec §1): one press a roll, and never from the recruit who called.
    const side = o.press !== undefined ? this.handCard(run0, o.press) : null;
    if (typeof side === 'string') return side;
    if (side && (!side.ability || hand?.ability)) return 'one press a roll';
    if (side && hand?.member && hand.member.recruit.id === side.member!.recruit.id) return `${hand.member.recruit.name.split(' ')[0].toUpperCase()} ACTS ONCE A ROLL`;
    const who0 = this.poolWho(choice, ctx, beat, q, run0);
    // One More Thing moves the roll to COOL (tier 3 beat play spec §2): a call beside it is judged on COOL, and it on the card's own stat.
    const asked = check;
    const talksPast = (a?: Ability) => a?.job.kind === 'talk-past';
    if ((talksPast(hand?.ability) || talksPast(side?.ability)) && check.stat !== 'cool') check = swappedCheck(check, 'cool');
    const effect = hand ? this.cardEffect(hand.member, (talksPast(hand.ability) ? asked : check).stat, poolOf(check, who0).position, hand.contact, hand.ability, run0.getaway === true, check.red) : null;
    if (hand?.ability && !effect) return 'that card does nothing here';
    const called = effect ? { ...who0, call: effect } : who0;
    const pressEffect = side ? this.cardEffect(side.member, (talksPast(side.ability) ? asked : check).stat, poolOf(check, called).position, undefined, side.ability, run0.getaway === true, check.red) : null;
    if (side && !pressEffect) return 'that card does nothing here';
    const who = pressEffect ? { ...called, press: pressEffect } : called;
    const acts = [effect, pressEffect].flatMap((e) => e ?? []);
    const moved = acts.find((e) => e.step);
    const unmoved = moved && stepRefusal(poolOf(check, { ...who, ...(effect ? { call: stepless(effect) } : {}), ...(pressEffect ? { press: stepless(pressEffect) } : {}) }), moved.step!);
    if (unmoved) return unmoved;
    // An ability press costs NERVE, never the recruit (effect and NERVE spec §2).
    const pressCost = (hand?.ability ? abilityNerve(hand.ability.job) : 0) + (side?.ability ? abilityNerve(side.ability.job) : 0);
    const pushCost = push ? PUSH_NERVE : 0;
    if (pressCost && nerveLeft - pushCost < pressCost) return 'not enough nerve';
    if (push === 'dice' && poolOf(check, who).dice >= POOL_MAX) return `already rolling ${POOL_MAX} dice`;
    const why = (trade && tradeRefusal(poolOf(check, who), trade)) || (push === 'effect' && effectPushRefusal(poolOf(check, { ...who, ...(trade ? { trade } : {}) })));
    if (why) return why;
    // Programs (programs spec §1.2–1.5): loads fill free slots, runs need loading; each judged on the pool before programs.
    const progs = this.programsFor(run0, o.programs, check, (programs) => poolOf(check, { ...who, ...(push ? { push } : {}), ...(trade ? { trade } : {}), programs }), ctx.deck ?? null);
    if (typeof progs === 'string') return progs;
    // A mid-job load costs NERVE (programs spec §1.2a), after PUSH and a press.
    const loadCost = progs.load.length * HOT_LOAD_NERVE;
    if (loadCost && nerveLeft - pushCost - pressCost < loadCost) return 'not enough nerve';
    const pool = poolOf(check, { ...who, ...(push ? { push } : {}), ...(trade ? { trade } : {}), ...(progs.ran.length ? { programs: progs.ran } : {}) });
    const n = pool.dice >= 1 ? pool.dice : 2;
    const keep = pool.dice >= 1 ? 'high' : 'low';
    const faces = this.deps.rollDice ? this.deps.rollDice(n, keep) : Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const result = resultOf(faces, keep, pool.position);
    const deck = ctx.deck ?? null;
    const setupLeft = acts.find((e) => e.after)?.after;
    const events: KitEvent[] = [...(push ? [{ at, nerve: -PUSH_NERVE }] : []), ...(pressCost ? [{ at, nerve: -pressCost }] : []), ...(loadCost ? [{ at, nerve: -loadCost }] : [])];
    // A fragile deck dies on a miss that shows a 1.
    const died = check.grid && deck && deck.traits.includes('fragile') && fragileDies(faces, result) ? deck.name : null;
    if (died) events.push({ at, deck: null, lose: [deck!.id] });
    // The deck against the job's tier (deck effects spec §1): one that holds takes a 4–5's ALARM, an outclassed one adds to a
    // miss's; a hidden deck's grid check costs no heat (§2).
    const roll: DiceRoll = { stat: pool.stat, dice: Math.max(0, pool.dice), position: pool.position, faces, keep, kind: result.kind, pass: result.pass, ...(push ? { pushed: true as const } : {}), costs: [], ...(pool.deck?.hidden ? { hidden: true as const } : {}), ...(check.grid && deck?.heat && !pool.deck?.hidden ? { deckHeat: deck.heat } : {}), ...(pool.quiet ? { quiet: true as const } : {}), ...(pool.effect && pool.effect !== 'fair' ? { effect: pool.effect } : {}), ...(trade ? { trade } : {}), ...(progs.ran.length ? { programs: progs.ran.map((p) => p.id) } : {}), ...(setupLeft ? { setup: setupLeft } : {}), ...(acts.some((e) => e.missTake) ? { missTake: true as const } : {}) };
    // The costs (roll lifecycle spec §1.2): three dealt from those that can bite, picked by position; they replace the
    // position's fixed ALARM and heat (and a holding deck's automatic hold, now its armour).
    // Below the tier the lacquer notices each run (programs spec §1.3): ALARM +1 a run, landed with the roll.
    // A greed press's ALARM +1 (ability pass spec §2) lands the same way.
    const cost = { alarm: (pool.programs ?? []).reduce((n, p) => n + p.alarm, 0) + acts.reduce((n, e) => n + (e.alarm ?? 0) + (result.kind === 'miss' ? (e.missAlarm ?? 0) : 0), 0), heat: 0 };
    const seed = `${questKey(this.pair(), status.id)}|${beat.id}|${choice.id}|costs`;
    const { dealt, pick, filled } = this.dealFor(q, run0, choice, seed, { kind: result.kind, position: pool.position, effect: pool.effect, fills: pool.effect !== undefined, alarm: t.alarm + cost.alarm });
    // A recruit's again-call's miss may cost them (§2), drawn from the run's key, the beat and the recruit: rewind replays it.
    // An ability never does: it costs NERVE instead (effect and NERVE spec §2).
    const lossSeed = hand?.member ? `${questKey(this.pair(), status.id)}|${beat.id}|${hand.member.recruit.id}|again` : '';
    const loss = hand?.member && !hand.ability && hand.again && result.kind === 'miss' ? this.callLoss(hand.member, lossSeed, pool.position) : null;
    const call: Call | undefined = hand && o.card ? { beat: beat.id, choice: choice.id, card: hand.ability ? hand.member!.recruit.id : o.card, ...(hand.ability ? { ability: hand.ability.id } : {}), again: hand.again, at, ...(loss ? { loss } : {}) } : undefined;
    const pressCall: Call | undefined = side ? { beat: beat.id, choice: choice.id, card: side.member!.recruit.id, ability: side.ability!.id, again: false, at } : undefined;
    const played = [...(call ? [call] : []), ...(pressCall ? [pressCall] : [])];
    // A roll with costs to pick parks (roll lifecycle spec §1); so does one a brought AFTER A ROLL ability could act on
    // (crew abilities plan ruling 3). The GM writes the dealt costs into the scene while the cards are up (§1.4).
    const spent = pushCost + pressCost;
    // The loads go on the run (programs spec §3); a deck that died on this roll runs nothing more.
    const firm = acts.some((e) => e.firm);
    const run1: QuestRun = progs.load.length || (died && run0.setup?.deck) || firm ? { ...run0, ...(firm ? { firm: true as const } : {}), ...(progs.load.length ? { programs: [...(run0.programs ?? []), ...progs.load.map((id) => ({ id, at, hot: true as const }))] } : {}), ...(died && run0.setup?.deck ? { deckDead: true as const } : {}) } : run0;
    status = run1 === run0 ? status : { ...status, run: run1 };
    if (pick > 0 || this.afterCould(q, { ...run0, calls: [...(run0.calls ?? []), ...played] }, { beat: beat.id, choice: choice.id }, roll, cost, spent, played)) {
      const parked: DicePending = { beat: beat.id, choice: choice.id, at, roll, cost, ...(died ? { died } : {}), ...(call ? { call } : {}), ...(pressCall ? { after: [pressCall] } : {}), ...(dealt.length ? { dealt, pick, settled: [] } : {}) };
      const key = questKey(this.pair(), status.id);
      this.deps.db.setMeta(key, JSON.stringify({ ...run1, kit: [...(run1.kit ?? []), ...events], pending: parked, at: Date.now() }));
      // The GM first, so the state that shows the costs already says it's writing.
      if (dealt.length && this.deps.gm) void this.fillGm(this.deps.gm, key, this.pid, q, beat, choice, parked, { filled, size: jobTakeSize(q) });
      this.emitQuestState();
      return OK;
    }
    return this.landRoll({ q, beat, status, ctx, choice, line, t, roll, cost, events, died, heat, calls: played });
  }

  /**
   * The costs a result deals (roll lifecycle spec §1.2). TAKE −1 needs TAKE after this roll's own fill, at its effect and
   * under the cap (review I3); NEXT ROLL needs a next pick after the outcome that plays: the fail's on a miss, the pass's
   * on a 4–5 (review I4). `alarm`: what this roll adds to the run's before its costs.
   */
  private dealFor(q: QuestEntry, run: QuestRun, choice: Choice, seed: string, r: { kind: DiceResult['kind']; position: Position; effect: Effect | undefined; fills: boolean; alarm: number; less?: number; atLeast?: number }): { dealt: DealtCost[]; pick: number; filled: number } {
    const filled = Math.min(jobTakeSize(q), takeOf(run, q) + (r.fills ? kindResult(r.kind, r.position, r.effect).take : 0)) - (r.less ?? 0);
    const plays = r.kind === 'miss' ? choice.fail : choice.to;
    const ends = !plays || (q.outcomes.get(plays)?.to ?? 'end') === 'end';
    const can = { take: r.fills && filled > 0, next: !ends, alarm: (run.alarm ?? 0) + r.alarm < ALARM_MAX };
    const ids = r.kind === 'cost' || r.kind === 'miss' ? dealCosts(seed, can, run.setup?.approach) : [];
    const pick = Math.max(picksFor(r.kind, r.position, ids.length), Math.min(r.atLeast ?? 0, ids.length));
    const written = this.deps.quests?.gmWritten?.() ?? {};
    return { dealt: pick > 0 ? ids.map((c) => ({ cost: c, line: writtenLine(written, c, `${seed}|${c}`), by: 'written' as const })) : [], pick, filled };
  }

  /**
   * The programs a pick loads and runs (programs spec §1.2–1.5, §2.2), or why not. `poolAt` is the check's pool with
   * the given programs. A run from before programs has none.
   */
  private programsFor(run: QuestRun, asked: { load: string[]; run: string[] } | undefined, check: Check, poolAt: (programs: Program[]) => Pool, deck: Deck | null): { load: string[]; ran: Program[] } | string {
    const load = asked?.load ?? [];
    const again = asked?.run ?? [];
    if (load.length === 0 && again.length === 0) return { load: [], ran: [] };
    const slots = run.setup?.deck;
    if (!slots || isOldRun(run)) return 'NOT LOADED';
    if (run.deckDead) return 'THE DECK IS DEAD';
    const catalog = this.deps.quests?.programs?.() ?? [];
    const all = [...load, ...again];
    if (new Set(all).size !== all.length || all.some((id) => !catalog.some((p) => p.id === id))) return 'NOTHING TO DO HERE';
    const loaded = run.programs ?? [];
    if (load.some((id) => loaded.some((l) => l.id === id))) return 'NOTHING TO DO HERE';
    if (loaded.length + load.length > slots.slots) return 'NO FREE SLOT';
    if (again.some((id) => !loaded.some((l) => l.id === id && !l.burned))) return 'NOT LOADED';
    // Judged one after another (Task 5 review I1): each must still move the pool after the ones before it. One the rest
    // of the pick already covers (a lift or SAFE into the dark, PUSH or BOLD to BIG) is dropped, not refused: it neither
    // loads nor costs the lacquer's ALARM, and the pick goes through (final review I1).
    const ran: Program[] = [];
    for (const p of all.map((id) => catalog.find((x) => x.id === id)!)) {
      const why = programJudge(p, poolAt, ran, check, deck);
      if (why && !COVERED.has(why)) return why;
      if (!why) ran.push(p);
    }
    return { load: load.filter((id) => ran.some((p) => p.id === id)), ran };
  }

  /**
   * A card in the run's hand (the hand spec §2): the recruit (null for the favour) and whether it's an again-call,
   * or why it can't play: not brought, spent, down from a loss, or a FENCE (who plays at the end).
   */
  private handCard(run: QuestRun, card: string, parked = false): { member: CrewMember | null; contact?: ContactCard; ability?: Ability; again: boolean } | string {
    const setup = run.setup;
    const calls = this.callsOf(run);
    const missing = "that card isn't in your hand";
    if (!setup) return missing;
    // An ability (crew abilities spec §2): in the loadout taken at GO IN, its timing right for the moment, the stack not down.
    const ac = abilityCard(card);
    if (ac) {
      const member = setup.people.includes(ac.rid) ? this.crewOn(setup).find((m) => m.recruit.id === ac.rid) : undefined;
      const ability = (this.deps.quests?.crewAbilities?.() ?? []).find((a) => a.id === ac.ability);
      if (!member || !ability || !(setup.abilities?.[ac.rid] ?? []).includes(ac.ability)) return missing;
      const first = member.recruit.name.split(' ')[0].toUpperCase();
      if (calls.some((c) => c.card === ac.rid && c.loss)) return `${first} IS DOWN`;
      const timing = TIMING[ability.job.kind];
      if (timing === 'end') return `${first} PLAYS IT AT THE END`;
      if (timing === 'auto') return `${first} PLAYS IT WHEN IT COMES`;
      if (timing === 'after' && !parked) return "that one goes on a roll that's landed";
      if (timing === 'roll' && parked) return 'that one goes with a roll';
      // Once per job (ability pass spec §1).
      if (pressed(calls, ac.rid, ac.ability)) return `${first} HAS PLAYED THAT`;
      return { member, ability, again: false };
    }
    // A contact card (contact cards spec §3): once per job, free; a fence plays itself at the end.
    const cid = contactId(card);
    if (cid !== null) {
      const contact = setup.contacts?.find((c) => c.id === cid);
      if (!contact) return missing;
      const first = contact.name.split(' ')[0].toUpperCase();
      if (!SPEC_STAT[contact.spec]) return contact.spec === 'fence' ? `${first} PLAYS AT THE END` : `${first} CAN'T BE CALLED`;
      return calls.some((c) => c.card === card) ? `${first} IS SPENT` : { member: null, contact, again: false };
    }
    if (card === 'favour') {
      if (!setup.favour) return missing;
      return calls.some((c) => c.card === 'favour') ? 'the favour is spent' : { member: null, again: false };
    }
    const member = setup.people.includes(card) ? this.crewOn(setup).find((m) => m.recruit.id === card) : undefined;
    if (!member) return missing;
    const first = member.recruit.name.split(' ')[0].toUpperCase();
    if (calls.some((c) => c.card === card && c.loss)) return `${first} IS DOWN`;
    // A guest isn't yours to spend (guest crew spec §2): one call, no second at a risk.
    if (setup.guest && card === guestId(setup.guest.id) && pressed(calls, card)) return `${first} IS SPENT`;
    if (!SPEC_STAT[member.recruit.spec]) return member.recruit.spec === 'fence' ? `${first} PLAYS AT THE END` : `${first} CAN'T BE CALLED`;
    return { member, again: pressed(calls, card) };
  }

  /**
   * Whether a brought AFTER A ROLL ability could act on this roll (crew abilities plan ruling 3): a save on a miss, an
   * ALARM −1 when it costs ALARM, a NERVE +1 on a roll that cost something while NERVE is short of full and not gone
   * (final review I2: otherwise it lit only when NERVE was high enough to STEADY anyway), a NERVE +2 trade even at 0.
   */
  private afterCould(q: QuestEntry, run: QuestRun, at: { beat: string; choice: string }, roll: DiceRoll, cost: { alarm: number; heat: number }, spent = 0, played: Call[] = []): boolean {
    const setup = run.setup;
    if (!setup?.abilities) return false;
    const calls = run.calls ?? [];
    const book = this.deps.quests?.crewAbilities?.() ?? [];
    const kit = this.deps.quests?.kit?.(this.pid);
    // Not when the roll's own spends took the last of it: NERVE +1 can't lift NERVE GONE (Task 4 review).
    const costly = cost.alarm > 0 || cost.heat > 0;
    const nerveWants = costly && kit !== undefined && !kit.nerveGone && kit.nerveLeft - spent > 0 && kit.nerveLeft < kit.nerveMax;
    // The trade is the way back from NERVE GONE: an empty NERVE wants it most.
    const tradeWants = costly && kit !== undefined && kit.nerveLeft - spent < kit.nerveMax;
    // Only one you could pay for (effect and NERVE spec §2), after what the roll itself spent.
    const affords = (a: Ability) => abilityNerve(a.job) === 0 || (kit !== undefined && !kit.nerveGone && kit.nerveLeft - spent >= abilityNerve(a.job));
    // The ability pass's (spec §2): a gamble on its result; a trade only where you'd want it, so a clean roll isn't stopped for nothing.
    const passes = (a: Ability) => {
      const kind = a.job.kind;
      const could = afterRefusal(kind, q, run, { ...at, roll, cost }) === null;
      if (kind === 'trade-nerve') return could && tradeWants;
      if (kind === 'trade-alarm') return could && (run.alarm ?? 0) + cost.alarm >= ALARM_SHIFT;
      return could;
    };
    const acts = (a: Ability) => affords(a) && (PASS_AFTER.has(a.job.kind) ? passes(a) : a.job.kind === 'save' || a.job.kind === 'alarm' ? afterEffect(a.job, roll, cost) !== null : a.job.kind === 'nerve' && nerveWants);
    const fresh = (rid: string) => !played.some((c) => c.card === rid);
    return setup.people.some((rid) => fresh(rid) && !calls.some((c) => c.card === rid && c.loss) && (setup.abilities?.[rid] ?? []).some((aid) => !pressed(calls, rid, aid) && book.some((a) => a.id === aid && acts(a))));
  }

  /**
   * An AFTER A ROLL ability pressed on the parked roll (crew abilities spec §2): its effect on the roll, its cost or NERVE,
   * written to the pending with its call; its NERVE paid at the roll's minute (effect and NERVE spec §2). No row: STEADY / TAKE IT still land it.
   */
  private async afterPress(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, pending: DicePending, card: string): Promise<Result | string> {
    const run0 = status.run;
    const hand = this.handCard(run0, card, true);
    if (typeof hand === 'string') return hand;
    if (!hand.ability || !hand.member) return "that card isn't in your hand";
    const rid = hand.member.recruit.id;
    // One act a recruit a roll (ability pass spec §1).
    if (actedOn(pending, rid)) return `${hand.member.recruit.name.split(' ')[0].toUpperCase()} ACTS ONCE A ROLL`;
    const kit = this.deps.quests?.kit?.(this.pid);
    const gives = hand.ability.job.kind === 'nerve' || hand.ability.job.kind === 'trade-nerve';
    if (hand.ability.job.kind === 'nerve' && kit?.nerveGone) return 'NERVE GONE';
    if (gives && (kit?.nerveLeft ?? 0) >= (kit?.nerveMax ?? 0)) return 'NERVE is full';
    if (PASS_AFTER.has(hand.ability.job.kind)) return this.passPress(q, beat, status, ctx, pending, hand.member, hand.ability, hand.again);
    // On a dealt roll (roll lifecycle spec §1.2) ALARM −1 settles a picked ALARM +1 instead of the old fixed ALARM.
    const pickedAlarm = pending.dealt && hand.ability.job.kind === 'alarm' ? (pending.settled ?? []).find((x) => x.cost === 'alarm' && !x.how) : undefined;
    if (pending.dealt && hand.ability.job.kind === 'alarm' && !pickedAlarm) return 'pick ALARM +1 first';
    const eff = pickedAlarm ? { roll: pending.roll, cost: pending.cost, nerve: 0 } : afterEffect(hand.ability.job, pending.roll, pending.cost);
    if (!eff) return 'that does nothing on this roll';
    const price = abilityNerve(hand.ability.job);
    if (price && (kit?.nerveGone || (kit?.nerveLeft ?? 0) < price)) return 'not enough nerve';
    // At the roll's own minute (review M2), after what it spent, so a NERVE +1 can't come before a PUSH that emptied it.
    const at = pending.at ?? this.deps.clockNow?.() ?? 0;
    const call: Call = { beat: beat.id, choice: pending.choice, card: rid, ability: hand.ability.id, again: hand.again, at };
    const kitEvents: KitEvent[] = eff.nerve - price ? [{ at, nerve: eff.nerve - price }] : [];
    // A save on a dealt miss: the 4–5's pick count (§1.2); picks past it that aren't settled go back.
    const pick = pending.dealt && hand.ability.job.kind === 'save' ? picksFor(eff.roll.kind, eff.roll.position, pending.dealt.length) : undefined;
    let settled = pending.settled;
    // Settled picks stay; open ones fill up to the new count (review M5).
    if (settled && pick !== undefined) {
      const done = settled.filter((x) => x.how);
      settled = [...done, ...settled.filter((x) => !x.how).slice(0, Math.max(0, pick - done.length))];
    }
    if (settled && pickedAlarm) settled = settled.map((x) => (x === pickedAlarm ? { ...x, how: 'ability' as const } : x));
    // A dealt roll's costs are its deal (review C1): a save changes the roll and the pick count, never the fixed cost.
    const next: DicePending = { ...pending, roll: eff.roll, cost: pending.dealt ? pending.cost : eff.cost, after: [...(pending.after ?? []), call], ...(pick !== undefined ? { pick } : {}), ...(settled ? { settled } : {}) };
    const run: QuestRun = { ...run0, kit: [...(run0.kit ?? []), ...kitEvents], pending: next, at: Date.now() };
    if (next.dealt && settledAll(next)) return this.landDealt(q, beat, { ...status, run }, ctx);
    this.deps.db.setMeta(questKey(this.pair(), status.id), JSON.stringify(run));
    this.emitQuestState();
    return OK;
  }

  /**
   * A gamble or a trade on the parked roll (ability pass spec §2), paid at the roll's minute. A gamble's die rewrites the
   * result before any cost is picked: a changed result's costs are redealt, seeded so rewind matches; a result that stays
   * picks one more. A trade moves what the roll lands with.
   */
  private passPress(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, pending: DicePending, member: CrewMember, ability: Ability, again: boolean): Result | string | Promise<Result | string> {
    const run0 = status.run;
    const kind = ability.job.kind;
    const why = afterRefusal(kind, q, run0, pending);
    if (why) return why;
    const kit = this.deps.quests?.kit?.(this.pid);
    const price = abilityNerve(ability.job);
    if (price && (kit?.nerveGone || (kit?.nerveLeft ?? 0) < price)) return 'not enough nerve';
    const at = pending.at ?? this.deps.clockNow?.() ?? 0;
    const choice = beat.choices.find((c) => c.id === pending.choice);
    if (!choice) return 'that choice has passed';
    const key = questKey(this.pair(), status.id);
    const seed = `${key}|${beat.id}|${pending.choice}|costs`;
    const call: Call = { beat: beat.id, choice: pending.choice, card: member.recruit.id, ability: ability.id, again, at };
    let next: DicePending = { ...pending, after: [...(pending.after ?? []), call] };
    let filled = 0;
    let redealt = false;
    let nerve = -price;
    const lift = kind === 'trade-nerve' && kit?.nerveGone === true;
    if (kind === 'gamble-cost' || kind === 'gamble-miss') {
      const gseed = `${key}|${beat.id}|${pending.choice}|${ability.id}|gamble`;
      const die = this.deps.gambleDie?.(gseed) ?? gambleDie(gseed);
      const from = kind === 'gamble-cost' ? ('cost' as const) : ('miss' as const);
      const result = gambleResult(die, from);
      const t = tagsOf(choice, run0.flags);
      const dealOf = (kind: DiceResult['kind'], position: Position, effect: Effect | undefined, atLeast = 0, off = 0) => this.dealFor(q, run0, choice, `${seed}|gamble`, { kind, position, effect, fills: rollFills(q, run0), alarm: t.alarm + pending.cost.alarm - off, less: pending.roll.lessTake, atLeast });
      if (result === 'worse') {
        // It stays what it was, for one more cost; a 4–5 with none dealt gets one.
        const fresh = pending.dealt ? null : dealOf(pending.roll.kind, pending.roll.position, pending.roll.effect, 1);
        next = { ...next, roll: { ...pending.roll, gamble: { die, from } }, ...(pending.dealt ? { pick: Math.min(pending.dealt.length, (pending.pick ?? 0) + 1) } : fresh?.dealt.length ? { dealt: fresh.dealt, pick: fresh.pick, settled: [] } : {}) };
        if (fresh?.dealt.length) {
          filled = fresh.filled;
          redealt = true;
        }
      } else {
        const top = result === 'clean' ? 6 : 5;
        // Past a save the roll is the gamble's: `saved` would fill TAKE as a 4–5 whatever it became (review I1).
        const { saved: _saved, ...was } = pending.roll;
        const roll: DiceRoll = { ...was, faces: gambleFaces(pending.roll.faces, pending.roll.keep, top), kind: result, pass: true, gamble: { die, from } };
        // One More Thing's ALARM goes with the miss it came on.
        const off = from === 'miss' && this.talkedPast(next) ? 1 : 0;
        const deal = dealOf(result, roll.position, roll.effect, 0, off);
        const { dealt: _d, pick: _p, settled: _s, ...rest } = next;
        next = { ...rest, roll, cost: { ...pending.cost, alarm: pending.cost.alarm - off }, ...(deal.dealt.length ? { dealt: deal.dealt, pick: deal.pick, settled: [] } : {}) };
        filled = deal.filled;
        redealt = deal.dealt.length > 0;
      }
    } else if (kind === 'rerun') {
      const rseed = `${key}|${beat.id}|${pending.choice}|${ability.id}|rerun`;
      const roll = rerunRoll({ seed: rseed, roll: pending.roll, faces: this.deps.rerunFaces?.(rseed) });
      const t = tagsOf(choice, run0.flags);
      // One More Thing's ALARM goes with a miss, and an again-call's loss with the miss that drew it.
      const shift = this.talkedPast(next) ? (roll.kind === 'miss' ? 1 : 0) - (pending.roll.kind === 'miss' ? 1 : 0) : 0;
      const cost = { ...pending.cost, alarm: pending.cost.alarm + shift };
      const deal = this.dealFor(q, run0, choice, `${seed}|rerun`, { kind: roll.kind, position: roll.position, effect: roll.effect, fills: rollFills(q, run0), alarm: t.alarm + cost.alarm, less: roll.lessTake });
      const { dealt: _d, pick: _p, settled: _s, call: played, ...rest } = next;
      const { loss: _loss, ...kept } = played ?? ({} as Call);
      next = { ...rest, roll, cost, ...(played ? { call: roll.pass ? (kept as Call) : played } : {}), ...(deal.dealt.length ? { dealt: deal.dealt, pick: deal.pick, settled: [] } : {}) };
      filled = deal.filled;
      redealt = deal.dealt.length > 0;
    } else if (kind === 'undo') {
      // The roll never happened: nothing it dealt lands, what was spent on it stays spent, and a NEXT ROLL it used is used up.
      // A loss drawn on it, or a deck it killed, never happened either.
      const { next: _used, pending: _gone, deckDead: _dead, ...rest } = run0;
      const spentOn = [...(next.call ? [next.call] : []), ...(next.after ?? [])].map(({ loss: _loss, ...c }) => c);
      const kit = (run0.kit ?? []).filter((e) => !(pending.died && e.at === at && e.lose));
      const run: QuestRun = { ...rest, ...(run0.deckDead && !pending.died ? { deckDead: true as const } : {}), calls: [...(run0.calls ?? []), ...spentOn], kit: [...kit, ...(price ? [{ at, nerve: -price }] : [])], barred: { beat: beat.id, choice: pending.choice }, at: Date.now() };
      this.deps.db.setMeta(key, JSON.stringify(run));
      this.emitQuestState();
      return OK;
    } else if (kind === 'talk-down') {
      const held = this.fallFor(member, 'held');
      next = { ...next, roll: { ...pending.roll, softened: true }, after: [...(pending.after ?? []), { ...call, loss: held }] };
    } else if (kind === 'take-hit') {
      // Every cost the roll deals is theirs: the picks fill from the deal, none of them landing, and the roll lands with them.
      next = { ...next, after: [...(pending.after ?? []), { ...call, loss: 'hurt' }], settled: pending.dealt!.slice(0, pending.pick ?? 0).map((d) => ({ cost: d.cost, how: 'ability' as const })) };
    } else if (kind === 'trade-alarm') {
      next = { ...next, cost: { ...pending.cost, alarm: pending.cost.alarm - 1 }, roll: { ...pending.roll, lessTake: (pending.roll.lessTake ?? 0) + 1 } };
    } else {
      next = { ...next, cost: { ...pending.cost, alarm: pending.cost.alarm + 1 } };
      nerve = Math.min(2, (kit?.nerveMax ?? 0) - (kit?.nerveLeft ?? 0));
    }
    const run: QuestRun = { ...run0, kit: [...(run0.kit ?? []), ...(nerve ? [{ at, nerve, ...(lift ? { lift } : {}) }] : [])], pending: next, at: Date.now() };
    if (kind === 'take-hit') return this.landDealt(q, beat, { ...status, run }, ctx);
    this.deps.db.setMeta(key, JSON.stringify(run));
    if (redealt && this.deps.gm) void this.fillGm(this.deps.gm, key, this.pid, q, beat, choice, next, { filled, size: jobTakeSize(q) });
    this.emitQuestState();
    return OK;
  }

  /** Whether One More Thing went on this waiting roll. */
  private talkedPast(p: DicePending): boolean {
    const book = this.deps.quests?.crewAbilities?.() ?? [];
    return [p.call, ...(p.after ?? [])].some((c) => c?.ability && book.find((a) => a.id === c.ability)?.job.kind === 'talk-past');
  }

  /** The waiting roll's costs as the table shows them (roll lifecycle spec §1.5): dealt, picked, settled; RESIST; ARMOUR. */
  private costsView(q: QuestEntry, beat: Beat, run: QuestRun, p: DicePending, ctx: CondCtx, player: string): NonNullable<NonNullable<QuestState['active']>['costs']> {
    const choice = beat.choices.find((c) => c.id === p.choice);
    const pool = choice?.check ? this.poolFor(choice, ctx, beat, { q, run, player }) : null;
    const kit = this.deps.quests?.kit?.(this.pid);
    const settled = p.settled ?? [];
    const why = choice?.check?.red ? 'ONE SHOT' : kit?.nerveGone ? 'NERVE GONE' : (kit?.nerveLeft ?? 0) < 1 ? 'NO NERVE' : undefined;
    const holds = Boolean(choice?.check?.grid && pool?.deck?.match === 'holds');
    // The approach's own cost is the only first pick (approach shapes spec §1).
    const first = settled.length === 0 ? firstCost(run.setup?.approach, p.dealt!.map((d) => d.cost)) : null;
    return {
      pick: p.pick ?? 0,
      ...(this.gmWriting.has(`${player}|${p.at}`) ? { writing: true as const } : {}),
      dealt: p.dealt!.map((d) => {
        const x = settled.find((y) => y.cost === d.cost);
        return { cost: d.cost, tag: COSTS[d.cost].tag, line: d.line, by: d.by, picked: Boolean(x), ...(d.cost === first ? { first: true as const } : {}), ...(x?.how ? { settled: x.how } : {}), ...(x?.faces ? { faces: x.faces } : {}), ...(x?.nerve !== undefined ? { nerve: x.nerve } : {}) };
      }),
      resist: { dice: statDice((ctx.stats ?? DEFAULT_STATS).edge) + (choice?.check?.grid && pool?.deck?.chrome ? RESIST_CHROME_DIE : 0), ok: why === undefined, ...(why ? { why } : {}) },
      armour: run.setup?.deck && !isOldRun(run) ? (choice?.check?.red ? { ok: false, left: 0 } : this.firewallView(run, run.setup.deck)) : { ok: holds && !run.armourUsed, left: holds && !run.armourUsed ? 1 : 0 },
    };
  }

  /** FIREWALL as a program (programs spec §2.3): loaded and not burned, or a free slot that would load it. */
  private firewallView(run: QuestRun, deck: NonNullable<Setup['deck']>): { ok: boolean; left: number; load?: true } {
    if (run.deckDead) return { ok: false, left: 0 };
    const loaded = run.programs ?? [];
    const fw = loaded.find((l) => l.id === FIREWALL);
    if (fw) return fw.burned ? { ok: false, left: 0 } : { ok: true, left: 1 };
    // Loading it here costs NERVE (§1.2a): none left, no FIREWALL.
    const kit = this.deps.quests?.kit?.(this.pid);
    const nerve = !kit?.nerveGone && (kit?.nerveLeft ?? 0) >= HOT_LOAD_NERVE;
    return loaded.length < deck.slots && nerve ? { ok: true, left: 1, load: true } : { ok: false, left: 0 };
  }

  /**
   * A cost on the waiting roll (roll lifecycle spec §1.2–1.3): `!cost` picks it; `!take`, `!resist` and `!armour` settle a
   * picked one (`!take` with no card: every picked one not yet settled). When the last is settled the roll lands.
   */
  private async costPick(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, p: DicePending, choiceId: string, card: string | undefined): Promise<Result | string> {
    const run0 = status.run;
    const choice = beat.choices.find((c) => c.id === p.choice);
    if (!choice?.check) return 'that choice has passed';
    const settled = p.settled ?? [];
    const id = card as CostId | undefined;
    const key = questKey(this.pair(), status.id);
    // The last settle goes straight to landing, unwritten: a rewind then brings back a roll still to settle (review).
    const write = async (run: QuestRun): Promise<Result | string> => {
      if (settledAll(run.pending as DicePending)) return this.landDealt(q, beat, { ...status, run }, ctx);
      this.deps.db.setMeta(key, JSON.stringify(run));
      this.emitQuestState();
      return OK;
    };
    if (choiceId === COST) {
      if (!id || !p.dealt!.some((d) => d.cost === id)) return "that cost isn't dealt";
      if (settled.some((x) => x.cost === id)) return 'already picked';
      if (settled.length >= (p.pick ?? 0)) return 'pick no more';
      // Nothing lands on the deal itself: AFTER A ROLL abilities and gambles need a roll with nothing picked yet.
      const first = settled.length === 0 ? firstCost(run0.setup?.approach, p.dealt!.map((d) => d.cost)) : null;
      if (first && first !== id) return `pick ${COSTS[first].tag} first`;
      // Stand Firm (tier 3 beat play spec §2): the first cost picked on a roll is gone.
      const firm = run0.firm && settled.length === 0;
      return write({ ...run0, pending: { ...p, settled: [...settled, { cost: id, ...(firm ? { how: 'ability' as const } : {}) }] }, at: Date.now() });
    }
    // A bare TAKE IT with nothing picked (an old client's card): the first dealt costs, as dealt, are picked and taken.
    if (choiceId === TAKE && !id && settled.length === 0) {
      const first = p.dealt!.slice(0, p.pick ?? 0).map((d) => ({ cost: d.cost, how: 'taken' as const }));
      return write({ ...run0, pending: { ...p, settled: first }, at: Date.now() });
    }
    const open = settled.filter((x) => !x.how).map((x) => x.cost);
    const targets = id ? [id] : choiceId === TAKE ? open : [];
    if (targets.length === 0) return id || choiceId === TAKE ? 'pick a cost first' : 'which cost?';
    for (const c of targets) if (!open.includes(c)) return settled.some((x) => x.cost === c) ? 'already settled' : 'pick it first';
    const settle = (c: CostId, how: SettledCost['how'], extra: Partial<SettledCost> = {}) => settled.map((x) => (x.cost === c ? { ...x, how, ...extra } : x));
    if (choiceId === TAKE) return write({ ...run0, pending: { ...p, settled: settled.map((x) => (targets.includes(x.cost) && !x.how ? { ...x, how: 'taken' as const } : x)) }, at: Date.now() });
    const c = targets[0];
    const pool = this.poolFor(choice, ctx, beat, { q, run: run0, player: this.pid });
    if (choiceId === ARMOUR && run0.setup?.deck && !isOldRun(run0)) {
      // FIREWALL (programs spec §2.3): the loaded one burns, or a free slot loads it burned; below the tier the lacquer
      // adds ALARM +1, landed with the roll (it deals nothing new).
      // A red card stays hard: no PUSH, no programs, no RESIST, no FIREWALL.
      if (choice.check.red) return 'ONE SHOT';
      const view = this.firewallView(run0, run0.setup.deck);
      if (!view.ok) return run0.deckDead ? 'THE DECK IS DEAD' : (run0.programs ?? []).length < run0.setup.deck.slots ? 'not enough nerve' : 'NO FREE SLOT';
      const fw = (this.deps.quests?.programs?.() ?? []).find((x) => x.id === FIREWALL);
      const deck = ctx.deck ?? null;
      const lacquer = fw && deck && belowTier(deck, fw, isJob(q) ? q.tier : undefined) ? 1 : 0;
      // Loaded here, mid-job, it costs 1 NERVE (§1.2a); firewallView has checked there's NERVE for it.
      const at = p.at ?? this.deps.clockNow?.() ?? 0;
      const programs = view.load ? [...(run0.programs ?? []), { id: FIREWALL, at, burned: true as const, hot: true as const }] : (run0.programs ?? []).map((l) => (l.id === FIREWALL ? { ...l, burned: true as const } : l));
      return write({ ...run0, programs, ...(view.load ? { kit: [...(run0.kit ?? []), { at, nerve: -HOT_LOAD_NERVE }] } : {}), pending: { ...p, cost: { ...p.cost, alarm: p.cost.alarm + lacquer }, settled: settle(c, 'armour') }, at: Date.now() });
    }
    if (choiceId === ARMOUR) {
      if (!choice.check.grid || pool.deck?.match !== 'holds') return 'no armour here';
      if (run0.armourUsed) return 'the armour is spent';
      return write({ ...run0, armourUsed: true, pending: { ...p, settled: settle(c, 'armour') }, at: Date.now() });
    }
    // RESIST (§1.3): always works; EDGE's dice set the NERVE, at the roll's minute.
    if (choice.check.red) return "a one-shot card can't RESIST";
    const kit = this.deps.quests?.kit?.(this.pid);
    if (kit?.nerveGone) return 'NERVE GONE';
    const left = kit?.nerveLeft ?? 0;
    if (left < 1) return 'not enough nerve';
    const n = statDice((ctx.stats ?? DEFAULT_STATS).edge) + (choice.check.grid && pool.deck?.chrome ? RESIST_CHROME_DIE : 0);
    const faces = this.deps.rollDice ? this.deps.rollDice(n, 'high') : Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const price = resistPrice(faces);
    const delta = price > 0 ? -Math.min(price, left) : price < 0 && left < (kit?.nerveMax ?? 0) ? 1 : 0;
    const at = p.at ?? this.deps.clockNow?.() ?? 0;
    return write({ ...run0, kit: [...(run0.kit ?? []), ...(delta ? [{ at, nerve: delta }] : [])], pending: { ...p, settled: settle(c, 'resisted', { faces, nerve: -delta }) }, at: Date.now() });
  }

  /** A dealt roll whose picked costs are all settled lands through the waiting-roll path of checkedPick. */
  private landDealt(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx): Promise<Result | string> {
    const p = status.run.pending as DicePending;
    const choice = beat.choices.find((c) => c.id === p.choice)!;
    return this.checkedPick(q, beat, status, ctx, choice, { choice: TAKE });
  }

  /**
   * The GM's lines for a parked roll's dealt costs (roll lifecycle spec §1.4). They replace written lines on costs not
   * yet picked, if the same roll is still waiting; a pick keeps the line it showed. `writing` holds the cards' lines back
   * meanwhile, up to GM_HOLD_MS; a later answer is dropped, so a line never changes once it shows.
   */
  private async fillGm(gm: GmComplete, key: string, player: string, q: QuestEntry, beat: Beat, choice: Choice, parked: DicePending, take: { filled: number; size: number }): Promise<void> {
    const tag = `${player}|${parked.at}`;
    const me = Symbol(tag);
    this.gmWriting.set(tag, me);
    const done = () => {
      if (this.gmWriting.get(tag) !== me) return;
      this.gmWriting.delete(tag);
      this.emitQuestState(player);
    };
    const hold = setTimeout(done, GM_HOLD_MS);
    const costs = parked.dealt!.map((d) => d.cost);
    const msgs = gmMessages({ title: q.title, beat: beat.text, choice: choice.line, kind: parked.roll.kind === 'miss' ? 'miss' : 'cost', position: parked.roll.position, loot: q.loot ?? q.pitch ?? q.title, take, costs });
    const lines = await askGm(gm, msgs, costs, (text) => this.deps.emit({ type: 'dev_log', level: 'info', text }, player));
    clearTimeout(hold);
    // Past the hold, or a redeal took over: the written lines are up, or the deal is another one's.
    if (this.gmWriting.get(tag) !== me) return;
    const run = parseRunOf(this.deps.db.getMeta(key));
    const p = run?.pending;
    if (Object.keys(lines).length > 0 && run && p && !isLegacyPending(p) && p.dealt && p.beat === parked.beat && p.choice === parked.choice && p.at === parked.at && p.roll.faces.join() === parked.roll.faces.join()) {
      const picked = new Set((p.settled ?? []).map((x) => x.cost));
      const dealt = p.dealt.map((d) => (!picked.has(d.cost) && lines[d.cost] ? { ...d, line: lines[d.cost]!, by: 'gm' as const } : d));
      this.deps.db.setMeta(key, JSON.stringify({ ...run, pending: { ...p, dealt } }));
    }
    done();
  }

  /** The run's calls, with a parked roll's card and its AFTER A ROLL presses (they're written when it lands). */
  private callsOf(run: QuestRun): Call[] {
    const p = run.pending && !isLegacyPending(run.pending) ? run.pending : null;
    return [...(run.calls ?? []), ...(p?.call ? [p.call] : []), ...(p?.after ?? [])];
  }

  /** A playable card's effect on a check of `stat` at `position`, labelled with the recruit's first name (or FAVOUR). */
  private cardEffect(member: CrewMember | null, stat: string, position: Position, contact?: ContactCard, ability?: Ability, getaway = false, red = false): CallEffect | null {
    if (ability && member) {
      const e = abilityEffect(ability.job, member.recruit.spec, stat, position, getaway, member.recruit.grade, red);
      return e && { ...e, label: ability.label };
    }
    if (contact) {
      const e = callEffect({ spec: contact.spec }, stat, position);
      return e && { ...e, label: contact.name.split(' ')[0] };
    }
    const e = callEffect(member ? { spec: member.recruit.spec } : 'favour', stat, position);
    return e && member ? { ...e, label: member.recruit.name.split(' ')[0], grade: member.recruit.grade } : e;
  }

  /** An again-call's miss (§2): the recruit's loss, or null; never-held makes held hurt. */
  private callLoss(member: CrewMember, seed: string, position: Position): 'hurt' | 'held' | null {
    return lossOnAgain({ seed, grade: member.recruit.grade, position, neverHeld: this.neverHeld(member) });
  }

  private neverHeld(member: CrewMember): boolean {
    const traits = this.deps.quests?.crewTraits?.() ?? [];
    return member.recruit.traits.some((id) => traits.find((t) => t.id === id)?.effect.kind === 'never-held');
  }

  /** What a recruit's own fall costs them: held, or hurt with never-held. */
  private fallFor(member: CrewMember, fall: 'held'): 'held' | 'hurt' {
    return this.neverHeld(member) ? 'hurt' : fall;
  }

  /** Ability labels for ids, in order; ids gone from the book are left out. */
  private abilityLabels(ids: string[]): string[] {
    const book = this.deps.quests?.crewAbilities?.() ?? [];
    return ids.flatMap((id) => book.filter((a) => a.id === id).map((a) => a.label));
  }

  /** A recruit's traits as their card shows them: the revealed ones a job reads (a hidden one waits for its third run). */
  private shownTraits(m: CrewMember): { label: string; good: boolean }[] {
    const book = this.deps.quests?.crewTraits?.() ?? [];
    return m.revealed.flatMap((id) => book.filter((t) => t.id === id && worksInGraft(t)).map((t) => ({ label: t.label, good: t.good })));
  }

  /** The hand as the table shows it (§2): each recruit brought, their free call and again risk, who's down, the favour. */
  private handView(q: QuestEntry, run: QuestRun): HandView | null {
    const setup = run.setup;
    if (!setup) return null;
    const calls = this.callsOf(run);
    const members = this.crewOn(setup);
    const book = this.deps.quests?.crewAbilities?.() ?? [];
    const parked = run.pending && !isLegacyPending(run.pending) ? run.pending : null;
    const kit = this.deps.quests?.kit?.(this.pid);
    const people = setup.people.flatMap((id) => {
      const m = members.find((x) => x.recruit.id === id);
      if (!m) return [];
      const r = m.recruit;
      const callable = SPEC_STAT[r.spec] !== undefined;
      const called = pressed(calls, id);
      const down = calls.some((c) => c.card === id && c.loss !== undefined);
      // Each ability in the loadout taken at GO IN (crew abilities spec §2): its NERVE a press (effect and NERVE spec §2).
      const abilities = (setup.abilities?.[id] ?? []).flatMap((aid) =>
        book.filter((a) => a.id === aid).map((a) => {
          const timing = TIMING[a.job.kind];
          const nerve = abilityNerve(a.job);
          const afford = nerve === 0 || (kit !== undefined && !kit.nerveGone && kit.nerveLeft >= nerve);
          const used = pressed(calls, id, aid);
          const nerveFull = a.job.kind === 'nerve' && (kit?.nerveGone === true || (kit?.nerveLeft ?? 0) >= (kit?.nerveMax ?? 0));
          const passes = parked !== null && PASS_AFTER.has(a.job.kind);
          const acts = passes ? afterRefusal(a.job.kind, q, run, parked) === null : parked?.dealt && a.job.kind === 'alarm' ? (parked.settled ?? []).some((x) => x.cost === 'alarm' && !x.how) : parked !== null && afterEffect(a.job, parked.roll, parked.cost) !== null;
          const acted = parked !== null && actedOn(parked, id);
          const tradeFull = a.job.kind === 'trade-nerve' && (kit?.nerveLeft ?? 0) >= (kit?.nerveMax ?? 0);
          const playable = timing === 'after' && parked !== null && !down && !used && !nerveFull && !tradeFull && !acted && afford && acts;
          return { id: aid, label: a.label, kind: a.job.kind, timing, words: jobWords(a.job), nerve, afford, used, playable };
        }),
      );
      const guest = setup.guest && id === guestId(setup.guest.id) ? { guest: true as const, art: `/contacts/${setup.guest.id}.webp` } : {};
      return [{ id, name: r.name, spec: r.spec, grade: r.grade, toNext: m.toNext, face: r.face, traits: this.shownTraits(m), free: callable && !called ? 1 : 0, risk: callable && called && !guest.guest ? AGAIN_RISK[r.grade] : null, down, abilities, ...guest }];
    });
    const contacts = (setup.contacts ?? []).map((c) => ({ ...c, used: calls.some((x) => x.card === `contact:${c.id}`) || setup.fencedBy === `contact:${c.id}` }));
    return { approach: setup.approach, people, favour: setup.favour ? (calls.some((c) => c.card === 'favour') ? 'used' : 'ready') : null, contacts, ...(setup.deck ? { pockets: this.pocketsView(run, setup.deck) } : {}) };
  }

  /** POCKETS as the deck (programs spec §2.1): the deck carried at GO IN, its slots, what's loaded, the catalog. */
  private pocketsView(run: QuestRun, at: NonNullable<Setup['deck']>): NonNullable<HandView['pockets']> {
    const deck = (this.deps.quests?.decks?.() ?? []).find((d) => d.id === at.id) ?? null;
    const catalog = this.deps.quests?.programs?.() ?? [];
    const loaded = (run.programs ?? []).flatMap((l) => catalog.filter((p) => p.id === l.id).map((p) => ({ id: p.id, name: p.name, stat: p.stat, kind: p.kind, burned: l.burned === true })));
    return {
      deck: at.id ? { name: deck?.name ?? at.id, quality: at.quality, skin: deck?.skin ?? 'green' } : null,
      slots: at.slots,
      dead: run.deckDead === true,
      loaded,
      catalog: catalog.map((p) => ({ id: p.id, name: p.name, stat: p.stat, kind: p.kind, line: p.line })),
    };
  }

  /** Each program's pool on a checked choice alone (programs spec §2.1), or why it can't run here; through poolOf as the roll. */
  private programPreviews(c: Choice, ctx: CondCtx, beat: Beat, job: { q: QuestEntry; run: QuestRun; player: string }, pool: Pool, call?: CallEffect, press?: CallEffect): Record<string, ProgramPreview> {
    const who = { ...this.poolWho(c, ctx, beat, job.q, job.run, job.player), ...(call ? { call } : {}), ...(press ? { press } : {}) };
    const swap = call?.stat ?? press?.stat;
    const check = swap ? swappedCheck(c.check!, swap) : c.check!;
    return Object.fromEntries(
      (this.deps.quests?.programs?.() ?? []).map((p): [string, ProgramPreview] => {
        const why = programJudge(p, (ps) => (ps.length ? poolOf(c.check!, { ...who, programs: ps }) : pool), [], check, ctx.deck ?? null);
        if (why) return [p.id, { why }];
        const after = poolOf(c.check!, { ...who, programs: [p] });
        return [p.id, { position: after.position, ...(after.effect ? { effect: after.effect } : {}), alarm: after.programs?.[0]?.alarm ?? 0, ...(after.tier ? { tier: after.tier } : {}) }];
      }),
    );
  }

  /** Each playable card's pool on a checked choice (§2), through the same poolOf as the roll. */
  private playsFor(c: Choice, ctx: CondCtx, beat: Beat, job: { q: QuestEntry; run: QuestRun; player: string }): Record<string, Play> {
    const out: Record<string, Play> = {};
    const setup = job.run.setup;
    if (!setup || !c.check) return out;
    const stat = c.check.stat;
    const getaway = job.run.getaway === true;
    const position = this.poolFor(c, ctx, beat, job).position;
    const abilityCards = setup.people.flatMap((rid) => (setup.abilities?.[rid] ?? []).map((a) => abilityCardId(rid, a)));
    const play = (call: CallEffect, press?: CallEffect): Omit<Play, 'presses'> | null => {
      const moved = [call, press].find((e) => e?.step);
      if (moved && stepRefusal(this.poolFor(c, ctx, beat, job, stepless(call), press && stepless(press)), moved.step!)) return null;
      const pool = this.poolFor(c, ctx, beat, job, call, press);
      return { ...(pool.stat !== c.check!.stat.toUpperCase() ? { stat: pool.stat } : {}), dice: pool.dice, position: pool.position, ...(pool.effect ? { effect: pool.effect, effectRaw: pool.effectRaw } : {}), ...(pool.tier ? { tier: pool.tier } : {}), ...(pool.path ? { path: pool.path } : {}), ...(setup.deck ? { previews: this.programPreviews(c, ctx, beat, job, pool, call, press) } : {}) };
    };
    // Each ability's card, read once: handCard folds the kit, and this runs on every state.
    const hands = new Map(abilityCards.map((pc) => [pc, this.handCard(job.run, pc)]));
    const sides = [...hands].flatMap(([pc, h]) => (typeof h === 'string' ? [] : [[pc, h] as const]));
    for (const card of [...setup.people, ...abilityCards, ...(setup.favour ? ['favour'] : []), ...(setup.contacts ?? []).map((c) => `contact:${c.id}`)]) {
      const hand = hands.get(card) ?? this.handCard(job.run, card);
      if (typeof hand === 'string') continue;
      const effect = this.cardEffect(hand.member, stat, position, hand.contact, hand.ability, getaway, c.check!.red);
      const alone = effect && play(effect);
      if (!effect || !alone) continue;
      // Each press that could go beside this call (ability pass spec §1): from another recruit, on the roll as it stands.
      const presses: Record<string, Omit<Play, 'presses'>> = {};
      for (const [pc, side] of hand.ability ? [] : sides) {
        if (side.member?.recruit.id === hand.member?.recruit.id) continue;
        const pe = this.cardEffect(side.member, stat, alone.position, undefined, side.ability, getaway, c.check!.red);
        // Beside One More Thing the call is judged on the stat it moves the roll to.
        const beside = pe?.stat ? this.cardEffect(hand.member, pe.stat, position, hand.contact, hand.ability, getaway) : effect;
        const both = pe && beside && play(beside, pe);
        if (both) presses[pc] = both;
      }
      out[card] = { ...alone, ...(Object.keys(presses).length ? { presses } : {}) };
    }
    return out;
  }

  /** A choice's pool inputs: stats, deck, contact, ALARM, ctx, temper and crew prep, as the card shows them. */
  private poolWho(c: Choice, ctx: CondCtx, beat?: Beat, q?: QuestEntry, run?: QuestRun, player?: string) {
    const tf = beat?.stranger?.temper;
    const tv = tf ? ctx.flags[tf] : undefined;
    const extra = q && run ? this.crewExtras(q, run, c, player) : [];
    const temper: 'easy' | 'hard' | null = tv === 'easy' || tv === 'hard' ? tv : null;
    // Effect (effect and NERVE spec §1): the choice's tag and the district's heat; none where the roll fills no TAKE.
    const takes = !q || !run || (isJob(q) && scoring(q, run) && run.getaway !== true && run.push?.state !== 'playing');
    const tag = effectTagOf(c);
    return { stats: ctx.stats ?? DEFAULT_STATS, deck: ctx.deck ?? null, with: ctx.with, alarm: ctx.alarm ?? 0, ctx, temper, ...(extra.length ? { extra } : {}), ...(run?.setup ? { approach: run.setup.approach } : {}), ...(q && isJob(q) ? { tier: q.tier } : {}), ...(tag ? { tag } : {}), ...(ctx.heat ? { heat: ctx.heat } : {}), ...(run?.next ? { next: run.next } : {}), takes };
  }

  /** A roll lands (spec §1): its pass or fail outcome, its cost as ALARM and heat, its TAKE (jobStep). */
  private landRoll(o: { q: QuestEntry; beat: Beat; status: QuestStatus; ctx: CondCtx; choice: Choice; line: string; t: ReturnType<typeof tagsOf>; roll: DiceRoll; cost: { alarm: number; heat: number }; events: KitEvent[]; died: string | null; heat: (n: number) => KitEvent; calls: Call[]; settled?: SettledCost[] }): Promise<Result> {
    const { q, choice, roll } = o;
    // A miss ends Stand Firm, after its own costs (tier 3 beat play spec §2).
    if (roll.kind === 'miss' && o.status.run.firm) {
      const { firm: _firm, ...run } = o.status.run;
      o = { ...o, status: { ...o.status, run } };
    }
    // Each settled cost that was taken lands (roll lifecycle spec §1.1); resisted, armoured or cancelled ones don't.
    const taken = (c: CostId): number => (o.settled ?? []).filter((x) => x.cost === c && x.how === 'taken').length;
    const played = q.outcomes.get(roll.pass ? choice.to : choice.fail!);
    if (!played) return Promise.resolve({ ok: false, error: 'that choice has passed' });
    // Talk Them Down (tier 3 beat play spec §2): the blow-up doesn't land, and the face stays behind for it. Blown
    // outcomes pay nothing, so it pays the job's pay here and TAKE scales it; a pressed job's pay is already settled.
    const outcome: Outcome = roll.softened ? { ...played, text: TALKED_DOWN, effects: { ...played.effects, take: 'part', blown: undefined, ...(o.status.run.push ? {} : { payKind: 'full' as const }) } } : played;
    const said = o.calls.map((c) => this.callTexts(c, o.q, o.status.run));
    // The costs it took, in the lines they showed (roll lifecycle spec §1.5): the job column reads them.
    const landed = (roll.costs ?? []).filter((c) => c.how === 'taken').map((c) => `*${c.line}*`);
    const lost = taken('take') + (roll.missTake && roll.kind === 'miss' ? 1 : 0) + (roll.lessTake ?? 0);
    const texts = [o.line, ...said.flatMap((x) => x.call), rollLine(roll), ...landed, ...(o.died ? [`*The ${o.died} dies.*`] : []), ...said.flatMap((x) => x.loss)];
    return this.jobStep({
      q,
      status: o.status,
      ctx: o.ctx,
      outcome,
      texts,
      pick: { choice: choice.id, line: o.line, roll },
      record: { beat: o.beat.id, choice: choice.id, roll },
      minutes: o.t.minutes,
      kitBefore: [...(o.status.run.kit ?? []), ...o.events, ...(taken('heat') ? [o.heat(taken('heat'))] : [])],
      alarm: alarmPlus(o.status.run.alarm, o.t.alarm + o.cost.alarm + taken('alarm')),
      flags: o.t.flags,
      // A saved miss fills as the 4–5 it became (crew abilities spec §2).
      // At the effect it was rolled with (effect and NERVE spec §1), whatever heat or ALARM did since.
      take: roll.saved ? kindResult('cost', roll.position, roll.effect).take : resultOf(roll.faces, roll.keep, roll.position, roll.effect).take,
      // TAKE −1 comes off after the roll's own fill is capped (review I2), and a greed press's on a miss (ability pass spec §2).
      ...(lost ? { takeLoss: lost } : {}),
      calls: o.calls,
      // NEXT ROLL costs and a setup's bonus wait for the next checked pick (§1.1).
      ...(taken('worse') || taken('small') || roll.setup ? { next: { ...(taken('worse') ? { worse: true as const } : {}), ...(taken('small') ? { small: true as const } : {}), ...roll.setup } } : {}),
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
      take: granted ? crackTake(q, ctx.deck ?? null) : 0,
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
    /** TAKE this pick fills (the table spec §2). */
    take?: number;
    /** The cards played on this pick's roll (the hand spec §2), and AFTER A ROLL abilities on it. */
    calls?: Call[];
    /** NEXT ROLL costs this pick leaves for the next one (roll lifecycle spec §1.1); every pick uses up the last ones. */
    next?: QuestRun['next'];
    /** TAKE −1 costs taken on this pick: off the fill after it's capped (§1.1). */
    takeLoss?: number;
  }): Promise<Result> {
    const { q, status } = o;
    const run0 = status.run;
    const at = this.jobClock(q, o.minutes);
    const step = this.followOutcome(q, o.outcome, { ...o.ctx, flags: { ...o.ctx.flags, ...o.flags }, alarm: o.alarm }, at, o.status.run);
    // A job's heat is the ALARM it leaves with (tier template spec §2): an outcome's own `heat:` is a quest's.
    const effect = effectEvent(isJob(q) ? { ...o.outcome.effects, heat: undefined } : o.outcome.effects, at, { pay: run0.pay ?? null, district: this.districtOf(q) });
    // The written pay (not a push's bonus): TAKE scales it at the job's end.
    const fx = o.outcome.effects;
    const paid = fx.payKind === 'full' ? (run0.pay ?? 0) : fx.payKind === 'half' ? Math.floor((run0.pay ?? 0) / 2) : (fx.pay ?? 0);
    const drawn = this.drawFace(step.beat?.stranger ?? null, run0.faces ?? {});
    const faces = drawn.faces ?? run0.faces;
    let run: QuestRun = {
      ...run0,
      ...step.run,
      picks: [...run0.picks, o.record],
      flags: o.flags,
      alarm: o.alarm,
      ...withTake(run0, o.outcome),
      // TAKE (the table spec §2): the job's own picks fill it; push beats pay their pot instead.
      // Every job pick writes it, so only runs from before the table lack it (takeOf counts their picks).
      ...(isJob(o.q) && scoring(o.q, run0) && run0.push?.state !== 'playing' && !run0.getaway ? { takeFill: Math.max(0, Math.min(jobTakeSize(o.q), takeOf(run0, o.q) + (o.take ?? 0)) - (o.takeLoss ?? 0)) } : {}),
      ...(paid ? { payCeiling: ceilingOf(run0) + paid } : {}),
      ...(o.calls?.length ? { calls: [...(run0.calls ?? []), ...o.calls] } : {}),
      kit: [...o.kitBefore, ...(effect ? [effect] : [])],
      next: o.next,
      barred: undefined,
      pending: null,
      at: Date.now(),
      ...(faces ? { faces } : {}),
    };
    const texts = [...o.texts, ...step.texts];
    const cost = stepMinutes(q) + o.minutes;
    const stayed = this.heldAlarm(q, run0, run);
    if (stayed) {
      run = stayed;
      texts.push(HELD_ALARM);
    }
    // ALARM full (the table spec §2): after this outcome's text, GET OUT: the file's # getaway, else the stock card.
    if ((run.alarm ?? 0) >= ALARM_MAX && (run0.alarm ?? 0) < ALARM_MAX && !run0.getaway) {
      const qg = withGetaway(q);
      const gctx = { ...o.ctx, flags: { ...o.ctx.flags, ...o.flags }, alarm: run.alarm };
      const chosen = chooseVariant(qg, 'getaway', gctx)!;
      const row = this.questRow(qg, [...o.texts, o.outcome.text, beatText(chosen.beat, gctx)], { beat: chosen.beat }, o.pick, drawn.face, { run: status.id });
      // A push beat's own outcome is kept as it stands (final review I3): a lost push stays lost whatever the getaway does.
      const pushed = run0.push?.state === 'playing' ? { push: { ...run0.push, pot: run0.push.pot + (o.outcome.effects.lost ? 0 : (o.outcome.effects.bonus ?? 0)), log: [...run0.push.log, { beat: o.record.beat, choice: o.record.choice, result: o.outcome.effects.lost ? ('lost' as const) : ('won' as const), sol: o.outcome.effects.lost ? 0 : (o.outcome.effects.bonus ?? 0) }] } } : {};
      return this.questTurn(row, status.id, { ...run, ...pushed, beat: 'getaway', variant: chosen.variant, wait: null, done: false, getaway: true }, cost, false, 0);
    }
    if (!step.run.done) {
      // A contract's pick back to its wait closes the table with nothing after it, so she answers it (playtest).
      const backToWait = Boolean(run.contract && run.wait);
      const played = await this.questTurn(this.questRow(q, texts, step, o.pick, drawn.face, { run: status.id }), status.id, run, cost, backToWait, 0);
      // Her turn's end doesn't play what's due from here: the next report, or the night.
      if (backToWait) await this.playDueQuest(this.pid);
      return played;
    }
    // Pressing on (spec §1): a push beat's outcome wins into the pot or loses it; a job's take brings up the card.
    let done = run;
    const p0 = run0.push;
    if (p0?.state === 'playing' && run0.getaway) {
      // A getaway from a push beat (the table spec §2): made it walks with the pot, unless the push that filled ALARM
      // was itself lost (final review I3); missed it is a lost push, blown.
      const made = o.outcome.effects.blown !== true && o.outcome.effects.take !== 'none';
      const lostBefore = p0.log.at(-1)?.result === 'lost';
      // The lost push drops the job's take a tier, and the getaway caps it at part: part either way, unless it was none.
      const take = run0.take === 'none' ? 'none' : 'part';
      done = made && !lostBefore
        ? { ...run, push: { ...p0, state: 'won' } }
        : made
          ? { ...run, kit: [...(run.kit ?? []), ...lossEvents(run, p0, at, { blown: take === 'none' })], take, push: { ...p0, pot: 0, state: 'lost' } }
          : { ...run, kit: [...(run.kit ?? []), ...lossEvents(run, p0, at, { blown: true })], take: 'none', blown: true, push: { ...p0, pot: 0, state: 'lost' } };
    } else if (p0?.state === 'playing') {
      const lost = o.outcome.effects.lost === true;
      const log = [...p0.log, { beat: o.record.beat, choice: o.record.choice, result: lost ? ('lost' as const) : ('won' as const), sol: o.outcome.effects.bonus ?? 0 }];
      if (lost) {
        const take = dropTake(run.take ?? 'full');
        // A take gone to none is blown and pays nothing (spec §1); a full ALARM went to GET OUT before this (the table spec §2).
        const loss = lossEvents(run, p0, at, { blown: take === 'none' });
        done = { ...run, kit: [...(run.kit ?? []), ...loss], take, push: { ...p0, pot: 0, state: 'lost', log } };
      } else {
        const p = { ...p0, pot: p0.pot + (o.outcome.effects.bonus ?? 0), log };
        if (canOffer(q, run, p.stage, this.nerveAfter(run0, run))) return this.pushOffer(q, status.id, { ...run, push: { ...p, state: 'offer' } }, texts, o.pick, cost);
        done = { ...run, push: { ...p, state: 'won' } };
      }
    } else if (!p0) {
      // The job's own end (the table spec §2): TAKE scales the pay, and short of full a full take is part; a getaway caps it at part.
      // A brought FENCE plays itself (the hand spec §2): TAKE +1 before it settles, not on a GET OUT.
      // Only when it adds to TAKE: the debrief's FENCED IT line reads `setup.fenced`.
      // A contract that ends before its night took nothing (final review I1).
      const took = scoring(q, run) ? run : { ...run, takeFill: 0 };
      const fill = takeOf(took, q);
      // A blown end or one that takes nothing pays nothing, so there's nothing to fence (review I1).
      const fencer = !run0.getaway && run.blown !== true && run.take !== 'none' && fill < jobTakeSize(q) ? this.fenceOn(run) : null;
      const fenced0 = fencer && run.setup ? { ...took, takeFill: fill + 1, setup: { ...run.setup, fenced: true as const, fencedBy: fencer } } : took;
      // AT THE END: TAKE +1 abilities (crew abilities spec §2) on the same terms as a FENCE, each while TAKE isn't full,
      // and the abilities that cool it (ability pass spec §2) while there's heat to cool.
      const fenced = !run0.getaway && run.blown !== true && run.take !== 'none' ? this.endDeal(this.endCool(this.endTake(fenced0, jobTakeSize(q)), o.ctx.heat ?? 0), q) : fenced0;
      const settled = settleTake(fenced, q, at, run0.getaway ? (run.pay ?? 0) : 0);
      const take = run0.getaway && settled.take === 'full' ? 'part' : settled.take;
      done = { ...fenced, kit: [...(run.kit ?? []), ...settled.events], take };
      if (!run0.getaway && canOffer(q, done, 0, this.nerveAfter(run0, done))) return this.pushOffer(q, status.id, { ...done, push: { stage: 0, pot: 0, from: (done.kit ?? []).length, outcome: o.outcome.id, state: 'offer', log: [] } }, texts, o.pick, cost);
    }
    const end = { outcome: o.outcome.id, text: texts.filter((t) => t !== '').join('\n\n'), pick: o.pick, minutes: cost };
    const held = this.deps.quests?.kit?.(this.pid).cover;
    // A trust job's loss can't be covered (Intake board spec §2): no cover cards, nothing spent.
    if (this.tierOf(done) === 'blown' && !q.trust && held && (held.burner > 0 || held['fall-guy'] > 0)) {
      // Parked before its row (plan ruling 5): the run stays at its beat, with this pick's events, until a cover card.
      this.deps.db.setMeta(questKey(this.pair(), status.id), JSON.stringify({ ...done, beat: run0.beat, variant: run0.variant, wait: run0.wait, done: false, pendingCover: end }));
      this.emitQuestState();
      return OK;
    }
    return this.finishJob(q, status.id, done, end, null);
  }

  /**
   * A call's lines in the row (the hand spec §6): `⟦CALL⟧ Dez (runner) takes the door.` or `⟦CALL⟧ a friend in Karasu.`,
   * and a loss `⟦LOST⟧ Koji got hurt.`; her history reads them as `[call: …]` and `[Koji got hurt]`.
   */
  private callTexts(call: Call | undefined, q: QuestEntry, run: QuestRun): { call: string[]; loss: string[] } {
    if (!call) return { call: [], loss: [] };
    if (call.card === 'favour') return { call: [`⟦CALL⟧ a friend in ${this.districtWords(this.districtOf(q))}.`], loss: [] };
    const cid = contactId(call.card);
    if (cid !== null) {
      const c = run.setup?.contacts?.find((x) => x.id === cid);
      return c ? { call: [`⟦CALL⟧ ${c.name.split(' ')[0]} (${c.spec}) ${CALL_VERB[c.spec] ?? 'steps in'}.`], loss: [] } : { call: [], loss: [] };
    }
    const r = this.crewOn(run.setup).find((m) => m.recruit.id === call.card)?.recruit;
    if (!r) return { call: [], loss: [] };
    const first = r.name.split(' ')[0];
    const lost = call.loss ? [`⟦LOST⟧ ${first} got ${call.loss}.`] : [];
    // An ability (crew abilities spec §2): `⟦CALL⟧ Dez — Log Wipe.`
    const ability = call.ability ? (this.deps.quests?.crewAbilities?.() ?? []).find((a) => a.id === call.ability) : undefined;
    if (call.ability) return { call: [`⟦CALL⟧ ${first} — ${ability?.label ?? call.ability}.`], loss: lost };
    return { call: [`⟦CALL⟧ ${first} (${r.spec}) ${CALL_VERB[r.spec] ?? 'steps in'}.`], loss: lost };
  }

  /** Who came on the job and who didn't walk away clean (the hand spec §6), by first name, for her closing summary. */
  private summaryCrew(run: QuestRun, key: string): { came: string[]; lost: string[] } | undefined {
    const contacts = this.contactsPlayed(run).map((c) => c.name.split(' ')[0]);
    if (!run.setup?.people.length && !contacts.length) return undefined;
    if (!run.setup?.people.length) return { came: contacts, lost: [] };
    const members = this.deps.quests?.crewState?.()?.members ?? [];
    const traits = this.deps.quests?.crewTraits?.() ?? [];
    const first = (id: string) => withGuest(members, run.setup).find((m) => m.recruit.id === id)?.recruit.name.split(' ')[0] ?? null;
    const recruits = members.map((m) => ({ id: m.recruit.id, spec: m.recruit.spec, traits: m.recruit.traits.flatMap((t) => traits.filter((x) => x.id === t)), goneUsed: m.goneUsed }));
    const shares = jobShares({ setup: run.setup, calls: run.calls ?? [], tier: this.tierOf(run), seed: key, recruits, getOut: run.getaway === true });
    const lostIds = [...(run.calls ?? []).filter((c) => c.loss).map((c) => c.card), ...shares.filter((x) => x.fate !== null).map((x) => x.rid)];
    const names = (ids: string[]) => [...new Set(ids)].flatMap((id) => first(id) ?? []);
    return { came: [...names(run.setup.people), ...contacts], lost: names(lostIds) };
  }

  /** A district as she'd say it: its map name, else its id title-cased. */
  private districtWords(id: string | null): string {
    if (!id) return 'the district';
    return this.deps.quests?.districtName?.(id) ?? id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /** AT THE END abilities of `kind` in the GO IN loadout of each brought recruit still standing, as `<rid>/<ability>`. */
  private endAbilities(run: QuestRun, kind: 'take' | 'heat' | 'end-take' | 'end-cool' | 'sell-part' | 'pay-off' | 'hold-alarm'): string[] {
    const setup = run.setup;
    if (!setup?.abilities) return [];
    const book = this.deps.quests?.crewAbilities?.() ?? [];
    const calls = run.calls ?? [];
    return setup.people.flatMap((rid) => (calls.some((c) => c.card === rid && c.loss) ? [] : (setup.abilities?.[rid] ?? []).filter((aid) => book.some((a) => a.id === aid && a.job.kind === kind)).map((aid) => abilityCardId(rid, aid))));
  }

  /** TAKE +1 for each AT THE END take ability, while TAKE isn't full; each that adds goes in `setup.ended`. `end-take` also leaves HEAT +1 (ability pass spec §2). */
  private endTake(run: QuestRun, size: number): QuestRun {
    let fill = run.takeFill ?? 0;
    const ended: string[] = [];
    let heat = 0;
    for (const [kind, id] of [...this.endAbilities(run, 'take').map((id) => ['take', id]), ...this.endAbilities(run, 'end-take').map((id) => ['end-take', id])])
      if (fill < size) {
        fill++;
        ended.push(id);
        if (kind === 'end-take') heat++;
      }
    return ended.length && run.setup ? { ...run, takeFill: fill, setup: { ...run.setup, ended: [...(run.setup.ended ?? []), ...ended], ...(heat ? { endHeat: (run.setup.endHeat ?? 0) + heat } : {}) } } : run;
  }

  /** HEAT −2 and pay −20 % for each `end-cool` ability (ability pass spec §2), while the job leaves heat or the district holds some. */
  private endCool(run: QuestRun, districtHeat: number): QuestRun {
    const ids = this.endAbilities(run, 'end-cool');
    if (!ids.length || !run.setup || heatLeft(run, false) + districtHeat <= 0) return run;
    return { ...run, setup: { ...run.setup, ended: [...(run.setup.ended ?? []), ...ids], endHeat: (run.setup.endHeat ?? 0) - END_COOL_HEAT * ids.length, payCut: (run.setup.payCut ?? 0) + END_COOL_PAY * ids.length } };
  }

  /** The fences' last word (tier 3 beat play spec §2), after TAKE abilities: Cut a Deal on a part take, Paid Off on a full take at ALARM 2+. */
  private endDeal(run: QuestRun, q: QuestEntry): QuestRun {
    const setup = run.setup;
    if (!setup) return run;
    const fill = takeOf(run, q);
    const size = jobTakeSize(q);
    const short = fill > 0 && fill < size;
    // Only where selling it as full, less the cut, beats what TAKE would pay.
    const cut = setup.payCut ?? 0;
    const [sold] = short && 100 - cut - SELL_PART_CUT > ((100 - cut) * fill) / size ? this.endAbilities(run, 'sell-part') : [];
    if (sold) return { ...run, setup: { ...setup, ended: [...(setup.ended ?? []), sold], payFull: true, payCut: (setup.payCut ?? 0) + SELL_PART_CUT } };
    const [paid] = !short && run.take !== 'part' && (run.alarm ?? 0) >= 2 ? this.endAbilities(run, 'pay-off') : [];
    return paid ? { ...run, setup: { ...setup, ended: [...(setup.ended ?? []), paid], paidOff: true, payCut: (setup.payCut ?? 0) + PAY_OFF_CUT } } : run;
  }

  /** Clean Exit (tier 3 beat play spec §2): the pick that would fill ALARM holds it at 3 for TAKE −1, once a job; null where it can't. */
  private heldAlarm(q: QuestEntry, run0: QuestRun, run: QuestRun): QuestRun | null {
    if ((run.alarm ?? 0) < ALARM_MAX || (run0.alarm ?? 0) >= ALARM_MAX || !rollFills(q, run0) || !run.setup || run.setup.held) return null;
    const [id] = this.endAbilities(run, 'hold-alarm');
    const fill = takeOf(run, q);
    return id && fill > 0 ? { ...run, alarm: ALARM_MAX - 1, takeFill: fill - 1, setup: { ...run.setup, held: id, ended: [...(run.setup.ended ?? []), id] } } : null;
  }

  /** A FENCE brought on the run and not lost on a call. */
  private fenceOn(run: QuestRun): string | null {
    const members = this.deps.quests?.crewState?.()?.members ?? [];
    const recruit = (run.setup?.people ?? []).find((id) => members.find((m) => m.recruit.id === id)?.recruit.spec === 'fence' && !(run.calls ?? []).some((c) => c.card === id && c.loss));
    // Fences don't stack (contact cards spec §3): a recruit fences first, else a contact fence.
    const contact = run.setup?.contacts?.find((c) => c.spec === 'fence');
    return recruit ?? (contact ? `contact:${contact.id}` : null);
  }

  /** The WALK / PRESS ON card comes up (pressing on spec §1): the pick's row, silent, and the run stands on `!push`. */
  private async pushOffer(q: QuestEntry, runId: string, run: QuestRun, texts: string[], pick: { choice: string; line: string; roll?: Roll }, minutes: number): Promise<Result> {
    const row = this.questRow(q, texts, { beat: null }, pick, undefined, { run: runId });
    return this.questTurn(row, runId, { ...run, beat: PUSH_BEAT, variant: 0, wait: null, done: false }, minutes, false, 0);
  }

  /** A card on the WALK / PRESS ON card: WALK ends the job as it stands; PRESS ON plays the next push beat. A string is why not. */
  private async pushPick(q: QuestEntry, status: QuestStatus, ctx0: CondCtx, choice: string): Promise<Result | string> {
    const run0 = status.run;
    const p = run0.push;
    if (!p || p.state !== 'offer') return 'that choice has passed';
    if (choice === WALK) {
      const run: QuestRun = { ...run0, push: { ...p, state: p.stage === 0 ? 'walked' : 'won' } };
      return this.finishJob(q, status.id, run, { outcome: p.outcome, text: '', pick: { choice: WALK, line: 'Walk away.' }, minutes: 0 }, null);
    }
    const next = choice === PRESS ? nextPushBeat(q, p.stage) : null;
    if (!next) return 'that choice has passed';
    // PRESS ON costs 1 NERVE (the table spec §3).
    if ((this.deps.quests?.kit?.(this.pid).nerveLeft ?? 0) < PRESS_NERVE) return 'not enough nerve';
    const ctx = this.runCtx(q, run0, ctx0, this.pid);
    const chosen = chooseVariant(q, next, ctx);
    if (!chosen) return 'that choice has passed';
    const drawn = this.drawFace(chosen.beat.stranger, run0.faces ?? {});
    const row = this.questRow(q, [beatText(chosen.beat, ctx)], { beat: chosen.beat }, { choice: PRESS, line: 'Press on.' }, drawn.face, { run: status.id });
    const nerve: KitEvent = { at: this.deps.clockNow?.() ?? 0, nerve: -1 };
    const run: QuestRun = { ...run0, beat: chosen.beat.id, variant: chosen.variant, kit: [...(run0.kit ?? []), nerve], push: { ...p, stage: p.stage + 1, state: 'playing', had: p.had ?? this.deps.quests?.kit?.(this.pid).owned ?? [] }, at: Date.now(), ...(drawn.faces ? { faces: drawn.faces } : {}) };
    return this.questTurn(row, status.id, run, 0, false, 0);
  }

  /** NERVE left once `run` is saved: the kit as stored, plus the spends this pick adds to the run's kit. */
  private nerveAfter(run0: QuestRun, run: QuestRun): number {
    const spent = (r: QuestRun) => (r.kit ?? []).reduce((n, e) => n + (e.nerve ?? 0) + (e.edge ?? 0), 0);
    return (this.deps.quests?.kit?.(this.pid).nerveLeft ?? 0) + spent(run) - spent(run0);
  }

  /**
   * A job's end (small jobs spec §2, §5): the rep change for its tier (cover softening a blown one), the
   * cover and rep events, the finished run and its debrief. Also the preview under the cover cards (cover null).
   */
  private jobEnd(q: QuestEntry, run: QuestRun, end: NonNullable<QuestRun['pendingCover']>, cover: CoverId | null, player: string, runId: string): { done: QuestRun; debrief: Debrief } {
    const tier = this.tierOf(run);
    const district = this.districtOf(q) ?? 'unknown';
    const at = (this.deps.clockNow?.() ?? 0) + end.minutes;
    // A trust stake (Intake board spec §2) moves her standing instead of rep, and cover never softens it.
    const trust = this.trustDelta(q, tier);
    // A contract's rep, else the small job's for its tier.
    // Burning a friend (the hand spec §3): a BLOWN end after the favour was called costs rep on top.
    const burn = tier === 'blown' && (run.calls ?? []).some((c) => c.card === 'favour') ? FAVOUR_BURN : 0;
    const delta = (trust !== null ? 0 : coveredLoss(q.kind === 'contract' ? contractRep(tier) : repDelta(q.tier, tier), tier === 'blown' ? cover : null)) + burn;
    const extra: KitEvent[] = [];
    if (cover) extra.push({ at, cover: { id: cover, delta: -1 }, ...(cover === 'fall-guy' && fallGuyFee(run.pay) ? { sol: -fallGuyFee(run.pay) } : {}) });
    if (delta !== 0) extra.push({ at, rep: { district, delta } });
    const before = this.deps.quests?.kit?.(player).rep[district] ?? 0;
    // Her cut (Tier 2 spec §2): on every small job with her while the deal is in force, a share of what the job paid
    // (after TAKE); nothing on a job that paid nothing, so she's never unpaid. Her own clients' jobs pay her none.
    const deal = this.arrangementNow(player);
    const qs = this.deps.quests;
    const jobSol = (run.kit ?? []).reduce((n, e) => n + (e.sol ?? 0), 0);
    const cut = this.cutDue(player, q, jobSol);
    const retainer: KitEvent[] = cut > 0 ? [{ at, sol: -cut }] : [];
    // The ALARM you leave with becomes HEAT (tier template spec §2), once, here where every job ends.
    const left = heatLeft(run, tier === 'blown');
    if (left) extra.push({ at, heat: left, district });
    // AT THE END: heat −1 abilities (crew abilities spec §2) on a MESSY end, in the job's district.
    const cooled = tier === 'messy' ? this.endAbilities(run, 'heat') : [];
    for (let i = 0; i < cooled.length; i++) extra.push({ at, heat: -1, district });
    if (cooled.length && run.setup) run = { ...run, setup: { ...run.setup, ended: [...(run.setup.ended ?? []), ...cooled] } };
    // The crew brought are on the job until now (the hand spec §1).
    const done: QuestRun = { ...run, beat: null, variant: 0, wait: null, done: true, endDay: this.storyDay(), pending: null, pendingCover: null, kit: [...(run.kit ?? []), ...extra, ...retainer], at: Date.now(), ...(run.setup ? { setup: { ...run.setup, endAt: at } } : {}) };
    const preview = trust !== null && trust !== 0 ? (this.deps.trust?.preview(player, trust) ?? null) : null;
    const trustLine = trust === null ? undefined : preview && preview.before !== preview.after ? { name: preview.name, before: preview.before, after: preview.after } : null;
    // Her closing line hears any move, word change or not (a clamped one isn't a move).
    const moved = preview && preview.moved !== 0 ? (preview.moved > 0 ? 'up' : 'down') : undefined;
    // The debrief's sol is the job's own; the retainer has its own line.
    const deckAt = run.setup?.deck?.id ? ((this.deps.quests?.decks?.() ?? []).find((d) => d.id === run.setup!.deck!.id) ?? null) : null;
    // The district's heat once this job lands: what's there now, what the end adds, what the crew's traits add.
    const crewHeat = this.crewHeat(run, tier, questKey(this.pair(), runId));
    const heatNow = this.deps.quests?.kit?.(player).heat?.[district] ?? 0;
    const heatAfter = Math.min(HEAT_MAX, Math.max(0, heatNow + extra.reduce((n, e) => n + (e.heat ?? 0), 0) + crewHeat));
    const debrief = buildDebrief({ q, run: { ...done, kit: [...(run.kit ?? []), ...extra] }, tier, district, before, delta, cover, programs: this.deps.quests?.programs?.() ?? [], deck: deckAt, heat: { after: heatAfter, cooled: cooled.length, crew: crewHeat }, ...(trustLine !== undefined ? { trust: trustLine } : {}), ...(moved ? { trustMoved: moved } : {}) });
    if (cut > 0) debrief.cut = { name: qs!.contactName(qs!.contact), pct: deal!.a.cut, amount: cut };
    if (q.drops && tier !== 'blown') debrief.loot = { label: q.drops.toUpperCase(), ...((qs?.crewState?.()?.stash?.length ?? 0) >= STASH_MAX ? { lost: true as const } : {}) };
    const crew = this.debriefCrew(run, questKey(this.pair(), runId));
    if (crew.length) {
      debrief.crew = crew;
      debrief.people = this.debriefPeople(run);
    }
    // gives: recruit (crew spec §5) on the ending outcome: a free card at the job's place until the next 06:00.
    const recruit = q.outcomes.get(end.outcome)?.effects.recruit;
    if (recruit) {
      done.recruit = recruit;
      const r = this.drawHire(q, runId, recruit);
      // On a full roster HIRE will say no: the line says so now.
      const view = qs?.crewView?.() ?? null;
      const full = view !== null && view.used >= view.slots;
      const place = (qs?.placeName(q.starts) ?? q.starts).toUpperCase();
      if (r) debrief.recruit = `RECRUIT · ${r.name.toUpperCase()} · ${full ? `AT ${place} UNTIL 06:00 · NO FREE SLOT` : `FREE AT ${place} UNTIL 06:00`}`;
    }
    // Outfits as rewards: what the ending opens, under the recruit's line.
    const outfit = q.outcomes.get(end.outcome)?.effects.outfit;
    if (outfit) debrief.outfit = this.outfitLine(outfit);
    return { done, debrief };
  }

  /** `OUTFIT · HICKS · TIE`: the debrief's line for an outfit an ending gives. */
  private outfitLine(o: { who: string; name: string }): string {
    return `OUTFIT · ${(this.deps.quests?.contactName(o.who) ?? o.who).toUpperCase()} · ${o.name.toUpperCase()}`;
  }

  /** Who a job's `gives: recruit` draws (crew spec §5), the one its card will show; null with no draw to hand. */
  private drawHire(q: QuestEntry, runId: string, gift: JobHire): Recruit | null {
    return this.deps.quests?.jobRecruit?.({ ...gift, runKey: questKey(this.pair(), runId), title: q.title, place: q.starts, district: this.districtOf(q) ?? 'unknown' }) ?? null;
  }

  /** A row's text with `{hire}` as the name on the card its ending leaves. */
  private hireNamed(q: QuestEntry, text: string, runId: string | undefined): string {
    if (!text.includes('{hire}')) return text;
    const gift = [...q.outcomes.values()].find((o) => o.effects.recruit && text.includes(o.text))?.effects.recruit;
    return fillHire(text, gift && runId ? (this.drawHire(q, runId, gift)?.name ?? null) : null);
  }

  /** The heat crew traits add on a messy job, as the crew fold will land it. Hidden traits count; the debrief names no one. */
  private crewHeat(run: QuestRun, tier: Tier, key: string): number {
    if (!run.setup || tier !== 'messy') return 0;
    const members = this.deps.quests?.crewState?.()?.members ?? [];
    const traits = this.deps.quests?.crewTraits?.() ?? [];
    const recruits = members.map((m) => ({ id: m.recruit.id, spec: m.recruit.spec, traits: m.recruit.traits.flatMap((t) => traits.filter((x) => x.id === t)), goneUsed: m.goneUsed }));
    return jobShares({ setup: run.setup, calls: run.calls ?? [], tier, seed: key, recruits, getOut: run.getaway === true })
      .filter((s) => s.kind === 'messy')
      .flatMap((s) => recruits.find((r) => r.id === s.rid)?.traits ?? [])
      .reduce((n, t) => n + (t.effect.kind === 'heat-on-messy' ? t.effect.n : 0), 0);
  }

  /** The debrief's crew lines (the hand spec §4): drawn as the crew fold draws them, from the run's key. */
  private debriefCrew(run: QuestRun, key: string): string[] {
    if (!run.setup) return [];
    const traits = this.deps.quests?.crewTraits?.() ?? [];
    const members = this.deps.quests?.crewState?.()?.members ?? [];
    const recruits = members.map((m) => ({ ...m.recruit, toNext: m.toNext, traits: m.recruit.traits.flatMap((id) => traits.filter((t) => t.id === id)), goneUsed: m.goneUsed }));
    // A contact fence's TAKE +1 isn't a recruit's (contact cards spec §3): crewLines credits a recruit fence only.
    const recruitSetup = run.setup.fencedBy && contactId(run.setup.fencedBy) !== null ? { ...run.setup, fenced: undefined } : run.setup;
    const abilityLabels = Object.fromEntries((this.deps.quests?.crewAbilities?.() ?? []).map((a) => [a.id, a.label]));
    return [...crewLines({ setup: recruitSetup, calls: run.calls ?? [], tier: this.tierOf(run), key, getOut: run.getaway === true, recruits, abilityLabels }), ...this.contactLines(run)];
  }

  /** Who the crew lines are about, for their cards at the table: the recruits brought and the contacts who played. */
  private debriefPeople(run: QuestRun): NonNullable<Debrief['people']> {
    const first = (name: string) => name.split(' ')[0].toUpperCase();
    const brought = (this.deps.quests?.crewState?.()?.members ?? []).filter((m) => run.setup?.people.includes(m.recruit.id));
    const guest = run.setup?.guest ? [run.setup.guest] : [];
    return [...brought.map((m) => ({ name: first(m.recruit.name), face: m.recruit.face })), ...[...this.contactsPlayed(run), ...guest].map((c) => ({ name: first(c.name), face: null, art: `/contacts/${c.id}.webp` }))];
  }

  /** The contacts who played (contact cards spec §3): `CASS FENCED IT · TAKE +1`, `HICKS TOOK THE WIRE`. */
  private contactLines(run: QuestRun): string[] {
    const line = (c: ContactCard) => `${c.name.split(' ')[0].toUpperCase()} ${CONTACT_VERB[c.spec] ?? 'HELPED'}`;
    const guest = run.setup?.guest;
    // A guest's abilities as crewLines shows a recruit's: pressed on a roll, or played at the end.
    const book = this.deps.quests?.crewAbilities?.() ?? [];
    const id = guest ? guestId(guest.id) : '';
    const used = [...(run.calls ?? []).filter((c) => c.card === id).flatMap((c) => c.ability ?? []), ...(run.setup?.ended ?? []).flatMap((e) => (e.startsWith(`${id}/`) ? [e.slice(id.length + 1)] : []))];
    const labels = [...new Set(used)].flatMap((a) => book.filter((b) => b.id === a).map((b) => ` · ${b.label.toUpperCase()}`)).join('');
    return [...this.contactsPlayed(run).map(line), ...(guest ? [`${line(guest)}${labels}`] : [])];
  }

  /** The contact cards that played on `run`: called on a check, or fenced at the end. */
  private contactsPlayed(run: QuestRun): ContactCard[] {
    const played = new Set([...(run.calls ?? []).map((c) => c.card), ...(run.setup?.fencedBy ? [run.setup.fencedBy] : [])]);
    return (run.setup?.contacts ?? []).filter((c) => played.has(`contact:${c.id}`));
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
    const { done, debrief } = this.jobEnd(q, run, end, cover, this.pid, runId);
    const row = this.questRow(q, [end.text], { beat: null }, end.pick, undefined, { run: runId, debrief });
    const trust = this.trustDelta(q, this.tierOf(run));
    const player = this.pid;
    const unpaid = debrief.retainer?.paid === false;
    // Written after the run, under the row's stamp, so rewind takes it back with the row: the trust stake, and an unpaid retainer's −1.
    const after =
      trust || unpaid
        ? () => {
            if (trust) this.deps.trust?.move(player, trust, `Night job: ${q.title}, ${this.tierOf(run)}`, row.id);
            if (unpaid) this.deps.trust?.move(player, -1, UNPAID_REASON, row.id);
          }
        : undefined;
    // A contract's fallout comes days later (tier 3 contracts spec §4): the job is over, and the run waits on.
    const wait = q.contract ? { to: 'fallout', from: this.rowClock(end.minutes) + q.contract.fallout, at: null, ready: false, by: null, else: null, next: 'It isn\'t over yet.' } : null;
    const left: QuestRun = wait && done.contract ? { ...done, done: false, beat: null, variant: 0, wait, flags: { ...done.flags, grade: this.tierOf(run) }, contract: { ...done.contract, stage: 'fallout', wait } } : done;
    return this.questTurn(row, runId, left, end.minutes, true, 0, after);
  }

  /** A pick on a contract's fallout: it plays out with no second debrief, and its `gives:` is the mark you keep (tier 3 contracts spec §4). */
  private falloutPick(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, choice: Choice, outcome: Outcome, said: string | undefined): Promise<Result> {
    const { flags, minutes } = tagsOf(choice, status.run.flags);
    const line = said?.trim() || pickLine(choice.line);
    const clock = this.rowClock(minutes);
    const step = this.followOutcome(q, outcome, { ...ctx, flags: { ...ctx.flags, ...flags } }, clock, status.run);
    const effect = effectEvent({ ...outcome.effects, heat: undefined }, clock, { pay: null, district: this.districtOf(q) });
    const pick = { choice: choice.id, line };
    // Outfits as rewards: no debrief here, so the end card shows what the ending opened.
    const outfit = outcome.effects.outfit && step.run.done ? outcome.effects.outfit : null;
    const row = this.questRow(q, [line, ...step.texts], step, pick, undefined, { run: status.id, ...(outfit ? { rewards: [this.outfitLine(outfit)] } : {}) });
    // A recruit's card goes up when the contract closes, so `gives: recruit` works here or on the night's end.
    const recruit = outcome.effects.recruit;
    const closed = step.run.done && status.run.contract ? { contract: { ...status.run.contract, closedAt: clock } } : {};
    // A fallout has no debrief to show the card, so it says so here.
    if (recruit && step.run.done) this.deps.emit({ type: 'notice', text: `// SOMEONE WANTS WORK — at ${this.deps.quests?.placeName(q.starts) ?? q.starts} until 06:00 (CREW → HIRE)`, for: 'quest' }, this.pair());
    // The kit event below opens it; the notice says where to wear it (yours on YOU, a contact's on PEOPLE).
    if (outfit) this.deps.emit({ type: 'notice', text: `// NEW ${this.outfitLine(outfit)} (${outfit.who === this.pair() ? 'YOU' : 'PEOPLE'} → WARDROBE)`, for: 'quest' }, this.pair());
    const run: QuestRun = { ...status.run, ...step.run, ...closed, ...(recruit ? { recruit } : {}), flags, picks: [...status.run.picks, { beat: beat.id, choice: choice.id }], ...(effect ? { kit: [...(status.run.kit ?? []), effect] } : {}), at: Date.now() };
    return this.questTurn(row, status.id, run, minutes, !step.run.done);
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
  private followOutcome(q: QuestEntry, outcome: Outcome, ctx: CondCtx, clock: number, from?: QuestRun): { texts: string[]; beat: Beat | null; run: Pick<QuestRun, 'beat' | 'variant' | 'wait' | 'done'> & Partial<Pick<QuestRun, 'contract' | 'guestNote' | 'settles'>> } {
    if (outcome.to === 'end') return { texts: [outcome.text], beat: null, run: { beat: null, variant: 0, wait: null, done: true, ...(outcome.effects.guestNote ? { guestNote: outcome.effects.guestNote } : {}), ...(outcome.effects.settles ? { settles: outcome.effects.settles } : {}) } };
    // A contract's offer or report hands back to the wait for its night (tier 3 contracts spec §2).
    if (outcome.to === 'back' && q.contract) {
      const wait = from?.contract?.wait ?? { to: 'night', from: clock + q.contract.night, at: null, ready: false, by: null, else: null, next: 'The night is set.' };
      return { texts: [outcome.text], beat: null, run: { beat: null, variant: 0, wait, done: false, contract: { stage: 'waiting', results: {}, reported: [], ...from?.contract, wait } } };
    }
    if (outcome.wait) return { texts: [outcome.text], beat: null, run: { beat: null, variant: 0, wait: startWait(outcome, clock), done: false } };
    const chosen = chooseVariant(q, outcome.to, ctx);
    return { texts: [outcome.text, chosen ? beatText(chosen.beat, ctx) : ''], beat: chosen?.beat ?? null, run: { beat: chosen?.beat.id ?? null, variant: chosen?.variant ?? 0, wait: null, done: chosen === null } };
  }

  /** A quest row: the shown texts, and the snapshot of where it left the quest. */
  private questRow(q: QuestEntry, texts: string[], step: { beat: Beat | null; run?: Pick<QuestRun, 'wait'> }, pick?: { choice: string; line: string; roll?: Roll }, face?: string, job: Pick<NonNullable<ChatMessage['quest']>, 'run' | 'debrief' | 'rewards'> = {}): ChatMessage {
    return {
      id: crypto.randomUUID(),
      role: 'user',
      text: this.hireNamed(q, texts.filter((t) => t !== '').join('\n\n'), job.run),
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
        ...(step.beat && beatAway(step.beat) ? { heard: heardAt(step.beat, pick?.line) } : {}),
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
    if (!here?.wait || !ctx) return null;
    // A report in from groundwork comes before the wait's end (tier 3 contracts spec §3).
    // One still out when the job ended holds until the fallout is due, so nothing comes up over the debrief.
    const held = here.status.run.contract?.stage === 'fallout' && (this.deps.clockNow?.() ?? 0) < here.wait.from;
    const report = here.q?.contract && !held ? this.reportDue(here.q, here.status, ctx) : null;
    if (report) return report;
    if (!here.q || !this.waitIntact(here.q, here.wait)) return null;
    const { q, wait, status } = here;
    const due = waitDue(wait, { now: this.deps.clockNow?.() ?? 0, placeId: qs.placeId(), ready: o.ready === true, comms: this.commsNow(this.pid)?.on === true });
    if (due === 'wait') return null;
    // A contract's wait ends at SETUP, not at a beat: nothing rolls until GO IN (tier 3 contracts spec §2).
    if (q?.contract && status.run.contract?.stage === 'fallout') {
      const rctx = this.runCtx(q, status.run, ctx, this.pid);
      const chosen = chooseVariant(q, 'fallout', rctx);
      if (!chosen) return null;
      const row = this.questRow(q, [beatText(chosen.beat, rctx)], { beat: chosen.beat }, undefined, undefined, { run: status.id });
      return this.questTurn(row, status.id, { ...status.run, beat: chosen.beat.id, variant: chosen.variant, wait: null, at: Date.now() }, 0);
    }
    if (q?.contract && status.run.contract?.stage === 'waiting') {
      const row = this.questRow(q, [`*${q.title}: it's tonight.*`], { beat: null }, undefined, undefined, { run: status.id });
      return this.questTurn(row, status.id, { ...status.run, wait: null, contract: { ...status.run.contract, stage: 'night', wait: null }, at: Date.now() }, 0, false, 0);
    }
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
    const effect = mission && outcome ? effectEvent({ ...outcome.effects, heat: undefined }, clock, { pay: status.run.pay ?? null, district: this.districtOf(q) }) : null;
    const kit = [...(status.run.kit ?? []), ...(effect ? [effect] : [])];
    const run: QuestRun = { ...status.run, ...step.run, ...(mission && outcome ? withTake(status.run, outcome) : {}), at: Date.now(), ...(drawn.faces ? { faces: drawn.faces } : {}), ...(kit.length ? { kit } : {}) };
    // A job ended by its wait settles its tier and debrief like a pick's ending; no cover is offered there.
    if (mission && step.run.done && outcome) return this.finishJob(q, status.id, run, { outcome: outcome.id, text: step.texts.filter((t) => t !== '').join('\n\n'), minutes: TURN_COST.quest }, null);
    return this.questTurn(row, status.id, run, 0, !mission || step.run.done);
  }

  /** The first landed piece of groundwork not played yet: its beat, on its band, with the recruit's line; null with none. */
  private reportDue(q: QuestEntry, status: QuestStatus, ctx: CondCtx): Promise<Result> | null {
    const arc = status.run.contract;
    const reports = this.deps.quests?.crewState?.()?.reports ?? {};
    const piece = q.contract?.pieces.find((p) => reports[`${status.id}:${p.id}`] && !arc?.reported.includes(p.id));
    if (!arc || !piece) return null;
    const { band, line } = reports[`${status.id}:${piece.id}`];
    const flags = { ...status.run.flags, [piece.id]: band };
    const rctx = { ...this.runCtx(q, status.run, ctx, this.pid), flags: { ...ctx.flags, ...flags } };
    const chosen = chooseVariant(q, `report-${piece.id}`, rctx);
    if (!chosen) return null;
    const row = this.questRow(q, [line, beatText(chosen.beat, rctx)], { beat: chosen.beat }, undefined, undefined, { run: status.id });
    // Results close at GO IN: one landing during the night plays, and changes nothing.
    const results = arc.stage === 'waiting' ? { ...arc.results, [piece.id]: band } : arc.results;
    return this.questTurn(row, status.id, { ...status.run, flags, beat: chosen.beat.id, variant: chosen.variant, wait: null, contract: { ...arc, results, reported: [...arc.reported, piece.id] }, at: Date.now() }, 0);
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
    const job = this.jobLineFor();
    const board = userMessage.mode !== 'ooc' && userMessage.mode !== 'end' ? this.boardLineFor(player.name) : null;
    const jobsWith = this.jobsWithLine();
    // In character only, like the lights line: no client pitched in an OOC aside or an END SCENE recap.
    const inCharacter = userMessage.mode !== 'ooc' && userMessage.mode !== 'end';
    const clients = inCharacter ? this.clientsLineFor() : null;
    const deal = inCharacter ? this.arrangementNow() : null;
    const arrangement = deal ? arrangementLine({ player: player.name, ...deal }) : null;
    const witnessed = inCharacter ? (this.deps.witnessedLine?.(player.id) ?? null) : null;
    const witnessedScene = inCharacter ? (this.deps.witnessedScene?.(player.id) ?? null) : null;
    const you = [player.line, kit, jobsWith, witnessed, witnessedScene, ...this.settledLines(), job, board, clients, arrangement].filter((x): x is string => Boolean(x)).join('\n') || null;
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
      // Small jobs only: a contract is its own arc, outside the deal (final review I1).
      return s.contact === qs!.contact && q !== undefined && q.kind === 'mission' && s.run.done && s.run.endDay === day && ownedBy(q) !== qs!.contact;
    }).length;
    return { a, active: arrangementActive(a, this.deps.trust?.now(player) ?? null), done };
  }

  /**
   * Tier 2's record (spec 2026-11-01 §1): the small jobs run with her and ended since the deal's story day (not contracts,
   * not her own clients'), newest first; whether she was ever left unpaid; your best rep; her trust. Null with no deal.
   */
  private chairRecord(player: string): { jobs: { tier: 'clean' | 'messy' | 'blown' }[]; unpaid: boolean; bestRep: { district: string; rep: number } | null; trustHigh: boolean; ready: boolean } | null {
    const qs = this.deps.quests;
    const a = parseArrangement(this.deps.db.getMeta(arrangementKey(player)));
    if (!qs || !a) return null;
    const book = qs.book();
    const from = storyDay(a.since);
    const jobs = qs
      .status(player)
      .filter((s) => {
        const q = book.find((e) => e.id === bookId(s.id));
        // Ended since the deal: by its end minute when it has one (a job earlier that night doesn't count), else by story day.
        const endAt = s.run.setup?.endAt;
        return s.contact === qs.contact && q !== undefined && q.kind === 'mission' && ownedBy(q) !== qs.contact && s.run.done && (endAt !== undefined ? endAt >= a.since : (s.run.endDay ?? -1) >= from);
      })
      // Newest first: by story day, then by end minute where there is one (a run with no SETUP has only its day).
      .map((s) => ({ day: s.run.endDay ?? -1, end: s.run.setup?.endAt ?? -1, tier: this.tierOf(s.run) }))
      .sort((x, y) => y.day - x.day || y.end - x.end)
      .map(({ tier }) => ({ tier }));
    const rep = Object.entries(qs.kit?.(player).rep ?? {}).sort((x, y) => y[1] - x[1])[0];
    const base = { jobs, unpaid: this.deps.trust?.unpaid?.(player) ?? false, bestRep: rep ? { district: rep[0], rep: rep[1] } : null, trustHigh: arrangementActive(a, this.deps.trust?.now(player) ?? null) };
    return { ...base, ready: chairTwoChecks({ ...base, shift: { open: true, from: '' } }).ready };
  }

  /** Tier 2's checklist for quest `q` (spec 2026-11-01 §1), with its shift from the quest's `posts:`. */
  private chairChecks(player: string, q: QuestEntry): ChairCheck[] {
    const rec = this.chairRecord(player);
    if (!rec) return [];
    const from = q.posts ? hhmmOf(q.posts[0]) : '';
    return chairTwoChecks({ ...rec, shift: { open: postsOpen(q.posts, this.deps.clockNow?.() ?? 0), from } }).checks;
  }

  /** Her cut of a job that paid `sol` (Tier 2 spec §2): a small job, not her own client's, while the deal is in force; else 0. */
  private cutDue(player: string, q: QuestEntry, sol: number): number {
    const deal = this.arrangementNow(player);
    return deal !== null && deal.active && q.kind === 'mission' && ownedBy(q) !== this.deps.quests?.contact ? cutOf(sol, deal.a.cut) : 0;
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
    if (this.questHere(this.pid)) return null;
    const own = this.openJobs(this.pid, qs.book(), ctx).filter((q) => ownedBy(q) === qs.contact);
    // A desk job (comms spec §3) says where.
    return own.length > 0 ? clientsBlock(own.map((q) => ({ title: q.title, pitch: q.commsAt ? `${q.pitch ?? ''} (at ${qs.placeName(q.commsAt)})`.trim() : q.pitch }))) : null;
  }

  /**
   * Whether a job is under way for `player` (story moods spec §2): a run not done that has ALARM up.
   * The room goes tense while it is.
   */
  jobOn(player: string): boolean {
    const qs = this.deps.quests;
    if (!qs) return false;
    // A contract's fallout is days of quiet: the job's over.
    return qs.status(player).some(({ run }) => !run.done && run.contract?.stage !== 'fallout' && (run.alarm ?? 0) >= 1);
  }

  /** Her [job] block: while a contract of this room runs. */
  private jobLineFor(): string | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    const arc = qs.status(this.pid).find((s) => s.contact === qs.contact && !s.run.done && s.run.contract);
    const con = arc && qs.book().find((e) => e.id === bookId(arc.id));
    return arc?.run.contract && con ? contractBlock({ title: con.title, stage: arc.run.contract.stage, left: (arc.run.contract.wait?.from ?? 0) - (this.deps.clockNow?.() ?? 0), found: Object.keys(arc.run.contract.results), grade: (arc.run.flags.grade as Tier | undefined) ?? null }) : null;
  }

  /** Her [board] block: while a job runs here, what its file says and who knows it. A contract has her [job] block instead. */
  private boardLineFor(player: string): string | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    const s = qs.status(this.pid).find((x) => x.contact === qs.contact && !x.run.done && !x.run.contract);
    const file = s && qs.book().find((e) => e.id === bookId(s.id));
    const q = file && this.asRun(file, s.run);
    // `kind`, not `run.contract`: a contract's run has none until its offer ends.
    return q && q.kind === 'mission' && (q.postedBy || q.brief) ? boardBlock({ title: q.title, postedBy: q.postedBy ?? null, brief: q.brief ?? null, player, knows: ownedBy(q) === qs.contact ? 'own' : q.knownBy?.includes(qs.contact) ? 'heard' : null }) : null;
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
            ? this.commsNow(this.pid)?.on
              ? COMMS_TRAVEL_INSTRUCTIONS
              : this.hungUpBy(userMessage.id)
                ? COMMS_BACK_INSTRUCTIONS
                : TRAVEL_INSTRUCTIONS
            : userMessage.mode === 'encounter'
              ? ENCOUNTER_INSTRUCTIONS
              : userMessage.mode === 'quest'
                ? `${this.missionNote(userMessage) ?? QUEST_INSTRUCTIONS}\n\n${whoIsYou((this.turnPlayer ?? this.deps.players.resolve(this.pair())).name)}`
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
      this.contactBurns(player.id);
      this.guestNotes(player.id);
    }
    const standingText = inCharacter ? (this.deps.standing?.(player.id, target.kind === 'take' ? target.reply.id : null) ?? null) : null;
    // Cache-friendly order (scribe spec §7): what rarely changes in the system message; what changes turn to turn with the turn.
    const instructions = [this.deps.identity?.(), note, sceneText, player.whosHere, othersNote].filter(Boolean).join('\n\n');
    // The quest at a beat here (in character only): the beat, the shown choices and their view (quest lines spec §3).
    const questText = inCharacter ? this.questBlockFor(player.id, userMessage.mode === 'quest' && target.kind !== 'continue') : null;
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
