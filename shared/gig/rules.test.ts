import { describe, expect, test } from 'vitest';
import { act, actionCost, DECK, inReach, isVisible, outcomeOf, startRun, takeCost, TIER_MAX, watchers, type Board, type NodeType, type RunState } from './rules';

/** A hand-made board: node types in order (ids are their indexes), and links. ENTRY is 0, TARGET the last. */
function board(types: NodeType[], links: [number, number][], max = 10, par = 6): Board {
  return {
    tier: 'easy',
    seed: 1,
    max,
    nodes: types.map((type, id) => ({ id, type, col: id, row: 0.5 })),
    links,
    entry: 0,
    target: types.length - 1,
    best: par - 2,
    par,
    routes: 1,
  };
}

/** Runs actions that must all succeed; returns the final result. */
function run(state: RunState, ...actions: Parameters<typeof act>[1][]) {
  let r = { ok: true as const, state, log: [] as { text: string; tone?: 'bad' | 'good' }[], cues: [] as string[] };
  for (const a of actions) {
    const next = act(r.state, a);
    if (!next.ok) throw new Error(`refused: ${next.why}`);
    r = next as typeof r;
  }
  return r;
}

describe('constants', () => {
  test('the deck and the tier maximums', () => {
    expect(DECK).toEqual({ name: 'Patched deck', ram: 3 });
    expect(TIER_MAX).toEqual({ easy: 10, medium: 12, hard: 14 });
  });
});

describe('takeCost', () => {
  const b = board(['ENTRY', 'RELAY', 'ICE2', 'ICE3', 'SENTRY', 'TRAP', 'CACHE', 'KEY', 'TARGET'], []);
  test('each type, without the key', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((id) => takeCost(b, id, false))).toEqual([1, 2, 3, 2, 1, 1, 1, 1]);
  });
  test('the key makes both lacquers cost 1', () => {
    expect(takeCost(b, 2, true)).toBe(1);
    expect(takeCost(b, 3, true)).toBe(1);
    expect(takeCost(b, 4, true)).toBe(2);
  });
});

describe('watchers', () => {
  // 0 ENTRY – 1 SENTRY, 0 – 2 SENTRY, 3 SENTRY linked only to 4
  const b = board(['ENTRY', 'SENTRY', 'SENTRY', 'SENTRY', 'RELAY', 'TARGET'], [[0, 1], [0, 2], [3, 4], [4, 5]]);
  test('each unheld sentry linked to a held node counts', () => {
    expect(watchers(b, new Set([0]))).toBe(2);
  });
  test('a held sentry and an unlinked one do not', () => {
    expect(watchers(b, new Set([0, 1]))).toBe(1);
  });
});

describe('probe', () => {
  // 0 ENTRY – 1 TRAP – 2 TARGET; 0 – 3 SENTRY
  const b = board(['ENTRY', 'TRAP', 'SENTRY', 'TARGET'], [[0, 1], [1, 3], [0, 2]]);
  test('costs 1 RAM plus the watch penalty, reveals, cues probe', () => {
    const r = run(startRun(b), { kind: 'probe', node: 1 });
    expect(r.state.ram).toBe(2);
    expect(r.state.trace).toBe(1); // the sentry at 2 watches ENTRY
    expect(isVisible(r.state, 1)).toBe(true);
    expect(r.cues).toEqual(['probe']);
    expect(r.log[0].tone).toBe('bad');
  });
  test('refused at 0 RAM', () => {
    const r = act(startRun(b, 0), { kind: 'probe', node: 1 });
    expect(r).toEqual({ ok: false, why: 'out of RAM' });
  });
  test('refused for a visible node and one out of reach', () => {
    expect(act(startRun(b), { kind: 'probe', node: 2 }).ok).toBe(false);
    expect(act(startRun(b), { kind: 'probe', node: 3 }).ok).toBe(false);
  });
});

describe('enter', () => {
  test('a trap entered blind costs 1 then 3, and cues enter then trap', () => {
    const b = board(['ENTRY', 'TRAP', 'TARGET'], [[0, 1], [1, 2]]);
    const r = run(startRun(b), { kind: 'enter', node: 1 });
    expect(r.state.trace).toBe(4);
    expect(r.cues).toEqual(['enter', 'trap']);
    expect(r.log.some((l) => l.tone === 'bad')).toBe(true);
  });
  test('a cache never takes TRACE below 0', () => {
    const b = board(['ENTRY', 'RELAY', 'CACHE', 'TARGET'], [[0, 1], [1, 2], [2, 3]]);
    const r = run(startRun(b), { kind: 'enter', node: 1 }, { kind: 'enter', node: 2 });
    expect(r.state.trace).toBe(0);
    expect(r.cues).toContain('cache');
  });
  test('the key makes the next lacquer cost 1', () => {
    const b = board(['ENTRY', 'KEY', 'ICE3', 'TARGET'], [[0, 1], [1, 2], [2, 3]]);
    const r = run(startRun(b), { kind: 'enter', node: 1 });
    expect(r.state.key).toBe(true);
    expect(r.cues).toContain('key');
    expect(actionCost(r.state, { kind: 'enter', node: 2 })).toBe(1);
    expect(run(r.state, { kind: 'enter', node: 2 }).state.trace).toBe(2);
  });
  test('breaching lacquer and blinding a sentry cue breach; the sentry stops watching', () => {
    const b = board(['ENTRY', 'ICE2', 'SENTRY', 'TARGET'], [[0, 1], [0, 2], [1, 3]]);
    const s = startRun(b);
    expect(watchers(b, s.held)).toBe(1);
    const r1 = run(s, { kind: 'enter', node: 1 });
    expect(r1.cues).toEqual(['breach']);
    expect(r1.state.trace).toBe(3); // 2 + the watching sentry
    const r2 = run(r1.state, { kind: 'enter', node: 2 });
    expect(r2.cues).toEqual(['breach']);
    expect(watchers(b, r2.state.held)).toBe(0);
  });
  test('taking a node that brings a new watcher cues watch', () => {
    const b = board(['ENTRY', 'RELAY', 'SENTRY', 'TARGET'], [[0, 1], [1, 2], [1, 3]]);
    const r = run(startRun(b), { kind: 'enter', node: 1 });
    expect(r.cues).toEqual(['enter', 'watch']);
  });
  test('refused out of reach', () => {
    const b = board(['ENTRY', 'RELAY', 'TARGET'], [[0, 1], [1, 2]]);
    expect(act(startRun(b), { kind: 'enter', node: 2 }).ok).toBe(false);
  });
});

describe('trace and results', () => {
  // 0 ENTRY – 1 ICE3 – 2 TARGET, max 10
  const b = board(['ENTRY', 'ICE3', 'TARGET'], [[0, 1], [1, 2]], 10, 6);
  const at = (trace: number): RunState => ({ ...startRun(b), trace });
  test('over the maximum is traced', () => {
    const r = run(at(8), { kind: 'enter', node: 1 });
    expect(r.state.outcome).toBe('traced');
    expect(r.cues).toEqual(['breach', 'traced']);
  });
  test('exactly on the maximum is still in', () => {
    expect(run(at(7), { kind: 'enter', node: 1 }).state.outcome).toBeNull();
  });
  test('PULL is refused until TARGET is held', () => {
    expect(act(startRun(b), { kind: 'pull' }).ok).toBe(false);
  });
  test('a PULL landing exactly on the maximum wins', () => {
    const held = run(at(5), { kind: 'enter', node: 1 }, { kind: 'enter', node: 2 }); // 5 + 3 + 1 = 9
    const r = run(held.state, { kind: 'pull' });
    expect(r.state.trace).toBe(10);
    expect(r.state.outcome).toBe('close');
  });
  test('clean at par, close at par + 1', () => {
    expect(outcomeOf(6, b)).toBe('clean');
    expect(outcomeOf(7, b)).toBe('close');
    const r = run(startRun(b), { kind: 'enter', node: 1 }, { kind: 'enter', node: 2 }, { kind: 'pull' }); // 3 + 1 + 1 = 5
    expect(r.state.outcome).toBe('clean');
    expect(r.cues).toEqual(['pull', 'clean']);
  });
  test('nothing is allowed after the run is over', () => {
    const over = run(at(8), { kind: 'enter', node: 1 });
    expect(act(over.state, { kind: 'enter', node: 2 })).toEqual({ ok: false, why: 'the run is over' });
  });
});

describe('purity and reach', () => {
  test('act never changes the state it was given', () => {
    const b = board(['ENTRY', 'RELAY', 'TARGET'], [[0, 1], [1, 2]]);
    const s = startRun(b);
    run(s, { kind: 'enter', node: 1 });
    expect([...s.held]).toEqual([0]);
    expect([...s.seen]).toEqual([]);
    expect(s.trace).toBe(0);
  });
  test('reach is the nodes linked to yours', () => {
    const b = board(['ENTRY', 'RELAY', 'TARGET'], [[0, 1], [1, 2]]);
    const s = startRun(b);
    expect(inReach(s, 1)).toBe(true);
    expect(inReach(s, 2)).toBe(false);
    expect(inReach(s, 0)).toBe(false);
  });
});
