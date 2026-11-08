/**
 * Tier templates (tier template spec §1): every job of a tier has one shape, so balancing tunes a tier and not a job. A
 * job's story, stats, draws and pay are its own. `offTemplate` says how a job differs: `npm run job-audit` prints it for
 * all of them, the parse warns on a job marked `template: true`.
 */
import { jobTakeSize } from './dice';
import { APPROACH_STATS, APPROACHES } from './hand';
import type { Beat, Choice, QuestEntry } from './quests';
import type { StatKey } from './stats';

/** Each tier's shape: rolled beats, TAKE, and the check number on each rolled beat, in order. */
export const TEMPLATES: Record<1 | 2 | 3, { beats: number; take: number; checks: number[]; pay: [number, number] }> = {
  1: { beats: 3, take: 4, checks: [50, 50, 50], pay: [90, 110] },
  2: { beats: 5, take: 4, checks: [55, 55, 55, 50, 50], pay: [360, 440] },
  3: { beats: 7, take: 6, checks: [55, 55, 55, 50, 50, 50, 50], pay: [1000, 1200] },
};
/** Checked or crack cards on a rolled beat. */
const CARDS = 2;

const rolledOn = (b: Beat) => b.choices.filter((c) => c.check || c.crack);

/** The beats a run must roll through, in file order: each beat's plain variant (its last), not a getaway or a push beat. */
/** A card whose miss (a crack's lockout) blows the job: its fail outcome is blown or takes nothing. The table marks it. */
export function blowsOnMiss(q: QuestEntry, c: Choice): boolean {
  if (!c.fail) return false;
  const e = q.outcomes.get(c.fail)?.effects;
  return e?.blown === true || e?.take === 'none';
}

export function rolledBeats(q: QuestEntry): { id: string; beat: Beat }[] {
  return [...q.beats].flatMap(([id, variants]) => {
    const beat = variants.at(-1)!;
    return id !== 'getaway' && !/^push-\d+$/.test(id) && rolledOn(beat).length > 0 ? [{ id, beat }] : [];
  });
}

/** A contract's offer, reports and fallout: beats outside the night, which take no rolled card. */
const outsideNight = (q: QuestEntry): string[] => {
  const ids = [...q.beats.keys()];
  return ids.filter((id) => id === q.first || id === 'fallout' || id.startsWith('report-'));
};

/** Each way a job is off its tier's template, as a line; none for a spring rescue or a tier without one. */
export function offTemplate(q: QuestEntry): string[] {
  if ((q.kind !== 'mission' && q.kind !== 'contract') || q.spring || q.tier === 4) return [];
  const t = TEMPLATES[q.tier];
  const out: string[] = [];
  const outside = q.kind === 'contract' ? outsideNight(q) : [];
  const all = rolledBeats(q);
  for (const { id } of all) if (outside.includes(id)) out.push(`beat ${id}: no rolled cards outside the night`);
  const beats = all.filter(({ id }) => !outside.includes(id));
  if (beats.length !== t.beats) out.push(`${beats.length} rolled beats, tier ${q.tier} wants ${t.beats}`);
  if (jobTakeSize(q) !== t.take) out.push(`TAKE ${jobTakeSize(q)}, tier ${q.tier} wants ${t.take}`);
  if (q.payRange?.[0] !== t.pay[0] || q.payRange?.[1] !== t.pay[1]) out.push(`pay ${q.payRange?.join('-') ?? 'none'}, tier ${q.tier} wants ${t.pay.join('-')}`);
  const blowUps: string[] = [];
  beats.forEach(({ id, beat }, i) => {
    // An angle's card comes on top of the beat's two (tier 3 contracts spec §3).
    const cards = rolledOn(beat).filter((c) => !c.check?.angle);
    if (cards.length !== CARDS) out.push(`beat ${id}: ${cards.length} rolled cards, wants ${CARDS}`);
    const stats = cards.flatMap((c) => (c.check ? [c.check.stat] : []));
    if (new Set(stats).size < stats.length) out.push(`beat ${id}: two cards on ${stats[0].toUpperCase()}`);
    for (const c of cards) {
      if (c.check && t.checks[i] !== undefined && c.check.base !== t.checks[i]) out.push(`beat ${id}: check ${c.check.base}, tier ${q.tier} wants ${t.checks[i]}`);
      if (c.tags.some((x) => x.kind === 'effect')) out.push(`beat ${id}: an effect tag`);
    }
    if (cards.some((c) => blowsOnMiss(q, c))) blowUps.push(id);
  });
  if (blowUps.length > 1) out.push(`${blowUps.length} blow-ups, wants one at most`);
  if (blowUps.length > 0 && blowUps.at(-1) !== beats.at(-1)?.id) out.push(`a blow-up before the last beat (${blowUps.at(-1)})`);
  else if (blowUps.length > 1) out.push(`a blow-up before the last beat (${blowUps[0]})`);
  for (const a of APPROACHES) {
    const covers = beats.length > 0 && beats.every(({ beat }) => rolledOn(beat).some((c) => c.check && (APPROACH_STATS[a] as readonly string[]).includes(c.check.stat)));
    if (covers) out.push(`${a.toUpperCase()} covers every beat`);
  }
  for (const [id, o] of q.outcomes) if (o.effects.heat) out.push(`outcome ${id}: heat: does nothing in a job`);
  return out;
}

/**
 * The stats on more than two thirds of a tier's blow-up beats (approach shapes spec §2): a beat where a rolled card's miss
 * blows the job or takes nothing, every variant of it as one. An approach with its die on all of them wins every job.
 */
export function blowUpSpread(jobs: QuestEntry[]): { tier: number; stat: StatKey; on: number; of: number }[] {
  const tiers = new Map<number, StatKey[][]>();
  for (const q of jobs) {
    for (const [id, variants] of q.beats) {
      if (/^push-/.test(id)) continue;
      const cards = variants.flatMap((v) => v.choices);
      const blows = cards.some((c) => c.check !== undefined && blowsOnMiss(q, c));
      if (blows) tiers.set(q.tier, [...(tiers.get(q.tier) ?? []), [...new Set(cards.flatMap((c) => (c.check ? [c.check.stat] : [])))]]);
    }
  }
  return [...tiers].flatMap(([tier, beats]) =>
    [...new Set(beats.flat())].flatMap((stat) => {
      const on = beats.filter((b) => b.includes(stat)).length;
      return on * 3 > beats.length * 2 ? [{ tier, stat, on, of: beats.length }] : [];
    }),
  );
}
