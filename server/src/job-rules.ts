/**
 * The job game's standalone rules and constants, used by job-runner.ts and job-end.ts: what a pick's tags do,
 * when a gamble or a trade can act on a roll, a run's take and ALARM. Pure functions of their arguments.
 */
import type { QuestState } from '../../shared/types';
import type { Kit } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { beatAt, type Beat, type Outcome, type QuestEntry, type QuestRun } from '../../shared/quests';
import { isLegacyPending, type Choice, type DicePending } from '../../shared/quests';
import type { CostId } from '../../shared/costs';
import { ALARM_MAX, jobTakeSize, kindResult } from '../../shared/dice';
import type { CallEffect } from '../../shared/hand';
import { takeOf } from './take-run';

/** A card's preview on a choice; `presses`, on a call, what each ability beside it would make the roll (ability pass spec §1). */
export type Play = NonNullable<NonNullable<QuestState['active']>['choices'][number]['plays']>[string];
/** A card's effect with no step, to ask whether a press's step has anything to move. */
export const stepless = ({ step: _step, ...e }: CallEffect): CallEffect => e;
/** The ability pass's AFTER A ROLL kinds (spec §2), and what AT THE END `end-cool` takes off. */
export const PASS_AFTER = new Set<string>(['gamble-cost', 'gamble-miss', 'trade-alarm', 'trade-nerve', 'rerun', 'undo', 'talk-down', 'take-hit']);
/** The line a blow-up plays as when it's talked down. */
export const TALKED_DOWN = '*Your face gets between you and it, and keeps talking. They stay behind so you can walk. You leave with part of it.*';
export const END_COOL_HEAT = 2;
export const END_COOL_PAY = 20;
/** What Cut a Deal and Paid Off take off the pay, in percent (tier 3 beat play spec §2). */
export const SELL_PART_CUT = 25;
export const PAY_OFF_CUT = 30;
/** Clean Exit's line. */
export const HELD_ALARM = '*Somebody who knows this building better than it knows itself kills the alarm at the panel. It costs you some of what you came for.*';
/** A contract looks for your name anywhere: the Marsh has no board of its own to earn rep on (tier 3 contracts spec §5). */
export const bestRep = (kit: Pick<Kit, 'rep'> | undefined): number => Math.max(0, ...Object.values(kit?.rep ?? {}));
/** A contract at its night, not gone in yet. */
export const nightOpen = (run: QuestRun): boolean => !run.done && run.contract?.stage === 'night' && !run.setup;
/** Whether a run's job is over: a contract's is at its debrief, though the run waits on for its fallout (`endAt` set by then, as world.ts reads it). */
export const jobOver = (run: QuestRun): boolean => run.done || (run.contract?.stage === 'fallout' && run.setup?.endAt !== undefined);
/** Whether a recruit called or pressed on this parked roll: one act a recruit a roll (ability pass spec §1). */
export const actedOn = (p: DicePending, rid: string): boolean => p.call?.card === rid || (p.after ?? []).some((c) => c.card === rid);
export const rollFills = (q: Pick<QuestEntry, 'kind'>, run: QuestRun): boolean => scoring(q, run) && run.getaway !== true && run.push?.state !== 'playing';
/** Whether Saw It Coming took this card back on this beat (tier 3 beat play spec §2). */
export const barredOn = (run: Pick<QuestRun, 'barred'>, beat: string, choice: string): boolean => run.barred?.beat === beat && run.barred.choice === choice;
/** A waiting pass with nothing left to land: no ALARM or heat on the roll, and none on its route. */
export function nothingToPay(beat: Beat, run: QuestRun, p: NonNullable<QuestRun['pending']>): boolean {
  if (isLegacyPending(p) || !p.roll.pass || p.cost.alarm > 0 || p.cost.heat > 0) return false;
  const choice = beat.choices.find((c) => c.id === p.choice);
  return !choice || tagsOf(choice, run.flags).alarm <= 0;
}

/** Why a gamble or a trade can't act on this roll, or null (ability pass spec §2). The picks already on it count. */
export function afterRefusal(kind: string, q: QuestEntry, run: QuestRun, p: Pick<DicePending, 'roll' | 'cost' | 'beat' | 'choice'> & Partial<DicePending>): string | null {
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
/** A dealt roll's picks are all made and settled (roll lifecycle spec §1.3). */
export const settledAll = (p: DicePending): boolean => (p.settled ?? []).length >= (p.pick ?? 0) && (p.settled ?? []).every((x) => x.how);

/** A choice's tags on a pick: the flags it sets (over `flags`), its extra minutes, and its ALARM steps. */
/** The deck a job goes in with: none when the job bars the one you hold. */
export const carriedOn = (q: QuestEntry, deck: Deck | null): Deck | null => (deck && q.bars === deck.id ? null : deck);

export function tagsOf(choice: Choice, flags: Record<string, string>): { flags: Record<string, string>; minutes: number; alarm: number } {
  const out = { flags: { ...flags }, minutes: 0, alarm: 0 };
  for (const t of choice.tags) {
    if (t.kind === 'set') out.flags[t.name] = t.value;
    else if (t.kind === 'clock') out.minutes += t.minutes;
    else if (t.kind === 'alarm') out.alarm += t.delta;
  }
  return out;
}

export const TAKE_RANK = { full: 0, part: 1, none: 2 } as const;
/** A job's take and blown after `outcome` (small jobs spec §3): the worst take seen stays (none, then part, then full); a blown line sticks. */
export const withTake = (run: QuestRun, outcome: Outcome): Pick<QuestRun, 'take' | 'blown'> => {
  const next = outcome.effects.take;
  const take = next && (!run.take || TAKE_RANK[next] > TAKE_RANK[run.take]) ? next : run.take;
  const blown = run.blown === true || outcome.effects.blown === true;
  return { ...(take ? { take } : {}), ...(blown ? { blown: true } : {}) };
};

/** ALARM after `n` more steps, 0–3 (small jobs spec §3). */
export const alarmPlus = (alarm: number | undefined, n: number) => Math.max(0, Math.min(ALARM_MAX, (alarm ?? 0) + n));

/** Whether a job's TAKE counts now: always, but a contract's only on its night (tier 3 contracts spec §2). */
export const scoring = (q: Pick<QuestEntry, 'kind'>, run: Pick<QuestRun, 'contract'>): boolean => q.kind !== 'contract' || run.contract?.stage === 'night';

/** A program's refusals that mean the rest of the pick already did its work (final review I1): dropped, not refused. */
export const COVERED = new Set(['ALREADY IN THE DARK', 'ALREADY BIG']);

/** A job's poster and brief, as a row of the panel carries them. */
export const filed = (q: QuestEntry) => ({ ...(q.postedBy ? { postedBy: q.postedBy } : {}), ...(q.brief ? { brief: q.brief } : {}) });
