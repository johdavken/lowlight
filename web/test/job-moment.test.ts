import { describe, expect, it } from 'vitest';
import { checkToPlay, parkedLine } from '../src/room/job-moment';
import type { ChatMessage, QuestState } from '../../shared/types';

type Active = NonNullable<QuestState['active']>;
const job = (o: Partial<Active> = {}): Active => ({
  id: 'back-door',
  title: 'Back Door',
  beat: 'door',
  alarm: 0,
  nerve: { left: 2, max: 5 },
  heat: 0,
  pay: [350, 450],
  choices: [{ id: 'talk', line: 'Talk.', pool: { stat: 'COOL', base: 3, dice: 3, parts: [], position: 'open', noDeck: false } }],
  ...o,
});
const costCards = [{ id: '!steady', line: 'STEADY (2 NERVE)' }, { id: '!take', line: 'TAKE IT' }];
const dice = (faces: number[], kind: 'crit' | 'clean' | 'cost' | 'miss') => ({ stat: 'COOL', dice: faces.length, position: 'open' as const, faces, keep: 'high' as const, kind, pass: kind !== 'miss' });
const row = (roll: object, text = 'You talk.'): ChatMessage => ({
  id: 'r1',
  role: 'user',
  mode: 'quest',
  text,
  toolLines: [],
  ts: 1,
  status: 'ok',
  quest: { id: 'back-door', title: 'Back Door', beat: 'desk', pick: { choice: 'talk', line: 'You talk.', roll: roll as never } },
});

describe('checkToPlay (the table: dice)', () => {
  it('a roll that lands plays its faces on its card', () => {
    const r = checkToPlay(job(), job({ beat: 'desk' }), row(dice([6, 3, 1], 'clean')), null);
    expect(r.play).toEqual({ card: 'talk', faces: [6, 3, 1], keep: 'high', kind: 'clean', red: false, deckDied: false, parked: false, line: 'THROUGH · +2 TAKE' });
    expect(r.shown).toBeNull();
  });

  it('a costly roll that parks plays on its card once; STEADY or TAKE IT resolving it plays nothing more', () => {
    const parked = checkToPlay(job(), job({ choices: costCards, rolled: { choice: 'talk', faces: [5, 2, 1], keep: 'high', kind: 'cost' } }), undefined, null);
    expect(parked.play).toMatchObject({ card: 'talk', faces: [5, 2, 1], kind: 'cost', parked: true });
    expect(parked.shown).toEqual({ choice: 'talk' });
    const again = checkToPlay(job({ choices: costCards }), job({ choices: costCards, rolled: { choice: 'talk', faces: [5, 2, 1], keep: 'high', kind: 'cost' } }), undefined, parked.shown);
    expect(again.play).toBeNull();
    const done = checkToPlay(job({ choices: costCards }), job({ beat: 'desk' }), row({ ...dice([5, 2, 1], 'cost'), steadied: true }), parked.shown);
    expect(done.play).toBeNull();
    expect(done.shown).toBeNull();
  });

  it('a trade\'s ALARM −1 reads as one', () => expect(parkedLine({ kind: 'clean', cost: { alarm: -1, heat: 0 } })).toContain('ALARM −1'));

  it('a gamble glitches the parked roll to what it became, its die in the line', () => {
    const cost = { choice: 'talk', faces: [5, 2, 1], keep: 'high' as const, kind: 'cost' as const, cost: { alarm: 0, heat: 0 } };
    const won = { ...cost, faces: [6, 2, 1], kind: 'clean' as const, gamble: { die: 5, from: 'cost' as const } };
    const r = checkToPlay(job({ choices: costCards, rolled: cost }), job({ choices: costCards, rolled: won }), undefined, { choice: 'talk' });
    expect(r.save).toMatchObject({ to: [6, 2, 1], keep: 'high', kind: 'clean' });
    expect(r.save!.line).toContain('GAMBLE 5');
    expect(checkToPlay(job({ choices: costCards, rolled: won }), job({ choices: costCards, rolled: won }), undefined, { choice: 'talk' }).save).toBeUndefined();
    // A lost gamble stays what it was: nothing to glitch, the die in the line.
    const lost = { ...cost, gamble: { die: 2, from: 'cost' as const } };
    expect(checkToPlay(job({ choices: costCards, rolled: cost }), job({ choices: costCards, rolled: lost }), undefined, { choice: 'talk' }).save).toBeUndefined();
    expect(parkedLine(lost)).toContain('GAMBLE 2');
  });

  it('a save on the parked miss glitches it once, to its new faces', () => {
    const miss = { choice: 'talk', faces: [3, 2, 1], keep: 'high' as const, kind: 'miss' as const };
    const saved = { ...miss, faces: [5, 2, 1], kind: 'cost' as const, cost: { alarm: 1, heat: 0 }, saved: true as const };
    const r = checkToPlay(job({ choices: costCards, rolled: miss }), job({ choices: costCards, rolled: saved }), undefined, { choice: 'talk' });
    expect(r.play).toBeNull();
    // It scrambles to the cost's line: what the save bought.
    expect(r.save).toEqual({ to: [5, 2, 1], keep: 'high', line: 'THROUGH · +1 TAKE · ALARM +1' });
    const again = checkToPlay(job({ choices: costCards, rolled: saved }), job({ choices: costCards, rolled: saved }), undefined, { choice: 'talk' });
    expect(again.save).toBeUndefined();
    // Parked before this tab loaded (nothing shown here yet): still a save, and the roll doesn't play again.
    const reload = checkToPlay(job({ choices: costCards, rolled: miss }), job({ choices: costCards, rolled: saved }), undefined, null);
    expect(reload.play).toBeNull();
    expect(reload.save).toEqual({ to: [5, 2, 1], keep: 'high', line: 'THROUGH · +1 TAKE · ALARM +1' });
    expect(reload.shown).toEqual({ choice: 'talk' });
  });

  it('the line under the stamp: a parked roll reads the cost the server holds; a landed one its own record', () => {
    const parked = checkToPlay(job(), job({ choices: costCards, rolled: { choice: 'talk', faces: [3, 2, 1], keep: 'high', kind: 'miss', cost: { alarm: 2, heat: 1 } } }), undefined, null);
    expect(parked.play?.line).toBe('FAILED · ALARM +2 · HEAT +1');
    // An older server sends no cost: no line.
    expect(checkToPlay(job(), job({ choices: costCards, rolled: { choice: 'talk', faces: [3, 2, 1], keep: 'high', kind: 'miss' } }), undefined, null).play?.line).toBeNull();
    // Landed: in the open a miss is ALARM +1 and heat +1; STEADY cancels both; an outclassed deck adds 1 to a miss's ALARM; a hidden deck has no heat.
    const landed = (roll: object) => checkToPlay(job(), job({ beat: 'desk' }), row(roll), null).play?.line;
    expect(landed(dice([3, 2, 1], 'miss'))).toBe('FAILED · ALARM +1 · HEAT +1');
    expect(landed({ ...dice([5, 2, 1], 'cost'), steadied: true })).toBe('THROUGH · +1 TAKE');
    expect(landed({ ...dice([3, 2, 1], 'miss'), deck: 'outclassed', hidden: true })).toBe('FAILED · ALARM +2');
    expect(landed({ ...dice([5, 2, 1], 'cost'), deck: 'held' })).toBe('THROUGH · +1 TAKE');
    // A dealt roll's line (roll lifecycle spec §1.5) counts only the costs it took.
    expect(landed({ ...dice([3, 2, 1], 'miss'), costs: [{ cost: 'alarm', how: 'taken', line: 'x' }, { cost: 'heat', how: 'resisted', line: 'y' }] })).toBe('FAILED · ALARM +1');
    // Effect (effect and NERVE spec §3): a BIG 6 fills 3; a SMALL 4–5 fills nothing, so no TAKE word.
    expect(landed({ ...dice([6, 2, 1], 'clean'), effect: 'big' })).toBe('THROUGH · +3 TAKE');
    expect(landed({ ...dice([5, 2, 1], 'cost'), effect: 'small' })).toBe('THROUGH · ALARM +1');
    expect(checkToPlay(job(), job({ choices: costCards, rolled: { choice: 'talk', faces: [5, 2, 1], keep: 'high', kind: 'cost', cost: { alarm: 1, heat: 1 }, effect: 'big' } }), undefined, null).play?.line).toBe('THROUGH · +2 TAKE · ALARM +1 · HEAT +1');
  });

  it('a pick that blows the job plays its roll on the way to the cover cards; the row after the cover card plays nothing', () => {
    const blown = {
      text: 'You talk.\n\n*COOL 3d · IN THE OPEN — 2, no.*\n\n*He turns you round.*',
      pick: { choice: 'talk', line: 'You talk.', roll: dice([2, 1, 1], 'miss') },
      debrief: { tier: 'blown' as const, checks: [], sol: 0, heat: { district: 'karasu', delta: 1 }, rep: { district: 'karasu', before: 30, after: 18 } },
    };
    const r = checkToPlay(job(), job({ choices: [{ id: '!burner', line: 'USE BURNER' }, { id: '!take', line: 'TAKE IT' }], blown }), undefined, null);
    expect(r.play).toMatchObject({ card: 'talk', faces: [2, 1, 1], kind: 'miss' });
    expect(r.blown).toBe(true);
    const again = checkToPlay(job({ blown }), job({ blown }), undefined, r.shown);
    expect(again).toEqual({ play: null, shown: r.shown, blown: false });
    const after = checkToPlay(job({ blown }), null, row(dice([2, 1, 1], 'miss')), again.shown);
    expect(after.play).toBeNull();
  });

  it('a dead deck in the row shorts the card', () => {
    const r = checkToPlay(job(), job({ beat: 'desk' }), row(dice([2, 1], 'miss'), 'You talk.\n\n*The Stall build dies.*'), null);
    expect(r.play).toMatchObject({ deckDied: true });
  });

  it("an old save's d100 roll plays nothing", () => {
    expect(checkToPlay(job(), job({ beat: 'desk' }), row({ stat: 'COOL', chance: 74, rolls: [88], pass: false }), null).play).toBeNull();
  });
});

describe('Run It Twice on the table (tier 3 beat play spec §2)', () => {
  const was = { alarm: 0, choices: [], rolled: { choice: 'c', faces: [4], keep: 'high', kind: 'cost' } } as unknown as Parameters<typeof checkToPlay>[0];
  const now = (kind: string, faces: number[]) => ({ alarm: 0, choices: [], rolled: { choice: 'c', faces, keep: 'high', kind, rerun: true } }) as unknown as Parameters<typeof checkToPlay>[1];
  it('new dice play on the waiting roll, even with the same result', () => {
    expect(checkToPlay(was, now('cost', [5]), undefined, { choice: 'c' }).save).toMatchObject({ to: [5], kind: 'cost' });
    expect(checkToPlay(was, now('miss', [2]), undefined, { choice: 'c' }).save).toMatchObject({ to: [2], kind: 'miss' });
  });
  it('the line says so', () => expect(parkedLine({ kind: 'miss', rerun: true })).toBe('RUN AGAIN'));
});
