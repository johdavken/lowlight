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

describe('postedBig', async () => {
  const { postedBig } = await import('./board');
  const { parseQuestFile } = await import('./quests');
  const { BIG } = await import('./quests.fixture');
  const bigOf = (id: string, tier: 3 | 4) => {
    const r = parseQuestFile(id, BIG.replace('tier: 3', `tier: ${tier}`), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r.entry;
  };
  const book = [bigOf('gate-a', 3), bigOf('gate-b', 3), bigOf('gate-c', 4)];
  it('none below Trusted; one at tier 3 (never the tier-4 one); tier-4 jobs only at tier 4; seeded', () => {
    expect(postedBig({ book, place: 'haes-noodles', tier: 2, day: 1, seed: 's' })).toBeNull();
    for (let d = 0; d < 20; d++) expect(['gate-a', 'gate-b']).toContain(postedBig({ book, place: 'haes-noodles', tier: 3, day: d, seed: 's' }));
    const at4 = new Set(Array.from({ length: 30 }, (_, d) => postedBig({ book, place: 'haes-noodles', tier: 4, day: d, seed: 's' })));
    expect(at4.has('gate-c')).toBe(true);
    expect(postedBig({ book, place: 'haes-noodles', tier: 3, day: 5, seed: 's' })).toBe(postedBig({ book, place: 'haes-noodles', tier: 3, day: 5, seed: 's' }));
    expect(postedBig({ book, place: 'the-tilt', tier: 4, day: 1, seed: 's' })).toBeNull();
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
