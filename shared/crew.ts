/**
 * Crew rules (crew spec 2026-10-19 §1–§2): money, slots, loyalty words, tonight's hires and errands, the odds of a
 * send and its seeded roll. Pure and shared, so the CREW screen shows the odds the server rolls.
 */
import { hashSeed } from './board';
import { GRADES, HIREABLE, type Band, type CrewBook, type ErrandKind, type Grade, type Risk, type Specialty, type Trait } from './crew-book';
import type { Extra } from './extras';
import { rng } from './gig/generate';
import { repTier } from './mission';

export interface Recruit {
  id: string;
  name: string;
  /** An extras id; null: none (shown as the initial). */
  face: string | null;
  origin: string;
  spec: Specialty;
  grade: Grade;
  /** Trait ids; `hidden` is one of them until the third run. */
  traits: string[];
  hidden: string | null;
  pitch: string;
  wage: number;
}

export const SIGN_ON = [100, 250, 500, 900] as const;
export const WAGE = [25, 40, 60, 90] as const;
export const BAIL = [300, 600, 900, 1200] as const;
export const DOC = 100;
/** Clean runs from each grade to the next. */
export const TO_NEXT = [3, 5, 7] as const;
export const BASE = [50, 60, 70, 80] as const;

const OFF_FIT = -15;
const RISK_MOD: Record<Risk, number> = { low: 10, med: 0, high: -15 };
const BLOWN_SHARE: Record<Risk, number> = { low: 0.2, med: 0.35, high: 0.5 };
const SPLIT: Record<Risk, [number, number, number]> = { low: [0.7, 0.3, 0], med: [0.55, 0.35, 0.1], high: [0.45, 0.3, 0.25] };
const HURT_DAYS: Record<Risk, [number, number]> = { low: [1, 2], med: [2, 3], high: [2, 4] };

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');

/** Roster slots: 2 + your best rep tier in any district (3–6). */
export function slots(rep: Record<string, number>): number {
  return 2 + Math.max(1, ...Object.values(rep).map(repTier));
}

export type LoyaltyWord = 'LOYAL' | 'STEADY' | 'UNSURE' | 'SHAKY';
export const loyaltyWord = (n: number): LoyaltyWord => (n >= 75 ? 'LOYAL' : n >= 50 ? 'STEADY' : n >= 25 ? 'UNSURE' : 'SHAKY');
export const LOYALTY_LINE: Record<LoyaltyWord, string> = {
  LOYAL: 'Would take a fall for you.',
  STEADY: 'Shows up. Gets paid. Fair enough.',
  UNSURE: 'Watching how you treat the others.',
  SHAKY: 'One more bad night and they walk. Or talk.',
};

export type HireCard = { recruit: Recruit; cost: number; locked?: undefined } | { locked: { grade: Grade; tier: 1 | 2 | 3 | 4; spec: Specialty }; recruit?: undefined; cost?: undefined };

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const traitFits = (t: Trait, s: Specialty) => t.for === 'any' || t.for.includes(s);

/**
 * Tonight's hires at `place` (spec §1): 2 or 3, two in three from the place's specialties, at the district tier's
 * top grade or one below, and a locked teaser one grade up below A Name. Seeded by (seed, place, day).
 */
export function hiresFor(o: {
  book: CrewBook;
  place: string;
  district: string;
  specs: Specialty[];
  tier: 1 | 2 | 3 | 4;
  day: number;
  seed: string;
  faces: Extra[];
  usedFaces: ReadonlySet<string>;
  origins: string[];
}): HireCard[] {
  const r = rng(hashSeed(`${o.seed}|${o.place}|${o.day}`));
  const own = o.specs.filter((s) => HIREABLE.includes(s));
  const top = (o.tier - 1) as Grade;
  const n = r() < 0.5 ? 2 : 3;
  const usedF = new Set(o.usedFaces);
  const usedN = new Set<string>();
  const origins = o.origins.filter((d) => (o.book.names[d] ?? []).length > 0);
  const out: HireCard[] = [];
  for (let i = 0; i < n; i++) {
    // Every draw happens in the same order whatever is found, so one missing table doesn't shift the rest.
    const fromOwn = r() < 2 / 3;
    const specR = r();
    const spec = fromOwn && own.length > 0 ? own[Math.floor(specR * own.length)] : HIREABLE[Math.floor(specR * HIREABLE.length)];
    const grade = (top > 0 && r() < 0.5 ? top - 1 : top) as Grade;
    const homeR = r();
    const origin = origins.includes(o.district) && homeR < 2 / 3 ? o.district : origins.length > 0 ? pick(r, origins) : o.district;
    const names = (o.book.names[origin] ?? []).filter((x) => !usedN.has(x));
    const name = names.length > 0 ? pick(r, names) : 'Nobody';
    usedN.add(name);
    const pool = (tags: string[]) => o.faces.filter((f) => tags.every((t) => f.tags.includes(t)) && !usedF.has(f.id));
    const fp = pool(['crew', spec]).length > 0 ? pool(['crew', spec]) : pool(['local']);
    const face = fp.length > 0 ? pick(r, fp).id : null;
    if (face) usedF.add(face);
    const tp = o.book.traits.filter((t) => traitFits(t, spec));
    const want = grade === 0 ? 1 : 2;
    const ts: string[] = [];
    while (ts.length < want && ts.length < tp.length) {
      const t = pick(r, tp).id;
      if (!ts.includes(t)) ts.push(t);
    }
    const pitches = o.book.pitches[`${spec}:${grade}`] ?? [];
    const pitch = pitches.length > 0 ? pick(r, pitches) : '';
    const id = `r-${hashSeed(`${o.seed}|${o.place}|${o.day}|${i}`).toString(36)}`;
    out.push({ recruit: { id, name, face, origin, spec, grade, traits: ts, hidden: want === 2 && ts.length === 2 ? ts[1] : null, pitch, wage: WAGE[grade] }, cost: SIGN_ON[grade] });
  }
  if (o.tier < 4) {
    const spec = own.length > 0 ? pick(r, own) : pick(r, HIREABLE);
    out.push({ locked: { grade: (top + 1) as Grade, tier: (o.tier + 1) as 1 | 2 | 3 | 4, spec } });
  }
  return out;
}

export interface ErrandInstance {
  id: string;
  kind: string;
  target: string | null;
  district: string;
  day: number;
  job?: string;
  place?: string;
}

const instanceId = (kind: string, target: string | null, day: number) => `${kind}:${target ?? '-'}@${day}`;

/** Tonight's errands (spec §2): per posted job, per district you're Known in, per district with heat; in file order. */
export function errandsFor(o: {
  book: CrewBook;
  day: number;
  posted: { job: string; place: string; district: string }[];
  rep: Record<string, number>;
  heat: Record<string, number>;
  districts: string[];
}): ErrandInstance[] {
  const out: ErrandInstance[] = [];
  for (const e of o.book.errands) {
    if (!e.needs) out.push({ id: instanceId(e.kind, null, o.day), kind: e.kind, target: null, district: '', day: o.day });
    else if (e.needs.on === 'job') for (const p of o.posted) out.push({ id: instanceId(e.kind, p.job, o.day), kind: e.kind, target: p.job, district: p.district, day: o.day, job: p.job, place: p.place });
    else {
      const when = e.needs.when;
      for (const d of o.districts) if (when === 'known' ? (o.rep[d] ?? 0) >= 20 : (o.heat[d] ?? 0) >= 1) out.push({ id: instanceId(e.kind, d, o.day), kind: e.kind, target: d, district: d, day: o.day });
    }
  }
  return out;
}

/** An instance back from its id; null when its kind is gone from the book or the id is malformed. */
export function parseInstance(id: string, o: { book: CrewBook; districtOfJob(job: string): string | null; placeOfJob(job: string): string | null }): ErrandInstance | null {
  const m = /^([a-z0-9-]+):(.+)@(-?\d+)$/.exec(id);
  if (!m) return null;
  const e = o.book.errands.find((x) => x.kind === m[1]);
  if (!e) return null;
  const day = Number(m[3]);
  const target = m[2] === '-' ? null : m[2];
  if (!e.needs) return { id, kind: e.kind, target: null, district: '', day };
  if (e.needs.on === 'district') return target ? { id, kind: e.kind, target, district: target, day } : null;
  if (!target) return null;
  return { id, kind: e.kind, target, district: o.districtOfJob(target) ?? '', day, job: target, place: o.placeOfJob(target) ?? undefined };
}

export interface CrewOdds {
  clean: number;
  messy: number;
  blown: number;
  hurt: number;
  held: number;
  gone: number;
  fits: boolean;
  why: string[];
}

/** A send's odds (spec §2): grade base, off-fit, risk, traits, heat above 3, the clamp; then the band and fate splits. */
export function crewOdds(o: { errand: ErrandKind; recruit: Recruit; traits: Trait[]; heat: number; goneUsed?: boolean }): CrewOdds {
  const e = o.errand;
  const why = [`${GRADES[o.recruit.grade]} ${BASE[o.recruit.grade]}`];
  let c: number = BASE[o.recruit.grade];
  const fits = e.suits.includes(o.recruit.spec);
  if (!fits) {
    c += OFF_FIT;
    why.push(`OFF-FIT ${signed(OFF_FIT)}`);
  }
  const rm = RISK_MOD[e.risk];
  c += rm;
  why.push(rm === 0 ? `${e.risk.toUpperCase()} RISK` : `${e.risk.toUpperCase()} RISK ${signed(rm)}`);
  for (const t of o.traits)
    if (t.effect.kind === 'odds' && (t.effect.errand === 'any' || t.effect.errand === e.kind)) {
      c += t.effect.delta;
      why.push(`${t.label.toUpperCase()} ${signed(t.effect.delta)}`);
    }
  if (o.heat > 3) {
    const h = -5 * (o.heat - 3);
    c += h;
    why.push(`HEAT ${o.heat} ${signed(h)}`);
  }
  const clean = Math.min(95, Math.max(5, c));
  const rest = 100 - clean;
  const share = BLOWN_SHARE[e.risk] * (o.recruit.spec === 'muscle' && e.risk === 'high' ? 0.75 : 1);
  const blown = Math.round(rest * share);
  const [, hs, gs] = SPLIT[e.risk];
  let held = Math.round(blown * hs);
  let gone = Math.round(blown * gs);
  let hurt = blown - held - gone;
  const has = (k: string) => o.traits.some((t) => t.effect.kind === k);
  if (has('never-held')) [hurt, held] = [hurt + held, 0];
  if (has('hurt-not-gone-once') && !o.goneUsed) [hurt, gone] = [hurt + gone, 0];
  return { clean, messy: rest - blown, blown, hurt, held, gone, fits, why };
}

export interface Roll {
  band: Band;
  fate: 'hurt' | 'held' | 'gone' | null;
  hurtDays: number;
  sol: number | null;
  line: string;
}

/** A send's one seeded roll: band, fate, hurt days (drawn whatever the fate), sol (steps of 10) and the line, always drawn in that order. */
export function rollSend(o: { odds: CrewOdds; errand: ErrandKind; seed: string; vars: Record<string, string> }): Roll {
  const r = rng(hashSeed(o.seed));
  const x = r() * 100;
  const band: Band = x < o.odds.clean ? 'clean' : x < o.odds.clean + o.odds.messy ? 'messy' : 'blown';
  const y = r() * Math.max(1, o.odds.blown);
  const fate = band !== 'blown' ? null : y < o.odds.hurt ? 'hurt' : y < o.odds.hurt + o.odds.held ? 'held' : 'gone';
  const [lo, hi] = HURT_DAYS[o.errand.risk];
  const days = lo + Math.floor(r() * (hi - lo + 1));
  const b = o.errand.bands[band];
  const sr = r();
  const sol = b.effect.sol ? Math.min(b.effect.sol[1], b.effect.sol[0] + 10 * Math.floor(sr * (Math.floor((b.effect.sol[1] - b.effect.sol[0]) / 10) + 1))) : null;
  const line = pick(r, b.lines).replace(/\{(\w+)\}/g, (all, k: string) => o.vars[k] ?? all);
  return { band, fate, hurtDays: days, sol, line };
}

/** When a send lands: hours × 2/3 for a RUNNER × each `hours` trait, in whole minutes. */
export function dueAt(sentAt: number, errand: ErrandKind, recruit: Recruit, traits: Trait[]): number {
  let m = errand.hours * 60 * (recruit.spec === 'runner' ? 2 / 3 : 1);
  for (const t of traits) if (t.effect.kind === 'hours') m *= 1 + t.effect.pct / 100;
  return sentAt + Math.round(m);
}
