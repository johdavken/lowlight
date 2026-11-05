import { describe, expect, it } from 'vitest';
import { MISSION } from '../../shared/quests.fixture';
import { parseQuestFile, type PushState, type QuestEntry, type QuestRun } from '../../shared/quests';
import { effectEvent } from '../src/mission-run';
import { canOffer, dropTake, lossEvents, walkValue } from '../src/push-run';

const PUSH1 = `
# push-1

*The safe is open.*

- grab: Empty it. → won / lost-it [check reflex 50]
- pocket: Take one bundle. → won

## won
*Notes.*
pay: +150
→ end

## lost-it
*Caught.*
lost
→ end
`;
const known = { roster: new Set(['nix-direct', 'hicks', 'ember']), places: new Set(['haes-noodles']) };
const entry = (text: string): QuestEntry => {
  const r = parseQuestFile('night-shift', text, known);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const PUSHY = entry(`${MISSION.trimEnd()}\n${PUSH1}`);
const PLAIN = entry(MISSION);
const run = (o: Partial<QuestRun> = {}): QuestRun => ({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: false, at: 0, take: 'full', alarm: 0, kit: [], ...o });
const push = (o: Partial<PushState> = {}): PushState => ({ stage: 1, pot: 150, from: 1, outcome: 'paid', state: 'playing', log: [], ...o });

describe('push rules', () => {
  it('canOffer is false with take none, blown, alarm 3, a non-job, or no push-(stage+1); true otherwise', () => {
    expect(canOffer(PUSHY, run(), 0)).toBe(true);
    expect(canOffer(PUSHY, run({ take: 'none' }), 0)).toBe(false);
    expect(canOffer(PUSHY, run({ blown: true }), 0)).toBe(false);
    expect(canOffer(PUSHY, run({ alarm: 3 }), 0)).toBe(false);
    expect(canOffer({ ...PUSHY, kind: 'quest' }, run(), 0)).toBe(false);
    expect(canOffer(PUSHY, run(), 1)).toBe(false);
    expect(canOffer(PLAIN, run(), 0)).toBe(false);
  });

  it("walkValue sums the run's kit sol and heat", () => {
    expect(walkValue(run({ kit: [{ at: 0, sol: 300 }, { at: 1, heat: 2, district: 'karasu' }, { at: 2, sol: 150 }] }))).toEqual({ sol: 450, heat: 2 });
  });

  it('lossEvents: job sol 300 before from, pot 150 after → one event sol -(150+150)', () => {
    const r = run({ kit: [{ at: 0, sol: 300 }, { at: 1, sol: 150 }] });
    expect(lossEvents(r, push(), 5)).toEqual([{ at: 5, sol: -300 }]);
  });

  it('lossEvents: a deck given after from reverts to the deck held at from (startDeck when none before, null allowed)', () => {
    const given = { at: 1, sol: 150, deck: 'pocket-deck' };
    expect(lossEvents(run({ startDeck: 'stall-build', kit: [{ at: 0, sol: 300 }, given] }), push(), 5)[0].deck).toBe('stall-build');
    expect(lossEvents(run({ startDeck: null, kit: [{ at: 0, sol: 300 }, given] }), push(), 5)[0].deck).toBeNull();
    expect(lossEvents(run({ startDeck: null, kit: [{ at: 0, sol: 300, deck: 'deaf-meridian' }, given] }), push(), 5)[0].deck).toBe('deaf-meridian');
    // The deck the push gave leaves your owned decks too.
    expect(lossEvents(run({ startDeck: 'stall-build', kit: [{ at: 0, sol: 300 }, given] }), push(), 5)[0].lose).toEqual(['pocket-deck']);
    // A deck you owned before the push stays yours (review I1); every new one it gave goes.
    expect(lossEvents(run({ startDeck: 'stall-build', kit: [{ at: 0, sol: 300 }, given] }), { ...push(), had: ['stall-build', 'pocket-deck'] }, 5)[0]).not.toHaveProperty('lose');
    const second = { at: 2, deck: 'deaf-meridian' };
    expect(lossEvents(run({ startDeck: 'stall-build', kit: [{ at: 0, sol: 300 }, given, second] }), { ...push(), had: ['stall-build'] }, 5)[0].lose).toEqual(['pocket-deck', 'deaf-meridian']);
  });

  it('lossEvents: no deck change after from → no deck field', () => {
    const [ev] = lossEvents(run({ startDeck: 'stall-build', kit: [{ at: 0, sol: 300 }, { at: 1, sol: 150 }] }), push(), 5);
    expect('deck' in ev).toBe(false);
  });

  it('dropTake: full→part, part→none, none→none', () => {
    expect([dropTake('full'), dropTake('part'), dropTake('none')]).toEqual(['part', 'none', 'none']);
  });

  it('effectEvent adds bonus to sol', () => {
    expect(effectEvent({ bonus: 120 }, 7)).toEqual({ at: 7, sol: 120 });
  });
});
