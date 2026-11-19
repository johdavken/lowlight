import { describe, expect, it } from 'vitest';
import type { Way } from './crew-ways';
import { crewGrade, freshCrew, landWay, MOVES, moveOf, programCard, throwLine, throwOf } from './crew-rules';

const way = (o: Partial<Way> = {}): Way => ({ key: { kind: 'you', name: '' }, line: 'You do it.', to: 'done', when: null, take: 0, alarm: 0, heat: 0, clocks: {}, cut: 0, lose: 0, sets: [], ...o });

describe('landWay', () => {
  it('lands what the way says', () => {
    const l = landWay(way({ take: 1, alarm: 1, heat: 2, cut: 10, lose: 1, clocks: { hears: 2 }, harm: 'hurt' }), {}, { getaway: false });
    expect(l).toEqual({ take: 1, alarm: 1, heat: 2, cut: 10, lose: 1, clocks: { hears: 2 }, harm: 'hurt', wallUsed: false });
  });

  it('noAlarm zeroes alarm, noHeat zeroes heat', () => {
    expect(landWay(way({ alarm: 2 }), { noAlarm: true }, { getaway: false }).alarm).toBe(0);
    expect(landWay(way({ heat: 2 }), { noHeat: true }, { getaway: false }).heat).toBe(0);
  });

  it('plusTake adds 1 only when the way fills TAKE', () => {
    expect(landWay(way({ take: 1 }), { plusTake: true }, { getaway: false }).take).toBe(2);
    expect(landWay(way({ take: 0 }), { plusTake: true }, { getaway: false }).take).toBe(0);
  });

  it('wall takes one off alarm and is used only when there was alarm', () => {
    expect(landWay(way({ alarm: 2 }), { wall: true }, { getaway: false })).toMatchObject({ alarm: 1, wallUsed: true });
    expect(landWay(way({ alarm: 0 }), { wall: true }, { getaway: false })).toMatchObject({ alarm: 0, wallUsed: false });
    expect(landWay(way({ alarm: 1 }), { wall: true, noAlarm: true }, { getaway: false })).toMatchObject({ alarm: 0, wallUsed: false });
  });

  it('a getaway fills no TAKE whatever the way says', () => {
    const l = landWay(way({ take: 2, alarm: 1, clocks: { hears: 1 } }), { plusTake: true }, { getaway: true });
    expect(l).toMatchObject({ take: 0, alarm: 1, clocks: { hears: 1 } });
  });
});

describe('the throw', () => {
  it('is the same on every call for a seed', () => {
    expect(throwOf('a')).toEqual(throwOf('a'));
    const t = throwOf('a');
    expect(t.die).toBeGreaterThanOrEqual(1);
    expect(t.die).toBeLessThanOrEqual(6);
    expect(t.through).toBe(t.die >= 4);
  });

  it('goes through about half the time', () => {
    let n = 0;
    for (let i = 0; i < 600; i++) if (throwOf(`seed-${i}`).through) n++;
    expect(n / 600).toBeGreaterThan(0.4);
    expect(n / 600).toBeLessThan(0.6);
  });

  it('says how it went', () => {
    expect(throwLine('Kit', true)).toBe('Kit gets it done the hard way.');
    expect(throwLine('Kit', false)).toBe('Kit is out of their depth, and it shows.');
  });
});

describe('crewGrade', () => {
  const end = { take: 3, size: 3, alarm: 1, blown: false, harmed: false };
  it('grades the end', () => {
    expect(crewGrade(end)).toBe('clean');
    expect(crewGrade({ ...end, alarm: 2 })).toBe('messy');
    expect(crewGrade({ ...end, harmed: true })).toBe('messy');
    expect(crewGrade({ ...end, take: 2 })).toBe('messy');
    expect(crewGrade({ ...end, take: 0 })).toBe('blown');
    expect(crewGrade({ ...end, blown: true })).toBe('blown');
  });
});

describe('moves', () => {
  it('one per specialty, none for a fence', () => {
    expect(moveOf('face')).toBe('cover-story');
    expect(moveOf('runner')).toBe('loop-the-cams');
    expect(moveOf('ears')).toBe('listen-in');
    expect(moveOf('muscle')).toBe('hold-the-door');
    expect(moveOf('fence')).toBeNull();
    expect(moveOf('wheel')).toBeNull();
  });

  it('listen-in borrows heard-it-first art', () => {
    expect(MOVES['listen-in'].art).toBe('heard-it-first.webp');
    expect(MOVES['cover-story'].spec).toBe('face');
  });
});

describe('state and ids', () => {
  it('starts empty', () => {
    expect(freshCrew()).toEqual({ goes: {}, clocks: {}, mods: {}, modsBeat: null, cut: 0, heat: 0 });
    expect(freshCrew()).not.toBe(freshCrew());
  });
  it('names a program card', () => {
    expect(programCard('firewall')).toBe('p:firewall');
  });
});
