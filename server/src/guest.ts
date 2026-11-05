import { guestId } from '../../shared/contract';
import type { CrewMember } from '../../shared/crew-fold';
import type { Setup } from '../../shared/hand';

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
