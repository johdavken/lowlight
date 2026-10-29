/** GET /api/kit (missions spec §4): the YOU sheet's stats, heat, sol and deck; null without a playthrough or on any failure. */
import type { KitView } from '../../../shared/types';

export async function fetchKit(): Promise<KitView | null> {
  try {
    const res = await fetch('/api/kit');
    if (!res.ok) return null;
    return ((await res.json()) as { kit: KitView | null }).kit;
  } catch {
    return null;
  }
}
