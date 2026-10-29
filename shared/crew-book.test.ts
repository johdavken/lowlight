import { describe, expect, it } from 'vitest';
import { parseCrewBook } from './crew-book';

const names = `# Names

## karasu
- Juno Sato
- Ilya Voss

## strand
- Saida Rahm
`;

const traits = `# Traits

silver-tongue · Silver Tongue · + · odds lay-low +8 · face · Talks his way past most doors.
good-scales · Good Scales · + · pay hustle +20% · fence · Hustles pay more.
knows-trains · Knows the Trains · + · hours -33% · runner · Gets there faster.
talks · Talks Too Much · − · heat-on-messy +1 · any · Can't keep it in.
nobodys-fool · Nobody's Fool · + · never-held · fence, face · Never held.
hard-to-move · Hard to Move · + · hurt-not-gone-once · muscle · Lives through it once.
habits · Expensive Habits · - · wage-on-clean +20 · any · Wants more after a good night.
marsh-debt · Owes the Marsh · − · busy 2-in-7 · muscle · Some nights he's paying it off.
`;

const pitches = `# Pitches

## face HAND
- "I sell insurance. Mostly to people who didn't know they needed it."
- "Doors open for me."

## runner GREEN
- "Drove a cab four years."
`;

const caseBlock = `---
kind: case
label: Case {job}
tag: PREP
suits: runner, ears
hours: 4
risk: low
needs: job
blurb: Someone sits across from {place} all night and counts who goes in the back.
clean:
  - effect: prep cased=clean
  - "{name} sat across from {place} all night and counted who went in the back."
  - "{name} found the back stair at {place}. Nobody saw."
messy:
  - effect: prep cased=messy · heat +1
  - "{name} got what you needed, but the door at {place} saw a face."
blown:
  - "{name} was made outside {place}."
---
`;

const hustle = `---
kind: hustle
label: Hustle in {district}
tag: SOL
suits: fence, face
hours: 5
risk: med
needs: district known
blurb: Move hot goods.
clean:
  - effect: sol 300-400 · rep +1
  - "{name} moved the lot."
messy:
  - effect: sol 150 · heat +1
  - "{name} sold half."
blown:
  - "{name} got caught with it."
---
`;

const empty = { names: '', traits: '', pitches: '', errands: '' };

describe('parseCrewBook', () => {
  it('parses each file', () => {
    const { book, problems } = parseCrewBook({ names, traits, pitches, errands: caseBlock + hustle });
    expect(problems).toEqual([]);
    expect(book.names).toEqual({ karasu: ['Juno Sato', 'Ilya Voss'], strand: ['Saida Rahm'] });
    expect(book.traits.map((t) => t.effect.kind)).toEqual(['odds', 'pay', 'hours', 'heat-on-messy', 'never-held', 'hurt-not-gone-once', 'wage-on-clean', 'busy']);
    expect(book.traits[0]).toEqual({ id: 'silver-tongue', label: 'Silver Tongue', good: true, effect: { kind: 'odds', errand: 'lay-low', delta: 8 }, for: ['face'], text: 'Talks his way past most doors.' });
    expect(book.traits[2].effect).toEqual({ kind: 'hours', pct: -33 });
    expect(book.traits[3]).toMatchObject({ good: false, for: 'any' });
    expect(book.traits[4].for).toEqual(['fence', 'face']);
    expect(book.traits[6]).toMatchObject({ good: false, effect: { kind: 'wage-on-clean', n: 20 } });
    expect(book.traits[7].effect).toEqual({ kind: 'busy', days: 2 });
    expect(book.pitches['face:1']).toHaveLength(2);
    expect(book.pitches['runner:0']).toEqual(['Drove a cab four years.']);
    const c = book.errands[0];
    expect(c).toMatchObject({ kind: 'case', label: 'Case {job}', tag: 'PREP', suits: ['runner', 'ears'], hours: 4, risk: 'low', needs: { on: 'job' } });
    expect(c.bands.clean.effect).toEqual({ prep: { flag: 'cased', value: 'clean' } });
    expect(c.bands.clean.lines).toHaveLength(2);
    expect(c.bands.messy.effect).toEqual({ prep: { flag: 'cased', value: 'messy' }, heat: 1 });
    expect(c.bands.blown).toEqual({ effect: {}, lines: ['{name} was made outside {place}.'] });
    expect(book.errands[1].needs).toEqual({ on: 'district', when: 'known' });
  });

  it('sol range', () => {
    const { book } = parseCrewBook({ ...empty, errands: hustle });
    expect(book.errands[0].bands.clean.effect).toEqual({ sol: [300, 400], rep: 1 });
    expect(book.errands[0].bands.messy.effect.sol).toEqual([150, 150]);
  });

  it('problems', () => {
    const badTrait = 'tele · Teleport · + · teleport · any · Gone.\n';
    const badSuits = hustle.replace('kind: hustle', 'kind: hustle2').replace('suits: fence, face', 'suits: fence, pilot');
    const noLine = hustle.replace('kind: hustle', 'kind: hustle3').replace('  - "{name} got caught with it."\n', '');
    const { book, problems } = parseCrewBook({ ...empty, traits: badTrait + traits, errands: hustle + badSuits + noLine + hustle });
    expect(book.traits).toHaveLength(8);
    expect(book.errands.map((e) => e.kind)).toEqual(['hustle']);
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/teleport/);
    expect(problems.join('\n')).toMatch(/pilot/);
    expect(problems.join('\n')).toMatch(/hustle3.*blown/);
    expect(problems.join('\n')).toMatch(/hustle.*twice|duplicate/);
  });
});
