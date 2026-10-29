import { describe, expect, test } from 'vitest';
import { illegal, startSlip, step, type Dir, type Guard, type SlipAction, type SlipBoard } from './rules';
import { bfsClean, naiveSeen, solveClean, STATE_CAP, TURN_CAP } from './solve';
import { at, grid } from './testing';

/** Plays `actions` from the start; every one must be legal. */
function replay(b: SlipBoard, actions: SlipAction[]) {
  let s = startSlip(b);
  for (const a of actions) {
    expect(illegal(b, s, a)).toBeNull();
    s = step(b, s, a).state;
  }
  return s;
}

/** Easy seed 2 from the mockup: a pacing guard on the only way to the target, a camera at its foot. */
function noiseBoard(): SlipBoard {
  const b = grid(['     ', 'T    ', '....H', '.. E.'], { tier: 'easy', max: 6 });
  const p = (u: number, v: number, f: Dir): [number, Dir] => [at(b, u, v), f];
  const pace: Guard = { kind: 'pace', poses: [p(0, 1, 1), p(0, 2, 1), p(0, 3, 1), p(0, 3, 3), p(0, 2, 3), p(0, 1, 3)], startPi: 0 };
  return { ...b, guards: [pace], cams: [{ node: at(b, 0, 3), dirs: [0], kind: 'fixed' }] };
}

describe('caps', () => {
  test('60 turns and 8000 states', () => {
    expect([TURN_CAP, STATE_CAP]).toEqual([60, 8000]);
  });
});

describe('solveClean', () => {
  test('a corridor with no watchers: the shortest walk in, lift, walk out', () => {
    const b = grid(['E.T.X']);
    expect(solveClean(b).actions).toEqual([
      { k: 'move', d: 0 },
      { k: 'move', d: 0 },
      { k: 'lift' },
      { k: 'move', d: 0 },
      { k: 'move', d: 0 },
    ]);
  });

  test('a guard on the only way: no clean route without tools; with NOISE there is one, and it uses noise', () => {
    const b = noiseBoard();
    expect(bfsClean(b, { noTools: true }).actions).toBeNull();
    expect(bfsClean(b, { noNoise: true }).actions).toBeNull();
    const r = solveClean(b);
    expect(r.actions?.some((a) => a.k === 'noise')).toBe(true);
    expect(replay(b, r.actions!)).toMatchObject({ over: 'out', heat: 0 });
  });

  test('a fixed camera on the corridor: solved by the JAM stage', () => {
    const b = grid(['E...T'], { cams: [] });
    b.cams = [{ node: at(b, 2), dirs: [2], kind: 'fixed' }];
    const r = solveClean(b);
    expect(r.actions?.some((a) => a.k === 'jam')).toBe(true);
    expect(r.actions?.some((a) => a.k === 'noise')).toBe(false);
    expect(replay(b, r.actions!)).toMatchObject({ over: 'out', heat: 0 });
  });

  test('the cap: a search past 8000 states returns capped and no route', () => {
    const b = grid(['E......', '.......', '.......', '.......', '.......', '.......', '       ', '      T']);
    const post = (u: number, v: number, ...dirs: Dir[]): Guard => ({ kind: 'post', poses: dirs.map((d) => [at(b, u, v), d]), startPi: 0 });
    b.guards = [post(3, 2, 0, 1, 2, 3), post(5, 4, 0, 2), post(1, 4, 1, 3)];
    const r = bfsClean(b);
    expect(r).toMatchObject({ actions: null, capped: true });
    expect(r.states).toBeGreaterThan(STATE_CAP);
  });
});

describe('naiveSeen', () => {
  test('no watchers: the naive route is clean', () => {
    expect(naiveSeen(grid(['E.T.X']))).toBe(false);
  });
  test('a camera on the way: the naive route is seen', () => {
    const b = grid(['E...T']);
    b.cams = [{ node: at(b, 2), dirs: [2], kind: 'fixed' }];
    expect(naiveSeen(b)).toBe(true);
  });
});
