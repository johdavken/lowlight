/**
 * Faces from actions (spec 2026-10-20-faces-from-actions): the *asterisk* text on the page showing
 * picks one of a character's faces. Six kinds with the words that signal them, each landing on the
 * character's own face of that name or the first of its fallbacks they have. The last match wins.
 * A match doesn't count with a negation in the three words before it ("almost smiles") or a fading
 * word in the three after ("the grin is gone"), or when its clause opens with someone else's pronoun
 * ("he laughs" in her reply). A miss is better than a wrong face. Speech is never read here: callers
 * pass only the action text.
 */
import type { Pronoun } from './pronoun';

export type FaceKind = 'happy' | 'amused' | 'annoyed' | 'angry' | 'concerned' | 'tired';

const P = '(?:her|his|my|their|your)';

/** Each kind's signals (stems, lower case) and the faces it lands on after its own name, in order. */
export const FACE_KINDS: Record<FaceKind, { signals: RegExp[]; fallbacks: string[] }> = {
  // "smile" is a face name, not a kind: the happy words land on a smile face when there's no happy one.
  happy: { signals: [/\bgrin/, /\bsmil(?:e|es|ed|ing)\b/, /\blaugh(?:s|ed|ing)?\b/, /\bbeam(?:s|ed|ing)\b/], fallbacks: ['smile', 'amused'] },
  amused: { signals: [/\bsmirk/, /\bsnort/, /\bchuckl/, /\bwry\b/, /\bwryly\b/, /\bmouth twitch/, /\bdry look/], fallbacks: ['smile', 'happy'] },
  annoyed: {
    signals: [new RegExp(`\\broll(?:s|ed|ing)? ${P} eyes`), /\beye-?roll/, /\bscoff/, /\bhuff/, /\bsharp sigh/, /\bsighs? sharply/, /\btch\b/],
    fallbacks: ['angry'],
  },
  angry: {
    signals: [
      /\bjaw (?:sets|set|tightens|tightened|clenches|clenched|locks)\b/,
      /\bslam/,
      /\bsnarl/,
      /\bglar(?:e|es|ed|ing)\b/,
      new RegExp(`${P} fists?\\b`),
      new RegExp(`\\bclench(?:es|ed|ing)? ${P} (?:fists?|hands?)`),
      new RegExp(`\\bbar(?:e|es|ed|ing) ${P} teeth`),
      new RegExp(`\\bgrit(?:s|ted|ting)? ${P} teeth`),
    ],
    fallbacks: ['annoyed'],
  },
  concerned: {
    signals: [
      /\bfrown/,
      /\bhesitat/,
      /\bworr(?:y|ies|ied)\b/,
      /\bwinc(?:e|es|ed|ing)\b/,
      /\bbrow (?:creases|creased|furrows|furrowed|knits|knitted)\b/,
      new RegExp(`\\b(?:bite|bites|biting|bit) ${P} lip`),
    ],
    fallbacks: [],
  },
  tired: {
    signals: [/\byawn/, new RegExp(`\\brub(?:s|bed|bing)? ${P} eyes`), /\bslump/, /\bexhaust/, /\bsag(?:s|ged|ging)?\b/],
    fallbacks: ['concerned'],
  },
};

const NEGATIONS = new Set(['not', 'never', 'no', 'without', 'almost', "doesn't", "don't", "didn't", "won't", "can't", "isn't", 'barely', 'nearly']);
/** Two-word negations, read across the same three-word window. */
const NEGATION_PHRASES = [/\bfail(?:s|ed)? to$/];

/** Words that, just after a face word, say it isn't there (any more). */
const FADING = new Set(['not', 'gone', 'fades', 'faded', 'fading', 'dies', 'died', 'falters', 'faltered', 'slips', 'drops']);
/** Face words and body parts: after an article they're still someone's face ("the grin goes crooked"); any other noun is a thing ("the door slams"). */
const BODY = new Set(['smile', 'grin', 'laugh', 'smirk', 'snort', 'chuckle', 'sigh', 'yawn', 'frown', 'glare', 'wince', 'jaw', 'brow', 'mouth', 'eyes', 'eye', 'lips', 'lip', 'face', 'voice', 'teeth', 'shoulders', 'hand', 'hands', 'fist', 'fists', 'look', 'expression']);
const ARTICLES = new Set(['the', 'a', 'an']);

/** Whether the clause's subject is a thing: an article and then a noun that isn't a face word or body part. */
function aThing(text: string, clause: { start: number }): boolean {
  const [first = '', second = ''] = text.slice(clause.start).match(/[a-z]+/g) ?? [];
  return ARTICLES.has(first) && !BODY.has(second.replace(/(?:s|es)$/, '')) && !BODY.has(second);
}

/** Third-person pronouns that open a clause about someone, by whose they are. */
const THIRD: Record<string, Pronoun> = { she: 'she', her: 'she', he: 'he', him: 'he', his: 'he', they: 'they', them: 'they', their: 'they' };

/** Where clauses break: sentence ends, dashes, line breaks (one per action), commas, and / but / then. */
const BOUNDARY = /[.!?;:]\s|—\s*|\n|,\s|\band\s|\bbut\s|\bthen\s/g;

/** The clause around [index, end): from the last boundary before it to the first after it. */
function clauseOf(text: string, index: number, end: number): { start: number; end: number } {
  let start = 0;
  let stop = text.length;
  for (const m of text.matchAll(BOUNDARY)) {
    if (m.index! + m[0].length <= index) start = m.index! + m[0].length;
    else if (m.index! >= end) {
      stop = m.index!;
      break;
    }
  }
  return { start, end: stop };
}

/** Whether a negation sits in the clause's three words before `index`. */
function negated(text: string, clause: { start: number }, index: number): boolean {
  const before = (text.slice(clause.start, index).match(/[a-z']+/g) ?? []).slice(-3);
  return before.some((w) => NEGATIONS.has(w)) || NEGATION_PHRASES.some((re) => re.test(before.join(' ')));
}

/** Whether a fading word sits in the clause's three words after the face word ending at `end`. */
function fading(text: string, clause: { end: number }, end: number): boolean {
  return (text.slice(end, clause.end).match(/[a-z]+/g) ?? []).slice(0, 3).some((w) => FADING.has(w));
}

/**
 * Whether the clause is about someone else: it opens with a third-person pronoun that isn't `self`'s
 * (null: any, as for the player, who writes "I" or a bare verb). `self` undefined: no check.
 */
function someoneElse(text: string, clause: { start: number }, self: Pronoun | null | undefined): boolean {
  if (self === undefined) return false;
  const first = (text.slice(clause.start).match(/[a-z]+/) ?? [''])[0];
  const whose = THIRD[first];
  return whose !== undefined && whose !== self;
}

/** The face `kind` lands on among `faces`: its own name, then its fallbacks; null when none is there. */
function land(kind: FaceKind, faces: readonly string[]): string | null {
  return [kind, ...FACE_KINDS[kind].fallbacks].find((f) => faces.includes(f)) ?? null;
}

/**
 * The face the actions end on, one of `faces`; null when nothing matched (or nothing could land).
 * `self` is whose actions they are: her pronoun on her pages, null on the player's line (no check when absent).
 */
export function faceFor(actions: string, faces: readonly string[], self?: Pronoun | null): string | null {
  if (faces.length === 0) return null;
  const text = actions.toLowerCase().replace(/[‘’]/g, "'");
  // The latest face word that counts; a fading one ("the smile is gone") counts as neutral.
  let best: { index: number; face: string | null } | null = null;
  for (const kind of Object.keys(FACE_KINDS) as FaceKind[]) {
    const face = land(kind, faces);
    if (!face) continue;
    for (const signal of FACE_KINDS[kind].signals) {
      for (const m of text.matchAll(new RegExp(`${signal.source}\\w*`, 'g'))) {
        const index = m.index!;
        const end = index + m[0].length;
        const clause = clauseOf(text, index, end);
        if (someoneElse(text, clause, self) || aThing(text, clause) || negated(text, clause, index)) continue;
        if (!best || index > best.index) best = { index, face: fading(text, clause, end) ? null : face };
      }
    }
  }
  return best?.face ?? null;
}
