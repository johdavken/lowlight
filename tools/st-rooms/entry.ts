// Lowlight's room renderer as one ES module for the SillyTavern extension (tools/st-rooms/build.ts).
import { createRenderer } from '../../web/src/renderer/index';
import { sceneSchema } from '../../shared/scene-schema';
import { applyPresetTo } from '../../shared/presets';
import { withBase } from '../../shared/light-share';
import type { RoomState, SceneDef } from '../../shared/types';
import { lightFilter, StageLight } from '../../web/src/ui/stage-light';
import { MapPanel } from '../../web/src/ui/map';
import { parseMap, type CityMapData, type Place } from '../../shared/map-schema';
import { AudioEngine, RAIN_URLS } from '../../web/src/audio/engine';
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
 * The rain and thunder recordings are fixed at the game's /sound/ paths: they're pointed at `soundBase` instead.
 */
function roomSound(renderer: Awaited<ReturnType<typeof createRenderer>>, soundBase: string, view: (v: SoundView) => void) {
  RAIN_URLS.light = `${soundBase}rain-light.ogg`;
  RAIN_URLS.heavy = `${soundBase}rain-heavy.ogg`;
  for (const t of THUNDER_TAKES) t.url = `${soundBase}thunder/${t.url.split('/').pop()}`;
  const audio = createRoomAudio({ engine: new AudioEngine({ warn: (m) => console.warn('[lowlight sound]', m) }), view });
  renderer.onStrike((s) => audio.thunder(s.distance, s.sceneId));
  renderer.onFrame(() => audio.frame(renderer.time()));
  document.addEventListener('visibilitychange', () => audio.visibility(document.hidden));
  // Browsers start sound only after a gesture: the first click or key anywhere unlocks it.
  const unlock = (e: Event) => audio.gesture({ fromSpeaker: e.target instanceof Element && e.target.closest('#lowlight-sound') !== null });
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  return audio;
}

/** Draws rooms into `host` with their sound; `roomsBase` is the URL holding one folder per room (scene.json + layers),
 * `soundBase` the shared rain and thunder; `view` hears the speaker's state (locked, on, muted, levels). */
export async function mountRoom(host: HTMLElement, roomsBase: string, soundBase: string, view: (v: SoundView) => void = () => {}) {
  const renderer = await createRenderer(host, undefined, { backdrop: true });
  const audio = roomSound(renderer, soundBase, view);
  let scene: SceneDef | null = null;
  let state: RoomState | null = null;
  const sound = (seconds: number, transition?: 'fade') => {
    audio.room(state!, scene!, roomsBase, seconds, transition);
    audio.place(scene!, roomsBase, seconds);
  };
  return {
    renderer,
    audio,
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
      renderer.applyState(state, seconds);
      sound(seconds);
      return true;
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
