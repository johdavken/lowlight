// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECODE_MS, decodeFrame, decodeIn, GLYPHS, noise, scrambleIn, WAIT_CHARS } from '../src/room/table/decode';

const onlyGlyphs = (s: string) => [...s.replaceAll(' ', '')].every((c) => GLYPHS.includes(c));

describe('decodeFrame', () => {
  const text = 'A log fills in your name.';
  it('at the start nothing is locked, and the noise keeps the words where they will fall', () => {
    const f = decodeFrame(text, 0);
    expect(f.locked).toBe('');
    expect(f.rest.length).toBe(WAIT_CHARS);
    expect([...text].flatMap((c, i) => (c === ' ' ? [i] : []))).toEqual([...f.rest.slice(0, text.length)].flatMap((c, i) => (c === ' ' ? [i] : [])));
    expect(onlyGlyphs(f.rest)).toBe(true);
  });
  it('halfway the front is the real text, and the block has shrunk', () => {
    const f = decodeFrame(text, 0.5);
    expect(f.locked).toBe(text.slice(0, 12));
    expect(f.locked.length + f.rest.length).toBeLessThan(WAIT_CHARS);
    expect(f.locked.length + f.rest.length).toBeGreaterThan(text.length);
  });
  it('at the end it is the text, with no noise', () => {
    expect(decodeFrame(text, 1)).toEqual({ locked: text, rest: '' });
  });
  it('a line longer than the block keeps its own length', () => {
    const long = 'x'.repeat(WAIT_CHARS + 20);
    expect(decodeFrame(long, 0).rest.length).toBe(long.length);
  });
});

describe('on the page', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('noise is that many glyphs', () => {
    expect(noise(12)).toHaveLength(12);
    expect(onlyGlyphs(noise(40))).toBe(true);
  });
  it('scrambleIn flickers, and stops when the element leaves the page', () => {
    const n = document.body.appendChild(document.createElement('span'));
    scrambleIn(n);
    const first = n.textContent;
    expect(first).toHaveLength(WAIT_CHARS);
    vi.advanceTimersByTime(200);
    expect(n.textContent).not.toBe(first);
    n.remove();
    vi.advanceTimersByTime(200);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('decodeIn ends on exactly the line, with its timer gone', () => {
    const n = document.body.appendChild(document.createElement('span'));
    decodeIn(n, 'A log fills in your name.');
    expect(n.classList.contains('decoding')).toBe(true);
    expect(n.textContent).not.toBe('A log fills in your name.');
    expect(n.querySelector('.tb-noise')).not.toBeNull();
    vi.advanceTimersByTime(DECODE_MS + 100);
    expect(n.textContent).toBe('A log fills in your name.');
    expect(n.querySelector('.tb-noise')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    n.remove();
  });
  it('decodeIn stops if the element leaves the page', () => {
    const n = document.body.appendChild(document.createElement('span'));
    decodeIn(n, 'A line.');
    n.remove();
    vi.advanceTimersByTime(DECODE_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});
