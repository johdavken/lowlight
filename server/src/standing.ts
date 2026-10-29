/**
 * Standing on the server (spec 2026-10-13): the shared words file, and her standing on a player as
 * her database holds it (a story meta key, so the write log rewinds it).
 */
import fs from 'node:fs';
import {
  applyMove,
  DEFAULT_SHARED_STANDING,
  parseSharedStanding,
  parseStored,
  standingKey,
  wordFor,
  type SharedStanding,
  type StandingConfig,
  type StandingMove,
  type StandingValues,
  type StoredStanding,
} from '../../shared/standing';
import type { Db } from './db';

/** `world/standing.json`, read again only when it changes on disk. Missing: the defaults, quietly; bad: the defaults for what's bad, with a warning. */
export function sharedStandingReader(file: string, warn: (m: string) => void): () => SharedStanding {
  let cache: { stamp: string; value: SharedStanding } | null = null;
  return () => {
    let stamp = 'none';
    try {
      const st = fs.statSync(file);
      stamp = `${st.mtimeMs}:${st.size}`;
    } catch {
      // No file: the defaults.
    }
    if (cache && cache.stamp === stamp) return cache.value;
    let value = DEFAULT_SHARED_STANDING;
    if (stamp !== 'none') {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        warn(`standing.json: ${err instanceof Error ? err.message : String(err)}; using the defaults`);
        raw = undefined;
      }
      if (raw !== undefined) {
        // One warning per read of the file, however many entries are bad.
        const bad: string[] = [];
        value = parseSharedStanding(raw, (m) => bad.push(m));
        if (bad.length > 0) warn(bad.length === 1 ? bad[0] : `${bad[0]} (and ${bad.length - 1} more)`);
      }
    }
    cache = { stamp, value };
    return value;
  };
}

/** Her standing on `player` now: what her database holds, else the start. */
export interface StandingNow {
  values: StandingValues;
  stored: StoredStanding | null;
  word: string;
}

/**
 * Her stored standing on `player`: now, or (with `before`) as the write log had it before reply
 * `before`'s writes — what a regenerate of that reply is prompted from, since its old take's move
 * is still in the table until the new take opens.
 */
export function storedStanding(db: Pick<Db, 'getMeta' | 'writes'>, player: string, before: string | null): StoredStanding | null {
  const key = standingKey(player);
  if (before === null) return parseStored(db.getMeta(key));
  const writes = db.writes().filter((w) => w.kind === 'meta' && w.key === key);
  // The reply moved nothing: what's stored now is what it was prompted from.
  const first = writes.find((w) => w.messageId === before);
  if (!first) return parseStored(db.getMeta(key));
  return parseStored(writes.filter((w) => w.seq < first.seq).at(-1)?.value ?? null);
}

export function currentStanding(db: Pick<Db, 'getMeta'>, player: string, start: StandingValues, cfg: StandingConfig | null, shared: SharedStanding): StandingNow {
  const stored = parseStored(db.getMeta(standingKey(player)));
  return nowOf(stored, start, cfg, shared);
}

/** Her standing from what's stored (null: the start). */
export function nowOf(stored: StoredStanding | null, start: StandingValues, cfg: StandingConfig | null, shared: SharedStanding): StandingNow {
  const values = stored ? { trust: stored.trust, warmth: stored.warmth } : start;
  return { values, stored, word: wordFor(values, cfg, shared) };
}

/** One move, written as story meta (the write log stamps it to the reply being written): her word before and after. */
export function moveStanding(
  db: Pick<Db, 'getMeta' | 'setMeta'>,
  player: string,
  start: StandingValues,
  cfg: StandingConfig | null,
  shared: SharedStanding,
  move: StandingMove,
): { before: string; after: string } {
  const now = currentStanding(db, player, start, cfg, shared);
  const next = applyMove(now.stored, start, move);
  db.setMeta(standingKey(player), JSON.stringify(next));
  return { before: now.word, after: wordFor(next, cfg, shared) };
}

/** What the shift_standing tool reaches (ToolContext.standing). */
export interface StandingControl {
  /** Whether standing applies to this turn: a playthrough, its player, in character. */
  applies(): boolean;
  /** The player standing moves for (the running turn's). */
  player(): string;
  /**
   * One move for the turn's player, belonging to reply `messageId` and the take the write log is
   * stamping now; 'already' when that take moved already, 'off' when standing no longer applies.
   */
  move(m: { trust: number; warmth: number; reason: string }, messageId: string): { before: string; after: string } | 'already' | 'off';
  /** Her replies to the turn's player since the last move, up to and including `messageId`; null when nothing moved before it. */
  repliesSinceMove(messageId: string): number | null;
}

/** Her standing control: her database, the turn's player, where it starts (null: doesn't apply), her block and the shared words. */
export function standingControl(o: {
  db: Pick<Db, 'getMeta' | 'setMeta' | 'stamp' | 'allMessages'>;
  player: () => string;
  start: (player: string) => StandingValues | null;
  config: () => StandingConfig | null;
  shared: () => SharedStanding;
  now?: () => number;
  /** False on an out-of-character turn (default: always in character). */
  inCharacter?: () => boolean;
}): StandingControl {
  return {
    applies: () => (o.inCharacter?.() ?? true) && o.start(o.player()) !== null,
    player: o.player,
    move(m, messageId) {
      const player = o.player();
      const start = o.start(player);
      if (start === null) return 'off';
      // The write log's take, so keep going counts as the same take and a regenerate as a new one.
      const take = o.db.stamp().take ?? 0;
      const cfg = o.config();
      const shared = o.shared();
      const { stored } = currentStanding(o.db, player, start, cfg, shared);
      if (stored?.moves.some((x) => x.messageId === messageId && x.take === take)) return 'already';
      // A job's trust counts once: her reply to the row that moved it leaves trust alone.
      const all = o.db.allMessages(player);
      const at = all.findIndex((x) => x.id === messageId);
      const answered = at > 0 ? all[at - 1].id : null;
      const trust = answered && stored?.moves.some((x) => x.job && x.messageId === answered) ? 0 : m.trust;
      if (trust === 0 && m.warmth === 0) return 'already';
      return moveStanding(o.db, player, start, cfg, shared, { ...m, trust, at: (o.now ?? Date.now)(), messageId, take });
    },
    repliesSinceMove(messageId) {
      const player = o.player();
      // A new take of the reply that moved isn't held back by its own old move.
      // A job's move (Intake board spec §2) neither counts nor resets the pace.
      const last = parseStored(o.db.getMeta(standingKey(player)))?.moves.filter((x) => x.messageId !== messageId && !x.job).at(-1);
      if (!last) return null;
      const replies = o.db.allMessages(player).filter((x) => x.role === 'agent').map((x) => x.id);
      const from = replies.indexOf(last.messageId);
      const to = replies.indexOf(messageId);
      // The moved reply is gone (cut or deleted): nothing to wait for.
      if (from === -1 || to === -1) return null;
      return to - from;
    },
  };
}

/** A job's trust stake (Intake board spec §2): her word before and after a move, and the move itself. */
export interface TrustControl {
  /** Her word on `player` now and after `delta` (nothing written); null when standing doesn't apply. */
  preview(player: string, delta: number): { name: string; before: string; after: string; moved: number } | null;
  /** The move, as story meta (the write log stamps it to the row being written). */
  move(player: string, delta: number, reason: string, messageId: string): void;
  /** Her trust on `player` now (stored, else the start); null when standing doesn't apply. */
  now(player: string): number | null;
}

export function trustControl(o: {
  db: Pick<Db, 'getMeta' | 'setMeta'> & Partial<Pick<Db, 'stamp'>>;
  name: string;
  start: (player: string) => StandingValues | null;
  config: () => StandingConfig | null;
  shared: () => SharedStanding;
  now?: () => number;
}): TrustControl {
  return {
    preview(player, delta) {
      const start = o.start(player);
      if (start === null) return null;
      const now = currentStanding(o.db, player, start, o.config(), o.shared());
      const next = applyMove(now.stored, start, { trust: delta, warmth: 0, reason: '', at: 0, messageId: '', take: 0 });
      return { name: o.name, before: now.word, after: wordFor(next, o.config(), o.shared()), moved: next.trust - now.values.trust };
    },
    now(player) {
      const start = o.start(player);
      return start === null ? null : currentStanding(o.db, player, start, o.config(), o.shared()).values.trust;
    },
    move(player, delta, reason, messageId) {
      const start = o.start(player);
      if (start === null || delta === 0) return;
      const take = o.db.stamp?.().take ?? 0;
      moveStanding(o.db, player, start, o.config(), o.shared(), { trust: delta, warmth: 0, reason, at: (o.now ?? Date.now)(), messageId, take, job: true });
    },
  };
}
