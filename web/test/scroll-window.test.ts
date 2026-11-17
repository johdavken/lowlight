import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { END_READ, endIndex, fitHeight, MAX_ROWS, READ_MIN_MS, READ_MS_PER_CHAR, readMs, scroller, visibleRows, WHEEL_STEP, type RowGeom, type ScrollHost } from '../src/landing/scroll-window';
import { assign, easeInOut } from '../src/landing/glyph-fly';
import { rng } from '../../shared/rng';

/** Rows `h` tall, one after another, `letters` each (a gap row: 0). */
const rowsOf = (letters: number[], h = 30): RowGeom[] => letters.map((n, i) => ({ top: i * h, h, letters: n }));

describe('scroll window geometry', () => {
  it('reads a row at 40 ms a letter, never under the minimum', () => {
    expect(readMs(100)).toBe(100 * READ_MS_PER_CHAR);
    expect(readMs(0)).toBe(READ_MIN_MS);
  });

  it('fits down to the row that brings the letters up to what the name needs', () => {
    const rows = rowsOf([80, 0, 80, 80, 80]);
    expect(fitHeight(rows, 100, 30)).toBe(3 * 30 + 4);
    expect(fitHeight(rows, 160, 30)).toBe(3 * 30 + 4);
    expect(fitHeight(rows, 161, 30)).toBe(4 * 30 + 4);
  });

  it('never grows past MAX_ROWS lines, and a short page fits whole', () => {
    expect(fitHeight(rowsOf(new Array(30).fill(10)), 10_000, 30)).toBe(MAX_ROWS * 30);
    expect(fitHeight(rowsOf([5, 5]), 10_000, 30)).toBe(2 * 30 + 4);
  });

  it('a window shows the rows wholly inside it', () => {
    const rows = rowsOf([1, 1, 1, 1, 1, 1]);
    expect(visibleRows(rows, 0, 94)).toEqual([0, 1, 2]);
    expect(visibleRows(rows, 2, 94)).toEqual([2, 3, 4]);
    expect(visibleRows(rows, 0, 89)).toEqual([0, 1]);
  });

  it('ends at the first top row that brings the last row in', () => {
    expect(endIndex(rowsOf([1, 1, 1, 1, 1, 1]), 94)).toBe(3);
    expect(endIndex(rowsOf([1, 1]), 94)).toBe(0);
  });
});

describe('glyph flights', () => {
  it('pairs every target with a source, reusing the side that runs short', () => {
    const r = rng(3);
    const many = assign(3, 10, r);
    expect(many).toHaveLength(10);
    expect(new Set(many.map(([, t]) => t)).size).toBe(10);
    const few = assign(10, 3, r);
    expect(few).toHaveLength(10);
    expect(new Set(few.map(([s]) => s)).size).toBe(10);
    expect(new Set(few.map(([, t]) => t))).toEqual(new Set([0, 1, 2]));
    expect(assign(0, 5, r)).toEqual([]);
  });

  it('eases in and out', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });
});

describe('scroller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A host over six 10-letter rows, three to a window; moves land when the test says. */
  const makeHost = () => {
    const calls: string[] = [];
    const flights: (() => void)[] = [];
    const host: ScrollHost = {
      rows: rowsOf([10, 10, 10, 10, 10, 10]),
      H: 94,
      moveTo: (to, from, entering, leaving, done) => {
        calls.push(`move ${from}->${to} in[${entering}] out[${leaving}]`);
        // A flight lands once, by itself (land) or when finished early.
        let landed = false;
        const land1 = () => {
          if (landed) return;
          landed = true;
          done();
        };
        flights.push(land1);
        return { finish: () => (calls.push('landed early'), land1()), stop: () => (landed = true) };
      },
      showAll: (s) => calls.push(`all ${s}`),
      onEnd: () => calls.push('end'),
      onScrolling: () => {},
      next: () => calls.push('next'),
      back: () => calls.push('back'),
    };
    const land = () => flights.splice(0).forEach((f) => f());
    return { host, calls, land };
  };

  it('crawls a row each time the top row has been read, the leaving row flying into the new one', () => {
    const { host, calls, land } = makeHost();
    scroller(host);
    vi.advanceTimersByTime(readMs(10) - 1);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['move 0->1 in[3] out[0]']);
    // The next wait starts once the row has landed.
    vi.advanceTimersByTime(readMs(10));
    expect(calls).toHaveLength(1);
    land();
    vi.advanceTimersByTime(readMs(10));
    expect(calls.at(-1)).toBe('move 1->2 in[4] out[1]');
  });

  it('at the end it says so, holds a share of the window\'s reading time, then goes on to the next page', () => {
    const { host, calls, land } = makeHost();
    const sc = scroller(host);
    sc.key();
    expect(calls).toEqual(['all 3', 'end']);
    vi.advanceTimersByTime(readMs(30) * END_READ - 1);
    expect(calls).not.toContain('next');
    vi.advanceTimersByTime(1);
    expect(calls.at(-1)).toBe('next');
    void land;
  });

  it('the wheel moves a row either way once it adds up to a step; past the top is the page before', () => {
    const { host, calls, land } = makeHost();
    const sc = scroller(host);
    sc.wheel(WHEEL_STEP / 2);
    expect(calls).toEqual([]);
    sc.wheel(WHEEL_STEP / 2);
    expect(calls).toEqual(['move 0->1 in[3] out[0]']);
    // A wheel while a row is in flight lands it first.
    sc.wheel(-WHEEL_STEP);
    expect(calls.slice(-2)).toEqual(['landed early', 'move 1->0 in[0] out[3]']);
    land();
    sc.wheel(-WHEEL_STEP);
    expect(calls.at(-1)).toBe('back');
  });

  it('back from the first page (the card turns it down) keeps the crawl going', () => {
    const { host, calls } = makeHost();
    const sc = scroller(host);
    sc.wheel(-WHEEL_STEP);
    expect(calls).toEqual(['back']);
    vi.advanceTimersByTime(readMs(10));
    expect(calls.at(-1)).toBe('move 0->1 in[3] out[0]');
  });

  it('once the card has moved on and stopped it, nothing more is scheduled', () => {
    const { host, calls } = makeHost();
    let sc: ReturnType<typeof scroller> | null = null;
    sc = scroller({ ...host, back: () => (calls.push('back'), sc!.stop()) });
    sc.wheel(-WHEEL_STEP);
    vi.advanceTimersByTime(60_000);
    expect(calls).toEqual(['back']);
  });

  it('the wheel past the end is the next page', () => {
    const { host, calls } = makeHost();
    const sc = scroller(host);
    sc.key();
    sc.wheel(WHEEL_STEP);
    expect(calls.at(-1)).toBe('next');
  });

  it('a page that fits is at its end straight away; stop clears every timer', () => {
    const { host, calls } = makeHost();
    const sc = scroller({ ...host, rows: rowsOf([10, 10]) });
    expect(calls).toEqual(['end']);
    sc.stop();
    vi.advanceTimersByTime(60_000);
    expect(calls).toEqual(['end']);
  });
});
