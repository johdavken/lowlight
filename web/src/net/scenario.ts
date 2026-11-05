/** The arrival screen's opening (spec 2026-10-27 §3): three openings her model writes for the pair, steered by what's typed. */
import type { NarratorKind } from '../../../shared/narrator';
import type { SceneOption } from '../../../shared/scenario';
import { postJson } from './suggest';

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

/** The three openings and who they're for: the player (for their face) and the tie line between them (null: they haven't met). */
export interface OpeningSet {
  options: SceneOption[];
  pair: { player: { id: string; name: string }; tie: string | null };
}

/** Three openings for `ai`'s new game, steered by `steer`. Rejects with an Error in SUGGEST's words. */
export async function sceneOptions(ai: string, steer: string | null): Promise<OpeningSet> {
  const b = await postJson<{ options?: unknown; pair?: unknown }>('/api/scenario/draft', { ai, steer });
  const options = Array.isArray(b.options) ? (b.options as SceneOption[]).filter((x) => typeof x?.text === 'string' && typeof x?.title === 'string') : [];
  const p = b.pair as OpeningSet['pair'] | undefined;
  if (options.length === 0 || !p || typeof p.player?.id !== 'string') throw new Error('THE ANSWER CAME BACK EMPTY');
  return { options, pair: { player: { id: p.player.id, name: String(p.player.name ?? '') }, tie: typeof p.tie === 'string' ? p.tie : null } };
}
