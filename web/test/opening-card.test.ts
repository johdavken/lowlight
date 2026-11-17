import { loadIntroSkipped, saveIntroSkipped } from '../src/landing/intro-pref';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_EVERY_SPLASH, CARD_KEY, markOpeningCardSeen, mountOpeningCard as mountReal, shouldShowOpeningCard, STILL_HOLD_MS, type OpeningCard } from '../src/landing/opening-card';
import { COPY } from '../src/landing/copy';
import { SOUND_PROMPT } from '../src/landing/splash';
import { TITLE_BUILD_MS } from '../src/landing/decrypt';

const card: typeof COPY.openingCard = {
  pages: [
    { title: 'LOWLIGHT', lines: [{ text: 'The sea came in.' }, { kind: 'gap' }, { text: 'SDG sells the law.', accent: ['SDG'] }, { text: 'Most live in it.', kind: 'dim' }] },
    { title: 'HICKS', lines: [{ text: 'A finder.', kind: 'tag' }] },
    { title: 'SOREN', lines: [{ text: 'A scheduler.' }] },
  ],
  hint: COPY.openingCard.hint,
};
/** The text lines on screen (gaps left out). */
const lines = () => [...document.querySelectorAll('.opening-card .oc-line:not(.gap)')].map((l) => l.textContent);
const name = () => document.querySelector('.opening-card .oc-name')?.textContent;
const press = (key = 'Enter') => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

/** Every card a test mounts, destroyed after it so its window listener can't swallow the next test's keys. */
const mounted: OpeningCard[] = [];
const mountOpeningCard = (...a: Parameters<typeof mountReal>) => {
  const c = mountReal(...a);
  mounted.push(c);
  return c;
};

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
  // jsdom has no canvas: names stay plain text and each page shows whole, unless a test hands it a context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  for (const c of mounted.splice(0)) c.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('opening card: the pages', () => {
  it('shows the first name and its text, accents and line kinds, the pager and the hint', () => {
    mountOpeningCard(document.body, { reducedMotion: false, card });
    expect(name()).toBe('LOWLIGHT');
    expect(lines()).toEqual(['The sea came in.', 'SDG sells the law.', 'Most live in it.']);
    expect(document.querySelector('.oc-accent')!.textContent).toBe('SDG');
    expect(document.querySelector('.oc-line.gap')).not.toBeNull();
    expect(document.querySelectorAll('.oc-line')[3].classList.contains('dim')).toBe(true);
    expect(document.querySelector('.oc-pager')!.textContent).toBe('LOWLIGHT · HICKS · SOREN  01/03');
    expect(document.querySelector('.oc-pager b')!.textContent).toBe('LOWLIGHT');
    expect(document.querySelector('.oc-hint')!.textContent).toBe(card.hint.ready);
  });

  it('a key goes to the next name, and past the last one the card glitches out and resolves done', async () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card });
    let done = false;
    void c.done.then(() => (done = true));
    press();
    expect(name()).toBe('HICKS');
    expect(lines()).toEqual(['A finder.']);
    expect(document.querySelector('.oc-line.tag')).not.toBeNull();
    press(' ');
    expect(name()).toBe('SOREN');
    expect(document.querySelectorAll('.oc-page')).toHaveLength(1);
    press();
    expect(c.el.classList.contains('glitch-out')).toBe(true);
    await vi.runAllTimersAsync();
    expect(done).toBe(true);
    expect(document.querySelector('.opening-card')).toBeNull();
  });

  it('moves on by itself after a read, and leaves after the last page', async () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card });
    vi.advanceTimersByTime(STILL_HOLD_MS - 10);
    expect(name()).toBe('LOWLIGHT');
    vi.advanceTimersByTime(10);
    expect(name()).toBe('HICKS');
    vi.advanceTimersByTime(STILL_HOLD_MS);
    expect(name()).toBe('SOREN');
    vi.advanceTimersByTime(STILL_HOLD_MS);
    expect(c.el.classList.contains('glitch-out')).toBe(true);
    await vi.runAllTimersAsync();
    await c.done;
  });

  it('Esc skips the rest from any page', async () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card });
    press();
    expect(name()).toBe('HICKS');
    press('Escape');
    expect(c.el.classList.contains('glitch-out')).toBe(true);
    await vi.runAllTimersAsync();
    await c.done;
    expect(document.querySelector('.opening-card')).toBeNull();
  });

  it('tells onGesture of each key, and no key goes further until it has gone', async () => {
    const onGesture = vi.fn();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, onGesture });
    press();
    press('a');
    expect(onGesture).toHaveBeenCalledTimes(2);
    expect(later).not.toHaveBeenCalled();
    press('Escape');
    press('Enter'); // while it glitches out: still swallowed
    expect(later).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await c.done;
    press();
    expect(later).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', later);
  });

  it('a click is a key', () => {
    const onGesture = vi.fn();
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, onGesture });
    c.el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onGesture).toHaveBeenCalledTimes(1);
    expect(name()).toBe('HICKS');
  });

  it('defaults to the game copy: LOWLIGHT, HICKS and SOREN, the brief ending on the runners', () => {
    mountOpeningCard(document.body, { reducedMotion: true });
    expect(COPY.openingCard.pages.map((p) => p.title)).toEqual(['LOWLIGHT', 'HICKS', 'SOREN']);
    expect(name()).toBe('LOWLIGHT');
    expect(lines().at(-1)).toBe('Tonight, two of them are working.');
    expect([...document.querySelectorAll('.oc-accent')].map((a) => a.textContent)).toContain('runner');
  });
});

describe('opening card: when it plays', () => {
  it('never without a splash', () => {
    expect(shouldShowOpeningCard(false, { getItem: () => null }, true)).toBe(false);
    expect(shouldShowOpeningCard(false, { getItem: () => null }, false)).toBe(false);
  });

  it('on every splash while CARD_EVERY_SPLASH is on (it is, for now)', () => {
    expect(CARD_EVERY_SPLASH).toBe(true);
    expect(shouldShowOpeningCard(true, { getItem: () => '1' })).toBe(true);
  });

  it('SYS → INTRO on SKIP: no card before the splash; PLAY (or nothing saved) plays it', () => {
    expect(shouldShowOpeningCard(true, { getItem: () => null }, true, true)).toBe(false);
    expect(shouldShowOpeningCard(true, { getItem: () => null }, true, false)).toBe(true);
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(loadIntroSkipped(storage)).toBe(false);
    saveIntroSkipped(true, storage);
    expect(loadIntroSkipped(storage)).toBe(true);
    saveIntroSkipped(false, storage);
    expect(store.size).toBe(0);
    const blocked = { getItem: () => { throw new Error('off'); } };
    expect(loadIntroSkipped(blocked)).toBe(false);
  });

  it('once a session when switched off; blocked storage shows it', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(shouldShowOpeningCard(true, s, false)).toBe(true);
    markOpeningCardSeen(s);
    expect(store.get(CARD_KEY)).toBe('1');
    expect(shouldShowOpeningCard(true, s, false)).toBe(false);
    expect(shouldShowOpeningCard(true, { getItem: () => { throw new Error('blocked'); } }, false)).toBe(true);
    expect(() => markOpeningCardSeen({ setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});

describe('opening card: waiting for sound', () => {
  it('shows the sound prompt and nothing else until the first key, which starts sound and the card without moving on', () => {
    const onGesture = vi.fn();
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, onGesture, waitForSound: true });
    expect(document.querySelector('.oc-sound')!.textContent).toBe(SOUND_PROMPT);
    vi.advanceTimersByTime(60_000);
    expect(name()).toBeUndefined();
    press();
    expect(onGesture).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.oc-sound')).toBeNull();
    expect(name()).toBe('LOWLIGHT');
    expect(c.el.classList.contains('glitch-out')).toBe(false);
    // The next key moves on, as usual.
    press();
    expect(name()).toBe('HICKS');
  });

  it('a click starts it the same way', () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, waitForSound: true });
    c.el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.oc-sound')).toBeNull();
    expect(name()).toBe('LOWLIGHT');
  });

  it('starts by itself when sound comes on without a key', () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, waitForSound: true });
    c.soundStarted();
    expect(name()).toBe('LOWLIGHT');
    c.soundStarted(); // twice is harmless
    expect(document.querySelectorAll('.oc-page')).toHaveLength(1);
    expect(name()).toBe('LOWLIGHT');
  });

  it('does not move on or leave while waiting', () => {
    const c = mountOpeningCard(document.body, { reducedMotion: true, card, waitForSound: true });
    vi.advanceTimersByTime(60_000);
    expect(c.el.isConnected).toBe(true);
    expect(lines()).toEqual([]);
  });
});

describe('opening card: the block-letter names', () => {
  /** A 2D context that records what it drew, so the card takes the canvas path in jsdom. */
  const fakeContext = () => {
    const drawn = { rects: 0, texts: 0 };
    const ctx = { scale() {}, clearRect() {}, fillRect: () => void drawn.rects++, fillText: () => void drawn.texts++ };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    // jsdom has no layout for a range; a browser does (the flight between names measures each letter with one).
    if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 8, 16);
    return drawn;
  };

  it('decrypts the name on a canvas, the text laid out but hidden until the build is done, the name kept for screen readers', () => {
    fakeContext();
    mountOpeningCard(document.body, { reducedMotion: false, card });
    const n = document.querySelector('.oc-name')!;
    expect(n.classList.contains('blocks')).toBe(true);
    expect(n.querySelector('canvas')).not.toBeNull();
    expect(n.textContent).toBe('LOWLIGHT');
    // Every letter is in place from the start (so nothing moves later), and none shows yet.
    const spans = [...document.querySelectorAll<HTMLElement>('.oc-window .oc-line span')].filter((s) => s.textContent!.trim());
    expect(spans.map((s) => s.textContent).join('')).toBe('Theseacamein.SDGsellsthelaw.Mostliveinit.');
    expect(spans.every((s) => s.style.visibility === 'hidden')).toBe(true);
    vi.advanceTimersByTime(TITLE_BUILD_MS - 10);
    expect(spans.every((s) => s.style.visibility === 'hidden')).toBe(true);
  });

  it('a key mid-build shows the text and lets the scroll take over; Esc stops it all and the card still goes', async () => {
    fakeContext();
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const c = mountOpeningCard(document.body, { reducedMotion: false, card });
    vi.advanceTimersByTime(500);
    press();
    const spans = [...document.querySelectorAll<HTMLElement>('.oc-window .oc-line span')].filter((s) => s.textContent!.trim());
    expect(spans.some((s) => s.style.visibility === '')).toBe(true);
    cancel.mockClear();
    press('Escape');
    // The name's glyphs, cycling since the key loosened them, stop with it.
    expect(cancel).toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await c.done;
    expect(document.querySelector('.opening-card')).toBeNull();
  });

  it('a key while the next name gathers stops the flight for good: the text never reforms over itself afterwards', () => {
    fakeContext();
    // HICKS long enough that its end hold (~6 s) outlasts the wait below, so a flight then could only be a late reform.
    const long = { ...card, pages: [card.pages[0], { title: 'HICKS', lines: [{ text: 'A finder who finds people. '.repeat(10) }] }, card.pages[2]] };
    mountOpeningCard(document.body, { reducedMotion: false, card: long });
    press(); // finish LOWLIGHT: its window shows, the scroll takes over (and, with no layout here, is at its end)
    press(); // on to HICKS: LOWLIGHT's glyphs gather into the name
    expect(name()).toBe('HICKS');
    expect(document.querySelectorAll('.oc-fly')).toHaveLength(1);
    press(); // finish HICKS mid-gather
    expect(document.querySelectorAll('.oc-fly')).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    // No reform set off late from the gather's done (it would have flown at 650 ms).
    expect(document.querySelectorAll('.oc-fly')).toHaveLength(0);
    expect(name()).toBe('HICKS');
  });

  it('with reduced motion the finished letters are drawn at once and the text is all there', () => {
    const drawn = fakeContext();
    mountOpeningCard(document.body, { reducedMotion: true, card });
    expect(drawn.rects).toBeGreaterThan(100);
    expect(drawn.texts).toBe(0);
    expect(lines()).toEqual(['The sea came in.', 'SDG sells the law.', 'Most live in it.']);
  });

  it('a name with no block art stays plain text', () => {
    fakeContext();
    mountOpeningCard(document.body, { reducedMotion: false, card: { ...card, pages: [{ title: 'QUAY', lines: [{ text: 'Wet.' }] }] } });
    const n = document.querySelector('.oc-name')!;
    expect(n.classList.contains('blocks')).toBe(false);
    expect(n.querySelector('canvas')).toBeNull();
    expect(lines()).toEqual(['Wet.']);
  });
});
