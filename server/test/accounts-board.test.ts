import { describe, expect, it } from 'vitest';
import { parseAccountsFile } from '../../shared/accounts';

import { intakeRelay, OWN_TEXT, parse, questRows } from './fixtures/intake-relay';

// Two Stories on the table (spec 2026-11-10 §3): the board on the run, its moves, and TELL into `## told`.
const STORY = parseAccountsFile('mini-story', `---
title: Mini Story
quest: held-papers
patience: adebayo 2, rue 1
leaks: rue → adebayo
---
# cards
- KESTREL [cover] KESTREL: The desk all night. | fills: WHERE | from: free
- POST [street] THE NIGHT: The post. | fills: WHERE | from: free
- FILE [notebook] HER FILE: Her file. | fills: TAKE | from: free
- CREW [street] THE CREW: Three of them. | fills: HELP | from: free
- BRANCH [said] THE BRANCH: Case officer. | fills: WHO | from: free
- ARREARS [notebook] THE OFFER: A charge. | fills: OFFER | from: free
- KADEQ [notebook] THE LAST ONE: He's in the Q. | fills: LAST | from: free
- UNLUCKY [cover] UNLUCKY: He got unlucky. | fills: LAST | from: free
- DESK [grid] THE NIGHT DESK: Your badge at 02:14. | from: given
- NAMED [said] HIS NAME: You said his name. | from: free
# adebayo
asks: WHERE | WHERE WERE YOU · TAKE | WHAT DID YOU TAKE · HELP | WHO HELPED
- knows DESK
# rue
asks: WHO | WHO YOU ARE · OFFER | WHAT'S THE OFFER · LAST | THE LAST ONE
- knows NAMED
# clashes
- KESTREL × DESK: "The desk had your badge."
- UNLUCKY × NAMED: "Unlucky?"
`, { roster: null });
if (!STORY.ok) throw new Error(JSON.stringify(STORY.problems));
const FILE = STORY.entry;

const FRONT = OWN_TEXT.slice(0, OWN_TEXT.indexOf('\n---\n') + 5);
const BODY = `
# look
*You look around.*

- look: Look around. → found
- stare: Stare at the wall. → found

## found
*Cards.*
gives: clue mini-story DESK
→ talk

# talk
accounts: mini-story

*Two of them want to know.*

## told
*It's told.*
take: full
→ end
`;
const JOB = parse(FRONT + BODY, 'held-papers');

async function atTalk() {
  const t = intakeRelay({ book: [JOB] });
  t.relay['deps'].quests!.accounts = () => [FILE];
  await t.relay.startQuest('hicks', 'held-papers');
  await t.relay.chooseQuest('hicks', { id: 'held-papers', beat: 'look', choice: 'look' });
  const move = (m: Parameters<typeof t.relay.accountsMove>[1]['move']) => t.relay.accountsMove('hicks', { id: 'held-papers', move: m });
  return { ...t, move };
}
const HONEST = [
  { kind: 'place', card: 'POST', listener: 'adebayo', blank: 'WHERE' },
  { kind: 'place', card: 'FILE', listener: 'adebayo', blank: 'TAKE' },
  { kind: 'place', card: 'CREW', listener: 'adebayo', blank: 'HELP' },
  { kind: 'place', card: 'BRANCH', listener: 'rue', blank: 'WHO' },
  { kind: 'place', card: 'ARREARS', listener: 'rue', blank: 'OFFER' },
  { kind: 'place', card: 'KADEQ', listener: 'rue', blank: 'LAST' },
] as const;

describe('the accounts board on the table', () => {
  it('the view comes up on an accounts beat, with DESK held by adebayo and face down', async () => {
    const t = await atTalk();
    const a = t.relay.questState('hicks').active!;
    expect(a.beat).toBe('talk');
    expect(a.choices).toEqual([]);
    expect(a.accounts!.listeners[0].holds).toEqual([{ source: 'THE NIGHT DESK' }]);
    expect(a.accounts!.hand.map((c) => c.id)).toContain('KESTREL');
  });
  it('a press says its line as a quest notice and saves the board; no row, no model call', async () => {
    const t = await atTalk();
    const calls = t.backend.reqs.length;
    const rows = questRows(t.db).length;
    expect(await t.move({ kind: 'place', card: 'KESTREL', listener: 'adebayo', blank: 'WHERE' })).toMatchObject({ ok: true });
    expect(t.run()!.accounts).toMatchObject({ patience: { adebayo: 1 }, marked: ['KESTREL'] });
    expect(t.events.some((e) => e.type === 'notice' && e.text === 'The desk had your badge.' && e.by === 'adebayo')).toBe(true);
    expect(t.backend.reqs.length).toBe(calls);
    expect(questRows(t.db).length).toBe(rows);
  });
  it("a card the kit doesn't hold is refused", async () => {
    const t = await atTalk();
    expect(await t.move({ kind: 'place', card: 'GHOST', listener: 'adebayo', blank: 'WHERE' })).toMatch(/GHOST/);
  });
  it('TELL sets the story flags and lands on told', async () => {
    const t = await atTalk();
    for (const m of HONEST) await t.move(m);
    expect(await t.move({ kind: 'tell' })).toMatchObject({ ok: true });
    const r = t.run()!;
    expect(r.flags).toMatchObject({ 'story.adebayo': 'held', 'story.rue': 'held', 'story.rue-true': 'yes' });
    expect(r.done).toBe(true);
    expect(questRows(t.db).at(-1)!.text).toContain('You tell it.');
  });
  it("a second tell after the run moved on is 'that choice has passed', with no second row", async () => {
    const t = await atTalk();
    for (const m of HONEST) await t.move(m);
    await t.move({ kind: 'tell' });
    const rows = questRows(t.db).length;
    expect(await t.move({ kind: 'tell' })).toBe('that choice has passed');
    expect(questRows(t.db).length).toBe(rows);
  });
  it('a rewind restores the board as it was', async () => {
    const t = await atTalk();
    const before = questRows(t.db).at(-2)!;
    await t.move({ kind: 'place', card: 'POST', listener: 'adebayo', blank: 'WHERE' });
    expect(t.run()!.accounts!.placed.adebayo).toEqual({ WHERE: 'POST' });
    await t.relay.rewind('hicks', before.id);
    expect(t.run()?.accounts).toBeUndefined();
  });
  it('an old run with no accounts gets a fresh board', async () => {
    const t = await atTalk();
    const r = t.run()!;
    expect(r.accounts).toBeUndefined();
    expect(t.relay.questState('hicks').active!.accounts!.listeners.map((l) => l.patience)).toEqual([2, 1]);
  });
  it('the debrief lists no CLUE line for an accounts card', async () => {
    const t = await atTalk();
    for (const m of HONEST) await t.move(m);
    await t.move({ kind: 'tell' });
    expect(questRows(t.db).at(-1)!.quest!.debrief!.clues).toBeUndefined();
  });
  it("the beat's prompt block says they're working out what to say, and offers no choices", async () => {
    const t = await atTalk();
    await t.relay.send('hicks', 'What do I tell them?');
    const sys = JSON.stringify(t.backend.reqs.at(-1));
    expect(sys).toContain('is working out what to say about that night');
    expect(sys).not.toContain('The choices in front of them');
  });
});


describe('a later job sees the accounts board (Two Stories, after the arc-flags merge)', () => {
  it("the next act's opening reads the board's verdict and the flag a told card cost", async () => {
    const file = structuredClone(FILE);
    file.listeners.find((l) => l.id === 'rue')!.costs.set('KADEQ', { flag: 'kade', value: 'told' });
    const bText = OWN_TEXT.replace('title: Held Papers', 'title: Second Act').replace('# door if complication=caper-watching', '# door if kade=told and story.rue=held');
    expect(bText).toContain('# door if kade=told and story.rue=held');
    const t = intakeRelay({ book: [JOB, parse(bText, 'second-act')] });
    t.relay['deps'].quests!.accounts = () => [file];
    await t.relay.startQuest('hicks', 'held-papers');
    await t.relay.chooseQuest('hicks', { id: 'held-papers', beat: 'look', choice: 'look' });
    for (const m of HONEST) await t.relay.accountsMove('hicks', { id: 'held-papers', move: m });
    await t.relay.accountsMove('hicks', { id: 'held-papers', move: { kind: 'tell' } });
    expect(t.run()!.flags).toMatchObject({ kade: 'told', 'story.rue': 'held' });
    await t.relay.startQuest('hicks', 'second-act');
    expect(questRows(t.db).at(-1)!.text).toContain("someone across the street who isn't eating");
  });
});
