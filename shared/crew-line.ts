/**
 * The `[crew]` line (crew spec §5): what the player's crew did off-screen since the last contact turn, for her prompt.
 * Built from the folded crew in code, no model call: errand results and who walked or talked. Job results are left to
 * the debrief and her closing line; hires, wages and promotions aren't news.
 */
import type { CrewState } from './crew-fold';

/** At most this many items; past it, `And N more.` */
export const CREW_LINE_MAX = 3;

const stop = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The line for what landed in (`since`, `until`], newest first; null when nothing did. */
export function crewLine(crew: CrewState, since: number, until: number): string | null {
  const within = (at: number) => at > since && at <= until;
  const items: { at: number; text: string }[] = [];
  for (const m of crew.members) {
    for (const r of m.log) if (r.from !== 'job' && within(r.at)) items.push({ at: r.at, text: stop(r.line) });
    const first = m.recruit.name.split(' ')[0];
    if (m.goneAt !== undefined && within(m.goneAt) && (m.gone === 'walked' || m.gone === 'talked')) items.push({ at: m.goneAt, text: m.gone === 'walked' ? `${first} walked.` : `${first} talked to SDG.` });
  }
  if (items.length === 0) return null;
  items.sort((a, b) => b.at - a.at);
  const shown = items.slice(0, CREW_LINE_MAX).map((i) => i.text);
  const more = items.length - shown.length;
  return `[crew] ${shown.join(' ')}${more > 0 ? ` And ${more} more.` : ''}`;
}
