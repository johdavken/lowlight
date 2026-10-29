import { describe, expect, test } from 'vitest';
import { at, grid } from './testing';
import {
  illegal,
  KIT,
  outcomeOf,
  predictWatch,
  SLIP_MAX,
  SLIP_RULES,
  startSlip,
  step,
  watchedBy,
  type Dir,
  type Guard,
  type SlipAction,
  type SlipBoard,
  type SlipState,
} from './rules';

const post = (node: number, ...dirs: Dir[]): Guard => ({ kind: 'post', poses: dirs.map((d) => [node, d]), startPi: 0 });
/** A state with you on `p` (the run's start otherwise). */
const from = (b: SlipBoard, p: number, more: Partial<SlipState> = {}): SlipState => ({ ...startSlip(b), p, ...more });
function play(b: SlipBoard, s: SlipState, ...actions: SlipAction[]): SlipState {
  for (const a of actions) {
    const why = illegal(b, s, a);
    if (why) throw new Error(`refused: ${why}`);
    s = step(b, s, a).state;
  }
  return s;
}
const WAIT: SlipAction = { k: 'wait' };

describe('constants', () => {
  test('the kit, the rule numbers and the HEAT maximums', () => {
    expect(KIT).toEqual({ name: 'Street kit', charges: 3 });
    expect(SLIP_RULES).toEqual({ heatGuard: 3, heatChase: 1, heatCam: 2, noiseRange: 2, hearRange: 3, jamRange: 2, jamTurns: 3, searchTurns: 2 });
    expect(SLIP_MAX).toEqual({ easy: 6, medium: 8, hard: 10 });
  });
});

describe('sight', () => {
  test('a guard sees its own node and the next linked node along its facing, nothing through a missing link', () => {
    const b = grid(['E.....T']);
    b.guards = [post(at(b, 3), 2), post(at(b, 6), 0)];
    const w = watchedBy(b, startSlip(b));
    expect(w[0]).toMatchObject({ guard: 0, from: at(b, 3), f: 2, nodes: [at(b, 3), at(b, 2)] });
    expect(w[1].nodes).toEqual([at(b, 6)]);
  });

  test('a jammed camera sees nothing; a sweeping camera alternates its two directions each turn', () => {
    const b = grid(['E.....T']);
    b.cams = [{ node: at(b, 4), dirs: [2, 0], kind: 'sweep' }];
    const s0 = startSlip(b);
    expect(watchedBy(b, s0)[0].nodes).toEqual([at(b, 4), at(b, 3)]);
    const s1 = play(b, s0, WAIT);
    expect(watchedBy(b, s1)[0].nodes).toEqual([at(b, 4), at(b, 5)]);
    expect(watchedBy(b, { ...s1, jam: [2] })).toEqual([]);
  });

  test('hide: on a HIDE node no sighting counts; with { noHide: true } it does', () => {
    const b = grid(['EH..T']);
    b.guards = [post(at(b, 2), 2)];
    const s = startSlip(b);
    expect(step(b, s, { k: 'move', d: 0 }).state.heat).toBe(0);
    expect(step(b, s, { k: 'move', d: 0 }, { noHide: true }).state.heat).toBe(3);
  });
});

describe('heat', () => {
  test('a guard sighting is +3 and starts a chase; a repeat sighting while chasing is +1', () => {
    const b = grid(['E.....T']);
    b.guards = [post(at(b, 4), 2)];
    const s1 = play(b, from(b, at(b, 2)), { k: 'move', d: 0 });
    expect(s1.heat).toBe(3);
    expect(s1.g[0].m).toBe('chase');
    expect(s1.last).toBe(at(b, 3));
    const s2 = play(b, s1, WAIT);
    expect(s2.heat).toBe(4);
  });

  test('a camera is +2 and never chases', () => {
    const b = grid(['E.....T']);
    b.cams = [{ node: at(b, 4), dirs: [2], kind: 'fixed' }];
    b.guards = [post(at(b, 6), 2)];
    const r = step(b, from(b, at(b, 2)), { k: 'move', d: 0 });
    expect(r.state.heat).toBe(2);
    expect(r.state.g[0].m).toBe('patrol');
    expect(r.state.last).toBe(at(b, 3));
    expect(r.events).toContainEqual({ k: 'camera', cam: 0, heat: 2 });
  });

  test('each watcher counts once per turn even when both checks see you', () => {
    const b = grid(['E.....T']);
    b.guards = [post(at(b, 4), 2)];
    const r = step(b, from(b, at(b, 2)), { k: 'move', d: 0 });
    expect(r.state.heat).toBe(3);
    expect(r.events.filter((e) => e.k === 'spotted' || e.k === 'seen')).toHaveLength(1);
  });

  test('caught: only above max — heat exactly max is still in; max+1 is caught by heat', () => {
    const b = grid(['E.....T'], { max: 3 });
    b.guards = [post(at(b, 4), 2)];
    const s1 = play(b, from(b, at(b, 2)), { k: 'move', d: 0 });
    expect(s1.heat).toBe(3);
    expect(s1.over).toBeNull();
    const r = step(b, s1, WAIT);
    expect(r.state.heat).toBe(4);
    expect(r.state).toMatchObject({ over: 'caught', cause: 'heat' });
    expect(r.events).toContainEqual({ k: 'caught', why: 'heat' });
  });
});

describe('moving', () => {
  test('hold: a guard that sees you on your action does not step that turn', () => {
    const b = grid(['E.....T']);
    const [u3, u4, u5] = [at(b, 3), at(b, 4), at(b, 5)];
    b.guards = [{ kind: 'pace', poses: [[u5, 2], [u4, 2], [u3, 2], [u3, 0], [u4, 0], [u5, 0]], startPi: 1 }];
    const s = play(b, from(b, at(b, 2)), { k: 'move', d: 0 });
    expect(s.g[0].n).toBe(u4);
    expect(s.over).toBeNull();
  });

  test('hold is only for the first spotting: a guard already chasing you who sees you again steps onto you', () => {
    const b = grid(['E...T']);
    b.guards = [post(at(b, 2), 2)];
    const s1 = play(b, startSlip(b), { k: 'move', d: 0 });
    expect([s1.heat, s1.g[0].m, s1.over]).toEqual([3, 'chase', null]);
    const r = step(b, s1, WAIT);
    expect(r.state.heat).toBe(4);
    expect(r.state).toMatchObject({ over: 'caught', cause: 'contact' });
  });

  test('contact: a guard stepping onto your node catches you, on HIDE too', () => {
    const b = grid(['E.H..T']);
    const [u2, u3, u4] = [at(b, 2), at(b, 3), at(b, 4)];
    b.guards = [{ kind: 'pace', poses: [[u4, 2], [u3, 2], [u2, 2], [u2, 0], [u3, 0], [u4, 0]], startPi: 1 }];
    const r = step(b, from(b, u2), WAIT);
    expect(r.state.heat).toBe(0);
    expect(r.state).toMatchObject({ over: 'caught', cause: 'contact' });
    expect(r.events).toContainEqual({ k: 'caught', why: 'contact', guard: 0, hidden: true });
  });

  test("move: onto a guard's node is illegal; through a missing link is 'no way through'; state unchanged", () => {
    const b = grid(['E.....T']);
    b.guards = [post(at(b, 3), 0)];
    const s = from(b, at(b, 2));
    const before = JSON.stringify(s);
    expect(illegal(b, s, { k: 'move', d: 0 })).toBe("a guard's there");
    expect(illegal(b, s, { k: 'move', d: 3 })).toBe('no way through');
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('patrols', () => {
  test('post turns through its cycle', () => {
    const b = grid(['E.....T']);
    b.guards = [post(at(b, 4), 2, 0)];
    const s1 = play(b, startSlip(b), WAIT);
    const s2 = play(b, s1, WAIT);
    expect([s1.g[0].f, s2.g[0].f]).toEqual([0, 2]);
    expect(s2.g[0].n).toBe(at(b, 4));
  });

  test('pace walks out, turns at the end (one turn), walks back', () => {
    const b = grid(['E.....T']);
    const [u3, u4, u5] = [at(b, 3), at(b, 4), at(b, 5)];
    b.guards = [{ kind: 'pace', poses: [[u5, 2], [u4, 2], [u3, 2], [u3, 0], [u4, 0], [u5, 0]], startPi: 0 }];
    let s = startSlip(b);
    const seen: [number, Dir][] = [];
    for (let i = 0; i < 6; i++) {
      s = play(b, s, WAIT);
      seen.push([s.g[0].n, s.g[0].f]);
    }
    expect(seen).toEqual([[u4, 2], [u3, 2], [u3, 0], [u4, 0], [u5, 0], [u5, 2]]);
  });

  test('loop walks the circuit', () => {
    const b = grid(['E...', '  ..']);
    const [a, bb, c, d] = [at(b, 2), at(b, 3), at(b, 3, 1), at(b, 2, 1)];
    b.guards = [{ kind: 'loop', poses: [[a, 0], [bb, 1], [c, 2], [d, 3]], startPi: 0 }];
    let s = startSlip(b);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = play(b, s, WAIT);
      seen.push(s.g[0].n);
    }
    expect(seen).toEqual([bb, c, d, a]);
  });
});

describe('guard modes', () => {
  test('chase → search → return: walks to last seen, turns clockwise through linked dirs for 2 turns, walks back and resumes', () => {
    const b = grid(['E.....', 'H     ']);
    const [u3, u4, u5] = [at(b, 3), at(b, 4), at(b, 5)];
    b.guards = [post(u5, 2)];
    let s = from(b, at(b, 0, 1), { last: u3, g: [{ n: u5, f: 2, m: 'chase', pi: 0, x: -1, t: 0 }] });
    const trail: string[] = [];
    for (let i = 0; i < 7; i++) {
      s = play(b, s, WAIT);
      const g = s.g[0];
      trail.push(`${g.m}@${g.n}:${g.f}`);
    }
    expect(trail).toEqual([
      `chase@${u4}:2`,
      `chase@${u3}:2`,
      `search@${u3}:0`,
      `search@${u3}:2`,
      `return@${u4}:0`,
      `return@${u5}:0`,
      `patrol@${u5}:2`,
    ]);
    expect(s.heat).toBe(0);
  });
});

describe('tools', () => {
  test('noise: the nearest patrolling guard within 3 investigates, looks back once, returns', () => {
    const b = grid(['E.......']);
    const [u2, u3, u4] = [at(b, 2), at(b, 3), at(b, 4)];
    b.guards = [post(u4, 0), post(at(b, 7), 2)];
    const r = step(b, startSlip(b), { k: 'noise', n: u2 });
    expect(r.events).toContainEqual({ k: 'noise', at: u2, guard: 0 });
    expect(r.state.charges).toBe(2);
    let s = r.state;
    expect([s.g[0].m, s.g[0].n]).toEqual(['investigate', u3]);
    s = play(b, s, WAIT);
    expect([s.g[0].n, s.g[0].f]).toEqual([u2, 2]);
    s = play(b, s, WAIT);
    expect([s.g[0].n, s.g[0].f]).toEqual([u2, 0]);
    s = play(b, s, WAIT, WAIT, WAIT);
    expect([s.g[0].m, s.g[0].n, s.g[0].f]).toEqual(['patrol', u4, 0]);
    expect(s.g[1].m).toBe('patrol');
  });

  test('noise: a tie goes to the lower index', () => {
    const b = grid(['E......']);
    b.guards = [post(at(b, 5), 0), post(at(b, 1), 0)];
    const r = step(b, from(b, at(b, 3)), { k: 'noise', n: at(b, 3) });
    expect(r.events[0]).toEqual({ k: 'noise', at: at(b, 3), guard: 0 });
  });

  test('noise: nobody in range spends the charge', () => {
    const b = grid(['E.......']);
    b.guards = [post(at(b, 7), 2)];
    const r = step(b, startSlip(b), { k: 'noise', n: at(b, 2) });
    expect(r.events).toContainEqual({ k: 'noise', at: at(b, 2), guard: null });
    expect(r.state.charges).toBe(2);
    expect(r.state.g[0].m).toBe('patrol');
  });

  test('jam: the camera is blind this turn and the next two (3 turns), then watches again', () => {
    const b = grid(['E.....T']);
    b.cams = [{ node: at(b, 3), dirs: [2], kind: 'fixed' }];
    let s = play(b, from(b, at(b, 1)), { k: 'jam', c: 0 });
    expect(s.charges).toBe(2);
    s = play(b, s, { k: 'move', d: 0 });
    expect(s.heat).toBe(0);
    s = play(b, s, WAIT);
    expect(s.heat).toBe(0);
    s = play(b, s, WAIT);
    expect(s.heat).toBe(2);
  });

  test('tools: no charges and out of range are refused', () => {
    const b = grid(['E.....T']);
    b.cams = [{ node: at(b, 5), dirs: [2], kind: 'fixed' }];
    expect(illegal(b, startSlip(b), { k: 'noise', n: at(b, 3) })).toBe('out of range');
    expect(illegal(b, startSlip(b), { k: 'jam', c: 0 })).toBe('out of range');
    expect(illegal(b, { ...startSlip(b), charges: 0 }, { k: 'noise', n: at(b, 1) })).toBe('no charges');
  });
});

describe('lift and exit', () => {
  test('lift only on TARGET, once', () => {
    const b = grid(['E.T.X']);
    expect(illegal(b, startSlip(b), { k: 'lift' })).toBe('nothing to lift here');
    const s = play(b, from(b, at(b, 2)), { k: 'lift' });
    expect(s.lifted).toBe(true);
    expect(illegal(b, s, { k: 'lift' })).toBe('nothing to lift here');
  });

  test('EXIT before lifting is just a move; after lifting it ends the run, counts the turn, and the guards do not move', () => {
    const b = grid(['E.T.X..']);
    b.guards = [{ kind: 'pace', poses: [[at(b, 6), 2], [at(b, 5), 2], [at(b, 5), 0], [at(b, 6), 0]], startPi: 0 }];
    const early = play(b, from(b, at(b, 3)), { k: 'move', d: 0 });
    expect(early.over).toBeNull();
    const s = from(b, at(b, 3), { lifted: true, turn: 5 });
    const r = step(b, s, { k: 'move', d: 0 });
    expect(r.state).toMatchObject({ over: 'out', turn: 6 });
    expect(r.state.g[0]).toEqual(s.g[0]);
    expect(r.events).toContainEqual({ k: 'out' });
  });

  test('outcomeOf: out with heat 0 → clean, out with heat 3 → close, caught → caught, running → null', () => {
    const b = grid(['E.T']);
    const s = startSlip(b);
    expect(outcomeOf({ ...s, over: 'out' })).toBe('clean');
    expect(outcomeOf({ ...s, over: 'out', heat: 3 })).toBe('close');
    expect(outcomeOf({ ...s, over: 'caught', heat: 2 })).toBe('caught');
    expect(outcomeOf(s)).toBeNull();
  });
});

describe('predictWatch', () => {
  test('equals watchedBy after a wait with you off the board, and never changes the state passed in', () => {
    const b = grid(['E.....T']);
    const [u3, u4, u5] = [at(b, 3), at(b, 4), at(b, 5)];
    b.guards = [{ kind: 'pace', poses: [[u5, 2], [u4, 2], [u3, 2], [u3, 0], [u4, 0], [u5, 0]], startPi: 0 }];
    b.cams = [{ node: at(b, 1), dirs: [0, 2], kind: 'sweep' }];
    const s = from(b, at(b, 2));
    const before = JSON.stringify(s);
    const next = predictWatch(b, s);
    expect(JSON.stringify(s)).toBe(before);
    expect(next).toEqual(watchedBy(b, step(b, { ...s, p: -1 }, WAIT).state));
    expect(next[0].nodes).toEqual([u4, u3]);
  });
});
