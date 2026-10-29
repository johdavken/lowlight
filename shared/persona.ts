import { z } from 'zod';
import type { Pronoun } from './pronoun';

/** A persona's name: one line, at most this many characters. */
export const PERSONA_NAME_MAX = 40;
/** A persona's background: a line or a few paragraphs, at most this many characters. */
export const PERSONA_BACKGROUND_MAX = 1200;
/** The longest outfit wears line, in characters (outfit wears spec 2026-10-19 §3); the game and Studio share it. */
export const WEARS_MAX = 200;

/** Who you are in a playthrough when it isn't the character as written: a name and a background. */
export interface PlaythroughPersona {
  name: string;
  background: string;
  /** How it was made at the YOU step: EDIT (the character, adjusted: his ties hold) or CUSTOM (someone else). Absent: from before kinds (no ties). */
  kind?: 'edit' | 'custom';
  /** Set at the YOU step only when it differs from the character's; absent (every save before pronouns): the character's. */
  pronoun?: Pronoun;
}

const personaSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(PERSONA_NAME_MAX)
    .refine((s) => !/[\r\n]/.test(s)),
  background: z.string().trim().max(PERSONA_BACKGROUND_MAX).default(''),
  kind: z.enum(['edit', 'custom']).optional(),
  pronoun: z.enum(['she', 'he', 'they']).optional(),
});

/** The persona, trimmed; null when it isn't one (see the limits above; unknown keys aren't allowed). */
export function parsePersona(raw: unknown): PlaythroughPersona | null {
  const parsed = personaSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Caps text at `max` characters, cutting back to the last whole word (no ellipsis). */
export function capAtWordBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const idx = cut.lastIndexOf(' ');
  return idx > 0 ? cut.slice(0, idx) : cut;
}
