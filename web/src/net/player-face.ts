/**
 * The player's face thumbnail. Usually the character's (`/api/agents/<id>/thumb`); a persona with its own figure
 * (spec 2026-11-12) has its own, which `/api/persona` names. The roster's URL stays the character's everywhere
 * else (select grid, LOAD, the same character as someone's contact), so only the player's own faces ask here.
 */
let own: { id: string; url: string } | null = null;

/** Set from `/api/persona` (its `thumb` when it differs from the character's; null: none). */
export function setPlayerFace(id: string, url: string | null): void {
  own = url ? { id, url } : null;
}

/** The face to show for `id` as the player. */
export function playerFace(id: string): string {
  return own && own.id === id ? own.url : `/api/agents/${encodeURIComponent(id)}/thumb`;
}
