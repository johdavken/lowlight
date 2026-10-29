/** A note's keywords (scribe spec §5): what brings it back to her when it comes up, like a lore entry's keys. */
export const NOTE_KEYS_MAX = 4;
export const NOTE_KEY_MAX_CHARS = 40;
// Words that come up in every scene: a note keyed on one would come back every turn.
const STOPWORDS = new Set(
  (
    "the and you her his him she they them their there here it's this that these those with for not but was were what when where why who how " +
    'your yours mine our have has had will would could should about into from then than just like know said says back more some been being ' +
    'does did done want need maybe really very much still even only also yeah okay thing things something tonight today now night time'
  ).split(' '),
);

/**
 * Trimmed, 3–40 chars, with a letter or digit, no everyday words and none of `exclude` (her and the
 * player's names, which come up every turn), deduplicated ignoring case, at most 4; anything else gives [].
 */
export function normalizeKeys(raw: unknown, exclude: readonly string[] = []): string[] {
  if (!Array.isArray(raw)) return [];
  const excluded = new Set(exclude.map((x) => x.trim().toLowerCase()));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of raw) {
    if (typeof k !== 'string') continue;
    const t = k.trim();
    const low = t.toLowerCase();
    if (t.length < 3 || t.length > NOTE_KEY_MAX_CHARS || !/[\p{L}\p{N}]/u.test(t) || STOPWORDS.has(low) || excluded.has(low) || seen.has(low)) continue;
    seen.add(low);
    out.push(t);
    if (out.length === NOTE_KEYS_MAX) break;
  }
  return out;
}
