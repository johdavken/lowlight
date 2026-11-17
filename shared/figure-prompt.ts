/**
 * The persona figure's prompt (spec 2026-11-12): locked lines that hold the cast's look, then the person from
 * the PERSONA section's questions. Built from the Cass re-art prompt (art/cass/prompt.md). Two images go with
 * it: the style anchor first, the starting character second.
 */
import type { Pronoun } from './pronoun';

/** The image model PERSONA starts with: the one the cast was drawn with (ChatGPT's), via OpenRouter. */
export const DEFAULT_FIGURE_MODEL = 'openai/gpt-image-2';

export const FIGURE_FIELDS = ['age', 'build', 'ethnicity', 'skin', 'hair', 'eyes', 'marks', 'clothes', 'pose', 'expression', 'extra'] as const;
export type FigureField = (typeof FIGURE_FIELDS)[number];
export type FigureFields = Record<FigureField, string>;

export const FIGURE_LABELS: Record<FigureField, string> = {
  age: 'AGE',
  build: 'BUILD',
  ethnicity: 'ETHNICITY',
  skin: 'SKIN',
  hair: 'HAIR',
  eyes: 'EYES',
  marks: 'MARKS',
  clothes: 'CLOTHES',
  pose: 'POSE',
  expression: 'EXPRESSION',
  extra: 'ANYTHING ELSE',
};

export const FIGURE_HINTS: Record<FigureField, string> = {
  age: 'late twenties',
  build: 'wiry, small, tired shoulders',
  ethnicity: 'whatever the person is',
  skin: 'tone, freckles, weathering',
  hair: 'colour, length, how it falls',
  eyes: 'colour, chrome, how they look at you',
  marks: 'scars, chrome, tattoos (say which side of the picture)',
  clothes: 'head to boots; this is the one set they wear all game',
  pose: 'the cast stance if empty',
  expression: 'neutral and guarded if empty',
  extra: 'anything the rest misses',
};

export const DEFAULT_POSE = 'a relaxed three-quarter stance turned slightly toward the viewer, weight on one hip, both arms relaxed at the sides, hands open and empty, clear of the body and fully visible, five fingers each';
export const DEFAULT_EXPRESSION = 'neutral and guarded, eyes steady';

export const emptyFields = (): FigureFields => Object.fromEntries(FIGURE_FIELDS.map((f) => [f, ''])) as FigureFields;

const STYLE = [
  'Full-body character sprite for a 2D pixel-art cyberpunk visual novel, drawn in exactly the same style as the first attached image: same pixel density and chunky readable shapes, same hand-placed dithering and crisp edges, same textured, slightly gritty shading, same proportions and scale, the whole figure in frame from head to boots, standing in the same place in the frame as the second attached image.',
  'Flat chroma-key green background (pure #00FF00) filling the whole frame, no floor, no shadow, no text or lettering anywhere. Nothing on the figure is that green.',
  'The second attached image gives pose and framing only: not its build, face, hair, skin or clothes. The build comes from the description below.',
  'Sides are given from the viewer\'s side ("on the right of the picture").',
  'A worn-out, rainy cyberpunk city: ordinary, practical clothes with wear on them. Nothing sexualised, no fanservice.',
].join(' ');

const PERSON: [FigureField, string][] = [
  ['age', 'Age'],
  ['build', 'Build'],
  ['ethnicity', 'Ethnicity'],
  ['skin', 'Skin'],
  ['hair', 'Hair'],
  ['eyes', 'Eyes'],
  ['marks', 'Marks'],
  ['clothes', 'Wearing'],
];

const WHO: Record<Pronoun, string> = { she: 'a woman', he: 'a man', they: 'a person' };

/** The whole prompt; empty fields are left out, an empty pose or expression takes the cast's. */
export function figurePrompt(f: FigureFields, pronoun: Pronoun): string {
  const said = (k: FigureField) => f[k].trim();
  const person = PERSON.filter(([k]) => said(k)).map(([k, label]) => `${label}: ${said(k)}.`);
  const lines = [
    STYLE,
    `The character is ${WHO[pronoun]}. ${person.join(' ')}`.trim(),
    said('extra') ? `Also: ${said('extra')}.` : '',
    `Pose: ${said('pose') || DEFAULT_POSE}.`,
    `Expression: ${said('expression') || DEFAULT_EXPRESSION}.`,
  ];
  return lines.filter(Boolean).join('\n\n');
}

/** Fields to start from for a character: their description in ANYTHING ELSE, the cast's pose and face; the rest is the user's. */
export function prefillFields(c: { description: string; tagline: string }): FigureFields {
  return { ...emptyFields(), extra: c.description.trim() || c.tagline.trim(), pose: DEFAULT_POSE, expression: DEFAULT_EXPRESSION };
}
