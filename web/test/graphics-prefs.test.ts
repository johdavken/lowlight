import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyUiBlur, loadBlur, loadPost, saveBlur, savePost, effectsLeftOut, loadEffects, loadRenderScale, renderScaleFactor, saveEffects, saveRenderScale } from '../src/ui/graphics-prefs';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('graphics prefs (SYS → RENDER SCALE, EFFECTS)', () => {
  it('start at 100 % and FULL, keep a pick, and take the default for anything unknown', () => {
    expect(loadRenderScale()).toBe('100');
    expect(loadEffects()).toBe('full');
    saveRenderScale('50');
    saveEffects('low');
    expect(loadRenderScale()).toBe('50');
    expect(loadEffects()).toBe('low');
    localStorage.setItem('lowlight.renderScale', '33');
    localStorage.setItem('lowlight.effects', 'ultra');
    expect(loadRenderScale()).toBe('100');
    expect(loadEffects()).toBe('full');
  });

  it('take the defaults with storage off, and a save does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('off');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('off');
    });
    expect(loadRenderScale()).toBe('100');
    expect(() => saveEffects('off')).not.toThrow();
  });

  it('a scale is a density factor; LOW leaves out the particles, OFF steam, smoke and passing lights too', () => {
    expect(['100', '75', '50'].map((s) => renderScaleFactor(s as '100'))).toEqual([1, 0.75, 0.5]);
    expect([...effectsLeftOut('full')]).toEqual([]);
    expect([...effectsLeftOut('low')].sort()).toEqual(['dust', 'glass']);
    expect([...effectsLeftOut('off')].sort()).toEqual(['dust', 'glass', 'passing', 'plume']);
  });

  it('BLUR and POST EFFECTS start on, keep off, and BLUR sets the panels\' --ui-blur', () => {
    expect(loadBlur()).toBe(true);
    expect(loadPost()).toBe(true);
    saveBlur(false);
    savePost(false);
    expect(loadBlur()).toBe(false);
    expect(loadPost()).toBe(false);
    const root = document.createElement('div');
    applyUiBlur(false, root);
    expect(root.style.getPropertyValue('--ui-blur')).toBe('0');
    applyUiBlur(true, root);
    expect(root.style.getPropertyValue('--ui-blur')).toBe('1');
  });
});
