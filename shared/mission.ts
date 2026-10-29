/**
 * Missions (spec 2026-10-18): a checked choice's odds, and the kit (deck, sol, heat, EDGE left)
 * folded from the kit events mission runs keep. Pure: the game server, Studio and their tests share it.
 */
import { DAY } from './clock';
import type { Deck } from './gear';
import type { StatKey, Stats } from './stats';
import { holds, type CondCtx, type Condition } from './quests';

/** What a `check` tag asks: a stat, the odds at stat 5, whether the deck counts, and crew bonuses. */
export interface Check {
  stat: Exclude<StatKey, 'edge'>;
  base: number;
  grid: boolean;
  crew: { contact: string; bonus: number }[];
  /** Small jobs spec §3: no reroll; the heavier landing. */
  red: boolean;
  /** Prep modifiers: `· if <condition> +N "label"`, applied while the condition holds. */
  mods: Mod[];
}

/** A modifier that applies while its condition holds, named in the card's "why" line. */
export interface Mod {
  when: Condition[];
  delta: number;
  label: string;
}

/** A check's odds for one player, as the card shows them: `TECH 74%`, NO DECK when grid has no deck. */
export interface Odds {
  stat: string;
  chance: number;
  noDeck: boolean;
  /** What moved the odds, in order (small jobs spec §6): grid and deck, crew, prep, temper, ALARM. */
  why: string[];
}

export const ODDS_MIN = 5;
export const ODDS_MAX = 95;
export const PER_POINT = 7;
/** A grid check with no deck of your own (on a booth deck). */
export const NO_DECK = -25;

/** Per ALARM level, on every roll (small jobs spec §3). */
export const ALARM_STEP = -10;
/** An easy or hard mark (a stranger's temper). */
export const TEMPER = 10;

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

export function oddsOf(
  check: Check,
  who: { stats: Stats; deck: Deck | null; with: string; alarm?: number; ctx?: CondCtx; temper?: 'easy' | 'hard' | null; extra?: { delta: number; label: string }[] },
): Odds {
  const why: string[] = [];
  let delta = 0;
  const add = (n: number, text: string) => {
    delta += n;
    why.push(text);
  };
  const noDeck = check.grid && who.deck === null;
  if (check.grid) {
    why.push('GRID');
    if (who.deck) add(who.deck.bonus, `${who.deck.name.toUpperCase()} ${signed(who.deck.bonus)}`);
    else add(NO_DECK, `NO DECK ${signed(NO_DECK)}`);
  }
  for (const c of check.crew) if (c.contact === who.with) add(c.bonus, `${c.contact.toUpperCase()} ${signed(c.bonus)}`);
  for (const m of check.mods ?? []) if (who.ctx && holds(m.when, who.ctx)) add(m.delta, `${signed(m.delta)} ${m.label.toUpperCase()}`);
  // Crew prep's default bonuses (crew spec §2), named as they come: `CASED +10`.
  for (const x of who.extra ?? []) add(x.delta, `${x.label.toUpperCase()} ${signed(x.delta)}`);
  if (who.temper === 'easy') add(TEMPER, `EASY MARK ${signed(TEMPER)}`);
  if (who.temper === 'hard') add(-TEMPER, `HARD MARK ${signed(-TEMPER)}`);
  const alarm = who.alarm ?? 0;
  if (alarm > 0) add(alarm * ALARM_STEP, `ALARM ${alarm} ${signed(alarm * ALARM_STEP)}`);
  const raw = check.base + (who.stats[check.stat] - 5) * PER_POINT + delta;
  return { stat: check.stat.toUpperCase(), chance: Math.min(ODDS_MAX, Math.max(ODDS_MIN, raw)), noDeck, why };
}

export type Tier = 'clean' | 'messy' | 'blown';

/** A job's outcome tier (small jobs spec §3). */
export function outcomeTier(o: { take: 'full' | 'part' | 'none'; blown: boolean; alarm: number }): Tier {
  if (o.blown || o.take === 'none') return 'blown';
  if (o.take === 'part' || o.alarm >= 2) return 'messy';
  return 'clean';
}

/** Rep for a job of tier `tier` (small jobs spec §2): clean +(5+T), messy +2, blown −(8+2T). */
export function repDelta(tier: 1 | 2 | 3 | 4, outcome: Tier): number {
  return outcome === 'clean' ? 5 + tier : outcome === 'messy' ? 2 : -(8 + 2 * tier);
}

export const TIER_NAMES = ['NOBODY', 'KNOWN', 'TRUSTED', 'A NAME'] as const;

/** A district's rep tier: 0–19 1, 20–44 2, 45–74 3, 75+ 4. */
export function repTier(rep: number): 1 | 2 | 3 | 4 {
  return rep >= 75 ? 4 : rep >= 45 ? 3 : rep >= 20 ? 2 : 1;
}

/** A terminal's tries (small jobs spec §4): 4, +1 at TECH 7+, −1 at TECH 3−, −1 at ALARM 2+, −1 with no deck, plus modifiers; at least 1. */
export function crackTries(o: { tech: number; alarm: number; hasDeck: boolean; mods: number }): number {
  const t = 4 + (o.tech >= 7 ? 1 : 0) - (o.tech <= 3 ? 1 : 0) - (o.alarm >= 2 ? 1 : 0) - (o.hasDeck ? 0 : 1) + o.mods;
  return Math.max(1, t);
}

/** One change to the kit, at a story-clock minute: sol and heat add, deck replaces (null: none), edge spends. */
export interface KitEvent {
  at: number;
  sol?: number;
  heat?: number;
  /** The district `heat` lands in (small jobs spec §2); absent on events from before districts. */
  district?: string;
  deck?: string | null;
  edge?: -1;
  rep?: { district: string; delta: number };
  cover?: { id: CoverId; delta: number };
}

export type CoverId = 'burner' | 'fall-guy';

export interface Kit {
  deck: string | null;
  sol: number;
  /** Heat per district, 0–10. */
  heat: Record<string, number>;
  /** Rep per district, 0–100. */
  rep: Record<string, number>;
  cover: Record<CoverId, number>;
  edgeLeft: number;
  edgeMax: number;
}

export const heatIn = (k: Kit, district: string | null): number => (district ? (k.heat[district] ?? 0) : 0);

/** The hottest district, or null with no heat anywhere. */
export function hottest(k: Kit): { district: string; heat: number } | null {
  let best: { district: string; heat: number } | null = null;
  for (const [district, heat] of Object.entries(k.heat)) if (heat > 0 && (!best || heat > best.heat)) best = { district, heat };
  return best;
}

export const HEAT_MAX = 10;
const SIX = 360;

/** The 06:00s in (a, b]. */
export function sixesBetween(a: number, b: number): number {
  return b <= a ? 0 : Math.floor((b - SIX) / DAY) - Math.floor((a - SIX) / DAY);
}

/** Extra items on the kit's timeline (crew spec §3): applied in time order with the kit events; `six` runs at each 06:00. */
export interface KitHooks {
  items: { at: number }[];
  /** An item at its time: kit events to apply now, and items to queue for later (a send's landing). */
  apply(k: Kit, item: { at: number }): { events?: KitEvent[]; later?: { at: number }[] };
  /** At each 06:00 crossed: `events` before heat cools and EDGE refills, `after` once they have. */
  six(k: Kit, at: number): { events?: KitEvent[]; after?: KitEvent[] };
}

/**
 * The kit at `now`: events folded in time order. Each 06:00 refills EDGE and cools each district's heat
 * by the rep tier held there (small jobs spec §2). `districtOf` places heat from before districts. `hooks`
 * put more on the same timeline (crew); kit events go first at the same minute.
 */
export function foldKit(
  start: { deck: string | null; edgeMax: number; from: number },
  events: KitEvent[],
  now: number,
  o: { districtOf?(e: KitEvent): string | null; hooks?: KitHooks } = {},
): Kit {
  const k: Kit = { deck: start.deck, sol: 0, heat: {}, rep: {}, cover: { burner: 0, 'fall-guy': 0 }, edgeLeft: start.edgeMax, edgeMax: start.edgeMax };
  const applyEvent = (e: KitEvent) => {
    if (e.sol) k.sol = Math.max(0, k.sol + e.sol);
    if (e.heat) {
      const d = e.district ?? o.districtOf?.(e) ?? 'unknown';
      k.heat[d] = Math.min(HEAT_MAX, Math.max(0, (k.heat[d] ?? 0) + e.heat));
    }
    if (e.rep) k.rep[e.rep.district] = Math.min(100, Math.max(0, (k.rep[e.rep.district] ?? 0) + e.rep.delta));
    if (e.cover) k.cover[e.cover.id] = Math.max(0, k.cover[e.cover.id] + e.cover.delta);
    if (e.deck !== undefined) k.deck = e.deck;
    if (e.edge) k.edgeLeft = Math.max(0, k.edgeLeft + e.edge);
  };
  type Entry = { at: number; ev?: KitEvent; item?: { at: number }; n: number };
  let n = 0;
  const queue: Entry[] = [
    ...events.map((ev): Entry => ({ at: ev.at, ev, n: n++ })),
    ...(o.hooks?.items ?? []).map((item): Entry => ({ at: item.at, item, n: n++ })),
  ].sort((a, b) => a.at - b.at || Number(!!a.item) - Number(!!b.item) || a.n - b.n);
  /** Queues later items after everything already queued at or before their time. */
  const enqueue = (later: { at: number }[] | undefined, floor: number) => {
    for (const item of later ?? []) {
      const at = Math.max(floor, item.at);
      let i = queue.length;
      while (i > 0 && queue[i - 1].at > at) i--;
      queue.splice(i, 0, { at, item, n: n++ });
    }
  };
  let t = start.from;
  const pass = (to: number) => {
    const sixes = sixesBetween(t, to);
    for (let i = 1; i <= sixes; i++) {
      const six = (Math.floor((t - SIX) / DAY) + 1) * DAY + SIX;
      t = six;
      // A kit event stamped past `now` doesn't run the crew's 06:00s ahead of time.
      const r = (six <= now ? o.hooks?.six(k, six) : undefined) ?? {};
      for (const e of r.events ?? []) applyEvent(e);
      for (const d of Object.keys(k.heat)) k.heat[d] = Math.max(0, k.heat[d] - repTier(k.rep[d] ?? 0));
      k.edgeLeft = k.edgeMax;
      for (const e of r.after ?? []) applyEvent(e);
    }
    t = Math.max(t, to);
  };
  // Kit events apply whenever they're stamped (a pick's row can run a little ahead of the clock); hook items wait for theirs.
  while (queue.length > 0) {
    const i = queue.findIndex((q) => q.ev || q.at <= now);
    if (i < 0) break;
    const next = queue.splice(i, 1)[0];
    pass(next.at);
    if (next.ev) applyEvent(next.ev);
    else if (next.item && o.hooks) {
      const r = o.hooks.apply(k, next.item);
      for (const e of r.events ?? []) applyEvent(e);
      enqueue(r.later, next.at);
    }
  }
  pass(now);
  return k;
}
