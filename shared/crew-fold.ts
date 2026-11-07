/**
 * The crew fold (crew spec 2026-10-19 §3): what you did (hires, sends, recalls…) folded with the kit on one
 * timeline. Results, promotions, loyalty, wages, hurt days and losses are never stored: they're derived here from
 * the events, the seeds and the clock, so rewind and BRANCH HERE are exact.
 */
import { hashSeed, storyDay } from './board';
import { normalSpec, GRADES, type Ability, type Band, type CrewBook, type ErrandKind, type Grade, type Specialty, type Trait } from './crew-book';
import { buyCost, sellErrand, traitHas, ABILITY_SLOTS, growthStep, abilityPool, crewOdds, DOC, dueAt, hireAbility, KNOWN_MAX, loyaltyWord, offerFor, rollSend, TO_NEXT, WAGE, type ErrandInstance, type Recruit, type Roll } from './crew';
import { rng } from './rng';
import { ROUTES, salePrice, STASH_MAX, wantedFor, type GoodsKind, type Lot } from './goods';
import { foldKit, type Kit, type KitEvent, type Tier } from './mission';
import { drawHurtDays, jobShares, type Call, type Setup } from './hand';

export type CrewEvent =
  /** `loyalty` and `vouched` (crew spec §5): a vouched or job card's starting loyalty, and the contact who vouched. */
  | { type: 'hire'; at: number; recruit: Recruit; place: string; cost: number; loyalty?: number; vouched?: string }
  /** SPRING THEM (crew spec §5): posts the rescue `job` (a spring file id) tonight; only while held, once a day. */
  | { type: 'spring'; at: number; job: string }
  | { type: 'send'; at: number; errand: string }
  | { type: 'recall' | 'doc' | 'letgo' | 'leave'; at: number }
  | { type: 'bail'; at: number; cost: number }
  /** Crew abilities (spec 2026-11-01 §5): KEEP on a promotion's pick (`grade` is the promotion it answers), and the loadout. */
  | { type: 'learn'; at: number; ability: string; grade: Grade }
  | { type: 'slot'; at: number; ability: string; out?: string }
  | { type: 'unslot'; at: number; ability: string };

export interface CrewResult {
  at: number;
  band: Band;
  fate: 'hurt' | 'held' | 'gone' | null;
  line: string;
  /** What it did, for the screen: `+340 SOL · STRAND REP +1`, `HURT · 3 DAYS`. */
  effects: string;
  promoted?: { to: Grade; trait?: string };
  /** A job's line (the hand, a spring), not an errand's: the `[crew]` line leaves these to the debrief. */
  from?: 'job';
}

export type Gone = 'dead' | 'walked' | 'talked' | 'let go' | 'left';

export interface CrewMember {
  recruit: Recruit;
  state: 'ready' | 'out' | 'hurt' | 'held' | 'gone' | 'job';
  /** On a job (the hand spec §1): its title, until it ends. */
  job?: string;
  gone?: Gone;
  /** When they went (any reason). */
  goneAt?: number;
  /** The contact who vouched for them (crew spec §5). */
  vouched?: string;
  /** Tonight's rescue while held: the spring file and the story day it was posted (crew spec §5). */
  spring?: { job: string; day: number };
  due?: number;
  errand?: string;
  hurtDays?: number;
  /** Away tonight (a `busy N-in-7` trait): can't be sent. */
  busy: boolean;
  runs: Record<Band, number>;
  /** Clean runs still needed for the next grade (0 at VET). */
  toNext: number;
  /** Hidden; shown as a word. */
  loyalty: number;
  /** The trait ids shown on the profile. */
  revealed: string[];
  /** Newest first. */
  log: CrewResult[];
  /** A hurt-not-gone-once trait has been spent: the odds shown count gone again. */
  goneUsed: boolean;
  /** When and where they signed on. */
  hired: { at: number; place: string };
  /** Abilities known, in learn order, and the ones slotted (crew abilities spec §1). */
  abilities: string[];
  slotted: string[];
  /** Promotions' picks still open, oldest first: two (or fewer) abilities to KEEP one of. */
  picks: { grade: Grade; offer: string[] }[];
}

export interface CrewState {
  /** In hire order. */
  members: CrewMember[];
  /** Prep flags per job run (`<jobId>@<day>`). */
  prep: Record<string, Record<string, string>>;
  /** Groundwork sent and landed, by contract run (tier 3 contracts spec §3). */
  groundwork?: Record<string, { piece: string; day: number }[]>;
  reports?: Record<string, { band: Band; line: string }>;
  /** Lots held (crew goods spec §1). */
  stash?: Lot[];
  /** Job runs (`<jobId>@<day>`) a SCOUT has shown. */
  scouted: string[];
  /** Today's errand instances already sent (recalled ones too). */
  taken: string[];
  latest: number | null;
  /** Tonight's wages: whoever has run since the last 06:00. */
  wages: number;
  /** Story days a rescue was posted on (SPRING THEM: one a night). */
  springDays?: number[];
}

/** Talking (held and SHAKY) puts this much heat on the recruit's origin. */
const TALK_HEAT = 2;
const UNPAID = -15;
const HELD_NIGHT = -10;
const BLOWN_SURVIVED = -10;
const CLEAN = 5;
const BAIL_PAID = 15;
const CREWMATE_GONE = -5;
const START_LOYALTY = 50;

/**
 * A job with the hand (spec 2026-10-29-the-hand §1–§4): its run's db key (every draw's seed), title and district, the
 * SETUP card, the calls and how it ended (null: still going).
 */
export interface FoldJob {
  key: string;
  title: string;
  district: string | null;
  setup: Setup;
  calls: Call[];
  end: { at: number; tier: Tier; getOut: boolean } | null;
  /** A spring job (crew spec §5): the held recruit its clean or messy end frees. */
  spring?: string;
  /** The kind of goods its clean or messy end drops (crew goods spec §6). */
  drops?: string;
}

type Item =
  | { at: number; kind: 'event'; rid: string; ev: CrewEvent; retried?: true }
  | { at: number; kind: 'land'; rid: string; send: number; inst: ErrandInstance | null; errand: ErrandKind | null; roll: Roll | null }
  | { at: number; kind: 'jobStart'; job: FoldJob }
  | { at: number; kind: 'jobCall'; job: FoldJob; call: Call }
  | { at: number; kind: 'jobEnd'; job: FoldJob };

interface M extends Omit<CrewMember, 'busy'> {
  /** The job they're on (its key). */
  jobKey?: string;
  send: number | null;
  /** Sol paid up front on this send, back if they're recalled (Buy It Cheap). */
  paid?: number;
  clean: number;
  resolved: number;
  extraWage: number;
  /** On a job or an errand since the last 06:00: only then is a wage due. */
  worked?: boolean;
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const upper = (s: string) => s.toUpperCase().replace(/-/g, ' ');
const signedN = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
const firstName = (r: Recruit) => r.name.split(' ')[0];

export function foldWithCrew(o: {
  start: { deck: string | null; pocket?: string | null; nerveMax: number; from: number };
  kitEvents: KitEvent[];
  crew: CrewEvent[][];
  now: number;
  book: CrewBook;
  seed: string;
  instance(id: string): ErrandInstance | null;
  districtOf?(e: KitEvent): string | null;
  /** Display names for `{place}`, `{district}` and `{job}` in result lines; ids when absent. */
  names?: { place?(id: string): string; district?(id: string): string; job?(id: string): string };
  /** Jobs played with the hand: who went, the calls, the end. */
  jobs?: FoldJob[];
  /** A hire place's district: where the first lot starts (crew goods spec §5). */
  placeDistrict?(place: string): string | null;
}): { kit: Kit; crew: CrewState } {
  const traitOf = (id: string): Trait | undefined => o.book.traits.find((t) => t.id === id);
  const traitsOf = (r: Recruit): Trait[] => r.traits.map(traitOf).filter((t): t is Trait => t !== undefined);
  const has = (r: Recruit, kind: Trait['effect']['kind']) => traitsOf(r).some((t) => t.effect.kind === kind);
  const abilityOf = (id: string): Ability | undefined => o.book.abilities.find((a) => a.id === id);
  const known = (ids: string[]) => ids.filter((id) => abilityOf(id) !== undefined);
  /** An errand reads the recruit's traits and their slotted abilities' errand effects (crew abilities spec §3). */
  const errandTraits = (m: M): Trait[] => traitsOf(m.recruit);
  const hasOn = (m: M, kind: Trait['effect']['kind']) => errandTraits(m).some((t) => t.effect.kind === kind);
  const busyOn = (r: Recruit, day: number): boolean => {
    const b = traitsOf(r).find((t) => t.effect.kind === 'busy');
    return !!b && b.effect.kind === 'busy' && rng(hashSeed(`${o.seed}|${r.id}|busy|${day}`))() < b.effect.days / 7;
  };

  // Each recruit's list in time order, a hire first in its minute (lists merge from several room dbs); anything
  // before the hire does nothing; lists without one are skipped. Roster order: hire time, then id.
  const rank = (e: CrewEvent) => (e.type === 'hire' ? 0 : 1);
  const hireOf = (l: CrewEvent[]) => l.find((e): e is Extract<CrewEvent, { type: 'hire' }> => e.type === 'hire');
  const lists = o.crew
    .map((l) => [...l].sort((a, b) => a.at - b.at || rank(a) - rank(b)))
    .filter((l) => hireOf(l) !== undefined)
    .sort((a, b) => hireOf(a)!.at - hireOf(b)!.at || hireOf(a)!.recruit.id.localeCompare(hireOf(b)!.recruit.id));
  const items: Item[] = lists.flatMap((l) => l.map((ev) => ({ at: ev.at, kind: 'event' as const, rid: hireOf(l)!.recruit.id, ev })));
  // Within a minute: a hire, a job's end, the other crew actions, a job's start, a call's loss, then SPRING THEM. A job
  // that starts in the minute the last one ended takes the crew it brought back (whatever order the runs came in); a GO
  // IN in the minute of a hire, a RECALL, a doc or a bail takes them (final review I1); SPRING THEM in the minute a job
  // took them finds them held.
  const RANK = { jobEnd: 1, jobStart: 3, jobCall: 4 } as const;
  const rankOf = (it: Item) => (it.kind === 'event' ? (it.ev.type === 'hire' ? 0 : it.ev.type === 'spring' ? 5 : 2) : RANK[it.kind as keyof typeof RANK]);
  const jobItems: Extract<Item, { kind: keyof typeof RANK }>[] = [];
  for (const job of o.jobs ?? []) {
    jobItems.push({ at: job.setup.at, kind: 'jobStart', job });
    for (const call of job.calls) if (call.loss) jobItems.push({ at: call.at, kind: 'jobCall', job, call });
    if (job.end) jobItems.push({ at: job.end.at, kind: 'jobEnd', job });
  }
  items.push(...jobItems);
  // The fold applies items in time order, then as listed: list them in rank order within a minute.
  items.sort((a, b) => a.at - b.at || rankOf(a) - rankOf(b));
  const dayOf = (id: string) => Number(/@(-?\d+)$/.exec(id)?.[1] ?? NaN);

  const members: M[] = [];
  const byId = new Map<string, M>();
  /** Story days a rescue was posted on (one a night, crew spec §5), kept after it ends or they're bailed (final review I2). */
  const springDays = new Set<number>();
  const prep: CrewState['prep'] = {};
  const groundwork: NonNullable<CrewState['groundwork']> = {};
  const reports: NonNullable<CrewState['reports']> = {};
  const scouted: string[] = [];
  const stash: Lot[] = [];
  const goodsOf = (id: string): GoodsKind | undefined => o.book.goods?.find((g) => g.id === id);
  const costOf = (e: ErrandKind, goods: string) => buyCost(e, goodsOf(goods));
  /** Tonight's wanted kind in a district: each district draws alone, so one will do. */
  const wantedIn = (district: string, day: number) => wantedFor({ seed: o.seed, day, districts: [district], kinds: (o.book.goods ?? []).map((g) => g.id) })[district];
  const sent: string[] = [];
  let latest: number | null = null;
  let sends = 0;

  const goneFor = (m: M, why: Gone, at: number) => {
    m.state = 'gone';
    m.gone = why;
    m.goneAt = at;
    delete m.spring;
    m.send = null;
    delete m.due;
    delete m.errand;
    if (why === 'dead') for (const x of members) if (x !== m && x.state !== 'gone') x.loyalty = clamp(x.loyalty + CREWMATE_GONE);
  };

  /** A clean run (errand or job): loyalty, a wage-on-clean bump, and toward the next grade (a trait drawn on promotion). */
  const cleanRun = (m: M, step = 1): CrewResult['promoted'] => {
    const r = m.recruit;
    m.loyalty = clamp(m.loyalty + CLEAN);
    m.extraWage += traitsOf(r).reduce((n, t) => (t.effect.kind === 'wage-on-clean' ? n + t.effect.n : n), 0);
    if (r.grade >= 3) return undefined;
    m.clean += step;
    if (m.clean < TO_NEXT[r.grade as 0 | 1 | 2]) return undefined;
    const to = (r.grade + 1) as Grade;
    m.recruit = { ...r, grade: to, wage: WAGE[to] };
    m.clean = 0;
    // A promotion offers abilities to pick from (crew abilities spec §1), never what's known or already on an open pick.
    if (m.abilities.length + m.picks.length < KNOWN_MAX) {
      const offer = offerFor(o.book, m.recruit, [...m.abilities, ...m.picks.flatMap((p) => p.offer)], to, o.seed);
      if (offer.length > 0) m.picks.push({ grade: to, offer });
    }
    return { to };
  };

  /** Back from a blown errand or job with `fate`: gone, or loyalty −10 and held or hurt (a SHAKY hurt one walks). */
  const blownBack = (m: M, fate: 'hurt' | 'held' | 'gone' | null, hurtDays: number, parts: string[], at: number) => {
    if (fate === 'gone') {
      goneFor(m, 'dead', at);
      parts.push('GONE');
      return;
    }
    m.loyalty = clamp(m.loyalty + BLOWN_SURVIVED);
    if (fate === 'held') {
      m.state = 'held';
      parts.push('HELD BY SDG');
    } else {
      m.state = 'hurt';
      m.hurtDays = hurtDays;
      parts.push(`HURT · ${hurtDays} DAY${hurtDays === 1 ? '' : 'S'}`);
      if (loyaltyWord(m.loyalty) === 'SHAKY') goneFor(m, 'walked', at);
    }
  };

  /**
   * A spring job's end (crew spec §5): its held recruit, sprung for this file tonight, is out on clean or messy (GET OUT
   * included) with bail's +15, or still inside at −10. Anyone bailed, left or gone since is untouched.
   */
  const sprung = (job: FoldJob, at: number, end: NonNullable<FoldJob['end']>) => {
    const m = byId.get(job.spring!);
    const file = /([^.]+)@-?\d+$/.exec(job.key)?.[1];
    if (!m || m.state !== 'held' || !m.spring || m.spring.job !== file || m.spring.day !== storyDay(job.setup.at)) return;
    const first = firstName(m.recruit);
    if (end.tier === 'blown') {
      m.loyalty = clamp(m.loyalty + BLOWN_SURVIVED);
      m.log.unshift({ at, band: 'blown', fate: 'held', line: `${first} is still inside.`, effects: 'STILL HELD', from: 'job' });
    } else {
      m.state = 'ready';
      m.loyalty = clamp(m.loyalty + BAIL_PAID);
      delete m.spring;
      m.log.unshift({ at, band: end.tier, fate: null, line: `${first} is out.`, effects: 'SPRUNG', from: 'job' });
    }
    latest = at;
  };

  const offJob = (m: M) => {
    m.state = 'ready';
    delete m.job;
    delete m.jobKey;
  };

  /** A job's items (the hand spec §1–§4): brought crew go on it, a call's loss lands at its pick, and the end is shared. */
  const onJob = (it: Extract<Item, { kind: 'jobStart' | 'jobCall' | 'jobEnd' }>, k: Kit): KitEvent[] => {
    const { job } = it;
    // Loot (crew goods spec §6): lost with the stash full.
    const g = it.kind === 'jobEnd' && job.drops ? goodsOf(job.drops) : undefined;
    if (g && job.end && job.end.tier !== 'blown' && stash.length < STASH_MAX) {
      stash.push({ id: `j${hashSeed(job.key)}`, kind: g.id, value: g.value, day: storyDay(job.end.at), district: job.district ?? '', ...(job.end.tier === 'messy' ? { damaged: true as const } : {}) });
    }
    const on = (rid: string) => {
      const m = byId.get(rid);
      return m && m.state === 'job' && m.jobKey === job.key ? m : undefined;
    };
    if (it.kind === 'jobStart') {
      for (const rid of job.setup.people) {
        const m = byId.get(rid);
        if (!m || m.state !== 'ready' || busyOn(m.recruit, storyDay(it.at))) continue;
        m.state = 'job';
        m.job = job.title;
        m.jobKey = job.key;
        m.worked = true;
      }
      return [];
    }
    if (it.kind === 'jobCall') {
      const m = on(it.call.card);
      if (!m) return [];
      const first = firstName(m.recruit);
      offJob(m);
      if (it.call.loss === 'held') {
        m.state = 'held';
        m.log.unshift({ at: it.at, band: 'blown', fate: 'held', line: `${first} was taken on ${job.title}.`, effects: 'HELD BY SDG', from: 'job' });
      } else {
        m.state = 'hurt';
        m.hurtDays = drawHurtDays(`${job.key}|${it.call.beat}|${m.recruit.id}|days`, 'med');
        m.log.unshift({ at: it.at, band: 'blown', fate: 'hurt', line: `${first} got hurt on ${job.title}.`, effects: `HURT · ${m.hurtDays} DAY${m.hurtDays === 1 ? '' : 'S'}`, from: 'job' });
      }
      latest = it.at;
      return [];
    }
    const end = job.end!;
    if (job.spring) sprung(job, it.at, end);
    const going = job.setup.people.flatMap((rid) => {
      const m = on(rid);
      return m ? [m] : [];
    });
    const shares = jobShares({
      setup: job.setup,
      calls: job.calls,
      tier: end.tier,
      seed: job.key,
      recruits: going.map((m) => ({ id: m.recruit.id, spec: m.recruit.spec, traits: traitsOf(m.recruit), goneUsed: m.goneUsed })),
      getOut: end.getOut,
    });
    const out: KitEvent[] = [];
    void k;
    for (const share of shares) {
      if (share.kind === 'fenced') continue;
      const m = byId.get(share.rid)!;
      const r = m.recruit;
      const parts: string[] = [];
      offJob(m);
      m.runs[share.kind]++;
      m.resolved++;
      if (m.resolved >= 3) m.revealed = [...r.traits];
      const promoted = share.kind === 'clean' ? cleanRun(m, growthStep(job.setup.tier, r.grade)) : undefined;
      if (share.kind === 'messy') {
        const heat = traitsOf(r).reduce((n, t) => (t.effect.kind === 'heat-on-messy' ? n + t.effect.n : n), 0);
        if (heat && job.district) {
          out.push({ at: it.at, heat, district: job.district });
          parts.push(`${upper(job.district)} HEAT ${signedN(heat)}`);
        }
      }
      if (share.kind === 'blown') {
        if (share.saved) m.goneUsed = true;
        blownBack(m, share.fate, share.hurtDays, parts, it.at);
      }
      if (promoted) parts.push(`${firstName(r).toUpperCase()} · ${GRADES[r.grade]} → ${GRADES[promoted.to]}`);
      const line = share.kind === 'clean' ? `${firstName(r)} walked off ${job.title} clean.` : share.kind === 'messy' ? `${firstName(r)} got out of ${job.title}. Not pretty.` : `${firstName(r)} was there when ${job.title} went wrong.`;
      m.log.unshift({ at: it.at, band: share.kind, fate: share.kind === 'blown' ? share.fate : null, line, effects: parts.join(' · '), from: 'job', ...(promoted ? { promoted } : {}) });
      latest = it.at;
    }
    return out;
  };

  /** A recruit called off groundwork: the piece is open again (tier 3 contracts spec §3); off a sale, the lot is back. */
  const unsend = (m: M) => {
    const inst = m.errand ? o.instance(m.errand) : null;
    if (inst?.run) groundwork[inst.run] = (groundwork[inst.run] ?? []).filter((g) => g.piece !== inst.piece);
    const lot = stash.find((l) => l.out === m.recruit.id);
    if (lot) delete lot.out;
    // The lot can go again tonight: it isn't the errand that's spent.
    if (inst?.lot && m.errand) sent.splice(sent.indexOf(m.errand), 1);
  };

  const land = (it: Extract<Item, { kind: 'land' }>, m: M): KitEvent[] => {
    const out: KitEvent[] = [];
    m.send = null;
    m.state = 'ready';
    delete m.due;
    delete m.errand;
    delete m.paid;
    const r = m.recruit;
    const parts: string[] = [];
    if (!it.inst || !it.errand || !it.roll) {
      // The errand's kind is gone from the book: back with nothing (spec §3).
      const res: CrewResult = { at: it.at, band: 'messy', fate: null, line: `${firstName(r)} came back with nothing to say.`, effects: '' };
      m.log.unshift(res);
      latest = it.at;
      return out;
    }
    const { inst, errand, roll } = it;
    let fate = roll.fate;
    const hurtDays = roll.hurtDays;
    if (fate === 'gone' && hasOn(m, 'hurt-not-gone-once') && !m.goneUsed) {
      fate = 'hurt';
      m.goneUsed = true;
    }
    if (fate === 'held' && hasOn(m, 'never-held')) fate = 'hurt';
    const eff = errand.bands[roll.band].effect;
    const district = inst.district || null;
    // A lot home (crew goods spec §2): counted on the way, so only loot can have filled the stash meanwhile. Its id comes
    // from the offer, not a count, so an edit to the book can't repoint a stored sale.
    if (eff.lot && inst.goods && roll.band !== 'blown') {
      const g = goodsOf(inst.goods);
      const id = `s${hashSeed(inst.id).toString(36)}`;
      if (g && stash.length < STASH_MAX) stash.push({ id, kind: g.id, value: g.value, day: inst.day, district: inst.district, ...(eff.lot === 'damaged' ? { damaged: true as const } : {}) });
      parts.push(g && stash.some((l) => l.id === id) ? `LOT · ${g.label.toUpperCase()}${eff.lot === 'damaged' ? ' · DAMAGED' : ''}` : 'NO ROOM IN THE STASH');
    }
    // A sale (crew goods spec §3): the lot's gone whatever came of it; tonight's board and the recruit's route set the price.
    let routeHeat = 0;
    if (inst.lot) {
      const i = stash.findIndex((l) => l.id === inst.lot);
      const lot = stash[i];
      const g = lot ? goodsOf(lot.kind) : undefined;
      if (i >= 0) stash.splice(i, 1);
      if (lot && g && roll.band !== 'blown') {
        const payPct = errandTraits(m).reduce((p, t) => (t.effect.kind === 'pay' && (t.effect.errand === 'any' || t.effect.errand === errand.kind || t.effect.errand === errand.group) ? p + t.effect.pct : p), 0);
        const price = salePrice({ lot, goods: g, spec: r.spec, wanted: wantedIn(inst.district, inst.day) === lot.kind, day: inst.day, fullRoute: errandTraits(m).some((t) => traitHas(t, 'full-route')), payPct });
        const sol = roll.band === 'messy' ? Math.round(price / 20) * 10 : price;
        out.push({ at: it.at, sol });
        parts.push(`+${sol} SOL`);
        const heat = ROUTES[r.spec]?.heat;
        routeHeat = heat === 'always' || (heat === 'messy' && roll.band === 'messy') ? 1 : 0;
      }
    }
    const jobRun = inst.job !== undefined ? `${inst.job}@${inst.day}` : null;
    // A blown one reports too: what went wrong is the story.
    if (inst.run && inst.piece) reports[`${inst.run}:${inst.piece}`] = { band: roll.band, line: roll.line };
    if (roll.band !== 'blown') {
      if (roll.sol !== null) {
        const pct = errandTraits(m).reduce((p, t) => (t.effect.kind === 'pay' && (t.effect.errand === 'any' || t.effect.errand === errand.kind || t.effect.errand === errand.group) ? p + t.effect.pct : p), 0);
        const sol = Math.round((roll.sol * (1 + pct / 100)) / 10) * 10;
        out.push({ at: it.at, sol });
        parts.push(`${sol >= 0 ? '+' : '−'}${Math.abs(sol)} SOL`);
      }
      if (eff.rep && district) {
        out.push({ at: it.at, rep: { district, delta: eff.rep } });
        parts.push(`${upper(district)} REP ${signedN(eff.rep)}`);
      }
      const heatOnMessy = roll.band === 'messy' ? traitsOf(r).reduce((n, t) => (t.effect.kind === 'heat-on-messy' ? n + t.effect.n : n), 0) : 0;
      const heat = (eff.heat ?? 0) + heatOnMessy + routeHeat;
      if (heat && district) {
        out.push({ at: it.at, heat, district });
        parts.push(`${upper(district)} HEAT ${signedN(heat)}`);
      }
      if (eff.prep && jobRun) {
        prep[jobRun] = { ...prep[jobRun], [eff.prep.flag]: eff.prep.value };
        parts.push(eff.prep.value === 'clean' ? upper(eff.prep.flag) : `${upper(eff.prep.flag)} (${upper(eff.prep.value)})`);
      }
      if (eff.reveal && jobRun && !scouted.includes(jobRun)) {
        scouted.push(jobRun);
        parts.push('SCOUTED');
      }
    } else if (jobRun && errand.bands.clean.effect.prep) prep[jobRun] = { ...prep[jobRun], 'blown-prep': errand.kind };
    m.runs[roll.band]++;
    m.resolved++;
    if (m.resolved >= 3) m.revealed = [...r.traits];
    const promoted = roll.band === 'clean' ? cleanRun(m) : undefined;
    if (roll.band === 'blown') blownBack(m, fate, hurtDays, parts, it.at);
    if (promoted) parts.push(`${firstName(r).toUpperCase()} · ${GRADES[r.grade]} → ${GRADES[promoted.to]}`);
    m.log.unshift({ at: it.at, band: roll.band, fate: roll.band === 'blown' ? fate : null, line: roll.line, effects: parts.join(' · '), ...(promoted ? { promoted } : {}) });
    latest = it.at;
    return out;
  };

  const kit = foldKit(o.start, o.kitEvents, o.now, {
    districtOf: o.districtOf,
    hooks: {
      items,
      apply(k, raw) {
        const it = raw as Item;
        if (it.kind === 'jobStart' || it.kind === 'jobCall' || it.kind === 'jobEnd') return { events: onJob(it, k) };
        if (it.kind === 'land') {
          const m = byId.get(it.rid);
          return m && m.send === it.send ? { events: land(it, m) } : {};
        }
        const ev = it.ev;
        if (ev.type === 'hire') {
          if (byId.has(ev.recruit.id)) return {};
          const r = { ...ev.recruit, spec: normalSpec(ev.recruit.spec) as Specialty };
          // A first hire comes with a lot, so a new crew can sell on night one (crew goods spec §5).
          const kinds = o.book.goods ?? [];
          if (members.length === 0 && kinds.length > 0) {
            const g = kinds[Math.floor(rng(hashSeed(`${o.seed}|first-lot`))() * kinds.length)];
            stash.push({ id: 'first', kind: g.id, value: g.value, day: storyDay(ev.at), district: o.placeDistrict?.(ev.place) ?? '' });
          }
          // Recruits from before abilities get one, seeded (crew abilities spec §5); ids gone from the book drop out,
          // and one left with none gets one the same way (crew cleanup spec §3).
          const kept = known(r.abilities ?? []);
          const legacy = r.abilities === undefined || (r.abilities.length > 0 && kept.length === 0) ? hireAbility(o.book, r, `${o.seed}|${r.id}|legacy`) : null;
          const abilities = legacy ? [legacy] : kept;
          const m: M = {
            recruit: r,
            state: 'ready',
            runs: { clean: 0, messy: 0, blown: 0 },
            toNext: 0,
            loyalty: ev.loyalty ?? START_LOYALTY,
            ...(ev.vouched ? { vouched: ev.vouched } : {}),
            revealed: r.traits.filter((t) => t !== r.hidden),
            log: [],
            hired: { at: ev.at, place: ev.place },
            send: null,
            clean: 0,
            resolved: 0,
            goneUsed: false,
            extraWage: 0,
            abilities,
            slotted: abilities.slice(0, 1),
            picks: [],
          };
          members.push(m);
          byId.set(r.id, m);
          return { events: [{ at: ev.at, sol: -ev.cost }] };
        }
        const m = byId.get(it.rid);
        if (!m || m.state === 'gone') return {};
        switch (ev.type) {
          case 'send': {
            // Menus don't move the clock: a landing, or a recall by a recruit listed later, can share this minute and
            // the player already saw it. Once, after everything else in the minute (crew goods review).
            const sale = o.instance(ev.errand)?.lot;
            if (!it.retried && ((m.state === 'out' && m.due === ev.at) || (sale && !stash.some((l) => l.id === sale && !l.out)))) return { later: [{ ...it, retried: true as const }] };
            // Once a day each, tonight's only (spec §2): a second send, or one for another night's errand, does nothing.
            if (m.state !== 'ready' || busyOn(m.recruit, storyDay(ev.at)) || sent.includes(ev.errand) || dayOf(ev.errand) !== storyDay(ev.at)) return {};
            const inst = o.instance(ev.errand);
            const kind = inst ? (o.book.errands.find((e) => e.kind === inst.kind) ?? null) : null;
            // A sale runs by the recruit's route; a lot gone or already out leaves nothing to sell.
            const lot = inst?.lot ? stash.find((l) => l.id === inst.lot && !l.out) : undefined;
            const lotGoods = lot ? goodsOf(lot.kind) : undefined;
            const errand = inst?.lot ? (kind && lotGoods ? sellErrand(kind, lotGoods, m.recruit.spec) : null) : kind;
            const id = ++sends;
            sent.push(ev.errand);
            m.send = id;
            m.worked = true;
            m.errand = ev.errand;
            if (!inst || !errand) {
              m.state = 'out';
              m.due = ev.at;
              return { later: [{ at: ev.at, kind: 'land', rid: it.rid, send: id, inst: null, errand: null, roll: null } satisfies Item] };
            }
            const r = m.recruit;
            if (inst.run && inst.piece) (groundwork[inst.run] ??= []).push({ piece: inst.piece, day: inst.day });
            if (lot) lot.out = m.recruit.id;
            const paid = errand.cost && inst.goods ? costOf(errand, inst.goods) : 0;
            if (paid > 0) m.paid = paid;
            const odds = crewOdds({ errand, recruit: r, traits: errandTraits(m), heat: inst.district ? (k.heat[inst.district] ?? 0) : 0, goneUsed: true, ...(inst.spec ? { match: inst.spec } : {}) });
            const name = (f: ((id: string) => string) | undefined, id: string | undefined) => (id ? (f?.(id) ?? id) : '');
            const roll = rollSend({
              odds,
              errand,
              seed: `${o.seed}|${ev.errand}|${r.id}`,
              vars: { name: firstName(r), place: name(o.names?.place, inst.place), district: name(o.names?.district, inst.district || undefined), job: name(o.names?.job, inst.job ?? inst.run?.split('@')[0]), piece: inst.piece ?? '' },
            });
            m.state = 'out';
            m.due = dueAt(ev.at, errand, r, errandTraits(m));
            return { ...(paid > 0 ? { events: [{ at: ev.at, sol: -paid }] } : {}), later: [{ at: m.due, kind: 'land', rid: it.rid, send: id, inst, errand, roll } satisfies Item] };
          }
          case 'recall':
            if (m.state === 'out') {
              const paid = m.paid ?? 0;
              unsend(m);
              m.state = 'ready';
              m.send = null;
              delete m.due;
              delete m.errand;
              delete m.paid;
              if (paid > 0) return { events: [{ at: ev.at, sol: paid }] };
            }
            return {};
          case 'letgo':
            if (m.state === 'out') unsend(m);
            goneFor(m, 'let go', ev.at);
            return {};
          case 'leave':
            if (m.state === 'held') goneFor(m, 'left', ev.at);
            return {};
          case 'doc':
            if (m.state !== 'hurt' || !m.hurtDays) return {};
            m.hurtDays--;
            if (m.hurtDays === 0) {
              m.state = 'ready';
              delete m.hurtDays;
            }
            return { events: [{ at: ev.at, sol: -DOC }] };
          case 'spring':
            // While held, one rescue a night across the roster (crew spec §5): its run id is the file's and the day's.
            if (m.state === 'held' && !springDays.has(storyDay(ev.at))) {
              m.spring = { job: ev.job, day: storyDay(ev.at) };
              springDays.add(storyDay(ev.at));
            }
            return {};
          case 'learn': {
            // The pick of that grade, and an ability it could offer (final review I1): any of their specialty at or below that
            // grade they don't know, not only the offer as drawn now, so an edit to the book never undoes a KEEP. By grade, not
            // oldest: a KEEP of a removed ability leaves its pick open, and later ones must still land (crew cleanup spec §4).
            // The relay holds the order and checks the offer shown. Slotted at once when ready with a slot free.
            const i = m.picks.findIndex((p) => p.grade === ev.grade);
            if (i < 0 || !abilityPool(o.book, m.recruit.spec, ev.grade, m.abilities).some((a) => a.id === ev.ability)) return {};
            m.picks.splice(i, 1);
            m.abilities = [...m.abilities, ev.ability];
            if (m.state === 'ready' && m.slotted.length < ABILITY_SLOTS[m.recruit.grade]) m.slotted = [...m.slotted, ev.ability];
            return {};
          }
          case 'slot': {
            if (m.state !== 'ready' || !m.abilities.includes(ev.ability) || m.slotted.includes(ev.ability)) return {};
            if (ev.out !== undefined) {
              if (m.slotted.includes(ev.out)) m.slotted = m.slotted.map((x) => (x === ev.out ? ev.ability : x));
            } else if (m.slotted.length < ABILITY_SLOTS[m.recruit.grade]) m.slotted = [...m.slotted, ev.ability];
            return {};
          }
          case 'unslot':
            if (m.state === 'ready') m.slotted = m.slotted.filter((x) => x !== ev.ability);
            return {};
          case 'bail':
            if (m.state !== 'held') return {};
            m.state = 'ready';
            delete m.spring;
            m.loyalty = clamp(m.loyalty + BAIL_PAID);
            return { events: [{ at: ev.at, sol: -ev.cost }] };
        }
      },
      six(k, at) {
        const events: KitEvent[] = [];
        const after: KitEvent[] = [];
        // Wages in hire order, from the sol as it stands, for whoever ran tonight; an unpaid one loses loyalty and a SHAKY one walks.
        let sol = k.sol;
        for (const m of members) {
          if (m.state === 'gone' || m.state === 'held') continue;
          const ran = m.worked === true || m.state === 'job' || m.state === 'out';
          const w = (ran ? m.recruit.wage : 0) + m.extraWage;
          m.extraWage = 0;
          m.worked = false;
          if (sol >= w) {
            sol -= w;
            if (w > 0) events.push({ at, sol: -w });
          } else {
            m.loyalty = clamp(m.loyalty + UNPAID);
            if (loyaltyWord(m.loyalty) === 'SHAKY') {
              if (m.state === 'out') unsend(m);
              goneFor(m, 'walked', at);
            }
          }
        }
        for (const m of members)
          if (m.state === 'hurt' && m.hurtDays) {
            m.hurtDays--;
            if (m.hurtDays === 0) {
              m.state = 'ready';
              delete m.hurtDays;
            }
          }
        for (const m of members)
          if (m.state === 'held') {
            m.loyalty = clamp(m.loyalty + HELD_NIGHT);
            if (loyaltyWord(m.loyalty) === 'SHAKY') {
              goneFor(m, 'talked', at);
              // After the 06:00's cooling, or the tier there would wipe it the moment it lands.
              after.push({ at, heat: TALK_HEAT, district: m.recruit.origin });
            }
          }
        return { events, after };
      },
    },
  });

  const today = storyDay(o.now);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const wagesTonight = members.filter((m) => m.state !== 'gone' && m.state !== 'held' && (m.worked || m.state === 'job' || m.state === 'out')).reduce((n, m) => n + m.recruit.wage, 0);
  const out: CrewMember[] = members.map(({ send, clean, resolved, extraWage, jobKey, worked, ...m }) => {
    const g = m.recruit.grade;
    const busy = m.state !== 'gone' && busyOn(m.recruit, today);
    return { ...m, toNext: g < 3 ? TO_NEXT[g as 0 | 1 | 2] - clean : 0, busy };
  });
  return {
    kit,
    crew: {
      members: out,
      prep,
      groundwork,
      reports,
      stash,
      scouted,
      taken: [...new Set(sent.filter((id) => dayOf(id) === today))],
      latest,
      springDays: [...springDays].sort((a, b) => a - b),
      wages: wagesTonight,
    },
  };
}

