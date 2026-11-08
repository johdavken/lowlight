/**
 * Missions (spec 2026-10-18): a checked choice's odds, and the kit (deck, sol, heat, NERVE left)
 * folded from the kit events mission runs keep. Pure: the game server, Studio and their tests share it.
 */
import { DAY } from './clock';
import type { Deck } from './gear';
import type { OwnedPrograms } from './programs';
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
  /** An angle's card (tier 3 contracts spec §3): what you know skips the tier's cut on this roll. */
  angle?: true;
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

export type Tier = 'clean' | 'messy' | 'blown';

/** A job's outcome tier (small jobs spec §3). */
export function outcomeTier(o: { take: 'full' | 'part' | 'none'; blown: boolean; alarm: number; paidOff?: boolean }): Tier {
  if (o.blown || o.take === 'none') return 'blown';
  // Paid Off (tier 3 beat play spec §2): ALARM counts as under 2.
  if (o.take === 'part' || (o.alarm >= 2 && !o.paidOff)) return 'messy';
  return 'clean';
}

/** The heat a job leaves in its district (tier template spec §2): the ALARM you leave with (a blown job at least 2), the deck's own, less SCRUB's 1. */
export function endHeat(o: { alarm: number; blown: boolean; deckHeat: number; scrubbed: boolean }): number {
  return Math.max(0, Math.max(o.alarm, o.blown ? 2 : 0) + o.deckHeat - (o.scrubbed ? 1 : 0));
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

/** One change to the kit, at a story-clock minute: sol and heat add, deck carries (a new one is kept; null: the carried one is gone), nerve spends. */
export interface KitEvent {
  at: number;
  sol?: number;
  heat?: number;
  /** The district `heat` lands in (small jobs spec §2); absent on events from before districts. */
  district?: string;
  deck?: string | null;
  /** An outfit an ending gave (`<character>/<outfit>`, outfits as rewards): open to wear from here on. */
  outfit?: string;
  /** Decks you own that leave, by name: a lost push takes back the ones it gave, a fragile deck dies. Carried, you carry none. */
  lose?: string[];
  /** `deck` is a swap (CARRY): it does nothing unless you still own that deck. */
  carry?: true;
  /** A purchase that keeps the deck carried (every buy since decks were kept). */
  keep?: true;
  /** An old save's purchase: the deck carried was traded in, so it leaves as the new one comes. */
  trade?: true;
  /** NERVE spent (the table spec §3), negative. */
  nerve?: number;
  /** This NERVE ends NERVE GONE (Second Wind and its kind, the one way back before 06:00). */
  lift?: true;
  /** EDGE spent before the table: folds as 1 NERVE. */
  edge?: -1;
  rep?: { district: string; delta: number };
  cover?: { id: CoverId; delta: number };
  /** A program (owned programs): no `foil`, one owned for good (a buy); `foil`, that many foil copies more or fewer. */
  program?: { id: string; foil?: number };
}

export type CoverId = 'burner' | 'fall-guy';

export interface Kit {
  /** The deck carried. */
  deck: string | null;
  /** Every deck you own, carried or not, in the order you got them. */
  owned: string[];
  sol: number;
  /** Heat per district, 0–10. */
  heat: Record<string, number>;
  /** Rep per district, 0–100. */
  rep: Record<string, number>;
  cover: Record<CoverId, number>;
  nerveLeft: number;
  nerveMax: number;
  /** NERVE ran out (the table spec §3): no new job until the next 06:00. */
  nerveGone: boolean;
  /** Outfits endings gave (`<character>/<outfit>`), in the order earned. */
  outfits?: string[];
  /** Programs owned (owned programs): the starter, buys, and foil copies held. */
  programs?: OwnedPrograms;
}

export const heatIn = (k: Kit, district: string | null): number => (district ? (k.heat[district] ?? 0) : 0);

/** The hottest district, or null with no heat anywhere. */
export function hottest(k: Kit): { district: string; heat: number } | null {
  let best: { district: string; heat: number } | null = null;
  for (const [district, heat] of Object.entries(k.heat)) if (heat > 0 && (!best || heat > best.heat)) best = { district, heat };
  return best;
}

export const HEAT_MAX = 10;

/** The deck anyone in Lowlight has, whatever else they start with. */
export const STARTER_DECK = 'pocket-deck';
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
  /** At each 06:00 crossed: `events` before heat cools and NERVE refills, `after` once they have. */
  six(k: Kit, at: number): { events?: KitEvent[]; after?: KitEvent[] };
}

/**
 * The kit at `now`: events folded in time order. Each 06:00 refills NERVE and cools each district's heat
 * by the rep tier held there (small jobs spec §2). `districtOf` places heat from before districts. `hooks`
 * put more on the same timeline (crew); kit events go first at the same minute.
 */
export function foldKit(
  start: { deck: string | null; pocket?: string | null; nerveMax: number; from: number; /** The starter programs (owned programs). */ programs?: readonly string[] },
  events: KitEvent[],
  now: number,
  o: { districtOf?(e: KitEvent): string | null; hooks?: KitHooks } = {},
): Kit {
  // `pocket`: the deck everyone owns; carried only by someone who starts with no other.
  const deck = start.deck ?? start.pocket ?? null;
  const k: Kit = { deck, owned: [...new Set([deck, start.pocket ?? null])].filter((d) => d !== null), sol: 0, heat: {}, rep: {}, cover: { burner: 0, 'fall-guy': 0 }, nerveLeft: start.nerveMax, nerveMax: start.nerveMax, nerveGone: false, outfits: [], programs: { owned: [...(start.programs ?? [])], foil: {} } };
  const applyEvent = (e: KitEvent) => {
    if (e.sol) k.sol = Math.max(0, k.sol + e.sol);
    if (e.heat) {
      const d = e.district ?? o.districtOf?.(e) ?? 'unknown';
      k.heat[d] = Math.min(HEAT_MAX, Math.max(0, (k.heat[d] ?? 0) + e.heat));
    }
    if (e.rep) k.rep[e.rep.district] = Math.min(100, Math.max(0, (k.rep[e.rep.district] ?? 0) + e.rep.delta));
    if (e.cover) k.cover[e.cover.id] = Math.max(0, k.cover[e.cover.id] + e.cover.delta);
    if (e.outfit && !k.outfits!.includes(e.outfit)) k.outfits!.push(e.outfit);
    if (e.program) {
      const own = k.programs!;
      if (e.program.foil) own.foil[e.program.id] = Math.max(0, (own.foil[e.program.id] ?? 0) + e.program.foil);
      else if (!own.owned.includes(e.program.id)) own.owned.push(e.program.id);
    }
    // Decks by name first (review I2): a same-minute swap can't put a dead deck back in hand, or kill the wrong one.
    if (e.lose) {
      k.owned = k.owned.filter((d) => !e.lose!.includes(d));
      if (k.deck && e.lose.includes(k.deck)) k.deck = null;
    }
    if (e.carry) {
      if (e.deck && k.owned.includes(e.deck)) k.deck = e.deck;
    } else if (e.deck === null && !e.lose) {
      if (k.deck) k.owned = k.owned.filter((d) => d !== k.deck);
      k.deck = null;
    } else if (e.deck) {
      if (e.trade && k.deck) k.owned = k.owned.filter((d) => d !== k.deck);
      if (!k.owned.includes(e.deck)) k.owned.push(e.deck);
      k.deck = e.deck;
    }
    const spent = (e.nerve ?? 0) + (e.edge ?? 0);
    if (spent) {
      k.nerveLeft = Math.max(0, k.nerveLeft + spent);
      if (k.nerveLeft === 0) k.nerveGone = true;
      else if (e.lift) k.nerveGone = false;
    }
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
      k.nerveLeft = k.nerveMax;
      k.nerveGone = false;
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
