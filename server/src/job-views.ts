/**
 * What the table shows of a job's cards, as pure functions of the run and the book (`deps.quests`): the
 * crew going in, the calls made, a card's effect and loss, traits, abilities, POCKETS and the call lines.
 */
import type { ContactCard, HandView } from '../../shared/types';
import type { CrewMember } from '../../shared/crew-fold';
import { worksInGraft, type Ability } from '../../shared/crew-book';
import { isLegacyPending, type QuestEntry, type QuestRun } from '../../shared/quests';
import { withGuest } from './guest';
import { type Position } from '../../shared/dice';
import { abilityEffect, CALL_VERB, callEffect, contactId, type Setup, lossOnAgain, type Call, type CallEffect } from '../../shared/hand';
import type { QuestDeps } from './chat-relay';
import { programOf, type Program } from '../../shared/programs';
/** The crew a job's cards are read from: the roster, and its guest (guest crew spec §5). */
export function crewOn(quests: QuestDeps | undefined, setup: Pick<Setup, 'guest'> | undefined): CrewMember[] {
  return withGuest(quests?.crewState?.()?.members ?? [], setup);
}

/** A job's district (its board's); null without districts. */
export function districtOf(quests: QuestDeps | undefined, q: QuestEntry): string | null {
  return quests?.districtOf?.(q.starts) ?? null;
}

/** A district as she'd say it: its map name, else its id title-cased. */
export function districtWords(quests: QuestDeps | undefined, id: string | null): string {
  if (!id) return 'the district';
  return quests?.districtName?.(id) ?? id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** The run's calls, with a parked roll's card and its AFTER A ROLL presses (they're written when it lands). */
export function callsOf(run: QuestRun): Call[] {
  const p = run.pending && !isLegacyPending(run.pending) ? run.pending : null;
  return [...(run.calls ?? []), ...(p?.call ? [p.call] : []), ...(p?.after ?? [])];
}

/** A playable card's effect on a check of `stat` at `position`, labelled with the recruit's first name (or FAVOUR). */
export function cardEffect(member: CrewMember | null, stat: string, position: Position, contact?: ContactCard, ability?: Ability, getaway = false, red = false): CallEffect | null {
  if (ability && member) {
    const e = abilityEffect(ability.job, member.recruit.spec, stat, position, getaway, member.recruit.grade, red);
    return e && { ...e, label: ability.label };
  }
  if (contact) {
    const e = callEffect({ spec: contact.spec }, stat, position);
    return e && { ...e, label: contact.name.split(' ')[0] };
  }
  const e = callEffect(member ? { spec: member.recruit.spec } : 'favour', stat, position);
  return e && member ? { ...e, label: member.recruit.name.split(' ')[0], grade: member.recruit.grade } : e;
}

/** An again-call's miss (§2): the recruit's loss, or null; never-held makes held hurt. */
export function callLoss(quests: QuestDeps | undefined, member: CrewMember, seed: string, position: Position): 'hurt' | 'held' | null {
  return lossOnAgain({ seed, grade: member.recruit.grade, position, neverHeld: neverHeld(quests, member) });
}

/** Whether a recruit has the never-held trait: their fall is hurt, not held. */
export function neverHeld(quests: QuestDeps | undefined, member: CrewMember): boolean {
  const traits = quests?.crewTraits?.() ?? [];
  return member.recruit.traits.some((id) => traits.find((t) => t.id === id)?.effect.kind === 'never-held');
}

/** What a recruit's own fall costs them: held, or hurt with never-held. */
export function fallFor(quests: QuestDeps | undefined, member: CrewMember, fall: 'held'): 'held' | 'hurt' {
  return neverHeld(quests, member) ? 'hurt' : fall;
}

/** Ability labels for ids, in order; ids gone from the book are left out. */
export function abilityLabels(quests: QuestDeps | undefined, ids: string[]): string[] {
  const book = quests?.crewAbilities?.() ?? [];
  return ids.flatMap((id) => book.filter((a) => a.id === id).map((a) => a.label));
}

/** A recruit's traits as their card shows them: the revealed ones a job reads (a hidden one waits for its third run). */
export function shownTraits(quests: QuestDeps | undefined, m: CrewMember): { label: string; good: boolean }[] {
  const book = quests?.crewTraits?.() ?? [];
  return m.revealed.flatMap((id) => book.filter((t) => t.id === id && worksInGraft(t)).map((t) => ({ label: t.label, good: t.good })));
}

/** POCKETS as the deck (programs spec §2.1): the deck carried at GO IN, its slots, what's loaded, the catalog. */
export function pocketsView(quests: QuestDeps | undefined, run: QuestRun, at: NonNullable<Setup['deck']>, held: readonly Program[]): NonNullable<HandView['pockets']> {
  const deck = (quests?.decks?.() ?? []).find((d) => d.id === at.id) ?? null;
  const all = quests?.programs?.() ?? [];
  // What you can load (owned programs), not the whole catalog; what's loaded by id, a foil as its copy.
  const catalog = held.filter((p) => !(run.programs ?? []).some((l) => l.id === p.id && l.burned && p.foil));
  const loaded = (run.programs ?? []).flatMap((l) => {
    const p = programOf(all, l.id);
    return p ? [{ id: p.id, name: p.name, stat: p.stat, kind: p.kind, burned: l.burned === true, ...(p.foil ? { foil: true as const } : {}) }] : [];
  });
  return {
    deck: at.id ? { name: deck?.name ?? at.id, quality: at.quality, skin: deck?.skin ?? 'green' } : null,
    slots: at.slots,
    dead: run.deckDead === true,
    loaded,
    catalog: catalog.map((p) => ({ id: p.id, name: p.name, stat: p.stat, kind: p.kind, line: p.line, ...(p.foil ? { foil: true as const } : {}), ...(p.count && p.count > 1 ? { count: p.count } : {}) })),
  };
}

/**
 * A call's lines in the row (the hand spec §6): `⟦CALL⟧ Dez (runner) takes the door.` or `⟦CALL⟧ a friend in Karasu.`,
 * and a loss `⟦LOST⟧ Koji got hurt.`; her history reads them as `[call: …]` and `[Koji got hurt]`.
 */
export function callTexts(quests: QuestDeps | undefined, call: Call | undefined, q: QuestEntry, run: QuestRun): { call: string[]; loss: string[] } {
  if (!call) return { call: [], loss: [] };
  if (call.card === 'favour') return { call: [`⟦CALL⟧ a friend in ${districtWords(quests, districtOf(quests, q))}.`], loss: [] };
  const cid = contactId(call.card);
  if (cid !== null) {
    const c = run.setup?.contacts?.find((x) => x.id === cid);
    return c ? { call: [`⟦CALL⟧ ${c.name.split(' ')[0]} (${c.spec}) ${CALL_VERB[c.spec] ?? 'steps in'}.`], loss: [] } : { call: [], loss: [] };
  }
  const r = crewOn(quests, run.setup).find((m) => m.recruit.id === call.card)?.recruit;
  if (!r) return { call: [], loss: [] };
  const first = r.name.split(' ')[0];
  const lost = call.loss ? [`⟦LOST⟧ ${first} got ${call.loss}.`] : [];
  // An ability (crew abilities spec §2): `⟦CALL⟧ Dez — Log Wipe.`
  const ability = call.ability ? (quests?.crewAbilities?.() ?? []).find((a) => a.id === call.ability) : undefined;
  if (call.ability) return { call: [`⟦CALL⟧ ${first} — ${ability?.label ?? call.ability}.`], loss: lost };
  return { call: [`⟦CALL⟧ ${first} (${r.spec}) ${CALL_VERB[r.spec] ?? 'steps in'}.`], loss: lost };
}
