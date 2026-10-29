import { named, type Pronoun } from '../../shared/pronoun';
import type { Crop, Fact } from '../../shared/types';
import { AGENT_ID_RE, type AgentRecord } from './agents';
import { BIO_MAX } from './character-profile';
import { capAtWordBoundary, type PlaythroughPersona } from '../../shared/persona';
import { DESCRIPTION_MAX, descriptionFromProfile, oneLine, personaLine } from './persona';

/** Who's visiting: resolved from `?as=` (or the default) to a name, lines and a figure. */
export interface Player {
  id: string;
  name: string;
  /** The character's, or the persona's own when it sets one. */
  pronoun: Pronoun;
  /** `[you: …]` per-turn line, or null for 'you' without a persona. */
  line: string | null;
  /** The "who's here" block (system message), or null for 'you' without a persona. */
  whosHere: string | null;
  sprite: { file: string; crop: Crop; height?: number; pixel?: true } | null;
  /** The character's tagline; absent under a playthrough persona (her file isn't theirs). */
  tagline?: string;
}

/**
 * The default player id: the character `persona.json` names (`readPersonaCharacterId` — even when
 * that character isn't in the roster), else `'you'`.
 */
export function defaultPlayerId(characterId?: string | null): string {
  return characterId ?? 'you';
}

/** `[who's here: <Name>]` alone, or with the public file's tagline, bio paragraphs and facts appended — never identity/instructions/ooc. */
export function whosHereBlock(name: string, pronoun: Pronoun, file: { tagline: string; bio: string[]; facts: Fact[] }): string {
  const who = named(oneLine(name), pronoun);
  const head = file.tagline ? `[who's here: ${who} — ${oneLine(file.tagline)}]` : `[who's here: ${who}]`;
  const factLines = file.facts.map((f) => `${f.label}: ${f.value}`);
  for (let n = file.bio.length; n >= 0; n--) {
    const block = [head, ...file.bio.slice(0, n), ...factLines].join('\n');
    if (block.length <= BIO_MAX) return block;
  }
  return [head, ...factLines].join('\n').slice(0, BIO_MAX);
}

/** A roster character's `Player`, built from her public dossier fields only. */
function fromRecord(rec: AgentRecord): Player {
  const info = rec.info;
  const description = descriptionFromProfile(info.description, info.tagline, info.bio);
  return {
    id: info.id,
    name: info.name,
    pronoun: info.pronoun,
    line: personaLine({ name: info.name, description, pronoun: info.pronoun }),
    whosHere: whosHereBlock(info.name, info.pronoun, { tagline: info.tagline, bio: info.bio, facts: info.facts }),
    ...(info.tagline ? { tagline: info.tagline } : {}),
    sprite: rec.sprite
      ? { file: rec.sprite.file, crop: rec.sprite.crop, ...(rec.sprite.height !== undefined ? { height: rec.sprite.height } : {}), ...(rec.sprite.pixel ? { pixel: true as const } : {}) }
      : null,
  };
}

/** Resolves `?as=` ids (and the default) to who's visiting, from the current roster. */
export function createPlayers(deps: {
  records: () => AgentRecord[];
  /** The character persona.json names, even when it isn't in the roster (see `readPersonaCharacterId`). */
  characterId?: string | null;
}): {
  defaultId: string;
  resolve(asParam: string | undefined | null): Player;
} {
  const defaultId = defaultPlayerId(deps.characterId);

  function defaultPlayer(): Player {
    const rec = deps.records().find((r) => r.info.id === defaultId);
    return rec ? fromRecord(rec) : { id: defaultId, name: 'You', pronoun: 'they', line: null, whosHere: null, sprite: null };
  }

  function resolve(asParam: string | undefined | null): Player {
    const id = asParam ?? '';
    const valid = id === defaultId || (AGENT_ID_RE.test(id) && deps.records().some((r) => r.info.id === id));
    if (!valid) return defaultPlayer();
    if (id === defaultId) return defaultPlayer();
    const rec = deps.records().find((r) => r.info.id === id) as AgentRecord;
    return fromRecord(rec);
  }

  return { defaultId, resolve };
}

/**
 * The player as the playthrough's persona: its name, `[you:]` line (background capped at
 * `DESCRIPTION_MAX`) and who's-here (the whole background) over the character's id and sprite.
 * Nothing of the character's own file (tagline, bio, facts) is kept.
 */
export function withPersona(p: Player, persona: PlaythroughPersona): Player {
  const pronoun = persona.pronoun ?? p.pronoun;
  const head = `[who's here: ${named(oneLine(persona.name), pronoun)}]`;
  return {
    id: p.id,
    name: persona.name,
    pronoun,
    line: personaLine({ name: persona.name, description: capAtWordBoundary(oneLine(persona.background), DESCRIPTION_MAX), pronoun }),
    whosHere: persona.background ? `${head}\n${persona.background}` : head,
    sprite: p.sprite,
  };
}
