/** Why a narrator call (SET THE SCENE, encounter cards) failed, as the player is told it (spec 2026-10-14 narrator failures §3). */
export type NarratorKind = 'timeout' | 'too-long' | 'busy' | 'refused' | 'unknown' | 'bad-answer';

const KINDS: readonly string[] = ['timeout', 'too-long', 'busy', 'refused', 'unknown', 'bad-answer'];

/** A kind off the wire: anything that isn't one (an older server, a typo) reads as `unknown`. */
export function narratorKind(x: unknown): NarratorKind {
  return typeof x === 'string' && KINDS.includes(x) ? (x as NarratorKind) : 'unknown';
}
