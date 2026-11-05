import { describe, expect, it } from 'vitest';
import { MISSION, TRAIL } from './quests.fixture';
import { parseQuestFile, questOutline, QUEST_DRAFT_RULES, STOCK_GETAWAY, type QuestEntry } from './quests';

const known = { roster: new Set(['nix-direct', 'hicks', 'cass', 'ember']), places: new Set(['haes-noodles']), decks: new Set(['stall-build', 'deaf-meridian']) };

const PUSH1 = `
# push-1

*The office safe is open behind the desk.*

- grab: Empty the safe before the guard turns round. → won / lost-it [check reflex 50]
- pocket: Take one bundle and leave the rest. → won

## won
*Folded notes, a lot of them.*
pay: +150
→ end

## lost-it
*The guard turns round.*
lost
→ end
`;
const PUSH2 = `
# push-2

*A second terminal still logged in.*

- copy: Copy the payroll too. → won-2 / lost-2 [check tech 55 grid]
- photo: Photograph the screen with your deck. → won-2 / lost-2 [check wits 50]

## won-2
*The payroll copies.*
pay: +200
→ end

## lost-2
*The terminal locks and screams.*
lost
→ end
`;
const PUSHY = `${MISSION.trimEnd()}\n${PUSH1}${PUSH2}`;

const parse = (text: string) => parseQuestFile('night-shift', text, known);
const ok = (text: string): QuestEntry => {
  const r = parse(text);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const messages = (text: string) => {
  const r = parse(text);
  return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
};
const one = (text: string, want: string) => expect(messages(text).filter((m) => m.includes(want)), want).toHaveLength(1);

describe('push beats', () => {
  it('parses pay: +N as bonus and lost as lost', () => {
    const q = ok(PUSHY);
    expect(q.outcomes.get('won')!.effects.bonus).toBe(150);
    expect(q.outcomes.get('lost-it')!.effects.lost).toBe(true);
  });

  it("push beats are roots: no 'nothing leads here' problem for push-1", () => {
    expect(messages(PUSHY).filter((m) => m.includes('nothing leads here'))).toEqual([]);
  });

  it('rejects push beats outside a job', () => {
    const r = parseQuestFile('paper-trail', `${TRAIL.trimEnd()}\n${PUSH1}`, { roster: null, places: null });
    expect(r.ok ? [] : r.problems.map((p) => p.message).filter((m) => m === 'push beats go only in a job (kind: mission or contract)')).toHaveLength(1);
  });

  it('rejects a gap', () => {
    one(`${MISSION.trimEnd()}\n${PUSH2}`, 'push-2 needs push-1');
  });

  it('rejects push-4', () => {
    one(`${PUSHY.trimEnd()}\n${PUSH2.replace('# push-2', '# push-4').replaceAll('-2', '-4')}`, 'at most three push beats (push-1 to push-3)');
  });

  it('rejects a normal outcome leading to a push beat', () => {
    one(PUSHY.replace('*The guard reads the order twice and hands it back.*\n→ end', '*The guard reads the order twice and hands it back.*\n→ push-1'), "→ 'push-1': push beats are reached only by PRESS ON");
  });

  it('rejects a push outcome not ending → end', () => {
    one(PUSHY.replace('pay: +150\n→ end', 'pay: +150\n→ desk'), "a push beat's outcome ends with → end (back to the card)");
  });

  it('rejects a push check whose fail outcome lacks lost', () => {
    one(PUSHY.replace('*The guard turns round.*\nlost\n→ end', '*The guard turns round.*\n→ end'), 'choice grab: a push check fails to an outcome with lost');
  });

  it('rejects bonus or lost outside push outcomes', () => {
    one(PUSHY.replace('*The guard reads the order twice and hands it back.*\n→ end', '*The guard reads the order twice and hands it back.*\nlost\n→ end'), "pay: +N and lost go only in a push beat's outcomes");
  });

  it('rejects an outcome shared by a push beat and another beat', () => {
    one(PUSHY.replace('→ won / lost-it', '→ turned-back / lost-it'), "outcome 'turned-back' is used by a push beat and another beat");
  });

  it('questOutline marks push beats', () => {
    const marks = questOutline(ok(PUSHY)).map((b) => [b.beat, b.push]);
    expect(marks).toEqual([
      ['door', false],
      ['desk', false],
      ['push-1', true],
      ['push-2', true],
    ]);
  });

  it('QUEST_DRAFT_RULES includes the push rules', () => {
    expect(QUEST_DRAFT_RULES).toContain(
      "A job may end in up to three push beats (# push-1, # push-2, # push-3), played only when the player presses on after the take: each one's greed comes from the job's own prose, never stock loot, and each is harder than the last.",
    );
    expect(QUEST_DRAFT_RULES).toContain("A push outcome pays pay: +N (about 30–60 % of the job's pay) or gives something, and ends → end; every check in a push beat fails to an outcome marked lost (a bare line).");
  });
});

describe('# getaway (the table spec §2)', () => {
  const GETAWAY = `
# getaway
*Lights upstairs.*

- run: Go out the back. → clear / caught-out [check reflex 50]
- hide: Hide in the cold store. → clear

## clear
*Empty alley.*
→ end

## caught-out
*Against the wall.*
blown
→ end
`;
  const WITH = `${MISSION.trimEnd()}\n${GETAWAY}`;

  it('parses as a root: no "nothing leads here"', () => {
    expect(ok(WITH).beats.has('getaway')).toBe(true);
  });

  it('only in a job', () => {
    const r = parseQuestFile('paper-trail', `${TRAIL.trimEnd()}\n${GETAWAY}`, { roster: null, places: null });
    expect(r.ok ? [] : r.problems.map((p) => p.message).filter((m) => m === 'a # getaway beat goes only in a job (kind: mission or contract)')).toHaveLength(1);
  });

  it("its outcomes end the job", () => {
    one(WITH.replace('*Empty alley.*\n→ end', '*Empty alley.*\n→ desk'), "a getaway's outcome ends the job (→ end)");
  });

  it('nothing leads to it', () => {
    one(WITH.replace('*The guard reads the order twice and hands it back.*\n→ end', '*The guard reads the order twice and hands it back.*\n→ getaway'), "→ 'getaway': a getaway is reached only by a full ALARM");
  });

  it('QUEST_DRAFT_RULES say how approaches and crew calls read checks (the hand)', () => {
    const rules = QUEST_DRAFT_RULES.join('\n');
    expect(rules).toContain('QUIET is reflex and tech, SMOOTH cool and wits, HARD body');
    expect(rules).toContain("mix the stats across a job's checks");
  });

  it('QUEST_DRAFT_RULES carry the position bands and the getaway', () => {
    expect(QUEST_DRAFT_RULES).toContain("A check's number sets its position, not its odds: 55 or more is IN THE DARK, 45–54 IN THE OPEN, 44 or less ON THE WIRE; red is one shot.");
    expect(QUEST_DRAFT_RULES).toContain('A job may have a # getaway beat for when ALARM fills: its outcomes end the job (→ end) and nothing else leads to it.');
  });

  it('STOCK_GETAWAY: RUN on reflex 40 and WALK IT OFF on cool 40, made it part, missed it blown', () => {
    expect(STOCK_GETAWAY.beat.id).toBe('getaway');
    expect(STOCK_GETAWAY.beat.choices.map((c) => [c.id, c.check?.stat, c.check?.base])).toEqual([
      ['run', 'reflex', 40],
      ['walk', 'cool', 40],
    ]);
    expect(STOCK_GETAWAY.outcomes.map((o) => [o.id, o.effects.take, o.effects.blown ?? false])).toEqual([
      ['getaway-made', 'part', false],
      ['getaway-missed', 'none', true],
    ]);
  });
});
