/**
 * The arrangement (spec 2026-10-20): a contact's deal to sit the player's chair as their operator, struck in
 * a quest's outcome (`arrangement: chair-cut <pct> / <nights>`) and kept as story meta in her room. Active
 * while her trust is high; suspended (stepped back) below. Since The Chair, Tier 2 (spec 2026-11-01) her fee is a
 * cut of each job, and a second tier takes up to three of your jobs a night.
 */
import { bandOf } from './standing';

export interface Arrangement {
  role: 'operator';
  /** 1: The Chair; 2: The Chair, again. */
  tier: 1 | 2;
  /** Her share of each job she's on, in percent. */
  cut: number;
  nights: 1 | 2 | 3;
  /** The story clock it was struck at. */
  since: number;
}

/** An old nightly retainer as a cut (Tier 2 spec §2): 100 → 20 %, 150 → 25 %, 200 → 30 %; else ÷ 5, to 5, within 5–50. */
export const retainerToCut = (retainer: number): number => (retainer === 100 ? 20 : retainer === 150 ? 25 : retainer === 200 ? 30 : Math.min(50, Math.max(5, Math.round(retainer / 5 / 5) * 5)));

/** Her cut of a job that paid `paid` sol, to 10 sol; nothing when it paid nothing. */
export const cutOf = (paid: number, cut: number): number => (paid > 0 ? Math.round((paid * cut) / 100 / 10) * 10 : 0);

export const arrangementKey = (player: string): string => `arrangement.${player}`;

/** A stored arrangement, or null when there's none or it doesn't read. */
export function parseArrangement(json: string | null): Arrangement | null {
  if (json === null) return null;
  try {
    const v = JSON.parse(json) as Partial<Arrangement> & { retainer?: unknown };
    if (v.role !== 'operator' || (v.nights !== 1 && v.nights !== 2 && v.nights !== 3) || typeof v.since !== 'number') return null;
    // A deal struck before the cut (a nightly retainer) reads as a tier 1 cut.
    const cut = typeof v.cut === 'number' ? v.cut : typeof v.retainer === 'number' ? retainerToCut(v.retainer) : null;
    if (cut === null) return null;
    return { role: 'operator', tier: v.tier === 2 ? 2 : 1, cut, nights: v.nights, since: v.since };
  } catch {
    return null;
  }
}

/** In force while her trust is high (5+); suspended below. */
export const arrangementActive = (a: Arrangement | null, trust: number | null): boolean => a !== null && trust !== null && bandOf(trust) === 'high';

/** Her `[arrangement]` line: the deal and tonight's count, or that she's stepped back. */
export function arrangementLine(o: { player: string; a: Arrangement; active: boolean; done: number }): string {
  if (!o.active) return `[arrangement — stepped back] You agreed to sit ${o.player}'s chair, but you've stepped back: the trust isn't there right now. You'll say why if they ask.`;
  const nights = o.a.nights === 1 ? 'one job a night' : o.a.nights === 2 ? 'two jobs a night' : 'up to three jobs a night';
  return `[arrangement] You sit ${o.player}'s chair as their operator: a ${o.a.cut}% cut of each job you're on, ${nights}. Your terms: nobody from your stairs on their list; the room stays out of it; you stop when you say stop. On your shift you leave the Intake for their jobs and come back after. Tonight: ${o.done} of ${o.a.nights} done.`;
}

export type ChairCheck = { id: 'jobs' | 'clean' | 'blown' | 'paid' | 'standing' | 'trust' | 'shift'; label: string; ok: boolean; progress?: string };

/** Tier 2's numbers (spec 2026-11-01 §1). */
export const CHAIR_TWO = { jobs: 6, cleanOf: [4, 6], noBlownIn: 3, trusted: 45 } as const;

/**
 * The Chair, again's checklist (Tier 2 spec §1): jobs with her since the deal (newest first, her own clients' and
 * contracts already left out), whether she was ever left unpaid, your best rep, her trust and her shift. `ready` is the
 * record alone (the first five); the row adds her trust (only when it isn't high) and her shift.
 */
export function chairTwoChecks(o: { jobs: { tier: 'clean' | 'messy' | 'blown' }[]; unpaid: boolean; bestRep: { district: string; rep: number } | null; trustHigh: boolean; shift: { open: boolean; from: string } }): { checks: ChairCheck[]; ready: boolean } {
  const [need, of] = CHAIR_TWO.cleanOf;
  const clean = o.jobs.slice(0, of).filter((j) => j.tier === 'clean').length;
  const word = (rep: number) => (rep >= 75 ? 'A NAME' : rep >= CHAIR_TWO.trusted ? 'TRUSTED' : rep >= 20 ? 'KNOWN' : 'NOBODY');
  const record: ChairCheck[] = [
    { id: 'jobs', label: `${CHAIR_TWO.jobs} JOBS WITH HER UNDER THE DEAL`, ok: o.jobs.length >= CHAIR_TWO.jobs, progress: `${Math.min(o.jobs.length, CHAIR_TWO.jobs)}/${CHAIR_TWO.jobs}` },
    { id: 'clean', label: `${need} OF THE LAST ${of} CLEAN`, ok: clean >= need, progress: `${clean}/${of}` },
    { id: 'blown', label: `NO BLOWN JOB IN THE LAST ${CHAIR_TWO.noBlownIn}`, ok: !o.jobs.slice(0, CHAIR_TWO.noBlownIn).some((j) => j.tier === 'blown') },
    { id: 'paid', label: 'NEVER LEFT HER UNPAID', ok: !o.unpaid },
    { id: 'standing', label: 'TRUSTED SOMEWHERE', ok: (o.bestRep?.rep ?? 0) >= CHAIR_TWO.trusted, progress: o.bestRep ? `${word(o.bestRep.rep)} IN ${o.bestRep.district.toUpperCase().replace(/-/g, ' ')}` : 'NOBODY ANYWHERE' },
  ];
  const ready = record.every((c) => c.ok);
  return {
    checks: [...record, ...(o.trustHigh ? [] : [{ id: 'trust' as const, label: 'HER TRUST · HIGH', ok: false }]), { id: 'shift', label: 'HER SHIFT', ok: o.shift.open, ...(o.shift.open ? {} : { progress: `FROM ${o.shift.from}` }) }],
    ready,
  };
}
