/**
 * Rolling blackouts from the story clock (spec 2026-10-28 blackouts phase 3 §1). Pure and seeded: nothing stored, so a
 * rewind, a save or a branch carries the schedule with the clock. Each night, 20:00–06:00, is five 2-hour slots; each
 * district's slot goes dark with its `blackout.outage` chance. Adjoining dark slots are one outage.
 */
import { hashSeed } from './board';

export interface Outage {
  district: string;
  /** Story clock minutes: dark from `from`, lit again at `to`. */
  from: number;
  to: number;
  by: 'schedule' | 'narrator';
  /** A narrator outage's contact and encounter row (null: the admin panel's, never undone by a rewind). */
  contact?: string;
  row?: string | null;
}

/** A room's blackout mood: the first of these it has (phase 3 §3). */
export const BLACKOUT_MOODS = ['blackout', 'power-cut', 'lights-out', 'shelf-blackout'] as const;
/** Districts with their own feed: never dark (phase 1). */
export const NO_POWER_DISTRICTS: ReadonlySet<string> = new Set(['spine', 'ribbon']);
/** How long a narrator's power cut lasts (story minutes). */
export const NARRATOR_OUTAGE_MINUTES = 90;
/** Each night's slots, by start hour. */
export const SLOT_STARTS = [20, 22, 0, 2, 4] as const;
const SLOT = 120;
const NIGHT_START = 1200;
/** Nothing is dark before Day 1 22:00: a new game never opens in a blackout. */
const GRACE = 1320;

/** Which night and slot clock time `now` falls in; null in daytime (06:00–20:00). */
function slotOf(now: number): { night: number; k: number } | null {
  const day = Math.floor(now / 1440);
  const m = now - day * 1440;
  if (m >= NIGHT_START) return { night: day, k: Math.floor((m - NIGHT_START) / SLOT) };
  if (m < 360) return { night: day - 1, k: 2 + Math.floor(m / SLOT) };
  return null;
}

const slotStart = (night: number, k: number) => night * 1440 + NIGHT_START + k * SLOT;

function slotDark(seed: string, district: string, night: number, k: number, rate: number): boolean {
  if (k < 0 || k >= SLOT_STARTS.length || slotStart(night, k) < GRACE) return false;
  return hashSeed(`${seed}:${district}:${night}:${k}`) / 2 ** 32 < rate;
}

/** The scheduled outage covering `now` in `district`, merged across adjoining dark slots; null when lit. */
export function scheduled(o: { seed: string; district: string; now: number; rate: number }): Outage | null {
  const s = slotOf(o.now);
  if (!s || !slotDark(o.seed, o.district, s.night, s.k, o.rate)) return null;
  let first = s.k;
  let last = s.k;
  while (slotDark(o.seed, o.district, s.night, first - 1, o.rate)) first--;
  while (slotDark(o.seed, o.district, s.night, last + 1, o.rate)) last++;
  return { district: o.district, from: slotStart(s.night, first), to: slotStart(s.night, last + 1), by: 'schedule' };
}

/** Every district dark at `now`: the schedule's and the narrator's still running, one per district (the earliest `from`). */
export function darkAt(o: { seed: string; now: number; rates: Readonly<Record<string, number>>; narrated: readonly Outage[] }): Outage[] {
  const districts = new Set([...Object.keys(o.rates).filter((d) => d !== '_default'), ...o.narrated.map((x) => x.district)]);
  const out: Outage[] = [];
  for (const district of districts) {
    if (NO_POWER_DISTRICTS.has(district)) continue;
    const x = span(o, district);
    if (x) out.push(x);
  }
  return out.sort((a, b) => a.district.localeCompare(b.district));
}

/**
 * The one blackout covering `now` in `district`: every scheduled run and narrator cut that overlaps or touches it,
 * joined (review I2), so a cut running into a dark slot is one blackout with the cut's start, not two.
 * It carries the earliest piece's `by`, contact and row.
 */
function span(o: { seed: string; now: number; rates: Readonly<Record<string, number>>; narrated: readonly Outage[] }, district: string): Outage | null {
  const rate = o.rates[district] ?? o.rates._default ?? 0;
  const sched = (at: number) => scheduled({ seed: o.seed, district, now: at, rate });
  const mine = o.narrated.filter((x) => x.district === district);
  const pieces = [...mine.filter((x) => x.from <= o.now && o.now < x.to), ...[sched(o.now)].filter((x): x is Outage => x !== null)];
  if (pieces.length === 0) return null;
  let first = pieces.reduce((a, b) => (b.from < a.from ? b : a));
  let from = first.from;
  let to = Math.max(...pieces.map((x) => x.to));
  for (let grew = true; grew; ) {
    grew = false;
    for (const x of [...mine, sched(from - 1), sched(to)]) {
      if (!x || x.to < from || x.from > to) continue;
      if (x.from < from) {
        from = x.from;
        first = x;
        grew = true;
      }
      if (x.to > to) {
        to = x.to;
        grew = true;
      }
    }
  }
  return { ...first, from, to };
}

const hm = (m: number) => {
  const d = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

/** Her prompt's line while her district is dark (§5): `[city: the power is out across Karasu since 22:00]`. */
export function cityLine(name: string, from: number): string {
  return `[city: the power is out across ${name} since ${hm(from)}]`;
}

/** The narrator's fact while the scene's district is dark (§2): `The power is out across Karasu (since 22:00).` */
export function narratorPowerLine(name: string, from: number): string {
  return `The power is out across ${name} (since ${hm(from)}).`;
}
