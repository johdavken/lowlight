/**
 * The job game (Graft) as the relay runs it: the JOBS board, the fixer, crew orders, SETUP, the roll
 * loop (picks, costs, presses, the GM's lines), the end of a job and its debrief, and the Chair's deal
 * and comms. It reaches the chat turn only through `JobHost`: `questTurn` writes a job row and asks
 * her to answer it, and that is the one way a job goes back to chat.
 */
import { UNPAID_REASON } from './standing';
import { commsKey, parseComms, type CommsState } from '../../shared/comms';
import { arrangementActive, arrangementKey, chairTwoChecks, cutOf, parseArrangement, retainerToCut, type Arrangement, type ChairCheck } from '../../shared/arrangement';
import type { ChatMessage, ContactCard, CrewAction, CrewView, Debrief, QuestState, ServerEvent, SetupOffer, HandView, ProgramPreview } from '../../shared/types';
import { BAIL, DOC, jobWords, rescueOpen, type Recruit } from '../../shared/crew';
import { agoWords } from '../../shared/witness';
import { STASH_MAX } from '../../shared/goods';
import type { CrewEvent, CrewMember } from '../../shared/crew-fold';
import { TIMING, type Ability } from '../../shared/crew-book';
import { crewKey, parseCrewEvents } from './crew-view';
import { EMPTY_QUEST_STATE } from '../../shared/types';
import { OK, type Result } from './room-state';
import { NO_LINK_NOTICE } from './turn';
import { MISSION_OPEN, MISSION_CLOSE } from './instructions';
import { hhmmOf, START, TURN_COST } from '../../shared/clock';
import type { Player } from './players';
import { beatAt, flagsOf, beatAway, beatText, beatViews, fillHire, heardAt, isJob, ownedBy, postsOpen, mentionsFlag, chooseVariant, fillTimes, holds, openQuests, pickLine, stepMinutes, type CrackPick, questWaitBlock, startWait, waitDue, waitLine, type Outcome, type RunWait, questBlock, questGuest, questKey, shownChoices, type Beat, type CondCtx, type QuestEntry, type QuestRun, type QuestStatus } from '../../shared/quests';
import { oneLine } from './persona';
import { boardBlock, bookId, buildDebrief, clientsBlock, contractBlock, BURNER, coverCards, coveredLoss, crackLine, crackSetup, drawsFor, effectEvent, FALL_GUY, fallGuyFee, jobRunId, missionOpenBlock, missionSummary, payFor, playerKitLine, legacyRollLine, REROLL, rollLine, seedFor, STEADY, TAKE, AFTER, COST, RESIST, ARMOUR } from './mission-run';
import { COSTS, dealCosts, firstCost, picksFor, resistPrice, RESIST_CHROME_DIE, type CostId } from '../../shared/costs';
import { writtenLine } from '../../shared/gm-lines';
import { askGm, GM_HOLD_MS, gmMessages, type GmComplete } from './gm';
import { HEAT_MAX, heatIn, repDelta, repTier, TIER_NAMES, type Check, type CoverId, type KitEvent, type Tier } from '../../shared/mission';
import { hashSeed, postedJobs, storyDay } from '../../shared/board';
import { rng } from '../../shared/rng';
import { angleFlags, contractRep, guestFlags, GUEST_ABILITIES, guestId, NIGHT_ALARM_MAX, nightAlarm, WALK_AWAY_REP } from '../../shared/contract';
import { guestArt, guestTraits, withGuest } from './guest';
import { makeTerminal, playTerminal, type TerminalSetup } from '../../shared/crack';
import { buyEvent, canBuy, fixerKey, itemName, parseFixer } from '../../shared/stock';
import type { Deck } from '../../shared/gear';
import { baseProgramId, belowTier, FIREWALL, foilDrop, HOT_LOAD_NERVE, jobLeans, loadablePrograms, NO_PROGRAMS, programJudge, programOf, slotsFor, type Program } from '../../shared/programs';
import { DEFAULT_STATS } from '../../shared/stats';
import { kitLine } from '../../shared/kit-line';
import { afterEffect, CARRY_ON, rerunRoll, swappedCheck, ALARM_SHIFT, gambleDie, gambleFaces, gambleResult, stepRefusal, crackTake, statDice, ALARM_MAX, effectPushRefusal, fragileDies, kindResult, poolOf, POOL_MAX, PRESS_NERVE, PUSH_NERVE, resultOf, jobTakeSize, tierLine, tradeRefusal, type DiceResult, type Pool, type Effect, type Position, type PushMode, type Trade } from '../../shared/dice';
import { abilityCard, abilityCardId, abilityNerve, AGAIN_RISK, pressed, CONTACT_BURN, CONTACT_BURN_REASON, contactId, FAVOUR_BURN, FAVOUR_ON_HOLD, hardStartTake, type Setup, MAX_PEOPLE, SPEC_STAT, type Approach, type Call, type CallEffect } from '../../shared/hand';
import { ceilingOf, settleTake, takeOf } from './take-run';
import { blowsOnMiss } from '../../shared/job-template';
import { effectTagOf, isLegacyPending, isOldRun, parseRun as parseRunOf, withGetaway, withSpring, type Choice, type JobHire, type DealtCost, type DicePending, type DiceRoll, type Roll, type SettledCost } from '../../shared/quests';
import { canOffer, dropTake, heatLeft, lossEvents, nextPushBeat, PRESS, PUSH_BEAT, WALK, walkValue } from './push-run';
import { actedOn, afterRefusal, alarmPlus, barredOn, bestRep, carriedOn, COVERED, filed, HELD_ALARM, jobOver, nightOpen, nothingToPay, PASS_AFTER, rollFills, scoring, settledAll, stepless, tagsOf, TALKED_DOWN, withTake, type Play } from './job-rules';
import type { ChatRelayDeps } from './chat-relay';
import { tierOf, endAbilities, endTake, endCool, endDeal, heldAlarm, fenceOn, summaryCrew, crewHeatOf, debriefCrew, debriefPeople, trustDelta, outfitLine } from './job-end';
import { crewOn, districtOf, callsOf, cardEffect, callLoss, fallFor, abilityLabels, shownTraits, pocketsView, callTexts } from './job-views';

/** What the job game needs from the relay: who the call is for, whether a turn runs, and a row's way into chat. */
export interface JobHost {
  /** The pair the running call works on (set by `enter`). */
  readonly pid: string;
  /** Starts a call for `player`'s pair: an unknown id falls back to the default player. */
  enter(player: string): void;
  /** The pair to read, write and emit for; throws if another call re-entered during a turn. */
  pair(): string;
  /** A turn is running: job moves wait for her to finish. */
  readonly busy: boolean;
  /** A key is linked, so a turn can start. */
  readonly ready: boolean;
  /** The running turn's player name, if a turn has run. */
  readonly turnPlayerName: string | null;
  /** Moving on from her reply keeps the take on screen; the other takes go. */
  keepShownTake(): void;
  /** Stores a row stamped with the story clock plus `base` (its kind's cost) and `extraMinutes`. */
  insertTurnRow(row: ChatMessage, extraMinutes?: number, base?: number): void;
  /** An event for this pair's tabs only (text rows go to the deck). */
  emitPair(e: ServerEvent): void;
  /** The room follows a row's live clock move now, once (questTurn calls it when no reply follows). */
  flushLiveClock(): void;
  /** Her reply to `row`: the one way a job goes back to chat. */
  runTurn(row: ChatMessage): Promise<Result>;
  /** Re-sends her plan's card, which rides with the job state. */
  emitPlanCard(player: string): void;
}

export class JobRunner {
  constructor(
    private readonly deps: ChatRelayDeps,
    private readonly host: JobHost,
  ) {}

  /** Cost deals the GM is writing lines for, by player and roll; the value is the call that holds it. */
  private gmWriting = new Map<string, symbol>();
  /** The quest at a beat in this room for `player`, with its file's quest and beat; or why it can't go on. */
  private questHere(player: string): { status: QuestStatus; q: QuestEntry | undefined; beat: Beat | undefined; wait: RunWait | null } | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    // A run at a beat comes before a parked one: a contract's report can come up while another quest waits here.
    // A run of a job no longer in the book (a file deleted, like Found in 2026-11) is passed over: nothing could play it.
    const book = qs.book();
    const open = qs.status(player).filter((s) => s.contact === qs.contact && !s.run.done && book.some((e) => e.id === bookId(s.id)));
    const status = open.find((s) => s.run.beat !== null) ?? open.find((s) => s.run.wait !== null);
    if (!status) return null;
    const file = book.find((e) => e.id === bookId(status.id));
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
          return { id: c.id, line: c.line, ...(pool ? { pool } : {}), ...(routeAlarm ? { alarm: routeAlarm } : {}), ...trades, ...(c.check?.red ? { red: true as const } : {}), ...(blowsOnMiss(q, c) ? { blows: true as const } : {}), ...(setup ? { crack: { length: setup.length, tries: setup.tries, take: crackTake(q, rctx.deck ?? null) } } : {}), ...(plays ? { plays } : {}), ...(programs ? { programs } : {}) };
        });
      const hand = isJob(q) ? this.handView(q, run) : null;
      const costs = isJob(q) && run.pending && !isLegacyPending(run.pending) && run.pending.dealt ? this.costsView(q, beat, run, run.pending, rctx, player) : null;
      const job = isJob(q) ? { tier: q.tier, ...(run.push?.state === 'playing' ? { pressing: true as const } : {}), ...(hand ? { hand } : {}), ...(costs ? { costs } : {}), ...(scoring(q, run) ? { take: { filled: takeOf(run, q), size: jobTakeSize(q) } } : {}), ...(run.getaway ? { getaway: true as const } : {}), alarm: run.alarm ?? 0, nerve: { left: kit?.nerveLeft ?? 0, max: kit?.nerveMax ?? 0 }, heat: rctx.heat ?? 0, pay: q.payRange ?? ([0, 0] as [number, number]), ...(run.pending ? { rolled: isLegacyPending(run.pending) ? { choice: run.pending.choice, chance: run.pending.chance, rolls: run.pending.rolls } : { choice: run.pending.choice, faces: run.pending.roll.faces, keep: run.pending.roll.keep, kind: run.pending.roll.kind, cost: run.pending.cost, ...(run.pending.roll.saved ? { saved: true as const } : {}), ...(run.pending.roll.gamble ? { gamble: run.pending.roll.gamble } : {}), ...(run.pending.roll.rerun ? { rerun: true as const } : {}), ...(run.pending.roll.lessTake ? { lessTake: run.pending.roll.lessTake } : {}), ...(run.pending.roll.missTake ? { missTake: true as const } : {}), ...(run.pending.roll.effect ? { effect: run.pending.roll.effect } : {}) } } : {}) } : {};
      return {
        ...none,
        active: { id: q.id, title: q.title, ...(q.postedBy ? { postedBy: q.postedBy } : {}), beat: beat.id, ...(beat.song && holds(beat.songWhen ?? null, rctx) ? { song: beat.song } : {}), ...(beat.room ? { room: beat.room, ...(run.setup?.guest && run.setup.guest.kind !== 'guest' ? { roomGuest: run.setup.guest.id } : {}) } : {}), ...(beat.onComms ? { comms: true as const } : {}), ...(beat.onLine ? { onLine: beat.onLine } : {}), choices: cards, ...(q.art ? { art: `/api/quests/art/${q.art}` } : {}), ...job, ...(Object.keys(cracks).length ? { crack: cracks } : {}), ...(blown ? { blown } : {}) },
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
    const district = districtOf(this.deps.quests, q) ?? 'unknown';
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
        ...crew.map((m) => ({ id: m.recruit.id, name: m.recruit.name, spec: m.recruit.spec, grade: m.recruit.grade, toNext: m.toNext, face: m.recruit.face, traits: shownTraits(this.deps.quests, m), abilities: abilityLabels(this.deps.quests, m.slotted) })),
        ...(guest ? [{ id: guestId(guest.id), name: guest.name, spec: guest.spec, grade: guest.grade, toNext: 0, face: null, traits: guestTraits(guest), abilities: abilityLabels(this.deps.quests, guest.abilities), guest: true as const, ...((art) => (art ? { art } : {}))(guestArt(guest)) }] : []),
      ],
      contacts: [],
      deck: deck ? { name: deck.name, quality: deck.quality, slots: slotsFor(deck) } : null,
      ...(held && !deck ? { barred: held.name } : {}),
      // What SETUP can load and what the job leans on (programs spec §1.2a).
      // Only what you own (owned programs): the starter, buys, and foils held.
      ...(deck ? { programs: this.programsHeld(player).map((p) => ({ id: p.id, name: p.name, stat: p.stat, kind: p.kind, line: p.line, ...(p.foil ? { foil: true as const } : {}), ...(p.count && p.count > 1 ? { count: p.count } : {}) })) } : {}),
      leans: jobLeans(q),
      ...(q.tier >= 2 ? { tierLine: tierLine(q.tier) } : {}),
    };
  }

  /**
   * What a player can load (owned programs): owned programs and foils held, then, with a run, whatever it already has
   * loaded (a foil stays on the run once its copy is used up).
   */
  private programsHeld(player: string, run?: QuestRun): Program[] {
    const catalog = this.deps.quests?.programs?.() ?? [];
    const list = loadablePrograms(catalog, this.deps.quests?.kit?.(player)?.programs ?? NO_PROGRAMS);
    for (const l of run?.programs ?? []) {
      const p = list.some((x) => x.id === l.id) ? undefined : programOf(catalog, l.id);
      if (p) list.push(p);
    }
    return list;
  }

  /** A contract's guest as they'd go in (guest crew spec §2): the card the lead earned, with its grade and abilities. Null: no guest, no card, or none for that trade. */
  private guestFor(q: QuestEntry): NonNullable<Setup['guest']> | null {
    const g = questGuest(q);
    if (!g) return null;
    // A contact's card first; then a guest file (The Passenger spec, engine §2), who has no figure and no standing.
    const card = this.deps.quests?.contactCards?.().find((c) => c.id === g.id);
    const file = card ? undefined : this.deps.quests?.guestCards?.().find((c) => c.id === g.id);
    const who = card ?? file;
    const abilities = who && GUEST_ABILITIES[who.spec];
    if (!who || !abilities) return null;
    const base = { id: who.id, name: who.name, accent: who.accent, portrait: who.portrait, spec: who.spec, grade: g.grade, abilities };
    return file ? { ...base, kind: 'guest', ...(file.art ? { art: file.art } : {}), ...(file.line ? { line: file.line } : {}) } : base;
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
        // A deck's numbers for its shelf card (deck effects spec §3).
        const deck = item.kind === 'deck' ? decks.find((d) => d.id === item.id) : undefined;
        // A program's stat, kind and card line (owned programs).
        const prog = item.kind === 'program' ? (qs.programs?.() ?? []).find((p) => p.id === item.id) : undefined;
        return {
          id: item.id,
          name: itemName(item, decks, qs.programs?.() ?? []),
          kind: item.kind,
          price: item.price,
          tier: item.tier,
          ...(deck ? { quality: deck.quality, heat: deck.heat, traits: deck.traits } : {}),
          ...(prog ? { stat: prog.stat, programKind: prog.kind, line: prog.line } : {}),
          state: canBuy({ item, sol: kit?.sol ?? 0, tier, owned: kit?.owned ?? [], programs: kit?.programs?.owned ?? [] }),
        };
      }),
    };
  }

  /**
   * BUY at the fixer (small jobs spec §5): one kit event on `fixer.<player>`, stamped to the latest row
   * so rewind undoes it. A string is why not.
   */
  buy(player: string, itemId: string): Result | string {
    if (this.host.busy) return 'wait for her to finish';
    this.host.enter(player);
    const qs = this.deps.quests;
    const place = qs?.placeId() ?? null;
    const stock = place ? (qs?.stock?.()[place] ?? []) : [];
    const item = stock.find((s) => s.id === itemId);
    if (!qs || !place || !item) return "the fixer here doesn't sell that";
    // A crack card's terminal is built from the deck you hold: nothing changes hands mid-job.
    const book = qs.book();
    // Only while a job's beat is up (its cards could change under you); a contract's wait is fine.
    if (qs.status(this.host.pid).some((s) => !s.run.done && (s.run.beat !== null || (s.run.wait !== null && !s.run.contract)) && isJob(book.find((q) => q.id === bookId(s.id)) ?? { kind: 'quest' }))) return 'not while a job is in progress';
    const district = qs.districtOf?.(place) ?? 'unknown';
    const kit = qs.kit?.(this.host.pid);
    const state = canBuy({ item, sol: kit?.sol ?? 0, tier: repTier(kit?.rep[district] ?? 0), owned: kit?.owned ?? [], programs: kit?.programs?.owned ?? [] });
    const name = itemName(item, qs.decks?.() ?? [], qs.programs?.() ?? []);
    if (state === 'locked') return `${name} needs ${TIER_NAMES[item.tier - 1]} in ${district}`;
    if (state === 'short') return `${name} costs ${item.price} sol`;
    if (state === 'owned') return `you already have the ${name}`;
    const key = fixerKey(this.host.pair());
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
    if (this.host.busy) return 'wait for her to finish';
    this.host.enter(player);
    const qs = this.deps.quests;
    if (!qs) return 'no kit in this playthrough';
    const book = qs.book();
    if (qs.status(this.host.pid).some((s) => !s.run.done && (s.run.beat !== null || (s.run.wait !== null && !s.run.contract)) && isJob(book.find((q) => q.id === bookId(s.id)) ?? { kind: 'quest' }))) return 'not while a job is in progress';
    const kit = qs.kit?.(this.host.pid);
    if (!kit?.owned.includes(deckId)) return "you don't have that deck";
    if (kit.deck === deckId) return OK;
    const key = fixerKey(this.host.pair());
    this.deps.db.setMeta(key, JSON.stringify([...parseFixer(this.deps.db.getMeta(key)), { at: this.deps.clockNow?.() ?? 0, deck: deckId, carry: true }]));
    // The job cards' odds don't move (any deck is one die), so the quest state may not: say the kit changed.
    this.deps.emit({ type: 'kit_changed' }, this.host.pair());
    this.emitQuestState();
    return OK;
  }

  /**
   * A CREW action (crew spec §4): one crew event on `crew.<player>.<recruitId>`, stamped to the latest row so
   * rewind undoes it, checked against the folded view first. A string is why not.
   */
  crew(player: string, a: CrewAction): Result | string {
    if (this.host.busy) return 'wait for her to finish';
    this.host.enter(player);
    const view = this.deps.quests?.crewView?.() ?? null;
    if (!view) return 'no crew in this playthrough';
    const at = this.deps.clockNow?.() ?? START;
    const write = (id: string, ev: CrewEvent): Result => {
      const key = crewKey(this.host.pair(), id);
      this.deps.db.setMeta(key, JSON.stringify([...parseCrewEvents(this.deps.db.getMeta(key)), ev]));
      this.deps.emit({ type: 'crew_changed' }, this.host.pair());
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
    const rescuing = (this.deps.quests?.status(this.host.pid) ?? []).some((s) => s.run.spring?.recruit === m.recruit.id && rescueOpen(s.run, at));
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
      const tier = repTier(kit?.rep[districtOf(this.deps.quests, q) ?? 'unknown'] ?? 0);
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
    const district = districtOf(this.deps.quests, q);
    const kit = district ? qs.kit?.(player) : undefined;
    // Quests' flags, then this run's own: another job's (or last night's) prep never carries in.
    const book = qs.book();
    const quests = qs.status(player).filter((s) => !isJob(book.find((e) => e.id === bookId(s.id)) ?? { kind: 'quest' }));
    return { ...ctx, deck: carriedOn(q, ctx.deck ?? null), flags: { ...flagsOf(quests), ...(run?.flags ?? {}) }, alarm: run?.alarm ?? 0, ...(kit ? { heat: heatIn(kit, district) } : {}) };
  }

  /** WALK AWAY: before its night, a contract ends for −5 rep in its district, no heat, no debrief. A string is why not. */
  async walkAway(player: string, id: string): Promise<Result | string> {
    if (this.host.busy) return 'wait for her to finish';
    if (!this.host.ready) return NO_LINK_NOTICE;
    this.host.enter(player);
    const qs = this.deps.quests;
    const status = qs?.status(this.host.pid).find((s) => s.contact === qs.contact && !s.run.done && s.run.contract && bookId(s.id) === id);
    const q = status && qs!.book().find((e) => e.id === id);
    if (!status || !q) return 'no job to walk away from';
    if (status.run.contract && (status.run.contract.stage !== 'waiting' && status.run.setup)) return "you can't walk away now";
    const district = districtOf(this.deps.quests, q) ?? 'unknown';
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
    return q.kind === 'contract' ? contractRep(tierOf(run)) : repDelta(q.tier, tierOf(run));
  }

  /** A crack card's terminal for run `runId` (null with no words of its length). */
  private crackSetupFor(runId: string, beat: string, c: Choice, ctx: CondCtx): TerminalSetup | null {
    const seed = seedFor(questKey(this.host.pair(), runId), beat, c.id);
    return crackSetup({ seed, tag: c.crack!, ctx, words: this.deps.quests?.words?.() ?? [], stats: ctx.stats ?? DEFAULT_STATS });
  }

  /** A guest's `guest-note:` (guest crew spec §3), written to their journal on their next turn, once: pinned while a pin is free. */
  guestNotes(player: string): void {
    const { quests: qs, journal } = this.deps;
    if (!qs || !journal) return;
    for (const s of qs.status(this.host.pid)) {
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
  contactBurns(player: string): void {
    const qs = this.deps.quests;
    if (!qs || !this.deps.trust) return;
    const card = `contact:${qs.contact}`;
    for (const s of qs.status(this.host.pid)) {
      const run = s.run;
      const played = (run.calls ?? []).some((c) => c.card === card) || run.setup?.fencedBy === card || run.setup?.guest?.id === qs.contact;
      if (!jobOver(run) || !played || tierOf(run) !== 'blown') continue;
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
  settledLines(): string[] {
    const qs = this.deps.quests;
    if (!qs) return [];
    return qs.status(this.host.pid).flatMap((s) => (s.run.settles ?? []).filter((l) => l.who === qs.contact)).map((l) => `[settled: ${l.text} This stands, whatever else you've been told.]`);
  }

  jobsWithLine(): string | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    const book = qs.book();
    const today = this.storyDay();
    const done = qs
      .status(this.host.pid)
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
    return `[done together: ${done.map(({ q, run }) => `${q.title} — ${how[tierOf(run)]}${this.playedHer(run) ? ', you lent a hand' : ''}, ${agoWords(today - run.endDay!)}`).join('; ')}]`;
  }

  /** One sentence on what the player carries and how hot they are (missions spec §4); null without a kit or with nothing to say. */
  kitLineFor(player: Player): string | null {
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
  private crewExtras(q: QuestEntry, run: QuestRun, c: Choice, player = this.host.pid): { delta: number; label: string }[] {
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
  questBlockFor(player: string, shown: boolean): string | null {
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
  missionNote(row: ChatMessage): string | null {
    const qs = this.deps.quests;
    const qd = row.quest;
    const file = qd ? qs?.book().find((e) => e.id === qd.id) : undefined;
    const q = file && qs && qd ? this.asRun(file, qs.status(this.host.pid).find((s) => s.id === (qd.run ?? file.id) && s.contact === qs.contact)?.run) : file;
    if (!qs || !qd || !q || !isJob(q)) return null;
    // A row she doesn't answer has no note (walking away; a job's middle beats).
    if (qd.silent) return null;
    const run = qs.status(this.host.pid).find((s) => s.id === (qd.run ?? q.id) && s.contact === qs.contact)?.run;
    if (qd.beat === null && !qd.waiting) {
      if (!run) return MISSION_CLOSE;
      const summary = missionSummary(q, run, qs.decks?.() ?? [], qd.debrief, summaryCrew(this.deps.quests, run, questKey(this.host.pair(), qd.run ?? q.id)));
      return [MISSION_CLOSE, summary, this.lastView(q, run)].filter(Boolean).join('\n\n');
    }
    // The first beat, before any pick: a wait-resumed beat has no pick either, but comes later.
    // A contract sets out at its night, not its offer (tier 3 contracts spec §2).
    if (!qd.pick && (q.contract ? qd.beat === 'night' : qd.beat === q.first && (run?.picks.length ?? 0) === 0)) {
      const ctx = qs.ctx(this.host.pid);
      const name = this.host.turnPlayerName ?? this.host.pid;
      const came = run ? (summaryCrew(this.deps.quests, run, questKey(this.host.pair(), qd.run ?? q.id))?.came ?? []) : [];
      return `${MISSION_OPEN}\n\n${missionOpenBlock(q, playerKitLine(name, ctx?.stats ?? DEFAULT_STATS, carriedOn(q, ctx?.deck ?? null), ctx?.heat ?? 0), came)}`;
    }
    return null;
  }

  /** The view of the beat a job ended on: the run has no beat by its closing turn, so her [job] block is gone (Run Sheet, playtest). */
  private lastView(q: QuestEntry, run: QuestRun): string | null {
    const last = run.picks.filter((p) => !p.beat.startsWith('!')).at(-1);
    const beat = last ? beatAt(q, last.beat, run.variant) : undefined;
    const ctx = this.deps.quests?.ctx(this.host.pid) ?? null;
    const views = beat && ctx ? beatViews(beat, this.runCtx(q, run, ctx, this.host.pid)) : '';
    return views ? `[what you think: ${fillTimes(views, this.deps.clockNow?.() ?? 0)}]` : null;
  }

  /** A mission's beat between the first and the last (missions spec §3): she never answers it, so REGENERATE and RETRY don't either. */
  silentMissionRow(m: ChatMessage): boolean {
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
  emitQuestState(player = this.host.pid): void {
    // Her plan's card rides with the story state: a rebuild, a turn or a move can change it (her plans spec §5).
    this.host.emitPlanCard(player);
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
    this.host.keepShownTake();
    // A row she won't answer says so, so the tabs don't wait for her (she'd stay "transmitting").
    if (!reply && row.quest) row.quest.silent = true;
    // Time tokens ({time +40m}) read the hour this row stands at (feedback 2026-10-19), insertTurnRow's stamp.
    const now = this.deps.clockNow?.() ?? null;
    if (now !== null) row.text = fillTimes(row.text, now + (base ?? TURN_COST.quest) + minutes);
    this.host.insertTurnRow(row, minutes, base);
    this.deps.db.setMeta(questKey(this.host.pair(), id), JSON.stringify(run));
    after?.();
    this.host.emitPair({ type: 'message', message: row });
    this.emitQuestState();
    // A mission's beats between the first and the last play without her (missions spec §3): the room follows now.
    if (!reply) this.host.flushLiveClock();
    return reply ? this.host.runTurn(row) : OK;
  }

  /** QUEST (spec §3): starts a quest open here with its first beat. A string is why not. */
  async startQuest(player: string, id: string, setup?: { approach: Approach; people: string[]; favour: boolean; contacts?: string[]; programs?: string[] }): Promise<Result | string> {
    if (this.host.busy) return 'wait for her to finish';
    if (!this.host.ready) return NO_LINK_NOTICE;
    this.host.enter(player);
    // A contract's night: its SETUP comes here, not at the offer (tier 3 contracts spec §2).
    const night = this.deps.quests?.status(this.host.pid).find((s) => bookId(s.id) === id && s.contact === this.deps.quests?.contact && nightOpen(s.run));
    if (night && setup) return this.goInContract(night, setup);
    // A rescue (crew spec §5) starts as its post plays it.
    const post = this.springPosts().find((p) => p.q.id === id);
    const listedRow = this.questState(this.host.pid).open.find((o) => o.id === id);
    // A locked Tier 2 row (Tier 2 spec §1) lists with its checklist, but doesn't start.
    if (listedRow?.checks && listedRow.locked) return 'that one is still locked';
    const q = listedRow ? (post?.q ?? this.deps.quests!.book().find((e) => e.id === id)) : undefined;
    if (post && post.place !== this.deps.quests!.placeId()) return "that job isn't open here";
    const ctx = this.deps.quests?.ctx(this.host.pid) ?? null;
    if (!q || !ctx) return "that job isn't open here";
    // NERVE gone (the table spec §3): no new job until the next 06:00.
    if (isJob(q) && this.deps.quests?.kit?.(this.host.pid).nerveGone) return 'nerve gone — back at 06:00';
    // The arrangement's nights cap (spec 2026-10-20 §2): greyed in the list, refused here.
    if (this.capped(q, this.host.pid)) return `${this.deps.quests!.contactName(this.deps.quests!.contact).toLowerCase()} is done tonight`;
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
    const key = questKey(this.host.pair(), runId);
    const draws = mission ? drawsFor(q, key) : {};
    // A mission's guest brought at SETUP (The Passenger spec, engine §1): on the setup, and its flag for the beats that read it.
    const want = mission ? questGuest(q) : null;
    const guest = want && hand?.people.includes(guestId(want.id)) ? (this.guestFor(q) ?? undefined) : undefined;
    // Crew prep on this job tonight (crew spec §2) joins the run's flags beside its draws.
    const flags = mission ? { ...draws, ...(this.deps.quests?.crewState?.()?.prep[runId] ?? {}), ...guestFlags({ guest }) } : {};
    // A contract's offer has an opening for someone the contact already knows (tier 3 contracts spec §5).
    if (q.contract && (this.deps.tie?.(this.host.pid) || this.deps.db.recentMessages(this.host.pid, 200).some((m) => m.mode === 'text' || m.mode === 'encounter' || m.mode === 'quest'))) (flags as Record<string, string>).met = 'yes';
    const pay = mission ? payFor(q, key) : null;
    // HARD goes in loud (the hand spec §1): ALARM 1, and TAKE 1 from tier 2 up (none on tier 1, balancing 2026-11-01).
    const hard = hand?.approach === 'hard';
    // Each brought recruit's loadout as it stands at GO IN (crew abilities plan ruling 4), kept only when someone has one.
    const members = withGuest(this.deps.quests?.crewState?.()?.members ?? [], { guest });
    const loadout = Object.fromEntries((hand?.people ?? []).map((id) => [id, members.find((m) => m.recruit.id === id)?.slotted ?? []]));
    const abilities = Object.values(loadout).some((l) => l.length > 0) ? { abilities: loadout } : {};
    // The deck carried at GO IN and its slots (programs spec §3): no deck stores slots 0, so the run isn't an old one.
    const carried = carriedOn(q, ctx.deck ?? null);
    const deck = { id: carried?.id ?? '', quality: carried?.quality ?? 1, slots: slotsFor(carried) };
    const job: Partial<QuestRun> = mission ? { draws, alarm: hard ? 1 : 0, day, startDeck: carried?.id ?? null, ...(pay !== null ? { pay } : {}), ...(hand ? { setup: { ...hand, tier: q.tier, ...(guest ? { guest } : {}), ...abilities, at: this.deps.clockNow?.() ?? 0, deck } } : {}), ...(loads.length ? { programs: loads.map((id) => ({ id, at: this.deps.clockNow?.() ?? 0 })) } : {}), ...(hard && hardStartTake(q.tier) > 0 ? { takeFill: hardStartTake(q.tier) } : {}), ...(post ? { spring: { recruit: post.recruit, place: post.place, tier: post.tier } } : {}) } : {};
    const rctx = this.runCtx(q, { flags, alarm: job.alarm ?? 0 } as QuestRun, ctx, this.host.pid);
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
    const ctx = this.deps.quests?.ctx(this.host.pid) ?? null;
    if (!q || !ctx) return "that job isn't open here";
    if (this.deps.quests?.kit?.(this.host.pid).nerveGone) return 'nerve gone — back at 06:00';
    if (this.deps.quests?.status(this.host.pid).some((s) => s.id !== status.id && !s.run.done && s.run.beat !== null)) return 'finish what you started first';
    const checked = this.checkSetup(q, setup);
    if (typeof checked === 'string') return checked;
    // A piece that landed after the wait ended still counts: results close here, whether or not its report has played.
    const landed = this.deps.quests?.crewState?.()?.reports ?? {};
    const back = (q.contract?.pieces ?? []).flatMap((p) => (landed[`${status.id}:${p.id}`] ? [[p.id, landed[`${status.id}:${p.id}`].band] as const] : []));
    const results = { ...status.run.contract?.results, ...Object.fromEntries(back) };
    const hard = checked.approach === 'hard';
    const at = this.deps.clockNow?.() ?? 0;
    const want = questGuest(q);
    const guest = want && checked.people.includes(guestId(want.id)) ? (this.guestFor(q) ?? undefined) : undefined;
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
    const rctx = this.runCtx(q, run0, ctx, this.host.pid);
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
    const offer = this.setupOffer(q, this.host.pid);
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
      // Only what you own (owned programs).
      if (programs.some((p) => !offer.programs?.some((x) => x.id === p))) return programs.some((p) => !programOf(this.deps.quests?.programs?.() ?? [], p)) ? 'NOT A PROGRAM' : "YOU DON'T HAVE IT";
      if (programs.length > offer.deck.slots) return 'NO FREE SLOT';
    }
    return { approach: setup.approach, people, favour: false, programs };
  }

  /**
   * A card, or CONFIRM on a held line (spec §3): one row of the pick line, the outcome and the next
   * beat. `said` is the player's own line when CONFIRM sent it; `moves` a crack card's terminal moves. A string is why not.
   */
  async chooseQuest(player: string, o: { id: string; beat: string; choice: string; push?: boolean | PushMode; trade?: Trade; card?: string; press?: string; programs?: { load: string[]; run: string[] }; said?: string; moves?: CrackPick['moves'] }): Promise<Result | string> {
    if (this.host.busy) return 'wait for her to finish';
    if (!this.host.ready) return NO_LINK_NOTICE;
    this.host.enter(player);
    const passed = 'that choice has passed';
    const here = this.questHere(this.host.pid);
    const ctx0 = this.deps.quests?.ctx(this.host.pid) ?? null;
    // The WALK / PRESS ON card (pressing on spec §1).
    if (here?.q && ctx0 && here.q.id === o.id && o.beat === PUSH_BEAT && here.status.run.beat === PUSH_BEAT) return this.pushPick(here.q, here.status, ctx0, o.choice);
    if (!here || !here.q || !here.beat || !ctx0 || here.q.id !== o.id || here.beat.id !== o.beat) return passed;
    const { q, beat, status } = here;
    const ctx = this.runCtx(q, status.run, ctx0, this.host.pid);
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
    const dealFor = this.host.pid;
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
    const district = districtOf(this.deps.quests, q);
    const t = tagsOf(choice, run0.flags);
    const at = this.jobClock(q, t.minutes);
    const heat = (n: number): KitEvent => ({ at, heat: n, ...(district ? { district } : {}) });
    const line = o.said?.trim() || pickLine(choice.line);
    const nerveLeft = this.deps.quests?.kit?.(this.host.pid).nerveLeft ?? 0;
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
    const effect = hand ? cardEffect(hand.member, (talksPast(hand.ability) ? asked : check).stat, poolOf(check, who0).position, hand.contact, hand.ability, run0.getaway === true, check.red) : null;
    if (hand?.ability && !effect) return 'that card does nothing here';
    const called = effect ? { ...who0, call: effect } : who0;
    const pressEffect = side ? cardEffect(side.member, (talksPast(side.ability) ? asked : check).stat, poolOf(check, called).position, undefined, side.ability, run0.getaway === true, check.red) : null;
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
    // A foil that ran is used up (owned programs): one copy leaves the kit, and its slot reads BURNED.
    const foils = (pool.programs ?? []).filter((p) => p.foil).map((p) => p.id);
    for (const id of foils) events.push({ at, program: { id: baseProgramId(id), foil: -1 } });
    // The deck against the job's tier (deck effects spec §1): one that holds takes a 4–5's ALARM, an outclassed one adds to a
    // miss's; a hidden deck's grid check costs no heat (§2).
    const roll: DiceRoll = { stat: pool.stat, dice: Math.max(0, pool.dice), position: pool.position, faces, keep, kind: result.kind, pass: result.pass, ...(push ? { pushed: true as const } : {}), costs: [], ...(pool.deck?.hidden ? { hidden: true as const } : {}), ...(check.grid && deck?.heat && !pool.deck?.hidden ? { deckHeat: deck.heat } : {}), ...(pool.quiet ? { quiet: true as const } : {}), ...(pool.effect && pool.effect !== 'fair' ? { effect: pool.effect } : {}), ...(trade ? { trade } : {}), ...(progs.ran.length ? { programs: progs.ran.map((p) => p.id) } : {}), ...(setupLeft ? { setup: setupLeft } : {}), ...(acts.some((e) => e.missTake) ? { missTake: true as const } : {}) };
    // The costs (roll lifecycle spec §1.2): three dealt from those that can bite, picked by position; they replace the
    // position's fixed ALARM and heat (and a holding deck's automatic hold, now its armour).
    // Below the tier the lacquer notices each run (programs spec §1.3): ALARM +1 a run, landed with the roll.
    // A greed press's ALARM +1 (ability pass spec §2) lands the same way.
    const cost = { alarm: (pool.programs ?? []).reduce((n, p) => n + p.alarm, 0) + acts.reduce((n, e) => n + (e.alarm ?? 0) + (result.kind === 'miss' ? (e.missAlarm ?? 0) : 0), 0), heat: 0 };
    const seed = `${questKey(this.host.pair(), status.id)}|${beat.id}|${choice.id}|costs`;
    const { dealt, pick, filled } = this.dealFor(q, run0, choice, seed, { kind: result.kind, position: pool.position, effect: pool.effect, fills: pool.effect !== undefined, alarm: t.alarm + cost.alarm });
    // A recruit's again-call's miss may cost them (§2), drawn from the run's key, the beat and the recruit: rewind replays it.
    // An ability never does: it costs NERVE instead (effect and NERVE spec §2).
    const lossSeed = hand?.member ? `${questKey(this.host.pair(), status.id)}|${beat.id}|${hand.member.recruit.id}|again` : '';
    const loss = hand?.member && !hand.ability && hand.again && result.kind === 'miss' ? callLoss(this.deps.quests, hand.member, lossSeed, pool.position) : null;
    const call: Call | undefined = hand && o.card ? { beat: beat.id, choice: choice.id, card: hand.ability ? hand.member!.recruit.id : o.card, ...(hand.ability ? { ability: hand.ability.id } : {}), again: hand.again, at, ...(loss ? { loss } : {}) } : undefined;
    const pressCall: Call | undefined = side ? { beat: beat.id, choice: choice.id, card: side.member!.recruit.id, ability: side.ability!.id, again: false, at } : undefined;
    const played = [...(call ? [call] : []), ...(pressCall ? [pressCall] : [])];
    // A roll with costs to pick parks (roll lifecycle spec §1); so does one a brought AFTER A ROLL ability could act on
    // (crew abilities plan ruling 3). The GM writes the dealt costs into the scene while the cards are up (§1.4).
    const spent = pushCost + pressCost;
    // The loads go on the run (programs spec §3); a deck that died on this roll runs nothing more.
    const firm = acts.some((e) => e.firm);
    const loadedNow = progs.load.length || foils.length ? [...(run0.programs ?? []), ...progs.load.map((id) => ({ id, at, hot: true as const }))].map((l) => (foils.includes(l.id) ? { ...l, burned: true as const } : l)) : null;
    const run1: QuestRun = loadedNow || (died && run0.setup?.deck) || firm ? { ...run0, ...(firm ? { firm: true as const } : {}), ...(loadedNow ? { programs: loadedNow } : {}), ...(died && run0.setup?.deck ? { deckDead: true as const } : {}) } : run0;
    status = run1 === run0 ? status : { ...status, run: run1 };
    if (pick > 0 || this.afterCould(q, { ...run0, calls: [...(run0.calls ?? []), ...played] }, { beat: beat.id, choice: choice.id }, roll, cost, spent, played)) {
      const parked: DicePending = { beat: beat.id, choice: choice.id, at, roll, cost, ...(died ? { died } : {}), ...(call ? { call } : {}), ...(pressCall ? { after: [pressCall] } : {}), ...(dealt.length ? { dealt, pick, settled: [] } : {}) };
      const key = questKey(this.host.pair(), status.id);
      this.deps.db.setMeta(key, JSON.stringify({ ...run1, kit: [...(run1.kit ?? []), ...events], pending: parked, at: Date.now() }));
      // The GM first, so the state that shows the costs already says it's writing.
      if (dealt.length && this.deps.gm) this.fillGmQuietly(this.deps.gm, key, this.host.pid, q, beat, choice, parked, { filled, size: jobTakeSize(q) });
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
    // Loads from what you own (owned programs); a rerun from what's loaded.
    const held = this.programsHeld(this.host.pid, run);
    const all = [...load, ...again];
    if (new Set(all).size !== all.length || all.some((id) => !held.some((p) => p.id === id))) return 'NOTHING TO DO HERE';
    const loaded = run.programs ?? [];
    if (load.some((id) => loaded.some((l) => l.id === id))) return 'NOTHING TO DO HERE';
    if (loaded.length + load.length > slots.slots) return 'NO FREE SLOT';
    if (again.some((id) => !loaded.some((l) => l.id === id && !l.burned))) return 'NOT LOADED';
    // Judged one after another (Task 5 review I1): each must still move the pool after the ones before it. One the rest
    // of the pick already covers (a lift or SAFE into the dark, PUSH or BOLD to BIG) is dropped, not refused: it neither
    // loads nor costs the lacquer's ALARM, and the pick goes through (final review I1).
    const ran: Program[] = [];
    for (const p of all.map((id) => held.find((x) => x.id === id)!)) {
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
    const calls = callsOf(run);
    const missing = "that card isn't in your hand";
    if (!setup) return missing;
    // An ability (crew abilities spec §2): in the loadout taken at GO IN, its timing right for the moment, the stack not down.
    const ac = abilityCard(card);
    if (ac) {
      const member = setup.people.includes(ac.rid) ? crewOn(this.deps.quests, setup).find((m) => m.recruit.id === ac.rid) : undefined;
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
    const member = setup.people.includes(card) ? crewOn(this.deps.quests, setup).find((m) => m.recruit.id === card) : undefined;
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
    const kit = this.deps.quests?.kit?.(this.host.pid);
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
    const kit = this.deps.quests?.kit?.(this.host.pid);
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
    this.deps.db.setMeta(questKey(this.host.pair(), status.id), JSON.stringify(run));
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
    const kit = this.deps.quests?.kit?.(this.host.pid);
    const price = abilityNerve(ability.job);
    if (price && (kit?.nerveGone || (kit?.nerveLeft ?? 0) < price)) return 'not enough nerve';
    const at = pending.at ?? this.deps.clockNow?.() ?? 0;
    const choice = beat.choices.find((c) => c.id === pending.choice);
    if (!choice) return 'that choice has passed';
    const key = questKey(this.host.pair(), status.id);
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
      const held = fallFor(this.deps.quests, member, 'held');
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
    if (redealt && this.deps.gm) this.fillGmQuietly(this.deps.gm, key, this.host.pid, q, beat, choice, next, { filled, size: jobTakeSize(q) });
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
    const kit = this.deps.quests?.kit?.(this.host.pid);
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
    const kit = this.deps.quests?.kit?.(this.host.pid);
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
    const key = questKey(this.host.pair(), status.id);
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
    const pool = this.poolFor(choice, ctx, beat, { q, run: run0, player: this.host.pid });
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
    const kit = this.deps.quests?.kit?.(this.host.pid);
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
   * fillGm in the background. Its room can close while the GM writes (a LOAD, a switch of playthrough): the late
   * answer then has no database to read, and is dropped instead of an unhandled rejection taking the server down.
   */
  private fillGmQuietly(...a: Parameters<JobRunner['fillGm']>): void {
    this.fillGm(...a).catch((err: unknown) => console.warn(`[gm] lines dropped: ${err instanceof Error ? err.message : String(err)}`));
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
      // A timer: a closed room's throw here would be uncaught.
      try {
        this.emitQuestState(player);
      } catch (err) {
        console.warn(`[gm] state not sent: ${err instanceof Error ? err.message : String(err)}`);
      }
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

  /** The hand as the table shows it (§2): each recruit brought, their free call and again risk, who's down, the favour. */
  private handView(q: QuestEntry, run: QuestRun): HandView | null {
    const setup = run.setup;
    if (!setup) return null;
    const calls = callsOf(run);
    const members = crewOn(this.deps.quests, setup);
    const book = this.deps.quests?.crewAbilities?.() ?? [];
    const parked = run.pending && !isLegacyPending(run.pending) ? run.pending : null;
    const kit = this.deps.quests?.kit?.(this.host.pid);
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
      const g = setup.guest && id === guestId(setup.guest.id) ? setup.guest : null;
      const art = g ? guestArt(g) : undefined;
      const guest = g ? { guest: true as const, ...(art ? { art } : {}) } : {};
      return [{ id, name: r.name, spec: r.spec, grade: r.grade, toNext: m.toNext, face: r.face, traits: g ? guestTraits(g) : shownTraits(this.deps.quests, m), free: callable && !called ? 1 : 0, risk: callable && called && !g ? AGAIN_RISK[r.grade] : null, down, abilities, ...guest }];
    });
    const contacts = (setup.contacts ?? []).map((c) => ({ ...c, used: calls.some((x) => x.card === `contact:${c.id}`) || setup.fencedBy === `contact:${c.id}` }));
    return { approach: setup.approach, people, favour: setup.favour ? (calls.some((c) => c.card === 'favour') ? 'used' : 'ready') : null, contacts, ...(setup.deck ? { pockets: pocketsView(this.deps.quests, run, setup.deck, this.programsHeld(this.host.pid, run)) } : {}) };
  }

  /** Each program's pool on a checked choice alone (programs spec §2.1), or why it can't run here; through poolOf as the roll. */
  private programPreviews(c: Choice, ctx: CondCtx, beat: Beat, job: { q: QuestEntry; run: QuestRun; player: string }, pool: Pool, call?: CallEffect, press?: CallEffect): Record<string, ProgramPreview> {
    const who = { ...this.poolWho(c, ctx, beat, job.q, job.run, job.player), ...(call ? { call } : {}), ...(press ? { press } : {}) };
    const swap = call?.stat ?? press?.stat;
    const check = swap ? swappedCheck(c.check!, swap) : c.check!;
    return Object.fromEntries(
      this.programsHeld(job.player, job.run).map((p): [string, ProgramPreview] => {
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
      const effect = cardEffect(hand.member, stat, position, hand.contact, hand.ability, getaway, c.check!.red);
      const alone = effect && play(effect);
      if (!effect || !alone) continue;
      // Each press that could go beside this call (ability pass spec §1): from another recruit, on the roll as it stands.
      const presses: Record<string, Omit<Play, 'presses'>> = {};
      for (const [pc, side] of hand.ability ? [] : sides) {
        if (side.member?.recruit.id === hand.member?.recruit.id) continue;
        const pe = cardEffect(side.member, stat, alone.position, undefined, side.ability, getaway, c.check!.red);
        // Beside One More Thing the call is judged on the stat it moves the roll to.
        const beside = pe?.stat ? cardEffect(hand.member, pe.stat, position, hand.contact, hand.ability, getaway) : effect;
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
    const said = o.calls.map((c) => callTexts(this.deps.quests, c, o.q, o.status.run));
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
    const effect = effectEvent(isJob(q) ? { ...o.outcome.effects, heat: undefined } : o.outcome.effects, at, { pay: run0.pay ?? null, district: districtOf(this.deps.quests, q) });
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
    const stayed = heldAlarm(this.deps.quests, q, run0, run);
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
      if (backToWait) await this.playDueQuest(this.host.pid);
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
      const fencer = !run0.getaway && run.blown !== true && run.take !== 'none' && fill < jobTakeSize(q) ? fenceOn(this.deps.quests, run) : null;
      const fenced0 = fencer && run.setup ? { ...took, takeFill: fill + 1, setup: { ...run.setup, fenced: true as const, fencedBy: fencer } } : took;
      // AT THE END: TAKE +1 abilities (crew abilities spec §2) on the same terms as a FENCE, each while TAKE isn't full,
      // and the abilities that cool it (ability pass spec §2) while there's heat to cool.
      const fenced = !run0.getaway && run.blown !== true && run.take !== 'none' ? endDeal(this.deps.quests, endCool(this.deps.quests, endTake(this.deps.quests, fenced0, jobTakeSize(q)), o.ctx.heat ?? 0), q) : fenced0;
      const settled = settleTake(fenced, q, at, run0.getaway ? (run.pay ?? 0) : 0);
      const take = run0.getaway && settled.take === 'full' ? 'part' : settled.take;
      done = { ...fenced, kit: [...(run.kit ?? []), ...settled.events], take };
      if (!run0.getaway && canOffer(q, done, 0, this.nerveAfter(run0, done))) return this.pushOffer(q, status.id, { ...done, push: { stage: 0, pot: 0, from: (done.kit ?? []).length, outcome: o.outcome.id, state: 'offer', log: [] } }, texts, o.pick, cost);
    }
    const end = { outcome: o.outcome.id, text: texts.filter((t) => t !== '').join('\n\n'), pick: o.pick, minutes: cost };
    const held = this.deps.quests?.kit?.(this.host.pid).cover;
    // A trust job's loss can't be covered (Intake board spec §2): no cover cards, nothing spent.
    if (tierOf(done) === 'blown' && !q.trust && held && (held.burner > 0 || held['fall-guy'] > 0)) {
      // Parked before its row (plan ruling 5): the run stays at its beat, with this pick's events, until a cover card.
      this.deps.db.setMeta(questKey(this.host.pair(), status.id), JSON.stringify({ ...done, beat: run0.beat, variant: run0.variant, wait: run0.wait, done: false, pendingCover: end }));
      this.emitQuestState();
      return OK;
    }
    return this.finishJob(q, status.id, done, end, null);
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
    if ((this.deps.quests?.kit?.(this.host.pid).nerveLeft ?? 0) < PRESS_NERVE) return 'not enough nerve';
    const ctx = this.runCtx(q, run0, ctx0, this.host.pid);
    const chosen = chooseVariant(q, next, ctx);
    if (!chosen) return 'that choice has passed';
    const drawn = this.drawFace(chosen.beat.stranger, run0.faces ?? {});
    const row = this.questRow(q, [beatText(chosen.beat, ctx)], { beat: chosen.beat }, { choice: PRESS, line: 'Press on.' }, drawn.face, { run: status.id });
    const nerve: KitEvent = { at: this.deps.clockNow?.() ?? 0, nerve: -1 };
    const run: QuestRun = { ...run0, beat: chosen.beat.id, variant: chosen.variant, kit: [...(run0.kit ?? []), nerve], push: { ...p, stage: p.stage + 1, state: 'playing', had: p.had ?? this.deps.quests?.kit?.(this.host.pid).owned ?? [] }, at: Date.now(), ...(drawn.faces ? { faces: drawn.faces } : {}) };
    return this.questTurn(row, status.id, run, 0, false, 0);
  }

  /** NERVE left once `run` is saved: the kit as stored, plus the spends this pick adds to the run's kit. */
  private nerveAfter(run0: QuestRun, run: QuestRun): number {
    const spent = (r: QuestRun) => (r.kit ?? []).reduce((n, e) => n + (e.nerve ?? 0) + (e.edge ?? 0), 0);
    return (this.deps.quests?.kit?.(this.host.pid).nerveLeft ?? 0) + spent(run) - spent(run0);
  }

  /**
   * A job's end (small jobs spec §2, §5): the rep change for its tier (cover softening a blown one), the
   * cover and rep events, the finished run and its debrief. Also the preview under the cover cards (cover null).
   */
  private jobEnd(q: QuestEntry, run: QuestRun, end: NonNullable<QuestRun['pendingCover']>, cover: CoverId | null, player: string, runId: string): { done: QuestRun; debrief: Debrief } {
    const tier = tierOf(run);
    const district = districtOf(this.deps.quests, q) ?? 'unknown';
    const at = (this.deps.clockNow?.() ?? 0) + end.minutes;
    // A trust stake (Intake board spec §2) moves her standing instead of rep, and cover never softens it.
    const trust = trustDelta(q, tier);
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
    const cooled = tier === 'messy' ? endAbilities(this.deps.quests, run, 'heat') : [];
    for (let i = 0; i < cooled.length; i++) extra.push({ at, heat: -1, district });
    if (cooled.length && run.setup) run = { ...run, setup: { ...run.setup, ended: [...(run.setup.ended ?? []), ...cooled] } };
    // A foil drop (owned programs): one end in about seven that isn't blown, seeded by the run, for the stat it leaned on.
    const catalog = qs?.programs?.() ?? [];
    // The playthrough's seed too, so another playthrough's same job on the same day draws its own.
    const found = tier !== 'blown' ? foilDrop(`${qs?.boardSeed?.() ?? ''}|${questKey(this.host.pair(), runId)}`, jobLeans(q), catalog) : null;
    if (found) extra.push({ at, program: { id: found, foil: 1 } });
    // The crew brought are on the job until now (the hand spec §1).
    const done: QuestRun = { ...run, beat: null, variant: 0, wait: null, done: true, endDay: this.storyDay(), pending: null, pendingCover: null, kit: [...(run.kit ?? []), ...extra, ...retainer], at: Date.now(), ...(run.setup ? { setup: { ...run.setup, endAt: at } } : {}) };
    const preview = trust !== null && trust !== 0 ? (this.deps.trust?.preview(player, trust) ?? null) : null;
    const trustLine = trust === null ? undefined : preview && preview.before !== preview.after ? { name: preview.name, before: preview.before, after: preview.after } : null;
    // Her closing line hears any move, word change or not (a clamped one isn't a move).
    const moved = preview && preview.moved !== 0 ? (preview.moved > 0 ? 'up' : 'down') : undefined;
    // The debrief's sol is the job's own; the retainer has its own line.
    const deckAt = run.setup?.deck?.id ? ((this.deps.quests?.decks?.() ?? []).find((d) => d.id === run.setup!.deck!.id) ?? null) : null;
    // The district's heat once this job lands: what's there now, what the end adds, what the crew's traits add.
    const crewHeat = crewHeatOf(this.deps.quests, run, tier, questKey(this.host.pair(), runId));
    const heatNow = this.deps.quests?.kit?.(player).heat?.[district] ?? 0;
    const heatAfter = Math.min(HEAT_MAX, Math.max(0, heatNow + extra.reduce((n, e) => n + (e.heat ?? 0), 0) + crewHeat));
    const debrief = buildDebrief({ q, run: { ...done, kit: [...(run.kit ?? []), ...extra] }, tier, district, before, delta, cover, programs: this.deps.quests?.programs?.() ?? [], deck: deckAt, heat: { after: heatAfter, cooled: cooled.length, crew: crewHeat }, ...(trustLine !== undefined ? { trust: trustLine } : {}), ...(moved ? { trustMoved: moved } : {}) });
    if (cut > 0) debrief.cut = { name: qs!.contactName(qs!.contact), pct: deal!.a.cut, amount: cut };
    if (found) debrief.found = catalog.find((p) => p.id === found)?.name ?? found;
    if (q.drops && tier !== 'blown') debrief.loot = { label: q.drops.toUpperCase(), ...((qs?.crewState?.()?.stash?.length ?? 0) >= STASH_MAX ? { lost: true as const } : {}) };
    const crew = debriefCrew(this.deps.quests, run, questKey(this.host.pair(), runId));
    if (crew.length) {
      debrief.crew = crew;
      debrief.people = debriefPeople(this.deps.quests, run);
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
    if (outfit) debrief.outfit = outfitLine(this.deps.quests, outfit);
    return { done, debrief };
  }

  /** Who a job's `gives: recruit` draws (crew spec §5), the one its card will show; null with no draw to hand. */
  private drawHire(q: QuestEntry, runId: string, gift: JobHire): Recruit | null {
    return this.deps.quests?.jobRecruit?.({ ...gift, runKey: questKey(this.host.pair(), runId), title: q.title, place: q.starts, district: districtOf(this.deps.quests, q) ?? 'unknown' }) ?? null;
  }

  /** A row's text with `{hire}` as the name on the card its ending leaves. */
  private hireNamed(q: QuestEntry, text: string, runId: string | undefined): string {
    if (!text.includes('{hire}')) return text;
    const gift = [...q.outcomes.values()].find((o) => o.effects.recruit && text.includes(o.text))?.effects.recruit;
    return fillHire(text, gift && runId ? (this.drawHire(q, runId, gift)?.name ?? null) : null);
  }

  /** A cover card on a parked blown job (small jobs spec §5): one held, or TAKE IT. A string is why not. */
  private async coverPick(q: QuestEntry, status: QuestStatus, choice: string): Promise<Result | string> {
    const end = status.run.pendingCover!;
    const cover: CoverId | null = choice === BURNER ? 'burner' : choice === FALL_GUY ? 'fall-guy' : null;
    const held = this.deps.quests?.kit?.(this.host.pid).cover;
    if (cover && !(held && held[cover] > 0)) return 'that choice has passed';
    if (!q.outcomes.has(end.outcome)) return 'that choice has passed';
    return this.finishJob(q, status.id, status.run, end, cover);
  }

  /**
   * A job's last row (small jobs spec §2, §5, §6): the rep change for its tier (cover softening a blown
   * one), the debrief on the row, and her closing turn.
   */
  private async finishJob(q: QuestEntry, runId: string, run: QuestRun, end: NonNullable<QuestRun['pendingCover']>, cover: CoverId | null): Promise<Result> {
    const { done, debrief } = this.jobEnd(q, run, end, cover, this.host.pid, runId);
    const row = this.questRow(q, [end.text], { beat: null }, end.pick, undefined, { run: runId, debrief });
    const trust = trustDelta(q, tierOf(run));
    const player = this.host.pid;
    const unpaid = debrief.retainer?.paid === false;
    // Written after the run, under the row's stamp, so rewind takes it back with the row: the trust stake, and an unpaid retainer's −1.
    const after =
      trust || unpaid
        ? () => {
            if (trust) this.deps.trust?.move(player, trust, `Night job: ${q.title}, ${tierOf(run)}`, row.id);
            if (unpaid) this.deps.trust?.move(player, -1, UNPAID_REASON, row.id);
          }
        : undefined;
    // A contract's fallout comes days later (tier 3 contracts spec §4): the job is over, and the run waits on.
    const wait = q.contract ? { to: 'fallout', from: this.rowClock(end.minutes) + q.contract.fallout, at: null, ready: false, by: null, else: null, next: 'It isn\'t over yet.' } : null;
    const left: QuestRun = wait && done.contract ? { ...done, done: false, beat: null, variant: 0, wait, flags: { ...done.flags, grade: tierOf(run) }, contract: { ...done.contract, stage: 'fallout', wait } } : done;
    return this.questTurn(row, runId, left, end.minutes, true, 0, after);
  }

  /** A pick on a contract's fallout: it plays out with no second debrief, and its `gives:` is the mark you keep (tier 3 contracts spec §4). */
  private falloutPick(q: QuestEntry, beat: Beat, status: QuestStatus, ctx: CondCtx, choice: Choice, outcome: Outcome, said: string | undefined): Promise<Result> {
    const { flags, minutes } = tagsOf(choice, status.run.flags);
    const line = said?.trim() || pickLine(choice.line);
    const clock = this.rowClock(minutes);
    const step = this.followOutcome(q, outcome, { ...ctx, flags: { ...ctx.flags, ...flags } }, clock, status.run);
    const effect = effectEvent({ ...outcome.effects, heat: undefined }, clock, { pay: null, district: districtOf(this.deps.quests, q) });
    const pick = { choice: choice.id, line };
    // Outfits as rewards: no debrief here, so the end card shows what the ending opened.
    const outfit = outcome.effects.outfit && step.run.done ? outcome.effects.outfit : null;
    const row = this.questRow(q, [line, ...step.texts], step, pick, undefined, { run: status.id, ...(outfit ? { rewards: [outfitLine(this.deps.quests, outfit)] } : {}) });
    // A recruit's card goes up when the contract closes, so `gives: recruit` works here or on the night's end.
    const recruit = outcome.effects.recruit;
    const closed = step.run.done && status.run.contract ? { contract: { ...status.run.contract, closedAt: clock } } : {};
    // A fallout has no debrief to show the card, so it says so here.
    if (recruit && step.run.done) this.deps.emit({ type: 'notice', text: `// SOMEONE WANTS WORK — at ${this.deps.quests?.placeName(q.starts) ?? q.starts} until 06:00 (CREW → HIRE)`, for: 'quest' }, this.host.pair());
    // The kit event below opens it; the notice says where to wear it (yours on YOU, a contact's on PEOPLE).
    if (outfit) this.deps.emit({ type: 'notice', text: `// NEW ${outfitLine(this.deps.quests, outfit)} (${outfit.who === this.host.pair() ? 'YOU' : 'PEOPLE'} → WARDROBE)`, for: 'quest' }, this.host.pair());
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
    if (!qs || this.host.busy || !this.host.ready) return null;
    this.host.enter(player);
    const here = this.questHere(this.host.pid);
    const ctx = qs.ctx(this.host.pid);
    if (!here?.wait || !ctx) return null;
    // A report in from groundwork comes before the wait's end (tier 3 contracts spec §3).
    // One still out when the job ended holds until the fallout is due, so nothing comes up over the debrief.
    const held = here.status.run.contract?.stage === 'fallout' && (this.deps.clockNow?.() ?? 0) < here.wait.from;
    const report = here.q?.contract && !held ? this.reportDue(here.q, here.status, ctx) : null;
    if (report) return report;
    if (!here.q || !this.waitIntact(here.q, here.wait)) return null;
    const { q, wait, status } = here;
    const due = waitDue(wait, { now: this.deps.clockNow?.() ?? 0, placeId: qs.placeId(), ready: o.ready === true, comms: this.commsNow(this.host.pid)?.on === true });
    if (due === 'wait') return null;
    // A contract's wait ends at SETUP, not at a beat: nothing rolls until GO IN (tier 3 contracts spec §2).
    if (q?.contract && status.run.contract?.stage === 'fallout') {
      const rctx = this.runCtx(q, status.run, ctx, this.host.pid);
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
    let step: ReturnType<JobRunner['followOutcome']>;
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
    const effect = mission && outcome ? effectEvent({ ...outcome.effects, heat: undefined }, clock, { pay: status.run.pay ?? null, district: districtOf(this.deps.quests, q) }) : null;
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
    const rctx = { ...this.runCtx(q, status.run, ctx, this.host.pid), flags: { ...ctx.flags, ...flags } };
    const chosen = chooseVariant(q, `report-${piece.id}`, rctx);
    if (!chosen) return null;
    const row = this.questRow(q, [line, beatText(chosen.beat, rctx)], { beat: chosen.beat }, undefined, undefined, { run: status.id });
    // Results close at GO IN: one landing during the night plays, and changes nothing.
    const results = arc.stage === 'waiting' ? { ...arc.results, [piece.id]: band } : arc.results;
    return this.questTurn(row, status.id, { ...status.run, flags, beat: chosen.beat.id, variant: chosen.variant, wait: null, contract: { ...arc, results, reported: [...arc.reported, piece.id] }, at: Date.now() }, 0);
  }

  /**
   * The arrangement here (spec 2026-10-20 §2): the deal, whether it's in force (her trust high), and tonight's
   * count of jobs run with her that ended this story day (her own clients' jobs don't count). Null with no deal.
   */
  arrangementNow(player = this.host.pid): { a: Arrangement; active: boolean; done: number } | null {
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
      .map((s) => ({ day: s.run.endDay ?? -1, end: s.run.setup?.endAt ?? -1, tier: tierOf(s.run) }))
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
  commsNow(player = this.host.pid): CommsState | null {
    return parseComms(this.deps.db.getMeta(commsKey(player)));
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
  clientsLineFor(): string | null {
    const qs = this.deps.quests;
    const ctx = qs?.ctx(this.host.pid) ?? null;
    if (!qs || !ctx) return null;
    if (this.questHere(this.host.pid)) return null;
    const own = this.openJobs(this.host.pid, qs.book(), ctx).filter((q) => ownedBy(q) === qs.contact);
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
  jobLineFor(): string | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    const arc = qs.status(this.host.pid).find((s) => s.contact === qs.contact && !s.run.done && s.run.contract);
    const con = arc && qs.book().find((e) => e.id === bookId(arc.id));
    return arc?.run.contract && con ? contractBlock({ title: con.title, stage: arc.run.contract.stage, left: (arc.run.contract.wait?.from ?? 0) - (this.deps.clockNow?.() ?? 0), found: Object.keys(arc.run.contract.results), grade: (arc.run.flags.grade as Tier | undefined) ?? null }) : null;
  }

  /** Her [board] block: while a job runs here, what its file says and who knows it. A contract has her [job] block instead. */
  boardLineFor(player: string): string | null {
    const qs = this.deps.quests;
    if (!qs) return null;
    const s = qs.status(this.host.pid).find((x) => x.contact === qs.contact && !x.run.done && !x.run.contract);
    const file = s && qs.book().find((e) => e.id === bookId(s.id));
    const q = file && this.asRun(file, s.run);
    // `kind`, not `run.contract`: a contract's run has none until its offer ends.
    return q && q.kind === 'mission' && (q.postedBy || q.brief) ? boardBlock({ title: q.title, postedBy: q.postedBy ?? null, brief: q.brief ?? null, player, knows: ownedBy(q) === qs.contact ? 'own' : q.knownBy?.includes(qs.contact) ? 'heard' : null }) : null;
  }
}
