import { describe, expect, it } from 'vitest';
import { tableKeyGate } from '../src/room/table/keys';

const ev = (key: string, more: Partial<Parameters<typeof tableKeyGate>[0]> = {}) => ({ key, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, ...more });
const at = (more: Partial<Parameters<typeof tableKeyGate>[1]> = {}) => ({ blocked: false, pageWaiting: false, field: null, ownsEnter: false, ...more });

describe("the job table's key gate (review 2026-11-15)", () => {
  it('takes a plain key with nothing in its way', () => expect(tableKeyGate(ev('Enter'), at())).toEqual({ typing: false }));
  it('takes nothing while something stands over the table (a screen, the crack terminal, a hidden UI, the bug report)', () => {
    for (const k of ['Enter', 'ArrowLeft', 'Escape', 'p', '1']) expect(tableKeyGate(ev(k), at({ blocked: true }))).toBeNull();
  });
  it('a draft in the prompt keeps every key; an empty prompt marks the press as typing', () => {
    expect(tableKeyGate(ev('Enter'), at({ field: 'hello' }))).toBeNull();
    expect(tableKeyGate(ev('ArrowRight'), at({ field: 'h' }))).toBeNull();
    expect(tableKeyGate(ev('Enter'), at({ field: '' }))).toEqual({ typing: true });
    expect(tableKeyGate(ev('p'), at({ field: '' }))).toEqual({ typing: true });
  });
  it("a reply's waiting page and a control that answers Enter keep their Enter, not the other keys", () => {
    expect(tableKeyGate(ev('Enter'), at({ pageWaiting: true }))).toBeNull();
    expect(tableKeyGate(ev('Enter'), at({ ownsEnter: true }))).toBeNull();
    expect(tableKeyGate(ev('ArrowDown'), at({ pageWaiting: true, ownsEnter: true }))).toEqual({ typing: false });
  });
  it('leaves modified, composing and handled keys alone, and repeats only for arrows', () => {
    for (const m of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing', 'defaultPrevented'] as const) expect(tableKeyGate(ev('Enter', { [m]: true }), at())).toBeNull();
    expect(tableKeyGate(ev('Enter', { repeat: true }), at())).toBeNull();
    expect(tableKeyGate(ev('ArrowRight', { repeat: true }), at())).toEqual({ typing: false });
  });
});
