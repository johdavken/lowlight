import { describe, expect, test } from 'vitest';
import type { ChatMessage } from './types';
import { encounterText, parseEncounter, parseEncounterOptions, strangerAt } from './encounter';

const R = ['Hicks', 'Nix', 'Hae'];

describe('parseEncounterOptions', () => {
  test('three events from a ```json fence; strangers optional', () => {
    const ans =
      'Here you go:\n```json\n[{"title":"Wrong package","text":"A courier drops a box.","stranger":{"name":"Courier","voice":"clipped"}},{"title":"Blackout","text":"The grid drops.","stranger":null},{"title":"Regular","text":"An old man sits."}]\n```';
    const out = parseEncounterOptions(ans, R)!;
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ title: 'Wrong package', text: 'A courier drops a box.', stranger: { name: 'Courier', voice: 'clipped' } });
    expect(out[1].stranger).toBeUndefined();
    expect('stranger' in out[1]).toBe(false);
    expect(out[2].stranger).toBeUndefined();
  });

  test('the wrong count, a 41-character title or a 601-character text is null', () => {
    const ev = (title: string, text: string) => ({ title, text });
    expect(parseEncounterOptions(JSON.stringify([ev('A', 'a.'), ev('B', 'b.')]), R)).toBeNull();
    expect(parseEncounterOptions(JSON.stringify([ev('x'.repeat(41), 'a.'), ev('B', 'b.'), ev('C', 'c.')]), R)).toBeNull();
    expect(parseEncounterOptions(JSON.stringify([ev('A', 'x'.repeat(601)), ev('B', 'b.'), ev('C', 'c.')]), R)).toBeNull();
    expect(parseEncounterOptions('no json here', R)).toBeNull();
  });
});

describe('parseEncounter', () => {
  test('a reserved or malformed stranger is dropped, the event kept', () => {
    for (const name of ['nix', '**Hae**', ' HICKS ', 'x'.repeat(25), '4chan', '']) {
      const e = parseEncounter({ title: 'T', text: 'X.', stranger: { name, voice: 'v' } }, R);
      expect(e).toEqual({ title: 'T', text: 'X.' });
    }
    expect(parseEncounter({ title: 'T', text: 'X.', stranger: { name: 'Courier', voice: 'v'.repeat(121) } }, R)).toEqual({ title: 'T', text: 'X.' });
  });

  test("a good stranger is kept, trimmed; names may have spaces, - and '", () => {
    expect(parseEncounter({ title: ' T ', text: ' X. ', stranger: { name: " Old Man O'Neil-Wen ", voice: ' slow ' } }, R)).toEqual({
      title: 'T',
      text: 'X.',
      stranger: { name: "Old Man O'Neil-Wen", voice: 'slow' },
    });
  });

  test('a bad event is null', () => {
    expect(parseEncounter({ title: 'a\nb', text: 'X.' }, R)).toBeNull();
    expect(parseEncounter({ title: 'T' }, R)).toBeNull();
    expect(parseEncounter('nope', R)).toBeNull();
  });
});

describe('encounterText', () => {
  test('quotes become single, one stop at the end', () => {
    expect(encounterText({ title: 'Say "hi"', text: 'A knock.' }, (s) => s)).toBe(`[event: "Say 'hi'": A knock.]`);
    expect(encounterText({ title: 'T', text: 'No stop' }, (s) => s)).toBe('[event: "T": No stop.]');
    expect(encounterText({ title: 'T', text: 'Line\none' }, (s) => s.replace(/\s+/g, ' '))).toBe('[event: "T": Line one.]');
  });
});

describe('strangerAt', () => {
  let n = 0;
  const row = (m: Partial<ChatMessage>): ChatMessage => ({ id: `m${n++}`, role: 'user', text: 'x', toolLines: [], ts: n, status: 'ok', ...m });
  const enc = (name?: string) => row({ mode: 'encounter', encounter: { title: 'T', ...(name ? { stranger: { name, voice: 'v' } } : {}) } });
  const agent = () => row({ role: 'agent' });

  test('present after the event; walked past an event without one; gone after END SCENE or travel; replaced', () => {
    const rows = [row({}), enc('Courier'), agent(), enc(), agent(), row({ mode: 'end' }), agent(), enc('Wen'), row({ mode: 'travel' }), agent()];
    expect(strangerAt(rows, 0)).toBeNull();
    expect(strangerAt(rows, 1)).toEqual({ name: 'Courier', voice: 'v' });
    expect(strangerAt(rows, 2)?.name).toBe('Courier');
    expect(strangerAt(rows, 4)?.name).toBe('Courier');
    expect(strangerAt(rows, 6)).toBeNull();
    expect(strangerAt(rows, 7)?.name).toBe('Wen');
    expect(strangerAt(rows, 9)).toBeNull();
  });

  test('the END SCENE row itself and her reply to it still have the stranger (she closes the scene with them there)', () => {
    const rows = [enc('Courier'), agent(), row({ mode: 'end' })];
    const end = rows[2];
    rows.push(row({ role: 'agent', replyTo: end.id }), row({}));
    expect(strangerAt(rows, 2)?.name).toBe('Courier');
    expect(strangerAt(rows, 3)?.name).toBe('Courier');
    expect(strangerAt(rows, 4)).toBeNull();
  });

  test('a failed END SCENE does not end presence; a newer stranger replaces the old', () => {
    const rows = [enc('Courier'), agent(), row({ mode: 'end', status: 'failed' }), agent(), enc('Wen'), agent()];
    expect(strangerAt(rows, 3)?.name).toBe('Courier');
    expect(strangerAt(rows, 5)?.name).toBe('Wen');
  });

  test('a failed encounter row brings nobody; an index past the end is the last row', () => {
    const rows = [enc('Courier'), agent(), { ...enc('Wen'), status: 'failed' as const }, agent()];
    expect(strangerAt(rows, 3)?.name).toBe('Courier');
    expect(strangerAt(rows, 99)?.name).toBe('Courier');
    expect(strangerAt([], 0)).toBeNull();
  });
});

describe('a power cut event (blackouts phase 3 §2)', () => {
  const ev = { title: 'Dark', text: 'The grid drops.' };
  test('keeps "power": "out", and only that', () => {
    expect(parseEncounter({ ...ev, power: 'out' }, [])).toEqual({ ...ev, power: 'out' });
    expect(parseEncounter({ ...ev, power: 'on' }, [])).toEqual(ev);
    expect(parseEncounter({ ...ev, power: true }, [])).toEqual(ev);
  });
  test("drops it when the event's text says nothing of the power going (live check: an envelope under the door came tagged)", () => {
    expect(parseEncounter({ title: 'Fee envelope', text: 'A thin envelope slides under the door.', power: 'out' }, [])).toEqual({ title: 'Fee envelope', text: 'A thin envelope slides under the door.' });
    for (const text of ['The lights all die.', 'The lights flicker and die.', 'The neon gutters out.', 'The room plunges into darkness.', 'The block is going dark.', 'The grid drops.', 'The lights die one by one.', 'A blackout rolls down the stack.', 'Power cuts out across the block.', 'The breaker trips and the building goes dark.'])
      expect(parseEncounter({ title: 'X', text, power: 'out' }, [])?.power, text).toBe('out');
  });
  test('drops it where the power is already out', () => {
    expect(parseEncounter({ ...ev, power: 'out' }, [], { dark: true })).toEqual(ev);
    const text = JSON.stringify([{ ...ev, power: 'out' }, ev, ev]);
    expect(parseEncounterOptions(text, [], { dark: true })![0]).toEqual(ev);
    expect(parseEncounterOptions(text, [])![0]).toEqual({ ...ev, power: 'out' });
  });
});
