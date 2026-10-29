import type { PersonaInfo } from '../../../shared/types';
import { playerFromSearch } from './identity';

export interface RoomPlayer {
  /** Who to connect the socket as; null when there's no persona at all (default 'you', no file). */
  player: string | null;
  persona: PersonaInfo | null;
  /** The corrected `location.search` to `history.replaceState` to, or null to leave the URL alone. */
  search: string | null;
}

/**
 * Reads `?as=`, fetches `/api/persona` for it (or without `as` when missing/invalid), and says what
 * to connect as and whether the URL needs correcting (Review Focus 5): a missing, invalid or
 * resolved-to-something-else `?as=` is rewritten to the persona's actual id, keeping other params.
 * With no persona at all (default 'you', no persona file), an `?as=` is dropped instead.
 *
 * A failed fetch is not the same as "no persona at all": it falls back to the URL's own, already-
 * validated `as` (the server resolves/validates it again on connect) and leaves the URL untouched,
 * so a transient failure never silently swaps which dossier the tab lands in.
 */
export async function resolveRoomPlayer(
  search: string,
  fetchPersona: (as: string | null) => Promise<{ persona: PersonaInfo | null }>,
): Promise<RoomPlayer> {
  const as = playerFromSearch(search);
  let persona: PersonaInfo | null;
  try {
    persona = (await fetchPersona(as)).persona;
  } catch {
    return { player: as, persona: null, search: null };
  }
  if (!persona) {
    // No persona at all: the tab is the default 'you', so any `as` (valid-looking or not) goes.
    const params = new URLSearchParams(search);
    if (!params.has('as')) return { player: null, persona: null, search: null };
    params.delete('as');
    const rest = params.toString();
    return { player: null, persona: null, search: rest ? `?${rest}` : '' };
  }

  if (persona.id === as) return { player: persona.id, persona, search: null };

  const params = new URLSearchParams(search);
  params.set('as', persona.id);
  return { player: persona.id, persona, search: `?${params.toString()}` };
}
