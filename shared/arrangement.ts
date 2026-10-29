/**
 * The arrangement (spec 2026-10-20): a contact's deal to sit the player's chair as their operator, struck in
 * a quest's outcome (`arrangement: chair <retainer> / <nights>`) and kept as story meta in her room. Active
 * while her trust is high; suspended (stepped back) below.
 */
import { bandOf } from './standing';

export interface Arrangement {
  role: 'operator';
  retainer: number;
  nights: 1 | 2;
  /** The story clock it was struck at. */
  since: number;
}

export const arrangementKey = (player: string): string => `arrangement.${player}`;

/** A stored arrangement, or null when there's none or it doesn't read. */
export function parseArrangement(json: string | null): Arrangement | null {
  if (json === null) return null;
  try {
    const v = JSON.parse(json) as Partial<Arrangement>;
    if (v.role !== 'operator' || typeof v.retainer !== 'number' || (v.nights !== 1 && v.nights !== 2) || typeof v.since !== 'number') return null;
    return { role: 'operator', retainer: v.retainer, nights: v.nights, since: v.since };
  } catch {
    return null;
  }
}

/** In force while her trust is high (5+); suspended below. */
export const arrangementActive = (a: Arrangement | null, trust: number | null): boolean => a !== null && trust !== null && bandOf(trust) === 'high';

/** Her `[arrangement]` line: the deal and tonight's count, or that she's stepped back. */
export function arrangementLine(o: { player: string; a: Arrangement; active: boolean; done: number }): string {
  if (!o.active) return `[arrangement — stepped back] You agreed to sit ${o.player}'s chair, but you've stepped back: the trust isn't there right now. You'll say why if they ask.`;
  const nights = o.a.nights === 1 ? 'one job a night' : 'two jobs a night';
  return `[arrangement] You sit ${o.player}'s chair as their operator: ${o.a.retainer} a night, ${nights}. Your terms: nobody from your stairs on their list; the room stays out of it; you stop when you say stop. On your shift you leave the Intake for their jobs and come back after. Tonight: ${o.done} of ${o.a.nights} done.`;
}
