/** The kit in words (missions spec §4): one sentence in her prompt on what the player carries and how hot they are. */
import type { Deck } from './gear';
import { heatIn, type Kit } from './mission';

/** A deck name mid-sentence: `Stall build` → `stall build`; a proper name (Cortex Meridian) stays. */
export const formLabel = (name: string) => (/^[A-Z][a-z]+ [a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name);

/** `a stall build`, `an Old Karasu deck`. */
export const withArticle = (name: string) => {
  const n = formLabel(name);
  return `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n}`;
};

/** `Hicks carries a stall build. Heat 4 of 10 here.` (heat in district `here`); the heat alone with no deck; null with no deck and no heat here. */
export function kitLine(name: string, kit: Kit, decks: Deck[], here: string | null): string | null {
  const deck = kit.deck ? (decks.find((d) => d.id === kit.deck)?.name ?? kit.deck) : null;
  const h = heatIn(kit, here);
  if (!deck && h === 0) return null;
  const heat = `Heat ${h} of 10 here.`;
  return deck ? `${name} carries ${withArticle(deck)}. ${heat}` : heat;
}
