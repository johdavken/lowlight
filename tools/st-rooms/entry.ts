// Lowlight's room renderer as one ES module for the SillyTavern extension (tools/st-rooms/build.ts).
import { createRenderer } from '../../web/src/renderer/index';
export { roomLine } from '../../shared/room-line';
export { modelLabel } from '../../shared/model-label';
export { stageRect } from '../../web/src/ui/game-stage';
export { GREET_INSTRUCTIONS } from '../../server/src/instructions';
export { ROOM_TOOLS, checkRoomTool, appliedText, isRoomToolMessage, preToolMessage } from './room-tools';
export { stampOf, withStamp, roomFromChat } from './room-stamp';
export { planInstall } from './install-plan';
export { planSettings } from './settings-plan';
import { sceneSchema } from '../../shared/scene-schema';
import { applyPresetTo } from '../../shared/presets';
import { withBase } from '../../shared/light-share';
import type { RoomState, SceneDef } from '../../shared/types';
import { lightFilter, StageLight } from '../../web/src/ui/stage-light';
import { MapPanel } from '../../web/src/ui/map';
import { parseMap, type CityMapData, type Place } from '../../shared/map-schema';
import { AudioEngine } from '../../web/src/audio/engine';
import { createRoomAudio } from '../../web/src/audio/room-audio';
import { THUNDER_TAKES } from '../../web/src/audio/thunder';
import type { SoundView } from '../../web/src/ui/hud';
import '@fontsource/vt323';
import '@fontsource/teko/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';

/** A room's painted state: its own lights and atmosphere defaults. */
function defaultState(scene: SceneDef): RoomState {
  return { sceneId: scene.id, lights: withBase(scene.lights), atmosphere: { ...scene.defaults } };
}

/**
 * The room's light on figures (Lowlight's stage-light.ts): each element `figures()` returns gets the light
 * filter on its `img` and the room's light, left side to right, a few times a second.
 */
function lightFigures(renderer: Awaited<ReturnType<typeof createRenderer>>, figures: () => HTMLElement[]): void {
  const ready = new WeakSet<HTMLElement>();
  new StageLight(renderer, () =>
    figures().map((fig) => {
      if (!ready.has(fig)) {
        ready.add(fig);
        const { id, svg } = lightFilter('st-light');
        fig.dataset.kind = 'sprite';
        for (const [k, v] of [['--light-l', '#fff'], ['--light-r', '#fff'], ['--glow-l', '#000'], ['--glow-r', '#000'], ['--fig-filter', `url(#${id})`]]) fig.style.setProperty(k, v);
        fig.append(svg);
      }
      return fig;
    }),
  );
}

/**
 * Lowlight's room sound (web/src/audio): music, the room's bed and one-off sounds, rain, light hums, thunder.
 * The rain and thunder recordings come from `soundBase`, as sound-map.json lists them.
 */
/** Which shared sounds the extension has (build.ts writes sound-map.json); paths are under soundBase. */
export interface SoundMap {
  rain: { light: string; heavy: string } | null;
  thunder: string[];
  /** A public build's CC0 bed per room (null: the rooms' own beds). */
  beds: Record<string, { src: string; level: number }> | null;
  cues: Record<string, string>;
  /** The menu theme the select screen plays (the splash library's theme), under soundBase; null or absent: none. */
  theme?: string | null;
}
const FULL_SOUND: SoundMap = { rain: { light: 'rain-light.ogg', heavy: 'rain-heavy.ogg' }, thunder: THUNDER_TAKES.map((t) => t.url.split('/').pop()!), beds: null, cues: {} };

function roomSound(renderer: Awaited<ReturnType<typeof createRenderer>>, soundBase: string, view: (v: SoundView) => void, map: SoundMap) {
  // Only the thunder takes the extension has; with none, lightning stays silent.
  const takes = THUNDER_TAKES.filter((t) => map.thunder.includes(t.url.split('/').pop()!));
  THUNDER_TAKES.splice(0, THUNDER_TAKES.length, ...takes.map((t) => ({ ...t, url: `${soundBase}thunder/${t.url.split('/').pop()}` })));
  // No rain recording (a public build before CC0 rain is picked): the engine's own synthesized rain.
  const rainUrls = map.rain ? { light: `${soundBase}${map.rain.light}`, heavy: `${soundBase}${map.rain.heavy}` } : null;
  const engine = new AudioEngine({ warn: (m) => console.warn('[lowlight sound]', m), rainUrls });
  const audio = createRoomAudio({ engine, view });
  if (THUNDER_TAKES.length) renderer.onStrike((s) => audio.thunder(s.distance, s.sceneId));
  renderer.onFrame(() => audio.frame(renderer.time()));
  /** Away: a chat that isn't Lowlight's. The sound pauses then, as for a hidden tab. */
  let away = false;
  const quiet = () => audio.visibility(document.hidden || away);
  document.addEventListener('visibilitychange', quiet);
  // Browsers start sound only after a gesture: the first click or key anywhere unlocks it.
  // A gesture in another character's chat unlocks it still paused.
  const unlock = (e: Event) => {
    audio.gesture({ fromSpeaker: e.target instanceof Element && e.target.closest('#lowlight-sound') !== null });
    if (away) quiet();
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  /**
   * The select screen's sound, as Lowlight's own: the menu theme over the room behind, which drops to a quarter
   * (music keeps its own level). Off hands the music back to the room. Nothing is saved to the player's settings.
   */
  const menu = (on: boolean) => {
    engine.setScale(on ? MENU_SCALE : 1);
    audio.overrideMusic(on && map.theme ? `${soundBase}${map.theme}` : null);
  };
  const setAway = (on: boolean) => {
    away = on;
    quiet();
  };
  return { audio, menu, setAway };
}

/** The room behind the select screen, as the game's landing hears it (web/src/landing: scale 0.25). */
const MENU_SCALE = 0.25;

/** Draws rooms into `host` with their sound; `roomsBase` is the URL holding one folder per room (scene.json + layers),
 * `soundBase` the shared rain and thunder; `view` hears the speaker's state (locked, on, muted, levels). */
export async function mountRoom(host: HTMLElement, roomsBase: string, soundBase: string, view: (v: SoundView) => void = () => {}, map: SoundMap = FULL_SOUND) {
  const renderer = await createRenderer(host, undefined, { backdrop: true });
  const { audio, menu, setAway } = roomSound(renderer, soundBase, view, map);
  let scene: SceneDef | null = null;
  let state: RoomState | null = null;
  /** The mood last applied (null: as painted, or changed light by light since). */
  let moodName: string | null = null;
  /** What the sound engine gets: a public build's CC0 bed in place of the room's own (and none of its one-off sounds). */
  const audioScene = (sc: SceneDef): SceneDef => {
    if (!map.beds || !sc.sound) return sc;
    const bed = map.beds[sc.id];
    return { ...sc, sound: { ...sc.sound, bed: bed ? { src: `../../sound/${bed.src}`, level: bed.level } : undefined, sounds: [] } } as SceneDef;
  };
  const sound = (seconds: number, transition?: 'fade') => {
    audio.room(state!, audioScene(scene!), roomsBase, seconds, transition);
    audio.place(scene!, roomsBase, seconds);
  };
  return {
    renderer,
    audio,
    /** The select screen's sound on (theme, room at a quarter) or off. */
    menu,
    /** Away (another character's chat): the room stops drawing and its sound pauses; back, both resume. */
    away(on: boolean) {
      setAway(on);
      renderer.setPaused(on);
    },
    /** Lights the figures `figures()` returns (re-read every sample, so they can come and go). */
    light: (figures: () => HTMLElement[]) => lightFigures(renderer, figures),
    /** Loads a room by folder name at its painted state, its sound crossfading over `seconds`; returns its mood names. */
    async load(folder: string, seconds = 0): Promise<string[]> {
      const raw = await (await fetch(`${roomsBase}${folder}/scene.json`)).json();
      raw.id = folder;
      const parsed = sceneSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`scene ${folder}: ${parsed.error.message}`);
      scene = parsed.data as SceneDef;
      await renderer.loadScene(scene, roomsBase);
      state = defaultState(scene);
      moodName = null;
      renderer.applyState(state, 0);
      sound(seconds, seconds > 0 ? 'fade' : undefined);
      return Object.keys(scene.presets ?? {});
    },
    /** Tweens to a mood ('default' = the painted state), sound with it; false when the room has no such mood. */
    mood(name: string, seconds = 2): boolean {
      if (!scene || !state) return false;
      if (name === 'default') state = defaultState(scene);
      else {
        const preset = scene.presets?.[name];
        if (!preset) return false;
        state = applyPresetTo(state, preset);
      }
      moodName = name === 'default' ? null : name;
      renderer.applyState(state, seconds);
      sound(seconds);
      return true;
    },
    /** The room as it is now (null before one loads), and the mood last applied. */
    state: (): RoomState | null => state,
    moodName: (): string | null => moodName,
    /** The loaded scene (its lights, moods and exits), or null. */
    scene: (): SceneDef | null => scene,
    /** Puts a saved room back (the room must already be loaded): its lights, atmosphere and mood. */
    apply(saved: { mood: string | null; atmosphere: RoomState['atmosphere']; lights: RoomState['lights'] }, seconds = 0): void {
      if (!scene) return;
      state = { sceneId: scene.id, lights: saved.lights.map((l) => ({ ...l })), atmosphere: { ...saved.atmosphere } };
      moodName = saved.mood;
      renderer.applyState(state, seconds);
      sound(seconds);
    },
    /** One light's brightness and flicker (her set_light). */
    setLight(id: string, patch: { intensity?: number; flicker?: number }, seconds = 1.5): boolean {
      if (!state || !state.lights.some((l) => l.id === id)) return false;
      // The bases stay (as Lowlight's server set_light): turning lamps down then dims the room with them.
      state = { ...state, lights: state.lights.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
      moodName = null;
      renderer.applyState(state, seconds);
      sound(seconds);
      return true;
    },
    /** Weather, its level and fog (her set_atmosphere). */
    setAtmosphere(patch: Partial<RoomState['atmosphere']>, seconds = 1.5): void {
      if (!state) return;
      state = { ...state, atmosphere: { ...state.atmosphere, ...patch } };
      renderer.applyState(state, seconds);
      sound(seconds);
    },
    moods: (): string[] => Object.keys(scene?.presets ?? {}),
    /** The room's name as painted ("Lowlight Intake"), or null before one loads. */
    sceneName: (): string | null => scene?.name ?? null,
  };
}

/**
 * Lowlight's city map (MapPanel) in `host`: its data from `mapUrl` (its picture next to it), you at the place whose
 * room `here()` names (a room folder), GO calling `onTravel` with the place and its room folder. No gigs, comms or people.
 */
export function mountMap(
  host: HTMLElement,
  opts: { mapUrl: string; here: () => string | undefined; canGo: (folder: string) => boolean; onTravel: (place: Place, folder: string) => void },
) {
  let map: CityMapData | null = null;
  const folderOf = (p: Place) => p.scene?.split('/').pop();
  const panel = new MapPanel(host, {
    // The rendered map's tiles sit next to the map's data when the package carries them; else the painting.
    tiles: new URL('./', new URL(opts.mapUrl, location.href)).href,
    load: async () => {
      const raw = await (await fetch(opts.mapUrl)).json();
      raw.image = new URL(String(raw.image).split('/').pop()!, new URL(opts.mapUrl, location.href)).href;
      // Only places with a room in the extension can be gone to: the rest lose their room (no GO).
      for (const p of raw.places ?? []) {
        const folder = typeof p.scene === 'string' ? p.scene.split('/').pop() : undefined;
        if (!folder || !opts.canGo(folder)) delete p.scene;
      }
      const parsed = parseMap(raw);
      map = parsed.ok ? parsed.map : null;
      return raw;
    },
    who: (m) => {
      const folder = opts.here();
      const here = m.places.find((p) => folderOf(p) === folder)?.id;
      return { here, people: [] };
    },
    onTravel: (placeId) => {
      const place = map?.places.find((p) => p.id === placeId);
      const folder = place && folderOf(place);
      if (place && folder) opts.onTravel(place, folder);
    },
  });
  // MapPanel starts on the game's own picture path until the data names one: point it at the extension's copy.
  const img = host.querySelector<HTMLImageElement>('.map-img');
  if (img) img.src = new URL('lowlight.webp', new URL(opts.mapUrl, location.href)).href;
  return panel;
}
