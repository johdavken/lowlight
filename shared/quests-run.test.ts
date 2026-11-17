import { describe, expect, it } from 'vitest';
import { parseRun } from './quests';

const base = { beat: 'b1', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1 };
const run = (o: Record<string, unknown>) => parseRun(JSON.stringify({ ...base, ...o }));

describe('a run with the hand', () => {
  it('parseRun keeps old runs', () => {
    const r = run({});
    expect(r).not.toBeNull();
    expect(r).not.toHaveProperty('setup');
    expect(r).not.toHaveProperty('calls');
  });
  it('keeps a good setup and its calls', () => {
    const setup = { approach: 'hard', people: ['dez'], favour: true, at: 300, endAt: 360 };
    const calls = [{ beat: 'b1', choice: 'c1', card: 'dez', again: false, at: 310 }, { beat: 'b2', choice: 'c2', card: 'dez', again: true, at: 320, loss: 'held' }];
    expect(run({ setup, calls })).toMatchObject({ setup, calls });
  });
  it('parseRun drops a bad setup', () => {
    for (const setup of [{ approach: 'loud', people: [], favour: false, at: 1 }, { approach: 'quiet', people: 'dez', favour: false, at: 1 }, { approach: 'quiet', people: ['a', 'b', 'c', 'd'], favour: false, at: 1 }]) {
      const r = run({ setup });
      expect(r).not.toBeNull();
      expect(r?.setup).toBeUndefined();
    }
  });
  it('drops calls with no card', () => {
    const r = run({ calls: [{ beat: 'b1', choice: 'c1', again: false, at: 1 }, { beat: 'b1', choice: 'c1', card: 'favour', again: false, at: 2 }] });
    expect(r?.calls).toEqual([{ beat: 'b1', choice: 'c1', card: 'favour', again: false, at: 2 }]);
  });
});

describe("a pick's change on the clocks (SO FAR on the table, 2026-11-15)", () => {
  const roll = { stat: 'COOL', dice: 3, position: 'open', faces: [5, 2, 1], keep: 'high', kind: 'cost', pass: true };
  it('parseRun keeps take and alarm on a pick, and a pick without them', () => {
    const picks = [{ beat: 'b1', choice: 'c1', roll, take: 1, alarm: 1 }, { beat: 'b2', choice: 'c2', roll, take: -1 }, { beat: 'b3', choice: 'c3', alarm: -1 }, { beat: 'b4', choice: 'c4', roll }, { beat: 'b5', choice: 'c5' }];
    const r = run({ picks });
    expect(r?.picks).toEqual(picks);
    expect(r?.picks[3]).not.toHaveProperty('take');
    expect(r?.picks[4]).not.toHaveProperty('alarm');
  });
  it('a change that is not a whole number is not a run', () => {
    expect(run({ picks: [{ beat: 'b1', choice: 'c1', take: 0.5 }] })).toBeNull();
    expect(run({ picks: [{ beat: 'b1', choice: 'c1', alarm: 'one' }] })).toBeNull();
  });
});
