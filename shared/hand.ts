/**
 * The hand (spec 2026-10-29-the-hand §1–§4): how you go in, who you bring, what a call does at a check, the risk of
 * calling a recruit again, the favour and how everyone brought shares the end. Pure and seeded: the server, the fold,
 * the table's preview and job-sim share it, and rewind replays every draw.
 */
import { hashSeed } from './board';
import { GRADES, TIMING, type Grade, type JobEffect, type Risk, type Specialty, type Trait } from './crew-book';
import { growthStep, HURT_DAYS, SPLIT } from './crew';
import type { Position } from './dice';
import type { ContactCard } from './types';
import { rng } from './rng';
import { repTier, type Tier } from './mission';
import type { StatKey } from './stats';

export type Approach = 'quiet' | 'smooth' | 'hard';
export const APPROACHES: readonly Approach[] = ['quiet', 'smooth', 'hard'];
export const APPROACH_STATS: Record<Approach, readonly StatKey[]> = { quiet: ['reflex', 'tech'], smooth: ['cool', 'wits'], hard: ['body'] };

/** The SETUP card as GO IN stored it: `at` is the story minute, `endAt` when the job settled on its own end. */
export interface Setup {
  approach: Approach;
  people: string[];
  favour: boolean;
  at: number;
  /** The job's tier at GO IN: a job below a recruit's grade moves them half as far. Absent on runs from before, which count full. */
  tier?: number;
  endAt?: number;
  /** A brought FENCE added TAKE +1 at the job's own end (set when it did, so the debrief never claims one that didn't land). */
  fenced?: true;
  /** Who fenced it (contact cards spec §3): a recruit id or `contact:<id>`; absent on runs from before contact cards. */
  fencedBy?: string;
  /** Contact cards brought (contact cards spec §2), as they were at GO IN: a rewound lead doesn't strip a running job. */
  contacts?: ContactCard[];
  /** Each recruit's slotted abilities at GO IN (crew abilities plan ruling 4); absent on runs from before abilities. */
  abilities?: Record<string, string[]>;
  /** AT THE END abilities that acted when the job settled, `<rid>/<ability>`, for the debrief. */
  ended?: string[];
  /** What they did to the heat the job leaves, and the percent off its pay (ability pass spec §2). */
  endHeat?: number;
  payCut?: number;
  /** Cut a Deal sold a part take as full (tier 3 beat play spec §2): the pay scales as full, less its cut; the grade stays. */
  payFull?: true;
  /** Paid Off: ALARM counts as under 2 for the grade. */
  paidOff?: true;
  /** Clean Exit held ALARM at 3: `<rid>/<ability>`, once a job. */
  held?: string;
  /** The deck carried at GO IN and its slots (programs spec §3); absent on a run from before programs. No deck: id '', slots 0. */
  deck?: { id: string; quality: 1 | 2 | 3 | 4; slots: number };
}

/** A card played on a roll: `card` is a recruit id or `'favour'`; `loss` when an again-call's miss cost the recruit. */
export interface Call {
  beat: string;
  choice: string;
  card: string;
  again: boolean;
  at: number;
  loss?: 'hurt' | 'held';
  /** An ability pressed (crew abilities spec §2): `card` is the recruit, this the ability id. */
  ability?: string;
}

/** A recruit's stat (§2). FENCE plays itself at the end; WHEEL isn't playable yet. */
export const SPEC_STAT: Partial<Record<Specialty, StatKey>> = { runner: 'tech', face: 'cool', ears: 'wits', muscle: 'body' };
export const MAX_PEOPLE = 3;
/** Contact cards (spec 2026-10-31-contact-cards): at most two in POCKETS, played once per job, free. */
export const MAX_CONTACTS = 2;
export const CONTACT_CARD = 'contact:';
/** A contact card's character id (`contact:cass` → `cass`), else null. */
export const contactId = (card: string): string | null => (card.startsWith(CONTACT_CARD) && card.length > CONTACT_CARD.length ? card.slice(CONTACT_CARD.length) : null);
/** A contact card's debrief line after the first name: `HICKS TOOK THE WIRE`, `CASS FENCED IT · TAKE +1`. */
export const CONTACT_VERB: Partial<Record<Specialty, string>> = { runner: 'TOOK THE WIRE', face: 'DID THE TALKING', ears: 'HEARD IT FIRST', muscle: 'LEANED ON IT', fence: 'FENCED IT · TAKE +1' };
/** Her trust after a BLOWN job she played on (spec §4). */
export const CONTACT_BURN = -1;
export const CONTACT_BURN_REASON = 'Called in on a job that went bad';
/** What a recruit's call does, as the row and her history say it (§6). */
export const CALL_VERB: Partial<Record<Specialty, string>> = { runner: 'gets into the system', face: 'does the talking', ears: 'heard it first', muscle: 'leans on it' };
/** Heat at which nobody in a district wants to be seen helping you (§3). */
export const FAVOUR_HEAT = 6;
/** The SETUP offer's favour while the favour and contact cards are on hold (programs spec §2.4). */
export const FAVOUR_ON_HOLD = 'ON HOLD';
/** Rep lost in the district when a job ends BLOWN after the favour was called (§3). */
export const FAVOUR_BURN = -5;
/** HARD's head start on TAKE (the hand spec §1): 1, but none on tier 1, where it made two-pick jobs a sure thing (balancing 2026-11-01). */
export const hardStartTake = (tier: 1 | 2 | 3 | 4): number => (tier >= 2 ? 1 : 0);
/** A press of an ability (effect and NERVE spec §2): NERVE, no risk to the recruit. */
export const ABILITY_NERVE = 1;
/** What pressing an ability costs: free for one that gives NERVE back (it would only return what it took) and AT THE END ones. */
export const abilityNerve = (job: JobEffect): 0 | 1 => (job.kind === 'nerve' || job.kind === 'trade-nerve' || TIMING[job.kind] === 'end' || TIMING[job.kind] === 'auto' ? 0 : ABILITY_NERVE);
/** A recruit's again-call's loss on a miss: 1 in N by grade (GREEN, HAND, PRO, VET). Calls only: abilities cost NERVE instead. */
export const AGAIN_RISK = [2, 3, 4, 6] as const;

const BETTER: Record<Position, Position> = { wire: 'open', open: 'dark', dark: 'dark' };
export const better = (p: Position): Position => BETTER[p];

export interface CallEffect {
  lift: boolean;
  dice: -1 | 0 | 1;
  label: string;
  /** A called or pressing recruit's grade (tier effect spec §1, ability pass spec §1), to lift the tier's cut; none from a contact or the favour. */
  grade?: Grade;
  /** A step of effect on this roll (ability pass spec §2). */
  step?: 1 | -1;
  /** What a setup leaves for the next roll. */
  after?: { better?: true; die?: true; small?: true; noCut?: true };
  /** This roll goes on another stat (One More Thing). */
  stat?: 'cool';
  /** ALARM a miss lands with. */
  missAlarm?: 1;
  /** Starts Stand Firm on the run. */
  firm?: true;
  /** ALARM this press lands with the roll. */
  alarm?: 1;
  /** TAKE a miss also loses. */
  missTake?: 1;
}

/**
 * What a card does on a check of `stat` at `position` (after ALARM's shift): a recruit on their stat lifts one
 * position (+1d instead already in the dark), elsewhere +1d; the favour is +1d. Null: not playable.
 */
export function callEffect(card: { spec: Specialty } | 'favour', stat: string, position: Position): CallEffect | null {
  if (card === 'favour') return { lift: false, dice: 1, label: 'FAVOUR' };
  const own = SPEC_STAT[card.spec];
  if (!own) return null;
  return own === stat && position !== 'dark' ? { lift: true, dice: 0, label: '' } : { lift: false, dice: 1, label: '' };
}

/** An ability's card in the hand: `<recruitId>/<abilityId>` (crew abilities plan ruling 5). */
export const abilityCardId = (rid: string, ability: string) => `${rid}/${ability}`;
/** The recruit and ability of an ability card, else null. */
export function abilityCard(card: string): { rid: string; ability: string } | null {
  const m = /^([^/:]+)\/([^/]+)$/.exec(card);
  return m ? { rid: m[1], ability: m[2] } : null;
}

/**
 * What an ON A ROLL ability does on a check of `stat` at `position` (crew abilities spec §2): `cross` as a call on its
 * stat, `die` +1d anywhere, `getaway` a lift on a GET OUT check, `again` the recruit's own call; setups and greed
 * (ability pass spec §2) on any roll. Carries the recruit's `grade`, so the press can lift the tier's cut. Null: not here.
 */
export function abilityEffect(job: JobEffect, spec: Specialty, stat: string, position: Position, getaway: boolean, grade?: Grade, red = false): CallEffect | null {
  if (red && NOT_ON_RED.has(job.kind)) return null;
  const e = rollEffect(job, spec, stat, position, getaway);
  return e && (grade === undefined ? e : { ...e, grade });
}

/** PRO and VET ON A ROLL abilities don't go on a red card (tier 3 beat play spec §2). */
const NOT_ON_RED = new Set<JobEffect['kind']>(['lookout', 'talk-past', 'inside-info', 'stand-firm']);

function rollEffect(job: JobEffect, spec: Specialty, stat: string, position: Position, getaway: boolean): CallEffect | null {
  switch (job.kind) {
    case 'lookout':
      return { lift: false, dice: 0, label: '', step: 1, after: { small: true } };
    case 'talk-past':
      return stat === 'cool' ? null : { lift: false, dice: 0, label: '', stat: 'cool', missAlarm: 1 };
    case 'inside-info':
      return { lift: false, dice: 0, label: '', after: { noCut: true } };
    case 'stand-firm':
      return { lift: false, dice: 0, label: '', firm: true };
    case 'setup-position':
      return { lift: false, dice: -1, label: '', after: { better: true } };
    case 'setup-die':
      return { lift: false, dice: 0, label: '', step: -1, after: { die: true } };
    case 'greed-effect':
      return { lift: false, dice: 0, label: '', step: 1, alarm: 1 };
    case 'greed-die':
      return { lift: false, dice: 1, label: '', missTake: 1 };
    case 'cross':
      return job.stat !== stat ? null : position === 'dark' ? { lift: false, dice: 1, label: '' } : { lift: true, dice: 0, label: '' };
    case 'die':
      return { lift: false, dice: 1, label: '' };
    case 'getaway':
      return !getaway ? null : position === 'dark' ? { lift: false, dice: 1, label: '' } : { lift: true, dice: 0, label: '' };
    case 'again':
      return callEffect({ spec }, stat, position);
    default:
      return null;
  }
}

/** Whether a card was played on an earlier roll: the recruit's own call (no `ability`), or that ability (plan ruling 6). */
export const pressed = (calls: Call[], rid: string, ability?: string): boolean => calls.some((c) => c.card === rid && c.ability === ability);

/** An again-call's miss: a loss 1 in AGAIN_RISK[grade], held ON THE WIRE (hurt with never-held), else hurt. */
export function lossOnAgain(o: { seed: string; grade: Grade; position: Position; neverHeld: boolean }): 'hurt' | 'held' | null {
  if (rng(hashSeed(o.seed))() >= 1 / AGAIN_RISK[o.grade]) return null;
  return o.position === 'wire' && !o.neverHeld ? 'held' : 'hurt';
}

/** Days hurt, drawn as an errand of `risk` draws them. */
export function drawHurtDays(seed: string, risk: Risk): number {
  const [lo, hi] = HURT_DAYS[risk];
  return lo + Math.floor(rng(hashSeed(seed))() * (hi - lo + 1));
}

/** The favour slot (§3): Known or higher in the district and heat under FAVOUR_HEAT. */
export function favourFor(o: { rep: number; heat: number; district: string }): { ok: true } | { ok: false; why: string } {
  if (repTier(o.rep) < 2) return { ok: false, why: 'NO FAVOURS · NOBODY HERE' };
  if (o.heat >= FAVOUR_HEAT) return { ok: false, why: `NO FAVOURS · ${o.district.toUpperCase()} HEAT ${o.heat}` };
  return { ok: true };
}

/** A brought recruit's share of the end: `fenced` is a FENCE's TAKE +1 (a second share beside their tier's). */
export interface Share {
  rid: string;
  kind: Tier | 'fenced';
  fate: 'hurt' | 'held' | 'gone' | null;
  hurtDays: number;
  /** hurt-not-gone-once turned a gone into hurt: the trait is spent. */
  saved?: true;
}

/**
 * How everyone brought shares the end (§4): the tier for each recruit not lost on a call; BLOWN draws a high risk
 * errand's hurt / held / gone split (never-held, hurt-not-gone-once apply); a FENCE also fences, unless it was a GET OUT.
 */
export function jobShares(o: {
  setup: Setup;
  calls: Call[];
  tier: Tier;
  seed: string;
  recruits: { id: string; spec: Specialty; traits: Trait[]; goneUsed: boolean }[];
  getOut?: boolean;
}): Share[] {
  const out: Share[] = [];
  for (const rid of o.setup.people) {
    const r = o.recruits.find((x) => x.id === rid);
    if (!r || o.calls.some((c) => c.card === rid && c.loss)) continue;
    let fate: Share['fate'] = null;
    let hurtDays = 0;
    let saved = false;
    if (o.tier === 'blown') {
      const draw = rng(hashSeed(`${o.seed}|${rid}|end`));
      const [hurt, held] = SPLIT.high;
      const y = draw();
      fate = y < hurt ? 'hurt' : y < hurt + held ? 'held' : 'gone';
      const has = (k: string) => r.traits.some((t) => t.effect.kind === k);
      if (fate === 'held' && has('never-held')) fate = 'hurt';
      saved = fate === 'gone' && has('hurt-not-gone-once') && !r.goneUsed;
      if (saved) fate = 'hurt';
      const [lo, hi] = HURT_DAYS.high;
      hurtDays = lo + Math.floor(draw() * (hi - lo + 1));
    }
    out.push({ rid, kind: o.tier, fate, hurtDays, ...(saved ? { saved: true as const } : {}) });
    if (r.spec === 'fence' && !o.getOut) out.push({ rid, kind: 'fenced', fate: null, hurtDays: 0 });
  }
  return out;
}

/**
 * The debrief's crew lines (§4): each call's loss in order, then each brought recruit's share as the fold draws it
 * (`key` is the run's db key, every draw's seed): `DEZ · CLEAN RUN · 2 TO HAND`, `KOJI · HURT · 3 DAYS`, `MOSS FENCED IT · TAKE +1`.
 */
export function crewLines(o: {
  setup: Setup;
  calls: Call[];
  tier: Tier;
  key: string;
  getOut: boolean;
  recruits: { id: string; name: string; spec: Specialty; grade: Grade; toNext: number; traits: Trait[]; goneUsed: boolean }[];
  /** Ability labels by id (crew abilities spec §2): each recruit's line names what they pressed and what played at the end. */
  abilityLabels?: Record<string, string>;
}): string[] {
  const first = (id: string) => (o.recruits.find((r) => r.id === id)?.name.split(' ')[0] ?? id).toUpperCase();
  const played = (rid: string) => {
    const ids = [...o.calls.filter((c) => c.card === rid && c.ability).map((c) => c.ability!), ...(o.setup.ended ?? []).flatMap((x) => (abilityCard(x)?.rid === rid ? [abilityCard(x)!.ability] : []))];
    return [...new Set(ids)].map((id) => ` · ${(o.abilityLabels?.[id] ?? id).toUpperCase()}`).join('');
  };
  const days = (n: number) => `${n} DAY${n === 1 ? '' : 'S'}`;
  const lines = o.calls.flatMap((c) =>
    c.loss === 'held' ? [`${first(c.card)} · HELD`] : c.loss === 'hurt' ? [`${first(c.card)} · HURT · ${days(drawHurtDays(`${o.key}|${c.beat}|${c.card}|days`, 'med'))}`] : [],
  );
  // The FENCE line follows what the run says happened (setup.fenced), not whether this end was a GET OUT.
  for (const s of jobShares({ setup: o.setup, calls: o.calls, tier: o.tier, seed: o.key, recruits: o.recruits })) {
    const r = o.recruits.find((x) => x.id === s.rid)!;
    if (s.kind === 'fenced') {
      if (o.setup.fenced) lines.push(`${first(s.rid)} FENCED IT · TAKE +1`);
      continue;
    }
    const name = `${first(s.rid)}${played(s.rid)}`;
    if (s.kind === 'messy') lines.push(`${name} · MESSY`);
    else if (s.kind === 'blown') lines.push(s.fate === 'held' ? `${name} · HELD` : s.fate === 'gone' ? `${name} · GONE` : `${name} · HURT · ${days(s.hurtDays)}`);
    else if (r.grade >= 3) lines.push(`${name} · CLEAN RUN`);
    else {
      const left = r.toNext - growthStep(o.setup.tier, r.grade);
      lines.push(left > 0 ? `${name} · CLEAN RUN · ${Math.ceil(left)} TO ${GRADES[r.grade + 1]}` : `${name} · CLEAN RUN · NOW ${GRADES[r.grade + 1]}`);
    }
  }
  return lines;
}
