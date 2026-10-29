/** Fixer stock (small jobs spec §5): world/gear/stock.md, one `---` block per board place; and what a purchase does to the kit. */
import { splitDrafts, splitFrontMatter } from './lore';
import { z } from 'zod';
import type { CoverId, KitEvent } from './mission';

export const COVER_IDS: readonly CoverId[] = ['burner', 'fall-guy'];
/** What a deck the fixer doesn't stock trades in against (a quarter of it). */
export const UNSTOCKED_DECK = 300;
export const TRADE_IN = 0.25;

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

/** The kit event a purchase makes: a deck replaces yours (a quarter of its price here back, else of 300); cover adds one. */
export function buyEvent(o: { item: StockItem; at: number; current: string | null; placeStock: StockItem[] }): KitEvent {
  if (o.item.kind === 'cover') return { at: o.at, sol: -o.item.price, cover: { id: o.item.id as CoverId, delta: 1 } };
  const old = o.current ? (o.placeStock.find((s) => s.kind === 'deck' && s.id === o.current)?.price ?? UNSTOCKED_DECK) : 0;
  return { at: o.at, sol: -o.item.price + Math.round(old * TRADE_IN), deck: o.item.id };
}

export function canBuy(o: { item: StockItem; sol: number; tier: number }): 'ok' | 'locked' | 'short' {
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
    cover: z.object({ id: z.enum(['burner', 'fall-guy']), delta: z.number() }).optional(),
  }),
);

/** A `fixer.<player>` value's purchases; none when absent or unreadable. */
export function parseFixer(v: string | null): KitEvent[] {
  if (v === null) return [];
  try {
    const r = fixerSchema.safeParse(JSON.parse(v));
    return r.success ? (r.data as KitEvent[]) : [];
  } catch {
    return [];
  }
}

/** What the fixer calls an item. */
export const itemName = (item: StockItem, decks: readonly { id: string; name: string }[]): string =>
  item.kind === 'cover' ? (item.id === 'burner' ? 'Burner' : 'Fall guy') : (decks.find((d) => d.id === item.id)?.name ?? item.id);
