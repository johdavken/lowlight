// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECODE_MS, decodeFrame, decodeIn, GLYPHS, noise, noiseWord, scrambleIn, WAIT_CHARS } from '../src/room/table/decode';

/** In letters: a glyph is two, a space one. */
const width = (s: string) => [...s].reduce((a, c) => a + (c === ' ' ? 1 : 2), 0);
const onlyGlyphs = (s: string) => [...s.replaceAll(' ', '')].every((c) => GLYPHS.includes(c));

describe('decodeFrame', () => {
  const text = 'A log fills in your name.';
  it('at the start nothing is locked, and the noise keeps the words where they will fall', () => {
    const f = decodeFrame(text, 0);
    expect(f.locked).toBe('');
    // Each word wears half its letters in glyphs (each glyph two letters wide), the spaces kept, so the words fall where
    // they will; the rest of the block pads it out to about a line.
    const half = (w: string) => Math.ceil(w.length / 2);
    const words = text.split(' ');
    expect(f.rest.split(' ').slice(0, words.length - 1).map((w) => w.length)).toEqual(words.slice(0, -1).map(half));
    expect(width(f.rest)).toBeGreaterThanOrEqual(WAIT_CHARS - 2);
    expect(width(f.rest)).toBeLessThanOrEqual(WAIT_CHARS + 2);
    expect(onlyGlyphs(f.rest)).toBe(true);
  });
  it('halfway the front is the real text, and the block has shrunk', () => {
    const f = decodeFrame(text, 0.5);
    expect(f.locked).toBe(text.slice(0, 12));
    expect(f.locked.length + width(f.rest)).toBeLessThan(WAIT_CHARS);
    expect(f.locked.length + width(f.rest)).toBeGreaterThan(text.length);
  });
  it('at the end it is the text, with no noise', () => {
    expect(decodeFrame(text, 1)).toEqual({ locked: text, rest: '' });
  });
  it('a line longer than the block keeps its own length', () => {
    const long = 'x'.repeat(WAIT_CHARS + 20);
    expect(width(decodeFrame(long, 0).rest)).toBe(long.length);
  });
});

describe('on the page', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('noise is that many letters wide: half as many Chinese glyphs', () => {
    expect(noise(12)).toHaveLength(6);
    expect(noise(13)).toHaveLength(7);
    expect(noiseWord('knocks')).toHaveLength(3);
    expect(onlyGlyphs(noise(40))).toBe(true);
    expect([...GLYPHS].every((c) => /\p{Script=Han}/u.test(c))).toBe(true);
    expect(new Set(GLYPHS).size).toBe([...GLYPHS].length);
  });
  it('scrambleIn flickers, and stops when the element leaves the page', () => {
    const n = document.body.appendChild(document.createElement('span'));
    scrambleIn(n);
    const first = n.textContent;
    expect(first).toHaveLength(WAIT_CHARS / 2);
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
