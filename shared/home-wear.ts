/**
 * Home wear (2026-11-08). A walkway or landing outside someone's door (`entry` on its scene) is a way in, never
 * one of her home rooms, even when it's in her `rooms` so she can take you there. What she wears only at home
 * (sleepwear and the like) isn't worn in it. Her home is a room of hers on the other side of a way in's door.
 */

/** A room as far as this rule needs it: whether it's a way in, and where its exits lead. */
export interface RoomLink {
  id: string;
  entry?: boolean;
  exits?: readonly { to: string }[];
}

/** Each way in, and the rooms on the other side of its doors (an exit either way between them). */
export function waysIn(rooms: readonly RoomLink[]): Map<string, Set<string>> {
  const ways = new Map<string, Set<string>>();
  for (const r of rooms) if (r.entry) ways.set(r.id, new Set());
  for (const r of rooms) {
    for (const e of r.exits ?? []) {
      if (ways.has(r.id) && !ways.has(e.to)) ways.get(r.id)!.add(e.to);
      if (ways.has(e.to) && !ways.has(r.id)) ways.get(e.to)!.add(r.id);
    }
  }
  return ways;
}

/** Her home rooms: the rooms of hers behind a way in's door. A way in is never one. */
export function homeRooms(hers: readonly string[], ways: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  return hers.filter((r) => !ways.has(r) && [...ways.values()].some((behind) => behind.has(r)));
}

export interface Wardrobe {
  /** Her rooms (`rooms` in character.json; a resident's: her scene). */
  rooms: readonly string[];
  /** Scene → the outfit it puts her in. */
  byScene: Readonly<Record<string, string>>;
  /** The outfit that is her sprite: worn everywhere no scene chooses, so never home wear. */
  base?: string | null;
}

/**
 * Her home wear: an outfit her home rooms put her in that no room outside her own does (a way in counts for
 * neither). Her base outfit never is.
 */
export function homeWear(w: Wardrobe, ways: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const hers = new Set(w.rooms);
  const outside = new Set(Object.entries(w.byScene).filter(([scene]) => !ways.has(scene) && !hers.has(scene)).map(([, outfit]) => outfit));
  const home = homeRooms(w.rooms, ways)
    .map((r) => w.byScene[r])
    .filter((o): o is string => !!o && o !== w.base && !outside.has(o));
  return new Set(home);
}

/** The ways in where her scene map dresses her in home wear: scene → outfit (empty when there are none). */
export function homeWearAtTheDoor(w: Wardrobe, ways: ReadonlyMap<string, ReadonlySet<string>>): Record<string, string> {
  const home = homeWear(w, ways);
  return Object.fromEntries(Object.entries(w.byScene).filter(([scene, outfit]) => ways.has(scene) && home.has(outfit)));
}
