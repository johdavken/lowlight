/**
 * Crew rules (crew spec 2026-10-19 §1–§2): money, slots, loyalty words, tonight's hires and errands, the odds of a
 * send and its seeded roll. Pure and shared, so the CREW screen shows the odds the server rolls.
 */
import { hashSeed } from './board';
import { GRADES, HIREABLE, normalSpec, type Ability, type Band, type CrewBook, type JobEffect, type TraitEffect, type ErrandKind, type Grade, type Risk, type Specialty, type Trait } from './crew-book';
import type { Extra } from './extras';
import { collectOffers, ROUTES, type GoodsKind, type Lot } from './goods';
import { rng } from './rng';
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
  /** The ability drawn at hire (crew abilities spec §1); absent on recruits from before abilities. */
  abilities?: string[];
}

/** Ability slots by grade (GREEN, HAND, PRO, VET) and the most a recruit can know (crew abilities spec §1). */
export const ABILITY_SLOTS = [1, 1, 2, 2] as const;
export const KNOWN_MAX = 4;

const abilityFits = (a: Ability, s: Specialty) => a.for === 'any' || a.for.includes(s);

/** Abilities a recruit of `spec` at `grade` could still learn: their specialty, `from` at or below the grade, not known; file order. */
export function abilityPool(book: CrewBook, spec: Specialty, grade: Grade, known: string[]): Ability[] {
  return book.abilities.filter((a) => abilityFits(a, spec) && a.from <= grade && !known.includes(a.id));
}

/** The ability a hire comes with: one from the pool for their grade, seeded; null when there's none. */
export function hireAbility(book: CrewBook, r: Recruit, seed: string): string | null {
  const pool = abilityPool(book, r.spec, r.grade, []);
  return pool.length > 0 ? pool[Math.floor(rng(hashSeed(seed))() * pool.length)].id : null;
}

/** A promotion's pick (crew abilities spec §1): two from the pool at the new grade, one or none when that's all there is. */
export function offerFor(book: CrewBook, r: Recruit, known: string[], grade: Grade, seed: string): string[] {
  const pool = abilityPool(book, r.spec, grade, known).map((a) => a.id);
  if (pool.length <= 2) return pool;
  const draw = rng(hashSeed(`${seed}|${r.id}|offer|${grade}`));
  const first = pool.splice(Math.floor(draw() * pool.length), 1)[0];
  return [first, pool[Math.floor(draw() * pool.length)]];
}

/** An ability's job effect in the profile's words (crew abilities spec §4). */
export function jobWords(e: JobEffect): string {
  switch (e.kind) {
    case 'cross':
      return `${e.stat.toUpperCase()} CHECKS ONE POSITION BETTER`;
    case 'die':
      return '+1d ON ANY ROLL';
    case 'getaway':
      return 'ONE POSITION BETTER GETTING OUT';
    case 'again':
      return 'CALL THEM AGAIN, NO RISK';
    case 'save':
      return 'A MISS BECOMES A 4–5';
    case 'alarm':
      return 'ALARM −1 AFTER A ROLL';
    case 'nerve':
      return 'NERVE +1 AFTER A ROLL';
    case 'take':
      return 'TAKE +1 AT THE END';
    case 'heat':
      return 'HEAT −1 ON A MESSY END';
    case 'rerun':
      return 'ROLL IT AGAIN, THE SECOND STANDS';
    case 'lookout':
      return 'A STEP MORE NOW, NEXT A STEP SMALLER';
    case 'hold-alarm':
      return 'HOLDS ALARM AT 3 ONCE, TAKE −1';
    case 'talk-past':
      return 'ROLL ON COOL, A MISS ALARM +1';
    case 'talk-down':
      return "A BLOW-UP BECOMES PART, THEY'RE HELD";
    case 'inside-info':
      return 'THE NEXT ROLL IGNORES THE CUT';
    case 'undo':
      return 'A MISS NEVER HAPPENED';
    case 'take-hit':
      return "TAKES EVERY COST, THEY'RE HURT";
    case 'stand-firm':
      return 'FIRST COST EACH ROLL GONE, UNTIL A MISS';
    case 'sell-part':
      return 'A PART TAKE PAYS FULL, −25 %';
    case 'pay-off':
      return 'PAY −30 %, ALARM UNDER 2 FOR THE GRADE';
    case 'setup-position':
      return '−1d NOW, NEXT A POSITION BETTER';
    case 'setup-die':
      return 'A STEP SMALLER NOW, NEXT +1d';
    case 'greed-effect':
      return 'A STEP MORE EFFECT, ALARM +1';
    case 'greed-die':
      return '+1d, A MISS LOSES 1 TAKE';
    case 'gamble-cost':
      return 'A 4–5: 4+ CLEAN, 1–3 ONE MORE COST';
    case 'gamble-miss':
      return 'A MISS: 4+ A 4–5, 1–3 ONE MORE COST';
    case 'trade-alarm':
      return 'ALARM −1, TAKE −1';
    case 'trade-nerve':
      return 'NERVE +2, ALARM +1';
    case 'end-take':
      return 'TAKE +1, HEAT +1';
    case 'end-cool':
      return 'HEAT −2, PAY −20%';
  }
}

/** An ability's errand effect in the profile's words: `RECORDS +10`, `HUSTLE PAY +15%`, `ERRANDS 20% FASTER`. */
export function errandWords(e: TraitEffect): string {
  const signedPct = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
  const kind = (k: string) => (k === 'any' ? 'ANY ERRAND' : k.toUpperCase().replace(/-/g, ' '));
  switch (e.kind) {
    case 'odds':
      return `${kind(e.errand)} ${signed(e.delta)}`;
    case 'pay':
      return `${kind(e.errand)} PAY ${signedPct(e.pct)}`;
    case 'hours':
      return `ERRANDS ${Math.abs(e.pct)}% ${e.pct < 0 ? 'FASTER' : 'SLOWER'}`;
    case 'never-held':
      return 'NEVER HELD';
    case 'hurt-not-gone-once':
      return 'HURT, NOT GONE, ONCE';
    default:
      return e.kind.toUpperCase();
  }
}

export const SIGN_ON = [100, 250, 500, 900] as const;
export const WAGE = [25, 40, 60, 90] as const;
export const BAIL = [300, 600, 900, 1200] as const;
export const DOC = 100;
/** Clean runs from each grade to the next. */
export const TO_NEXT = [3, 5, 7] as const;
/** How far a clean job moves a recruit: half on a job below their grade (GREEN..VET read tiers 1–4); full on an errand, or a job from before tiers were kept. */
export const growthStep = (tier: number | undefined, grade: number): number => (tier !== undefined && tier < grade + 1 ? 0.5 : 1);
export const BASE = [50, 60, 70, 80] as const;

const OFF_FIT = -15;
const RISK_MOD: Record<Risk, number> = { low: 10, med: 0, high: -15 };
const BLOWN_SHARE: Record<Risk, number> = { low: 0.2, med: 0.35, high: 0.5 };
export const SPLIT: Record<Risk, [number, number, number]> = { low: [0.7, 0.3, 0], med: [0.55, 0.35, 0.1], high: [0.45, 0.3, 0.25] };
export const HURT_DAYS: Record<Risk, [number, number]> = { low: [1, 2], med: [2, 3], high: [2, 4] };

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

/** Where a free card came from (crew spec §5): a contact who vouched, or a job's `gives: recruit`. */
export type HireFrom = { vouched: string; name: string } | { job: string; title: string };
/** How long an unfinished rescue holds bail, LEAVE THEM and SPRING THEM (crew spec §5): a day from GO IN, across 06:00, not for good. */
export const RESCUE_HOLD = 1440;

/** Whether `run` is a rescue still under way at story minute `now`. */
export function rescueOpen(run: { done: boolean; spring?: { recruit: string }; setup?: { at: number } }, now: number): boolean {
  return !run.done && run.spring !== undefined && run.setup !== undefined && now - run.setup.at < RESCUE_HOLD;
}

export type HireCard = { recruit: Recruit; cost: number; locked?: undefined; from?: HireFrom; loyalty?: number } | { locked: { grade: Grade; tier: 1 | 2 | 3 | 4; spec: Specialty }; recruit?: undefined; cost?: undefined; from?: undefined; loyalty?: undefined };

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const traitFits = (t: Trait, s: Specialty) => t.for === 'any' || t.for.includes(s);

const withNames = (book: CrewBook, origins: string[]) => origins.filter((d) => (book.names[d] ?? []).length > 0);

/**
 * One recruit drawn from `r` (crew spec §1): origin (two in three from `district` when it has names), name, face (a crew
 * face of the specialty, else a local one; its name fits the face's man/woman tag), traits and pitch, in that order. Adds
 * the name and face it used to the sets.
 * `origins` must already be the ones with names.
 */
export function drawRecruit(o: { book: CrewBook; r: () => number; id: string; spec: Specialty; grade: Grade; district: string; origins: string[]; faces: Extra[]; usedFaces: Set<string>; usedNames: Set<string> }): Recruit {
  const { r, spec, grade } = o;
  const homeR = r();
  const origin = o.origins.includes(o.district) && homeR < 2 / 3 ? o.district : o.origins.length > 0 ? pick(r, o.origins) : o.district;
  // Unused names from home first, then from anywhere (a big crew can spend a district), then home's again.
  const unused = (l: string[]) => l.filter((x) => !o.usedNames.has(x));
  const home = o.book.names[origin] ?? [];
  const names = [unused(home), unused(Object.values(o.book.names).flat()), home].find((l) => l.length > 0) ?? [];
  // The name's draw comes before the face's, as it always has, but is spent after it: the face picks first and the
  // name comes from those that fit it (marked the same or unmarked), so the cards only change where they clashed.
  const nameR = names.length > 0 ? r() : 0;
  const pool = (tags: string[]) => o.faces.filter((f) => tags.every((t) => f.tags.includes(t)) && !o.usedFaces.has(f.id));
  const fp = pool(['crew', spec]).length > 0 ? pool(['crew', spec]) : pool(['local']);
  const face = fp.length > 0 ? pick(r, fp) : null;
  if (face) o.usedFaces.add(face.id);
  const sex = face?.tags.find((t): t is 'man' | 'woman' => t === 'man' || t === 'woman');
  const fits = sex ? names.filter((x) => (o.book.genders?.[x] ?? sex) === sex) : names;
  const from = fits.length > 0 ? fits : names;
  const name = from.length > 0 ? from[Math.floor(nameR * from.length)] : 'Nobody';
  o.usedNames.add(name);
  const tp = o.book.traits.filter((t) => traitFits(t, spec));
  const want = grade === 0 ? 1 : 2;
  const ts: string[] = [];
  while (ts.length < want && ts.length < tp.length) {
    const t = pick(r, tp).id;
    if (!ts.includes(t)) ts.push(t);
  }
  const pitches = o.book.pitches[`${spec}:${grade}`] ?? [];
  const pitch = pitches.length > 0 ? pick(r, pitches) : '';
  const recruit: Recruit = { id: o.id, name, face: face?.id ?? null, origin, spec, grade, traits: ts, hidden: want === 2 && ts.length === 2 ? ts[1] : null, pitch, wage: WAGE[grade] };
  // Drawn last, from its own seed, so every draw above is as it was before abilities.
  const ability = hireAbility(o.book, recruit, `${o.id}|ability`);
  return { ...recruit, abilities: ability ? [ability] : [] };
}

type FreeDraw = { book: CrewBook; district: string; seed: string; faces: Extra[]; usedFaces: ReadonlySet<string>; usedNames?: ReadonlySet<string>; origins: string[] };

/**
 * A contact's vouched hire this story week (crew spec §5): free, one grade above your top grade in `district`
 * (capped at VET), loyalty 70, the named specialty or one drawn. Seeded by (seed, contact, week).
 */
export function vouchedFor(o: FreeDraw & { contact: string; contactName: string; place: string; tier: 1 | 2 | 3 | 4; week: number; spec: Specialty | null }): HireCard {
  const key = `${o.seed}|vouch|${o.contact}|${o.week}`;
  const r = rng(hashSeed(key));
  const specR = r();
  const spec = o.spec ?? HIREABLE[Math.floor(specR * HIREABLE.length)];
  const grade = Math.min(3, o.tier) as Grade;
  const recruit = drawRecruit({ book: o.book, r, id: `r-${hashSeed(key).toString(36)}`, spec, grade, district: o.district, origins: withNames(o.book, o.origins), faces: o.faces, usedFaces: new Set(o.usedFaces), usedNames: new Set(o.usedNames) });
  return { recruit, cost: 0, loyalty: 70, from: { vouched: o.contact, name: o.contactName } };
}

/** The free card a job's `gives: recruit` leaves at its place (crew spec §5): loyalty 50, seeded by (seed, run key). */
export function jobRecruitCard(o: FreeDraw & { runKey: string; title: string; place: string; spec: Specialty; grade: Grade }): HireCard {
  const key = `${o.seed}|job|${o.runKey}`;
  const recruit = drawRecruit({ book: o.book, r: rng(hashSeed(key)), id: `r-${hashSeed(key).toString(36)}`, spec: o.spec, grade: o.grade, district: o.district, origins: withNames(o.book, o.origins), faces: o.faces, usedFaces: new Set(o.usedFaces), usedNames: new Set(o.usedNames) });
  return { recruit, cost: 0, loyalty: 50, from: { job: o.runKey, title: o.title } };
}

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
  /** Names on anyone already hired, as for faces. */
  usedNames?: ReadonlySet<string>;
  origins: string[];
}): HireCard[] {
  const r = rng(hashSeed(`${o.seed}|${o.place}|${o.day}`));
  const own = o.specs.filter((s) => HIREABLE.includes(s));
  const top = (o.tier - 1) as Grade;
  const n = r() < 0.5 ? 2 : 3;
  const usedF = new Set(o.usedFaces);
  const usedN = new Set(o.usedNames);
  const origins = withNames(o.book, o.origins);
  const out: HireCard[] = [];
  for (let i = 0; i < n; i++) {
    // Every draw happens in the same order whatever is found, so one missing table doesn't shift the rest.
    const fromOwn = r() < 2 / 3;
    const specR = r();
    const spec = fromOwn && own.length > 0 ? own[Math.floor(specR * own.length)] : HIREABLE[Math.floor(specR * HIREABLE.length)];
    const grade = (top > 0 && r() < 0.5 ? top - 1 : top) as Grade;
    const id = `r-${hashSeed(`${o.seed}|${o.place}|${o.day}|${i}`).toString(36)}`;
    const recruit = drawRecruit({ book: o.book, r, id, spec, grade, district: o.district, origins, faces: o.faces, usedFaces: usedF, usedNames: usedN });
    out.push({ recruit, cost: SIGN_ON[grade] });
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
  /** Groundwork (tier 3 contracts spec §3): the contract's run, the piece, and the specialty it suits. */
  run?: string;
  piece?: string;
  spec?: Specialty;
  /** A COLLECT offer's kind of goods (crew goods spec §2). */
  goods?: string;
  /** The lot a sale moves (crew goods spec §3). */
  lot?: string;
}

/** What the right specialty adds to a piece of groundwork's odds. */
export const GROUNDWORK_MATCH = 10;

const instanceId = (kind: string, target: string | null, day: number) => `${kind}:${target ?? '-'}@${day}`;

/** Tonight's errands (spec §2): per posted job, per district you're Known in, per district with heat; in file order. */
export function errandsFor(o: {
  book: CrewBook;
  day: number;
  posted?: { job: string; place: string; district: string }[];
  rep: Record<string, number>;
  heat: Record<string, number>;
  districts: string[];
  /** A contract's open groundwork. */
  runs?: { run: string; piece: string; spec: Specialty }[];
  /** Draws the night's COLLECT offers; none without it. */
  seed?: string;
  stash?: Lot[];
}): ErrandInstance[] {
  const out: ErrandInstance[] = [];
  const kinds = (o.book.goods ?? []).map((g) => g.id);
  const missions = o.book.errands.filter((e) => e.needs?.on === 'offer' && !e.retired).map((e) => ({ kind: e.kind, gives: (e.gives ?? []).flatMap((g) => (g === 'any' ? kinds : [g])) }));
  const offers = o.seed === undefined ? [] : collectOffers({ seed: o.seed, day: o.day, missions, districts: o.districts.filter((d) => (o.rep[d] ?? 0) >= 20) });
  for (const e of o.book.errands) {
    if (e.retired) continue;
    if (!e.needs) out.push({ id: instanceId(e.kind, null, o.day), kind: e.kind, target: null, district: '', day: o.day });
    else if (e.needs.on === 'offer') {
      for (const f of offers) if (f.kind === e.kind) out.push({ id: instanceId(e.kind, `${f.district}:${f.goods}`, o.day), kind: e.kind, target: `${f.district}:${f.goods}`, district: f.district, day: o.day, goods: f.goods });
    } else if (e.needs.on === 'lot') {
      // Every district: the view opens each to who can sell there.
      for (const l of o.stash ?? []) if (!l.out) for (const d of new Set([...o.districts, ...(l.district ? [l.district] : [])])) out.push({ id: instanceId(e.kind, `${l.id}:${d}`, o.day), kind: e.kind, target: `${l.id}:${d}`, district: d, day: o.day, lot: l.id });
    } else if (e.needs.on === 'run') for (const r of o.runs ?? []) out.push({ id: instanceId(e.kind, `${r.run}:${r.piece}:${r.spec}`, o.day), kind: e.kind, target: `${r.run}:${r.piece}:${r.spec}`, district: '', day: o.day, ...r });
    else if (e.needs.on === 'job') for (const p of o.posted ?? []) out.push({ id: instanceId(e.kind, p.job, o.day), kind: e.kind, target: p.job, district: p.district, day: o.day, job: p.job, place: p.place });
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
  if (e.needs.on === 'offer' || e.needs.on === 'lot') {
    const [a, b] = target.split(':');
    if (!a || !b) return null;
    return e.needs.on === 'offer' ? { id, kind: e.kind, target, district: a, day, goods: b } : { id, kind: e.kind, target, district: b, day, lot: a };
  }
  if (e.needs.on === 'run') {
    const [run, piece, spec] = target.split(':');
    return run && piece && spec ? { id, kind: e.kind, target, district: '', day, run, piece, spec: normalSpec(spec) as Specialty } : null;
  }
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
export function crewOdds(o: { errand: ErrandKind; recruit: Recruit; traits: Trait[]; heat: number; goneUsed?: boolean; match?: Specialty }): CrewOdds {
  const e = o.errand;
  const why = [`${GRADES[o.recruit.grade]} ${BASE[o.recruit.grade]}`];
  let c: number = BASE[o.recruit.grade];
  const fits = e.suits.includes(o.recruit.spec);
  if (!fits) {
    c += OFF_FIT;
    why.push(`OFF-FIT ${signed(OFF_FIT)}`);
  }
  // A piece of groundwork suits one specialty (tier 3 contracts spec §3).
  if (o.match === o.recruit.spec) {
    c += GROUNDWORK_MATCH;
    why.push(`THEIR TRADE ${signed(GROUNDWORK_MATCH)}`);
  }
  const rm = RISK_MOD[e.risk];
  c += rm;
  why.push(rm === 0 ? `${e.risk.toUpperCase()} RISK` : `${e.risk.toUpperCase()} RISK ${signed(rm)}`);
  for (const t of o.traits)
    if (t.effect.kind === 'odds' && (t.effect.errand === 'any' || t.effect.errand === e.kind || t.effect.errand === e.group)) {
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

/** A sale as `spec` runs it: the route's hours and risk; the right route and a fence fit (crew goods spec §3). */
export function sellErrand(base: ErrandKind, goods: GoodsKind, spec: Specialty): ErrandKind {
  const r = ROUTES[spec];
  return { ...base, ...(r ? { hours: r.hours, risk: r.risk } : {}), suits: [goods.route, 'fence'] };
}

/** What Buy It Cheap costs up front: its share of the lot's value, in steps of 10. */
export const buyCost = (e: ErrandKind, g: GoodsKind | undefined): number => (e.cost && g ? Math.round((g.value * e.cost) / 10) * 10 : 0);

/** Does a trait carry this effect, as its effect or beside it? */
export const traitHas = (t: Trait, kind: TraitEffect['kind']): boolean => t.effect.kind === kind || t.also?.kind === kind;

/** When a send lands: hours × each `hours` trait, in whole minutes. */
export function dueAt(sentAt: number, errand: ErrandKind, recruit: Recruit, traits: Trait[]): number {
  let m = errand.hours * 60;
  for (const t of traits) if (t.effect.kind === 'hours') m *= 1 + t.effect.pct / 100;
  return sentAt + Math.round(m);
}
