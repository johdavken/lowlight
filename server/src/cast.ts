/**
 * The shared cast list (narration images spec 2026-11-18): `world/cast.json` gives each person who recurs across jobs
 * one face, so Halloran looks the same in every job that marks him. Read once at startup, before the quest book.
 */
import fs from 'node:fs';
import { IMAGE_ID, isCrewFace, type CastFace } from '../../shared/narration-images';

export const DEFAULT_CAST_FILE = './world/cast.json';

/** The cast by id; a bad entry warns and is dropped, a missing file is an empty cast. */
export function loadCast(file: string, o: { extras: ReadonlySet<string>; roster: ReadonlySet<string>; warn: (m: string) => void }): Map<string, CastFace> {
  const out = new Map<string, CastFace>();
  if (!fs.existsSync(file)) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    o.warn(`${file}: not valid JSON (${err instanceof Error ? err.message : String(err)}); no cast`);
    return out;
  }
  const people = (raw as { people?: unknown })?.people;
  if (typeof people !== 'object' || people === null || Array.isArray(people)) {
    o.warn(`${file}: needs { "people": { … } }; no cast`);
    return out;
  }
  for (const [id, v] of Object.entries(people as Record<string, unknown>)) {
    const bad = (m: string) => o.warn(`${file}: ${id}: ${m}; left out`);
    if (!IMAGE_ID.test(id) || id === 'who') {
      bad('an id is lowercase letters, digits and dashes (not who)');
      continue;
    }
    const e = (v as { extra?: unknown })?.extra;
    const c = (v as { character?: unknown })?.character;
    if (typeof e === 'string') {
      if (isCrewFace(e)) bad(`'${e}' is a crew portrait: recruits wear those`);
      else if (!o.extras.has(e)) bad(`no extra '${e}'`);
      else out.set(id, { kind: 'extra', id: e });
    } else if (typeof c === 'string') {
      if (!o.roster.has(c)) bad(`no character '${c}'`);
      else out.set(id, { kind: 'character', id: c });
    } else bad('a face is { "extra": "<id>" } or { "character": "<id>" }');
  }
  return out;
}
