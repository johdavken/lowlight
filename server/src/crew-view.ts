/**
 * Crew in the playthrough (crew spec §3–§4): the story meta key per recruit, its event list, and the CREW screen's
 * view built from the folded state. Pure apart from what it's given.
 */
import { BANDS, GRADES, type CrewBook, type Specialty, type Trait } from '../../shared/crew-book';
import { crewOdds, errandsFor, hiresFor, LOYALTY_LINE, loyaltyWord, slots } from '../../shared/crew';
import type { CrewEvent, CrewState } from '../../shared/crew-fold';
import type { Extra } from '../../shared/extras';
import { repTier, type Kit } from '../../shared/mission';
import { storyDay } from '../../shared/board';
import type { CrewView } from '../../shared/types';

/** One recruit's events: `crew.<player>.<recruitId>` (story meta, so rewind and branch rebuild it). */
export const crewKey = (player: string, recruitId: string) => `crew.${player}.${recruitId}`;

/** A key's event list; anything unreadable is none. */
export function parseCrewEvents(v: string | null): CrewEvent[] {
  if (!v) return [];
  try {
    const x = JSON.parse(v) as unknown;
    return Array.isArray(x) ? (x.filter((e) => e && typeof e === 'object' && typeof (e as CrewEvent).at === 'number' && typeof (e as CrewEvent).type === 'string') as CrewEvent[]) : [];
  } catch {
    return [];
  }
}

const SIX = 360;
const DAY = 1440;

export function crewView(o: {
  crew: CrewState;
  kit: Kit;
  book: CrewBook;
  now: number;
  seed: string;
  /** Map places that hire. */
  places: { id: string; name: string; district: string; hires: Specialty[] }[];
  extras: Extra[];
  /** Tonight's posted jobs. */
  posted: { job: string; place: string; district: string }[];
  here: string | null;
  /** Districts with at least one map place: origins and errand districts. */
  districts: string[];
  /** Display names: a job's title, a district's name (ids when absent). */
  names?: { job?(id: string): string; district?(id: string): string };
}): CrewView {
  const { crew, kit, book } = o;
  const day = storyDay(o.now);
  const traitOf = (id: string): Trait | undefined => book.traits.find((t) => t.id === id);
  const live = crew.members.filter((m) => m.state !== 'gone');
  // Faces on anyone hired before today: today's hires come from today's draw, so the list doesn't reshuffle after a hire.
  const usedFaces = new Set(crew.members.filter((m) => m.recruit.face && storyDay(m.hired.at) < day).map((m) => m.recruit.face!));
  const hiredIds = new Set(crew.members.map((m) => m.recruit.id));
  const roster = crew.members.map((m) => {
    const word = loyaltyWord(m.loyalty);
    const shown = m.revealed.map(traitOf).filter((t): t is Trait => t !== undefined);
    return {
      ...m,
      traitsShown: shown.map((t) => ({ label: t.label, good: t.good, text: t.text })),
      hiddenTraits: m.recruit.traits.filter((t) => !m.revealed.includes(t)).length,
      word,
      line: LOYALTY_LINE[word],
      next: m.recruit.grade < 3 ? GRADES[m.recruit.grade + 1] : null,
    };
  });
  // No names (a build without world/crew): nobody to hire, rather than cards named Nobody.
  const hiring = Object.values(book.names).some((l) => l.length > 0) ? o.places : [];
  const hires = hiring.map((p) => ({
    place: p.id,
    name: p.name,
    district: p.district,
    cards: hiresFor({
      book,
      place: p.id,
      district: p.district,
      specs: p.hires,
      tier: repTier(kit.rep[p.district] ?? 0),
      day,
      seed: o.seed,
      faces: o.extras,
      usedFaces,
      origins: o.districts,
    }).filter((c) => !c.recruit || !hiredIds.has(c.recruit.id)),
  }));
  const ready = live.filter((m) => m.state === 'ready' && !m.busy);
  const errands = errandsFor({ book, day, posted: o.posted, rep: kit.rep, heat: kit.heat, districts: o.districts }).flatMap((inst) => {
    const e = book.errands.find((x) => x.kind === inst.kind);
    if (!e) return [];
    const heat = inst.district ? (kit.heat[inst.district] ?? 0) : 0;
    const odds = Object.fromEntries(
      ready.map((m) => [m.recruit.id, crewOdds({ errand: e, recruit: m.recruit, traits: m.recruit.traits.map(traitOf).filter((t): t is Trait => t !== undefined), heat, goneUsed: m.goneUsed })]),
    );
    const bands = Object.fromEntries(BANDS.map((b) => [b, e.bands[b].lines[0]])) as Record<(typeof BANDS)[number], string>;
    const name = inst.job ? (o.names?.job?.(inst.job) ?? inst.job) : inst.district ? (o.names?.district?.(inst.district) ?? inst.district) : '';
    return [{ ...inst, name, label: e.label, tag: e.tag, suits: e.suits, hours: e.hours, risk: e.risk, blurb: e.blurb, bands, taken: crew.taken.includes(inst.id), odds }];
  });
  const results = crew.members
    .flatMap((m) => m.log.map((r) => ({ ...r, recruit: m.recruit.id, name: m.recruit.name })))
    .sort((a, b) => b.at - a.at);
  const nextSix = (Math.floor((o.now - SIX) / DAY) + 1) * DAY + SIX - o.now;
  const traits = Object.fromEntries(book.traits.map((t) => [t.id, { label: t.label, good: t.good, text: t.text }]));
  return { roster, slots: slots(kit.rep), used: live.length, sol: kit.sol, wages: crew.wages, nextSix, here: o.here, hires, errands, results, traits };
}
