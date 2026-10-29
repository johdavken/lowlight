/** Faces from actions (spec 2026-10-20): the stage's two faces for the line in the dialogue box. */
import { faceFor } from '../../../shared/faces';
import type { Pronoun } from '../../../shared/pronoun';
import type { CurrentLine } from './feed';

/**
 * Her face (right) on her pages: what her actions end on, else the reply's stored face (an old
 * save, the dev panel, dice). Yours (left) on your lines, from your actions. Everyone else's pages,
 * and no line, leave both neutral (null). Her pronoun says whose actions are hers ("he laughs" in
 * her reply is his); on your line only "I" and bare verbs count.
 */
export function stageFaces(
  c: CurrentLine | null,
  faces: { her: readonly string[]; you: readonly string[]; herPronoun?: Pronoun },
): { right: string | null; left: string | null } {
  if (c?.speaker === 'contact') return { right: faceFor(c.actions, faces.her, faces.herPronoun) ?? c.expression ?? null, left: null };
  if (c?.speaker === 'user') return { right: null, left: faceFor(c.actions, faces.you, null) };
  return { right: null, left: null };
}
