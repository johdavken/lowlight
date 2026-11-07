import { describe, expect, it } from 'vitest';
import { groupGames, RECENT_SIZE, stops } from '../src/landing/load-groups';

const game = (n: number, o: { starred?: true } = {}) => ({ id: `pt-${n}`, updatedAt: 1000 - n, ...o });

describe('groupGames', () => {
  it('3 starred and 12 others: ★ KEPT 3, RECENT the 8 newest, OLDER 4, each newest first', () => {
    const list = [...[0, 5, 9].map((n) => game(n, { starred: true })), ...[1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14].map((n) => game(n))].reverse();
    const g = groupGames(list, 'pt-1');
    expect(RECENT_SIZE).toBe(8);
    expect(g.kept.map((p) => p.id)).toEqual(['pt-0', 'pt-5', 'pt-9']);
    expect(g.recent.map((p) => p.id)).toEqual(['pt-1', 'pt-2', 'pt-3', 'pt-4', 'pt-6', 'pt-7', 'pt-8', 'pt-10']);
    expect(g.older.map((p) => p.id)).toEqual(['pt-11', 'pt-12', 'pt-13', 'pt-14']);
  });

  it('the active game, oldest of all and unstarred, takes RECENT’s last place', () => {
    const list = Array.from({ length: 12 }, (_, n) => game(n));
    const g = groupGames(list, 'pt-11');
    expect(g.recent).toHaveLength(8);
    expect(g.recent.at(-1)!.id).toBe('pt-11');
    expect(g.older.map((p) => p.id)).toEqual(['pt-7', 'pt-8', 'pt-9', 'pt-10']);
  });
});

describe('stops', () => {
  const list = [...[0, 1, 2].map((n) => game(n, { starred: true })), ...Array.from({ length: 12 }, (_, n) => game(n + 3))];
  it('closed: kept, recent, then one OLDER stop', () => {
    const s = stops(groupGames(list, null), false);
    expect(s).toHaveLength(3 + 8 + 1);
    expect(s.at(-1)).toEqual({ kind: 'older' });
  });
  it('open: OLDER’s games in place of its stop', () => {
    const s = stops(groupGames(list, null), true);
    expect(s).toHaveLength(3 + 8 + 4);
    expect(s.every((x) => x.kind === 'pt')).toBe(true);
  });
  it('no OLDER stop when OLDER is empty', () => {
    expect(stops(groupGames(list.slice(0, 5), null), false).some((x) => x.kind === 'older')).toBe(false);
  });
});
