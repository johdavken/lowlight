/**
 * Who has power (blackouts phase 3 §1–§3): the schedule worked out from the clock, plus the narrator's power cuts kept
 * in the playthrough. A room's district is its place's; a place standing on the Spine has the Spine's own feed. A place on
 * the Ribbon goes dark with its district (every Karasu place is on it): only the Ribbon's structure keeps its light on
 * the map.
 */
import { darkAt, NARRATOR_OUTAGE_MINUTES, NO_POWER_DISTRICTS, type Outage } from '../../shared/outage';
import { districtOf } from './rooms';

/** Where a room stands: its district (null: unknown) and the structure it's on (`ribbon`, `spine`), if any. */
export interface PowerPlace {
  district: string | null;
  on: string | null;
}

type Pt = { id: string; seed?: string; outages?: readonly Outage[] } | null;
type Rates = Readonly<Record<string, number>>;

/** Every district dark at `now` in `pt`; none without a playthrough. */
export function darkNow(pt: Pt, now: number, rates: Rates): Outage[] {
  if (!pt) return [];
  return darkAt({ seed: pt.seed ?? pt.id, now, rates, narrated: pt.outages ?? [] });
}

/** A room's district, and the outage it's in at `now` (null when it has power). */
export function powerOf(pt: Pt, now: number, rates: Rates, locate: (sceneId: string) => PowerPlace | null, sceneId: string): { district: string; outage: Outage | null } {
  const place = locate(sceneId);
  const district = place?.district ?? districtOf(sceneId);
  if (place?.on === 'spine') return { district, outage: null };
  return { district, outage: darkNow(pt, now, rates).find((o) => o.district === district) ?? null };
}

/** The playthrough's outages with a narrator's power cut added, from `at` for 90 minutes; null when the room's district is already dark or has its own feed. */
export function addNarrated(pt: NonNullable<Pt>, rates: Rates, locate: (sceneId: string) => PowerPlace | null, o: { contact: string; row: string | null; at: number; sceneId: string }): Outage[] | null {
  const here = powerOf(pt, o.at, rates, locate, o.sceneId);
  const place = locate(o.sceneId);
  if (here.outage || NO_POWER_DISTRICTS.has(here.district) || place?.on === 'spine') return null;
  return [...(pt.outages ?? []), { district: here.district, from: o.at, to: o.at + NARRATOR_OUTAGE_MINUTES, by: 'narrator', contact: o.contact, row: o.row }];
}

/** The outages without `contact`'s whose encounter row a rewind or swipe took away; null when none went. Admin outages (no row) stay. */
export function dropUndone(list: readonly Outage[], contact: string, hasRow: (id: string) => boolean): Outage[] | null {
  const kept = list.filter((o) => o.by !== 'narrator' || o.contact !== contact || !o.row || hasRow(o.row));
  return kept.length === list.length ? null : kept;
}
