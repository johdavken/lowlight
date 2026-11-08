import { guestId } from '../../shared/contract';
import type { CrewMember } from '../../shared/crew-fold';
import type { Setup } from '../../shared/hand';

/** A guest's bust on their card: a contact's at /contacts/<id>.webp, a guest file's own; none: a crew face. */
export function guestArt(g: NonNullable<Setup['guest']>): string | undefined {
  return g.kind === 'guest' ? g.art : `/contacts/${g.id}.webp`;
}

/** A guest file's card line as the one trait a card shows; a contact shows none. */
export const guestTraits = (g: NonNullable<Setup['guest']>): { label: string; good: boolean }[] => (g.line ? [{ label: g.line, good: false }] : []);

/**
 * The roster with a job's guest beside it (guest crew spec §5): a stand-in member, so a roll, the tier cut and an
 * ability read a guest as they read a recruit. Only for the relay's lookups: the fold never sees it.
 */
export function withGuest(members: CrewMember[], setup: Pick<Setup, 'guest'> | undefined): CrewMember[] {
  const g = setup?.guest;
  if (!g) return members;
  const recruit = { id: guestId(g.id), name: g.name, face: null, origin: '', spec: g.spec, grade: g.grade, traits: [], hidden: null, pitch: '', wage: 0 };
  return [...members, { recruit, state: 'ready', busy: false, runs: { clean: 0, messy: 0, blown: 0 }, toNext: 0, loyalty: 0, revealed: [], log: [], goneUsed: false, hired: { at: 0, place: '' }, abilities: g.abilities, slotted: g.abilities, picks: [] }];
}
