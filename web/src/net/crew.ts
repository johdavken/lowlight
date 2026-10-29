/** GET /api/crew (crew spec §4): the CREW screen's view; null without a playthrough or on any failure. */
import type { CrewView } from '../../../shared/types';

export async function fetchCrew(): Promise<CrewView | null> {
  try {
    const res = await fetch('/api/crew');
    if (!res.ok) return null;
    return ((await res.json()) as { crew: CrewView | null }).crew;
  } catch {
    return null;
  }
}
