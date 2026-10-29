import { describe, expect, it } from 'vitest';
import { holds, isJob, parseCondition, parseQuestFile, type CondCtx, type QuestEntry } from './quests';
import { BIG, JOB, TRAIL } from './quests.fixture';

const parse = (text: string) => parseQuestFile('north-gate', text, { roster: null, places: null });
const big = (text = BIG): QuestEntry => {
  const r = parse(text);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const problems = (text: string) => {
  const r = parse(text);
  return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
};
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: null, warmth: null, with: 'hicks', ...o });

describe('big jobs: the file', () => {
  it('BIG parses: kind big, tier 3, go 180 (03:00), stake [15, 25]', () => {
    const q = big();
    expect(q).toMatchObject({ kind: 'big', tier: 3, go: 180, stake: [15, 25], payRange: [1500, 3000], first: 'ask' });
  });

  it('a scene header "# ferry at ferry-stairs" sets beat.at; versions keep it', () => {
    const q = big();
    expect(q.beats.get('ferry')![0].at).toBe('ferry-stairs');
    expect(q.beats.get('intake')!.map((b) => b.at)).toEqual(['lowlight-intake', 'lowlight-intake']);
    expect(q.beats.get('ask')![0].at).toBeNull();
  });

  it('clues: words split on commas, "false" marks a misleading clue', () => {
    const q = big();
    expect(q.clues.get('strap')).toEqual({ text: "A courier's strap snagged on the ferry railing.", words: ['the courier', 'the ferry'], false: false });
    expect(q.clues.get('rumour')).toMatchObject({ words: ['SDG pay'], false: true });
    expect(q.beats.has('clues')).toBe(false);
  });

  it('read: four parts around three answers; wrong words listed; its next beat', () => {
    expect(big().read).toEqual({
      beat: 'read',
      parts: ['', ' gets through ', ' because ', '.'],
      answers: ['the courier', 'the north gate', 'the guard is paid'],
      wrong: ['the dock', 'the river', 'the night shift'],
      next: 'gate',
    });
  });

  it('outcome lines clue:, marks: with "line", reveals:', () => {
    const q = big();
    expect(q.outcomes.get('taken')!.effects.marks).toEqual([
      { place: 'ferry-stairs', line: 'the courier came through here' },
      { place: 'lowlight-intake', line: "the gate's paperwork" },
    ]);
    expect(q.outcomes.get('taken')!.to).toBe('back');
    expect(q.outcomes.get('logged')!.effects).toMatchObject({ clue: 'schedule', reveals: [{ place: 'the-tilt', line: 'the guard drinks here' }] });
  });

  it('gig tag: kind, tier, mods with steps and labels; crew shorthand; three outcomes', () => {
    const gate = big().beats.get('gate')![0];
    const wire = gate.choices.find((c) => c.id === 'wire')!;
    expect(wire.gig).toEqual({
      kind: 'gig',
      gig: 'hack',
      tier: 'medium',
      mods: [
        { when: [{ kind: 'flag', name: 'read.2', op: '=', value: 'right' }], step: -1, label: 'you know the gate' },
        { when: [{ kind: 'with', contact: 'hicks' }], step: -1, label: 'Hicks' },
      ],
    });
    expect([wire.to, wire.close, wire.fail]).toEqual(['in-clean', 'in-close', 'burned']);
    const paper = gate.choices.find((c) => c.id === 'paper')!;
    expect(paper.gig).toMatchObject({ gig: 'papers', tier: 'medium', mods: [] });
    expect(paper.tags).toEqual([{ kind: 'needs', all: [{ kind: 'flag', name: 'read.1', op: '=', value: 'right' }] }]);
  });

  it('time conditions: time>=02:00 holds at night minute of 02:30 and not of 23:00', () => {
    const c = parseCondition('time>=02:00');
    expect(c).toEqual([{ kind: 'time', op: '>=', minute: 1200 }]);
    // Night minutes count from 06:00: 02:30 is 1230, 23:00 is 1020.
    expect(holds(c as never, ctx({ night: 1230 }))).toBe(true);
    expect(holds(c as never, ctx({ night: 1020 }))).toBe(false);
    expect(holds(parseCondition('time<04:00') as never, ctx({ night: 1230 }))).toBe(true);
  });

  it('problems: tier 1 or 2; a read without exactly 3 blanks; clue: naming no clue; a gig route without three outcomes', () => {
    expect(problems(BIG.replace('tier: 3', 'tier: 2'))).toEqual([expect.stringMatching(/tier: a big job is tier 3 or 4/)]);
    expect(problems(BIG.replace('because [the guard is paid]', 'because the guard is paid')).some((p) => /three blanks/.test(p))).toBe(true);
    expect(problems(BIG.replace('clue: strap', 'clue: nope')).some((p) => /no clue 'nope'/.test(p))).toBe(true);
    expect(problems(BIG.replace('→ in-clean / in-close / burned [gig hack', '→ in-clean / burned [gig hack')).some((p) => /three outcomes/.test(p))).toBe(true);
  });

  it('problems: time, at:, read:, gig and clue: outside kind big', () => {
    const job = JOB.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\nclue: strap\n→ desk");
    expect(problems(job).some((p) => /only in a big job/.test(p))).toBe(true);
    expect(problems(JOB.replace('# desk', '# desk at the-tilt')).some((p) => /only in a big job/.test(p))).toBe(true);
    expect(problems(JOB.replace('- skim: Take what fits in a pocket. → part', '- skim: Take what fits in a pocket. → part [needs time>=02:00]')).some((p) => /only in a big job/.test(p))).toBe(true);
  });

  it("a false clue can't hold a right answer", () => {
    expect(problems(BIG.replace('words: SDG pay · false', 'words: the guard is paid · false')).some((p) => /right answer/.test(p))).toBe(true);
  });

  it('warnings: a right answer no clue gives; a scene place never marked or revealed', () => {
    const r1 = parse(BIG.replace('- paid: Someone pays the guard\'s bar tab. · words: the guard is paid', "- paid: Someone pays the guard's bar tab. · words: a bar tab"));
    expect(r1.ok && r1.warnings.some((w) => /the guard is paid/.test(w))).toBe(true);
    const r2 = parse(BIG.replace('reveals: the-tilt "the guard drinks here"\n', ''));
    expect(r2.ok && r2.warnings.some((w) => /the-tilt/.test(w))).toBe(true);
    const ok = parse(BIG);
    expect(ok.ok && ok.warnings).toEqual([]);
  });

  it('I2: client:, target: and take: front matter, big jobs only', () => {
    const q = big(BIG.replace('stake: 15 / 25\n', 'stake: 15 / 25\nclient: A broker\ntarget: The gate\ntake: a manifest\n'));
    expect(q.brief).toEqual({ client: 'A broker', target: 'The gate', take: 'a manifest' });
    expect(big().brief).toEqual({ client: null, target: null, take: null });
    expect(problems(JOB.replace('tier: 2', 'tier: 2\nclient: A broker')).some((p) => /only in a big job/.test(p))).toBe(true);
  });

  it('isJob: mission and big yes, quest no', () => {
    expect(isJob({ kind: 'big' })).toBe(true);
    expect(isJob({ kind: 'mission' })).toBe(true);
    expect(isJob({ kind: 'quest' })).toBe(false);
    const trail = parseQuestFile('paper-trail', TRAIL, { roster: null, places: null });
    expect(trail.ok && trail.entry.kind).toBe('quest');
  });
});

describe('drafting rules', () => {
  it('COPY FOR OPUS knows big jobs: scenes at places, clues with words, a three-blank read, routes into gigs', async () => {
    const { QUEST_DRAFT_RULES } = await import('./quests');
    const rules = QUEST_DRAFT_RULES.join('\n');
    expect(rules).toContain('# <id> at <place>');
    expect(rules).toContain('# clues');
    expect(rules).toContain('three [blanks]');
    expect(rules).toContain('gig <hack|slip|papers>');
  });
});
