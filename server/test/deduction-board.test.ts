import { describe, expect, it } from 'vitest';
import { parseCaseFile } from '../../shared/cases';
import { intakeRelay, OWN_TEXT, parse, questRows } from './fixtures/intake-relay';

// The board on the table (deduction board spec §3): its moves on the run, and the accusation as the verdict's outcome.
const MINI = parseCaseFile('mini', `---
title: Mini
suspects:
  - A | sdg-01 | One.
  - B | sdg-02 | Two.
answer: "A | WHO: X | HOW: Y | WHY: Z"
---
# cards
- ONE [street] HAE: First. | from: free
- TWO [said] A SAYS: Second. | from: free
- THREE [grid] THE NET: Third. | from: free
- FOUR [body] THE BODY: Fourth. | from: free
- FIVE [grid] THE BOOK: Fifth. | from: roll:book | missed: Job 1: the crack failed.
# deductions
- X → WHO: x holds.
- Y → HOW: y holds.
- Z → WHY: z holds.
# clashes
- ONE × TWO → X
- ONE × THREE → Y
- ONE × FOUR → Z
- ONE × FIVE → Z
# near misses
- TWO × THREE: Close, but no.
`, { extras: null });
if (!MINI.ok) throw new Error(JSON.stringify(MINI.problems));
const CASE = MINI.entry;
const FRONT = OWN_TEXT.slice(0, OWN_TEXT.indexOf('\n---\n') + 5);
const BODY = `
# look
*You look around.*

- look: Look around. → found
- stare: Stare at the wall. → found

## found
*Cards.*
gives: clue mini ONE
gives: clue mini TWO
gives: clue mini THREE
gives: clue mini FOUR
→ wall

# wall
board: mini

*The wall.*

## holds
*It holds.*
take: full
→ end

## thin
*Thin.*
take: part
→ end

## hunch
*A hunch.*
take: part
→ end

## wrong-b
*Wrong.*
take: none
→ end
`;
const JOB = parse(FRONT + BODY, 'held-papers');

async function atWall() {
  const t = intakeRelay({ book: [JOB] });
  t.relay['deps'].quests!.cases = () => [CASE];
  await t.relay.startQuest('hicks', 'held-papers');
  await t.relay.chooseQuest('hicks', { id: 'held-papers', beat: 'look', choice: 'look' });
  const move = (m: Parameters<typeof t.relay.boardMove>[1]['move']) => t.relay.boardMove('hicks', { id: 'held-papers', move: m });
  return { ...t, move };
}

describe('the deduction board on the table', () => {
  it('the board beat shows the board, with the cards the kit holds', async () => {
    const t = await atWall();
    const a = t.relay.questState('hicks').active!;
    expect(a.beat).toBe('wall');
    expect(a.board!.hand.map((c) => c.id)).toEqual(['ONE', 'TWO', 'THREE', 'FOUR']);
    expect(a.board!.missing).toEqual([{ source: 'THE BOOK', missed: 'Job 1: the crack failed.' }]);
    expect(a.choices).toEqual([]);
  });
  it('a pair move saves the board on the run and says its line as a notice, with no model call', async () => {
    const t = await atWall();
    const calls = t.backend.reqs.length;
    expect(await t.move({ kind: 'pair', a: 'TWO', b: 'ONE' })).toMatchObject({ ok: true });
    expect(t.run()!.board).toMatchObject({ filed: ['X'], patience: 3 });
    expect(t.events.some((e) => e.type === 'notice' && e.text === 'x holds.')).toBe(true);
    expect(t.backend.reqs.length).toBe(calls);
  });
  it('a repeated pair costs nothing the second time', async () => {
    const t = await atWall();
    await t.move({ kind: 'pair', a: 'TWO', b: 'THREE' });
    await t.move({ kind: 'pair', a: 'THREE', b: 'TWO' });
    expect(t.run()!.board!.patience).toBe(2);
  });
  it('a card not held is refused', async () => {
    const t = await atWall();
    expect(await t.move({ kind: 'pair', a: 'ONE', b: 'FIVE' })).toMatch(/FIVE/);
  });
  it('accuse plays the verdict\'s outcome as a row and sets case.<id>', async () => {
    const t = await atWall();
    for (const b of ['TWO', 'THREE', 'FOUR']) await t.move({ kind: 'pair', a: 'ONE', b });
    for (const [d, b] of [['X', 'WHO'], ['Y', 'HOW'], ['Z', 'WHY']] as const) await t.move({ kind: 'file', deduction: d, blank: b });
    await t.move({ kind: 'name', suspect: 'A' });
    expect(await t.move({ kind: 'accuse' })).toMatchObject({ ok: true });
    const last = questRows(t.db).at(-1)!;
    expect(last.text).toContain('You name A.');
    expect(t.run()!.flags['case.mini']).toBe('holds');
    expect(t.run()!.done).toBe(true);
  });
  it('a repeated accuse after the run moved on is refused, no second row (Review Focus 1)', async () => {
    const t = await atWall();
    for (const [a, b] of [['TWO', 'THREE'], ['THREE', 'FOUR'], ['TWO', 'FOUR']]) await t.move({ kind: 'pair', a, b });
    await t.move({ kind: 'name', suspect: 'B' });
    expect(await t.move({ kind: 'accuse' })).toMatchObject({ ok: true });
    const rows = questRows(t.db).length;
    expect(typeof (await t.move({ kind: 'accuse' }))).toBe('string');
    expect(questRows(t.db).length).toBe(rows);
    expect(t.run()!.flags['case.mini']).toBe('wrong-b');
  });
  it('a rewind past the board restores it as it was (Review Focus 5)', async () => {
    const t = await atWall();
    const wallRow = questRows(t.db).at(-1)!;
    await t.move({ kind: 'pair', a: 'TWO', b: 'ONE' });
    expect(t.run()!.board!.filed).toEqual(['X']);
    const before = questRows(t.db).at(-2)!;
    await t.relay.rewind('hicks', before.id);
    expect(t.run()?.beat).not.toBe('wall');
    expect(t.run()?.board).toBeUndefined();
    expect(wallRow.id).not.toBe(before.id);
  });
});

// Final review (2026-11-09).
describe('the board, reviewed', () => {
  it('a losing verdict with cover held parks on the cover cards, not the board (Critical 1)', async () => {
    const t = intakeRelay({ book: [parse((FRONT + BODY).replace('trust: 1 / 1\n', ''), 'held-papers')], burner: 1 });
    t.relay['deps'].quests!.cases = () => [CASE];
    await t.relay.startQuest('hicks', 'held-papers');
    await t.relay.chooseQuest('hicks', { id: 'held-papers', beat: 'look', choice: 'look' });
    const move = (m: Parameters<typeof t.relay.boardMove>[1]['move']) => t.relay.boardMove('hicks', { id: 'held-papers', move: m });
    for (const [a, b] of [['TWO', 'THREE'], ['THREE', 'FOUR'], ['TWO', 'FOUR']]) await move({ kind: 'pair', a, b });
    await move({ kind: 'name', suspect: 'B' });
    await move({ kind: 'accuse' });
    expect(t.run()!.pendingCover).toBeDefined();
    const a = t.relay.questState('hicks').active!;
    expect(a.board).toBeUndefined();
    expect(a.choices.map((c) => c.id)).toContain('!burner');
    expect(typeof (await move({ kind: 'accuse' }))).toBe('string');
  });
  it('a verdict that holds fills TAKE, so take: full stands (Important 2)', async () => {
    const t = await atWall();
    for (const b of ['TWO', 'THREE', 'FOUR']) await t.move({ kind: 'pair', a: 'ONE', b });
    for (const [d, b] of [['X', 'WHO'], ['Y', 'HOW'], ['Z', 'WHY']] as const) await t.move({ kind: 'file', deduction: d, blank: b });
    await t.move({ kind: 'name', suspect: 'A' });
    await t.move({ kind: 'accuse' });
    expect(questRows(t.db).at(-1)!.quest!.debrief!.tier).toBe('clean');
  });
});

describe('the accusation line (live check)', () => {
  it("a name that ends in a period doesn't get a second one", async () => {
    const { nameLine } = await import('../src/job-runner');
    expect(nameLine('K.')).toBe('You name K.');
    expect(nameLine('DR. PENN')).toBe('You name DR. PENN.');
    expect(nameLine(null)).toBe('You name nobody.');
  });
});

describe('a verdict that leads on (The Fourteenth plan, Task 1)', () => {
  it('a verdict whose outcome leads on to a beat plays on into it', async () => {
    const body = BODY.replace("## holds\n*It holds.*\ntake: full\n→ end", "## holds\n*It holds.*\n→ next\n\n# next\n*After.*\n\n- go: Go. → gone / gone [check cool 50]\n- stay: Stay. → gone\n\n## gone\n*Gone.*\ntake: full\n→ end");
    expect(body).not.toBe(BODY);
    const t = intakeRelay({ book: [parse(FRONT + body, 'held-papers')], rolls: [66] });
    t.relay['deps'].quests!.cases = () => [CASE];
    await t.relay.startQuest('hicks', 'held-papers');
    await t.relay.chooseQuest('hicks', { id: 'held-papers', beat: 'look', choice: 'look' });
    const move = (m: Parameters<typeof t.relay.boardMove>[1]['move']) => t.relay.boardMove('hicks', { id: 'held-papers', move: m });
    for (const b of ['TWO', 'THREE', 'FOUR']) await move({ kind: 'pair', a: 'ONE', b });
    for (const [d, b] of [['X', 'WHO'], ['Y', 'HOW'], ['Z', 'WHY']] as const) await move({ kind: 'file', deduction: d, blank: b });
    await move({ kind: 'name', suspect: 'A' });
    expect(await move({ kind: 'accuse' })).toMatchObject({ ok: true });
    expect(t.run()!.flags['case.mini']).toBe('holds');
    expect(t.run()!.beat).toBe('next');
    expect(t.run()!.done).toBe(false);
    await t.relay.chooseQuest('hicks', { id: 'held-papers', beat: 'next', choice: 'go' });
    expect(t.run()!.beat).not.toBe('next');
  });
});

describe("the case's barks (The Fourteenth voice script)", () => {
  it('the board view carries the clips the case has, by group', async () => {
    const t = await atWall();
    t.relay['deps'].quests!.caseBarks = (id: string): Record<string, string[]> => (id === 'mini' ? { bounce1: ['/api/cases/voice/mini/bounce1-a.ogg'] } : {});
    expect(t.relay.questState('hicks').active!.board!.barks).toEqual({ clips: { bounce1: ['/api/cases/voice/mini/bounce1-a.ogg'] }, on: {} });
  });
});
