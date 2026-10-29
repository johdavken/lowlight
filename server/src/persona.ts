import { named, type Pronoun } from '../../shared/pronoun';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { capAtWordBoundary } from '../../shared/persona';

export const DESCRIPTION_MAX = 400;

/**
 * `persona/persona.json` only names the default player now (`{ "character": "hicks" }`): who old
 * room databases' rows belong to, and who visits when no playthrough is active. Who you are in a
 * playthrough is its own `persona` (shared/persona.ts). Older inline fields (name, description,
 * sprite) are allowed and ignored.
 */
const personaFileSchema = z.looseObject({ character: z.string().min(1).optional() });

export { capAtWordBoundary };

/**
 * The roster id `<dir>/persona.json` names as `character`, whether or not that character loads —
 * it is the default player id either way. Null when there's no file, it isn't valid JSON or
 * doesn't pass the schema, or it names no character. Never warns.
 */
export function readPersonaCharacterId(dir: string): string | null {
  const file = path.join(dir, 'persona.json');
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = personaFileSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    return parsed.success ? (parsed.data.character ?? null) : null;
  } catch {
    return null;
  }
}

/** Keeps a string on a single line for a bracketed system/turn line: newlines, \r and tabs become a space, `[` and `]` become parentheses. */
export const oneLine = (s: string) => s.replace(/\s*[\r\n\t]\s*/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')');

/** The description used for a roster character's per-turn line: her own, else tagline + first bio paragraph — capped at `DESCRIPTION_MAX` on a word boundary. */
export function descriptionFromProfile(description: string, tagline: string, bio: string[]): string {
  if (description) return capAtWordBoundary(description, DESCRIPTION_MAX);
  const combined = [tagline, bio[0]].filter(Boolean).join(' ');
  return capAtWordBoundary(combined, DESCRIPTION_MAX);
}

/** The per-turn line telling the agent who she's talking to; always a single bracketed line. */
export function personaLine(p: { name: string; description: string; pronoun: Pronoun }): string {
  const name = named(oneLine(p.name), p.pronoun);
  return p.description ? `[you: ${name} — ${oneLine(p.description)}]` : `[you: ${name}]`;
}
