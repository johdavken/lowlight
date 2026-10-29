import { describe, expect, it, vi } from 'vitest';
import type { Atmosphere, RoomState, SceneDef } from '../../shared/types';
import { createRoomAudio } from '../src/audio/room-audio';
import { DEFAULT_SOUND, type SoundSettings } from '../src/audio/settings';
import { soundMix } from '../src/audio/mix';
import type { SoundView } from '../src/ui/hud';

const atmo = (o: Partial<Atmosphere> = {}): Atmosphere => ({ ambient: '#000000', ambientLevel: 0.3, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night', ...o });
const scene: SceneDef = { id: 'room', name: 'Room', description: '', resolution: [480, 270], layers: [], lights: [], defaults: atmo(), presets: {} };
const state = (a: Partial<Atmosphere> = {}): RoomState => ({ sceneId: 'room', lights: [], atmosphere: atmo(a) });

let ctxState = 'running';
let changed: () => void = () => {};
/** The fake audio clock, and the engine's song-end listener room audio registered. */
let now = 0;
/** The fake wall clock (seconds), for the entry grace before unlock. */
let wall = 0;
let musicEnded: (url: string, failed: boolean) => void = () => {};
function setup(opts: { available?: boolean; saved?: SoundSettings; scale?: number; rng?: () => number } = {}) {
  ctxState = 'running';
  now = 0;
  wall = 0;
  const engine = {
    unlock: vi.fn(() => opts.available !== false),
    apply: vi.fn(),
    tick: vi.fn(),
    setMaster: vi.fn(),
    setChannel: vi.fn(),
    setScale: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    music: vi.fn(),
    clock: vi.fn(() => now),
    onMusicEnded: vi.fn((fn: (url: string, failed: boolean) => void) => (musicEnded = fn)),
    burst: vi.fn(),
    oneShot: vi.fn(),
    preload: vi.fn(),
    thunder: vi.fn(),
    cancelThunder: vi.fn(),
    state: vi.fn(() => ({ available: true, unlocked: true, context: ctxState, voices: [], mix: null })),
    onStateChange: vi.fn((fn: () => void) => (changed = fn)),
  };
  let stored: SoundSettings = structuredClone(opts.saved ?? DEFAULT_SOUND);
  const settings = { load: vi.fn(() => structuredClone(stored)), save: vi.fn((s: SoundSettings) => (stored = structuredClone(s))) };
  const views: SoundView[] = [];
  const audio = createRoomAudio({ engine, view: (v) => views.push(v), settings, scale: opts.scale, now: () => wall, ...(opts.rng ? { rng: opts.rng } : {}) });
  return { engine, settings, views, audio, stored: () => stored };
}

describe('createRoomAudio: scene music', () => {
  const sceneWithMusic: SceneDef = { ...scene, id: 'office', sound: { music: { songs: ['t.ogg'] } } };
  const two: SceneDef = { ...scene, id: 'office', sound: { music: { songs: ['a.ogg', 'b.ogg'] } } };
  const once = { loop: false };
  const url = (s: string) => `/scenes/p/_music/${s}`;

  it('place plays the scene song once, fading at least 1.2 s, and stops for a scene without one', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.place(sceneWithMusic, '/scenes/p/', 0);
    expect(engine.music).toHaveBeenLastCalledWith(url('t.ogg'), 0.3, 1.2, once);
    audio.place(sceneWithMusic, '/scenes/p/', 3);
    expect(engine.music).toHaveBeenLastCalledWith(url('t.ogg'), 0.3, 3, once); // same URL: the engine only glides
    audio.place(scene, '/scenes/p/', 1);
    expect(engine.music).toHaveBeenLastCalledWith(null, 0, 1.2);
  });

  it('song then silence before the gesture: nothing plays on unlock', () => {
    const { audio, engine } = setup();
    audio.place(sceneWithMusic, '/scenes/p/', 1);
    audio.place(scene, '/scenes/p/', 1);
    audio.gesture();
    expect(engine.music).toHaveBeenCalledExactlyOnceWith(null, 0, 1.2);
  });

  it('before unlock the first song waits; nothing advances (Review Focus 3)', () => {
    const { audio, engine } = setup();
    audio.place(sceneWithMusic, '/scenes/p/', 0); // a page load restores the room before any click
    now = 500;
    audio.frame(500);
    expect(engine.music).not.toHaveBeenCalled();
    audio.gesture();
    expect(engine.music).toHaveBeenCalledExactlyOnceWith(url('t.ogg'), 0.3, 1.2, once);
  });

  it("a room's song plays once, then a pause, then the next", () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.place(two, '/scenes/p/', 0);
    const first = engine.music.mock.lastCall![0] as string;
    musicEnded(first, false);
    expect(engine.music).toHaveBeenCalledTimes(1);
    expect(audio.state().playlist.phase).toBe('pause');
    now = 61;
    audio.frame(61);
    const second = engine.music.mock.lastCall!;
    expect(second[0]).not.toBe(first);
    expect([url('a.ogg'), url('b.ogg')]).toContain(second[0]);
    expect(second[3]).toEqual(once);
  });

  it('a room sharing the song keeps it', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.place(sceneWithMusic, '/scenes/p/', 0);
    audio.place({ ...scene, id: 'hall', sound: { music: { songs: ['x.ogg', 't.ogg'] } } }, '/scenes/p/', 2);
    expect(engine.music.mock.calls.every((c) => c[0] === url('t.ogg'))).toBe(true);
    expect(audio.state().playlist.song).toBe('t.ogg');
  });

  it('an update to the same room (a light, the weather) never cuts a pause short', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.place(two, '/scenes/p/', 0);
    musicEnded(engine.music.mock.lastCall![0] as string, false);
    const calls = engine.music.mock.calls.length;
    audio.place(two, '/scenes/p/', 2);
    expect(engine.music.mock.calls.length).toBe(calls);
    expect(audio.state().playlist.phase).toBe('pause');
  });

  it('the shuffle comes from the injected random source, not a fixed seed (task 2 review)', () => {
    const first = (r: number) => {
      const { audio, engine } = setup({ rng: () => r });
      audio.gesture();
      audio.place(two, '/scenes/p/', 0);
      return engine.music.mock.lastCall![0];
    };
    expect(first(0)).not.toBe(first(0.99));
  });

  it('the same room with a new song list (a Studio install) picks up the new songs (task 2 review)', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.place({ ...scene, id: 'office' }, '/scenes/p/', 0);
    audio.place(sceneWithMusic, '/scenes/p/', 0); // same id, now with a song
    expect(engine.music).toHaveBeenLastCalledWith(url('t.ogg'), 0.3, 1.2, once);
  });

  it('a failed song skips to the pause, then the next', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.setMusicPause(1, 1);
    audio.place(two, '/scenes/p/', 0);
    const first = engine.music.mock.lastCall![0] as string;
    musicEnded(first, true);
    now = 1;
    audio.frame(1);
    expect(engine.music.mock.lastCall![0]).not.toBe(first);
  });

  it("overrideMusic: the gig track loops and holds the playlist back; clearing it brings the room's song back", () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.place(sceneWithMusic, '/scenes/p/', 0);
    audio.overrideMusic('/sound/gig/x.ogg', 0.3);
    expect(engine.music).toHaveBeenLastCalledWith('/sound/gig/x.ogg', 0.3, 1.2, { loop: true });
    // A room change under it (or the playlist moving on) doesn't cut in.
    audio.place(two, '/scenes/p/', 0);
    now = 9999;
    audio.frame(9999);
    expect(engine.music).toHaveBeenLastCalledWith('/sound/gig/x.ogg', 0.3, 1.2, { loop: true });
    audio.overrideMusic(null);
    const last = engine.music.mock.calls.at(-1)!;
    expect([url('a.ogg'), url('b.ogg'), null]).toContain(last[0]);
    expect(last[0]).not.toBe('/sound/gig/x.ogg');
  });

  it('overrideMusic(null) in a room without songs is silence', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.place(scene, '/scenes/p/', 0);
    audio.overrideMusic('/sound/gig/x.ogg', 0.3);
    audio.overrideMusic(null);
    expect(engine.music).toHaveBeenLastCalledWith(null, 0, 1.2);
  });

  it('setMusicPause shortens the pause, and state reports the playlist', () => {
    const { audio } = setup();
    audio.gesture();
    audio.setMusicPause(1, 1);
    audio.place(sceneWithMusic, '/scenes/p/', 0);
    expect(audio.state().playlist).toEqual({ song: 't.ogg', phase: 'playing', pauseUntil: null });
    expect(audio.state().scene).toBe('office');
    now = 10;
    musicEnded(url('t.ogg'), false);
    expect(audio.state().playlist).toEqual({ song: null, phase: 'pause', pauseUntil: 11 });
  });
});

describe('createRoomAudio', () => {
  it('music waits for the first gesture, then fades in the latest request', () => {
    const { audio, engine } = setup();
    audio.music('/t.ogg', 0.35, 0);
    audio.music('/t.ogg', 0.5, 0);
    expect(engine.music).not.toHaveBeenCalled();
    audio.gesture();
    expect(engine.music).toHaveBeenCalledExactlyOnceWith('/t.ogg', 0.5, 0.6);
  });

  it('after unlock, music calls straight through', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.music('/t.ogg', 1, 0.6);
    expect(engine.music).toHaveBeenLastCalledWith('/t.ogg', 1, 0.6);
  });

  it('starts locked and only remembers the room until the first gesture, then plays it at once', () => {
    const { engine, views, audio } = setup();
    expect(views.at(-1)).toEqual({ kind: 'locked' });
    audio.room(state({ weather: 'rain', weatherLevel: 0.5 }), scene, '/scenes/p/', 2);
    expect(engine.apply).not.toHaveBeenCalled();
    audio.gesture();
    expect(engine.unlock).toHaveBeenCalledTimes(1);
    // A short fade-in, not a step from silence (final review 5).
    expect(engine.apply).toHaveBeenCalledWith(soundMix(state({ weather: 'rain', weatherLevel: 0.5 }), scene, '/scenes/p/'), 0.6, undefined);
    expect(views.at(-1)).toEqual({ kind: 'on', volume: 0.6, muted: false, music: 1, ambient: 1 });
  });

  it('after unlock, room changes glide over their duration with their transition', () => {
    const { engine, audio } = setup();
    audio.gesture();
    audio.room(state({ fog: 0.4 }), scene, '/scenes/p/', 1.5, 'glitch');
    expect(engine.apply).toHaveBeenLastCalledWith(soundMix(state({ fog: 0.4 }), scene, '/scenes/p/'), 1.5, 'glitch');
  });

  it('no Web Audio: the speaker hides', () => {
    const { views, audio, engine } = setup({ available: false });
    audio.gesture();
    expect(views.at(-1)).toEqual({ kind: 'hidden' });
    audio.room(state(), scene, '/', 1);
    expect(engine.apply).not.toHaveBeenCalled();
  });

  it('applies saved settings and the scale up front', () => {
    const saved = { master: 0.3, muted: true, channels: { weather: 0.5, room: 1, lights: 0.2, music: 1 } };
    const { engine } = setup({ saved, scale: 0.25 });
    expect(engine.setMaster).toHaveBeenCalledWith(0.3, true);
    expect(engine.setChannel).toHaveBeenCalledWith('weather', 0.5);
    expect(engine.setChannel).toHaveBeenCalledWith('lights', 0.2);
    expect(engine.setScale).toHaveBeenCalledWith(0.25);
  });

  it('mute and the wheel update the engine, the view and saved settings (clamped, 5% steps)', () => {
    const { engine, views, audio, stored } = setup();
    audio.gesture();
    audio.toggleMute();
    expect(engine.setMaster).toHaveBeenLastCalledWith(0.6, true);
    expect(views.at(-1)).toEqual({ kind: 'on', volume: 0.6, muted: true, music: 1, ambient: 1 });
    expect(stored().muted).toBe(true);
    audio.toggleMute();
    audio.wheel(1);
    expect(stored().master).toBeCloseTo(0.65);
    for (let i = 0; i < 20; i++) audio.wheel(1);
    expect(stored().master).toBe(1);
    for (let i = 0; i < 30; i++) audio.wheel(-1);
    expect(stored().master).toBe(0);
    audio.setChannel('room', 0.4);
    expect(engine.setChannel).toHaveBeenLastCalledWith('room', 0.4);
    expect(stored().channels.room).toBe(0.4);
  });

  it('MUSIC steps the music channel; AMBIENT moves weather, room and lights together from the loudest', () => {
    const saved = { master: 0.6, muted: false, channels: { weather: 0.5, room: 0.8, lights: 0.2, music: 1 } };
    const { engine, views, audio, stored } = setup({ saved });
    audio.musicStep(-1);
    expect(stored().channels.music).toBe(1); // locked: nothing changes
    audio.gesture();
    expect(views.at(-1)).toEqual({ kind: 'on', volume: 0.6, muted: false, music: 1, ambient: 0.8 });
    audio.musicStep(-1);
    expect(engine.setChannel).toHaveBeenLastCalledWith('music', 0.95);
    expect(stored().channels.music).toBe(0.95);
    audio.ambientStep(-1);
    expect(stored().channels).toEqual({ weather: 0.75, room: 0.75, lights: 0.75, music: 0.95 });
    for (const ch of ['weather', 'room', 'lights']) expect(engine.setChannel).toHaveBeenCalledWith(ch, 0.75);
    expect(views.at(-1)).toEqual({ kind: 'on', volume: 0.6, muted: false, music: 0.95, ambient: 0.75 });
    for (let i = 0; i < 30; i++) audio.ambientStep(-1);
    expect(stored().channels.room).toBe(0);
    expect(stored().master).toBe(0.6);
  });

  it('suspends while hidden and resumes when visible; frames tick the engine once unlocked', () => {
    const { engine, audio } = setup();
    audio.frame(1);
    expect(engine.tick).not.toHaveBeenCalled();
    audio.gesture();
    audio.visibility(true);
    expect(engine.suspend).toHaveBeenCalled();
    audio.visibility(false);
    expect(engine.resume).toHaveBeenCalled();
    audio.frame(2.5);
    expect(engine.tick).toHaveBeenCalledWith(2.5);
  });

  it('cue is silent until the first gesture, then plays a one-shot', () => {
    const { audio, engine } = setup();
    audio.cue('/sound/ui/page-swap.ogg');
    expect(engine.oneShot).not.toHaveBeenCalled();
    audio.gesture();
    audio.cue('/sound/ui/page-swap.ogg', 0.5);
    expect(engine.oneShot).toHaveBeenCalledExactlyOnceWith('/sound/ui/page-swap.ogg', 0.5);
  });

  it('preloadCue is queued until the first gesture, then issued on unlock', () => {
    const { audio, engine } = setup();
    audio.preloadCue('/sound/ui/page-swap.ogg');
    expect(engine.preload).not.toHaveBeenCalled();
    audio.gesture();
    expect(engine.preload).toHaveBeenCalledExactlyOnceWith('/sound/ui/page-swap.ogg');
  });

  it('preloadCue after the gesture runs at once', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.preloadCue('/sound/ui/page-swap.ogg');
    expect(engine.preload).toHaveBeenCalledExactlyOnceWith('/sound/ui/page-swap.ogg');
  });

  it('later gestures retry unlock (which resumes a suspended context)', () => {
    const { engine, audio } = setup();
    audio.gesture();
    audio.gesture();
    expect(engine.unlock).toHaveBeenCalledTimes(2);
  });

  it('a new page starts locked even when the saved settings are unmuted (Review Focus 1)', () => {
    const saved = { master: 0.8, muted: false, channels: { weather: 1, room: 1, lights: 1, music: 1 } };
    const { views } = setup({ saved });
    expect(views).toEqual([{ kind: 'locked' }]);
  });

  it('the first click on the SOUND row unlocks without muting; mute and wheel do nothing while locked (final review 1)', () => {
    const { engine, views, audio, stored } = setup();
    audio.toggleMute();
    audio.wheel(1);
    expect(stored()).toEqual(DEFAULT_SOUND);
    audio.gesture({ fromSpeaker: true }); // pointerdown on the speaker…
    audio.toggleMute(); // …then its click
    expect(stored().muted).toBe(false);
    expect(views.at(-1)).toEqual({ kind: 'on', volume: 0.6, muted: false, music: 1, ambient: 1 });
    audio.toggleMute(); // the next click mutes
    expect(stored().muted).toBe(true);
    expect(engine.setMaster).toHaveBeenLastCalledWith(0.6, true);
  });

  it('shows "on" only while the context is running, and follows its state (final review 2)', () => {
    const { views, audio } = setup();
    ctxState = 'suspended'; // e.g. the first key was Escape, which doesn't count as activation
    audio.gesture();
    expect(views.at(-1)).toEqual({ kind: 'locked' });
    ctxState = 'running';
    changed();
    expect(views.at(-1)).toEqual({ kind: 'on', volume: 0.6, muted: false, music: 1, ambient: 1 });
    ctxState = 'suspended';
    changed();
    expect(views.at(-1)).toEqual({ kind: 'locked' });
  });
});

describe('createRoomAudio: thunder', () => {
  const indoor: SceneDef = { ...scene, id: 'flat', sound: { indoor: true }, effects: [{ kind: 'lightning' }] };
  const unlockNow = (audio: ReturnType<typeof setup>['audio']) => audio.gesture({ fromSpeaker: false });

  it("thunder waits for unlock and uses the scene's indoor flag", () => {
    const { audio, engine } = setup();
    audio.room(state({ weather: 'rain', weatherLevel: 0.9 }), indoor, '/scenes/p/', 0);
    audio.thunder(0.2);
    expect(engine.thunder).not.toHaveBeenCalled();
    unlockNow(audio);
    audio.thunder(0.2);
    expect(engine.thunder).toHaveBeenCalledTimes(1);
    const [url, level, delay, muffled] = engine.thunder.mock.calls[0];
    expect(url).toMatch(/\/sound\/thunder\/near-\d\.ogg/);
    expect(level).toBeCloseTo(0.9 - 0.55 * 0.2);
    expect(delay).toBeCloseTo(1.6);
    expect(muffled).toBe(true);
  });

  it('a room change cancels pending thunder; a change in the same room does not (Review Focus 1)', () => {
    const { audio, engine } = setup();
    unlockNow(audio);
    audio.room(state(), indoor, '/scenes/p/', 0);
    audio.thunder(0.5);
    audio.room(state({ fog: 0.4 }), indoor, '/scenes/p/', 1);
    expect(engine.cancelThunder).not.toHaveBeenCalled();
    audio.room(state(), { ...scene, id: 'elsewhere' }, '/scenes/p/', 0);
    expect(engine.cancelThunder).toHaveBeenCalledTimes(1);
  });

  it('a room with lightning preloads the thunder takes once unlocked', () => {
    const { audio, engine } = setup();
    audio.room(state(), indoor, '/scenes/p/', 0);
    unlockNow(audio);
    const urls = engine.preload.mock.calls.map((c) => c[0]);
    expect(urls.filter((u: string) => u.startsWith('/sound/thunder/'))).toHaveLength(7);
  });

  it("a strike from the room being left is dropped: no thunder in the new room (final review 1)", () => {
    const { audio, engine } = setup();
    unlockNow(audio);
    audio.room(state(), indoor, '/scenes/p/', 0);
    audio.room(state(), { ...scene, id: 'dry' }, '/scenes/p/', 0);
    audio.thunder(0.2, 'flat');
    expect(engine.thunder).not.toHaveBeenCalled();
    audio.room(state(), indoor, '/scenes/p/', 0);
    audio.thunder(0.2, 'flat');
    expect(engine.thunder).toHaveBeenCalledTimes(1);
  });
});

describe('createRoomAudio: room sounds', () => {
  const door = { name: 'door', src: 'sound/keep/door.ogg', onEntry: true, level: 0.7 };
  const train = { name: 'train', src: 'sound/keep/train.ogg', timer: { min: 1, max: 1 } };
  const kettle = { name: 'kettle', src: 'sound/keep/kettle.ogg', agent: { about: 'the kettle' } };
  const cafe: SceneDef = { ...scene, id: 'cafe', district: 'ribbon', folder: 'cafe', sound: { sounds: [door, train, kettle] } };
  const bar: SceneDef = { ...scene, id: 'bar', district: 'ribbon', folder: 'bar', sound: { sounds: [{ ...door, src: 'sound/keep/bell.ogg' }] } };
  const at = (src: string, id = 'cafe') => `/scenes/ribbon/${id}/${src}`;
  const cafeState = (a: Partial<Atmosphere> = {}): RoomState => ({ sceneId: 'cafe', lights: [], atmosphere: atmo(a) });
  const step = (audio: ReturnType<typeof setup>['audio'], t: number) => {
    now = t;
    audio.frame(t);
  };

  it('after unlock, walking in plays the entry sound at 1.5 s on the room channel', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    step(audio, 1.4);
    expect(engine.oneShot).not.toHaveBeenCalled();
    step(audio, 1.5);
    expect(engine.oneShot).toHaveBeenCalledWith(at('sound/keep/door.ogg'), 0.7, 'room');
    step(audio, 60);
    expect(engine.oneShot).toHaveBeenLastCalledWith(at('sound/keep/train.ogg'), 0.5, 'room');
  });

  it('a mood change in the same room keeps timers and plays no entry', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    step(audio, 2);
    step(audio, 30);
    audio.room(cafeState({ weather: 'rain', weatherLevel: 0.5 }), cafe, '/scenes/', 1);
    step(audio, 31.5);
    expect(engine.oneShot.mock.calls.map((c) => c[0])).toEqual([at('sound/keep/door.ogg')]);
    step(audio, 60);
    expect(engine.oneShot.mock.calls.map((c) => c[0])).toEqual([at('sound/keep/door.ogg'), at('sound/keep/train.ogg')]);
  });

  it('a new SceneDef for the same id is an update', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    step(audio, 2);
    audio.room(cafeState(), { ...cafe, name: 'Cafe (reinstalled)', sound: { sounds: [door, train, kettle] } }, '/scenes/', 0);
    step(audio, 3.5);
    expect(engine.oneShot).toHaveBeenCalledTimes(1);
  });

  it('moving to another room drops the old waits and walks into the new one', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    step(audio, 10);
    audio.room({ ...cafeState(), sceneId: 'bar' }, bar, '/scenes/', 0);
    step(audio, 11.5);
    step(audio, 200);
    expect(engine.oneShot.mock.calls.map((c) => c[0])).toEqual([at('sound/keep/door.ogg'), at('sound/keep/bell.ogg', 'bar')]);
  });

  it('locked on walking in: an unlock within 10 s plays the entry; nothing plays before', () => {
    const { audio, engine } = setup();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    audio.frame(5);
    wall = 5;
    audio.gesture();
    step(audio, 1.5);
    expect(engine.oneShot).toHaveBeenCalledWith(at('sound/keep/door.ogg'), 0.7, 'room');
  });

  it('an unlock after 10 s plays no entry, but the timers run', () => {
    const { audio, engine } = setup();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    wall = 11;
    audio.gesture();
    step(audio, 2);
    expect(engine.oneShot).not.toHaveBeenCalled();
    step(audio, 60);
    expect(engine.oneShot).toHaveBeenCalledWith(at('sound/keep/train.ogg'), 0.5, 'room');
  });

  it('roomSound while locked does nothing, even after unlock', () => {
    const { audio, engine } = setup();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    audio.roomSound('cafe', 'kettle');
    wall = 20;
    audio.gesture();
    step(audio, 0.1);
    expect(engine.oneShot).not.toHaveBeenCalled();
  });

  it('roomSound while the context is suspended (a hidden tab, a non-activating key) does nothing, then or later (review)', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    ctxState = 'suspended';
    audio.roomSound('cafe', 'kettle');
    ctxState = 'running';
    step(audio, 0.5);
    expect(engine.oneShot).not.toHaveBeenCalled();
  });

  it('an entry sound not heard within 10 s of walking in is dropped, whatever the audio clock says (review)', () => {
    const { audio, engine } = setup();
    // A key that unlocks without activating: the context stays suspended, its clock at 0.
    audio.room(cafeState(), cafe, '/scenes/', 0);
    audio.gesture();
    ctxState = 'suspended';
    wall = 120;
    // The real click, two minutes later: the clock runs from there.
    ctxState = 'running';
    step(audio, 1.5);
    step(audio, 2);
    expect(engine.oneShot.mock.calls.map((c) => c[0])).not.toContain(at('sound/keep/door.ogg'));
    step(audio, 60);
    expect(engine.oneShot).toHaveBeenCalledWith(at('sound/keep/train.ogg'), 0.5, 'room');
  });

  it('leave() drops the room: nothing plays, and the same room again is walked into anew (review)', () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    step(audio, 2);
    audio.leave();
    step(audio, 200);
    expect(engine.oneShot).toHaveBeenCalledTimes(1);
    wall = 300;
    audio.room(cafeState(), cafe, '/scenes/', 0);
    step(audio, 201.5);
    expect(engine.oneShot).toHaveBeenCalledTimes(2);
    expect(engine.oneShot).toHaveBeenLastCalledWith(at('sound/keep/door.ogg'), 0.7, 'room');
  });

  it("roomSound plays the current room's sound by name; another room's id or an unknown name does nothing", () => {
    const { audio, engine } = setup();
    audio.gesture();
    audio.room(cafeState(), cafe, '/scenes/', 0);
    audio.roomSound('bar', 'kettle');
    audio.roomSound('cafe', 'nope');
    expect(engine.oneShot).not.toHaveBeenCalled();
    audio.roomSound('cafe', 'kettle');
    expect(engine.oneShot).toHaveBeenCalledWith(at('sound/keep/kettle.ogg'), 0.5, 'room');
  });
});

