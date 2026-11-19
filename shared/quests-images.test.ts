import { describe, expect, it } from 'vitest';
import { parseQuestFile, type QuestEntry } from './quests';
import type { CastFace } from './narration-images';

// A crew job with images (spec 2026-11-18): mirek fixed, coat drawn, halloran from the cast; mirek marked twice.
const JOB = `---
title: Crew Test
kind: mission
rules: crew
tier: 1
starts: yard-gate
with: [rue]
clock hears: WHAT RUE HEARS · 3
image mirek: local-01
image coat: any man old
image halloran:
---

# hut

{img mirek} *The hut, the terminal, the night man.*

*{img halloran} Halloran is at the counter.*

view rue: She listens.

- terminal: Go in through the terminal. [short THE TERMINAL]
  · you scheduler: Hunt and peck. → disturbed [take 1, alarm 1]
  · you branch: Go through it the way they taught you. → found [take 2, hears 1]
  · program: Let the pocket deck do it. → found [take 2]
  · contact: Ask her to take the lacquer off. → found [take 1, set asked=yes]
  · runner: Kit lifts his whole session. → found [take 3, alarm 1]
- press: Lean on the night man.
  · you: Lean on him. → disturbed [take 2, alarm 2]

## found

{img coat} *The sheet is there.*

→ gate

## disturbed

*He wakes.*

→ gate

# gate

{img mirek} *The gate.*

view rue if hears>=2: She heard him.

- talk: Talk past the guard.
  · you: Talk your way past. → sheet [take 1, alarm 1]
  · you: Walk out with what you have. → home [lose 2] if alarm>=2
  · face: Wave the badge he lent you. → sheet [take 2] if door=held
- leave: Walk away. → home

## sheet

*You have it.*

→ end

## home

*Home with nothing.*

take: none
→ end

# getaway

*The horn.*

- call: Make the call.
  · you: Make the call. → called [hears 3]
- run: Over the rigs.
  · you: Run. → stuck

## called

*The grey car.*

take: part
→ end

## stuck

*Stuck on the rigs.*

take: none
→ end
`;

const extras = [
  { id: 'local-01', tags: ['local', 'man'] },
  { id: 'local-02', tags: ['local', 'man', 'old'] },
  { id: 'crew-muscle-01', tags: ['crew', 'man', 'old'] },
  { id: 'local-03', tags: ['local', 'woman', 'old'] },
];
const cast = new Map<string, CastFace>([['halloran', { kind: 'extra', id: 'local-03' }], ['rue', { kind: 'character', id: 'rue' }]]);
const known = {
  roster: new Set(['rue', 'kroll']),
  places: new Set(['yard-gate']),
  extras: { ids: new Set(extras.map((e) => e.id)), tags: new Set(extras.flatMap((e) => e.tags)), list: extras },
  cast,
};
const parse = (text: string) => parseQuestFile('crew-test', text, known);
const ok = (text: string): { entry: QuestEntry; warnings: string[] } => {
  const r = parse(text);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r;
};
const problems = (text: string): string[] => {
  const r = parse(text);
  return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
};
const has = (text: string, part: string) => expect(problems(text).some((m) => m.includes(part)), problems(text).join('\n') || 'parsed').toBe(true);
const swap = (a: string, b: string) => {
  expect(JOB).toContain(a);
  return JOB.replace(a, b);
};

describe('image lines and {img} markers', () => {
  it('a valid file gives its images in declaration order, and keeps the markers in the prose', () => {
    const r = ok(JOB);
    expect(r.entry.images).toEqual([
      { id: 'mirek', source: { kind: 'extra', id: 'local-01' } },
      { id: 'coat', source: { kind: 'any', tags: ['man', 'old'] } },
      { id: 'halloran', source: { kind: 'cast' } },
    ]);
    expect(r.entry.beats.get('hut')![0].text).toContain('{img mirek}');
    expect(r.warnings.filter((w) => w.includes('image'))).toEqual([]);
  });
  it('`image <id>: cast` is the same as no source', () => {
    expect(ok(swap('image halloran:\n', 'image halloran: cast\n')).entry.images![2]).toEqual({ id: 'halloran', source: { kind: 'cast' } });
  });
  it('a scene picture: `scene <file>` (in world/quests/art), and a bad file name refused', () => {
    expect(ok(swap('image coat: any man old', 'image coat: scene crew-test-coat.webp')).entry.images![1]).toEqual({ id: 'coat', source: { kind: 'scene', file: 'crew-test-coat.webp' } });
    has(swap('image coat: any man old', 'image coat: scene ../coat.webp'), 'a scene is');
    has(swap('image coat: any man old', 'image coat: scene coat.gif'), 'a scene is');
  });
  it('a contact from the roster: `character <id>`', () => {
    expect(ok(swap('image mirek: local-01', 'image mirek: character kroll')).entry.images![0]).toEqual({ id: 'mirek', source: { kind: 'character', id: 'kroll' } });
  });
  it('refuses an unknown extra, a crew portrait, an unknown character, and the job\'s own contact', () => {
    has(swap('image mirek: local-01', 'image mirek: local-99'), "no extra 'local-99'");
    has(swap('image mirek: local-01', 'image mirek: crew-muscle-01'), 'crew portrait');
    has(swap('image mirek: local-01', 'image mirek: character nobody'), "no character 'nobody'");
    has(swap('image mirek: local-01', 'image mirek: character rue'), 'the job\'s own contact');
  });
  it('refuses an `any` tag set that leaves no portrait once crew and faces in use are out', () => {
    has(swap('image coat: any man old', 'image coat: any crew'), 'no portrait left');
    // local-02 is the only old man that isn't crew; a fixed image taking it leaves the draw nothing.
    has(swap('image mirek: local-01', 'image mirek: local-02'), 'no portrait left');
  });
  it('a cast image needs a cast entry, and a cast id can\'t take another face', () => {
    has(swap('image halloran:\n', 'image pim:\n').replace('{img halloran}', '{img pim}'), "'pim' isn't in the cast");
    has(swap('image halloran:\n', 'image halloran: local-01\n'), 'in the cast list');
  });
  it('refuses the id who, a duplicate id, and a malformed line', () => {
    has(swap('image mirek: local-01', 'image who: local-01').replace(/\{img mirek\}/g, '{img who}'), 'reserved');
    // The front matter's YAML refuses a repeated key before the image check sees it.
    has(swap('image coat: any man old', 'image coat: any man old\nimage mirek: local-02'), 'unique');
    has(swap('image coat: any man old', 'image coat: some man'), "an image is");
  });
  it('refuses a marker for an undeclared image, a marker mid-paragraph, and markers outside the prose', () => {
    has(swap('{img coat} *The sheet is there.*', '{img nobody} *The sheet is there.*'), "no image 'nobody'");
    has(swap('*The horn.*', '*The {img coat} horn.*'), 'start of a paragraph');
    has(swap('view rue: She listens.', 'view rue: {img mirek} She listens.'), 'only in a beat\'s or outcome\'s text');
    has(swap('Lean on him.', '{img mirek} Lean on him.'), 'only in a beat\'s or outcome\'s text');
  });
  it('refuses a marker in front-matter prose (pitch:, brief:, opening:)', () => {
    has(swap('title: Crew Test', 'title: Crew Test\npitch: "{img mirek} A clerk who missed his drops."'), "only in a beat's or outcome's text");
  });
  it("refuses a cast entry that is the job's own contact", () => {
    const withRue = new Map(cast);
    withRue.set('rue', { kind: 'character', id: 'rue' });
    const r = parseQuestFile('crew-test', swap('image halloran:\n', 'image halloran:\nimage rue:\n').replace('*The horn.*', '{img rue} *The horn.*'), { ...known, cast: withRue });
    expect(r.ok ? [] : r.problems.map((p) => p.message)).toContainEqual(expect.stringContaining("the job's own contact"));
  });
  it('refuses a marker on a conditional (passive) line: it could never head a paragraph', () => {
    has(swap('*The gate.*', '*The gate.*\n[alarm>=1] {img mirek} The guard is awake.'), 'conditional');
  });
  it('an image no marker uses is a warning, not a problem', () => {
    const r = ok(swap('{img coat} *The sheet is there.*', '*The sheet is there.*'));
    expect(r.warnings.some((w) => w.includes("image 'coat'"))).toBe(true);
  });
});
