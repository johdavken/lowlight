import type { Channel } from './engine';

export interface SoundSettings {
  master: number;
  muted: boolean;
  channels: Record<Channel, number>;
  /** SYS → IN BACKGROUND: MUTE also stops the sound while the window isn't focused (hidden, it always stops). */
  muteInBackground: boolean;
}

const KEY = 'lowlight.sound';

/** Voice (voiced job beats) starts at 0.75: under the default master that's the level the 2026-11-08 playtest settled on. */
export const DEFAULT_VOICE = 0.75;

export const DEFAULT_SOUND: SoundSettings = { master: 0.6, muted: false, channels: { weather: 1, room: 1, lights: 1, music: 1, voice: DEFAULT_VOICE, ui: 1 }, muteInBackground: false };

const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback);

/**
 * the player's volume, mute and channel levels, per browser. Anything missing or broken falls back to the
 * default. `key`: Studio keeps its own (`studio.sound`).
 */
export function loadSoundSettings(key = KEY): SoundSettings {
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(key);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<{ master: unknown; muted: unknown; channels: Record<string, unknown>; muteInBackground: unknown }>;
  const ch = r.channels && typeof r.channels === 'object' ? r.channels : {};
  return {
    master: unit(r.master, DEFAULT_SOUND.master),
    muted: typeof r.muted === 'boolean' ? r.muted : DEFAULT_SOUND.muted,
    channels: {
      weather: unit(ch.weather, 1),
      room: unit(ch.room, 1),
      lights: unit(ch.lights, 1),
      music: unit(ch.music, 1),
      voice: unit(ch.voice, DEFAULT_VOICE),
      ui: unit(ch.ui, 1),
    },
    muteInBackground: r.muteInBackground === true,
  };
}

export function saveSoundSettings(s: SoundSettings, key = KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // Private window or blocked storage: the settings just don't persist.
  }
}
