import { describe, expect, it } from 'vitest';
import { checkToPlay } from '../src/room/job-moment';
import type { ChatMessage, QuestState } from '../../shared/types';

type Active = NonNullable<QuestState['active']>;
const job = (o: Partial<Active> = {}): Active => ({
  id: 'back-door',
  title: 'Back Door',
  beat: 'door',
  alarm: 0,
  edge: 2,
  heat: 0,
  pay: [350, 450],
  choices: [{ id: 'talk', line: 'Talk.', odds: { stat: 'COOL', chance: 74, noDeck: false, why: [] } }],
  ...o,
});
const reroll = [{ id: '!reroll', line: 'REROLL' }, { id: '!take', line: 'TAKE IT' }];
const row = (rolls: number[], pass: boolean, text = 'You talk.'): ChatMessage => ({
  id: 'r1',
  role: 'user',
  mode: 'quest',
  text,
  toolLines: [],
  ts: 1,
  status: 'ok',
  quest: { id: 'back-door', title: 'Back Door', beat: 'desk', pick: { choice: 'talk', line: 'You talk.', roll: { stat: 'COOL', chance: 74, rolls, pass } } },
});

describe('checkToPlay', () => {
  it('a check that rolled once plays on its card', () => {
    const r = checkToPlay(job(), job({ beat: 'desk' }), row([30], true), null);
    expect(r.play).toMatchObject({ card: 'talk', rolls: [30], shown: 0, pass: true });
    expect(r.shown).toBeNull();
  });

  it('a fail that parks plays on its card; the row that resolves it plays the rest on REROLL', () => {
    const parked = checkToPlay(job(), job({ choices: reroll, rolled: { choice: 'talk', chance: 74, rolls: [88] } }), undefined, null);
    expect(parked.play).toMatchObject({ card: 'talk', rolls: [88], shown: 0, pass: false });
    expect(parked.shown).toEqual({ choice: 'talk', rolls: 1 });
    const done = checkToPlay(job({ choices: reroll, rolled: { choice: 'talk', chance: 74, rolls: [88] } }), job({ beat: 'desk' }), row([88, 23], true), parked.shown);
    expect(done.play).toMatchObject({ card: '!reroll', rolls: [88, 23], shown: 1, pass: true });
  });

  it('I4: a second REROLL that fails again plays its roll, and the resolving row plays only the last', () => {
    const first = { choice: 'talk', chance: 74, rolls: [88] };
    const again = checkToPlay(job({ choices: reroll, rolled: first }), job({ choices: reroll, rolled: { ...first, rolls: [88, 90] } }), undefined, { choice: 'talk', rolls: 1 });
    expect(again.play).toMatchObject({ card: '!reroll', rolls: [88, 90], shown: 1, pass: false });
    expect(again.shown).toEqual({ choice: 'talk', rolls: 2 });
    const done = checkToPlay(job({ choices: reroll, rolled: { ...first, rolls: [88, 90] } }), job({ beat: 'desk' }), row([88, 90, 12], true), again.shown);
    expect(done.play).toMatchObject({ card: '!reroll', rolls: [88, 90, 12], shown: 2 });
  });

  it('I3: a pick that blows the job plays its roll on the way to the cover cards; the row after the cover card plays nothing', () => {
    const blown = {
      text: 'You talk.\n\n*COOL 74% — no.*\n\n*He turns you round.*',
      pick: { choice: 'talk', line: 'You talk.', roll: { stat: 'COOL', chance: 74, rolls: [99], pass: false } },
      debrief: { tier: 'blown' as const, checks: [], sol: 0, heat: { district: 'karasu', delta: 1 }, rep: { district: 'karasu', before: 30, after: 18 } },
    };
    const r = checkToPlay(job(), job({ choices: [{ id: '!burner', line: 'USE BURNER' }, { id: '!take', line: 'TAKE IT' }], blown }), undefined, null);
    expect(r.play).toMatchObject({ card: 'talk', rolls: [99], shown: 0, pass: false });
    expect(r.blown).toBe(true);
    // Another state while the cover cards are up (a kit refresh) changes nothing.
    const again = checkToPlay(job({ blown }), job({ blown }), undefined, r.shown);
    expect(again).toEqual({ play: null, shown: r.shown, blown: false });
    const after = checkToPlay(job({ blown }), null, row([99], false), again.shown);
    expect(after.play).toBeNull();
  });

  it('TAKE IT after a parked fail plays nothing new', () => {
    const r = checkToPlay(job({ choices: reroll, rolled: { choice: 'talk', chance: 74, rolls: [88] } }), job({ beat: 'desk' }), row([88], false), { choice: 'talk', rolls: 1 });
    expect(r.play).toBeNull();
  });
});
