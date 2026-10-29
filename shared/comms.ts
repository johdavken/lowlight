/**
 * Comms (spec 2026-10-20): the player travelled on while their operator stayed where she is, a voice in their
 * ear. Story meta `comms.<player>` in her room, written on the row that turns it on or off, so rewind, BRANCH HERE
 * and saves carry it. `at`: her room's scene when the line began (where she is when her schedule says nothing).
 */
/** Off after HANG UP or a dropped line keeps `at`, so going solo puts her back where the line began. */
export type CommsState = { on: true; at: string } | { on: false; at?: string };

export const commsKey = (player: string): string => `comms.${player}`;

/** A stored comms state, or null when there's none or it doesn't read. */
export function parseComms(json: string | null): CommsState | null {
  if (json === null) return null;
  try {
    const v = JSON.parse(json) as { on?: unknown; at?: unknown };
    if (v.on === false) return typeof v.at === 'string' && v.at !== '' ? { on: false, at: v.at } : { on: false };
    if (v.on === true && typeof v.at === 'string' && v.at !== '') return { on: true, at: v.at };
    return null;
  } catch {
    return null;
  }
}
