/**
 * The crew fold (crew spec 2026-10-19 §3): what you did (hires, sends, recalls…) folded with the kit on one
 * timeline. Results, promotions, loyalty, wages, hurt days and losses are never stored: they're derived here from
 * the events, the seeds and the clock, so rewind and BRANCH HERE are exact.
 */
import { hashSeed, storyDay } from './board';
import { GRADES, type Band, type CrewBook, type ErrandKind, type Grade, type Trait } from './crew-book';
import { crewOdds, DOC, dueAt, loyaltyWord, rollSend, TO_NEXT, WAGE, type ErrandInstance, type Recruit, type Roll } from './crew';
import { rng } from './gig/generate';
import { foldKit, type Kit, type KitEvent } from './mission';

export type CrewEvent =
  | { type: 'hire'; at: number; recruit: Recruit; place: string; cost: number }
  | { type: 'send'; at: number; errand: string }
  | { type: 'recall' | 'doc' | 'letgo' | 'leave'; at: number }
  | { type: 'bail'; at: number; cost: number };

export interface CrewResult {
  at: number;
  band: Band;
  fate: 'hurt' | 'held' | 'gone' | null;
  line: string;
  /** What it did, for the screen: `+340 SOL · STRAND REP +1`, `HURT · 3 DAYS`. */
  effects: string;
  promoted?: { to: Grade; trait?: string };
}

export type Gone = 'dead' | 'walked' | 'talked' | 'let go' | 'left';

export interface CrewMember {
  recruit: Recruit;
  state: 'ready' | 'out' | 'hurt' | 'held' | 'gone';
  gone?: Gone;
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
}

export interface CrewState {
  /** In hire order. */
  members: CrewMember[];
  /** Prep flags per job run (`<jobId>@<day>`). */
  prep: Record<string, Record<string, string>>;
  /** Job runs (`<jobId>@<day>`) a SCOUT has shown. */
  scouted: string[];
  /** Today's errand instances already sent (recalled ones too). */
  taken: string[];
  latest: number | null;
  /** Tonight's wages for the roster as it stands. */
  wages: number;
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

type Item =
  | { at: number; kind: 'event'; rid: string; ev: CrewEvent }
  | { at: number; kind: 'land'; rid: string; send: number; inst: ErrandInstance | null; errand: ErrandKind | null; roll: Roll | null };

interface M extends Omit<CrewMember, 'busy'> {
  send: number | null;
  clean: number;
  resolved: number;
  extraWage: number;
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const upper = (s: string) => s.toUpperCase().replace(/-/g, ' ');
const signedN = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
const firstName = (r: Recruit) => r.name.split(' ')[0];

export function foldWithCrew(o: {
  start: { deck: string | null; edgeMax: number; from: number };
  kitEvents: KitEvent[];
  crew: CrewEvent[][];
  now: number;
  book: CrewBook;
  seed: string;
  instance(id: string): ErrandInstance | null;
  districtOf?(e: KitEvent): string | null;
  /** Display names for `{place}`, `{district}` and `{job}` in result lines; ids when absent. */
  names?: { place?(id: string): string; district?(id: string): string; job?(id: string): string };
}): { kit: Kit; crew: CrewState } {
  const traitOf = (id: string): Trait | undefined => o.book.traits.find((t) => t.id === id);
  const traitsOf = (r: Recruit): Trait[] => r.traits.map(traitOf).filter((t): t is Trait => t !== undefined);
  const has = (r: Recruit, kind: Trait['effect']['kind']) => traitsOf(r).some((t) => t.effect.kind === kind);
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
  const dayOf = (id: string) => Number(/@(-?\d+)$/.exec(id)?.[1] ?? NaN);

  const members: M[] = [];
  const byId = new Map<string, M>();
  const prep: CrewState['prep'] = {};
  const scouted: string[] = [];
  const sent: string[] = [];
  let latest: number | null = null;
  let sends = 0;

  const goneFor = (m: M, why: Gone) => {
    m.state = 'gone';
    m.gone = why;
    m.send = null;
    delete m.due;
    delete m.errand;
    if (why === 'dead') for (const x of members) if (x !== m && x.state !== 'gone') x.loyalty = clamp(x.loyalty + CREWMATE_GONE);
  };

  const land = (it: Extract<Item, { kind: 'land' }>, m: M): KitEvent[] => {
    const out: KitEvent[] = [];
    m.send = null;
    m.state = 'ready';
    delete m.due;
    delete m.errand;
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
    if (fate === 'gone' && has(r, 'hurt-not-gone-once') && !m.goneUsed) {
      fate = 'hurt';
      m.goneUsed = true;
    }
    if (fate === 'held' && has(r, 'never-held')) fate = 'hurt';
    const eff = errand.bands[roll.band].effect;
    const district = inst.district || null;
    const jobRun = inst.job !== undefined ? `${inst.job}@${inst.day}` : null;
    if (roll.band !== 'blown') {
      if (roll.sol !== null) {
        const pct = traitsOf(r).reduce((p, t) => (t.effect.kind === 'pay' && (t.effect.errand === 'any' || t.effect.errand === errand.kind) ? p + t.effect.pct : p), 0);
        const sol = Math.round((roll.sol * (1 + pct / 100)) / 10) * 10;
        out.push({ at: it.at, sol });
        parts.push(`${sol >= 0 ? '+' : '−'}${Math.abs(sol)} SOL`);
      }
      if (eff.rep && district) {
        out.push({ at: it.at, rep: { district, delta: eff.rep } });
        parts.push(`${upper(district)} REP ${signedN(eff.rep)}`);
      }
      const heatOnMessy = roll.band === 'messy' ? traitsOf(r).reduce((n, t) => (t.effect.kind === 'heat-on-messy' ? n + t.effect.n : n), 0) : 0;
      const heat = (eff.heat ?? 0) + heatOnMessy;
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
    let promoted: CrewResult['promoted'];
    if (roll.band === 'clean') {
      m.loyalty = clamp(m.loyalty + CLEAN);
      m.extraWage += traitsOf(r).reduce((n, t) => (t.effect.kind === 'wage-on-clean' ? n + t.effect.n : n), 0);
      if (r.grade < 3) {
        m.clean++;
        if (m.clean >= TO_NEXT[r.grade as 0 | 1 | 2]) {
          const to = (r.grade + 1) as Grade;
          m.recruit = { ...r, grade: to, wage: WAGE[to] };
          m.clean = 0;
          promoted = { to };
          const pr = rng(hashSeed(`${o.seed}|${r.id}|${to}`));
          const pool = o.book.traits.filter((t) => (t.for === 'any' || t.for.includes(r.spec)) && !r.traits.includes(t.id));
          if (pr() < 1 / 3 && r.traits.length < 3 && pool.length > 0) {
            const t = pool[Math.floor(pr() * pool.length)].id;
            m.recruit = { ...m.recruit, traits: [...r.traits, t] };
            m.revealed = [...m.revealed, t];
            promoted.trait = t;
          }
        }
      }
    }
    if (roll.band === 'blown') {
      if (fate === 'gone') {
        goneFor(m, 'dead');
        parts.push('GONE');
      } else {
        m.loyalty = clamp(m.loyalty + BLOWN_SURVIVED);
        if (fate === 'held') {
          m.state = 'held';
          parts.push('HELD BY SDG');
        } else {
          m.state = 'hurt';
          m.hurtDays = hurtDays;
          parts.push(`HURT · ${hurtDays} DAY${hurtDays === 1 ? '' : 'S'}`);
          if (loyaltyWord(m.loyalty) === 'SHAKY') goneFor(m, 'walked');
        }
      }
    }
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
        if (it.kind === 'land') {
          const m = byId.get(it.rid);
          return m && m.send === it.send ? { events: land(it, m) } : {};
        }
        const ev = it.ev;
        if (ev.type === 'hire') {
          if (byId.has(ev.recruit.id)) return {};
          const r = ev.recruit;
          const m: M = {
            recruit: r,
            state: 'ready',
            runs: { clean: 0, messy: 0, blown: 0 },
            toNext: 0,
            loyalty: START_LOYALTY,
            revealed: r.traits.filter((t) => t !== r.hidden),
            log: [],
            hired: { at: ev.at, place: ev.place },
            send: null,
            clean: 0,
            resolved: 0,
            goneUsed: false,
            extraWage: 0,
          };
          members.push(m);
          byId.set(r.id, m);
          return { events: [{ at: ev.at, sol: -ev.cost }] };
        }
        const m = byId.get(it.rid);
        if (!m || m.state === 'gone') return {};
        switch (ev.type) {
          case 'send': {
            // Once a day each, tonight's only (spec §2): a second send, or one for another night's errand, does nothing.
            if (m.state !== 'ready' || busyOn(m.recruit, storyDay(ev.at)) || sent.includes(ev.errand) || dayOf(ev.errand) !== storyDay(ev.at)) return {};
            const inst = o.instance(ev.errand);
            const errand = inst ? (o.book.errands.find((e) => e.kind === inst.kind) ?? null) : null;
            const id = ++sends;
            sent.push(ev.errand);
            m.send = id;
            m.errand = ev.errand;
            if (!inst || !errand) {
              m.state = 'out';
              m.due = ev.at;
              return { later: [{ at: ev.at, kind: 'land', rid: it.rid, send: id, inst: null, errand: null, roll: null } satisfies Item] };
            }
            const r = m.recruit;
            const odds = crewOdds({ errand, recruit: r, traits: traitsOf(r), heat: inst.district ? (k.heat[inst.district] ?? 0) : 0, goneUsed: true });
            const name = (f: ((id: string) => string) | undefined, id: string | undefined) => (id ? (f?.(id) ?? id) : '');
            const roll = rollSend({
              odds,
              errand,
              seed: `${o.seed}|${ev.errand}|${r.id}`,
              vars: { name: firstName(r), place: name(o.names?.place, inst.place), district: name(o.names?.district, inst.district || undefined), job: name(o.names?.job, inst.job) },
            });
            m.state = 'out';
            m.due = dueAt(ev.at, errand, r, traitsOf(r));
            return { later: [{ at: m.due, kind: 'land', rid: it.rid, send: id, inst, errand, roll } satisfies Item] };
          }
          case 'recall':
            if (m.state === 'out') {
              m.state = 'ready';
              m.send = null;
              delete m.due;
              delete m.errand;
            }
            return {};
          case 'letgo':
            goneFor(m, 'let go');
            return {};
          case 'leave':
            if (m.state === 'held') goneFor(m, 'left');
            return {};
          case 'doc':
            if (m.state !== 'hurt' || !m.hurtDays) return {};
            m.hurtDays--;
            if (m.hurtDays === 0) {
              m.state = 'ready';
              delete m.hurtDays;
            }
            return { events: [{ at: ev.at, sol: -DOC }] };
          case 'bail':
            if (m.state !== 'held') return {};
            m.state = 'ready';
            m.loyalty = clamp(m.loyalty + BAIL_PAID);
            return { events: [{ at: ev.at, sol: -ev.cost }] };
        }
      },
      six(k, at) {
        const events: KitEvent[] = [];
        const after: KitEvent[] = [];
        // Wages in hire order, from the sol as it stands; an unpaid one loses loyalty and a SHAKY one walks.
        let sol = k.sol;
        for (const m of members) {
          if (m.state === 'gone' || m.state === 'held') continue;
          const w = m.recruit.wage + m.extraWage;
          m.extraWage = 0;
          if (sol >= w) {
            sol -= w;
            if (w > 0) events.push({ at, sol: -w });
          } else {
            m.loyalty = clamp(m.loyalty + UNPAID);
            if (loyaltyWord(m.loyalty) === 'SHAKY') goneFor(m, 'walked');
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
              goneFor(m, 'talked');
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
  const out: CrewMember[] = members.map(({ send, clean, resolved, extraWage, ...m }) => {
    const g = m.recruit.grade;
    const busy = m.state !== 'gone' && busyOn(m.recruit, today);
    return { ...m, toNext: g < 3 ? TO_NEXT[g as 0 | 1 | 2] - clean : 0, busy };
  });
  return {
    kit,
    crew: {
      members: out,
      prep,
      scouted,
      taken: [...new Set(sent.filter((id) => dayOf(id) === today))],
      latest,
      wages: out.filter((m) => m.state !== 'gone' && m.state !== 'held').reduce((n, m) => n + m.recruit.wage, 0),
    },
  };
}

