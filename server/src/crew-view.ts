/**
 * Crew in the playthrough (crew spec §3–§4): the story meta key per recruit, its event list, and the CREW screen's
 * view built from the folded state. Pure apart from what it's given.
 */
import { isStale, nightsLeft, salePrice, STASH_MAX, wantedFor } from '../../shared/goods';
import { BANDS, GRADES, TIMING, type Ability, type CrewBook, type Grade, type Specialty, type Trait } from '../../shared/crew-book';
import { ABILITY_SLOTS, buyCost, crewOdds, dueAt, errandsFor, sellErrand, traitHas, errandWords, hiresFor, jobWords, jobRecruitCard, jobRecruitId, LOYALTY_LINE, loyaltyWord, slots, vouchedFor, type HireCard } from '../../shared/crew';
import type { CrewEvent, CrewState } from '../../shared/crew-fold';
import type { Extra } from '../../shared/extras';
import { repTier, type Kit } from '../../shared/mission';
import { storyDay } from '../../shared/board';
import { openPieces } from '../../shared/contract';
import type { JobHire } from '../../shared/quests';
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

/** A picture in world/crew/art, as the page asks for it. */
const crewArt = (file: string) => `/api/crew/art/${file}`;
/** A picture in world/quests/art, as the page asks for it. */
const questArt = (file: string) => `/api/quests/art/${file}`;

const SIX = 360;
const DAY = 1440;
/** The first 06:00 after story minute `at`. */
const nextSixAfter = (at: number) => (Math.floor((at - SIX) / DAY) + 1) * DAY + SIX;

/**
 * What a free card is drawn from (crew spec §5), the same for the CREW screen and a debrief's recruit line: faces on
 * anyone hired before today are taken, as for tonight's hires, and so are their names.
 */
export function freeDraw(o: { crew: CrewState; book: CrewBook; seed: string; extras: Extra[]; districts: string[]; now: number }) {
  const day = storyDay(o.now);
  const usedFaces = new Set(o.crew.members.filter((m) => m.recruit.face && storyDay(m.hired.at) < day).map((m) => m.recruit.face!));
  const usedNames = new Set(o.crew.members.filter((m) => storyDay(m.hired.at) < day).map((m) => m.recruit.name));
  return { book: o.book, seed: o.seed, faces: o.extras, usedFaces, usedNames, origins: o.districts };
}

/** Whether a job's free card is up and nobody's taken it (crew spec §5): the CREW word's dot. */
export function freeHireWaiting(o: { crew: CrewState; seed: string; jobCards: { runKey: string; endAt: number }[]; now: number }): boolean {
  const hired = new Set(o.crew.members.map((m) => m.recruit.id));
  return o.jobCards.some((j) => o.now >= j.endAt && o.now < nextSixAfter(j.endAt) && !hired.has(jobRecruitId(o.seed, j.runKey)));
}

export function crewView(o: {
  crew: CrewState;
  kit: Kit;
  book: CrewBook;
  now: number;
  seed: string;
  /** Map places that hire. */
  places: { id: string; name: string; district: string; hires: Specialty[] }[];
  extras: Extra[];
  /** Contracts waiting for their night (tier 3 contracts spec §3): `art` a file in world/quests/art. */
  contracts?: { run: string; title: string; nightsLeft: number; art: string | null; pieces: { id: string; spec: Specialty; line: string }[] }[];
  here: string | null;
  /** Districts with at least one map place: origins and errand districts. */
  districts: string[];
  /** Display names: a job's title, a district's name (ids when absent). */
  names?: { job?(id: string): string; district?(id: string): string; contact?(id: string): string; place?(id: string): string };
  /** Contacts in a vouch cell this week, with their home place (crew spec §5). */
  /** `tier`: the district's rep tier as the story week began, so the card holds all week; absent: tonight's. */
  vouchers?: { contact: string; name: string; accent?: string; place: string; placeName: string; district: string; spec: Specialty | null; tier?: 1 | 2 | 3 | 4 }[];
  /** Ended job runs whose outcome gave `gives: recruit` (crew spec §5); each shows until the next 06:00 after `endAt`. */
  jobCards?: ({ runKey: string; title: string; place: string; placeName: string; district: string; endAt: number } & JobHire)[];
  /** Whether any spring file is written (SPRING THEM needs one). */
  springs?: boolean;
  /** Recruits whose rescue is under way (`rescueOpen`): SPRING THEM waits for it, across 06:00. */
  rescuing?: string[];
}): CrewView {
  const { crew, kit, book } = o;
  const day = storyDay(o.now);
  const traitOf = (id: string): Trait | undefined => book.traits.find((t) => t.id === id);
  const abilityOf = (id: string): Ability | undefined => book.abilities.find((a) => a.id === id);
  const live = crew.members.filter((m) => m.state !== 'gone');
  // Faces and names on anyone hired before today: today's hires come from today's draw, so the list doesn't reshuffle
  // after a hire.
  const usedFaces = new Set(crew.members.filter((m) => m.recruit.face && storyDay(m.hired.at) < day).map((m) => m.recruit.face!));
  const usedNames = new Set(crew.members.filter((m) => storyDay(m.hired.at) < day).map((m) => m.recruit.name));
  const hiredIds = new Set(crew.members.map((m) => m.recruit.id));
  // SPRING THEM (crew spec §5): one rescue a night across the roster, and only with a spring file written.
  const sprungToday = (crew.springDays ?? []).includes(day);
  const springOf = (m: (typeof crew.members)[number]) => {
    const rescuing = o.rescuing?.includes(m.recruit.id) === true;
    const why = m.state !== 'held' ? null : rescuing ? 'their rescue is under way' : !o.springs ? 'no rescue written' : sprungToday ? 'one rescue a night' : null;
    return { canSpring: m.state === 'held' && why === null, springWhy: why };
  };
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
      ...springOf(m),
      springPlace: m.state === 'held' && (m.spring?.day === day || o.rescuing?.includes(m.recruit.id)) ? (o.names?.place?.(m.hired.place) ?? m.hired.place) : null,
      vouchedBy: m.vouched ? (o.names?.contact?.(m.vouched) ?? m.vouched) : null,
      slots: ABILITY_SLOTS[m.recruit.grade],
    };
  });
  // No names (a build without world/crew): nobody to hire, rather than cards named Nobody.
  const hiring = Object.values(book.names).some((l) => l.length > 0) ? o.places : [];
  // One person per night across the city: each place's cards take the names and faces earlier places drew (all of
  // them, hired or not, so a hire doesn't reshuffle the places after it).
  const tonightFaces = new Set(usedFaces);
  const tonightNames = new Set(usedNames);
  const hires: CrewView['hires'] = hiring.map((p) => {
    const cards = hiresFor({
      book,
      place: p.id,
      district: p.district,
      specs: p.hires,
      tier: repTier(kit.rep[p.district] ?? 0),
      day,
      seed: o.seed,
      faces: o.extras,
      usedFaces: tonightFaces,
      usedNames: tonightNames,
      origins: o.districts,
    });
    for (const c of cards) {
      if (c.recruit?.face) tonightFaces.add(c.recruit.face);
      if (c.recruit) tonightNames.add(c.recruit.name);
    }
    return { place: p.id, name: p.name, district: p.district, cards: cards.filter((c) => !c.recruit || !hiredIds.has(c.recruit.id)) };
  });
  // Free cards (crew spec §5): a vouch per contact in its own entry at her home place, a job's card at its place.
  const free = freeDraw({ crew, book, seed: o.seed, extras: o.extras, districts: o.districts, now: o.now });
  const tierIn = (district: string) => repTier(kit.rep[district] ?? 0);
  const fresh = (c: HireCard) => !c.recruit || !hiredIds.has(c.recruit.id);
  if (Object.values(book.names).some((l) => l.length > 0)) {
    for (const v of o.vouchers ?? []) {
      const c = vouchedFor({ ...free, contact: v.contact, contactName: v.name, place: v.place, district: v.district, tier: v.tier ?? tierIn(v.district), week: Math.floor(day / 7), spec: v.spec });
      if (fresh(c)) hires.push({ place: v.place, name: v.placeName, district: v.district, cards: [c], vouched: { contact: v.contact, name: v.name, ...(v.accent ? { accent: v.accent } : {}) } });
    }
    for (const j of o.jobCards ?? []) {
      if (o.now < j.endAt || o.now >= nextSixAfter(j.endAt)) continue;
      const c = jobRecruitCard({ ...free, ...j });
      if (!fresh(c)) continue;
      const at = hires.find((h) => h.place === j.place && !h.vouched);
      if (at) at.cards.push(c);
      else hires.push({ place: j.place, name: j.placeName, district: j.district, cards: [c] });
    }
  }
  const ready = live.filter((m) => m.state === 'ready' && !m.busy);
  const runs = (o.contracts ?? []).flatMap((c) => openPieces(c.pieces, crew.groundwork?.[c.run] ?? [], day).map((p) => ({ run: c.run, piece: p.id, spec: p.spec })));
  const stashNow = crew.stash ?? [];
  const goodsOf = (id: string | undefined) => book.goods?.find((g) => g.id === id);
  const kinds = (book.goods ?? []).map((g) => g.id);
  const known = (d: string) => (kit.rep[d] ?? 0) >= 20;
  const wantedHere = wantedFor({ seed: o.seed, day, districts: o.districts, kinds });
  const traitsFor = (m: (typeof ready)[number]) => m.recruit.traits.map(traitOf).filter((t): t is Trait => t !== undefined);
  const errands = errandsFor({ book, day, rep: kit.rep, heat: kit.heat, districts: o.districts, seed: o.seed, stash: stashNow, ...(runs.length ? { runs } : {}) }).flatMap((inst) => {
    const e = book.errands.find((x) => x.kind === inst.kind);
    if (!e) return [];
    const heat = inst.district ? (kit.heat[inst.district] ?? 0) : 0;
    const lot = inst.lot ? stashNow.find((l) => l.id === inst.lot) : undefined;
    const lotGoods = goodsOf(lot?.kind);
    // A sale: who can reach the district, each at their own route (crew goods spec §3, §7).
    const sellers = lot ? ready.filter((m) => known(inst.district) || lot.district === inst.district || traitsFor(m).some((t) => traitHas(t, 'sells-anywhere'))) : ready;
    const errandOf = (m: (typeof ready)[number]) => (lotGoods ? sellErrand(e, lotGoods, m.recruit.spec) : e);
    const odds = Object.fromEntries(
      // Traits, then the slotted abilities' errand effects (crew abilities spec §3), as the fold rolls them.
      sellers.map((m) => [m.recruit.id, crewOdds({ ...(inst.spec ? { match: inst.spec } : {}), errand: errandOf(m), recruit: m.recruit, traits: traitsFor(m), heat, goneUsed: m.goneUsed })]),
    );
    const bands = Object.fromEntries(BANDS.map((b) => [b, e.bands[b].lines[0]])) as Record<(typeof BANDS)[number], string>;
    const name = inst.run ? `${o.names?.job?.(inst.run.split('@')[0]) ?? inst.run} · ${inst.piece}` : inst.job ? (o.names?.job?.(inst.job) ?? inst.job) : inst.district ? (o.names?.district?.(inst.district) ?? inst.district) : '';
    const goods = goodsOf(inst.goods) ?? lotGoods;
    const art = goods?.art ? crewArt(goods.art) : (e.art ?? (inst.run ? o.contracts?.find((c) => c.run === inst.run)?.art : null));
    const wanted = lot ? wantedHere[inst.district] === lot.kind : false;
    const routes =
      lot && lotGoods
        ? Object.fromEntries(
            sellers.map((m) => {
              const ts = traitsFor(m);
              const payPct = ts.reduce((p, t) => (t.effect.kind === 'pay' && (t.effect.errand === 'any' || t.effect.errand === e.kind || t.effect.errand === e.group) ? p + t.effect.pct : p), 0);
              const price = salePrice({ lot, goods: lotGoods, spec: m.recruit.spec, wanted, day, fullRoute: ts.some((t) => traitHas(t, 'full-route')), payPct });
              return [m.recruit.id, { price, hours: Math.round((dueAt(0, errandOf(m), m.recruit, ts) / 60) * 10) / 10 }];
            }),
          )
        : null;
    const cost = buyCost(e, goodsOf(inst.goods));
    return [{ ...inst, name, label: e.label, tag: e.tag, suits: e.suits, hours: e.hours, risk: e.risk, blurb: e.blurb, ...(art ? { art: art.startsWith('/') ? art : questArt(art) } : {}), bands, taken: crew.taken.includes(inst.id), odds, ...(e.group ? { group: e.group } : {}), ...(lot ? { wanted } : {}), ...(routes ? { routes } : {}), ...(cost > 0 ? { cost } : {}) }];
  });
  // Every piece, sendable or not: one landed is back, one sent is out, one open can go, and any other waits its turn.
  const kindOfRun = book.errands.find((e) => e.needs?.on === 'run');
  const contracts: NonNullable<CrewView['contracts']> = kindOfRun
    ? (o.contracts ?? []).map((c) => {
        const art = kindOfRun.art ?? c.art;
        const pieces = c.pieces.map((p) => {
          const base = { id: p.id, label: `The ${p.id}`, spec: p.spec, line: p.line };
          if (crew.reports?.[`${c.run}:${p.id}`]) return { ...base, state: 'back' as const };
          if (crew.groundwork?.[c.run]?.some((g) => g.piece === p.id)) {
            const m = crew.members.find((x) => x.state === 'out' && x.errand?.startsWith(`${kindOfRun.kind}:${c.run}:${p.id}:`));
            return { ...base, state: 'out' as const, ...(m ? { recruit: m.recruit.id, errand: m.errand, ...(m.due !== undefined ? { due: m.due } : {}) } : {}) };
          }
          const open = errands.find((e) => e.run === c.run && e.piece === p.id);
          return open ? { ...base, state: 'open' as const, errand: open.id } : { ...base, state: 'waits' as const };
        });
        return { run: c.run, title: c.title, nightsLeft: c.nightsLeft, ...(art ? { art: questArt(art) } : {}), hours: kindOfRun.hours, risk: kindOfRun.risk, pieces };
      })
    : [];
  const results = crew.members
    .flatMap((m) => m.log.map((r) => ({ ...r, recruit: m.recruit.id, name: m.recruit.name })))
    .sort((a, b) => b.at - a.at);
  const nextSix = (Math.floor((o.now - SIX) / DAY) + 1) * DAY + SIX - o.now;
  const traits = Object.fromEntries(book.traits.map((t) => [t.id, { label: t.label, good: t.good, text: t.text }]));
  const abilities = Object.fromEntries(book.abilities.map((a) => [a.id, { label: a.label, timing: TIMING[a.job.kind], job: jobWords(a.job), text: a.text, from: a.from }]));
  const nameOf = (d: string) => o.names?.district?.(d) ?? d;
  const wanted = o.districts.filter((d) => known(d) && wantedHere[d]).map((d) => ({ district: d, name: nameOf(d), kind: wantedHere[d], label: goodsOf(wantedHere[d])?.label ?? wantedHere[d] }));
  const stash = stashNow.map((l) => {
    const g = goodsOf(l.kind);
    const who = l.out ? crew.members.find((m) => m.recruit.id === l.out) : undefined;
    return { id: l.id, kind: l.kind, label: g?.label ?? l.kind, value: l.value, nightsLeft: nightsLeft(l, day), stale: isStale(l, day), damaged: l.damaged === true, district: l.district, ...(g?.art ? { art: crewArt(g.art) } : {}), ...(l.out ? { out: { recruit: l.out, ...(who?.due !== undefined ? { due: who.due } : {}) } } : {}) };
  });
  // Lots on their way count, so a landing always has room (crew goods spec §2).
  const coming = crew.members.filter((m) => m.state === 'out' && m.errand && book.errands.find((e) => e.kind === m.errand!.split(':')[0])?.group === 'collect').length;
  const stashFull = stashNow.length + coming >= STASH_MAX;
  return { roster, slots: slots(kit.rep), used: live.length, sol: kit.sol, wages: crew.wages, nextSix, here: o.here, hires, errands, ...(contracts.length ? { contracts } : {}), results, traits, abilities, wanted, stash, stashFull };
}
