/** Fixer stock (small jobs spec §5): world/gear/stock.md, one `---` block per board place; and what a purchase does to the kit. */
import { splitDrafts, splitFrontMatter } from './lore';
import { z } from 'zod';
import type { CoverId, KitEvent } from './mission';
import type { DeckTrait } from './gear';
import { SLOTS } from './programs';

export const COVER_IDS: readonly CoverId[] = ['burner', 'fall-guy'];
export interface StockItem {
  id: string;
  kind: 'deck' | 'cover';
  price: number;
  tier: 1 | 2 | 3 | 4;
}

/** Each block's place and items (`<id> · <price> · <tier>`); a bad line is skipped with one problem. */
export function parseStock(text: string, deckIds: ReadonlySet<string>): { byPlace: Record<string, StockItem[]>; problems: string[] } {
  const byPlace: Record<string, StockItem[]> = {};
  const problems: string[] = [];
  for (const draft of splitDrafts(text)) {
    const s = splitFrontMatter(draft);
    if ('field' in s) {
      problems.push(s.message);
      continue;
    }
    const place = typeof s.front.place === 'string' ? s.front.place : null;
    const items = Array.isArray(s.front.items) ? s.front.items : null;
    if (!place || !items) {
      problems.push('a stock block needs place: and items:');
      continue;
    }
    const list = (byPlace[place] ??= []);
    for (const raw of items) {
      const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\s*·\s*(\d+)\s*·\s*([1-4])$/.exec(String(raw).trim());
      const id = m?.[1];
      const kind = id && (COVER_IDS as readonly string[]).includes(id) ? 'cover' : id && deckIds.has(id) ? 'deck' : null;
      if (!m || !kind) problems.push(`${place}: can't read '${String(raw)}' (<deck or burner / fall-guy> · <price> · <tier 1–4>)`);
      else list.push({ id: m[1], kind, price: Number(m[2]), tier: Number(m[3]) as StockItem['tier'] });
    }
  }
  return { byPlace, problems };
}

/** The kit event a purchase makes: a deck is carried and the old one kept (`keep`: no trade-in); cover adds one. */
export function buyEvent(o: { item: StockItem; at: number }): KitEvent {
  if (o.item.kind === 'cover') return { at: o.at, sol: -o.item.price, cover: { id: o.item.id as CoverId, delta: 1 } };
  return { at: o.at, sol: -o.item.price, deck: o.item.id, keep: true };
}

/** `owned`: a deck you already have isn't sold to you again. */
export function canBuy(o: { item: StockItem; sol: number; tier: number; owned?: readonly string[] }): 'ok' | 'locked' | 'short' | 'owned' {
  if (o.item.kind === 'deck' && o.owned?.includes(o.item.id)) return 'owned';
  if (o.tier < o.item.tier) return 'locked';
  return o.sol < o.item.price ? 'short' : 'ok';
}

/** Purchases live on story meta `fixer.<player>` in the contact's room db (small jobs spec §5), so rewind undoes them. */
export const fixerKey = (player: string) => `fixer.${player}`;

const fixerSchema = z.array(
  z.object({
    at: z.number(),
    sol: z.number().optional(),
    deck: z.string().nullable().optional(),
    carry: z.literal(true).optional(),
    keep: z.literal(true).optional(),
    cover: z.object({ id: z.enum(['burner', 'fall-guy']), delta: z.number() }).optional(),
  }),
);

/**
 * A `fixer.<player>` value's purchases; none when absent or unreadable. A deck bought before decks were kept (no
 * `keep`, not a swap) traded the old one in for its sol: it's a `trade`, so the old deck doesn't come back.
 */
export function parseFixer(v: string | null): KitEvent[] {
  if (v === null) return [];
  try {
    const r = fixerSchema.safeParse(JSON.parse(v));
    return r.success ? (r.data as KitEvent[]).map((e) => (typeof e.deck === 'string' && !e.keep && !e.carry ? { ...e, trade: true as const } : e)) : [];
  } catch {
    return [];
  }
}

/** What the fixer calls an item. */
export const itemName = (item: StockItem, decks: readonly { id: string; name: string }[]): string =>
  item.kind === 'cover' ? (item.id === 'burner' ? 'Burner' : 'Fall guy') : (decks.find((d) => d.id === item.id)?.name ?? item.id);

/** What a shop card needs to say what an item does: a deck's numbers, or cover. */
export interface GearFacts {
  kind: 'deck' | 'cover';
  id: string;
  quality?: 1 | 2 | 3 | 4;
  heat?: number;
  traits?: readonly DeckTrait[];
}

/** The card's stat line: `Q2 · 2 SLOTS · HEAT 0 · FRAGILE`, or `COVER · USED UP`. */
export function gearStat(g: GearFacts): string {
  if (g.kind === 'cover') return 'COVER · USED UP';
  const q = g.quality ?? 1;
  return [`Q${q}`, `${SLOTS[q]} ${SLOTS[q] === 1 ? 'SLOT' : 'SLOTS'}`, `HEAT ${g.heat ?? 0}`, ...(g.traits ?? []).map((t) => t.toUpperCase())].join(' · ');
}

const TRAIT_RULE: Record<DeckTrait, string> = {
  hidden: 'Hidden: no deck heat.',
  fragile: 'Fragile: dies on a grid miss showing a 1.',
  breaker: 'Breaker: the wire becomes open on a grid check.',
  ghost: 'Ghost: a crack shows one letter.',
  chrome: 'Chrome: RESIST rolls one more die on a grid check.',
};

/** What it does, in the rules' words (docs/graft-rules.md, small jobs spec §5). */
export function gearRule(g: GearFacts): string {
  if (g.kind === 'cover')
    return g.id === 'burner' ? "A blown job's rep loss is halved. Used up." : "A blown job costs no rep; the fixer takes half the job's pay from your sol. Used up.";
  const q = g.quality ?? 1;
  const traits = g.traits ?? [];
  const heat = traits.includes('hidden') ? [] : [g.heat ? `Heat ${g.heat} at a job's end if you rolled a grid check.` : 'No deck heat.'];
  return [`${SLOTS[q]} program ${SLOTS[q] === 1 ? 'slot' : 'slots'}.`, ...heat, ...traits.map((t) => TRAIT_RULE[t])].join(' ');
}
