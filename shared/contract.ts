/**
 * Contracts (tier 3 contracts spec): what groundwork leaves for the night, and the tier's fixed rep. Pure: the server
 * plays from these and job-sim reads them.
 */
import type { Specialty } from './crew-book';

export type Band = 'clean' | 'messy' | 'blown';

/** A guest's fixed abilities by trade (guest crew spec §2): normal ones of the grade, nothing to slot. */
export const GUEST_ABILITIES: Partial<Record<Specialty, string[]>> = { runner: ['clean-exit', 'run-it-twice'] };

/** A `guest-note:` line: as long as a journal note can be. */
export const GUEST_NOTE_MAX = 280;

/** A guest's crew id: never on the roster, so the crew fold and shares pass over it. No colon: an ability card's rid can't hold one. */
export const guestId = (contact: string): string => `guest-${contact}`;

/** The most ALARM groundwork can start a night on. */
export const NIGHT_ALARM_MAX = 2;

/** The night's starting ALARM: 1 for each messy or blown piece, at most 2. */
export const nightAlarm = (results: Record<string, Band>): number => Math.min(NIGHT_ALARM_MAX, Object.values(results).filter((b) => b !== 'clean').length);

/** The flags a night reads: `angle.<piece>=yes` for each clean or messy piece, `seen=yes` if any blew. */
export function angleFlags(results: Record<string, Band>): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const [piece, band] of Object.entries(results)) {
    if (band === 'blown') flags.seen = 'yes';
    else flags[`angle.${piece}`] = 'yes';
  }
  return flags;
}

/** The pieces a run can still send tonight: two at most, one a night (tier 3 contracts spec §2). */
export function openPieces<P extends { id: string }>(pieces: P[], sends: { piece: string; day: number }[], day: number): P[] {
  if (sends.length >= 2 || sends.some((s) => s.day === day)) return [];
  return pieces.filter((p) => !sends.some((s) => s.piece === p.id));
}

/** The flag a guest sets at GO IN, for the beats that read it (guest crew spec §3). */
export const guestFlags = (setup: { guest?: { id: string } }): Record<string, string> => (setup.guest ? { [`guest.${setup.guest.id}`]: 'yes' } : {});

/** Rep lost walking away from a contract while it waits. */
export const WALK_AWAY_REP = 5;

/** Rep at a contract's end. */
export const contractRep = (tier: Band): number => (tier === 'clean' ? 15 : tier === 'messy' ? 2 : -25);
