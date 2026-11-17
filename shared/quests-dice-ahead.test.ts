import { describe, expect, it } from 'vitest';
import { diceAhead, parseQuestFile, type QuestEntry } from './quests';

/** A job whose last stretch has only a crack and a no-roll pick: NEXT ROLL costs have nothing to land on there. */
const JOB = `---
title: Dice Ahead
kind: mission
tier: 1
starts: lowlight-intake
after: null
pitch: A test job.
pay: 90-110
---

# door

*A door.*

- talk: Talk past it. → in / seen [check cool 50]
- slip: Slip past it. → in / seen [check reflex 50]

## in
*In.*
→ desk

## seen
*Seen.*
→ desk

# desk

*A desk with a terminal.*

- crack: Crack it. → cracked / locked [crack 6]
- walk: Walk on. → onward

## cracked
*Open.*
→ out

## onward
*On.*
→ out

## locked
*Locked out, and the only way left is the back stair.*
→ stair

# out

*The street.*

- run: Run for it. → home / caught [check reflex 50]
- walk: Walk out. → home / caught [check cool 50]

## home
*Home.*
pay: full
→ end

## caught
*Caught.*
take: none
→ end

# stair

*A back stair with a keypad.*

- pad: Crack the keypad. → home / caught [crack 6]
- wait: Wait it out. → home
`;

const job = (): QuestEntry => {
  const r = parseQuestFile('dice-ahead', JOB, { roster: null, places: null });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};

describe('a dice roll ahead (NEXT ROLL costs, 2026-11-08)', () => {
  it('sees a check past a crack and a no-roll pick', () => {
    expect(diceAhead(job(), 'in')).toBe(true);
    expect(diceAhead(job(), 'cracked')).toBe(true);
  });
  it('finds none at the end, or where only cracks are left', () => {
    expect(diceAhead(job(), 'home')).toBe(false);
    expect(diceAhead(job(), 'locked')).toBe(false);
    expect(diceAhead(job(), undefined)).toBe(false);
  });
});
