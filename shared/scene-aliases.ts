/**
 * Room ids from before the scene folders matched the map's districts (spec 2026-10-11 districts by
 * folder): `ribbon/<room>` became `karasu/<room>`, and Glass Orchid moved to `velvet/`. Saves keep
 * their old ids; they're translated as they're read, never rewritten.
 */
export const SCENE_ALIASES: { exact: Record<string, string>; prefix: Record<string, string> } = {
  exact: { 'ribbon/glass-orchid': 'velvet/glass-orchid' },
  prefix: { 'ribbon/': 'karasu/' },
};

/** A room id as it is now: exact aliases first, then the first matching folder prefix. Idempotent. */
export function currentSceneId(id: string): string {
  if (Object.hasOwn(SCENE_ALIASES.exact, id)) return SCENE_ALIASES.exact[id]!;
  for (const [from, to] of Object.entries(SCENE_ALIASES.prefix)) {
    if (id.startsWith(from)) return to + id.slice(from.length);
  }
  return id;
}
