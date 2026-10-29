import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_CHAR_MS, CARD_EVERY_SPLASH, CARD_HOLD_MS, CARD_KEY, CARD_LINE_PAUSE_MS, markOpeningCardSeen, mountOpeningCard as mountReal, shouldShowOpeningCard, type OpeningCard } from '../src/landing/opening-card';
import { COPY } from '../src/landing/copy';
import { SOUND_PROMPT } from '../src/landing/splash';

const card = { title: 'LOWLIGHT', lines: [{ text: 'The sea came in.' }, { text: 'SDG sells the law.', accent: ['SDG'] }, { text: 'Most live in it.', dim: true }], skip: '[ANY KEY] SKIP' };
/** Long enough to type every line of `card` and pause after each. */
const typeAll = () => card.lines.reduce((ms, l) => ms + l.text.length * CARD_CHAR_MS + CARD_LINE_PAUSE_MS, 0) + 50;
/** Exactly when the last character lands: every line typed, a pause between lines. */
const typed = () => card.lines.reduce((ms, l) => ms + l.text.length * CARD_CHAR_MS, 0) + (card.lines.length - 1) * CARD_LINE_PAUSE_MS;
const lines = () => [...document.querySelectorAll('.opening-card .oc-line')].map((l) => l.textContent);

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
});
afterEach(() => {
  for (const c of mounted.splice(0)) c.destroy();
  vi.useRealTimers();
});

describe('opening card', () => {
  it('types the lines one after another under the title, with the skip hint', () => {
    mountOpeningCard(document.body, { reducedMotion: false, card });
    expect(document.querySelector('.oc-title')!.textContent).toBe('LOWLIGHT');
    expect(document.querySelector('.oc-skip')!.textContent).toBe('[ANY KEY] SKIP');
    vi.advanceTimersByTime(5 * CARD_CHAR_MS + 1);
    expect(lines()).toEqual(['The s']);
    vi.advanceTimersByTime(typeAll());
    expect(lines()).toEqual(['The sea came in.', 'SDG sells the law.', 'Most live in it.']);
  });

  it('marks accent words and dim lines', () => {
    mountOpeningCard(document.body, { reducedMotion: false, card });
    vi.advanceTimersByTime(typeAll());
    const ls = document.querySelectorAll('.oc-line');
    expect(ls[1].querySelector('.oc-accent')!.textContent).toBe('SDG');
    expect(ls[2].classList.contains('dim')).toBe(true);
    expect(ls[0].classList.contains('dim')).toBe(false);
  });

  it('holds on the last line, glitches out and resolves done', async () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card });
    let done = false;
    void c.done.then(() => (done = true));
    // A line's pause after the last one too, then the hold.
    vi.advanceTimersByTime(typed() + CARD_LINE_PAUSE_MS + CARD_HOLD_MS - 100);
    expect(c.el.classList.contains('glitch-out')).toBe(false);
    vi.advanceTimersByTime(200);
    expect(c.el.classList.contains('glitch-out')).toBe(true);
    await vi.runAllTimersAsync();
    expect(done).toBe(true);
    expect(document.querySelector('.opening-card')).toBeNull();
  });

  it('any key skips it, tells onGesture once, and the key goes no further', async () => {
    const onGesture = vi.fn();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, onGesture });
    vi.advanceTimersByTime(3 * CARD_CHAR_MS);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onGesture).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    expect(c.el.classList.contains('glitch-out')).toBe(true);
    await vi.runAllTimersAsync();
    await c.done;
    // Gone: keys reach the page again.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(later).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', later);
  });

  it('a click skips it too', () => {
    const onGesture = vi.fn();
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, onGesture });
    c.el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onGesture).toHaveBeenCalledTimes(1);
    expect(c.el.classList.contains('glitch-out')).toBe(true);
  });

  it('with reduced motion every line is there at once', () => {
    mountOpeningCard(document.body, { reducedMotion: true, card });
    expect(lines()).toEqual(['The sea came in.', 'SDG sells the law.', 'Most live in it.']);
  });

  it('defaults to the game copy', () => {
    mountOpeningCard(document.body, { reducedMotion: true });
    expect(document.querySelector('.oc-title')!.textContent).toBe(COPY.openingCard.title);
    expect(lines()).toEqual(COPY.openingCard.lines.map((l) => l.text));
    expect(document.querySelector('.oc-accent')!.textContent).toBe('SDG');
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
  it('shows the sound prompt and types nothing until the first key, which starts sound and the typing without skipping', () => {
    const onGesture = vi.fn();
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, onGesture, waitForSound: true });
    expect(document.querySelector('.oc-sound')!.textContent).toBe(SOUND_PROMPT);
    vi.advanceTimersByTime(typeAll());
    expect(lines()).toEqual([]);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onGesture).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.oc-sound')).toBeNull();
    expect(c.el.classList.contains('glitch-out')).toBe(false);
    vi.advanceTimersByTime(typeAll());
    expect(lines()).toEqual(['The sea came in.', 'SDG sells the law.', 'Most live in it.']);
    // The next key skips, as usual.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onGesture).toHaveBeenCalledTimes(2);
    expect(c.el.classList.contains('glitch-out')).toBe(true);
  });

  it('a click starts it the same way', () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, waitForSound: true });
    c.el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.oc-sound')).toBeNull();
    expect(c.el.classList.contains('glitch-out')).toBe(false);
  });

  it('starts by itself when sound comes on without a key', () => {
    const c = mountOpeningCard(document.body, { reducedMotion: false, card, waitForSound: true });
    c.soundStarted();
    expect(document.querySelector('.oc-sound')).toBeNull();
    vi.advanceTimersByTime(typeAll());
    expect(lines()).toHaveLength(3);
    c.soundStarted(); // twice is harmless
    expect(lines()).toHaveLength(3);
  });

  it('does not hold or leave while waiting', () => {
    const c = mountOpeningCard(document.body, { reducedMotion: true, card, waitForSound: true });
    vi.advanceTimersByTime(60_000);
    expect(c.el.isConnected).toBe(true);
    expect(lines()).toEqual([]);
  });
});
