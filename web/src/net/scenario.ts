/** The arrival screen's opening (spec 2026-10-27 §3): one opening her model writes, steered by what's typed. */
import type { NarratorKind } from '../../../shared/narrator';
import { draft } from './suggest';

/** A narrator call that failed (spec 2026-10-14 §3): the kind the player is told, and the raw why for the log and a hover. */
export class NarratorFailure extends Error {
  constructor(
    readonly kind: NarratorKind,
    readonly why: string,
  ) {
    super(why);
    this.name = 'NarratorFailure';
  }
}

/** One opening for `ai`'s new game, steered by `steer`. Rejects with an Error in SUGGEST's words. */
export function sceneDraft(ai: string, steer: string | null): Promise<string> {
  return draft('/api/scenario/draft', { ai, steer });
}
