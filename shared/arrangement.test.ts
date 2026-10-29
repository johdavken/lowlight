import { describe, expect, it } from 'vitest';
import { arrangementActive, arrangementLine, parseArrangement, type Arrangement } from './arrangement';
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
const A: Arrangement = { role: 'operator', retainer: 150, nights: 1, since: 0 };

describe('the arrangement', () => {
  it('the effect line', () => {
    const r = parse(chairText());
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.outcomes.get('struck')!.effects.arrangement).toEqual({ retainer: 150, nights: 1 });
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
      "[arrangement] You sit Hicks's chair as their operator: 150 a night, one job a night. Your terms: nobody from your stairs on their list; the room stays out of it; you stop when you say stop. On your shift you leave the Intake for their jobs and come back after. Tonight: 0 of 1 done.",
    );
    expect(arrangementLine({ player: 'Hicks', a: A, active: false, done: 0 })).toBe(
      "[arrangement — stepped back] You agreed to sit Hicks's chair, but you've stepped back: the trust isn't there right now. You'll say why if they ask.",
    );
    expect(arrangementLine({ player: 'Hicks', a: { ...A, nights: 2 }, active: true, done: 1 })).toContain('two jobs a night');
  });

  it('parseArrangement', () => {
    expect(parseArrangement(JSON.stringify(A))).toEqual(A);
    expect(parseArrangement('{nope')).toBeNull();
    expect(parseArrangement(null)).toBeNull();
    expect(parseArrangement(JSON.stringify({ ...A, nights: 3 }))).toBeNull();
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
