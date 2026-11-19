/**
 * Off-screen moves (spec 2026-11-18 §1): on every clock move, a beat that's come due runs once: one quiet call for the
 * contacts who aren't with you, its kept moves written to playthrough.json. Nothing runs between clock moves.
 */
import { PROMISE_TRIES } from '../../shared/promise';
import { beatWindow, DEAD_BEATS, dueBeat, herWindow, keepMoves, pruneOld, type Move, type MoverCheck } from '../../shared/moves';
import { jsonOf } from './residual';
import type { CompletionMessage } from './turn';

export interface MoveBeatDeps {
  /** Up on every switch and LOAD (World.generation): a LOAD in place keeps the id. */
  generation(): number;
  /** Up on every REWIND (World.rewinds): a rewind during the call means the beat may go differently. */
  rewinds(): number;
  active(): { id: string; player: string; start: number; beat: number | null; moves: Move[]; parted: Record<string, number> } | null;
  now(): number | null;
  /** SYS → WORLD MOVES. */
  on(): boolean;
  /** Who could move: known, connected, not with you, not residents, not the one you play. */
  movers(): string[];
  messages(ids: string[], window: { from: number; to: number }): CompletionMessage[];
  /** Each mover's check; her window is clipped at her parting (herWindow). */
  checks(ids: string[], window: { from: number; to: number }): MoverCheck[];
  places(): Set<string>;
  /** Written quests' people and guests: never named. */
  fenced(): string[];
  /** The one call; resolves null when there's no key or model now. */
  call(messages: CompletionMessage[]): Promise<{ text: string; tokensIn: number | null; tokensOut: number | null } | null>;
  /** False when the playthrough isn't `ptId` or its beat isn't `read` any more. A REGEN dipping the clock doesn't refuse it (minor M1). */
  write(ptId: string, read: number | null, moves: Move[], beat: number): boolean;
  log(line: string): void;
  /** Move texts (spec §4.2): */
  withYou(id: string): boolean;
  awake(id: string, clock: number): boolean;
  /** She has a promise to text you still open: that's the text she owes. */
  promiseOpen(id: string): boolean;
  /** Her move text, through the deck's queue; true once sent. */
  fireText(id: string, o: { about: string; due: number }): Promise<boolean>;
  /** Patches her text effect on the move of `beat` (null drops the effect, the line stays). */
  markText(ptId: string, beat: number, who: string, patch: { tries?: number; sent?: true } | null): void;
}

export function createMoveBeat(deps: MoveBeatDeps): { check(): Promise<void> } {
  let running = false;
  let again = false;
  let dead = 0;
  // A text in flight: the next pass mustn't send it again.
  const sending = new Set<string>();

  async function pass(): Promise<void> {
    const pt = deps.active();
    const now = deps.now();
    if (!pt || now === null || dead >= DEAD_BEATS || !deps.on()) return;
    const gen = deps.generation();
    const cut = deps.rewinds();
    const beat = dueBeat(now, pt.beat, pt.start);
    if (beat === null) return;
    const window = beatWindow(beat, pt.beat, pt.start);
    const ids = deps.movers().filter((id) => herWindow(window, pt.parted[id]) !== null);
    const kept = pruneOld(pt.moves, now);
    const write = (moves: Move[]) => {
      // A LOAD in place during the call keeps the id and maybe the beat: the generation tells (final review I2).
      const rewoundBelow = deps.rewinds() !== cut && (deps.now() ?? beat) < beat;
      if (deps.generation() !== gen || rewoundBelow || !deps.write(pt.id, pt.beat, moves, beat)) deps.log(`beat ${beat}: the playthrough changed during the call; not written`);
    };
    if (ids.length === 0) return write(kept);
    const fail = (why: string) => {
      dead++;
      deps.log(`beat ${beat}: failed (${why})${dead >= DEAD_BEATS ? `; ${DEAD_BEATS} in a row, beats stopped for this session` : ''}`);
      write(kept);
    };
    // Building the prompt reads the game, not the model: a throw there is no dead beat and writes nothing (minor M5).
    let messages: CompletionMessage[];
    try {
      messages = deps.messages(ids, window);
    } catch (err) {
      return void deps.log(`beat ${beat}: the prompt couldn't be built (${err instanceof Error ? err.message : String(err)}); skipped`);
    }
    let res: Awaited<ReturnType<MoveBeatDeps['call']>>;
    try {
      res = await deps.call(messages);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
    if (res === null) return void deps.log(`beat ${beat}: no key or model now; skipped`);
    let answer: unknown;
    try {
      answer = jsonOf(res.text).v;
    } catch {
      return fail('not JSON');
    }
    const r = keepMoves(answer, { beat, movers: deps.checks(ids, window), places: deps.places(), fenced: deps.fenced() });
    // A promise to text still open is the text she owes: one at a time (spec §4.2).
    for (const m of r.moves)
      if (m.effect?.kind === 'text' && deps.promiseOpen(m.who)) {
        delete m.effect;
        r.refused.push(`${m.who}: effect dropped, a promise to text is open`);
      }
    dead = 0;
    deps.log(`beat ${beat}: ${ids.join(', ')} · kept ${r.moves.length} (${r.moves.map((m) => m.who).join(', ') || 'none'}) · tokens ${res.tokensIn ?? '?'}/${res.tokensOut ?? '?'}`);
    for (const why of r.refused) deps.log(`beat ${beat}: refused ${why}`);
    write([...kept, ...r.moves]);
  }

  /** Pending move texts (spec §4.2): sent once, while she's awake and you're apart, before the next beat. */
  async function texts(): Promise<void> {
    const pt = deps.active();
    const now = deps.now();
    if (!pt || now === null || !deps.on()) return;
    for (const m of pt.moves) {
      const e = m.effect;
      if (e?.kind !== 'text' || e.sent || m.beat > now) continue;
      const key = `${m.beat}:${m.who}`;
      if (sending.has(key)) continue;
      const drop = (why: string) => {
        deps.markText(pt.id, m.beat, m.who, null);
        deps.log(`${m.who} · move text dropped (${why})`);
      };
      if (pt.beat !== m.beat) {
        drop('a newer beat ran');
        continue;
      }
      if (deps.withYou(m.who)) {
        drop("you're with her");
        continue;
      }
      if ((e.tries ?? 0) >= PROMISE_TRIES) {
        drop(`after ${PROMISE_TRIES} tries`);
        continue;
      }
      if (!deps.awake(m.who, now)) continue;
      sending.add(key);
      try {
        const gen = deps.generation();
        const sent = await deps.fireText(m.who, { about: e.about, due: m.beat });
        if (deps.generation() !== gen) return void deps.log(`${m.who} · move text: the playthrough changed while it was out; not marked`);
        deps.markText(pt.id, m.beat, m.who, sent ? { sent: true } : { tries: (e.tries ?? 0) + 1 });
        deps.log(`${m.who} · move text ${sent ? 'sent' : `failed (try ${(e.tries ?? 0) + 1})`}`);
      } finally {
        sending.delete(key);
      }
    }
  }

  async function check(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        // Runs off a clock move: whatever goes wrong is logged, never thrown into the game (Review Focus 3).
        await pass().catch((err: unknown) => deps.log(`pass failed: ${err instanceof Error ? err.message : String(err)}`));
        await texts().catch((err: unknown) => deps.log(`texts failed: ${err instanceof Error ? err.message : String(err)}`));
      } while (again);
    } finally {
      running = false;
    }
  }

  return { check };
}
