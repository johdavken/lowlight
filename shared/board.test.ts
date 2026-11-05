import { describe, expect, it } from 'vitest';
import { boardPlaces, postedJobs, storyDay } from './board';
import { DAY } from './clock';
import type { QuestEntry } from './quests';

const job = (id: string, tier: 1 | 2 | 3 | 4, starts = 'second-socket', kind: 'mission' | 'quest' = 'mission') => ({ id, tier, starts, kind }) as QuestEntry;
const BOOK = [job('a', 1), job('b', 1), job('c', 1), job('d', 2), job('e', 2), job('f', 3), job('q', 1, 'second-socket', 'quest'), job('z', 1, 'the-tilt')];
const posted = (tier: 1 | 2 | 3 | 4, day: number, book = BOOK) => postedJobs({ book, place: 'second-socket', tier, day, seed: 'pt-1' });

describe('the nightly board', () => {
  it('boardPlaces: every place a mission starts at', () => {
    expect(boardPlaces(BOOK)).toEqual(['second-socket', 'the-tilt']);
  });
  it('deterministic', () => {
    expect(posted(2, 5)).toEqual(posted(2, 5));
  });
  it('tier filter, missions only', () => {
    for (let d = 0; d < 30; d++) for (const id of posted(1, d)) expect(['a', 'b', 'c']).toContain(id);
  });
  it('count by pool size', () => {
    expect(posted(2, 3)).toHaveLength(3);
    expect(posted(1, 3, [job('a', 1), job('b', 1), job('c', 1)])).toHaveLength(2);
    expect(posted(1, 3, [job('a', 1)])).toEqual(['a']);
    expect(posted(1, 3, [])).toEqual([]);
  });
  it('no repeats from yesterday while the pool allows', () => {
    const book = [job('a', 1), job('b', 1), job('c', 1), job('d', 1), job('e', 1), job('f', 1), job('g', 1)];
    for (let d = 1; d < 40; d++) {
      const y = new Set(posted(1, d - 1, book));
      for (const id of posted(1, d, book)) expect(y.has(id)).toBe(false);
    }
  });
  it('top tier weighted', () => {
    const count: Record<string, number> = {};
    for (let d = 0; d < 200; d++) for (const id of posted(2, d)) count[id] = (count[id] ?? 0) + 1;
    const t1 = ((count.a ?? 0) + (count.b ?? 0) + (count.c ?? 0)) / 3;
    const t2 = ((count.d ?? 0) + (count.e ?? 0)) / 2;
    expect(t2).toBeGreaterThan(t1);
  });
  it('storyDay turns at 06:00', () => {
    expect(storyDay(DAY + 5 * 60 + 59)).toBe(storyDay(DAY + 5 * 60 + 59 - 60));
    expect(storyDay(DAY + 6 * 60)).toBe(storyDay(DAY + 5 * 60 + 59) + 1);
  });
});

describe('own jobs (Intake board spec §1)', () => {
  it('at most two of one contact\'s own jobs post', () => {
    const own = (id: string) => ({ ...job(id, 1), with: ['nix-direct'] }) as QuestEntry;
    const book = [own('h1'), own('h2'), own('h3'), own('h4')];
    for (let d = 0; d <= 20; d++) {
      const ids = posted(1, d, book);
      expect(ids).toHaveLength(2);
      for (const id of ids) expect(['h1', 'h2', 'h3', 'h4']).toContain(id);
    }
  });
});

describe('spring files (crew spec §5)', () => {
  it('postedJobs never draws a spring file, and it isn’t a board', () => {
    const spring = { id: 'spring-quiet', kind: 'mission', spring: true, starts: '', tier: 1 } as QuestEntry;
    const plain = { id: 'back-door', kind: 'mission', starts: 'the-tilt', tier: 1 } as QuestEntry;
    expect(postedJobs({ book: [spring, { ...spring, starts: 'the-tilt' }, plain], place: 'the-tilt', tier: 4, day: 0, seed: 's' })).toEqual(['back-door']);
    expect(boardPlaces([spring, plain])).toEqual(['the-tilt']);
  });
});
