import { musicDir } from '../scene-paths';
import type { RoomState, SceneDef, Transition } from '../../../shared/types';
import type { SoundView } from '../ui/hud';
import type { AudioEngine, Channel, EngineState } from './engine';
import { SCENE_MUSIC_FADE_SECONDS, SCENE_MUSIC_LEVEL, songUrl, soundMix, type Mix } from './mix';
import { Playlist, type PlaylistAction, type PlaylistState } from './playlist';
import { loadSoundSettings, saveSoundSettings, type SoundSettings } from './settings';
import { ENTRY_GRACE_SECONDS, RoomSounds } from './room-sounds';
import { chooseTake, THUNDER_TAKES, thunderLevel } from './thunder';
import { seededRng, strikeShape } from '../renderer/effects/lightning';

const WHEEL_STEP = 0.05;
/** SYS's AMBIENT: everything but the songs, moved together. */
const AMBIENT: Channel[] = ['weather', 'room', 'lights'];
/** The first sound fades in rather than stepping up from silence. */
const UNLOCK_FADE_SECONDS = 0.6;

export type EngineLike = Pick<AudioEngine, 'unlock' | 'apply' | 'music' | 'tick' | 'setMaster' | 'setChannel' | 'setScale' | 'suspend' | 'resume' | 'state' | 'burst' | 'oneShot' | 'preload' | 'thunder' | 'cancelThunder'> &
  Partial<Pick<AudioEngine, 'onStateChange' | 'onMusicEnded' | 'clock'>>;

/** The engine's state plus the room's playlist (what plays, or the pause until when). */
export type RoomAudioState = EngineState & { playlist: PlaylistState; scene: string | null };

/**
 * Connects a page to the sound engine: gestures unlock it, room events become mixes, the tab's
 * visibility suspends it, and the player's speaker / mixer change it (and are remembered). Until the first
 * gesture it only remembers the latest room, then plays it at once. A new page always starts locked.
 */
export function createRoomAudio(deps: {
  engine: EngineLike;
  view?: (v: SoundView) => void;
  /** 1 in a room; 0.25 for the landing page's faint ambience. */
  scale?: number;
  settings?: { load(): SoundSettings; save(s: SoundSettings): void };
  /** The songs' shuffle and pauses (a different order on each page load; tests pass their own). */
  rng?: () => number;
  /** Wall-clock seconds: how long ago a room was walked into before sound was unlocked. */
  now?: () => number;
}) {
  const { engine } = deps;
  const store = deps.settings ?? { load: loadSoundSettings, save: saveSoundSettings };
  const s = store.load();
  let unlocked = false;
  let pending: Mix | null = null;
  let pendingMusic: { url: string | null; level: number; seconds: number; opts?: { loop?: boolean } } | null = null;
  /** `preloadCue` urls asked for before unlock, issued once unlock() runs. */
  const pendingPreloads = new Set<string>();
  /** A first click on SYS's SOUND row unlocks; its own click event must not then also toggle mute. */
  let swallowToggle = false;
  /** The room being played: thunder is muffled when it's indoors; a change cancels pending thunder. */
  let placed: SceneDef | null = null;
  let lastTake: string | null = null;
  const thunderRng = seededRng(0x7d1);
  /** The room's songs: shuffled, with pauses. Only a change of room re-enters it. */
  const playlist = new Playlist(deps.rng ?? Math.random);
  /** The room and its song list the playlist last entered: a new list under the same id (a Studio install) counts as a change. */
  let musicScene: string | null = null;
  let musicBase = '';
  /** The scene whose songs are placed (the e2e waits on it). */
  let placedScene: string | null = null;
  let musicLevel = SCENE_MUSIC_LEVEL;
  const clock = () => engine.clock?.() ?? 0;
  const wallNow = deps.now ?? (() => performance.now() / 1000);
  /** The room's one-off sounds, on the audio clock (frozen while hidden), through the room channel. */
  const roomSounds = new RoomSounds({ play: (url, level) => engine.oneShot(url, level, 'room'), rng: deps.rng ?? Math.random });
  /** The room walked into while still locked, and when: the first unlock starts its sounds. */
  let walkedIn: { scene: SceneDef; base: string; at: number } | null = null;
  /**
   * Wall-clock time after which entry sounds not heard yet are dropped. The audio clock alone can't
   * tell: it stands still while the context is suspended (a hidden tab, a key that didn't activate).
   */
  let entryDeadline: number | null = null;
  const walkIn = (scene: SceneDef, base: string, at: number) => {
    const entry = wallNow() - at <= ENTRY_GRACE_SECONDS;
    roomSounds.enter(scene, base, clock(), { entry });
    entryDeadline = entry ? at + ENTRY_GRACE_SECONDS : null;
  };

  engine.setMaster(s.master, s.muted);
  for (const ch of Object.keys(s.channels) as Channel[]) engine.setChannel(ch, s.channels[ch]);
  engine.setScale(deps.scale ?? 1);

  const show = (v: SoundView) => deps.view?.(v);
  /** AMBIENT reads as the loudest of its channels (the dev panel can set them apart). */
  const ambient = () => Math.max(...AMBIENT.map((ch) => s.channels[ch]));
  const showOn = () => show({ kind: 'on', volume: s.master, muted: s.muted, music: s.channels.music, ambient: ambient() });
  const persist = () => store.save(s);
  const step = (v: number, steps: number) => Math.min(1, Math.max(0, Math.round((v + WHEEL_STEP * steps) * 100) / 100));
  const setChannels = (chs: Channel[], v: number) => {
    for (const ch of chs) {
      s.channels[ch] = v;
      engine.setChannel(ch, v);
    }
    persist();
  };
  /** "On" only while the context really runs (a suspended one — e.g. after a non-activating key — shows ♪ on SYS). */
  const refresh = () => (engine.state().context === 'running' ? showOn() : show({ kind: 'locked' }));
  engine.onStateChange?.(() => {
    if (unlocked) refresh();
  });
  show({ kind: 'locked' });

  const music = (url: string | null, level: number, seconds: number, opts?: { loop?: boolean }): void => {
    if (unlocked) {
      if (opts) engine.music(url, level, seconds, opts);
      else engine.music(url, level, seconds);
    } else pendingMusic = { url, level, seconds, ...(opts ? { opts } : {}) };
  };
  /** A room's song plays once (then a pause, then the next). */
  const playSong = (song: string, seconds: number) => music(songUrl(musicBase, song), musicLevel, seconds, { loop: false });
  /** A track that has taken over the music (the hack window's), or null: the playlist waits under it. */
  let override: string | null = null;
  const act = (a: PlaylistAction | null, seconds: number) => {
    if (!a || override) return;
    if ('play' in a) playSong(a.play, seconds);
    else music(null, 0, seconds);
  };
  const songOf = (url: string) => decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
  engine.onMusicEnded?.((url, failed) => {
    if (failed) act(playlist.failed(songOf(url), clock()), SCENE_MUSIC_FADE_SECONDS);
    else playlist.ended(songOf(url), clock());
  });

  return {
    /** `fromSpeaker`: the gesture landed on the HUD speaker itself. */
    gesture(opts: { fromSpeaker?: boolean } = {}): void {
      const ok = engine.unlock(); // also resumes a context the browser suspended
      if (!ok) {
        show({ kind: 'hidden' });
        return;
      }
      if (!unlocked) {
        unlocked = true;
        swallowToggle = opts.fromSpeaker === true;
        if (pending) engine.apply(pending, UNLOCK_FADE_SECONDS, undefined);
        // The queued request keeps its own fade if longer (a scene song fades in over 1.2 s).
        if (pendingMusic) {
          const fade = Math.max(UNLOCK_FADE_SECONDS, pendingMusic.seconds);
          if (pendingMusic.opts) engine.music(pendingMusic.url, pendingMusic.level, fade, pendingMusic.opts);
          else engine.music(pendingMusic.url, pendingMusic.level, fade);
        }
        pending = null;
        pendingMusic = null;
        for (const url of pendingPreloads) engine.preload(url);
        pendingPreloads.clear();
        // A room walked into moments ago still gets its entry sounds; its timers start either way.
        if (walkedIn) walkIn(walkedIn.scene, walkedIn.base, walkedIn.at);
        walkedIn = null;
      } else {
        swallowToggle = false;
      }
      refresh();
    },

    room(state: RoomState, scene: SceneDef, base: string, duration: number, transition?: Transition): void {
      // Thunder belongs to its room: a room change cancels what's still waiting.
      if (placed?.id !== scene.id) {
        if (placed && unlocked) engine.cancelThunder();
        placed = scene;
        // Walking in: the room's own sounds start (once sound is unlocked).
        if (unlocked) walkIn(scene, base, wallNow());
        else walkedIn = { scene, base, at: wallNow() };
        if (scene.effects?.some((e) => e.kind === 'lightning')) {
          for (const t of THUNDER_TAKES) {
            if (unlocked) engine.preload(t.url);
            else pendingPreloads.add(t.url);
          }
        }
      } else {
        // The same room (a mood change, an edit, a reinstall): only what changed in its sounds restarts.
        placed = scene;
        if (unlocked) roomSounds.update(scene, base, clock());
        else if (walkedIn) walkedIn = { ...walkedIn, scene, base };
      }
      const mix = soundMix(state, scene, base);
      if (unlocked) engine.apply(mix, duration, transition);
      else pending = mix;
    },

    /** A music track at `level`, gliding over `seconds`; before the first gesture only the latest request is kept. */
    music,

    /** The static burst alone (e.g. a glitch print with no room sound change); silent until unlocked. */
    burst(): void {
      if (unlocked) engine.burst();
    },

    /** A one-shot UI sample (e.g. the select screen's page swap); silent until unlocked. */
    cue(url: string, level?: number): void {
      if (unlocked) engine.oneShot(url, level);
    },

    /**
     * One of the room's sounds by name (the agent's `play_sound`), now. Silent while locked (never
     * queued: it belongs to the moment), and dropped when `sceneId` isn't the room being played.
     */
    roomSound(sceneId: string, name: string): void {
      // A suspended context would play it whenever it next runs: by then it's not this moment's.
      if (unlocked && placed?.id === sceneId && engine.state().context === 'running') roomSounds.play(name);
    },

    /** Leaving the room (Studio's other pages): its sounds stop waiting; the next room() walks in anew. */
    leave(): void {
      roomSounds.leave();
      placed = null;
      walkedIn = null;
      entryDeadline = null;
    },

    /** Warms a cue's buffer so its first play isn't the one paying for the fetch+decode. Runs once
     * unlocked; a request made before that is remembered and issued on unlock. */
    preloadCue(url: string): void {
      if (unlocked) engine.preload(url);
      else pendingPreloads.add(url);
    },

    /**
     * The scene's songs (or silence, for a place without any), fading over at least 1.2 s. A change
     * of room re-enters the playlist (a shared song carries on); an update to the same room only
     * glides the playing song's level, so a light change never cuts a pause short.
     */
    place(scene: SceneDef, base: string, duration: number): void {
      const fade = Math.max(duration, SCENE_MUSIC_FADE_SECONDS);
      musicBase = musicDir(scene, base);
      placedScene = scene.id;
      musicLevel = scene.sound?.music?.level ?? SCENE_MUSIC_LEVEL;
      const songs = scene.sound?.music?.songs ?? [];
      const key = [scene.id, ...songs].join('\n');
      if (key !== musicScene) {
        musicScene = key;
        const a = playlist.enter(songs, clock());
        if (a) return act(a, fade);
      }
      const song = playlist.state().song;
      if (song && !override) playSong(song, fade);
    },

    /**
     * A track takes over the music (looping) and the room's playlist waits under it; null hands the
     * music back: the room's current song, or silence.
     */
    overrideMusic(url: string | null, level = SCENE_MUSIC_LEVEL): void {
      override = url;
      if (url) return music(url, level, SCENE_MUSIC_FADE_SECONDS, { loop: true });
      const song = playlist.state().song;
      if (song) playSong(song, SCENE_MUSIC_FADE_SECONDS);
      else music(null, 0, SCENE_MUSIC_FADE_SECONDS);
    },

    /** Shortens the pause between songs (e2e). */
    setMusicPause(min: number, max: number): void {
      playlist.setPause(min, max);
    },

    /**
     * A lightning strike `distance` away (0 near … 1 far): its thunder after `1 + 3 × distance` s.
     * Silent until unlocked. A strike from a room other than the current one (the renderer is still
     * showing the room being left) is dropped.
     */
    thunder(distance: number, sceneId?: string): void {
      if (!unlocked || (sceneId !== undefined && sceneId !== placed?.id)) return;
      lastTake = chooseTake(distance, lastTake, thunderRng);
      engine.thunder(lastTake, thunderLevel(distance), strikeShape(distance, 1).delay, placed?.sound?.indoor === true);
    },

    visibility(hidden: boolean): void {
      if (!unlocked) return;
      if (hidden) engine.suspend();
      else engine.resume();
    },

    frame(tSec: number): void {
      if (!unlocked) return;
      engine.tick(tSec);
      if (entryDeadline !== null && wallNow() > entryDeadline) {
        roomSounds.dropEntries();
        entryDeadline = null;
      }
      roomSounds.tick(clock());
      // The pause runs on the audio clock: it stands still while the tab is hidden.
      act(playlist.tick(clock()), SCENE_MUSIC_FADE_SECONDS);
    },

    toggleMute(): void {
      if (!unlocked) return;
      if (swallowToggle) {
        swallowToggle = false;
        return;
      }
      s.muted = !s.muted;
      engine.setMaster(s.master, s.muted);
      persist();
      refresh();
    },

    wheel(steps: number): void {
      if (!unlocked) return;
      s.master = step(s.master, steps);
      engine.setMaster(s.master, s.muted);
      persist();
      refresh();
    },

    /** SYS's MUSIC: the songs' channel, in 5% steps. */
    musicStep(steps: number): void {
      if (!unlocked) return;
      setChannels(['music'], step(s.channels.music, steps));
      refresh();
    },

    /** SYS's AMBIENT: weather, room and lights to one level, in 5% steps from the loudest. */
    ambientStep(steps: number): void {
      if (!unlocked) return;
      setChannels(AMBIENT, step(ambient(), steps));
      refresh();
    },

    setChannel(ch: Channel, v: number): void {
      setChannels([ch], v);
      if (unlocked) refresh();
    },

    settings(): SoundSettings {
      return structuredClone(s);
    },

    state(): RoomAudioState {
      return { ...engine.state(), playlist: playlist.state(), scene: placedScene };
    },
  };
}

export type RoomAudio = ReturnType<typeof createRoomAudio>;
