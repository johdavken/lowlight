import { describe, expect, it } from 'vitest';
import { resolveSchedule } from '../src/character';

const rooms = new Set(['ribbon/lowlight-intake', 'ribbon/noodle-stall']);
const has = (r: string) => rooms.has(r);

describe('resolveSchedule', () => {
  it('keeps good blocks (past midnight too) as minutes', () => {
    const warns: string[] = [];
    expect(resolveSchedule([{ from: '20:00', to: '04:00', room: 'ribbon/lowlight-intake' }, { from: '04:00', to: '08:00', room: 'ribbon/noodle-stall' }], has, (m) => warns.push(m))).toEqual([
      { from: 1200, to: 240, room: 'ribbon/lowlight-intake' },
      { from: 240, to: 480, room: 'ribbon/noodle-stall' },
    ]);
    expect(warns).toEqual([]);
  });
  it('drops a bad block with a warning: same from and to, a bad time, an unknown room, an overlap', () => {
    const warns: string[] = [];
    const out = resolveSchedule(
      [
        { from: '08:00', to: '08:00', room: 'ribbon/noodle-stall' },
        { from: '8:00', to: '09:00', room: 'ribbon/noodle-stall' },
        { from: '10:00', to: '12:00', room: 'ribbon/nowhere' },
        { from: '20:00', to: '04:00', room: 'ribbon/lowlight-intake' },
        { from: '02:00', to: '06:00', room: 'ribbon/noodle-stall' },
        'nope',
      ],
      has,
      (m) => warns.push(m),
    );
    expect(out).toEqual([{ from: 1200, to: 240, room: 'ribbon/lowlight-intake' }]);
    expect(warns).toHaveLength(5);
  });
  it('none, or not a list (with a warning), is no schedule', () => {
    const warns: string[] = [];
    expect(resolveSchedule(undefined, has, (m) => warns.push(m))).toEqual([]);
    expect(resolveSchedule({}, has, (m) => warns.push(m))).toEqual([]);
    expect(warns).toHaveLength(1);
  });

  it('days (spec 2026-10-20 weekdays): kept as indices; unknown or empty dropped; overlaps only on a shared day', () => {
    const warns: string[] = [];
    const out = resolveSchedule(
      [
        { from: '20:00', to: '04:00', room: 'ribbon/lowlight-intake', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
        { from: '20:00', to: '04:00', room: 'ribbon/noodle-stall', days: ['SAT', 'sun'] },
        { from: '10:00', to: '12:00', room: 'ribbon/noodle-stall', days: ['frday'] },
        { from: '10:00', to: '12:00', room: 'ribbon/noodle-stall', days: [] },
        { from: '01:00', to: '02:00', room: 'ribbon/noodle-stall', days: ['sat'] },
        { from: '12:00', to: '13:00', room: 'ribbon/noodle-stall', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      ],
      has,
      (m) => warns.push(m),
    );
    expect(out).toEqual([
      { from: 1200, to: 240, room: 'ribbon/lowlight-intake', days: [0, 1, 2, 3, 4] },
      { from: 1200, to: 240, room: 'ribbon/noodle-stall', days: [5, 6] },
      { from: 720, to: 780, room: 'ribbon/noodle-stall' },
    ]);
    expect(warns).toEqual([
      "schedule[2]: unknown day 'frday'; dropped",
      'schedule[3]: no days; dropped',
      'schedule[4]: overlaps an earlier block; dropped', // Sat 01:00 is inside Friday's night
    ]);
  });
});
