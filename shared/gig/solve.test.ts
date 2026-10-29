import { describe, expect, test } from 'vitest';
import { parOf, solve } from './solve';
import type { Board, NodeType } from './rules';

function board(types: NodeType[], links: [number, number][], max = 14): Omit<Board, 'best' | 'par' | 'routes'> {
  return { tier: 'hard', seed: 1, max, nodes: types.map((type, id) => ({ id, type, col: id, row: 0.5 })), links, entry: 0, target: types.length - 1 };
}

describe('solve', () => {
  test('a line: each take, then the PULL', () => {
    const r = solve(board(['ENTRY', 'RELAY', 'ICE2', 'TARGET'], [[0, 1], [1, 2], [2, 3]]));
    expect(r.best).toBe(1 + 2 + 1 + 1);
    expect(r.routes).toBe(1);
    expect(r.path).toEqual([0, 1, 2, 3]);
  });
  test('a diamond goes round the trap', () => {
    // 0 – 1 TRAP – 3 TARGET; 0 – 2 RELAY – 3
    const r = solve(board(['ENTRY', 'TRAP', 'RELAY', 'TARGET'], [[0, 1], [0, 2], [1, 3], [2, 3]]));
    expect(r.best).toBe(3);
    expect(r.path).toEqual([0, 2, 3]);
    expect(r.routes).toBe(2);
  });
  test('a path past a watching sentry pays the penalty', () => {
    // 0 – 1 RELAY – 3 TARGET; 1 – 2 SENTRY
    const r = solve(board(['ENTRY', 'RELAY', 'SENTRY', 'TARGET'], [[0, 1], [1, 2], [1, 3]]));
    expect(r.best).toBe(1 + (1 + 1) + (1 + 1));
  });
  test('the key makes the lacquer after it cost 1', () => {
    const r = solve(board(['ENTRY', 'KEY', 'ICE3', 'TARGET'], [[0, 1], [1, 2], [2, 3]]));
    expect(r.best).toBe(1 + 1 + 1 + 1);
  });
  test('no route under the maximum: best is Infinity and no path', () => {
    const r = solve(board(['ENTRY', 'ICE3', 'TARGET'], [[0, 1], [1, 2]], 3));
    expect(r.best).toBe(Infinity);
    expect(r.path).toBeNull();
  });
});

test('par is two over the best, capped at the maximum', () => {
  expect(parOf(14, 8)).toBe(10);
  expect(parOf(10, 9)).toBe(10);
});
