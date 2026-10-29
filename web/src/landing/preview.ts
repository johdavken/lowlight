import type { RoomState, SceneDef, Transition } from '../../../shared/types';
import type { Renderer } from '../renderer';
import type { RoomAudio } from '../audio/room-audio';
import type { LandingAgent, PreviewLike } from './landing';
import { BACKDROP_BRIGHTNESS } from '../renderer/stage';

/** How far select.css's `.landing-stage` dims the canvas under a room (the splash isn't dimmed). */
const ROOM_DIM = 0.45;

/** How long the landing ambience takes to cross from one agent's room to the next. */
const AMBIENCE_GLIDE_SECONDS = 1;
/** The app's own pack and the skyline drawn behind the splash. */
const SPLASH_PACK = 'lowlight';
const SPLASH_SCENE = 'splash';

/**
 * Her room as she left it (or her pack's first scene at its defaults), drawn behind the landing page
 * and — once the player has clicked or pressed a key — heard faintly through `audio`. The sound doesn't
 * depend on the renderer: it plays even if WebGL can't start. Before the dial-in, `showSplash()`
 * draws the app's skyline (undimmed, silent) instead.
 */
export function createPreview(
  host: HTMLElement,
  packScenes: (pack: string) => Promise<{ base: string; scenes: SceneDef[] }>,
  opts: {
    audio?: Pick<RoomAudio, 'room'> & Partial<Pick<RoomAudio, 'thunder'>>;
    createRenderer?: (host: HTMLElement) => Promise<Renderer>;
  } = {},
): PreviewLike {
  const makeRenderer = opts.createRenderer ?? (async (h: HTMLElement) => (await import('../renderer')).createRenderer(h, undefined, { backdrop: true }));
  let renderer: Promise<Renderer | null> | null = null;
  let live: Renderer | null = null;
  const packs = new Map<string, Promise<{ base: string; scenes: SceneDef[] }>>();
  let showing = 0;
  host.classList.add('landing-stage');
  // A backdrop, not the room: cap it at 30 fps and stop it entirely while the tab is hidden.
  const onVisibility = () => void renderer?.then((r) => {
    r?.setPaused(document.hidden);
  });
  document.addEventListener('visibilitychange', onVisibility);

  const pack = (id: string) => {
    if (!packs.has(id)) packs.set(id, packScenes(id));
    return packs.get(id)!;
  };
  const getRenderer = () =>
    (renderer ??= makeRenderer(host).then(
      (r) => {
        r.setMaxFps(30);
        r.onStrike((s) => opts.audio?.thunder?.(s.distance, s.sceneId));
        live = r;
        return r;
      },
      () => null,
    ));

  return {
    async show(a: LandingAgent, showOpts: { transition?: Transition } = {}) {
      const ticket = ++showing;
      // Where she is (her saved room, named in full), else where she starts; its district's scenes come bare.
      const saved = a.room?.state ?? null;
      const startDistrict = a.startRoom.split('/')[0] ?? 'default';
      const where = !saved ? a.startRoom : saved.sceneId.includes('/') ? saved.sceneId : `${startDistrict}/${saved.sceneId}`;
      const [district, folder] = where.split('/');
      const { base, scenes } = await pack(district ?? 'default');
      const scene = scenes.find((s) => s.id === folder) ?? scenes[0];
      if (!scene || ticket !== showing) return;
      const state: RoomState = saved && scene.id === folder ? { ...saved, sceneId: scene.id } : { sceneId: scene.id, lights: scene.lights, atmosphere: scene.defaults };
      opts.audio?.room(state, scene, base, AMBIENCE_GLIDE_SECONDS, showOpts.transition);

      const r = await getRenderer();
      if (!r || ticket !== showing) return;
      const swap = async () => {
        await r.loadScene(scene, base);
        host.classList.remove('splash-stage');
        // The CSS dim covers the bars too: brighter underneath, so they still land at 35 %.
        r.setBackdropBrightness(BACKDROP_BRIGHTNESS / ROOM_DIM);
        if (ticket === showing) r.applyState(state, 0);
      };
      if (showOpts.transition) await r.playTransition(showOpts.transition, swap);
      else await swap();
    },
    async showSplash() {
      const ticket = ++showing;
      let scene: SceneDef | undefined;
      let base = '';
      try {
        const p = await pack(SPLASH_PACK);
        base = p.base;
        scene = p.scenes.find((s) => s.id === SPLASH_SCENE);
      } catch {
        scene = undefined;
      }
      if (!scene) {
        console.warn(`[landing] the ${SPLASH_PACK}/${SPLASH_SCENE} scene is missing; the splash falls back to a plain background`);
        return false;
      }
      const r = await getRenderer();
      if (!r || ticket !== showing) return false;
      try {
        await r.loadScene(scene, base);
      } catch (err) {
        console.warn(`[landing] the splash scene failed to load (${err instanceof Error ? err.message : String(err)})`);
        return false;
      }
      if (ticket !== showing) return false;
      host.classList.add('splash-stage');
      r.setBackdropBrightness(BACKDROP_BRIGHTNESS);
      r.applyState({ sceneId: scene.id, lights: scene.lights, atmosphere: scene.defaults }, 0);
      return true;
    },
    nonBlank() {
      return live?.nonBlank() ?? false;
    },
    frameSize() {
      return live?.frameSize() ?? [480, 270];
    },
    async glitch() {
      const r = await getRenderer();
      if (!r) return;
      await r.playTransition('glitch', async () => {});
    },
    dispose() {
      showing++;
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
