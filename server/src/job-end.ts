/**
 * The end of a job, as pure functions of the run and the book (`deps.quests`): its tier, the AT THE END
 * abilities on the take, heat and pay, and the debrief's crew, people and contact lines.
 */
import type { ContactCard, Debrief } from '../../shared/types';
import type { QuestEntry, QuestRun } from '../../shared/quests';
import { outcomeTier, type Tier } from '../../shared/mission';
import { guestId } from '../../shared/contract';
import { withGuest } from './guest';
import { ALARM_MAX, jobTakeSize } from '../../shared/dice';
import { abilityCardId, CONTACT_VERB, contactId, crewLines, jobShares } from '../../shared/hand';
import { takeOf } from './take-run';
import { heatLeft } from './push-run';
import { END_COOL_HEAT, END_COOL_PAY, PAY_OFF_CUT, rollFills, SELL_PART_CUT } from './job-rules';
import type { QuestDeps } from './chat-relay';
/** A job's tier from its run (spec §3): the take its outcomes last set (else full), a blown line anywhere, its ALARM. */
export function tierOf(run: QuestRun): Tier {
  return outcomeTier({ take: run.take ?? 'full', blown: run.blown === true, alarm: run.alarm ?? 0, paidOff: run.setup?.paidOff === true });
}

/** AT THE END abilities of `kind` in the GO IN loadout of each brought recruit still standing, as `<rid>/<ability>`. */
export function endAbilities(quests: QuestDeps | undefined, run: QuestRun, kind: 'take' | 'heat' | 'end-take' | 'end-cool' | 'sell-part' | 'pay-off' | 'hold-alarm'): string[] {
  const setup = run.setup;
  if (!setup?.abilities) return [];
  const book = quests?.crewAbilities?.() ?? [];
  const calls = run.calls ?? [];
  return setup.people.flatMap((rid) => (calls.some((c) => c.card === rid && c.loss) ? [] : (setup.abilities?.[rid] ?? []).filter((aid) => book.some((a) => a.id === aid && a.job.kind === kind)).map((aid) => abilityCardId(rid, aid))));
}

/** TAKE +1 for each AT THE END take ability, while TAKE isn't full; each that adds goes in `setup.ended`. `end-take` also leaves HEAT +1 (ability pass spec §2). */
export function endTake(quests: QuestDeps | undefined, run: QuestRun, size: number): QuestRun {
  let fill = run.takeFill ?? 0;
  const ended: string[] = [];
  let heat = 0;
  for (const [kind, id] of [...endAbilities(quests, run, 'take').map((id) => ['take', id]), ...endAbilities(quests, run, 'end-take').map((id) => ['end-take', id])])
    if (fill < size) {
      fill++;
      ended.push(id);
      if (kind === 'end-take') heat++;
    }
  return ended.length && run.setup ? { ...run, takeFill: fill, setup: { ...run.setup, ended: [...(run.setup.ended ?? []), ...ended], ...(heat ? { endHeat: (run.setup.endHeat ?? 0) + heat } : {}) } } : run;
}

/** HEAT −2 and pay −20 % for each `end-cool` ability (ability pass spec §2), while the job leaves heat or the district holds some. */
export function endCool(quests: QuestDeps | undefined, run: QuestRun, districtHeat: number): QuestRun {
  const ids = endAbilities(quests, run, 'end-cool');
  if (!ids.length || !run.setup || heatLeft(run, false) + districtHeat <= 0) return run;
  return { ...run, setup: { ...run.setup, ended: [...(run.setup.ended ?? []), ...ids], endHeat: (run.setup.endHeat ?? 0) - END_COOL_HEAT * ids.length, payCut: (run.setup.payCut ?? 0) + END_COOL_PAY * ids.length } };
}

/** The fences' last word (tier 3 beat play spec §2), after TAKE abilities: Cut a Deal on a part take, Paid Off on a full take at ALARM 2+. */
export function endDeal(quests: QuestDeps | undefined, run: QuestRun, q: QuestEntry): QuestRun {
  const setup = run.setup;
  if (!setup) return run;
  const fill = takeOf(run, q);
  const size = jobTakeSize(q);
  const short = fill > 0 && fill < size;
  // Only where selling it as full, less the cut, beats what TAKE would pay.
  const cut = setup.payCut ?? 0;
  const [sold] = short && 100 - cut - SELL_PART_CUT > ((100 - cut) * fill) / size ? endAbilities(quests, run, 'sell-part') : [];
  if (sold) return { ...run, setup: { ...setup, ended: [...(setup.ended ?? []), sold], payFull: true, payCut: (setup.payCut ?? 0) + SELL_PART_CUT } };
  const [paid] = !short && run.take !== 'part' && (run.alarm ?? 0) >= 2 ? endAbilities(quests, run, 'pay-off') : [];
  return paid ? { ...run, setup: { ...setup, ended: [...(setup.ended ?? []), paid], paidOff: true, payCut: (setup.payCut ?? 0) + PAY_OFF_CUT } } : run;
}

/** Clean Exit (tier 3 beat play spec §2): the pick that would fill ALARM holds it at 3 for TAKE −1, once a job; null where it can't. */
export function heldAlarm(quests: QuestDeps | undefined, q: QuestEntry, run0: QuestRun, run: QuestRun): QuestRun | null {
  if ((run.alarm ?? 0) < ALARM_MAX || (run0.alarm ?? 0) >= ALARM_MAX || !rollFills(q, run0) || !run.setup || run.setup.held) return null;
  const [id] = endAbilities(quests, run, 'hold-alarm');
  const fill = takeOf(run, q);
  return id && fill > 0 ? { ...run, alarm: ALARM_MAX - 1, takeFill: fill - 1, setup: { ...run.setup, held: id, ended: [...(run.setup.ended ?? []), id] } } : null;
}

/** A FENCE brought on the run and not lost on a call. */
export function fenceOn(quests: QuestDeps | undefined, run: QuestRun): string | null {
  const members = quests?.crewState?.()?.members ?? [];
  const recruit = (run.setup?.people ?? []).find((id) => members.find((m) => m.recruit.id === id)?.recruit.spec === 'fence' && !(run.calls ?? []).some((c) => c.card === id && c.loss));
  // Fences don't stack (contact cards spec §3): a recruit fences first, else a contact fence.
  const contact = run.setup?.contacts?.find((c) => c.spec === 'fence');
  return recruit ?? (contact ? `contact:${contact.id}` : null);
}

/** The contact cards that played on `run`: called on a check, or fenced at the end. */
export function contactsPlayed(run: QuestRun): ContactCard[] {
  const played = new Set([...(run.calls ?? []).map((c) => c.card), ...(run.setup?.fencedBy ? [run.setup.fencedBy] : [])]);
  return (run.setup?.contacts ?? []).filter((c) => played.has(`contact:${c.id}`));
}

/** Who came on the job and who didn't walk away clean (the hand spec §6), by first name, for her closing summary. */
export function summaryCrew(quests: QuestDeps | undefined, run: QuestRun, key: string): { came: string[]; lost: string[] } | undefined {
  const contacts = contactsPlayed(run).map((c) => c.name.split(' ')[0]);
  if (!run.setup?.people.length && !contacts.length) return undefined;
  if (!run.setup?.people.length) return { came: contacts, lost: [] };
  const members = quests?.crewState?.()?.members ?? [];
  const traits = quests?.crewTraits?.() ?? [];
  const first = (id: string) => withGuest(members, run.setup).find((m) => m.recruit.id === id)?.recruit.name.split(' ')[0] ?? null;
  const recruits = members.map((m) => ({ id: m.recruit.id, spec: m.recruit.spec, traits: m.recruit.traits.flatMap((t) => traits.filter((x) => x.id === t)), goneUsed: m.goneUsed }));
  const shares = jobShares({ setup: run.setup, calls: run.calls ?? [], tier: tierOf(run), seed: key, recruits, getOut: run.getaway === true });
  const lostIds = [...(run.calls ?? []).filter((c) => c.loss).map((c) => c.card), ...shares.filter((x) => x.fate !== null).map((x) => x.rid)];
  const names = (ids: string[]) => [...new Set(ids)].flatMap((id) => first(id) ?? []);
  return { came: [...names(run.setup.people), ...contacts], lost: names(lostIds) };
}

/** The heat crew traits add on a messy job, as the crew fold will land it. Hidden traits count; the debrief names no one. */
export function crewHeatOf(quests: QuestDeps | undefined, run: QuestRun, tier: Tier, key: string): number {
  if (!run.setup || tier !== 'messy') return 0;
  const members = quests?.crewState?.()?.members ?? [];
  const traits = quests?.crewTraits?.() ?? [];
  const recruits = members.map((m) => ({ id: m.recruit.id, spec: m.recruit.spec, traits: m.recruit.traits.flatMap((t) => traits.filter((x) => x.id === t)), goneUsed: m.goneUsed }));
  return jobShares({ setup: run.setup, calls: run.calls ?? [], tier, seed: key, recruits, getOut: run.getaway === true })
    .filter((s) => s.kind === 'messy')
    .flatMap((s) => recruits.find((r) => r.id === s.rid)?.traits ?? [])
    .reduce((n, t) => n + (t.effect.kind === 'heat-on-messy' ? t.effect.n : 0), 0);
}

/** The debrief's crew lines (the hand spec §4): drawn as the crew fold draws them, from the run's key. */
export function debriefCrew(quests: QuestDeps | undefined, run: QuestRun, key: string): string[] {
  if (!run.setup) return [];
  const traits = quests?.crewTraits?.() ?? [];
  const members = quests?.crewState?.()?.members ?? [];
  const recruits = members.map((m) => ({ ...m.recruit, toNext: m.toNext, traits: m.recruit.traits.flatMap((id) => traits.filter((t) => t.id === id)), goneUsed: m.goneUsed }));
  // A contact fence's TAKE +1 isn't a recruit's (contact cards spec §3): crewLines credits a recruit fence only.
  const recruitSetup = run.setup.fencedBy && contactId(run.setup.fencedBy) !== null ? { ...run.setup, fenced: undefined } : run.setup;
  const abilityLabels = Object.fromEntries((quests?.crewAbilities?.() ?? []).map((a) => [a.id, a.label]));
  return [...crewLines({ setup: recruitSetup, calls: run.calls ?? [], tier: tierOf(run), key, getOut: run.getaway === true, recruits, abilityLabels }), ...contactLines(quests, run)];
}

/** Who the crew lines are about, for their cards at the table: the recruits brought and the contacts who played. */
export function debriefPeople(quests: QuestDeps | undefined, run: QuestRun): NonNullable<Debrief['people']> {
  const first = (name: string) => name.split(' ')[0].toUpperCase();
  const brought = (quests?.crewState?.()?.members ?? []).filter((m) => run.setup?.people.includes(m.recruit.id));
  const guest = run.setup?.guest ? [run.setup.guest] : [];
  return [...brought.map((m) => ({ name: first(m.recruit.name), face: m.recruit.face })), ...[...contactsPlayed(run), ...guest].map((c) => ({ name: first(c.name), face: null, art: `/contacts/${c.id}.webp` }))];
}

/** The contacts who played (contact cards spec §3): `CASS FENCED IT · TAKE +1`, `HICKS TOOK THE WIRE`. */
export function contactLines(quests: QuestDeps | undefined, run: QuestRun): string[] {
  const line = (c: ContactCard) => `${c.name.split(' ')[0].toUpperCase()} ${CONTACT_VERB[c.spec] ?? 'HELPED'}`;
  const guest = run.setup?.guest;
  // A guest's abilities as crewLines shows a recruit's: pressed on a roll, or played at the end.
  const book = quests?.crewAbilities?.() ?? [];
  const id = guest ? guestId(guest.id) : '';
  const used = [...(run.calls ?? []).filter((c) => c.card === id).flatMap((c) => c.ability ?? []), ...(run.setup?.ended ?? []).flatMap((e) => (e.startsWith(`${id}/`) ? [e.slice(id.length + 1)] : []))];
  const labels = [...new Set(used)].flatMap((a) => book.filter((b) => b.id === a).map((b) => ` · ${b.label.toUpperCase()}`)).join('');
  return [...contactsPlayed(run).map(line), ...(guest ? [`${line(guest)}${labels}`] : [])];
}

/** A job's trust move for its tier: +W clean, −L blown, 0 messy; null when its stake is rep. */
export function trustDelta(q: QuestEntry, tier: Tier): number | null {
  if (!q.trust) return null;
  return tier === 'clean' ? q.trust[0] : tier === 'blown' ? -q.trust[1] : 0;
}

/** `OUTFIT · HICKS · TIE`: the debrief's line for an outfit an ending gives. */
export function outfitLine(quests: QuestDeps | undefined, o: { who: string; name: string }): string {
  return `OUTFIT · ${(quests?.contactName(o.who) ?? o.who).toUpperCase()} · ${o.name.toUpperCase()}`;
}
