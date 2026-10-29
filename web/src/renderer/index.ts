import { effectsSeed } from '../scene-paths';
import { Application, BlurFilter, ColorMatrixFilter, Container, Graphics, RenderTexture, Sprite, Texture, TextureStyle } from 'pixi.js';
import { lerpOklab } from '../../../shared/color';
import type { RoomState, SceneDef, TimeOfDay, Transition } from '../../../shared/types';
import { frameUnit, isFlat, LEGACY_FRAME, type FrameSize } from '../../../shared/frame';
import { cameraFor } from './camera';
import { flickerFactor } from './flicker';
import { idSeed, lightGlowAlpha } from './glow-alpha';
import { destroyLayers, frameAfterLoad, loadLayers, placeLayer, type Layer } from './layers';
import { LightingFilter, lightAt, MAX_LIGHTS, shadedAtmosphere, type ShaderLight } from './lighting';
import { createFrameTexture, setSmooth } from './frame-texture';
import { Atmospherics, bloomBlur, createBloom, FRAME, Grade, WeatherLayer } from './post';
import { BACKDROP_BRIGHTNESS, backdropBlurStrength, backdropView, devicePixels, parallaxTarget, RENDER_H, RENDER_W, screenToRender, stageView } from './stage';
import type { StageRect } from '../ui/game-stage';
import { Transitions } from './transitions';
import { TweenedState } from './tween';
import { WeatherSystem } from './weather';
import { weatherBoundsFor, weatherLightsFor } from './weather-frame';
import { drawArea, isMasked, maskFor } from './weather-mask';
import { EffectsLayer, type EffectsArt, type EffectsState, type Strike } from './effects';

export interface Renderer {
  /** `base` is where the scene's pack is served (default '/scenes/'). */
  loadScene(scene: SceneDef, base?: string): Promise<void>;
  applyState(state: RoomState, duration: number, transition?: Transition): void;
  fps(): number;
  /** Seconds on the renderer's own clock (what the flicker uses), so sound can crackle in sync. */
  time(): number;
  onWarn(fn: (msg: string) => void): void;
  /** Runs a scene transition around `swap` (which loads the new scene): fade 1.2 s, glitch 0.6 s. */
  playTransition(kind: Transition, swap: () => Promise<void>): Promise<void>;
  /** True if more than 5% of the scene render texture's pixels are not black (test hook). */
  nonBlank(): boolean;
  /** Stops/resumes drawing (the landing preview pauses while the tab is hidden). */
  setPaused(paused: boolean): void;
  /** Caps the frame rate; 0 = uncapped. */
  setMaxFps(fps: number): void;
  /** Called on each lightning strike in the current room (the sound plays the thunder). */
  onStrike(fn: (s: Strike) => void): void;
  /** The room's light at a point on screen (CSS px), from what was shaded last frame; null before a room state is shaded. */
  lightAt(cssX: number, cssY: number): [number, number, number] | null;
  /** Runs `fn` after each frame is shaded; returns the remover. */
  onFrame(fn: () => void): () => void;
  /** The room's effects this frame, whether weather particles were drawn and whether they're clipped to the room's window shapes (test hook). */
  effectsState(): EffectsState & { weatherDrawn: boolean; weatherMasked: boolean };
  /** One pixel of the room's frame, `[r, g, b]` (test hook: reads the whole frame back, so slow). */
  pixelAt(x: number, y: number): [number, number, number];
  /** The loaded room's frame in px: 480×270, or 1536×864 for a flat room (test hook). */
  frameSize(): [number, number];
  /** The room's drawn size on the canvas, in device px (test hook). */
  viewSize(): [number, number];
  /** Where the room is drawn, in window css px (test hook). */
  roomRect(): { left: number; top: number; width: number; height: number };
  /** The bars' brightness (the landing raises it where its own CSS dims the whole canvas). */
  setBackdropBrightness(v: number): void;
}

/** The game stage the room fits (spec 2026-10-16 fixed stage §3); without one the room fits the whole canvas. */
export interface StageSource {
  rect(): StageRect;
  onRect(cb: (r: StageRect) => void): () => void;
}

/** The bars' blurred copy of the room: its blur (device px) and the filter's resolution. */
const BACKDROP_BLUR = 24;
const BACKDROP_RESOLUTION = 0.5;

/** Per-frame context handed to post-layer hooks (Task 10: lighting, fog, weather, grade). */
export interface FrameContext {
  /** Seconds since the renderer started. */
  t: number;
  /** Seconds since the previous frame. */
  dt: number;
  /** The room state sampled from the tween this frame, or null before the first `applyState`. */
  state: RoomState | null;
  /** Strength (0..1) of the timeOfDay tint this frame. */
  timeOfDayLevel: number;
  /** Camera offset at parallax 1 (continuous, render-texture px). */
  camera: { x: number; y: number };
}

/** Mouse smoothing rate (1/s): higher follows the pointer more tightly. */
const MOUSE_FOLLOW = 3;

/** Lights sit visually mid-depth: they move with the camera at this parallax. */
const LIGHT_PARALLAX = 0.5;

/** timeOfDay tint for the sky/back layer, applied at 25% × timeOfDayLevel. */
const TIME_OF_DAY_TINT: Record<TimeOfDay, string> = {
  dusk: '#ff7a50',
  night: '#ffffff',
  'late-night': '#8080c0',
  dawn: '#ffb0a0',
};
const TIME_OF_DAY_STRENGTH = 0.25;


export class PixiRenderer implements Renderer {
  /** Everything drawn into the render texture (the room's own frame size), in draw order. */
  readonly sceneRoot = new Container();
  /** Diffuse layers, back to front, lit by the lighting filter. */
  readonly diffuse = new Container();
  /** Emissive maps aligned with their layers, added on top at full brightness and bloomed. */
  readonly emissive = new Container();
  /** Drawn after the layers: fog, light shafts, weather particles. */
  readonly overlay = new Container();
  /** The room's ambient effects (screens, LEDs, dust, lightning), above the glow, below fog and weather. */
  readonly effectsHost = new Container();
  /** Rain on the glass, in the overlay above the weather particles. */
  readonly glassHost = new Container();
  /** The upscaled view of the render texture on screen, with the final grade. */
  readonly view: Sprite;
  /** The same frame, blurred and dimmed, covering the canvas behind the room: it fills the bars. */
  private readonly backdrop: Sprite;
  private readonly backdropDim = new ColorMatrixFilter();
  readonly renderTexture: RenderTexture;

  /** Room state sampled this frame (null until the first state arrives). */
  current: RoomState | null = null;
  /** Called every frame after layers are positioned, before the scene is rendered. */
  readonly frameHooks: Array<(ctx: FrameContext) => void> = [];

  private layers: Layer[] = [];
  /** The loaded room's frame (render-texture size). */
  private frameRes: FrameSize = LEGACY_FRAME;
  private bloom = createBloom();
  /** Black copies of front layers that occlude emissive maps further back. */
  private occluders: Array<{ sprite: Sprite | Graphics; layer: Layer }> = [];
  private sceneId: string | null = null;
  private loadToken = 0;
  private tween: TweenedState | null = null;
  private warnFns: Array<(msg: string) => void> = [];
  private mouseTarget = { x: 0, y: 0 };
  private mouse = { x: 0, y: 0 };
  private t = 0;
  private readonly lighting = new LightingFilter();
  /** The canvas view's fit from the last resize (device px), for mapping screen points into the room. */
  private viewFit = { scale: 1, x: 0, y: 0, dpr: 1 };
  private readonly atmospherics = new Atmospherics();
  private readonly weather = new WeatherSystem(RENDER_W, RENDER_H, 0x6e1c);
  private readonly weatherLayer = new WeatherLayer();
  /** The room's window shapes in frame px, clipping the rain (unscaled: the rain's gfx is the scaled one). */
  private readonly weatherMask = new Graphics();
  private effects: EffectsLayer | null = null;
  private readonly strikeFns: Array<(s: Strike) => void> = [];
  private weatherHidden = false;
  private weatherDrawn = false;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly fade = new Graphics().rect(0, 0, RENDER_W, RENDER_H).fill(0x000000);
  private readonly grade: Grade;
  private readonly transitions: Transitions;

  constructor(
    readonly app: Application,
    private readonly host: HTMLElement,
    private readonly stage?: StageSource,
    /** Whether a blurred copy of the room fills the bars (the game and the landing; not Studio). */
    private readonly backdropOn = stage !== undefined,
  ) {
    this.renderTexture = createFrameTexture(RENDER_W, RENDER_H);
    this.view = new Sprite(this.renderTexture);
    this.backdrop = new Sprite(this.renderTexture);
    this.backdropDim.brightness(BACKDROP_BRIGHTNESS, false);
    // At half resolution: the blur is cheap over a 4K canvas and can't look any sharper anyway.
    this.backdrop.filters = [
      new BlurFilter({ strength: backdropBlurStrength(BACKDROP_BLUR, BACKDROP_RESOLUTION), quality: 3, resolution: BACKDROP_RESOLUTION }),
      this.backdropDim,
    ];

    this.diffuse.filterArea = FRAME;
    this.diffuse.filters = [this.lighting];
    // Additive only at composite time (the bloom filter's blend mode): a blendMode on the container
    // would be inherited by its children and break the black occluders below.
    this.emissive.filterArea = FRAME;
    this.emissive.filters = [this.bloom];
    this.overlay.addChild(this.atmospherics.fog, this.atmospherics.shafts, this.weatherLayer.gfx, this.weatherMask, this.glassHost);
    this.fade.alpha = 0;
    this.fade.visible = false;
    this.sceneRoot.addChild(this.diffuse, this.emissive, this.effectsHost, this.overlay, this.fade);
    app.stage.addChild(this.backdrop, this.view);

    this.grade = new Grade(this.view);
    this.transitions = new Transitions({
      setFade: (a) => {
        this.fade.alpha = a;
        this.fade.visible = a > 0;
      },
      setGlitch: (a) => this.grade.glitch(a),
    });

    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
    stage?.onRect(() => this.resize());
    window.addEventListener('pointermove', (e) => {
      // Across the stage (or the host's own box without one), not the window: the bars are outside the room.
      const t = parallaxTarget(e.clientX, e.clientY, this.stage?.rect() ?? this.host.getBoundingClientRect());
      this.mouseTarget.x = t.x;
      this.mouseTarget.y = t.y;
    });
    document.documentElement.addEventListener('pointerleave', () => {
      this.mouseTarget.x = 0;
      this.mouseTarget.y = 0;
    });
    app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));
  }

  async loadScene(scene: SceneDef, base = '/scenes/'): Promise<void> {
    const token = ++this.loadToken;
    const layers = await loadLayers(scene, (msg) => this.warn(msg), base);
    const won = token === this.loadToken;
    // Only the latest load sizes the frame; scene swaps run at a transition's dark moment, so the
    // resize never shows.
    this.applyFrame(frameAfterLoad(this.frameRes, scene, won));
    if (!won) {
      destroyLayers(layers, this);
      return;
    }
    for (const o of this.occluders) o.sprite.destroy();
    this.occluders = [];
    destroyLayers(this.layers, this);
    this.layers = layers;
    this.sceneId = scene.id;
    this.weather.setRegion(weatherBoundsFor(this.frameRes, scene.weatherArea));
    // A room without shapes rains over the whole frame: the last room's mask must not carry over.
    if (maskFor(scene.weatherArea)) {
      drawArea(this.weatherMask, scene.weatherArea);
      this.weatherLayer.gfx.mask = this.weatherMask;
    } else {
      this.weatherLayer.gfx.mask = null;
      this.weatherMask.clear();
    }
    this.weatherHidden = scene.weatherHidden === true;
    this.effects?.destroy();
    this.effects = null;
    // In the emissive pass, each layer's diffuse silhouette is drawn black over the emissive maps
    // of the layers behind it, so a glowing window in the back layer can't shine through the wall.
    let behindGlows = false;
    for (const l of layers) {
      this.diffuse.addChild(l.diffuse);
      if (behindGlows) {
        const sprite = l.diffuse instanceof Sprite ? new Sprite(l.diffuse.texture) : new Graphics(l.diffuse.context);
        sprite.tint = 0x000000;
        this.emissive.addChild(sprite);
        this.occluders.push({ sprite, layer: l });
      }
      if (l.emissive) {
        this.emissive.addChild(l.emissive);
        behindGlows = true;
      }
      for (const g of l.perLightEmissive) {
        this.emissive.addChild(g.sprite);
        behindGlows = true;
      }
    }
    // After the layers, so the effects' glow pass (LED dimming) sits above the room's glow maps.
    if (scene.effects?.length || scene.lights.some((l) => l.dust)) {
      this.effects = new EffectsLayer(scene, roomArt(layers), { reducedMotion: this.reducedMotion, seed: effectsSeed(scene) });
      for (const msg of this.effects.state().disabled) this.warn(msg);
      this.effects.onStrike((s) => {
        for (const fn of this.strikeFns) fn(s);
      });
      this.effectsHost.addChild(this.effects.view);
      this.glassHost.addChild(this.effects.glassView);
      this.emissive.addChild(this.effects.glowView);
    }
  }

  /** `transition` only matters for scene changes, which go through `playTransition`. */
  applyState(state: RoomState, duration: number, _transition?: Transition): void {
    if (this.sceneId !== null && state.sceneId !== this.sceneId) {
      this.warn(`state for scene ${state.sceneId} applied while ${this.sceneId} is loaded`);
    }
    if (!this.tween) this.tween = new TweenedState(state);
    else this.tween.retarget(state, duration, this.t);
  }

  setPaused(paused: boolean): void {
    if (paused) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  setMaxFps(fps: number): void {
    this.app.ticker.maxFPS = fps;
  }

  time(): number {
    return this.t;
  }

  onStrike(fn: (s: Strike) => void): void {
    this.strikeFns.push(fn);
  }

  effectsState(): EffectsState & { weatherDrawn: boolean; weatherMasked: boolean } {
    const s = this.effects?.state() ?? { screens: [], leds: 0, dust: 0, glass: 0, puffs: 0, passes: 0, strikes: 0, flash: 0, flashArea: null, disabled: [] };
    return { ...s, weatherDrawn: this.weatherDrawn, weatherMasked: isMasked(this.weatherLayer.gfx) };
  }

  pixelAt(x: number, y: number): [number, number, number] {
    const { pixels, width } = this.app.renderer.extract.pixels(this.renderTexture);
    const o = (Math.round(y) * width + Math.round(x)) * 4;
    return [pixels[o], pixels[o + 1], pixels[o + 2]];
  }

  frameSize(): [number, number] {
    return [this.frameRes[0], this.frameRes[1]];
  }

  viewSize(): [number, number] {
    const b = this.view.getBounds();
    return [Math.round(b.width), Math.round(b.height)];
  }

  setBackdropBrightness(v: number): void {
    this.backdropDim.brightness(v, false);
  }

  roomRect(): { left: number; top: number; width: number; height: number } {
    const { scale, x, y, dpr } = this.viewFit;
    return { left: x / dpr, top: y / dpr, width: (this.frameRes[0] * scale) / dpr, height: (this.frameRes[1] * scale) / dpr };
  }

  /** The stage's rect in window css px: the game stage's, or the whole canvas without one. */
  private stageRect(): StageRect {
    return this.stage?.rect() ?? { scale: 1, left: 0, top: 0, width: this.host.clientWidth, height: this.host.clientHeight };
  }

  fps(): number {
    return this.app.ticker.FPS;
  }

  /** True if more than 5% of the scene render texture's pixels are not black (test hook). */
  nonBlank(): boolean {
    const { pixels } = this.app.renderer.extract.pixels(this.renderTexture);
    let nonBlack = 0;
    const total = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0) nonBlack++;
    }
    return nonBlack / total > 0.05;
  }

  onWarn(fn: (msg: string) => void): void {
    this.warnFns.push(fn);
  }

  playTransition(kind: Transition, swap: () => Promise<void>): Promise<void> {
    return this.transitions.playTransition(kind, swap);
  }

  /** Scene id of the currently loaded layers. */
  loadedSceneId(): string | null {
    return this.sceneId;
  }

  private warn(msg: string): void {
    for (const fn of this.warnFns) fn(msg);
  }

  lightAt(cssX: number, cssY: number): [number, number, number] | null {
    const f = this.lighting.frame;
    if (!f || !this.current) return null;
    const v = this.viewFit;
    return lightAt(screenToRender(cssX, cssY, v.dpr, v), f);
  }

  onFrame(fn: () => void): () => void {
    const hook = () => fn();
    this.frameHooks.push(hook);
    return () => {
      const i = this.frameHooks.indexOf(hook);
      if (i >= 0) this.frameHooks.splice(i, 1);
    };
  }

  private frame(dt: number): void {
    this.t += dt;
    const k = 1 - Math.exp(-dt * MOUSE_FOLLOW);
    this.mouse.x += (this.mouseTarget.x - this.mouse.x) * k;
    this.mouse.y += (this.mouseTarget.y - this.mouse.y) * k;

    this.current = this.tween ? this.tween.sample(this.t) : null;
    const camera = cameraFor(this.frameRes, this.t, this.mouse);
    for (const l of this.layers) placeLayer(l, camera);
    for (const o of this.occluders) o.sprite.position.copyFrom(o.layer.diffuse.position);

    const ctx: FrameContext = {
      t: this.t,
      dt,
      state: this.current,
      timeOfDayLevel: this.tween ? this.tween.timeOfDayLevel(this.t) : 1,
      camera,
    };
    this.effects?.update({ dt, t: this.t, state: this.current });
    this.shade(ctx);
    for (const hook of this.frameHooks) hook(ctx);

    this.app.renderer.render({
      container: this.sceneRoot,
      target: this.renderTexture,
      clear: true,
      clearColor: 0x000000,
    });
  }

  /** Lighting, time-of-day tint, fog, shafts and weather for this frame. */
  private shade(ctx: FrameContext): void {
    this.transitions.update(ctx.dt);
    const state = ctx.state;
    if (!state) {
      this.weatherLayer.draw('none', []);
      this.weatherDrawn = false;
      return;
    }
    const atmo = shadedAtmosphere(state);
    const ox = ctx.camera.x * LIGHT_PARALLAX;
    const oy = ctx.camera.y * LIGHT_PARALLAX;
    const lights: ShaderLight[] = state.lights.slice(0, MAX_LIGHTS).map((l) => ({
      pos: [l.pos[0] + ox, l.pos[1] + oy],
      color: l.color,
      intensity: l.intensity * flickerFactor(ctx.t, l.flicker, idSeed(l.id)),
      radius: l.radius,
    }));
    // A passing light is lit like the room's own, in the slot after them; fog and shafts leave it out.
    const pass = this.effects?.passingLight();
    const lit = pass ? [...lights, { ...pass, pos: [pass.pos[0] + ox, pass.pos[1] + oy] as [number, number] }] : lights;
    this.lighting.update(atmo, lit, this.effects?.ambientLift() ?? 0);

    // Per-light glow maps (a lamp's bulb, a terminal's screen) follow their light's live brightness.
    for (const layer of this.layers) {
      for (const g of layer.perLightEmissive) {
        const light = state.lights.find((l) => l.id === g.lightId);
        g.sprite.alpha = light ? lightGlowAlpha(light, ctx.t) : 0;
      }
    }

    const sky = this.layers.find((l) => l.id === 'sky') ?? this.layers.find((l) => l.id === 'back');
    if (sky) {
      const k = TIME_OF_DAY_STRENGTH * Math.max(0, Math.min(1, ctx.timeOfDayLevel));
      sky.diffuse.tint = parseInt(lerpOklab('#ffffff', TIME_OF_DAY_TINT[atmo.timeOfDay], k).slice(1), 16);
    }

    this.atmospherics.update(atmo, lights, ctx.dt);
    const particles = this.weather.step(
      ctx.dt,
      atmo.weather,
      atmo.weatherLevel,
      weatherLightsFor(
        this.frameRes,
        state.lights.slice(0, MAX_LIGHTS).map((l, i) => ({ ...l, pos: lights[i].pos, intensity: lights[i].intensity })),
      ),
    );
    // A room whose window is out of sight hears its weather but doesn't draw it.
    this.weatherLayer.draw(this.weatherHidden ? 'none' : atmo.weather, particles);
    this.weatherDrawn = !this.weatherHidden && atmo.weather !== 'none' && particles.length > 0;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    // Work in device pixels so the integer scale is integer on the physical screen.
    const w = devicePixels(this.host.clientWidth, dpr);
    const h = devicePixels(this.host.clientHeight, dpr);
    this.app.renderer.resize(w, h);
    const { scale, x, y } = stageView(this.frameRes, this.stageRect(), dpr);
    this.viewFit = { scale, x, y, dpr };
    this.view.scale.set(scale);
    this.view.position.set(x, y);
    const back = backdropView(this.frameRes, w, h, { scale, x, y }, this.backdropOn);
    this.backdrop.visible = back.show;
    this.backdrop.scale.set(back.scale);
    this.backdrop.position.set(back.x, back.y);
    // In screen px per 480 px, so scanlines and glitch offsets look the same in every room.
    this.grade.setScale(scale * frameUnit(this.frameRes));
  }

  /** Sizes everything that is drawn at the room's resolution, and picks hard or smooth upscaling. */
  private applyFrame(res: FrameSize): void {
    if (res[0] === this.frameRes[0] && res[1] === this.frameRes[1]) return;
    this.frameRes = res;
    const [w, h] = res;
    const flat = isFlat(res);
    const unit = frameUnit(res);
    this.renderTexture.resize(w, h);
    setSmooth(this.renderTexture.source, flat);
    this.app.canvas.style.imageRendering = flat ? 'auto' : 'pixelated';
    FRAME.width = w;
    FRAME.height = h;
    this.fade.clear().rect(0, 0, w, h).fill(0x000000);
    this.atmospherics.setFrame(w, h);
    this.bloom.blur = bloomBlur(unit);
    this.lighting.setSnap(!flat);
    this.weatherLayer.gfx.scale.set(unit);
    this.resize();
  }
}

/** `backdrop`: fill the bars with a blurred copy of the room (default: when there's a stage). */
export async function createRenderer(host: HTMLElement, stage?: StageSource, o: { backdrop?: boolean } = {}): Promise<Renderer> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({
    // The lighting shader is GLSL only.
    preference: 'webgl',
    background: '#000000',
    antialias: false,
    resolution: 1,
    autoDensity: false,
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
  });
  app.canvas.style.display = 'block';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.imageRendering = 'pixelated';
  host.appendChild(app.canvas);
  return new PixiRenderer(app, host, stage, o.backdrop ?? stage !== undefined);
}

/** The room layer's own pixels (art + glow), read back from the canvases its textures were made from. */
function roomArt(layers: Layer[]): EffectsArt {
  const room = layers[0];
  const canvasOf = (s: Sprite | Graphics | null | undefined): HTMLCanvasElement | null => {
    const res = s instanceof Sprite ? s.texture.source.resource : null;
    return typeof HTMLCanvasElement !== 'undefined' && res instanceof HTMLCanvasElement ? res : null;
  };
  return {
    roomTexture([x, y, w, h]) {
      const base = canvasOf(room?.diffuse);
      if (!base) return null;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(base, x, y + room.padY, w, h, 0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const glow of [room.emissive, ...room.perLightEmissive.map((g) => g.sprite)]) {
        const c = canvasOf(glow);
        if (c) ctx.drawImage(c, x, y + room.padY, w, h, 0, 0, w, h);
      }
      // Uncached: the effects layer owns it and destroys it with the room.
      return Texture.from(out, true);
    },
    glowAlpha() {
      const c = canvasOf(room?.emissive);
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return null;
      const data = ctx.getImageData(0, room.padY, c.width, c.height - room.padY * 2).data;
      const alpha = new Uint8Array(data.length / 4);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
      return { alpha, w: c.width };
    },
  };
}
