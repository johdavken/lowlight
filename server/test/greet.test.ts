import { describe, expect, it } from 'vitest';
import { arrivalLine, greetDue } from '../src/greet';
import type { ChatMessage } from '../../shared/types';

const H = 60 * 60 * 1000;
const NOW = 1_000 * H;
const m = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'x', role: 'agent', text: 'hi', toolLines: [], ts: NOW, status: 'ok', ...over });

describe('greetDue', () => {
  it('is due on a first meeting', () => expect(greetDue(undefined, NOW)).toBe(true));
  it('is due when the newest line is the opening scene (Review Focus 1)', () => expect(greetDue(m({ role: 'user', mode: 'scene', ts: NOW - 1000 }), NOW)).toBe(true));
  it('is due after a gap of 6 hours or more', () => expect(greetDue(m({ ts: NOW - 6 * H }), NOW)).toBe(true));
  it('is not due just under the gap', () => expect(greetDue(m({ ts: NOW - 6 * H + 1 }), NOW)).toBe(false));
  it('is due right after an END SCENE line', () => expect(greetDue(m({ role: 'user', mode: 'end', ts: NOW - 1000 }), NOW)).toBe(true));
  it('is due right after her reply to END SCENE', () => expect(greetDue(m({ mode: 'end', ts: NOW - 1000 }), NOW)).toBe(true));
  it('is not due in a fresh conversation', () => expect(greetDue(m({ ts: NOW - 1000 }), NOW)).toBe(false));
  it('is due right after her goodbye to a LEAVE', () => expect(greetDue(m({ mode: 'end', replyTo: 'l1', ts: NOW - 1000 }), NOW)).toBe(true));
  it('an undelivered END SCENE line is no ended scene', () => expect(greetDue(m({ role: 'user', mode: 'end', status: 'failed', ts: NOW - 1000 }), NOW)).toBe(false));
  it('an undelivered END SCENE line still counts toward the gap', () => expect(greetDue(m({ role: 'user', mode: 'end', status: 'failed', ts: NOW - 7 * H }), NOW)).toBe(true));
});

describe('arrivalLine with a tie', () => {
  it('a first meeting with someone she knows from before', () => {
    expect(arrivalLine(undefined, NOW, { known: true })).toBe('[arrival: first time this story, but you know them]');
    expect(arrivalLine(undefined, NOW)).toBe('[arrival: first meeting]');
    expect(arrivalLine(m({ mode: 'end', ts: NOW - 40 * 60 * 1000 }), NOW, { known: true })).toBe('[arrival: back 40 min after the scene ended]');
  });
});

describe('arrivalLine', () => {
  it('first meeting', () => expect(arrivalLine(undefined, NOW)).toBe('[arrival: first meeting]'));
  it('after a gap, in days', () => expect(arrivalLine(m({ ts: NOW - 3 * 24 * H - 5 }), NOW)).toBe('[arrival: back after 3 days]'));
  it('after a gap, in hours', () => expect(arrivalLine(m({ ts: NOW - 7 * H }), NOW)).toBe('[arrival: back after 7 hours]'));
  it('after a gap, in weeks', () => expect(arrivalLine(m({ ts: NOW - 15 * 24 * H }), NOW)).toBe('[arrival: back after 2 weeks]'));
  it('48 hours rolls over into days', () => expect(arrivalLine(m({ ts: NOW - 48 * H }), NOW)).toBe('[arrival: back after 2 days]'));
  it('singular units', () => expect(arrivalLine(m({ ts: NOW - 1 * H }), NOW)).toBe('[arrival: back after 1 hour]'));
  it('after an ended scene', () => expect(arrivalLine(m({ mode: 'end', ts: NOW - 40 * 60 * 1000 }), NOW)).toBe('[arrival: back 40 min after the scene ended]'));
  it('after an undelivered END SCENE line, a plain gap', () =>
    expect(arrivalLine(m({ role: 'user', mode: 'end', status: 'failed', ts: NOW - 7 * H }), NOW)).toBe('[arrival: back after 7 hours]'));
  it('never says 0 min', () => expect(arrivalLine(m({ role: 'user', mode: 'end', ts: NOW - 5 }), NOW)).toBe('[arrival: back 1 min after the scene ended]'));
});

describe('arrivalLine on the story clock (2026-10-20: WAIT then rejoin said "a minute")', () => {
  it('with a story clock on both ends, the gap is story time, not wall time', () => {
    // A minute of wall time, six hours of story time (a WAIT on /solo).
    const prev = m({ ts: NOW - 60 * 1000, clock: 1200 });
    expect(arrivalLine(prev, NOW, { clock: 1200 + 6 * 60 })).toBe('[arrival: back after 6 hours]');
    expect(arrivalLine(m({ mode: 'end', ts: NOW - 60 * 1000, clock: 1200 }), NOW, { clock: 1200 + 26 * 60 })).toBe('[arrival: back 26 hours after the scene ended]');
  });
  it('with no story clock, wall time as before', () => {
    expect(arrivalLine(m({ ts: NOW - 40 * 60 * 1000 }), NOW, { clock: null })).toBe('[arrival: back after 40 min]');
    expect(arrivalLine(m({ ts: NOW - 40 * 60 * 1000, clock: 1200 }), NOW)).toBe('[arrival: back after 40 min]');
  });
});
