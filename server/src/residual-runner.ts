/**
 * When the Residual runs (spec §2): after each reply, one run at a time per character, a turn waiting
 * for it at most RESIDUAL_WAIT_MS, aborted when the take it reads is replaced. Every run is recorded in
 * `scribe_runs` and gets one dev-log line.
 */
import { photoForModel } from '../../shared/photos';
import { appendFileSync } from 'node:fs';
import type { ChatMessage, ResidualRunInfo } from '../../shared/types';
import { RESIDUAL_RUNS_KEPT, type Db } from './db';
import { HISTORY_WINDOW, toCompletion } from './history';
import type { Journal } from './journal';
import type { Result } from './room-state';
import { applyResidual, parseResidualAnswer, residualMessages, type ResidualKind } from './residual';
import { parsePlan, planKey, planOver, planSeenKey, type Plan } from '../../shared/plan';
import { parsePromise, promiseKey, promiseSpentKey, promiseTriesKey, type TextPromise } from '../../shared/promise';
import { hhmmOf, minuteOfDay } from '../../shared/clock';
import { readSummary, summaryDue, summaryMessages, writeSummary } from './summary';
import type { StandingControl } from './standing';
import type { CompletionMessage } from './turn';
import { CIPHER, cipherDue, cipherKey, parseCipherEvents, storyProse, type CipherEvent, type CipherState } from '../../shared/cipher';
import { CIPHER_MAX_TOKENS, cipherRunMessages, parseCipherAnswer, type CipherRunInput } from './cipher-run';

export { RESIDUAL_RUNS_KEPT };
/** How long a new turn waits for the last reply's residual before going ahead without it. */
export const RESIDUAL_WAIT_MS = 8000;
/** At most this many exchanges per run; an older backlog is skipped (and logged). */
export const RESIDUAL_BACKLOG = 6;
export const RESIDUAL_MAX_TOKENS = { turn: 600, end: 1800 } as const;
/**
 * The summary's answer. GLM writes nearly twice SUMMARY_MAX (about 2,900 characters, ~700 tokens) whatever
 * the prompt asks, and 700 failed 10 turns running on 2026-10-20; writeSummary trims to SUMMARY_MAX.
 */
export const SUMMARY_MAX_TOKENS = 1200;
/** Low: it's extraction, not story. */
export const RESIDUAL_TEMPERATURE = 0.2;
/** A call that hasn't answered by now has failed (one that never settles would hold every later run). */
export const RESIDUAL_TIMEOUT_MS = 60_000;

export interface ResidualRunnerDeps {
  /** A sent photo's caption by id (photos spec §4): her texts read as what she sent, never the marker. Absent: none. */
  photoCaption?: (id: string) => string | null;
  db: Db;
  journal: Journal;
  selfName: string;
  selfPronoun: string;
  playerName: (id: string) => string;
  /** Her room now: the `[room: …]` line. */
  roomLine: () => string;
  /** Her standing control fixed to `player`; null when standing doesn't apply. */
  standing: (player: string) => StandingControl | null;
  /** Her standing with `player` in words and numbers; null when it doesn't apply. */
  standingLine: (player: string) => string | null;
  setLight: (player: string, id: string, intensity: number) => Result;
  complete: (messages: CompletionMessage[], o: { maxTokens: number; signal: AbortSignal }) => Promise<{ text: string; tokensIn?: number; tokensOut?: number }>;
  /** One dev-log line. */
  log: (line: string) => void;
  /** Wraps the writes for `player`'s reply `messageId`, so what they show (tool lines) lands on that reply. Default: just runs them. */
  around?: <T>(player: string, messageId: string, fn: () => T) => T;
  /** Her standing word for `player` changed: the shift line ("Nix · now: warm"). */
  standingShifted?: (player: string, word: string) => void;
  /** Time backstop (spec 2026-10-20): moves `player`'s finished reply on by `minutes` (the relay's residualPass). Absent: time doesn't apply. */
  passTime?: (player: string, reply: { id: string; take: number }, minutes: number) => Result;
  /**
   * Her plans (spec 2026-10-21 §4): the places she can name for `player`'s reply, and who hears a new one
   * (the card). Null: plans don't apply to this reply (OOC, comms, no story clock). Absent: never.
   */
  plan?: (player: string, reply: { id: string; take: number }) => { places: { id: string; name: string }[]; here?: string; onSet(plan: Plan | null, replyId: string): void } | null;
  /** Promised texts (spec 2026-10-23 §4): the places she can name for `player`'s reply. Null: not for this reply. Absent: never. */
  promise?: (player: string, reply: { id: string; take: number }) => { places: { id: string; name: string }[] } | null;
  /** Her schedule in words for the `[her day: …]` line (deck controls spec §1); null without one. */
  herDay?: () => string | null;
  /** The story clock now: a promised text's reply is read from now, not its past minute (deck controls spec §3.4). */
  storyClock?: () => number | null;
  /** The playthrough's Cipher for `player` (cipher spec §2.3); absent or null: Cipher doesn't apply. */
  cipher?: (player: string) => CipherState | null;
  /** Her room's scene now: where a clue was seen when the job didn't say. */
  sceneId?: () => string;
  /** Her character id: her truths are `<selfId>-<n>` (cipher spec §2.1). Default: her name, lowercased. */
  selfId?: string;
  /** Who a cipher run may give a truth to (World.cipherCast); absent: no cipher runs. */
  cipherCast?: (player: string) => CipherRunInput['cast'];
  /** The lore book's titles, for the cipher run. */
  loreTitles?: () => string[];
  now?: () => number;
}

/**
 * Whether the Residual may record a plan from `reply` (her plans spec §4): a stamped in-character reply, off comms —
 * and never her goodbye when she leaves, which would replace the plan she left on (final review I2).
 */
export function plansApply(reply: ChatMessage | undefined, line: ChatMessage | undefined, comms: boolean): boolean {
  // A text (deck spec §3) plans whatever line you're on: "roof. 4:15" is the point of texting.
  return reply?.clock !== undefined && line?.mode !== 'ooc' && line?.parting !== 'her' && (!comms || line?.mode === 'text');
}

/**
 * Whether the Residual may record a promise to text from `reply` (promised texts spec §4): a stamped in-character
 * reply — on comms too — but not her own goodbye as she leaves.
 */
export function promisesApply(reply: ChatMessage | undefined, line: ChatMessage | undefined): boolean {
  return reply?.clock !== undefined && line?.mode !== 'ooc' && line?.parting !== 'her';
}

/** A standing promise in words for the Residual's `[your promise: …]` line. */
function promiseWords(p: TextPromise, you: string, placeName: (id: string) => string): string {
  return 'at' in p.when ? `text ${you} at ${hhmmOf(minuteOfDay(p.when.at))}, ${p.about}` : `text ${you} when you're at ${placeName(p.when.place)}, ${p.about}`;
}

/** A standing plan in words for the Residual's `[her plan: …]` line. */
function planWords(p: Plan, name: (id: string) => string): string {
  const hm = (m: number) => hhmmOf(minuteOfDay(m));
  return [p.going ? `going ${name(p.going.place)} until ${hm(p.going.until)}` : null, p.meet ? `meeting at ${name(p.meet.place)} ${hm(p.meet.at)}` : null].filter(Boolean).join('; ');
}

interface Job {
  player: string;
  reply: { id: string; take: number };
  kind: ResidualKind;
  /** Her room's scene when the reply ended (final review M5): a walk in a later turn isn't "here". */
  here?: string;
}

/** The Residual's old name (the scribe), kept for saves. */
const throughKey = (player: string) => `scribe.${player}.through`;
/** Her tool lines that change the room's light (tool-line.ts). */
const ROOM_LIGHT_LINE = /^\/\/ (SET_LIGHT|APPLY_MOOD|SET_AMBIENT)\b/;

/** `npm run chat-stress` sets NIX_TOOL_TRACE (as for her calls): each write as `residual:<kind>`, then the run's end as `residual`. */
function trace(name: string, args: string, out: string): void {
  const file = process.env.NIX_TOOL_TRACE;
  if (file) appendFileSync(file, `${JSON.stringify({ at: Date.now(), self: null, name, args, out })}\n`);
}

/** Short reasons for the dev line: what kind of thing was refused. */
function shortReason(r: string): string {
  if (/pins full/.test(r)) return 'pin cap';
  if (/no such note/.test(r)) return 'unknown id';
  if (/^standing/.test(r)) return 'standing';
  if (/^light/.test(r)) return 'light';
  if (/^time/.test(r)) return 'time';
  if (/^cipher/.test(r)) return 'cipher';
  if (/ignored: not an end turn/.test(r)) return 'end only';
  if (/^(notes|lights|standing|recap|dossier|answer)\b/.test(r)) return 'shape';
  return 'other';
}

export class ResidualRunner {
  private running: {
    job: Job;
    abort: AbortController;
    done: Promise<void>;
  } | null = null;
  /** Her replies when a player's cipher call last failed (minor 1): it waits CIPHER.retryGap, not a call every reply. */
  private cipherFailed = new Map<string, number>();
  /** Waiting jobs, one per player, oldest first. */
  private pending = new Map<string, Job>();
  private idle: Promise<void> = Promise.resolve();
  private settle: () => void = () => {};
  /** Open while a Residual call runs or waits (not the summary after it): what a new turn waits for. */
  private writing: Promise<void> = Promise.resolve();
  private settleWriting: () => void = () => {};
  private writingOpen = false;

  private openWriting(): void {
    if (this.writingOpen) return;
    this.writingOpen = true;
    this.writing = new Promise((res) => (this.settleWriting = res));
  }

  private closeWriting(): void {
    if (!this.writingOpen) return;
    this.writingOpen = false;
    this.settleWriting();
  }

  constructor(private readonly d: ResidualRunnerDeps) {}

  private now(): number {
    return (this.d.now ?? Date.now)();
  }

  /** Starts the Residual on `reply` (fire and forget); while one runs, the newest request waits its turn. */
  afterTurn(player: string, reply: { id: string; take: number }, kind: ResidualKind, here?: string): void {
    const job: Job = { player, reply: { ...reply }, kind, ...(here ? { here } : {}) };
    this.openWriting();
    if (this.running) {
      // One waiting job per player covers everything up to its reply; an end stays an end (its recap and dossier).
      const waiting = this.pending.get(player);
      if (waiting?.kind === 'end') job.kind = 'end';
      this.pending.set(player, job);
      return;
    }
    this.idle = new Promise((res) => (this.settle = res));
    this.start(job);
  }

  /**
   * Resolves once no residual call runs or waits, or after `ms`, whichever comes first. A summary still
   * running after it doesn't count: the next turn doesn't need it (its line is still sent).
   */
  async wait(ms = RESIDUAL_WAIT_MS): Promise<void> {
    if (!this.running) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.writing, new Promise<void>((res) => (timer = setTimeout(res, ms)))]);
    clearTimeout(timer);
  }

  /** Resolves once nothing runs or waits at all, summaries included (tests, shutdown). */
  async waitAll(): Promise<void> {
    if (!this.running) return;
    await this.idle;
  }

  /** The take of `messageId` is being replaced (regenerate, swipe, delete): a run reading it stops, a late answer is dropped. */
  takeReplaced(messageId: string): void {
    for (const [player, job] of this.pending) if (job.reply.id === messageId) this.pending.delete(player);
    if (this.running?.job.reply.id === messageId) this.running.abort.abort();
  }

  /** `messageId`'s take `keep` became its only take (take 0): a job reading it follows; one reading another take stops. */
  takesCollapsed(messageId: string, keep: number): void {
    for (const [player, job] of this.pending) {
      if (job.reply.id !== messageId) continue;
      if (job.reply.take === keep) job.reply.take = 0;
      else this.pending.delete(player);
    }
    const run = this.running?.job;
    if (run?.reply.id !== messageId) return;
    if (run.reply.take === keep) run.reply.take = 0;
    else this.running!.abort.abort();
  }

  /** Rewind or a branch: stop everything. */
  abortAll(): void {
    this.pending.clear();
    this.running?.abort.abort();
  }

  private start(job: Job): void {
    const abort = new AbortController();
    const done = this.run(job, abort.signal)
      .then(() => {
        if (this.pending.size === 0) this.closeWriting();
      })
      .then(() => this.summarize(job, abort.signal))
      .then(() => this.cipherRun(job, abort.signal))
      // A database closed under it (a load or a branch switched playthroughs) ends the run; nothing to record it in.
      .catch((err: unknown) => this.d.log(`residual · failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        this.running = null;
        const next = this.pending.values().next().value;
        if (next) this.pending.delete(next.player);
        if (next) this.start(next);
        else {
          this.closeWriting();
          this.settle();
        }
      });
    this.running = { job, abort, done };
  }

  private readonly caption = (id: string): string | null => this.d.photoCaption?.(id) ?? null;

  /** The exchanges since the last covered reply, up to and including `reply` (a re-read of the same reply re-reads it). */
  private exchanges(job: Job): { lines: { speaker: string; text: string }[]; skipped: number } | null {
    // A promised text's hidden line isn't something either of them said (promised texts spec §5).
    const all = this.d.db.allMessages(job.player).filter((m) => m.mode !== 'ooc' && !m.promised);
    const end = all.findIndex((m) => m.id === job.reply.id);
    if (end < 0) return null;
    const raw = this.d.db.getMeta(throughKey(job.player));
    const through = raw === null ? null : (JSON.parse(raw) as { id: string });
    let start = 0;
    if (through) {
      const at = all.findIndex((m) => m.id === through.id);
      if (at === end) {
        // Keep going on the reply it already read: read it again, with the line it answered.
        start = end;
        while (start > 0 && all[start].role !== 'user') start--;
      } else if (at >= 0 && at < end) start = at + 1;
    }
    let slice: ChatMessage[] = all.slice(start, end + 1);
    const replies = slice.map((m, i) => (m.role === 'agent' ? i : -1)).filter((i) => i >= 0);
    let skipped = 0;
    if (replies.length > RESIDUAL_BACKLOG) {
      skipped = replies.length - RESIDUAL_BACKLOG;
      slice = slice.slice(replies[skipped - 1] + 1);
    }
    const lines = slice
      .map((m) => ({ m, c: toCompletion(m) }))
      .filter((x): x is { m: ChatMessage; c: CompletionMessage } => x.c !== null)
      .map(({ m, c }) => ({
        // An event card isn't the player's line (cipher spec §2.7): the narrator wrote it.
        speaker: m.mode === 'encounter' ? 'Narrator' : m.role === 'user' ? this.d.playerName(job.player) : this.d.selfName,
        // Texts (deck spec §3) read as texts: what was typed, not what happened in a room.
        text: m.mode === 'text' ? `(by text) ${m.role === 'agent' ? photoForModel(c.content, this.caption) : c.content}` : c.content,
      }));
    return { lines, skipped };
  }

  /** One call on her model, failed after RESIDUAL_TIMEOUT_MS even when the call ignores its abort. */
  private async call(messages: CompletionMessage[], maxTokens: number, signal: AbortSignal): Promise<{ text: string; tokensIn?: number; tokensOut?: number }> {
    const timeout = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.d.complete(messages, { maxTokens, signal: AbortSignal.any([signal, timeout.signal]) }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timeout.abort();
            reject(new Error('timeout'));
          }, RESIDUAL_TIMEOUT_MS);
          // An abort ends the wait too, even when the call ignores it.
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The rolling summary (spec §6): when the next turn would drop lines the summary doesn't cover, fold them in. */
  private async summarize(job: Job, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const { db } = this.d;
    const old = readSummary(db, job.player);
    // The relay's window, so the summary's steps land where the turn's history jumps (final review I3).
    // A promised text's hidden line isn't something either of them said (mid review I2).
    const due = summaryDue(db.recentMessages(job.player, HISTORY_WINDOW).filter((m) => !m.promised), old?.through ?? null);
    if (due.length === 0) return;
    const t0 = this.now();
    const row: ResidualRunInfo = {
      at: Date.now(),
      kind: 'summary',
      player: job.player,
      messageId: job.reply.id,
      take: job.reply.take,
      ms: 0,
      tokensIn: null,
      tokensOut: null,
      raw: null,
      applied: [],
      refused: [],
      error: null,
    };
    const finish = (line: string) => {
      row.ms = this.now() - t0;
      db.insertResidualRun(row);
      const devLine = `${line} · ${(row.ms / 1000).toFixed(1)} s`;
      trace('residual:summary-run', '', devLine);
      this.d.log(devLine);
    };
    const read = due.map((m) => (m.mode === 'text' && m.role === 'agent' ? { ...m, text: photoForModel(m.text, this.caption) } : m));
    const messages = summaryMessages(old?.text ?? null, read, { self: this.d.selfName, player: this.d.playerName(job.player) });
    let answer: { text: string; tokensIn?: number; tokensOut?: number };
    try {
      answer = await this.call(messages, SUMMARY_MAX_TOKENS, signal);
    } catch (err) {
      row.error = signal.aborted ? 'dropped: take replaced' : `call failed: ${err instanceof Error ? err.message : String(err)}`;
      return finish(`residual · summary ${row.error}`);
    }
    row.raw = answer.text;
    row.tokensIn = answer.tokensIn ?? null;
    row.tokensOut = answer.tokensOut ?? null;
    if (signal.aborted || !db.getMessage(job.player, job.reply.id)) {
      row.error = 'dropped: take replaced';
      return finish(`residual · summary ${row.error}`);
    }
    const text = answer.text.trim();
    if (text === '') {
      row.error = 'answer: empty';
      return finish('residual · summary failed: answer: empty');
    }
    db.withStamp({ messageId: job.reply.id, take: job.reply.take }, () => writeSummary(db, job.player, { text, through: due.at(-1)!.id }));
    row.applied = [`summary saved (${due.length} lines)`];
    finish(`residual · summary · ${due.length} lines`);
  }

  /** The cipher run (cipher spec §2.2): when the Cipher is due, choose truths and write those that pass under the reply. */
  private async cipherRun(job: Job, signal: AbortSignal): Promise<void> {
    if (signal.aborted || !this.d.cipher || !this.d.cipherCast) return;
    const state = this.d.cipher(job.player);
    if (!state || !cipherDue(state)) return;
    const failed = this.cipherFailed.get(job.player);
    if (failed !== undefined && state.replies - failed < CIPHER.retryGap) return;
    const { db } = this.d;
    const t0 = this.now();
    const row: ResidualRunInfo = { at: Date.now(), kind: 'cipher', player: job.player, messageId: job.reply.id, take: job.reply.take, ms: 0, tokensIn: null, tokensOut: null, raw: null, applied: [], refused: [], error: null };
    const finish = (line: string) => {
      row.ms = this.now() - t0;
      db.insertResidualRun(row);
      const devLine = `${line} · ${(row.ms / 1000).toFixed(1)} s`;
      trace('residual:cipher-run', '', devLine);
      this.d.log(devLine);
    };
    const you = this.d.playerName(job.player);
    const recent = db
      .allMessages(job.player)
      .filter((m) => m.mode !== 'ooc' && !m.promised && m.text.trim() !== '')
      .slice(-24)
      .map((m) => ({ speaker: m.mode === 'encounter' ? 'Narrator' : m.role === 'user' ? you : this.d.selfName, text: m.text }));
    const input: CipherRunInput = {
      player: { id: job.player, name: you },
      cast: this.d.cipherCast(job.player),
      lore: this.d.loreTitles?.() ?? [],
      summary: readSummary(db, job.player)?.text ?? null,
      recent,
      state,
      room: CIPHER.openMax - state.truths.filter((x) => x.state === 'open').length,
    };
    let answer: { text: string; tokensIn?: number; tokensOut?: number };
    try {
      answer = await this.call(cipherRunMessages(input), CIPHER_MAX_TOKENS, signal);
    } catch (err) {
      row.error = signal.aborted ? 'dropped: take replaced' : `call failed: ${err instanceof Error ? err.message : String(err)}`;
      if (!signal.aborted) this.cipherFailed.set(job.player, state.replies);
      return finish(`residual · cipher ${row.error}`);
    }
    this.cipherFailed.delete(job.player);
    row.raw = answer.text;
    row.tokensIn = answer.tokensIn ?? null;
    row.tokensOut = answer.tokensOut ?? null;
    if (signal.aborted || !db.getMessage(job.player, job.reply.id)) {
      row.error = 'dropped: take replaced';
      return finish(`residual · cipher ${row.error}`);
    }
    const parsed = parseCipherAnswer(answer.text, input);
    row.refused = parsed.refused;
    const key = cipherKey(job.player);
    const self = this.d.selfId ?? this.d.selfName.toLowerCase();
    db.withStamp({ messageId: job.reply.id, take: job.reply.take }, () => {
      const evs = parseCipherEvents(db.getMeta(key));
      // Even a run that wrote nothing waits refillGap (spec §2.2).
      const out: CipherEvent[] = [...evs, { t: 'run', replies: state.replies, seq: Date.now() }];
      // Named for the take it was written on (final review 1): another take's truth never shares its id, so a swipe
      // back can't hand this one a learned event written for that one.
      let n = 0;
      for (const tr of parsed.truths) {
        const id = `${self}-${job.reply.id}.${job.reply.take}-${++n}`;
        out.push({ t: 'truth', id, ...tr, seq: Date.now() });
        row.applied.push(`truth ${id} (${tr.kind})`);
      }
      db.setMeta(key, JSON.stringify(out));
    });
    const kinds = parsed.truths.map((x) => x.kind).join(', ');
    const parts = ['residual · cipher', `${parsed.truths.length} ${parsed.truths.length === 1 ? 'truth' : 'truths'}${kinds ? ` (${kinds})` : ''}`];
    if (row.refused.length > 0) parts.push(`${row.refused.length} refused`);
    finish(parts.join(' · '));
  }

  private async run(job: Job, signal: AbortSignal): Promise<void> {
    const t0 = this.now();
    const row: ResidualRunInfo = {
      at: Date.now(),
      kind: job.kind,
      player: job.player,
      messageId: job.reply.id,
      take: job.reply.take,
      ms: 0,
      tokensIn: null,
      tokensOut: null,
      raw: null,
      applied: [],
      refused: [],
      error: null,
    };
    const finish = (line: string) => {
      row.ms = this.now() - t0;
      this.d.db.insertResidualRun(row);
      const devLine = `${line} · ${(row.ms / 1000).toFixed(1)} s`;
      trace('residual', '', devLine);
      this.d.log(devLine);
    };
    const ex = this.exchanges(job);
    if (!ex || ex.lines.length === 0) {
      // chat-stress waits for a run's end line, so a run with nothing to read still says so.
      trace('residual', '', 'residual · nothing to read');
      return;
    }
    if (ex.skipped > 0) this.d.log(`residual · backlog: ${ex.skipped} exchanges skipped`);
    const { journal, db } = this.d;
    const read = db.getMessage(job.player, job.reply.id);
    const asked = read?.replyTo ? db.getMessage(job.player, read.replyTo) : undefined;
    const now = asked?.promised ? (this.d.storyClock?.() ?? null) : null;
    const clock = read?.clock !== undefined ? Math.max(read.clock, now ?? read.clock) : null;
    const planned = this.d.plan?.(job.player, job.reply) ?? null;
    const stored = planned ? parsePlan(db.getMeta(planKey(job.player))) : null;
    // An ended plan isn't hers any more (final review I3): it would invite a cancel, or read as current.
    const standingPlan = stored && clock !== null && !planOver(stored, clock) ? stored : null;
    const promising = this.d.promise?.(job.player, job.reply) ?? null;
    const standingPromise = promising ? parsePromise(db.getMeta(promiseKey(job.player))) : null;
    // Plans name map places; promises also the rooms of her day (her home is often off the map): both lists, once.
    const places = planned || promising ? [...(planned?.places ?? []), ...(promising?.places ?? []).filter((p) => !planned?.places.some((q) => q.id === p.id))] : undefined;
    const placeName = (id: string) => places?.find((p) => p.id === id)?.name ?? id;
    // Cipher (spec §2.3): the open truths as T1…, mapped back to their ids when the answer names them.
    const cipher = this.d.cipher?.(job.player) ?? null;
    const openTruths = cipher?.truths.filter((t) => t.state === 'open') ?? [];
    const labels = new Map(openTruths.map((t, i) => [`T${i + 1}`, t.id]));
    const messages = residualMessages({
      kind: job.kind,
      self: { name: this.d.selfName, pronoun: this.d.selfPronoun },
      player: { id: job.player, name: this.d.playerName(job.player) },
      roomLine: this.d.roomLine(),
      clock,
      standing: this.d.standingLine(job.player),
      notes: journal.notes(job.player),
      exchanges: ex.lines,
      recap: journal.recap(job.player).text,
      page: journal.page(job.player).text,
      ...(planned ? { places: places!, planLine: standingPlan ? planWords(standingPlan, placeName) : null } : {}),
      ...(promising
        ? {
            places: places!,
            ...(planned ? {} : { noPlans: true }),
            promises: true,
            promiseLine: standingPromise ? promiseWords(standingPromise, this.d.playerName(job.player), placeName) : null,
            herDay: this.d.herDay?.() ?? null,
          }
        : {}),
      ...(openTruths.length > 0 ? { cipher: openTruths.map((t, i) => ({ label: `T${i + 1}`, truth: t.truth, comesOutWhen: t.comesOutWhen })) } : {}),
    });
    let answer: { text: string; tokensIn?: number; tokensOut?: number };
    try {
      answer = await this.call(messages, RESIDUAL_MAX_TOKENS[job.kind], signal);
    } catch (err) {
      row.error = signal.aborted ? 'dropped: take replaced' : `call failed: ${err instanceof Error ? err.message : String(err)}`;
      return finish(`residual · ${row.error}`);
    }
    row.raw = answer.text;
    row.tokensIn = answer.tokensIn ?? null;
    row.tokensOut = answer.tokensOut ?? null;
    // Replaced while it was out (the reply gone, or another take shown): its writes would land on a take nobody sees.
    row.take = job.reply.take;
    const shown = db.getTakes(job.player, job.reply.id)?.index ?? 0;
    if (signal.aborted || !db.getMessage(job.player, job.reply.id) || shown !== job.reply.take) {
      row.error = 'dropped: take replaced';
      return finish(`residual · ${row.error}`);
    }
    const parsed = parseResidualAnswer(answer.text);
    row.refused.push(...parsed.refused);
    if (!parsed.answer) {
      row.error = parsed.refused[0] ?? 'answer: empty';
      return finish(`residual · failed: ${row.error}`);
    }
    // Her own light change this turn stands: the Residual only backstops a change she wrote but didn't make (hand-check 2026-10-16).
    const herLights = (db.getMessage(job.player, job.reply.id)?.toolLines ?? []).some((l) => ROOM_LIGHT_LINE.test(l));
    let answered = herLights ? { ...parsed.answer, lights: [] } : parsed.answer;
    if (herLights) for (const l of parsed.answer.lights) row.refused.push(`light ${l.id} refused: she changed the lights herself this turn`);
    // Her own pass_time stands the same way: her reply past its line means she skipped it herself (chat-stress 2026-10-20).
    const reply = db.getMessage(job.player, job.reply.id);
    const line = reply?.replyTo ? db.getMessage(job.player, reply.replyTo) : undefined;
    if (answered.time && clock !== null && line?.clock !== undefined && clock > line.clock) {
      answered = { ...answered, time: null };
      row.refused.push('time ignored: she passed time herself this turn');
    }
    // A text (deck spec §4): she isn't in the room you're in, and texts take no story time.
    if (line?.mode === 'text') {
      if (answered.lights.length > 0) row.refused.push('lights ignored: a text');
      if (answered.time) row.refused.push('time ignored: a text');
      answered = { ...answered, lights: [], time: null };
    }
    const around = this.d.around ?? (<T>(_p: string, _m: string, fn: () => T) => fn());
    const result = around(job.player, job.reply.id, () => {
      const r = applyResidual(
        {
          journal,
          player: job.player,
          standing: this.d.standing(job.player),
          setLight: (id, i) => this.d.setLight(job.player, id, i),
          db,
          standingShifted: (word) => this.d.standingShifted?.(job.player, word),
          ...(this.d.passTime ? { passTime: (m: number) => this.d.passTime!(job.player, job.reply, m) } : {}),
          ...(planned
            ? {
                plan: {
                  places: new Set(planned.places.map((p) => p.id)),
                  ...((job.here ?? planned.here) ? { here: job.here ?? planned.here } : {}),
                  set: (p: Plan | null) => {
                    if (p) db.setMeta(planKey(job.player), JSON.stringify(p));
                    else db.deleteMeta(planKey(job.player));
                    // The old plan's marks go with it (final review M2).
                    db.deleteMeta(planSeenKey(job.player));
                    planned.onSet(p, job.reply.id);
                  },
                },
              }
            : {}),
          ...(promising
            ? {
                promise: {
                  places: new Set(promising.places.map((p) => p.id)),
                  set: (p: TextPromise | null) => {
                    if (p) db.setMeta(promiseKey(job.player), JSON.stringify(p));
                    else db.deleteMeta(promiseKey(job.player));
                    // A new promise gets its own tries (promised texts spec §5), and isn't spent (final review I1:
                    // her reply re-taken after its text was cut keeps its id).
                    db.deleteMeta(promiseTriesKey(job.player));
                    db.deleteMeta(promiseSpentKey(job.player));
                  },
                },
              }
            : {}),
          names: [this.d.selfName, this.d.playerName(job.player)],
          ...(cipher
            ? {
                cipher: {
                  labels,
                  open: new Set(openTruths.map((t) => t.id)),
                  // The page is what she and the narrator wrote, not the player's own line.
                  prose: storyProse(ex.lines.filter((l) => l.speaker !== this.d.playerName(job.player)).map((l) => l.text).join('\n')),
                  place: job.here ?? this.d.sceneId?.() ?? '',
                  clock: clock ?? 0,
                  append: (e: CipherEvent) => db.setMeta(cipherKey(job.player), JSON.stringify([...parseCipherEvents(db.getMeta(cipherKey(job.player))), e])),
                },
              }
            : {}),
        },
        answered,
        { messageId: job.reply.id, take: job.reply.take, kind: job.kind, clock },
      );
      db.withStamp({ messageId: job.reply.id, take: job.reply.take }, () => db.setMeta(throughKey(job.player), JSON.stringify(job.reply)));
      return r;
    });
    row.applied = result.applied;
    for (const a of result.applied) trace(`residual:${a.split(' ')[0]}`, a, 'ok');
    row.refused.push(...result.refused);
    const notes = result.applied.filter((a) => a.startsWith('note ')).length;
    const standing = result.applied.find((a) => a.startsWith('standing '));
    const lights = result.applied.filter((a) => a.startsWith('light ')).length;
    const parts = ['residual'];
    if (notes > 0) parts.push(`${notes} ${notes === 1 ? 'note' : 'notes'}`);
    if (standing)
      parts.push(
        standing
          .replace(/^standing /, '')
          .replace(/ ?\b(trust|warmth) [+-]?0\b/g, '')
          .trim(),
      );
    if (lights > 0) parts.push(`${lights} ${lights === 1 ? 'light' : 'lights'}`);
    const time = result.applied.find((a) => a.startsWith('time '));
    if (time) parts.push(time.split(' → ')[0]);
    const clues = result.applied.filter((a) => a.startsWith('clue ')).length;
    if (clues > 0) parts.push(`${clues} ${clues === 1 ? 'clue' : 'clues'}`);
    if (result.applied.some((a) => a.startsWith('learned '))) parts.push('learned');
    if (result.applied.includes('recap saved')) parts.push('recap');
    if (result.applied.includes('dossier saved')) parts.push('dossier');
    if (parts.length === 1) parts.push('nothing to write');
    if (row.refused.length > 0) parts.push(`${row.refused.length} refused (${[...new Set(row.refused.map(shortReason))].join(', ')})`);
    finish(parts.join(' · '));
  }
}
