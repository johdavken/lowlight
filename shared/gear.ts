/**
 * The deck catalog (missions spec §1): `world/gear/decks.md`, one `---` block per deck. The lore entries
 * stay prose; this is the game's numbers for the same decks. Pure: the game server, Studio and their tests share it.
 */
import { z } from 'zod';
import { LORE_ID, splitDrafts, splitFrontMatter } from './lore';

export const DECK_TRAITS = ['fragile', 'hidden', 'breaker', 'ghost', 'chrome'] as const;
export type DeckTrait = (typeof DECK_TRAITS)[number];
/** The crack terminal's look for this deck (deck skins spec §1); none: `green`. */
export const DECK_SKINS = ['green', 'amber', 'slab', 'holo', 'meridian', 'meridian-deaf', 'sentinel', 'dock', 'pocket'] as const;
export type DeckSkin = (typeof DECK_SKINS)[number];

export interface Deck {
  id: string;
  name: string;
  /** Added to `grid` checks. */
  bonus: number;
  /** Added to heat each time it's used on a grid check, pass or fail. */
  heat: number;
  traits: DeckTrait[];
  /** The terminal's look (absent: `green`). */
  skin?: DeckSkin;
}

const whole = (lo: number, hi: number) => z.coerce.number().int().min(lo).max(hi);
const deckSchema = z.strictObject({
  id: z.string().regex(LORE_ID),
  name: z.string().trim().min(1).max(40),
  bonus: whole(-50, 50),
  heat: whole(0, 10),
  traits: z.array(z.enum(DECK_TRAITS)).default([]),
  skin: z.enum(DECK_SKINS).optional(),
});

/** Every good block, in file order; each bad one (or a repeated id) is skipped with one problem. */
export function parseDecks(text: string): { decks: Deck[]; problems: string[] } {
  const decks: Deck[] = [];
  const problems: string[] = [];
  for (const draft of splitDrafts(text)) {
    const s = splitFrontMatter(draft);
    if ('field' in s) {
      problems.push(s.message);
      continue;
    }
    const r = deckSchema.safeParse(s.front);
    if (!r.success) {
      const i = r.error.issues[0];
      problems.push(`${String(s.front.id ?? '?')}: ${i.path.join('.') || 'deck'}: ${i.message}`);
    } else if (decks.some((d) => d.id === r.data.id)) problems.push(`${r.data.id}: listed twice`);
    else decks.push(r.data);
  }
  return { decks, problems };
}
