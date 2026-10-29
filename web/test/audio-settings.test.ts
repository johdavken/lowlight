import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOUND, loadSoundSettings, saveSoundSettings } from '../src/audio/settings';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('sound settings', () => {
  it('defaults: master 0.6, not muted, every channel at 1', () => {
    expect(loadSoundSettings()).toEqual({ master: 0.6, muted: false, channels: { weather: 1, room: 1, lights: 1, music: 1 } });
    expect(DEFAULT_SOUND.master).toBe(0.6);
  });

  it('round-trips, and a fresh load (the next page) reads what was saved (Review Focus 5)', () => {
    saveSoundSettings({ master: 0.35, muted: true, channels: { weather: 0.5, room: 1, lights: 0.2, music: 0.4 } });
    expect(loadSoundSettings()).toEqual({ master: 0.35, muted: true, channels: { weather: 0.5, room: 1, lights: 0.2, music: 0.4 } });
    expect(JSON.parse(localStorage.getItem('lowlight.sound')!).master).toBe(0.35);
  });

  it('corrupt or out-of-range values fall back to defaults field by field', () => {
    localStorage.setItem('lowlight.sound', '{nope');
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND);
    localStorage.setItem('lowlight.sound', JSON.stringify({ master: 7, muted: 'x', channels: { weather: 0.4, room: -1 } }));
    expect(loadSoundSettings()).toEqual({ master: 0.6, muted: false, channels: { weather: 0.4, room: 1, lights: 1, music: 1 } });
  });

  it('a throwing localStorage never breaks sound', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND);
    expect(() => saveSoundSettings(DEFAULT_SOUND)).not.toThrow();
  });
});
