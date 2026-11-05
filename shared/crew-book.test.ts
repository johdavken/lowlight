import { describe, expect, it } from 'vitest';
import { parseCrewBook, TIMING } from './crew-book';

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
  it('names: `· man` / `· woman` after a name goes to genders, unmarked fits any face', () => {
    const { book, problems } = parseCrewBook({ ...empty, names: '## karasu\n- Daichi Mori · man\n- Hana Ibe · woman\n- Juno Sato\n- Odd One · robot\n' });
    expect(book.names).toEqual({ karasu: ['Daichi Mori', 'Hana Ibe', 'Juno Sato', 'Odd One'] });
    expect(book.genders).toEqual({ 'Daichi Mori': 'man', 'Hana Ibe': 'woman' });
    expect(problems).toEqual(['names: "Odd One · robot" must end in · man or · woman, or neither']);
  });
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

describe('goods errands (crew goods spec §2, §7)', () => {
  const block = (lines: string, bandEffect = '') => parseCrewBook({ ...empty, errands: `---\nkind: pull\nlabel: Pull\ntag: SOL\nsuits: runner\nhours: 3\nrisk: low\n${lines}\nclean:\n  - effect: lot\n  - "a"\nmessy:\n  - effect: lot damaged · heat +1\n  - "b"\nblown:\n  - "c"\n${bandEffect}---\n` });
  it('reads group, gives, cost and the lot effect', () => {
    const { book, problems } = block('needs: offer\ngroup: collect\ngives: data, parts\ncost: 0.4');
    expect(problems).toEqual([]);
    expect(book.errands[0]).toMatchObject({ group: 'collect', gives: ['data', 'parts'], cost: 0.4, needs: { on: 'offer' } });
    expect(book.errands[0].bands.clean.effect.lot).toBe('full');
    expect(book.errands[0].bands.messy.effect).toEqual({ lot: 'damaged', heat: 1 });
  });
  it('reads needs: lot, and refuses a bad group', () => {
    expect(block('needs: lot').book.errands[0].needs).toEqual({ on: 'lot' });
    expect(block('needs: lot\ngroup: nonsense').problems.join()).toContain('group must be collect or hustle');
  });
  it('reads an effect and an also', () => {
    const { book, problems } = parseCrewBook({ ...empty, traits: 'kt · Knows · + · hours -33% + sells-anywhere · any · x\nob · Old · + · full-route · fence · x' });
    expect(problems).toEqual([]);
    expect(book.traits[0]).toMatchObject({ effect: { kind: 'hours', pct: -33 }, also: { kind: 'sells-anywhere' } });
    expect(book.traits[1].effect).toEqual({ kind: 'full-route' });
  });
  it('an also takes only the two new effects', () => {
    expect(parseCrewBook({ ...empty, traits: 'kt · K · + · hours -33% + never-held · any · x' }).problems.join()).toContain('unknown effect');
  });
});

describe('retired errands (crew cleanup spec §1)', () => {
  const block = (line: string) => parseCrewBook({ ...empty, errands: caseBlock.replace('tag: PREP', `${line}\ntag: PREP`) });
  it('reads retired: yes', () => expect(block('retired: yes').book.errands[0].retired).toBe(true));
  it('takes only yes', () => expect(block('retired: maybe').problems.join()).toContain('retired must be yes'));
});

describe('abilities', () => {
  const T = 'steady · Steady Hands · + · odds any +5 · any · Doesn’t shake.';
  const parse = (abilities: string) => parseCrewBook({ names: '', traits: T, pitches: '', errands: '', abilities });
  it('reads the ability pass\'s ten effects, each with its timing', () => {
    const kinds = { 'setup-position': 'roll', 'setup-die': 'roll', 'greed-effect': 'roll', 'greed-die': 'roll', 'gamble-cost': 'after', 'gamble-miss': 'after', 'trade-alarm': 'after', 'trade-nerve': 'after', 'end-take': 'end', 'end-cool': 'end' } as const;
    const { book, problems } = parse(Object.keys(kinds).map((k) => `${k} · X · any · GREEN · ${k} · Line.`).join('\n'));
    expect(problems).toEqual([]);
    expect(book.abilities.map((a) => a.job.kind)).toEqual(Object.keys(kinds));
    for (const [k, t] of Object.entries(kinds)) expect(TIMING[k as keyof typeof kinds]).toBe(t);
  });
  it('parses a line', () => {
    const { book, problems } = parse('log-wipe · Log Wipe · runner · HAND · alarm -1 · Knows which logs nobody reads.');
    expect(problems).toEqual([]);
    expect(book.abilities).toEqual([{ id: 'log-wipe', label: 'Log Wipe', for: ['runner'], from: 1, job: { kind: 'alarm' }, text: 'Knows which logs nobody reads.' }]);
  });
  it('cross takes a stat', () => {
    const { book } = parse('spoof · Spoof · runner · GREEN · cross wits · x');
    expect(book.abilities[0]).toMatchObject({ job: { kind: 'cross', stat: 'wits' }, from: 0 });
  });
  it('the other job effects', () => {
    const { book, problems } = parse(
      ['a · A · any · GREEN · die · x', 'b · B · any · GREEN · getaway · x', 'c · C · any · GREEN · again · x', 'd · D · any · VET · save · x', 'e · E · any · GREEN · nerve +1 · x', 'f · F · any · GREEN · take +1 · x', 'g · G · any · GREEN · heat -1 · x'].join('\n'),
    );
    expect(problems).toEqual([]);
    expect(book.abilities.map((a) => a.job.kind)).toEqual(['die', 'getaway', 'again', 'save', 'nerve', 'take', 'heat']);
    expect(book.abilities[0].for).toBe('any');
  });
  it.each([
    ['bad job effect', 'a · A · runner · GREEN · fly · x', 'abilities: a: unknown job effect "fly"'],
    ['bad grade', 'a · A · runner · BOSS · die · x', 'abilities: a: grade must be GREEN, HAND, PRO or VET'],
    ['bad specialty', 'a · A · pilot · GREEN · die · x', 'abilities: a: unknown specialty pilot'],
    ['clash with a trait', 'steady · S · any · GREEN · die · x', 'abilities: steady is a trait id'],
    ['too few fields', 'a · A · runner · GREEN · x', 'abilities: "a · A · runner · GREEN · x" needs six fields split by ·'],
    ['an old seven-field line', 'a · A · runner · GREEN · die · odds any +5 · x', 'abilities: "a · A · runner · GREEN · die · odds any +5 · x" needs six fields split by ·'],
  ])('%s is a problem and skipped', (_, line, problem) => {
    const { book, problems } = parse(line);
    expect(problems).toEqual([problem]);
    expect(book.abilities).toEqual([]);
  });
  it('twice is a problem', () => {
    expect(parse('a · A · runner · GREEN · die · x\na · B · runner · GREEN · die · y').problems).toEqual(['abilities: a is listed twice']);
  });
  it('no abilities file is none', () => {
    expect(parseCrewBook({ names: '', traits: '', pitches: '', errands: '' }).book.abilities).toEqual([]);
  });
});
