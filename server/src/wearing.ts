/**
 * What everyone on stage has on (outfit wears spec 2026-10-19): which outfit someone wears now, its
 * line, and the per-turn `[wearing: …]` line her model reads.
 */
import { named, type Pronoun } from '../../shared/pronoun';
import type { SpriteRecord } from './agents';
import { oneLine } from './persona';

type Wardrobe = Pick<SpriteRecord, 'file' | 'outfits'>;

/** The outfit that is also her sprite (the one she wears with no choice made); null when none is. */
export function baseOutfitOf(sprite: Wardrobe): string | null {
  return Object.keys(sprite.outfits).find((n) => sprite.outfits[n] === sprite.file) ?? null;
}

/** The outfit she has on: `choice` when she has it (a scene's pick, the YOU sheet's), else her base outfit. */
export function wornNow(sprite: Wardrobe, choice: string | null | undefined): string | null {
  if (choice && Object.hasOwn(sprite.outfits, choice)) return choice;
  return baseOutfitOf(sprite);
}

/**
 * One person's part of the line. Hers is marked `self` and named as herself, not "you": the turn's
 * `[you: …]` line is the player, and "you" in both would put her clothes on them.
 */
export interface WearEntry {
  name: string;
  pronoun: Pronoun;
  self?: true;
  text: string;
}

/** The line for what she has on now; null without a sprite, or when that outfit has no line. */
export function wearsOf(sprite: SpriteRecord | null, choice: string | null | undefined): string | null {
  if (!sprite) return null;
  const outfit = wornNow(sprite, choice);
  return outfit ? (sprite.outfitWears[outfit] ?? null) : null;
}

/** `[wearing: Ember (she, yourself) — …; Nix (she) — …]`, in the order given; null when no one has a line. A `;` in a text becomes `,` (it separates entries). */
export function wearingLine(entries: readonly WearEntry[]): string | null {
  if (entries.length === 0) return null;
  const who = (e: WearEntry) => (e.self ? `${oneLine(e.name)} (${e.pronoun}, yourself)` : named(oneLine(e.name), e.pronoun));
  const parts = entries.map((e) => `${who(e)} — ${oneLine(e.text).replace(/\s*;\s*/g, ', ')}`);
  return `[wearing: ${parts.join('; ')}]`;
}

/** Who's on stage, for `wearingEntries`. */
interface Wearer {
  id: string;
  name: string;
  pronoun: Pronoun;
}

/**
 * Everyone's entry, in line order (spec §4–5): hers (marked `self`), then the player's, then the others'.
 * Hers and the others' follow `sceneId`'s pick; the player's follows `playerOutfit` (the YOU sheet).
 * Anyone whose outfit has no line is left out.
 */
export function wearingEntries(o: {
  self: Wearer;
  sceneId: string;
  player: Wearer;
  playerOutfit: string | null;
  others: readonly Wearer[];
  wardrobe: (id: string) => SpriteRecord | null;
}): WearEntry[] {
  const inScene = (id: string) => {
    const sprite = o.wardrobe(id);
    return wearsOf(sprite, sprite?.outfitByScene[o.sceneId]);
  };
  const entries: WearEntry[] = [];
  const mine = inScene(o.self.id);
  if (mine) entries.push({ name: o.self.name, pronoun: o.self.pronoun, self: true, text: mine });
  const theirs = wearsOf(o.wardrobe(o.player.id), o.playerOutfit);
  if (theirs) entries.push({ name: o.player.name, pronoun: o.player.pronoun, text: theirs });
  for (const w of o.others) {
    const text = inScene(w.id);
    if (text) entries.push({ name: w.name, pronoun: w.pronoun, text });
  }
  return entries;
}
