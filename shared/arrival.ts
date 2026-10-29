/** The arrival screen (spec 2026-10-27): what GO and the opening carry, shared by the server and the room. */

/** Your line on the way, at most (a held line's size). */
export const TRAVEL_LINE_MAX = 2000;

/**
 * The move's action line, as she reads it (and as the arrival screen shows it): through an exit it
 * says the way (clickable doors spec §4); on comms (spec 2026-10-20) you go alone, her on the line,
 * and back to her you go to her.
 */
export function moveLine(m: { you: string; contact: string; from: string | null; to: string; via?: string; comms?: { on: boolean } }): string {
  const who = `${m.you} and ${m.contact}`;
  if (m.comms?.on) {
    if (m.via) return `*${m.you} goes ${m.via}, ${m.contact} on the line.*`;
    return m.from ? `*${m.you} heads from ${m.from} to ${m.to}, ${m.contact} on the line.*` : `*${m.you} heads to ${m.to}, ${m.contact} on the line.*`;
  }
  if (m.comms) return m.from ? `*${m.you} heads from ${m.from} back to ${m.contact} at ${m.to}.*` : `*${m.you} heads back to ${m.contact} at ${m.to}.*`;
  if (m.via) return `*${who} go ${m.via}.*`;
  return m.from ? `*${who} head from ${m.from} to ${m.to}.*` : `*${who} head to ${m.to}.*`;
}
