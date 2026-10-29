import { describe, expect, it, vi } from 'vitest';
import { chromeKey } from '../src/room/identity';
import { listenHideUi } from '../src/room/hide-ui';

const key = (o: KeyboardEventInit) => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o });

describe('Alt+H hides the UI', () => {
  it('is a chrome key', () => {
    expect(chromeKey(key({ key: 'h', code: 'KeyH', altKey: true }), false)).toBe('hide');
    expect(chromeKey(key({ key: 'h', code: 'KeyH', altKey: true }), true)).toBeNull();
  });

  it('any other key or a click brings it back and goes no further; Alt and Alt+H do not', () => {
    const body = document.createElement('div');
    const hide = listenHideUi(window, body);
    const after = vi.fn();
    window.addEventListener('keydown', after);
    hide.toggle();
    expect(hide.hidden).toBe(true);
    window.dispatchEvent(key({ key: 'Alt', code: 'AltLeft', altKey: true }));
    window.dispatchEvent(key({ key: 'h', code: 'KeyH', altKey: true }));
    expect(hide.hidden).toBe(true);
    after.mockClear();
    window.dispatchEvent(key({ key: 'Escape', code: 'Escape' }));
    expect(hide.hidden).toBe(false);
    expect(after).not.toHaveBeenCalled();
    hide.toggle();
    window.dispatchEvent(key({ key: 'h', code: 'KeyH' }));
    expect(hide.hidden).toBe(false);
    hide.toggle();
    window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hide.hidden).toBe(false);
    window.removeEventListener('keydown', after);
  });
});
