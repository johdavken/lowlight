import { describe, expect, it } from 'vitest';
import { blocksOverlap, blockStartedBetween, DAY, formatClock, nextBlockStart, parseDays, weekdayOf, WEEKDAYS, minuteOfDay, nextBlock, nextOccurrence, parseHhmm, promptClock, scheduledRoom, START, TURN_COST, type Block } from './clock';

describe('the story clock', () => {
  it('formats as Day N · Ddd HH:MM, and as her prompt line', () => {
    expect(START).toBe(1200);
    expect(DAY).toBe(1440);
    expect(formatClock(1200)).toBe('Day 1 · Thu 20:00');
    expect(formatClock(1440 * 2 + 70)).toBe('Day 3 · Sat 01:10');
    expect(promptClock(1440 * 2 + 70)).toBe('[time: Saturday, Day 3, 01:10]');
  });
  it('Day 1 is a Thursday', () => {
    expect(weekdayOf(START)).toBe(3);
    expect(weekdayOf(START + 4 * DAY)).toBe(0); // Day 5, Monday
    expect(weekdayOf(6 * DAY + 10)).toBe(2); // Day 7, Wednesday
    expect(weekdayOf(7 * DAY)).toBe(3); // Day 8, Thursday again
  });
  it('parses HH:MM strictly', () => {
    expect(parseHhmm('08:00')).toBe(480);
    expect(parseHhmm('23:59')).toBe(1439);
    expect(parseHhmm('24:00')).toBeNull();
    expect(parseHhmm('8:00')).toBeNull();
    expect(parseHhmm('08:60')).toBeNull();
  });
  it('minute of day, and the next HH:MM strictly later', () => {
    expect(minuteOfDay(1440 + 300)).toBe(300);
    expect(nextOccurrence(1200, 1200)).toBe(1200 + 1440);
    expect(nextOccurrence(1200, 300)).toBe(1440 + 300);
    expect(nextOccurrence(1200, 1260)).toBe(1260);
  });
  it('turn costs', () => {
    expect(TURN_COST).toEqual({ rp: 5, ooc: 5, encounter: 10, quest: 10, dice: 15, travel: 20, gig: 30, greet: 0, end: 0, scene: 0, text: 2 });
  });
});

describe('schedule blocks', () => {
  const blocks: Block[] = [
    { from: 1200, to: 240, room: 'a' },
    { from: 240, to: 600, room: 'b' },
  ];
  it('the block covering a minute, past midnight included; from inclusive, to exclusive', () => {
    expect(scheduledRoom(blocks, 1300)).toBe('a');
    expect(scheduledRoom(blocks, 1440 + 100)).toBe('a');
    expect(scheduledRoom(blocks, 240)).toBe('b');
    expect(scheduledRoom(blocks, 600)).toBeNull();
    expect(scheduledRoom(blocks, 700)).toBeNull();
  });
  it('whether a block started in (after, upTo], across days', () => {
    expect(blockStartedBetween(blocks, 1320, 1440 + 240)).toBe(true);
    expect(blockStartedBetween(blocks, 1320, 1400)).toBe(false);
    expect(blockStartedBetween(blocks, 1200, 1300)).toBe(false);
    expect(blockStartedBetween(blocks, 1199, 1200)).toBe(true);
    expect(blockStartedBetween(blocks, 0, 1440 * 3)).toBe(true);
  });
  it('the next block to start', () => {
    expect(nextBlock(blocks, 700)).toEqual(blocks[0]);
    expect(nextBlock(blocks, 1300)).toEqual(blocks[1]);
    expect(nextBlock([], 700)).toBeNull();
  });
});

describe('blocks on days of the week (spec 2026-10-20 weekdays)', () => {
  // Day 1 Thu, Day 2 Fri, Day 3 Sat, Day 4 Sun, Day 5 Mon.
  const fri: Block = { from: 1200, to: 240, room: 'tilt', days: [4] };
  const sun: Block = { from: 1320, to: 240, room: 'sunday', days: [6] };
  const daily: Block = { from: 1200, to: 240, room: 'daily' };
  it('an overnight block belongs to the day it starts', () => {
    expect(scheduledRoom([fri], DAY + 1300)).toBe('tilt'); // Fri 21:40
    expect(scheduledRoom([fri], 2 * DAY + 120)).toBe('tilt'); // Sat 02:00
    expect(scheduledRoom([fri], 2 * DAY + 1260)).toBeNull(); // Sat 21:00
    expect(scheduledRoom([fri], 1300)).toBeNull(); // Thu 21:40
    expect(scheduledRoom([fri], 120)).toBeNull(); // Thu 02:00: Wednesday's night, not Friday's
  });
  it('a Sunday night wraps into Monday', () => {
    expect(scheduledRoom([sun], 3 * DAY + 1380)).toBe('sunday'); // Sun 23:00
    expect(scheduledRoom([sun], 4 * DAY + 120)).toBe('sunday'); // Mon 02:00
    expect(scheduledRoom([sun], 4 * DAY + 240)).toBeNull(); // Mon 04:00
  });
  it('no days runs every day, as before', () => {
    for (let d = 0; d < 7; d++) expect(scheduledRoom([daily], d * DAY + 1300)).toBe('daily');
  });
  it('finds Monday from Saturday night', () => {
    const mon: Block = { from: 1200, to: 240, room: 'tilt', days: [0] };
    expect(nextBlockStart([mon], 2 * DAY + 1300)).toEqual({ block: mon, at: 4 * DAY + 1200 });
    expect(nextBlock([mon], 2 * DAY + 1300)).toBe(mon);
    expect(nextBlockStart([mon], 4 * DAY + 1200)).toEqual({ block: mon, at: 11 * DAY + 1200 }); // strictly after: a week on
    expect(nextBlockStart([], 0)).toBeNull();
  });
  it('blockStartedBetween counts only the days a block runs', () => {
    const weeknights: Block = { from: 1200, to: 240, room: 'tilt', days: [0, 1, 2, 3, 4] };
    expect(blockStartedBetween([weeknights], DAY + 1320, 3 * DAY + 1300)).toBe(false); // Fri 22:00 → Sun 21:40
    expect(blockStartedBetween([weeknights], DAY + 1320, 4 * DAY + 1260)).toBe(true); // → Mon 21:00
  });
  it('blocksOverlap reads the week', () => {
    const wk: Block = { from: 1200, to: 240, room: 'a', days: [0, 1, 2, 3, 4] };
    const we: Block = { from: 1200, to: 240, room: 'b', days: [5, 6] };
    expect(blocksOverlap(wk, we)).toBe(false);
    expect(blocksOverlap(we, wk)).toBe(false);
    expect(blocksOverlap(wk, { from: 1260, to: 1320, room: 'c', days: [4] })).toBe(true);
    expect(blocksOverlap(fri, { from: 60, to: 120, room: 'c', days: [5] })).toBe(true); // Sat 01:00 is inside Fri's night
    expect(blocksOverlap({ from: 60, to: 120, room: 'c', days: [5] }, fri)).toBe(true);
    expect(blocksOverlap(daily, { from: 300, to: 600, room: 'c' })).toBe(false);
    expect(blocksOverlap(daily, { from: 0, to: 60, room: 'c', days: [2] })).toBe(true);
  });
  it('parseDays', () => {
    expect(parseDays(undefined)).toEqual({});
    expect(parseDays(['Fri', 'mon', 'fri'])).toEqual({ days: [0, 4] });
    expect(parseDays(['frday'])).toEqual({ bad: 'frday' });
    expect(parseDays('fri')).toEqual({ bad: 'fri' });
    expect(parseDays([3])).toEqual({ bad: '3' });
    expect(parseDays([])).toEqual({ days: [] });
    expect(parseDays([...WEEKDAYS])).toEqual({});
  });
});
