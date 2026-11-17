import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBoxPrefs, autoPageMs, BOX_DEFAULTS, BOX_SWATCHES, clampGlass, loadBoxPrefs, saveBoxPrefs } from '../src/ui/box-prefs';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('box prefs (the box settings key)', () => {
  it('defaults: the speaker colour, glass at 60, no auto page, the line on, typed text', () => {
    expect(loadBoxPrefs()).toEqual({ colour: 'speaker', glass: 60, autoPage: 'off', line: true, effect: 'type' });
  });

  it('a round trip keeps every field', () => {
    const p = { colour: 'cyan', glass: 30, autoPage: 'fast', line: false, effect: 'decode' } as const;
    saveBoxPrefs(p);
    expect(loadBoxPrefs()).toEqual(p);
  });

  it('bad or unknown fields fall back one by one; unreadable JSON is the defaults', () => {
    localStorage.setItem('lowlight.box', JSON.stringify({ colour: 'mauve', glass: 47, autoPage: 'never', line: 'yes', effect: 'decode' }));
    expect(loadBoxPrefs()).toEqual({ ...BOX_DEFAULTS, glass: 50, effect: 'decode' });
    localStorage.setItem('lowlight.box', '{nope');
    expect(loadBoxPrefs()).toEqual(BOX_DEFAULTS);
  });

  it('storage off: the defaults, and saving never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('off');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('off');
    });
    expect(loadBoxPrefs()).toEqual(BOX_DEFAULTS);
    expect(() => saveBoxPrefs(BOX_DEFAULTS)).not.toThrow();
  });

  it('glass keeps to 0–100 in tens; auto page is a wait or nothing', () => {
    expect([clampGlass(-5), clampGlass(44), clampGlass(46), clampGlass(130)]).toEqual([0, 40, 50, 100]);
    expect([autoPageMs('off'), autoPageMs('slow'), autoPageMs('fast')]).toEqual([null, 6000, 3000]);
  });

  it('applies to the feed root: a swatch fixes the box colour, glass is 0–1, the line can go', () => {
    const root = document.createElement('div');
    applyBoxPrefs(root, { ...BOX_DEFAULTS, colour: 'amber', glass: 30, line: false });
    expect(root.classList.contains('fixed-accent')).toBe(true);
    expect(root.style.getPropertyValue('--fixed-hc')).toBe(BOX_SWATCHES.amber);
    expect(root.style.getPropertyValue('--box-glass')).toBe('0.3');
    expect(root.classList.contains('no-leader')).toBe(true);
    applyBoxPrefs(root, BOX_DEFAULTS);
    expect(root.classList.contains('fixed-accent')).toBe(false);
    expect(root.style.getPropertyValue('--fixed-hc')).toBe('');
    expect(root.classList.contains('no-leader')).toBe(false);
  });
});
