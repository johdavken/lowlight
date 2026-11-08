/** Faces from actions (spec 2026-10-20): the stage's two faces for the line in the dialogue box. */
import { faceFor } from '../../../shared/faces';
import type { Pronoun } from '../../../shared/pronoun';
import type { CurrentLine } from './feed';

/**
 * Her face (right) on her pages: what her actions end on, else the reply's stored face (an old
 * save, the dev panel, dice). Yours (left) on your lines, from your actions. A face holds while
 * the other speaks: the side not speaking wears the face its own last line gave it (`c.held`),
 * until that figure's next line. No line leaves both neutral (null). Her pronoun says whose actions
 * are hers ("he laughs" in her reply is his); on your line only "I" and bare verbs count.
 */
export function stageFaces(
  c: CurrentLine | null,
  faces: { her: readonly string[]; you: readonly string[]; herPronoun?: Pronoun },
): { right: string | null; left: string | null } {
  if (!c) return { right: null, left: null };
  const hers = (l: { actions: string; expression?: string } | undefined) => (l ? (faceFor(l.actions, faces.her, faces.herPronoun) ?? l.expression ?? null) : null);
  const yours = (l: { actions: string } | undefined) => (l ? faceFor(l.actions, faces.you, null) : null);
  return {
    right: c.speaker === 'contact' ? hers(c) : hers(c.held?.contact),
    left: c.speaker === 'user' ? yours(c) : yours(c.held?.user),
  };
}
