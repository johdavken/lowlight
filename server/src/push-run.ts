/**
 * Pressing on (spec 2026-10-29): after a job's take, WALK or PRESS ON into the file's push beats. These are the
 * rules; chat-relay wires them into the job run. A push's gains go into the kit as they happen, and a lost push
 * takes them back with one event.
 */
import { endHeat, type KitEvent } from '../../shared/mission';
import { isJob, pushBeatId, type PushState, type QuestEntry, type QuestRun } from '../../shared/quests';

export type { PushState };

/** The reserved beat a run stands on while the card is up, and its two cards. */
export const PUSH_BEAT = '!push';
export const PRESS = '!press';
export const WALK = '!walk';

/** The push beat after `stage` played ones, if the file has it. */
export function nextPushBeat(q: QuestEntry, stage: number): string | null {
  const id = pushBeatId(stage + 1);
  return q.beats.has(id) ? id : null;
}

/** Whether the card comes up (spec §1): a job with a take, not blown, ALARM under 3, a push beat left, and NERVE to press with (the table spec §3). */
export function canOffer(q: QuestEntry, run: QuestRun, stage: number, nerveLeft = 1): boolean {
  return isJob(q) && (run.take ?? 'full') !== 'none' && run.blown !== true && (run.alarm ?? 0) < 3 && nextPushBeat(q, stage) !== null && nerveLeft >= 1;
}

/** The heat a run would leave if it ended now (tier template spec §2), from its ALARM and its rolls. */
export function heatLeft(run: QuestRun, blown: boolean): number {
  const rolls = run.picks.flatMap((p) => (p.roll && 'faces' in p.roll ? [p.roll] : []));
  return endHeat({ alarm: run.alarm ?? 0, blown, deckHeat: Math.max(0, ...rolls.map((r) => r.deckHeat ?? 0)), scrubbed: rolls.some((r) => r.quiet) }) + (blown ? 0 : (run.setup?.endHeat ?? 0));
}

/** What WALK keeps: the run's sol and heat so far. */
export function walkValue(run: QuestRun): { sol: number; heat: number } {
  const ev = run.kit ?? [];
  return { sol: ev.reduce((n, e) => n + (e.sol ?? 0), 0), heat: ev.reduce((n, e) => n + (e.heat ?? 0), 0) };
}

/**
 * A lost push (spec §1) as one event: the pot back, half the job's own sol (before the push) back, or all of
 * it when the loss leaves the job blown (`blown`), and the deck as it was when the card first came up, if a push gave one (it leaves your owned decks; a deck that died stays dead).
 */
export function lossEvents(run: QuestRun, push: PushState, at: number, o: { blown?: boolean } = {}): KitEvent[] {
  const ev = run.kit ?? [];
  const jobSol = ev.slice(0, push.from).reduce((n, e) => n + (e.sol ?? 0), 0);
  const pushSol = ev.slice(push.from).reduce((n, e) => n + (e.sol ?? 0), 0);
  const out: KitEvent = { at, sol: -(pushSol + (o.blown ? jobSol : Math.floor(jobSol / 2))) };
  const lastDeck = [...ev.slice(push.from)].reverse().find((e) => e.deck !== undefined);
  if (lastDeck && lastDeck.deck !== null) {
    const before = [...ev.slice(0, push.from)].reverse().find((e) => e.deck !== undefined);
    out.deck = before ? (before.deck ?? null) : (run.startDeck ?? null);
    // The decks it gave go with it, but not one you owned before the push (review I1); an old save's push without
    // `had` loses only the last.
    const gave = [...new Set(ev.slice(push.from).flatMap((e) => (e.deck ? [e.deck] : [])))].filter((d) => d !== out.deck);
    const lose = push.had ? gave.filter((d) => !push.had!.includes(d)) : out.deck !== lastDeck.deck && lastDeck.deck ? [lastDeck.deck] : [];
    if (lose.length) out.lose = lose;
  }
  return [out];
}

/** The take one tier down. */
export const dropTake = (t: 'full' | 'part' | 'none'): 'full' | 'part' | 'none' => (t === 'full' ? 'part' : 'none');
