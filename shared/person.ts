/**
 * A made person (character creator spec 2026-11-14): who the player made at 1P select, kept in
 * `data/people/<id>/` across games. A new game copies them into the save as a CUSTOM persona on the
 * newcomer stand-in, with their figure.
 */
import { z } from 'zod';
import { PERSONA_BACKGROUND_MAX, PERSONA_NAME_MAX, WEARS_MAX } from './persona';
import type { Pronoun } from './pronoun';

export const PERSON_ID_RE = /^p-[0-9]{13}-[0-9a-f]{6}$/;

export interface Person {
  id: string;
  name: string;
  pronoun: Pronoun;
  background: string;
  /** The `[wearing]` line for their figure; empty while they have none (the stand-in's own plays). */
  wears: string;
  /** ISO date they were first made. */
  made: string;
  /** In the creator, not kept yet: never listed, swept at start. */
  draft?: true;
}

/** A person as the library lists them: whether they have a kept figure, and when it was kept. */
export type PersonRow = Person & { figure: boolean; figureMade: string | null };

/** WHO's fields, as the creator sends them. */
export interface PersonWho {
  name: string;
  pronoun: Pronoun;
  background: string;
  wears: string;
}

/** Text over lines as one line: breaks become spaces, runs of space one. */
export const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();

const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => !/[\r\n]/.test(s));

const whoSchema = z.strictObject({
  name: line(PERSONA_NAME_MAX).pipe(z.string().min(1)),
  pronoun: z.enum(['she', 'he', 'they']),
  background: z.string().trim().max(PERSONA_BACKGROUND_MAX).default(''),
  // A textarea's WEARS (or CLOTHES carried into it) over lines: the [wearing] line is one line.
  wears: z.preprocess((v) => (typeof v === 'string' ? oneLine(v) : v), line(WEARS_MAX)).default(''),
});

const personSchema = z.strictObject({
  id: z.string().regex(PERSON_ID_RE),
  name: line(PERSONA_NAME_MAX),
  pronoun: z.enum(['she', 'he', 'they']),
  background: z.string().trim().max(PERSONA_BACKGROUND_MAX),
  wears: line(WEARS_MAX),
  made: z.string(),
  draft: z.literal(true).optional(),
});

/** A person.json, trimmed; null when it isn't one. Only a draft may have no name yet. */
export function parsePerson(raw: unknown): Person | null {
  const r = personSchema.safeParse(raw);
  if (!r.success || (!r.data.draft && r.data.name === '')) return null;
  return r.data;
}

/** WHO's fields, trimmed; null when they aren't (a name is needed). */
export function parsePersonWho(raw: unknown): PersonWho | null {
  const r = whoSchema.safeParse(raw);
  return r.success ? r.data : null;
}
