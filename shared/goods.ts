/**
 * Crew goods (crew goods spec): the kinds in world/crew/goods.md, a lot's price by route, the nightly wanted board and
 * the COLLECT offers. Pure rules; the stash itself is folded with the crew (crew-fold.ts).
 */
import { HIREABLE, type Risk, type Specialty } from './crew-book';
import { hashSeed, rng } from './rng';

export interface GoodsKind {
  id: string;
  label: string;
  /** The specialty that moves it at full price. */
  route: Specialty;
  value: number;
  /** A picture in world/crew/art; CREW shows a quiet placeholder without one. */
  art?: string;
}

/** One lot in the stash. `out`: the recruit selling it. */
export interface Lot {
  id: string;
  kind: string;
  value: number;
  day: number;
  district: string;
  damaged?: true;
  out?: string;
}

export const STASH_MAX = 4;
export const STALE_AFTER = 3;

const FENCE_ANY = 0.8;
const OFF_ROUTE = 0.6;
const WANTED = 1.5;
const DAMAGED = 0.7;
const STALE = 0.6;

export const isStale = (lot: Lot, day: number): boolean => day - lot.day > STALE_AFTER;
export const nightsLeft = (lot: Lot, day: number): number => Math.max(0, STALE_AFTER - (day - lot.day));

export interface Route {
  hours: number;
  risk: Risk;
  /** Heat a sale adds: never, on a messy result, or on any that lands. */
  heat: 'none' | 'messy' | 'always';
}

/** The recruit's specialty is the route (crew goods spec §3). */
export const ROUTES: Partial<Record<Specialty, Route>> = {
  runner: { hours: 3, risk: 'med', heat: 'none' },
  ears: { hours: 7, risk: 'low', heat: 'messy' },
  fence: { hours: 5, risk: 'med', heat: 'messy' },
  face: { hours: 6, risk: 'med', heat: 'messy' },
  muscle: { hours: 3, risk: 'high', heat: 'always' },
};

/** What a clean sale pays, in steps of 10. */
export function salePrice(o: { lot: Lot; goods: GoodsKind; spec: Specialty; wanted: boolean; day: number; fullRoute?: boolean; payPct?: number }): number {
  const route = o.spec === o.goods.route || o.fullRoute ? 1 : o.spec === 'fence' ? FENCE_ANY : OFF_ROUTE;
  const v = o.lot.value * route * (o.wanted ? WANTED : 1) * (o.lot.damaged ? DAMAGED : 1) * (isStale(o.lot, o.day) ? STALE : 1) * (1 + (o.payPct ?? 0) / 100);
  return Math.round(v / 10) * 10;
}

/** One kind per district tonight, walked from day 0 so a kind never repeats a night running; each district on its own seed. */
export function wantedFor(o: { seed: string; day: number; districts: string[]; kinds: string[] }): Record<string, string> {
  if (o.kinds.length === 0) return {};
  const out: Record<string, string> = {};
  for (const d of o.districts) {
    let i = Math.floor(rng(hashSeed(`${o.seed}|wanted|${d}|0`))() * o.kinds.length);
    for (let day = 1; day <= o.day; day++) {
      const step = o.kinds.length > 1 ? 1 + Math.floor(rng(hashSeed(`${o.seed}|wanted|${d}|${day}`))() * (o.kinds.length - 1)) : 0;
      i = (i + step) % o.kinds.length;
    }
    out[d] = o.kinds[i];
  }
  return out;
}

/** Tonight's COLLECT missions: three, or two when you're Known in one district; the night's first isn't last night's. */
export function collectOffers(o: { seed: string; day: number; missions: { kind: string; gives: string[] }[]; districts: string[] }): { kind: string; district: string; goods: string }[] {
  const n = Math.min(o.districts.length === 0 ? 0 : o.districts.length === 1 ? 2 : 3, o.missions.length);
  if (n === 0) return [];
  let head = '';
  let out: { kind: string; district: string; goods: string }[] = [];
  for (let day = 0; day <= Math.max(0, o.day); day++) {
    const r = rng(hashSeed(`${o.seed}|collect|${day}`));
    const pool = [...o.missions];
    out = [];
    for (let i = 0; i < n; i++) {
      const from = i === 0 && pool.length > 1 ? pool.filter((m) => m.kind !== head) : pool;
      const m = from[Math.floor(r() * from.length)];
      pool.splice(pool.indexOf(m), 1);
      out.push({ kind: m.kind, district: o.districts[Math.floor(r() * o.districts.length)], goods: m.gives[Math.floor(r() * m.gives.length)] });
    }
    head = out[0].kind;
  }
  return out;
}

export function parseGoods(text: string, problems: string[]): GoodsKind[] {
  const out: GoodsKind[] = [];
  for (const block of text.split(/^---\s*$/m).filter((b) => b.trim() && !/^\s*#[^\n]*\s*$/.test(b))) {
    const f: Record<string, string> = {};
    for (const raw of block.split('\n')) {
      const kv = /^([a-z]+):\s*(.*)$/.exec(raw.trim());
      if (kv) f[kv[1]] = kv[2].trim();
    }
    const id = f.kind ?? '';
    if (!/^[a-z][a-z0-9-]*$/.test(id)) problems.push('goods: kind must be lowercase letters, digits and dashes');
    else if (!(HIREABLE as string[]).includes(f.route ?? '')) problems.push(`goods: ${id}: route must be a specialty you can hire`);
    else if (!(Number(f.value) > 0)) problems.push(`goods: ${id}: value must be a number above 0`);
    else if (out.some((g) => g.id === id)) problems.push(`goods: ${id} is written twice`);
    else out.push({ id, label: f.label ?? id, route: f.route as Specialty, value: Number(f.value), ...(f.art ? { art: f.art } : {}) });
  }
  return out;
}
