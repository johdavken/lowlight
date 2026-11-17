import { describe, expect, it } from 'vitest';
import { DETAIL_EVERY, roomDetail, roomDetailLine } from './room-details';

const five = ['a', 'b', 'c', 'd', 'e'];

describe('roomDetail', () => {
  it('gives nothing without details, and nothing on the turns between', () => {
    expect(roomDetail([], 's', 0)).toBeNull();
    expect(roomDetail(five, 's', 1)).toBeNull();
    expect(roomDetail(five, 's', 2)).toBeNull();
    expect(roomDetail(five, 's', 0)).not.toBeNull();
    expect(roomDetail(five, 's', DETAIL_EVERY)).not.toBeNull();
    expect(roomDetail(five, 's', 1, 2)).toBeNull();
    expect(roomDetail(five, 's', 2, 2)).not.toBeNull();
  });

  it('goes through every detail once before any repeats, round after round', () => {
    for (let round = 0; round < 4; round++) {
      const got = Array.from({ length: five.length }, (_, i) => roomDetail(five, 'pair:room', (round * five.length + i) * DETAIL_EVERY));
      expect([...got].sort()).toEqual(five);
    }
  });

  it('never gives the same detail twice in a row across rounds', () => {
    const seq = Array.from({ length: 60 }, (_, i) => roomDetail(five, 'x', i * DETAIL_EVERY));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it('is the same for the same seed and turn, and differs between seeds', () => {
    const a = Array.from({ length: 10 }, (_, i) => roomDetail(five, 'one', i * DETAIL_EVERY));
    expect(Array.from({ length: 10 }, (_, i) => roomDetail(five, 'one', i * DETAIL_EVERY))).toEqual(a);
    const others = ['two', 'three', 'four'].map((s) => Array.from({ length: 10 }, (_, i) => roomDetail(five, s, i * DETAIL_EVERY)));
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(a))).toBe(true);
  });

  it('a single detail comes every DETAIL_EVERY turns', () => {
    expect(roomDetail(['only'], 's', 0)).toBe('only');
    expect(roomDetail(['only'], 's', 2 * DETAIL_EVERY)).toBe('only');
  });
});

it('roomDetailLine leaves the detail hers to use', () => {
  const rest = " If you use it, let it land in the middle of your reply, under what's said, not as its first line. Or leave it.]";
  expect(roomDetailLine('The stair creaks.')).toBe(`[in the room, partway through this moment: The stair creaks.${rest}`);
  expect(roomDetailLine(' the stair creaks ')).toBe(`[in the room, partway through this moment: the stair creaks.${rest}`);
});
