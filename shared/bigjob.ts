/**
 * Big jobs (spec 2026-10-19 big jobs): the read, a route's gig, the night's go hour and the stakes.
 * Pure: the server scores and the browser shows from the same functions.
 */
import type { Brief, GigKind, GigResult } from './gig/brief';
import type { Tier as GigTier } from './gig/rules';
import { rng } from './gig/generate';
import { hashSeed as hash } from './board';
import type { Tier } from './mission';
import { holds, nightMinuteOf, type CondCtx, type GigTag, type QuestEntry } from './quests';

const DAY = 1440;
const GIG_TIERS: GigTier[] = ['easy', 'medium', 'hard'];

/** A story-clock minute as minutes into its night (06:00 → 05:59). */
export const nightMinute = (clock: number): number => nightMinuteOf(((clock % DAY) + DAY) % DAY);

/** Whether the go hour of the night the run started in has come (a run started after it is past at once). */
export function goPassed(q: Pick<QuestEntry, 'go'>, startedAt: number, clock: number): boolean {
  if (q.go === null) return false;
  const nightStart = startedAt - nightMinute(startedAt);
  return clock >= nightStart + nightMinuteOf(q.go);
}

/** The read's word bank: every word of the clues found, and the file's wrong words; no repeats, in a seeded order. */
export function wordBank(q: Pick<QuestEntry, 'clues' | 'read'>, found: readonly string[], seed: string): string[] {
  const words = [...new Set([...found.flatMap((id) => q.clues.get(id)?.words ?? []), ...(q.read?.wrong ?? [])])].sort();
  const r = rng(hash(`${seed}|bank`));
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words;
}

/** The read scored (spec §3): each blank right or wrong; 3 right full, 2 half, fewer wrong; the flags beats read. */
export function scoreRead(q: Pick<QuestEntry, 'read'>, picks: readonly [string, string, string]): { level: 'full' | 'half' | 'wrong'; blanks: ('right' | 'wrong')[]; flags: Record<string, string> } {
  const answers = q.read?.answers ?? ['', '', ''];
  const blanks = picks.map((p, i) => (p === answers[i] ? 'right' : 'wrong') as 'right' | 'wrong');
  const right = blanks.filter((b) => b === 'right').length;
  const level = right === 3 ? 'full' : right === 2 ? 'half' : 'wrong';
  return { level, blanks, flags: { read: level, 'read.1': blanks[0], 'read.2': blanks[1], 'read.3': blanks[2] } };
}

const signedStep = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** A route's gig for you now: its kind, the difficulty stepped by the modifiers that hold (clamped), and why. */
export function gigOf(tag: GigTag, ctx: CondCtx): { kind: GigKind; tier: GigTier; why: string[] } {
  const why: string[] = [];
  let at = GIG_TIERS.indexOf(tag.tier);
  for (const m of tag.mods) {
    if (!holds(m.when, ctx)) continue;
    at += m.step;
    why.push(`${signedStep(m.step)} ${m.label.toUpperCase()}`);
  }
  return { kind: tag.gig, tier: GIG_TIERS[Math.min(2, Math.max(0, at))], why };
}

/** The brief a route's gig is dealt from: the job at its place, its client/target/take front matter, the route's line as its text. */
export function gigBrief(q: Pick<QuestEntry, 'id' | 'title' | 'starts' | 'pitch' | 'brief'>, kind: GigKind, tier: GigTier, route?: string): Brief {
  const b = q.brief;
  return { id: `${q.id}-gig`, title: q.title, tier, kind, place: q.starts, client: b?.client ?? 'the fixer', target: b?.target ?? q.title, take: b?.take ?? 'the job', text: route ?? q.pitch ?? q.title };
}

/** A route's board seed: the run, the beat and the choice, so rewind and BRANCH HERE deal the same board. */
export const gigSeed = (runKey: string, beat: string, choice: string): number => hash(`${runKey}|${beat}|${choice}|gig`);

/** A gig's result → the route's outcome: clean the first, close the second, any failure the third. */
export const GIG_OUTCOME: Record<GigResult, 0 | 1 | 2> = { clean: 0, close: 1, traced: 2, caught: 2, back: 2 };

/** Rep lost walking away from a big job before its approach (big jobs spec §4). */
export const WALK_AWAY_REP = 5;

/** A gig's result as a big job's row says it: `*HACK · EASY — CLOSE CALL.*`. */
export const GIG_RESULT_LINE: Record<GigResult, string> = { clean: 'CLEAN', close: 'CLOSE CALL', traced: 'TRACED', caught: 'CAUGHT', back: 'TURNED BACK' };

/** A big job's stake: rep won on CLEAN, lost on BLOWN (default 15 / 25). */
export const bigStake = (q: Pick<QuestEntry, 'stake'>): [number, number] => q.stake ?? [15, 25];

/** Rep for a big job's tier: CLEAN +won, MESSY +2, BLOWN −lost. */
export function bigRep(q: Pick<QuestEntry, 'stake'>, tier: Tier): number {
  const [won, lost] = bigStake(q);
  return tier === 'clean' ? won : tier === 'messy' ? 2 : -lost;
}
