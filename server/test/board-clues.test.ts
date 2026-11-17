import { describe, expect, it } from 'vitest';
import { parseCaseFile } from '../../shared/cases';
import { intakeRelay, OWN_TEXT, parse, play, questRows } from './fixtures/intake-relay';
import { TAKE } from '../src/mission-run';

// The deduction board (spec 2026-11-09 §2): an ending gives clue cards into the kit, and the debrief names them.
const CASE = parseCaseFile('mini', `---
title: Mini
suspects:
  - A | sdg-01 | One.
  - B | sdg-02 | Two.
answer: "A | WHO: X | HOW: Y | WHY: Z"
---
# cards
- ONE [street] HAE: First. | from: free
- TWO [said] K. SAYS: Second. | from: free
- THREE [grid] THE NET: Third. | from: free
- FOUR [body] THE BODY: Fourth. | from: free
# deductions
- X → WHO: x
- Y → HOW: y
- Z → WHY: z
# clashes
- ONE × TWO → X
- ONE × THREE → Y
- ONE × FOUR → Z
`, { extras: null });
if (!CASE.ok) throw new Error(JSON.stringify(CASE.problems));
const GIVING = parse(OWN_TEXT.replace(/(## paid\n\*[^\n]*\n)/, '$1gives: clue mini ONE\ngives: clue mini TWO\n'), 'held-papers');

describe('clue cards from an ending', () => {
  it('an ending that gives clues writes them to the kit and shows a CLUE line per card on the debrief', async () => {
    const r = intakeRelay({ book: [GIVING], rolls: [66] });
    r.relay['deps'].quests!.cases = () => [CASE.entry];
    const row = await play(r, 'clean');
    expect(row.quest!.debrief!.clues).toEqual(['CLUE · HAE', 'CLUE · K. SAYS']);
    expect(r.kit().clues).toEqual(['mini/ONE', 'mini/TWO']);
  });
});

describe('a clue outlives a blow-up (The Fourteenth plan, Task 1)', () => {
  it('a clue given on an early beat stays in the kit when the job blows on its last', async () => {
    const text = OWN_TEXT.replace("## inside\n*You're in.*\n", "## inside\n*You're in.*\ngives: clue mini ONE\n").replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / turned [check reflex 50]');
    expect(text).toContain('gives: clue mini ONE');
    expect(text).toContain('paid / turned');
    const r = intakeRelay({ book: [parse(text, 'held-papers')], rolls: [2] });
    r.relay['deps'].quests!.cases = () => [CASE.entry];
    await r.relay.startQuest('hicks', 'held-papers');
    const go = (beat: string, choice: string) => r.relay.chooseQuest('hicks', { id: 'held-papers', beat, choice });
    await go(r.run()!.beat!, 'wait');
    await go('desk', 'grab');
    if (r.run()!.pending) await go(r.run()!.beat!, TAKE);
    if (r.run()!.pendingCover) await go(r.run()!.beat!, TAKE);
    expect(r.run()!.done).toBe(true);
    expect(r.run()!.blown).toBe(true);
    expect(r.kit().clues).toContain('mini/ONE');
  });
});

describe('an [unheard] pick (The Fourteenth final review, Critical 1)', () => {
  it('a pick on an unheard card into a beat away leaves its line out of what she heard', async () => {
    const text = OWN_TEXT.replaceAll('- wait: Wait for the shift change. → inside [clock +1h]', '- wait: Wait for the shift change. → inside [clock +1h, unheard]').replace('# desk\n', '# desk\nroom: karasu/the-tilt\n');
    expect(text).toContain('unheard]');
    expect(text).toContain('room: karasu/the-tilt');
    const r = intakeRelay({ book: [parse(text, 'held-papers')], rolls: [66] });
    await r.relay.startQuest('hicks', 'held-papers');
    await r.relay.chooseQuest('hicks', { id: 'held-papers', beat: r.run()!.beat!, choice: 'wait' });
    const row = questRows(r.db).at(-1)!;
    expect(row.quest!.heard).toBeDefined();
    expect(row.quest!.heard).not.toContain('shift change');
    expect(row.text).toContain('shift change');
  });
});

describe('a later job sees an earlier job\'s story flags (playtest 2026-11-10)', () => {
  it("job B's opening variant reads a flag job A set with [set …]", async () => {
    const a = parse(OWN_TEXT.replaceAll('→ inside [clock +1h]', '→ inside [clock +1h, set arc=yes]'), 'held-papers');
    const bText = OWN_TEXT.replace('title: Held Papers', 'title: Second Act').replace('# door if complication=caper-watching', '# door if arc=yes');
    expect(bText).toContain('# door if arc=yes');
    const b = parse(bText, 'second-act');
    const r = intakeRelay({ book: [a, b], rolls: [66, 66] });
    await r.relay.startQuest('hicks', 'held-papers');
    const go = (id: string, beat: string, choice: string) => r.relay.chooseQuest('hicks', { id, beat, choice });
    await go('held-papers', r.run()!.beat!, 'wait');
    await go('held-papers', 'desk', 'skim');
    if (r.run()!.pending) await go('held-papers', r.run()!.beat!, TAKE);
    expect(r.run()!.done).toBe(true);
    expect(r.run()!.flags.arc).toBe('yes');
    await r.relay.startQuest('hicks', 'second-act');
    const row = questRows(r.db).at(-1)!;
    expect(row.text).toContain("someone across the street who isn't eating");
  });
});

describe("the closing turn's view is the variant that played (playtest 2026-11-10: Quiet's ending said he read her book)", () => {
  it('a job that ends on the plain version of a beat closes on that version\'s view, not the first one\'s', async () => {
    const text = OWN_TEXT.replace('# desk\n', "# desk if arc=yes\n*The ledger, again.*\n\nview nix-direct: ARC VIEW: you know what he did.\n\n- grab: Take it all. → paid / part [check reflex 50]\n- skim: Take what fits in a pocket. → part\n\n# desk\nview nix-direct: PLAIN VIEW: he did it straight.\n");
    expect(text).toContain('# desk if arc=yes');
    const r = intakeRelay({ book: [parse(text, 'held-papers')], rolls: [66] });
    await play(r, 'clean');
    const last = JSON.stringify(r.backend.reqs.at(-1)!.messages);
    expect(last).toContain('PLAIN VIEW');
    expect(last).not.toContain('ARC VIEW');
  });
});
