import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenScreenCycle, nextScreen, type CycleScreen } from '../src/room/screen-cycle';

const tab = (init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

let off: (() => void) | null = null;
afterEach(() => {
  off?.();
  off = null;
  document.body.replaceChildren();
});

describe('nextScreen', () => {
  it('YOU → PEOPLE → TEXTS → QUEST → CREW → MAP → BOOK → YOU, and back the other way', () => {
    expect(nextScreen('you', 1)).toBe('people');
    expect(nextScreen('people', 1)).toBe('texts');
    expect(nextScreen('texts', 1)).toBe('quest');
    expect(nextScreen('quest', 1)).toBe('crew');
    expect(nextScreen('crew', 1)).toBe('map');
    expect(nextScreen('map', 1)).toBe('book');
    expect(nextScreen('book', 1)).toBe('you');
    expect(nextScreen('you', -1)).toBe('book');
    expect(nextScreen('book', -1)).toBe('map');
    expect(nextScreen('crew', -1)).toBe('quest');
    expect(nextScreen('quest', -1)).toBe('texts');
    expect(nextScreen('texts', -1)).toBe('people');
    expect(nextScreen('people', -1)).toBe('you');
  });
  it('starts at YOU with nothing open, and at BOOK going back', () => {
    expect(nextScreen(null, 1)).toBe('you');
    expect(nextScreen(null, -1)).toBe('book');
  });
  it('skips a screen that is not on the bar (QUEST with nothing to list)', () => {
    const noQuest = (s: CycleScreen) => s !== 'quest';
    expect(nextScreen('texts', 1, noQuest)).toBe('crew');
    expect(nextScreen('crew', -1, noQuest)).toBe('texts');
  });
});

describe('listenScreenCycle', () => {
  function listen(o: { current?: CycleScreen | null; canStart?: boolean; inField?: boolean; blocked?: boolean; turnPage?: (cur: CycleScreen, dir: 1 | -1) => boolean } = {}) {
    const go = vi.fn();
    const room = vi.fn();
    window.addEventListener('keydown', room);
    off = listenScreenCycle(window, {
      current: () => (o.current === undefined ? 'you' : o.current),
      inField: () => o.inField ?? false,
      blocked: () => o.blocked ?? false,
      canStart: () => o.canStart ?? false,
      go,
      ...(o.turnPage ? { turnPage: o.turnPage } : {}),
    });
    return { go, room, done: () => window.removeEventListener('keydown', room) };
  }

  it('Tab goes to the next screen, Shift+Tab to the one before, and goes no further', () => {
    const { go, room, done } = listen({ current: 'people' });
    expect(tab().defaultPrevented).toBe(true);
    tab({ shiftKey: true });
    expect(go.mock.calls).toEqual([['texts', 1], ['you', -1]]);
    expect(room).not.toHaveBeenCalled();
    done();
  });

  it('with nothing open, Tab opens YOU and Shift+Tab BOOK, once they may start', () => {
    const { go, room, done } = listen({ current: null, canStart: true });
    expect(tab().defaultPrevented).toBe(true);
    tab({ shiftKey: true });
    expect(go.mock.calls).toEqual([['you', 1], ['book', -1]]);
    expect(room).not.toHaveBeenCalled();
    done();
  });
  it('with nothing open and no start, Tab is left alone', () => {
    const { go, done } = listen({ current: null });
    expect(tab().defaultPrevented).toBe(false);
    expect(go).not.toHaveBeenCalled();
    done();
  });

  it("a screen's own page comes first (YOU: FILE → STATS → STREET → KIT), then the next screen (spec 2026-10-28 §3)", () => {
    let turns = 1;
    const turnPage = vi.fn(() => turns-- > 0);
    const { go, room, done } = listen({ current: 'you', turnPage });
    expect(tab().defaultPrevented).toBe(true);
    expect(go).not.toHaveBeenCalled();
    tab({ shiftKey: true });
    expect(turnPage.mock.calls).toEqual([['you', 1], ['you', -1]]);
    expect(go.mock.calls).toEqual([['book', -1]]);
    expect(room).not.toHaveBeenCalled();
    done();
  });

  it('does nothing with none of the three open, in a field of its own, or while something is over it', () => {
    for (const o of [{ current: null }, { inField: true }, { blocked: true }]) {
      const { go, done } = listen(o);
      expect(tab().defaultPrevented).toBe(false);
      expect(go).not.toHaveBeenCalled();
      done();
      off?.();
      off = null;
    }
  });

  it('Ctrl/Alt/Meta+Tab are not its keys', () => {
    const { go, done } = listen();
    tab({ ctrlKey: true });
    tab({ altKey: true });
    tab({ metaKey: true });
    expect(go).not.toHaveBeenCalled();
    done();
  });
});
