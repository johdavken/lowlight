import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dominated, dominatedOnBeat, parseWay, wayKeyText, type Way } from './crew-ways';
import { beatDominance, crewCostWords, crewPickLine, questRowText, diceAhead, holds, mentionsFlag, parseCondition, parseQuestFile, parseRun, questOutline, QUEST_CHOICE_MAX, type CondCtx, type QuestEntry, type QuestRun } from './quests';
import { blowsOnMiss, paths } from './job-template';
import { freshCrew, type CrewState } from './crew-rules';
import { questCanvas } from './quest-canvas';

describe('a job without rules: crew', () => {
  it('cold-storage parses as before', () => {
    const r = parseQuestFile('cold-storage', readFileSync(new URL('../world/quests/cold-storage.md', import.meta.url), 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect({ entry: r.entry, warnings: r.warnings }).toMatchSnapshot();
  });
});

const way = (raw: string, clocks: string[] = []): Way => {
  const w = parseWay(raw, clocks);
  if (typeof w === 'string') throw new Error(w);
  return w;
};

describe('parseWay', () => {
  it('a you way with take and alarm', () => {
    expect(way('you scheduler: Hunt and peck. → disturbed [take 1, alarm 1]', ['hears'])).toEqual({ key: { kind: 'you', name: 'scheduler' }, line: 'Hunt and peck.', to: 'disturbed', when: null, take: 1, alarm: 1, heat: 0, clocks: {}, cut: 0, lose: 0, sets: [] });
  });

  it("a job clock's tag, by its id", () => {
    expect(way('you branch: Go through it. → found [take 2, hears 1]', ['hears']).clocks).toEqual({ hears: 1 });
    expect(way('you branch: Go through it. → found [take 2, hears 1, kroll 1]', ['hears', 'kroll']).clocks).toEqual({ hears: 1, kroll: 1 });
    const bad = parseWay('you branch: Go through it. → found [take 2, hears 1]', []);
    expect(typeof bad).toBe('string');
    expect(bad).toContain('hears');
  });

  it('a clock tag can take the clock down; 0 and -0 are refused', () => {
    expect(way('you: Line. → o [hears -1]', ['hears']).clocks).toEqual({ hears: -1 });
    expect(way('you: Line. → o [take 1, hears -2]', ['hears']).clocks).toEqual({ hears: -2 });
    for (const t of ['hears 0', 'hears -0']) {
      const bad = parseWay(`you: Line. → o [${t}]`, ['hears']);
      expect(typeof bad).toBe('string');
      expect(bad).toContain('hears');
    }
  });

  it('set, if, cut and harm', () => {
    const runner = way('runner: … → found [take 2, heat 1, set login=yes]');
    expect(runner.key).toEqual({ kind: 'spec', spec: 'runner' });
    expect(runner).toMatchObject({ take: 2, heat: 1, sets: [{ name: 'login', value: 'yes' }] });
    const out = way('you: Walk out. → home [lose 2] if alarm>=2');
    expect(out).toMatchObject({ key: { kind: 'you', name: '' }, lose: 2, to: 'home', when: [{ kind: 'alarm', op: '>=', value: 2 }] });
    expect(way('contact: Ask her. → found [take 1, cut 20]')).toMatchObject({ key: { kind: 'contact' }, cut: 20 });
    expect(way('face: … → x [held]').harm).toBe('held');
    expect(way('program solvent: Run it. → found').key).toEqual({ kind: 'program', id: 'solvent' });
  });

  it('wayKeyText', () => {
    expect(['you scheduler: a → b', 'runner: a → b', 'program: a → b', 'program solvent: a → b', 'contact: a → b'].map((r) => wayKeyText(way(r).key))).toEqual(['you scheduler', 'runner', 'program', 'program solvent', 'contact']);
  });

  it("what it can't read is a string", () => {
    expect(typeof parseWay('nobody: a → b', [])).toBe('string');
    expect(typeof parseWay('you: no arrow', [])).toBe('string');
    expect(typeof parseWay('you: a → b [take two]', [])).toBe('string');
  });
});

describe('dominated', () => {
  it('a way that takes a clock down is no worse than the same way without it', () => {
    const down = way('you: a → x [take 1, hears -1]', ['hears']);
    const flat = way('you: b → x [take 1]', ['hears']);
    expect(dominated([flat, down])).toEqual([down, flat]);
    expect(dominated([way('you: a → x [take 1, hears -1]', ['hears']), way('runner: b → x [take 1, hears -2]', ['hears'])])).toBeNull();
  });

  it('a way no worse on every tag, spending nothing more', () => {
    const a = way('you: a → x [take 1, alarm 1]');
    const b = way('you: b → x [take 2]');
    expect(dominated([a, b])).toEqual([b, a]);
  });

  it('a way that spends a go is not dominated by you', () => {
    expect(dominated([way('you: a → x [take 1, alarm 1]'), way('runner: b → x [take 2]')])).toBeNull();
  });

  it("two recruits' ways are never weighed against each other: their goes are different things to spend", () => {
    expect(dominated([way('you: a → x [take 1, heat 1]'), way('face: b → x [take 1]'), way('muscle: c → x [take 1, alarm 1]')])).toBeNull();
    expect(dominated([way('you: a → x [take 1, alarm 1]'), way('runner: b → x [take 1]'), way('muscle: c → x [take 1]')])).toBeNull();
    expect(dominated([way('you: a → x [take 1, alarm 1]'), way('face: b → x [take 1]'), way('program: c → x [take 2]'), way('contact: d → x [take 1, heat 1]')])).toBeNull();
  });

  it('a recruit\'s way no better than doing it yourself is dominated: you spend nothing', () => {
    const you = way('you: a → x [take 2]');
    const runner = way('runner: b → x [take 1]');
    expect(dominated([you, runner])).toEqual([you, runner]);
  });

  it('ways with the same key are weighed: two bare programs, or one program twice', () => {
    const a = way('program: a → x [take 2]');
    const b = way('program: b → x [take 1]');
    expect(dominated([a, b])).toEqual([a, b]);
    expect(dominated([way('program scrub: a → x [take 2]'), way('program firewall: b → x [take 1]')])).toBeNull();
  });
});

describe('dominatedOnBeat', () => {
  const card = (id: string, ways: Way[], o: { alarm?: number; sets?: { name: string; value: string }[] } = {}) => ({ id, ways, alarm: o.alarm ?? 0, sets: o.sets ?? [] });
  const plain = () => ({ leaves: null, next: 'next' });
  it("you ways across two cards that lead to the same beat; not across a fork", () => {
    const a = way('you: a → x [take 1]');
    const b = way('you: b → y [take 1, alarm 1]');
    expect(dominatedOnBeat([card('one', [a]), card('two', [b])], plain).map((d) => [d.alarm, d.aCard, d.bCard])).toEqual([[0, 'one', 'two']]);
    expect(dominatedOnBeat([card('one', [a]), card('two', [b])], (w) => ({ leaves: null, next: w.to }))).toEqual([]);
  });
  it("a card's own [alarm] and set count on its ways", () => {
    const a = way('you: a → x [take 1]');
    const b = way('you: b → y [take 1, heat 1]');
    expect(dominatedOnBeat([card('one', [a]), card('two', [b])], plain)).toHaveLength(1);
    expect(dominatedOnBeat([card('one', [a], { alarm: 1 }), card('two', [b])], plain)).toEqual([]);
    expect(dominatedOnBeat([card('one', [a], { sets: [{ name: 'route', value: 'front' }] }), card('two', [b])], plain)).toEqual([]);
  });
  it("across cards only you against you: a recruit's way is weighed on its own card", () => {
    expect(dominatedOnBeat([card('one', [way('you: a → x [take 1, heat 1]')]), card('two', [way('you: b → y [take 1, alarm 1]'), way('face: c → y [take 1]')])], plain)).toEqual([]);
  });
  it("an outcome's take: none or part is a cost", () => {
    const a = way('you: a → stuck');
    const b = way('you: b → torn [heat 1]');
    const leaves = (w: Way) => ({ leaves: w.to === 'stuck' ? ('none' as const) : null, next: 'end' });
    expect(dominatedOnBeat([card('one', [a]), card('two', [b])], leaves)).toEqual([]);
    expect(dominatedOnBeat([card('one', [a]), card('two', [b])], plain).map((d) => d.aCard)).toContain('one');
  });
  it('ways on alarm>=N are weighed at the ALARM they stand at; flag-gated ways are left out', () => {
    const ways = [way('you: a → home if door=held'), way('you: a → stripped [lose 2, heat 1] if alarm>=2'), way('you: a → out [heat 1]')];
    const other = [way('you: b → home if door=held'), way('you: b → stripped [lose 2] if alarm>=2'), way('you: b → out [alarm 1]')];
    // Found once, at the first ALARM it stands at.
    expect(dominatedOnBeat([card('one', ways), card('two', other)], plain).map((d) => [d.alarm, d.aCard])).toEqual([[2, 'two']]);
  });
});

describe('the two crew-rules jobs: no best way at any ALARM', () => {
  for (const id of ['run-sheet', 'night-clerk']) {
    it(id, () => {
      const r = parseQuestFile(id, readFileSync(new URL(`../world/quests/${id}.md`, import.meta.url), 'utf8'), { roster: null, places: null });
      if (!r.ok) throw new Error(JSON.stringify(r.problems));
      const found = [...r.entry.beats.values()].flat().flatMap((b) => beatDominance(b, r.entry.outcomes).map((d) => `${b.id} @${d.alarm}: ${d.aCard}/${wayKeyText(d.a.key)}→${d.a.to} over ${d.bCard}/${wayKeyText(d.b.key)}→${d.b.to}`));
      expect(found).toEqual([]);
    });
  }
});

describe("crewPickLine: the contact's own way, by her pronoun", () => {
  it('She does it. / He does it. / They do it.', () => {
    const line = 'Ask her to take the lacquer off.';
    expect(crewPickLine({ by: 'contact', line, pronoun: 'she' })).toBe('You ask her to take the lacquer off. She does it.');
    expect(crewPickLine({ by: 'contact', line, pronoun: 'he' })).toBe('You ask her to take the lacquer off. He does it.');
    expect(crewPickLine({ by: 'contact', line, pronoun: 'they' })).toBe('You ask her to take the lacquer off. They do it.');
  });
});

describe('crewCostWords: what a way cost, in story words for the contact (last pass C)', () => {
  const none = { alarm: 0, heat: 0, cut: 0, lose: 0, none: false };
  it('one clause per kind that landed, plain words', () => {
    expect(crewCostWords({ ...none, alarm: 2 })).toBe('It drew notice.');
    expect(crewCostWords({ ...none, heat: 1 })).toBe('It left a trace.');
    expect(crewCostWords({ ...none, cut: 50 })).toBe('It cost part of the fee.');
    expect(crewCostWords({ ...none, lose: 1 })).toBe('Some of the take was lost.');
    expect(crewCostWords({ ...none, none: true })).toBe('Nothing came away from it.');
    expect(crewCostWords({ ...none, harm: { name: 'Kit', loss: 'hurt' } })).toBe('Kit was hurt.');
    expect(crewCostWords({ ...none, harm: { name: 'Ade', loss: 'held' } })).toBe('Ade was held.');
  });
  it('nothing when nothing landed', () => {
    expect(crewCostWords(none)).toBe('');
  });
  it('several join in a fixed order: notice, trace, fee, take lost, nothing, the recruit', () => {
    expect(crewCostWords({ alarm: 1, heat: 1, cut: 10, lose: 2, none: true, harm: { name: 'Kit', loss: 'held' } })).toBe('It drew notice. It left a trace. It cost part of the fee. Some of the take was lost. Nothing came away from it. Kit was held.');
    expect(crewCostWords({ ...none, harm: { name: 'Kit', loss: 'hurt' }, alarm: 2 })).toBe('It drew notice. Kit was hurt.');
  });
  it('never a number or a game term', () => {
    const all = crewCostWords({ alarm: 3, heat: 2, cut: 50, lose: 2, none: true, harm: { name: 'Kit', loss: 'hurt' } });
    // The game's terms in capitals (the table's own words say "the take" in plain English).
    expect(all).not.toMatch(/\d|ALARM|HEAT|TAKE|CUT|%/);
    expect(all).not.toMatch(/clock|alarm|heat/i);
  });
});

describe('questRowText: a crew pick told with what it cost (last pass C)', () => {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  it("adds the words after the pick's paragraph, not to the rest", () => {
    const line = questRowText({ title: 'Run Sheet', text: 'You hunt and peck.\n\n*The sheet is there.*', run: 'r@0', pick: 'You hunt and peck.', cost: 'It drew notice.' }, flat);
    expect(line).toBe('[job — Run Sheet: You hunt and peck. It drew notice. *The sheet is there.*]');
  });
  it("adds them after the pick in what she heard on the line", () => {
    const line = questRowText({ title: 'Run Sheet', text: 'You hunt and peck.\n\n*Seen.*', run: 'r@0', heard: 'You hunt and peck. Nothing else.', pick: 'You hunt and peck.', cost: 'It left a trace.' }, flat);
    expect(line).toBe('[job — Run Sheet: You hunt and peck. It left a trace. Nothing else.]');
  });
  it('without cost words, as before', () => {
    expect(questRowText({ title: 'Run Sheet', text: 'You hunt and peck.', run: 'r@0', pick: 'You hunt and peck.' }, flat)).toBe('[job — Run Sheet: You hunt and peck.]');
  });
  it("a way's told: stands in for the pick, its cost words and its outcome: the told line, then the next beat (Kroll's desk)", () => {
    const row = { title: 'Run Sheet', text: 'You sent Kit: Lift his session.\n\n*The sheet is there.*\n\n*The gate.*', run: 'r@0', pick: 'You sent Kit: Lift his session.', cost: 'It drew notice.', toldAs: 'You hear the hut door, then nothing for a minute.' };
    expect(questRowText({ ...row, toldNext: '*The gate.*' }, flat)).toBe('[job — Run Sheet: You hear the hut door, then nothing for a minute. *The gate.*]');
    // No next beat (the job's end): the told line alone.
    expect(questRowText(row, flat)).toBe('[job — Run Sheet: You hear the hut door, then nothing for a minute.]');
  });
  it("fails closed: with told:, the row's text never reaches her, even when it doesn't start with the pick", () => {
    expect(questRowText({ title: 'Run Sheet', text: 'Something else.\n\n*The sheet is there.*', run: 'r@0', pick: 'You sent Kit: Lift his session.', toldAs: 'You hear the hut door.' }, flat)).toBe('[job — Run Sheet: You hear the hut door.]');
  });
  it("and in what she heard on the line, which already carries it", () => {
    const line = questRowText({ title: 'Run Sheet', text: 'You sent Kit: Lift his session.\n\n*Seen.*', run: 'r@0', heard: 'You hear the hut door. Nothing else.', pick: 'You sent Kit: Lift his session.', toldAs: 'You hear the hut door.' }, flat, 'Vee');
    expect(line).toBe(`[job — Run Sheet (told to Vee, so "you" here is Vee; you weren't there, and this is all you heard on the line): You hear the hut door. Nothing else.]`);
  });
});

describe('count conditions', () => {
  const ctx = (counts: Record<string, number>): CondCtx => ({ flags: {}, trust: null, warmth: null, with: 'rue', counts });
  it('name>=N reads a count', () => {
    const c = parseCondition('hears>=2');
    expect(c).toEqual([{ kind: 'count', name: 'hears', op: '>=', value: 2 }]);
    expect(holds([{ kind: 'count', name: 'hears', op: '>=', value: 2 }], ctx({ hears: 2 }))).toBe(true);
    expect(holds([{ kind: 'count', name: 'hears', op: '>=', value: 2 }], ctx({ hears: 1 }))).toBe(false);
  });
  it('heat, alarm and stats keep their kinds; name=N stays a flag', () => {
    expect(parseCondition('heat>=2')).toEqual([{ kind: 'heat', op: '>=', value: 2 }]);
    expect(parseCondition('alarm<=1')).toEqual([{ kind: 'alarm', op: '<=', value: 1 }]);
    expect(parseCondition('tech>=5')).toEqual([{ kind: 'stat', stat: 'tech', op: '>=', value: 5 }]);
    expect(parseCondition('floor=2')).toEqual([{ kind: 'flag', name: 'floor', op: '=', value: '2' }]);
  });
});

const CREW = `---
title: Crew Test
kind: mission
rules: crew
tier: 1
starts: yard-gate
with: [rue]
clock hears: WHAT RUE HEARS · 3
---

# hut

*The hut, the terminal, the night man.*

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

*The sheet is there.*

→ gate

## disturbed

*He wakes.*

→ gate

# gate

*The gate.*

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

const known = { roster: new Set(['rue']), places: new Set(['yard-gate']) };
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

describe('a crew-rules job file', () => {
  it("an outcome's heat: is a parse problem: on crew rules HEAT comes from a way's heat N", () => {
    has(CREW.replace('*You have it.*\n\n→ end', '*You have it.*\n\nheat: +1\n→ end'), "on crew rules HEAT comes from a way's `heat N`");
    ok(CREW);
    // A job without rules: crew keeps it.
    expect(problems(CREW.replace('rules: crew\n', '').replace('*You have it.*\n\n→ end', '*You have it.*\n\nheat: +1\n→ end')).filter((m) => m.includes('HEAT comes from'))).toEqual([]);
  });

  describe('{who}: the name of whoever did a way', () => {
    const WHO = CREW.replace('  · runner: Kit lifts his whole session. → found [take 3, alarm 1]', '  · runner: Kit lifts his whole session. → lifted [take 3, alarm 1]').replace('## found\n', '## lifted\n\n*{who} has the whole session.*\n\n→ gate\n\n## found\n');

    it('goes in an outcome only someone other than you plays', () => {
      expect(problems(WHO)).toEqual([]);
    });

    it('is a problem in an outcome a you way plays', () => {
      has(WHO.replace('  · you scheduler: Hunt and peck. → disturbed [take 1, alarm 1]', '  · you scheduler: Hunt and peck. → lifted [take 1, alarm 1]'), '{who}');
    });

    it('is a problem in an outcome a plain pick plays', () => {
      has(WHO.replace('*The sheet is there.*', '*{who} found the sheet.*'), '{who}');
    });

    it('is a problem in a job without crew rules', () => {
      const GRAFT = `---\ntitle: Graft Who\nkind: mission\ntier: 1\nstarts: yard-gate\nafter: null\npay: 400\n---\n\n# hut\n\n*The hut.*\n\n- walk: Walk in. → home\n- wait: Wait. → home\n\n## home\n\n*{who} is home.*\n\npay: full\n→ end\n`;
      has(GRAFT, '{who}');
    });
  });

  describe("told: what the contact hears of a way (Kroll's desk)", () => {
    const RUNNER = '  · runner: Kit lifts his whole session. → found [take 3, alarm 1]';
    const told = (text: string, under = RUNNER) => CREW.replace(under, `${under}\n${text}`);

    it('an indented told: line directly under a way is its told', () => {
      const ways = ok(told('    told: You hear the hut door, then nothing for a minute.')).entry.beats.get('hut')![0].choices.find((c) => c.id === 'terminal')!.ways!;
      expect(ways.find((w) => w.key.kind === 'spec')!.told).toBe('You hear the hut door, then nothing for a minute.');
      expect(ways.filter((w) => w.told !== undefined)).toHaveLength(1);
    });

    it('a way without one has none, and the next way can still follow a told: line', () => {
      const text = told('    told: You hear the hut door.', '  · contact: Ask her to take the lacquer off. → found [take 1, set asked=yes]');
      const ways = ok(text).entry.beats.get('hut')![0].choices.find((c) => c.id === 'terminal')!.ways!;
      expect(ways.map((w) => w.told)).toEqual([undefined, undefined, undefined, 'You hear the hut door.', undefined]);
    });

    it('is a problem with no way right above it', () => {
      has(CREW.replace('- press: Lean on the night man.', '- press: Lean on the night man.\n  told: You hear nothing.'), 'told:');
      has(CREW.replace('*The hut, the terminal, the night man.*', '*The hut, the terminal, the night man.*\n\ntold: You hear nothing.'), 'told:');
      has(told(`\n    told: You hear the hut door.`), 'told:');
    });

    it('is a problem twice on one way, or empty', () => {
      has(told('    told: You hear the door.\n    told: You hear it again.'), 'told:');
      has(told('    told:'), 'told:');
    });

    it("{who} goes in a told: only on a way someone other than you does", () => {
      expect(problems(told('    told: You hear {who} at the door.'))).toEqual([]);
      has(told('    told: You hear {who} at the door.', '  · you scheduler: Hunt and peck. → disturbed [take 1, alarm 1]'), '{who}');
    });
  });

  describe('size: a crew-rules job holds as many beats and outcomes as a contract', () => {
    // n extra beats, each a plain pick to its own outcome that goes on to the next (the last to the hut).
    const padded = (text: string, n: number) => {
      const first = text.indexOf('\n# hut');
      const chain = Array.from({ length: n }, (_, i) => {
        const next = i + 1 < n ? `pad${i + 1}` : 'hut';
        return `# pad${i}\n\n*Pad ${i}.*\n\n- go: Go on. → pad${i}-on\n- wait: Wait. → pad${i}-on\n\n## pad${i}-on\n\n*On.*\n\n→ ${next}\n\n`;
      }).join('');
      return `${text.slice(0, first + 1)}${chain}${text.slice(first + 1)}`;
    };
    const GRAFT = `---\ntitle: Graft Size\nkind: mission\ntier: 1\nstarts: yard-gate\nafter: null\npay: 400\n---\n\n# hut\n\n*The hut.*\n\n- walk: Walk in. → home\n- wait: Wait. → home\n\n## home\n\n*Home.*\n\npay: full\n→ end\n`;
    const count = (text: string) => (text.match(/^##? /gm) ?? []).length;

    it('a crew-rules mission over 40 and under 90 parses', () => {
      const text = padded(CREW, 20);
      expect(count(text)).toBeGreaterThan(40);
      expect(count(text)).toBeLessThan(90);
      expect(problems(text)).toEqual([]);
    });

    it('a Graft mission over 40 is still refused', () => {
      const text = padded(GRAFT, 20);
      expect(count(text)).toBeGreaterThan(40);
      has(text, 'at most 40 beats and outcomes');
    });

    it('a crew-rules mission over 90 is refused', () => {
      const text = padded(CREW, 45);
      expect(count(text)).toBeGreaterThan(90);
      has(text, 'at most 90 beats and outcomes');
    });
  });

  describe("a getaway's outcome may go on to a beat that ends the job (crew rules only)", () => {
    // `called` goes on to a beat of its own, whose picks end the job.
    const GREY = '\n# grey\n\n*The grey car idles.*\n\nview rue: You heard the call.\n\n- own: Tell her. → owned [set cover=cracked]\n- quiet: Say nothing. → owned\n\n## owned\n\n*The line goes dead.*\n\n→ end\n';
    const greyCar = (text: string) => text.replace('*The grey car.*\n\ntake: part\n→ end', '*The grey car.*\n\ntake: none\n→ grey') + GREY;

    it('allowed on a crew-rules job', () => {
      const { entry: q, warnings } = ok(greyCar(CREW));
      expect(warnings).toEqual([]);
      expect(q.outcomes.get('called')!.to).toBe('grey');
    });

    it("refused when that beat leads back into the job's own beats", () => {
      has(greyCar(CREW).replace('- quiet: Say nothing. → owned', '- quiet: Say nothing. → owned\n- back: Go back in. → again').replace('\n## owned\n', '\n## again\n\n*Back to the gate.*\n\n→ gate\n\n## owned\n'), "a getaway's outcome goes on to a beat that ends the job, never back into it ('grey' leads to 'gate')");
    });

    it('that beat has plain picks only: a ways card there is a problem', () => {
      has(greyCar(CREW).replace('- quiet: Say nothing. → owned', '- quiet: Say nothing.\n  · you: Say nothing at all. → owned'), "a beat after the getaway ('grey') has plain picks only, no ways");
    });

    it('still refused on a Graft job', () => {
      const GRAFT = `---\ntitle: Graft Getaway\nkind: mission\ntier: 1\nstarts: yard-gate\nafter: null\npay: 400\n---\n\n# yard\n\n*The yard.*\n\n- walk: Walk in. → home\n- wait: Wait. → home\n\n## home\n\n*Home.*\n\npay: full\n→ end\n\n# getaway\n\n*The horn.*\n\n- call: Make the call. → called / called [check cool 50]\n- run: Run. → stuck / stuck [check reflex 50]\n\n## called\n\n*The grey car.*\n\ntake: none\n→ grey\n\n## stuck\n\n*Stuck.*\n\ntake: none\n→ end\n` + GREY.replace('view rue: You heard the call.\n\n', '');
      has(GRAFT, "a getaway's outcome ends the job (→ end)");
    });
  });

  it('reads rules, the clock and the ways', () => {
    const { entry: q, warnings } = ok(CREW);
    expect(q.rules).toBe('crew');
    expect(q.clocks).toEqual([{ id: 'hears', label: 'WHAT RUE HEARS', size: 3 }]);
    const [terminal, press] = q.beats.get('hut')![0].choices;
    expect(terminal.ways).toHaveLength(5);
    expect(terminal).toMatchObject({ short: 'THE TERMINAL', check: null, fail: null, to: 'disturbed' });
    expect(press.short).toBeUndefined();
    expect(press.to).toBe('disturbed');
    expect(q.beats.get('gate')![0].choices[1]).toMatchObject({ id: 'leave', to: 'home', fail: null });
    expect(q.beats.get('gate')![0].choices[1].ways).toBeUndefined();
    expect(warnings).toEqual([]);
    expect(q.template).toBeUndefined();
  });

  it('two clock lines give two; three is a problem', () => {
    const two = CREW.replace('clock hears: WHAT RUE HEARS · 3', 'clock hears: WHAT RUE HEARS · 3\nclock kroll: WHAT KROLL LEARNS · 2');
    expect(ok(two).entry.clocks).toEqual([
      { id: 'hears', label: 'WHAT RUE HEARS', size: 3 },
      { id: 'kroll', label: 'WHAT KROLL LEARNS', size: 2 },
    ]);
    has(two.replace('clock kroll:', 'clock vane: VANE · 2\nclock kroll:'), 'at most two');
  });

  describe("a clock that judges (Kroll's desk): `· trust <contact>`", () => {
    const JUDGES = CREW.replace('clock hears: WHAT RUE HEARS · 3', 'clock hears: WHAT RUE HEARS · 3 · trust rue');
    it("reads the third part as the contact whose trust it moves at the end", () => {
      expect(ok(JUDGES).entry.clocks).toEqual([{ id: 'hears', label: 'WHAT RUE HEARS', size: 3, trust: 'rue' }]);
      // Without it, as before: no trust key at all.
      expect(ok(CREW).entry.clocks![0]).not.toHaveProperty('trust');
    });
    it("the contact must be the job's one with: contact", () => {
      has(CREW.replace('clock hears: WHAT RUE HEARS · 3', 'clock hears: WHAT RUE HEARS · 3 · trust ember'), "trust ember: a judging clock moves the job's one with: contact's trust (with: [rue])");
      has(JUDGES.replace('with: [rue]', 'with: [rue, ember]'), "a judging clock moves the job's one with: contact's trust");
      has(JUDGES.replace('with: [rue]\n', ''), "a judging clock moves the job's one with: contact's trust");
    });
    it('a job with a trust: line and a judging clock is a problem', () => {
      has(JUDGES.replace('with: [rue]', 'with: [rue]\ntrust: 1 / 1'), 'a job has a trust: line or a judging clock, not both');
      expect(problems(CREW.replace('with: [rue]', 'with: [rue]\ntrust: 1 / 1'))).toEqual([]);
    });
    it('a last quoted part is the clock\'s note, after a trust part or alone; empty or too long is refused', () => {
      expect(ok(JUDGES.replace('· trust rue', '· trust rue · "SHE HEARS THIS"')).entry.clocks).toEqual([{ id: 'hears', label: 'WHAT RUE HEARS', size: 3, trust: 'rue', note: 'SHE HEARS THIS' }]);
      expect(ok(CREW.replace('WHAT RUE HEARS · 3', 'WHAT RUE HEARS · 3 · "SHE HEARS THIS"')).entry.clocks).toEqual([{ id: 'hears', label: 'WHAT RUE HEARS', size: 3, note: 'SHE HEARS THIS' }]);
      expect(ok(CREW).entry.clocks![0]).not.toHaveProperty('note');
      has(CREW.replace('WHAT RUE HEARS · 3', 'WHAT RUE HEARS · 3 · ""'), "a clock's note is a few words");
      has(CREW.replace('WHAT RUE HEARS · 3', `WHAT RUE HEARS · 3 · "${'X'.repeat(33)}"`), "a clock's note is a few words");
    });
    it('one judging clock at most; a third part that is not `trust <id>` is refused', () => {
      has(JUDGES.replace('clock hears:', 'clock kroll: WHAT KROLL SEES · 2 · trust rue\nclock hears:'), 'one clock judges at most');
      has(CREW.replace('clock hears: WHAT RUE HEARS · 3', 'clock hears: WHAT RUE HEARS · 3 · warmth rue'), 'a clock is <LABEL> · <size>');
      has(CREW.replace('clock hears: WHAT RUE HEARS · 3', 'clock hears: WHAT RUE HEARS · 3 · trust'), 'a clock is <LABEL> · <size>');
    });
  });

  it('rules: crew with template: true is a problem', () => {
    has(CREW.replace('rules: crew', 'rules: crew\ntemplate: true'), 'template');
  });

  it('the tools that read a job run on it', () => {
    const { entry: q } = ok(CREW);
    expect(() => questCanvas(q)).not.toThrow();
    expect(diceAhead(q, 'found')).toBe(false);
    const terminal = q.beats.get('hut')![0].choices[0];
    expect(blowsOnMiss(q, terminal)).toBe(false);
    const hut = questOutline(q).find((b) => b.beat === 'hut')!;
    expect(hut.choices[0].ways?.map((w) => w.to)).toEqual(['disturbed', 'found', 'found', 'found', 'found']);
    expect(mentionsFlag(q, 'door')).toBe(true);
    expect(mentionsFlag(q, 'nothing')).toBe(false);
  });

  it('problems', () => {
    has(CREW.replace('→ home [lose 2] if alarm>=2', '→ found [lose 2] if alarm>=2'), 'different beats');
    has(CREW.replace('- press: Lean on the night man.\n  · you: Lean on him. → disturbed [take 2, alarm 2]', '- press: Lean on him. → disturbed [check cool 50]'), 'no check');
    has(CREW.replace('- leave: Walk away. → home', '- leave: Walk away. → home / sheet'), 'no fail outcome');
    has(CREW.replace('  · you: Lean on him. → disturbed [take 2, alarm 2]', '  · runner: Lean on him. → disturbed [take 2, alarm 2]'), 'you way');
    has(CREW.replace('# gate\n', '# gate\n\npost door: Stand at the door.\ngives door: Nobody comes.\n'), 'no posts');
    has(CREW.slice(0, CREW.indexOf('# getaway')), '# getaway');
    has(CREW.replace('→ found [take 2]', '→ nowhere [take 2]'), "'nowhere'");
    has(CREW.replace('rules: crew\n', '').replace('clock hears: WHAT RUE HEARS · 3\n', '').replace('view rue if hears>=2: She heard him.\n', ''), 'rules: crew');
  });

  it('warns on a dominated way', () => {
    const r = ok(CREW.replace('→ found [take 3, alarm 1]', '→ found [take 1, alarm 1]'));
    expect(r.warnings).toEqual(['hut: at ALARM 0, card terminal way you scheduler (→ disturbed) is at least as good as card terminal way runner (→ found) on every count and spends nothing more']);
  });

  it('a count names a clock of the job', () => {
    has(CREW.replace('view rue if hears>=2', 'view rue if heard>=2'), 'heard');
  });

  it("a card whose only you ways carry an if is a problem; an if way beside a plain one isn't", () => {
    has(CREW.replace('  · you: Lean on him. → disturbed [take 2, alarm 2]', '  · you: Lean on him. → disturbed [take 2, alarm 2] if alarm>=1'), 'needs a you way with no if');
    expect(problems(CREW)).toEqual([]);
  });

  it("a way's line is at most QUEST_CHOICE_MAX characters", () => {
    const long = 'x'.repeat(QUEST_CHOICE_MAX + 1);
    has(CREW.replace('  · you: Lean on him.', `  · you: ${long}`), `at most ${QUEST_CHOICE_MAX} characters`);
    expect(problems(CREW.replace('  · you: Lean on him.', `  · you: ${'x'.repeat(QUEST_CHOICE_MAX)}`))).toEqual([]);
  });

  it('a cut on a way of a push beat is a problem naming the beat (the pay is settled by then); the same beat without it parses', () => {
    const push = (tags: string) => `${CREW}\n# push-1\n\n*One more drawer.*\n\n- grab: Grab the second sheet.\n  · you: Take it. → grabbed [${tags}]\n- leave: Leave it.\n  · you: Walk. → grabbed [take 1]\n\n## grabbed\n\n*Got it.*\n\npay: +50\n→ end\n`;
    expect(problems(push('take 1'))).toEqual([]);
    expect(problems(push('take 1, cut 10'))).toEqual(['push-1: card grab, way you: no cut on a push beat (the pay is settled by then)']);
  });

  it("a crew job's route counts the beats whose cards have ways; a fork into two that rejoin gives two", () => {
    const { entry: q } = ok(CREW);
    expect(paths(q).map((p) => [p.via, p.beats.map((b) => b.id)])).toEqual([[null, ['hut', 'gate']]]);
    const forked = CREW.replace('*The sheet is there.*\n\n→ gate', '*The sheet is there.*\n\n→ desk').replace('*He wakes.*\n\n→ gate', '*He wakes.*\n\n→ desk').replace('  · you: Lean on him. → disturbed [take 2, alarm 2]', '  · you: Lean on him. → shaken [take 2, alarm 2]').replace(
      '# gate\n',
      '## shaken\n\n*He talks.*\n\n→ yard\n\n# desk\n\n*The desk.*\n\n- drawer: Open the drawer.\n  · you: Pull it. → crossed [take 1, alarm 1]\n- leave: Leave it.\n  · you: Walk on. → crossed [heat 1]\n\n# yard\n\n*The yard.*\n\n- cross: Cross the yard.\n  · you: Walk it. → crossed [take 1, alarm 1]\n- wait: Wait for the lights.\n  · you: Wait. → crossed [heat 1]\n\n## crossed\n\n*Across.*\n\n→ gate\n\n# gate\n',
    );
    expect(paths(ok(forked).entry).map((p) => [p.via, p.beats.map((b) => b.id)])).toEqual([
      ['terminal', ['hut', 'desk', 'gate']],
      ['press', ['hut', 'yard', 'gate']],
    ]);
  });
});

describe("a crew run's state", () => {
  const base: QuestRun = { beat: 'hut', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 0, crew: freshCrew() };
  it('a played state round-trips', () => {
    const crew: CrewState = { goes: { dez: 'spent', mia: 'door', 'p:firewall': 'spent', kit: 'hurt', ade: 'held' }, clocks: { hears: 2 }, mods: { noAlarm: true, wall: true }, modsBeat: 'hut', cut: 10, heat: 2 };
    expect(parseRun(JSON.stringify({ ...base, crew }))!.crew).toEqual(crew);
  });
  it('a bad crew keeps the run, and a crew-rules run stays one', () => {
    const run = parseRun(JSON.stringify({ ...base, crew: 'garbage' }));
    expect(run).not.toBeNull();
    expect(run!.crew).toEqual(freshCrew());
    const partly = parseRun(JSON.stringify({ ...base, crew: { ...freshCrew(), goes: { dez: 'gone' }, clocks: { hears: 2 } } }));
    expect(partly!.crew).toEqual({ ...freshCrew(), clocks: { hears: 2 } });
    expect(parseRun(JSON.stringify({ ...base, crew: undefined }))!.crew).toBeUndefined();
  });
});
