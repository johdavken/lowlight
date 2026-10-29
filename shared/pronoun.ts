/** A character's or persona's pronoun (spec 2026-10-12 character pronouns): one of three, `they` when unset. */
export type Pronoun = 'she' | 'he' | 'they';

export const PRONOUNS: readonly Pronoun[] = ['she', 'he', 'they'];

export const isPronoun = (x: unknown): x is Pronoun => typeof x === 'string' && (PRONOUNS as readonly string[]).includes(x);

/** The forms copy needs, keyed by the `she` set's words; `s` is the verb ending ("she asks", "they ask"). */
export interface PronounForms {
  she: string;
  her: string;
  hers: string;
  herself: string;
  is: string;
  has: string;
  s: string;
}

const FORMS: Record<Pronoun, PronounForms> = {
  she: { she: 'she', her: 'her', hers: 'her', herself: 'herself', is: 'is', has: 'has', s: 's' },
  he: { she: 'he', her: 'him', hers: 'his', herself: 'himself', is: 'is', has: 'has', s: 's' },
  they: { she: 'they', her: 'them', hers: 'their', herself: 'themselves', is: 'are', has: 'have', s: '' },
};

export const forms = (p: Pronoun): PronounForms => FORMS[p];

/** A name as the models see it when someone is introduced: `Mother Rot (he)`. */
export const named = (name: string, p: Pronoun): string => `${name} (${p})`;
