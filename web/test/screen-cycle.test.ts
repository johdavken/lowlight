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
  it('YOU → PEOPLE → CREW → MAP → YOU, and back the other way', () => {
    expect(nextScreen('you', 1)).toBe('people');
    expect(nextScreen('people', 1)).toBe('crew');
    expect(nextScreen('crew', 1)).toBe('map');
    expect(nextScreen('map', 1)).toBe('you');
    expect(nextScreen('you', -1)).toBe('map');
    expect(nextScreen('people', -1)).toBe('you');
  });
});

describe('listenScreenCycle', () => {
  function listen(o: { current?: CycleScreen | null; inField?: boolean; blocked?: boolean; turnPage?: (cur: CycleScreen, dir: 1 | -1) => boolean } = {}) {
    const go = vi.fn();
    const room = vi.fn();
    window.addEventListener('keydown', room);
    off = listenScreenCycle(window, {
      current: () => (o.current === undefined ? 'you' : o.current),
      inField: () => o.inField ?? false,
      blocked: () => o.blocked ?? false,
      go,
      ...(o.turnPage ? { turnPage: o.turnPage } : {}),
    });
    return { go, room, done: () => window.removeEventListener('keydown', room) };
  }

  it('Tab goes to the next screen, Shift+Tab to the one before, and goes no further', () => {
    const { go, room, done } = listen({ current: 'people' });
    expect(tab().defaultPrevented).toBe(true);
    tab({ shiftKey: true });
    expect(go.mock.calls).toEqual([['crew', 1], ['you', -1]]);
    expect(room).not.toHaveBeenCalled();
    done();
  });

  it("a screen's own page comes first (YOU: FILE → SHEET), then the next screen (spec 2026-10-28 §3)", () => {
    let turns = 1;
    const turnPage = vi.fn(() => turns-- > 0);
    const { go, room, done } = listen({ current: 'you', turnPage });
    expect(tab().defaultPrevented).toBe(true);
    expect(go).not.toHaveBeenCalled();
    tab({ shiftKey: true });
    expect(turnPage.mock.calls).toEqual([['you', 1], ['you', -1]]);
    expect(go.mock.calls).toEqual([['map', -1]]);
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
