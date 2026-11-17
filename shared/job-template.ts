/**
 * Tier templates (tier template spec §1): every job of a tier has one shape, so balancing tunes a tier and not a job. A
 * job's story, stats, draws and pay are its own. `offTemplate` says how a job differs: `npm run job-audit` prints it for
 * all of them, the parse warns on a job marked `template: true`.
 */
import { jobTakeSize } from './dice';
import { APPROACH_STATS, APPROACHES } from './hand';
import { outcomeFor, type Beat, type Choice, type CondCtx, type Outcome, type QuestEntry } from './quests';
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
export function blowsOnMiss(q: QuestEntry, c: Choice, ctx?: CondCtx): boolean {
  if (!c.fail) return false;
  const blows = (o: Outcome | undefined) => o?.effects.blown === true || o?.effects.take === 'none';
  // With the run's state, the version that would play; without, any version (the template's view).
  if (ctx) return blows(outcomeFor(q, c.fail, ctx));
  const o = q.outcomes.get(c.fail);
  return blows(o) || (o?.versions ?? []).some((v) => blows(q.outcomes.get(v.id)));
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

/** A route through a job (routes and posts spec §1): its rolled beats in order, each with the versions that route can play. */
export interface JobPath {
  /** The fork's card that starts this route; null on a job with one path. */
  via: string | null;
  beats: { id: string; beat: Beat; versions: Beat[] }[];
  flags: Record<string, string>;
}

const PATHS_MAX = 64;
const isPush = (id: string) => id === 'getaway' || /^push-\d+$/.test(id);

/**
 * Every way from the first beat to the end, following each card's pass outcome (a miss never changes the route), push
 * beats and the getaway left out. A route carries the flags its cards set, so a beat with versions is judged on the one
 * that route plays; a version that turns on anything else (ALARM, heat, a draw, a post) is kept beside the plain one.
 * `loop`: a route came back to a beat, and there are no paths.
 */
export function paths(q: QuestEntry): JobPath[] & { loop?: string } {
  // Flags only cards set: a version's condition on one of these is known along a path.
  const cardFlags = new Set([...q.beats.values()].flat().flatMap((b) => b.choices.flatMap((c) => c.tags.flatMap((t) => (t.kind === 'set' ? [t.name] : [])))));
  const versionsOf = (id: string, flags: Record<string, string>): Beat[] => {
    const out: Beat[] = [];
    for (const b of q.beats.get(id) ?? []) {
      const known = (b.when ?? []).filter((c) => (c.kind === 'flag' || c.kind === 'set') && cardFlags.has(c.name));
      const holdsKnown = known.every((c) => (c.kind === 'set' ? flags[c.name] !== undefined : c.kind === 'flag' ? (c.op === '=' ? flags[c.name] === c.value : flags[c.name] !== c.value) : true));
      if (!holdsKnown) continue;
      out.push(b);
      // Every condition known and true: this is the version that plays; nothing after it can.
      if (known.length === (b.when ?? []).length) break;
    }
    return out;
  };
  const nextOf = (c: Choice): string | null => {
    const to = q.outcomes.get(c.to)?.to;
    return to && to !== 'end' && to !== 'back' && !isPush(to) && q.beats.has(to) ? to : null;
  };
  const found = new Map<string, JobPath>();
  let loop: string | undefined;
  const walk = (id: string, flags: Record<string, string>, via: string | null, beats: JobPath['beats'], seen: string[]): void => {
    if (loop || found.size >= PATHS_MAX) return;
    if (seen.includes(id)) {
      loop = id;
      return;
    }
    const versions = versionsOf(id, flags);
    const cards = versions.flatMap((v) => v.choices);
    const rolled = versions.some((v) => rolledOn(v).length > 0);
    const here = rolled ? [...beats, { id, beat: versions.at(-1)!, versions }] : beats;
    const forks = new Set(cards.map(nextOf)).size > 1;
    let ended = cards.length === 0;
    for (const c of cards) {
      const set = Object.fromEntries(c.tags.flatMap((t) => (t.kind === 'set' ? [[t.name, t.value]] : [])));
      const to = nextOf(c);
      if (to === null) ended = true;
      else walk(to, { ...flags, ...set }, via ?? (forks ? c.id : null), here, [...seen, id]);
    }
    if (ended) {
      const key = here.map((b) => `${b.id}:${b.versions.map((v) => (q.beats.get(b.id) ?? []).indexOf(v)).join('+')}`).join('>');
      if (!found.has(`${via}|${key}`)) found.set(`${via}|${key}`, { via, beats: here, flags });
    }
  };
  walk(q.first, {}, null, [], []);
  if (loop) return Object.assign([], { loop });
  // One route per run of rolled beats. A way through that only skips beats of another (a card that walks away, a
  // shortcut past a beat) isn't a route of its own: a job forks when two ways each roll a beat the other never does.
  const ids = (p: JobPath) => p.beats.map((x) => x.id);
  const within = (a: string[], b: string[]) => {
    let i = 0;
    for (const x of b) if (x === a[i]) i++;
    return i === a.length;
  };
  const all = [...found.values()].sort((a, b) => b.beats.length - a.beats.length);
  const kept: JobPath[] = [];
  for (const p of all) if (!kept.some((k) => within(ids(p), ids(k)))) kept.push(p);
  // In file order of the fork's cards.
  const order = [...found.values()].map((p) => p.via);
  kept.sort((a, b) => order.indexOf(a.via) - order.indexOf(b.via));
  return kept.length > 1 ? kept : kept.map((p) => ({ ...p, via: null }));
}

/** A path's lines against its tier's shape: the count, each beat's cards and numbers, the blow-ups, the approaches. */
function pathLines(q: QuestEntry, t: (typeof TEMPLATES)[1 | 2 | 3], beats: { id: string; versions: Beat[] }[]): string[] {
  const out: string[] = [];
  if (beats.length !== t.beats) out.push(`${beats.length} rolled beats, tier ${q.tier} wants ${t.beats}`);
  const blowUps: string[] = [];
  beats.forEach(({ id, versions }, i) => {
    // A beat's versions that turn on ALARM, heat or a draw aren't judged, as they never were: only the one the route's
    // own flags pick, else the plain one.
    for (const beat of versions.slice(-1)) {
      // An angle's card comes on top of the beat's two (tier 3 contracts spec §3).
      const cards = rolledOn(beat).filter((c) => !c.check?.angle);
      if (cards.length !== CARDS) out.push(`beat ${id}: ${cards.length} rolled cards, wants ${CARDS}`);
      const stats = cards.flatMap((c) => (c.check ? [c.check.stat] : []));
      if (new Set(stats).size < stats.length) out.push(`beat ${id}: two cards on ${stats[0].toUpperCase()}`);
      for (const c of cards) {
        if (c.check && t.checks[i] !== undefined && c.check.base !== t.checks[i]) out.push(`beat ${id}: check ${c.check.base}, tier ${q.tier} wants ${t.checks[i]}`);
        if (c.tags.some((x) => x.kind === 'effect')) out.push(`beat ${id}: an effect tag`);
      }
      if (cards.some((c) => blowsOnMiss(q, c)) && !blowUps.includes(id)) blowUps.push(id);
    }
  });
  if (blowUps.length > 1) out.push(`${blowUps.length} blow-ups, wants one at most`);
  if (blowUps.length > 0 && blowUps.at(-1) !== beats.at(-1)?.id) out.push(`a blow-up before the last beat (${blowUps.at(-1)})`);
  else if (blowUps.length > 1) out.push(`a blow-up before the last beat (${blowUps[0]})`);
  for (const a of APPROACHES) {
    const covers = beats.length > 0 && beats.every(({ versions }) => rolledOn(versions.at(-1)!).some((c) => c.check && (APPROACH_STATS[a] as readonly string[]).includes(c.check.stat)));
    if (covers) out.push(`${a.toUpperCase()} covers every beat`);
  }
  return out;
}

/** Each way a job is off its tier's template, as a line; none for a spring rescue or a tier without one. A routed job's lines say which route (`via <card>: `). */
export function offTemplate(q: QuestEntry): string[] {
  if ((q.kind !== 'mission' && q.kind !== 'contract') || q.spring || q.tier === 4) return [];
  const t = TEMPLATES[q.tier];
  const out: string[] = [];
  const outside = q.kind === 'contract' ? outsideNight(q) : [];
  const all = rolledBeats(q);
  for (const { id } of all) if (outside.includes(id)) out.push(`beat ${id}: no rolled cards outside the night`);
  // A mission that forks is judged a route at a time; everything else as one run through its beats in file order.
  const routes = q.kind === 'mission' ? paths(q) : [];
  const routed = routes.length > 1;
  const lines = routed || routes.loop ? [] : pathLines(q, t, all.filter(({ id }) => !outside.includes(id)).map(({ id, beat }) => ({ id, versions: [beat] })));
  const count = (l: string) => /rolled beats, tier/.test(l);
  if (routes.loop) out.push(`a route loops back to ${routes.loop}`);
  out.push(...lines.filter(count));
  if (jobTakeSize(q) !== t.take) out.push(`TAKE ${jobTakeSize(q)}, tier ${q.tier} wants ${t.take}`);
  if (q.payRange?.[0] !== t.pay[0] || q.payRange?.[1] !== t.pay[1]) out.push(`pay ${q.payRange?.join('-') ?? 'none'}, tier ${q.tier} wants ${t.pay.join('-')}`);
  out.push(...lines.filter((l) => !count(l)));
  if (routed) for (const r of routes) out.push(...pathLines(q, t, r.beats).map((l) => `via ${r.via}: ${l}`));
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
