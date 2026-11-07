import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFrameRate, maxFps, saveFrameRate } from '../src/ui/frame-rate';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('frame rate', () => {
  it('starts at 60', () => {
    expect(loadFrameRate()).toBe('60');
  });

  it('keeps a pick', () => {
    saveFrameRate('uncapped');
    expect(loadFrameRate()).toBe('uncapped');
  });

  it('takes 60 for anything it does not know', () => {
    localStorage.setItem('lowlight.frameRate', '144');
    expect(loadFrameRate()).toBe('60');
  });

  it('takes 60 with storage off, and a save does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('off');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('off');
    });
    expect(loadFrameRate()).toBe('60');
    expect(() => saveFrameRate('30')).not.toThrow();
  });

  it('gives the renderer its cap, 0 for uncapped', () => {
    expect(maxFps('30')).toBe(30);
    expect(maxFps('60')).toBe(60);
    expect(maxFps('uncapped')).toBe(0);
  });
});
