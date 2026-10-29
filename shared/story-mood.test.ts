import { describe, expect, it } from 'vitest';
import { moodFor } from './story-mood';

const ALL = ['late', 'quiet', 'tense', 'dawn', 'last-call', 'closing-up', 'closed', 'after-the-job'];
const at = (day: number, hhmm: string) => (day - 1) * 1440 + Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const TILT = { open: '20:00', close: '04:00' };

describe('moodFor', () => {
  it('each rule of the table', () => {
    expect(moodFor({ moods: ALL, now: at(2, '21:00'), job: 'on' })).toEqual({ key: 'job', mood: 'tense' });
    expect(moodFor({ moods: ALL, now: at(2, '21:00'), job: 'after' })).toEqual({ key: 'after-job', mood: 'after-the-job' });
    expect(moodFor({ moods: ALL, now: at(2, '00:30'), job: null })).toEqual({ key: 'late@2', mood: 'late' });
    expect(moodFor({ moods: ALL, now: at(2, '05:00'), job: null })).toEqual({ key: 'dawn@2', mood: 'dawn' });
  });

  it("the Tilt's overnight hours", () => {
    expect(moodFor({ moods: ALL, hours: TILT, now: at(3, '03:45'), job: null })).toEqual({ key: 'last-call@3', mood: 'last-call' });
    expect(moodFor({ moods: ALL, hours: TILT, now: at(3, '04:10'), job: null })).toEqual({ key: 'closing@3', mood: 'closing-up' });
    expect(moodFor({ moods: ALL, hours: TILT, now: at(3, '05:00'), job: null })).toEqual({ key: 'closed@3', mood: 'closed' });
    expect(moodFor({ moods: ALL, hours: TILT, now: at(3, '19:00'), job: null })).toEqual({ key: 'closed@3', mood: 'closed' });
    expect(moodFor({ moods: ALL, hours: TILT, now: at(2, '23:00'), job: null })).toBeNull();
  });

  it('a daytime close keys its windows on the day they started', () => {
    const hours = { open: '10:00', close: '22:00' };
    expect(moodFor({ moods: ALL, hours, now: at(1, '21:45'), job: null })).toEqual({ key: 'last-call@1', mood: 'last-call' });
    expect(moodFor({ moods: ALL, hours, now: at(2, '02:00'), job: null })).toEqual({ key: 'closed@1', mood: 'closed' });
  });

  it('a rule whose moods the room lacks falls through to the next', () => {
    const plain = ['late', 'quiet', 'tense'];
    expect(moodFor({ moods: plain, now: at(2, '05:00'), job: null })).toBeNull();
    expect(moodFor({ moods: plain, now: at(2, '21:00'), job: 'after' })).toBeNull();
    expect(moodFor({ moods: plain, hours: TILT, now: at(2, '00:30'), job: null })).toEqual({ key: 'late@2', mood: 'late' });
    expect(moodFor({ moods: ['closing', 'lights-out'], hours: TILT, now: at(3, '04:10'), job: null })).toEqual({ key: 'closing@3', mood: 'closing' });
    expect(moodFor({ moods: ['closing', 'lights-out'], hours: TILT, now: at(3, '06:00'), job: null })).toEqual({ key: 'closed@3', mood: 'lights-out' });
    expect(moodFor({ moods: ['after-hours'], now: at(2, '21:00'), job: 'after' })).toEqual({ key: 'after-job', mood: 'after-hours' });
  });

  it('nothing at 21:00 with no hours and no job', () => expect(moodFor({ moods: ALL, now: at(1, '21:00'), job: null })).toBeNull());

  it('a job beats the venue and the clock', () => {
    expect(moodFor({ moods: ALL, hours: TILT, now: at(3, '03:45'), job: 'on' })).toEqual({ key: 'job', mood: 'tense' });
  });

  it('odd hours never make an all-day closed (story moods minors)', () => {
    const allDay = { open: '00:00', close: '00:00' };
    expect(moodFor({ moods: ALL, hours: allDay, now: at(2, '00:30'), job: null })).toEqual({ key: 'late@2', mood: 'late' });
    expect(moodFor({ moods: ALL, hours: allDay, now: at(2, '12:00'), job: null })).toBeNull();
    const quick = { open: '04:15', close: '04:00' };
    expect(moodFor({ moods: ALL, hours: quick, now: at(3, '04:10'), job: null })).toEqual({ key: 'closing@3', mood: 'closing-up' });
    expect(moodFor({ moods: ALL, hours: quick, now: at(3, '04:20'), job: null })).toEqual({ key: 'late@3', mood: 'late' }); // open again: the clock's late
    expect(moodFor({ moods: ALL, hours: quick, now: at(3, '12:00'), job: null })).toBeNull();
  });
});
