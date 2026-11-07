import { describe, expect, it } from 'vitest';
import { addWitness, clipWitness, inTheRoom, parseWitness, sceneRows, WITNESS_SCENE_MAX, witnessedScene, WITNESS_MAX, WITNESS_DAY_MAX, witnessedLine, witnessKey, witnessPrefix, type Witness } from './witness';
import type { ChatMessage } from './types';

const w = (text: string, at: number, scene = 'karasu/zhou-flat'): Witness => ({ text, at, scene });
const name = () => 'the Zhou flat';

// "…and that Spectra watching him Silas admitted…": the next turn's sentence ran on from a cut one (playtest).
it('clipWitness ends a long sentence as a sentence, at a comma if it has one', () => {
  const saw = `I told Hicks ${'a'.repeat(100)}, that my brother found it and won't tell me, and that Spectra watching him isn't about a band at all.`;
  expect(clipWitness(saw)).toBe(`I told Hicks ${'a'.repeat(100)}, that my brother found it and won't tell me.`);
});

describe('witnessedLine', () => {
  // She had the facts but played them as guesses, then asked "You talked to him?" (playtest).
  it('tells her she was in the room, and the player saw her there', () => {
    const line = witnessedLine([w('Hicks took the job.', 360)], 0, name, 'Hicks')!;
    expect(line).toContain('You were in the room for this yourself');
    expect(line).toContain('Hicks saw you there');
    expect(line).toContain("Don't ask about it");
  });
  it('no entries, no line', () => expect(witnessedLine([], 3, name, 'Hicks')).toBeNull());
  it('reads newest first with place and when', () => {
    const day = 360 + 1440 * 3;
    expect(witnessedLine([w('old', day - 1440), w('new', day + 60)], 3, name, 'Hicks')).toBe(`[you were there: at the Zhou flat, tonight — new; at the Zhou flat, last night — old. ${inTheRoom('Hicks')}]`);
  });
  it('shows the newest four', () => {
    const line = witnessedLine([1, 2, 3, 4, 5].map((n) => w(`t${n}`, n)), 0, name, 'Hicks')!;
    expect(line).toContain('t5');
    expect(line).toContain('t2');
    expect(line).not.toContain('t1');
  });
});

it('a line ending in a full stop reads once', () => {
  expect(witnessedLine([w('He came.', 360)], 0, name, 'Hicks')).toBe(`[you were there: at the Zhou flat, tonight — He came. ${inTheRoom('Hicks')}]`);
});

describe('clipWitness', () => {
  it('leaves a short line alone', () => expect(clipWitness('He came.')).toBe('He came.'));
  it('cuts at a sentence end (live: halves ran together)', () => {
    expect(clipWitness(`He came. ${'x '.repeat(WITNESS_MAX)}`)).toBe('He came.');
  });
  it('with no sentence end or comma, at a word, closed', () => {
    const r = clipWitness('word '.repeat(WITNESS_MAX));
    expect(r.length).toBeLessThanOrEqual(WITNESS_MAX);
    expect(r.endsWith('word.')).toBe(true);
  });
});

describe('addWitness', () => {
  it('starts the day', () => expect(addWitness(null, 'He came.')).toBe('He came.'));
  it('adds to what they carry (playtest: four rewrites lost the job)', () => expect(addWitness('He came.', 'He took the job.')).toBe('He came. He took the job.'));
  it('the same thing twice is once', () => expect(addWitness('He came.', 'He came.')).toBe('He came.'));
  it('over the day\'s cap, the oldest sentences go', () => {
    const first = `${'a'.repeat(500)}.`;
    const second = `${'b'.repeat(250)}.`;
    expect(addWitness(`${first} ${second}`, `${'c'.repeat(200)}.`)).toBe(`${second} ${'c'.repeat(200)}.`);
  });
  it('never goes over the cap', () => {
    expect(addWitness('x'.repeat(WITNESS_DAY_MAX), 'y'.repeat(200)).length).toBeLessThanOrEqual(WITNESS_DAY_MAX);
  });
});

describe('parseWitness', () => {
  it('reads an entry', () => expect(parseWitness('{"text":"x","at":5,"scene":"a"}')).toEqual({ text: 'x', at: 5, scene: 'a' }));
  it('a damaged value reads as nothing', () => {
    expect(parseWitness('not json')).toBeNull();
    expect(parseWitness('{"text":1}')).toBeNull();
    expect(parseWitness(null)).toBeNull();
  });
});

it('keys fall under the prefix', () => {
  expect(witnessKey('hicks', 'ember', 3).startsWith(witnessPrefix('hicks', 'ember'))).toBe(true);
  expect(witnessKey('hicks', 'ember', 3)).toBe('witness.hicks.ember.3');
});

// She heard Silas explain the flag on his trail, then said his deck's always shut: a summary keeps pieces (playtest).
describe('sceneRows', () => {
  const row = (id: string, clock: number, more: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'agent', text: id, toolLines: [], ts: clock, status: 'ok', clock, ...more });
  const ids = (rows: ChatMessage[]) => rows.map((r) => r.id);
  it('starts after the last arrival, and stops at the entry', () => {
    const rows = [row('walkway', 360), row('walked in', 370, { mode: 'travel', role: 'user' }), row('flat', 380), row('later', 500)];
    expect(ids(sceneRows(rows, 380))).toEqual(['flat']);
  });
  it('keeps to that night', () => expect(ids(sceneRows([row('night before', 300), row('tonight', 400)], 400))).toEqual(['tonight']));
  it('leaves out asides, texts, games, failed turns and empty rows', () => {
    const rows = [row('ooc', 400, { mode: 'ooc' }), row('text', 401, { mode: 'text' }), row('dice', 402, { mode: 'dice' }), row('failed', 403, { status: 'failed' }), row('', 404, { mode: 'greet', role: 'user' }), row('said', 405), row('beat', 406, { mode: 'quest', role: 'user' }), row('bye', 407, { mode: 'end' })];
    expect(ids(sceneRows(rows, 407))).toEqual(['said', 'beat', 'bye']);
  });
});

describe('witnessedScene', () => {
  const row = (text: string, more: Partial<ChatMessage> = {}): ChatMessage => ({ id: text, role: 'agent', text, toolLines: [], ts: 1, status: 'ok', clock: 400, ...more });
  const o = { place: 'the Zhou flat', ago: 'last night', player: 'Hicks', contact: 'Silas' };
  it('no rows, no block', () => expect(witnessedScene([], o)).toBeNull());
  it('says who said what: a job beat is narration, its you is the player', () => {
    const block = witnessedScene([row('*You watch the screen.*', { role: 'user', mode: 'quest' }), row('What band?', { role: 'user' }), row('Nothing.\n\nThere might be nothing.')], o)!;
    expect(block).toContain('(narration) *You watch the screen.*');
    expect(block).toContain('Hicks: What band?');
    expect(block).toContain('Silas: Nothing. There might be nothing.');
    expect(block).toContain('the Zhou flat, last night');
    expect(block).toContain('"you" in narration is Hicks');
  });
  it('tells her it beats her older notes', () => expect(witnessedScene([row('Hi.')], o)).toContain('newer than your notes'));
  it('a long night loses its oldest rows first', () => {
    const block = witnessedScene([row(`old ${'x'.repeat(WITNESS_SCENE_MAX)}`), row('new')], o)!;
    expect(block).not.toContain('old x');
    expect(block).toContain('Silas: new');
  });
});
