import { describe, expect, it } from 'vitest';
import { arrangementActive, arrangementLine, chairTwoChecks, cutOf, parseArrangement, retainerToCut, type Arrangement } from './arrangement';
import { parseQuestFile } from './quests';
import { JOB } from './quests.fixture';

/** A quest with one contact whose deal outcome carries `line` above its arrow. */
export const chairText = (line = 'arrangement: chair 150 / 1', withs = '[nix-direct]') => `---
title: The Chair
with: ${withs}
starts: lowlight-intake
---

# offer
*She waits for the number.*

view any: You know what you're worth.

- deal: Name it. → struck
- not: Not tonight. → passed

## struck
*She writes it in the ledger.*
${line}
→ end

## passed
*She shrugs.*
→ end
`;
const parse = (text: string, id = 'the-chair') => parseQuestFile(id, text, { roster: null, places: null });
const problems = (text: string, id?: string) => {
  const r = parse(text, id);
  return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
};
const A: Arrangement = { role: 'operator', tier: 1, cut: 25, nights: 1, since: 0 };

describe('the arrangement', () => {
  it('the effect line', () => {
    const r = parse(chairText());
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.outcomes.get('struck')!.effects.arrangement).toEqual({ retainer: 150, nights: 1 });
  });

  it('chair-cut: a cut and up to three nights', () => {
    const r = parse(chairText('arrangement: chair-cut 20 / 3'));
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.outcomes.get('struck')!.effects.arrangement).toEqual({ cut: 20, nights: 3 });
    expect(problems(chairText('arrangement: chair-cut 4 / 1'))).toContain('struck: arrangement: the cut is 5–50 %');
    expect(problems(chairText('arrangement: chair-cut 51 / 1'))).toContain('struck: arrangement: the cut is 5–50 %');
    expect(problems(chairText('arrangement: chair-cut 20 / 0'))).toContain('struck: arrangement: nights is 1 to 3');
    expect(problems(chairText('arrangement: chair-cut 20 / 4'))).toContain('struck: arrangement: nights is 1 to 3');
    expect(problems(chairText('arrangement: chair-cut 20 / 1', '[nix-direct, hicks]')).some((p) => /only in a quest with one contact/.test(p))).toBe(true);
  });

  it('refusals', () => {
    expect(problems(chairText('arrangement: chair 40 / 1')).length).toBeGreaterThan(0);
    expect(problems(chairText('arrangement: chair 150 / 3')).length).toBeGreaterThan(0);
    const job = JOB.replace('## paid\n*All of it.*\npay: full\ntake: full\n→ end', '## paid\n*All of it.*\npay: full\ntake: full\narrangement: chair 150 / 1\n→ end');
    expect(job).not.toBe(JOB);
    expect(problems(job, 'back-door').some((p) => /only in a quest with one contact/.test(p))).toBe(true);
    expect(problems(chairText(undefined, '[nix-direct, hicks]')).some((p) => /only in a quest with one contact/.test(p))).toBe(true);
  });

  it('active by trust', () => {
    expect(arrangementActive(A, 5)).toBe(true);
    expect(arrangementActive(A, 4)).toBe(false);
    expect(arrangementActive(null, 9)).toBe(false);
    expect(arrangementActive(A, null)).toBe(false);
  });

  it('her lines', () => {
    expect(arrangementLine({ player: 'Hicks', a: A, active: true, done: 0 })).toBe(
      "[arrangement] You sit Hicks's chair as their operator: a 25% cut of each job you're on, one job a night. Your terms: nobody from your stairs on their list; the room stays out of it; you stop when you say stop. On your shift you leave the Intake for their jobs and come back after. Tonight: 0 of 1 done.",
    );
    expect(arrangementLine({ player: 'Hicks', a: A, active: false, done: 0 })).toBe(
      "[arrangement — stepped back] You agreed to sit Hicks's chair, but you've stepped back: the trust isn't there right now. You'll say why if they ask.",
    );
    expect(arrangementLine({ player: 'Hicks', a: { ...A, nights: 2 }, active: true, done: 1 })).toContain('two jobs a night');
    expect(arrangementLine({ player: 'Hicks', a: { ...A, tier: 2, cut: 20, nights: 3 }, active: true, done: 1 })).toContain('a 20% cut of each job you\'re on, up to three jobs a night');
    expect(arrangementLine({ player: 'Hicks', a: { ...A, tier: 2, cut: 20, nights: 3 }, active: true, done: 1 })).toContain('Tonight: 1 of 3 done.');
  });

  it('parseArrangement', () => {
    expect(parseArrangement(JSON.stringify(A))).toEqual(A);
    expect(parseArrangement('{nope')).toBeNull();
    expect(parseArrangement(null)).toBeNull();
    expect(parseArrangement(JSON.stringify({ ...A, nights: 3, tier: 2 }))).toEqual({ ...A, nights: 3, tier: 2 });
    expect(parseArrangement(JSON.stringify({ ...A, nights: 4 }))).toBeNull();
  });

  it('an old retainer reads as a tier 1 cut', () => {
    expect(parseArrangement(JSON.stringify({ role: 'operator', retainer: 150, nights: 1, since: 9 }))).toEqual({ role: 'operator', tier: 1, cut: 25, nights: 1, since: 9 });
    expect([100, 150, 200, 175, 20, 900].map(retainerToCut)).toEqual([20, 25, 30, 35, 5, 50]);
  });

  it('cutOf: a share of what the job paid, to 10 sol; nothing on nothing', () => {
    expect(cutOf(160, 25)).toBe(40);
    expect(cutOf(170, 15)).toBe(30);
    expect(cutOf(0, 25)).toBe(0);
    expect(cutOf(-50, 25)).toBe(0);
  });
});

describe("Tier 2's checklist (chair tier 2 spec §1)", () => {
  type T = 'clean' | 'messy' | 'blown';
  const jobs = (...t: T[]) => t.map((tier) => ({ tier }));
  const base: Parameters<typeof chairTwoChecks>[0] = { jobs: jobs('clean', 'clean', 'messy', 'clean', 'clean', 'messy'), unpaid: false, bestRep: { district: 'karasu', rep: 45 }, trustHigh: true, shift: { open: true, from: '20:00' } };
  const of = (o: Partial<typeof base>) => chairTwoChecks({ ...base, ...o });
  const check = (o: Partial<typeof base>, id: string) => of(o).checks.find((c) => c.id === id);
  it('all five hold: ready', () => {
    expect(of({}).ready).toBe(true);
    expect(of({}).checks.map((c) => c.id)).toEqual(['jobs', 'clean', 'blown', 'paid', 'standing', 'shift']);
  });
  it('jobs: 6 with her', () => {
    expect(check({ jobs: jobs('clean', 'clean', 'clean', 'clean', 'clean') }, 'jobs')).toMatchObject({ ok: false, progress: '5/6', label: '6 JOBS WITH HER UNDER THE DEAL' });
    expect(check({}, 'jobs')).toMatchObject({ ok: true, progress: '6/6' });
    expect(of({ jobs: jobs('clean', 'clean', 'clean', 'clean', 'clean') }).ready).toBe(false);
  });
  it('clean: 4 of the last 6', () => {
    expect(check({ jobs: jobs('clean', 'messy', 'messy', 'clean', 'clean', 'messy', 'clean', 'clean') }, 'clean')).toMatchObject({ ok: false, progress: '3/6', label: '4 OF THE LAST 6 CLEAN' });
    expect(check({}, 'clean')).toMatchObject({ ok: true, progress: '4/6' });
  });
  it('blown: none in the last 3', () => {
    expect(check({ jobs: jobs('clean', 'clean', 'blown', 'clean', 'clean', 'clean') }, 'blown')!.ok).toBe(false);
    expect(check({ jobs: jobs('clean', 'clean', 'clean', 'blown', 'clean', 'clean') }, 'blown')!.ok).toBe(true);
    expect(check({}, 'blown')!.label).toBe('NO BLOWN JOB IN THE LAST 3');
  });
  it('paid, and standing', () => {
    expect(check({ unpaid: true }, 'paid')).toMatchObject({ ok: false, label: 'NEVER LEFT HER UNPAID' });
    expect(check({ bestRep: { district: 'karasu', rep: 44 } }, 'standing')).toMatchObject({ ok: false, progress: 'KNOWN IN KARASU', label: 'TRUSTED SOMEWHERE' });
    expect(check({}, 'standing')).toMatchObject({ ok: true, progress: 'TRUSTED IN KARASU' });
    expect(check({ bestRep: null }, 'standing')).toMatchObject({ ok: false, progress: 'NOBODY ANYWHERE' });
  });
  it("trust shows only when it isn't high; shift always; neither moves ready", () => {
    expect(check({}, 'trust')).toBeUndefined();
    expect(check({ trustHigh: false }, 'trust')).toMatchObject({ ok: false, label: 'HER TRUST · HIGH' });
    expect(of({ trustHigh: false }).ready).toBe(true);
    expect(check({ shift: { open: false, from: '20:00' } }, 'shift')).toMatchObject({ ok: false, label: 'HER SHIFT', progress: 'FROM 20:00' });
    expect(of({ shift: { open: false, from: '20:00' } }).ready).toBe(true);
  });
});

describe('mid-run review fixes', () => {
  it("I1: a deal can't sit on a wait's missed-it path (the wait path writes no deal)", () => {
    const text = `---
title: The Chair
with: [nix-direct]
starts: lowlight-intake
---

# offer
*She waits.*

view any: Later.

- deal: Come back at dawn. → later
- not: Not tonight. → passed

## later
*She'll think about it.*
→ dawn
wait: until 06:00 · by 12:00 else struck

## struck
*She writes it anyway.*
arrangement: chair 150 / 1
→ end

## passed
*She shrugs.*
→ end

# dawn
*Dawn.*

view any: Dawn.

- yes: Yes. → passed
- no: No. → passed
`;
    expect(problems(text).some((p) => /arrangement: can't be reached by a wait/.test(p))).toBe(true);
  });
});
