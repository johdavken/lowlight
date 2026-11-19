/**
 * The room's light on the stage figures through their normal maps (figure lighting spec 2026-11-16 §2).
 *
 * Each sprite figure gets a small WebGL2 canvas over its art: her base and face drawn together (the face
 * dissolve too, cell for cell with the CSS dither), shaded per pixel by the room's lamps. Three parts:
 * - the flat part: ambient plus a share of each lamp, through stage-light.ts's mapping, so she sits as
 *   bright as the tint left her;
 * - the rim: the room's lamps hang `depth` stage px behind her, so each lights only the edges turned
 *   toward it, in its colour;
 * - the key light: a soft lamp in front of her (figure-light-math.ts `keyLight`) that shapes rather than
 *   brightens, and tints without dimming;
 * - the room's finish: a share of its fog in front of her, and its CRT pass (vignette, scanlines) over
 *   her, so she sits in the same picture (drawn at screen resolution so her scanlines land on its rows).
 * Where it can't run (Firefox, no WebGL2, SYS → FIGURE LIGHT off, a map that won't load) she keeps the
 * tint (stage-light.ts), which carries on underneath regardless.
 */
import { parseHex } from '../../../shared/color';
import { FIGURE_LIGHTS_MAX, type FigureLightDef, type FigureLightPoint } from '../../../shared/types';
import type { Renderer, RoomFinish, ScreenLights } from '../renderer';
import { FOG_STOPS } from '../renderer/post';
import { DITHER_CELL_PX, ditherKeep } from './face-dither';
import { breathAt, mouthAt } from './figure-breath';
import { FIGURE_LIGHT, keyLight, resolveFigureLight, toStage, type Box, type ResolvedFigureLight } from './figure-light-math';
import type { StageRect } from './game-stage';
import type { FigureArt } from './stage';
import { FIGURE_CEILING, FIGURE_FLOOR, FIGURE_STRENGTH, FLAT_LIGHT, GLOW_SCALE, NEUTRAL_LIGHT } from './stage-light';

/** Lit where it can be: not in Firefox (its SVG-filter fallback is the tint), not without WebGL2, not switched off. */
export function figureLightMode(o: { firefox: boolean; webgl2: boolean; on: boolean }): 'lit' | 'tint' {
  return !o.firefox && o.webgl2 && o.on ? 'lit' : 'tint';
}

/** The images one draw of her is made from (see FigureArt). */
export interface ArtImages {
  base: HTMLImageElement;
  face: HTMLImageElement | null;
  from: HTMLImageElement | null;
  step: number;
  steps: number;
  pixel: boolean;
}

/** What a figure is shaded with, in stage px. */
export interface LitUniforms {
  /** Her art's box. */
  box: Box;
  mirror: boolean;
  lights: ScreenLights;
  light: ResolvedFigureLight;
  key: { pos: [number, number]; hue: [number, number, number]; strength: number };
  /**
   * Her breath (figure-breath.ts): how far her chest `swell`s (0..1, her breath level; it ends above her
   * `waist`), the out-breath's progress `puff` (−1: none, or no breath fog in this room), her `mouth`
   * (shares of the sprite), which way she faces on screen (`faceDir`: her art's way, turned by MIRROR) and the fog's `density`.
   */
  breath?: { puff: number; mouth: { x: number; y: number }; waist: number; faceDir: 1 | -1; density: number; swell: number };
  /** Her own lights (clicked lights), shares of her sprite, and how bright each is this moment (they pulse a little, each on its own). */
  glow?: { points: FigureLightPoint[]; pulse: number[] };
  /** The room's finish (fog, CRT pass) and where her art is on screen, window css px; absent: drawn unfinished, at her art's own grid. */
  finish?: { room: RoomFinish; screen: Box; viewportH: number };
}

/**
 * How big her canvas is, and how much of her (from the top) it draws. Unfinished: her art's own grid,
 * all of her. Finished with scanlines: screen resolution (so her scanlines land on the room's rows), never
 * below her art grid (RENDER SCALE would skip her pixels), and only the part of her on screen (the stage
 * stands her past its foot). Scanlines off: back to her art grid, which is all she needs.
 */
export function litCanvasSize(o: { art: { w: number; h: number }; finish?: { screen: Box; dpr: number; crt: boolean; viewportH: number } }): { w: number; h: number; visible: number } {
  const f = o.finish;
  if (!f || f.screen.height <= 0) return { w: o.art.w, h: o.art.h, visible: 1 };
  const visible = Math.min(1, Math.max(0.01, (f.viewportH - f.screen.top) / f.screen.height));
  if (!f.crt) return { w: o.art.w, h: Math.max(1, Math.round(o.art.h * visible)), visible };
  const scale = Math.max(f.dpr, o.art.h / f.screen.height);
  return { w: Math.max(1, Math.round(f.screen.width * scale)), h: Math.max(1, Math.round(f.screen.height * visible * scale)), visible };
}

/** The GL side of a lit figure: its canvas, her art and map, and a draw. */
export interface LitSurface {
  readonly canvas: HTMLCanvasElement;
  setArt(art: ArtImages, map: HTMLImageElement): void;
  draw(u: LitUniforms): void;
  dispose(): void;
}

export interface FigureLightDeps {
  loadImage?: (url: string) => Promise<HTMLImageElement | null>;
  /** A new GL surface, or null without WebGL2. */
  surface?: () => LitSurface | null;
  /** Whether this browser can light figures at all (default: not Firefox, and WebGL2). */
  lit?: boolean;
  /** Still figures (default: the page's prefers-reduced-motion). */
  reducedMotion?: boolean;
  /** Seconds, for the breath (default: the page clock). */
  now?: () => number;
}

/** Which way the cast's art faces: every sprite is drawn three-quarter to the right of its image. */
const ART_FACING = 1;

/** Each figure's place in the breath, so the two never breathe together. */
const BREATH_PHASE = { left: 0, right: 0.37, resident: 0.71 } as const;

/** The figure route's normal map: the same route with `normal=1`. */
export const normalUrl = (url: string): string => `${url}${url.includes('?') ? '&' : '?'}normal=1`;

/** A light's brightness at `t` seconds: 0.8..1, slow, each light (`i`) on its own beat. */
export function lightPulse(t: number, i: number): number {
  return 0.9 + 0.1 * Math.sin(t * 2.2 + i * 1.7);
}

/** Where her chest swell ends when her sprite has no waist (a share of her height from the top). */
const DEFAULT_WAIST = 0.45;

/** At most this often (ms). */
const INTERVAL_MS = 33;

interface FigState {
  token: number;
  art: FigureArt | null;
  surface: LitSurface | null;
  /** Her art and map are on the surface (for `art`). */
  ready: boolean;
  /** The art that's on the surface, kept while she's switched off. */
  shown: FigureArt | null;
}

export class FigureLight {
  private readonly figs = new Map<HTMLElement, FigState>();
  private readonly images = new Map<string, Promise<HTMLImageElement | null>>();
  private readonly loadImage: (url: string) => Promise<HTMLImageElement | null>;
  private readonly makeSurface: () => LitSurface | null;
  private readonly capable: boolean;
  private on = true;
  private readonly reducedMotion: boolean;
  private readonly now: () => number;
  /** Rain or snow: breath fog thickens. */
  private wet = false;
  private light = resolveFigureLight(undefined);
  private last = -Infinity;
  private readonly off: () => void;

  constructor(
    private readonly renderer: Pick<Renderer, 'screenLights' | 'onFrame'> & Partial<Pick<Renderer, 'finish'>>,
    private readonly rect: () => StageRect,
    deps: FigureLightDeps = {},
  ) {
    this.loadImage = deps.loadImage ?? loadImage;
    this.makeSurface = deps.surface ?? glSurface;
    this.capable = deps.lit ?? figureLightMode({ firefox: FLAT_LIGHT, webgl2: hasWebGL2(), on: true }) === 'lit';
    this.reducedMotion = deps.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.now = deps.now ?? (() => performance.now() / 1000);
    this.off = renderer.onFrame(() => {
      const t = performance.now();
      if (t - this.last < INTERVAL_MS) return;
      this.last = t;
      this.drawAll();
    });
  }

  dispose(): void {
    this.off();
    for (const [fig, st] of this.figs) {
      this.unlight(fig, st);
      st.surface?.dispose();
    }
    this.figs.clear();
  }

  /** The room's `figureLight` (absent: the defaults). */
  setRoom(def: FigureLightDef | undefined): void {
    this.light = resolveFigureLight(def);
    this.drawAll();
  }

  /** The room's weather: rain or snow thickens the breath fog. */
  setWeather(weather: string): void {
    this.wet = weather === 'rain' || weather === 'snow';
  }

  /** SYS → FIGURE LIGHT. Off, every figure takes the tint; on, they're lit again. */
  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    for (const [fig, st] of this.figs) {
      if (!on) this.unlight(fig, st);
      else if (st.art && st.art === st.shown && st.surface) this.attach(fig, st);
      else if (st.art) this.art(fig, st.art);
    }
  }

  /** What `fig` shows changed (Stage's onArt); null: not a sprite. */
  art(fig: HTMLElement, art: FigureArt | null): void {
    let st = this.figs.get(fig);
    if (!st) {
      st = { token: 0, art: null, surface: null, ready: false, shown: null };
      this.figs.set(fig, st);
    }
    const token = ++st.token;
    st.art = art;
    if (!art || !this.capable || !this.on) return this.unlight(fig, st);
    // A new outfit or person shows tinted until its own map is in: the old canvas would draw the old art over her.
    if (st.shown && (art.base !== st.shown.base || art.pixel !== st.shown.pixel)) this.unlight(fig, st);
    const want = (url: string | null) => (url ? this.image(url) : Promise.resolve(null));
    void Promise.all([want(art.base), want(art.face), want(art.from), want(normalUrl(art.base))]).then(([base, face, from, map]) => {
      if (token !== st.token || !this.on) return;
      if (!base || !map) return this.unlight(fig, st);
      st.surface ??= this.makeSurface();
      if (!st.surface) return this.unlight(fig, st);
      st.surface.setArt({ base, face, from, step: art.step, steps: art.steps, pixel: art.pixel }, map);
      st.shown = art;
      this.attach(fig, st);
    });
  }

  /** Puts her lit canvas over her art and draws it. */
  private attach(fig: HTMLElement, st: FigState): void {
    if (!st.surface) return;
    st.ready = true;
    st.surface.canvas.classList.add('stage-lit');
    const host = fig.querySelector('.stage-art');
    if (host && st.surface.canvas.parentElement !== host) host.append(st.surface.canvas);
    fig.setAttribute('data-lit', '');
    this.drawOne(fig, st);
  }

  private image(url: string): Promise<HTMLImageElement | null> {
    let p = this.images.get(url);
    if (!p) {
      p = this.loadImage(url);
      this.images.set(url, p);
    }
    return p;
  }

  private unlight(fig: HTMLElement, st: FigState): void {
    st.ready = false;
    fig.removeAttribute('data-lit');
    st.surface?.canvas.remove();
  }

  private stageLights(): ScreenLights | null {
    const sl = this.renderer.screenLights();
    return sl ? toStage(sl, this.rect()) : null;
  }

  private drawAll(): void {
    const sl = this.stageLights();
    if (!sl) return;
    for (const [fig, st] of this.figs) this.drawOne(fig, st, sl);
  }

  private drawOne(fig: HTMLElement, st: FigState, lights = this.stageLights()): void {
    if (!lights || !st.ready || !st.surface) return;
    const host = fig.querySelector<HTMLElement>('.stage-art');
    if (!host) return;
    const r = host.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const rect = this.rect();
    const box = { left: (r.left - rect.left) / rect.scale, top: (r.top - rect.top) / rect.scale, width: r.width / rect.scale, height: r.height / rect.scale };
    const room = this.renderer.finish?.() ?? null;
    const mirror = fig.hasAttribute('data-mirror');
    const side = fig.classList.contains('stage-left') ? 'left' : fig.classList.contains('stage-resident') ? 'resident' : 'right';
    const b = this.reducedMotion ? { puff: -1, level: 0 } : breathAt(this.now(), BREATH_PHASE[side], fig.classList.contains('speaking'));
    // She breathes the way her art faces: the cast is all drawn three-quarter to the right (ART_FACING), and
    // MIRROR turns her, and her breath, round.
    const faceDir = (ART_FACING * (mirror ? -1 : 1)) as 1 | -1;
    st.surface.draw({
      box,
      mirror,
      breath: {
        // On the line (her comms figure) she isn't in this room: no breath fog for her here.
        puff: this.light.breath && !fig.hasAttribute('data-comms') ? b.puff : -1,
        mouth: mouthAt(st.shown?.facePoint ?? null),
        waist: st.shown?.waist ?? DEFAULT_WAIST,
        faceDir,
        density: this.wet ? 1.4 : 1,
        swell: b.level,
      },
      ...(st.shown?.lights?.length ? { glow: { points: st.shown.lights, pulse: st.shown.lights.map((_, i) => (this.reducedMotion ? 1 : lightPulse(this.now(), i))) } } : {}),
      lights,
      light: this.light,
      key: keyLight(lights, box, this.light.key),
      ...(room ? { finish: { room, screen: { left: r.left, top: r.top, width: r.width, height: r.height }, viewportH: window.innerHeight } } : {}),
    });
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function hasWebGL2(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Her own lights the shader holds (shared/types FIGURE_LIGHTS_MAX). */
const GLOW_MAX = FIGURE_LIGHTS_MAX;

/** Lamps the shader holds: the room's 8 and a passing light. */
const MAX = 9;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = vec2(aPos.x, 1.0 - aPos.y); gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

/** The fog's ramp (post.ts FOG_STOPS) as a GLSL expression of `t`, a stop at a time. */
function fogRamp(): string {
  const f = (n: number) => n.toFixed(4);
  let expr = f(FOG_STOPS[FOG_STOPS.length - 1][1]);
  for (let i = FOG_STOPS.length - 2; i >= 0; i--) {
    const [t0, a0] = FOG_STOPS[i];
    const [t1, a1] = FOG_STOPS[i + 1];
    expr = `t < ${f(t1)} ? mix(${f(a0)}, ${f(a1)}, (t - ${f(t0)}) / ${f(t1 - t0)}) : ${expr}`;
  }
  return expr;
}

/** The figure's fragment shader (exported for tests). */
export const FIGURE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uArt;
uniform sampler2D uNormal;
uniform vec4 uBox;       // her art's left, top, width, height (stage px)
uniform float uMirror;
uniform vec3 uAmbient;
uniform int uCount;
uniform vec4 uGeom[${MAX}];  // x, y, radius (stage px)
uniform vec3 uColor[${MAX}];
uniform vec4 uK;         // key z, depth, -, rim
uniform vec4 uMap;       // strength, neutral, floor, ceiling (stage-light.ts)
uniform float uGlow;     // the tint's glow scale
uniform vec3 uShape;     // flat share, rim power, shade ceiling
uniform vec4 uKey;       // key x, y, -, strength
uniform vec3 uKeyHue;
uniform float uFinish;   // the room's finish on her
uniform vec4 uScreen;    // her canvas on screen, window css px
uniform vec4 uFrame;     // the room's frame on screen, window css px
uniform float uDpr;
uniform vec4 uFog;       // fog rgb, alpha × how much of it stands in front of her
uniform vec4 uCrt;       // on, line width, line contrast, -
uniform vec3 uVig;       // vignetting, alpha, blur
uniform float uVis;      // how much of her (from the top) the canvas draws
uniform vec2 uArtPx;     // her art's size in art pixels
uniform float uSwell;    // her breath level 0..1: her chest swells with it
uniform float uWaist;    // her waist (share from her top), the chest's lower edge
uniform float uPuff;     // the out-breath 0..1 (−1: no breath fog)
uniform vec2 uMouth;     // her mouth, shares of the sprite
uniform float uDrift;    // which way the puff drifts across her canvas (+1 right)
uniform float uDensity;  // breath fog thickness (rain and snow thicken it)
uniform int uGlowN;          // her own lights (clicked lights), up to ${GLOW_MAX}
uniform vec2 uGlowC[${GLOW_MAX}];   // centres, art px
uniform float uGlowR[${GLOW_MAX}];  // radii, art px
uniform vec3 uGlowCol[${GLOW_MAX}];
uniform float uGlowPulse[${GLOW_MAX}];

float hash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// A puff of breath fog at art pixel q: a soft cloud leaving her mouth over the out-breath, growing, drifting
// forward and up, fading, with a ragged edge.
float puffAt(vec2 q) {
  if (uPuff < 0.0) return 0.0;
  float t = uPuff;
  vec2 mouth = uMouth * uArtPx;
  vec2 c = mouth + vec2(uDrift * (7.0 + 30.0 * t), 1.0 - 14.0 * t);
  float r = mix(6.0, 18.0, t);
  vec2 cell = q;
  // Far from the cloud there's nothing to draw: skip the noise (it only moves its edge by ±0.3).
  if (length((cell - c) / vec2(r * 1.25, r)) > 1.4) return 0.0;
  float n = vnoise(cell * 0.22 + vec2(t * 3.0, -t * 2.0)) * 0.65 + vnoise(cell * 0.5 - t * 4.0) * 0.35;
  float d = length((cell - c) / vec2(r * 1.25, r)) + (n - 0.5) * 0.6;
  // Soft vapour, see-through, with a ragged edge (no dither: it read as a checkerboard).
  return (1.0 - smoothstep(0.45, 1.0, d)) * smoothstep(0.0, 0.1, t) * pow(1.0 - t, 1.1) * 0.55 * uDensity;
}

void main() {
  // Her art's uv: the canvas may draw only the part of her on screen.
  vec2 auv = vec2(vUv.x, vUv.y * uVis);
  vec2 suv = auv;
  vec4 art = texture(uArt, suv);
  float pa = puffAt(auv * uArtPx);
  // Her own lights: the core lifts the art inside each
  // circle toward its own brightest (only what was clicked glows); a round halo spills round it.
  vec2 lp = suv * uArtPx;
  float core = 0.0;
  vec3 coreCol = vec3(0.0);
  vec3 halo = vec3(0.0);
  for (int i = 0; i < ${GLOW_MAX}; i++) {
    if (i >= uGlowN) break;
    float d = length(lp - uGlowC[i]);
    float r = uGlowR[i];
    float c = (1.0 - smoothstep(0.5 * r, r, d)) * uGlowPulse[i];
    if (c > core) {
      core = c;
      coreCol = uGlowCol[i];
    }
    float h = d / (2.6 * r);
    halo += uGlowCol[i] * 0.3 * exp(-h * h) * uGlowPulse[i];
  }
  float haloA = clamp(max(halo.r, max(halo.g, halo.b)), 0.0, 1.0);
  if (art.a < 0.004 && pa <= 0.0 && haloA < 0.01) { o = vec4(0.0); return; }
  bool body = art.a >= 0.004;
  vec3 n = body ? texture(uNormal, suv).xyz * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  // Chest swell: on the in-breath her chest's surface tilts up and a little outward, so the room's light
  // catches it more (a soft oval between her chin and her waist, nothing moves).
  float swell = 0.0;
  if (body && uSwell > 0.0) {
    float top = uMouth.y + 0.06;
    vec2 cc = vec2(uMouth.x, mix(top, uWaist, 0.4));
    vec2 rr = vec2(0.17, max(0.02, (uWaist - top) * 0.45));
    vec2 dd = (suv - cc) / rr;
    float m = (1.0 - smoothstep(0.55, 1.0, length(dd))) * uSwell;
    swell = m;
    n.y += 0.35 * m;
    n.x += 0.12 * m * sign(dd.x) * min(1.0, abs(dd.x) * 2.0);
  }
  float sx = uMirror > 0.5 ? 1.0 - auv.x : auv.x;
  if (uMirror > 0.5) n.x = -n.x;
  n = normalize(n);
  vec2 p = uBox.xy + vec2(sx, auv.y) * uBox.zw;
  // The flat part keeps the tint's falloff on screen; only the rim feels the lamps' depth behind her.
  vec3 even = uAmbient;
  vec3 rim = vec3(0.0);
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec4 g = uGeom[i];
    vec2 d = g.xy - p;
    vec3 toL = vec3(d.x, -d.y, -uK.y); // the map's y runs up; the lamp is behind her
    float f2 = 1.0 - smoothstep(0.0, g.z, length(d));
    f2 *= f2;
    float f3 = 1.0 - smoothstep(0.0, g.z, length(toL));
    f3 *= f3;
    even += uColor[i] * f2 * uShape.x;
    rim += uColor[i] * f3 * pow(max(dot(n, normalize(toL)), 0.0), uShape.y);
  }
  vec3 v = clamp(uMap.x * (even / uMap.y) + (1.0 - uMap.x), uMap.z, uMap.w);
  vec3 shade = v;
  // The key light shapes rather than brightens: the side facing it lifts, the far side falls; its
  // colour tints without dimming (the hue scaled to white's brightness).
  if (uKey.w > 0.0) {
    float kf = max(dot(n, normalize(vec3(uKey.x - p.x, p.y - uKey.y, uK.x))), 0.0);
    vec3 hue = uKeyHue / max(dot(uKeyHue, vec3(0.2126, 0.7152, 0.0722)), 0.2);
    vec3 shape = (0.7 + 0.6 * kf) * mix(vec3(1.0), hue, 0.35 * kf);
    shade *= mix(vec3(1.0), shape, uKey.w);
  }
  // The tilt alone barely shows under lamps behind her, so the swollen chest also takes a little more light.
  shade *= 1.0 + 0.07 * swell;
  shade = min(shade, vec3(uShape.z));
  vec3 glow = max(v - 1.0, 0.0) * uGlow + rim * uK.w;
  vec3 rgb = body ? art.rgb / art.a * shade : vec3(0.0);
  rgb = 1.0 - (1.0 - rgb) * (1.0 - clamp(glow, 0.0, 1.0));
  float outA = art.a;
  if (pa > 0.0) {
    // The puff is lit by the room as her flat light is, pale, a little of the room's fog in it.
    vec3 puff = min(v, vec3(1.0)) * 0.85;
    if (uFinish > 0.5) puff = mix(puff, uFog.rgb, 0.3);
    // At her lips it's faint (the breath isn't painted on her face); once it's out in the air in front of
    // her it shows over her hair and shoulder as it would.
    if (body) rgb = mix(rgb, puff, pa * mix(0.2, 0.8, smoothstep(0.15, 0.5, uPuff)));
    else {
      rgb = puff;
      outA = pa;
    }
  }
  // Her lights shine whatever the room's light (they're emissive), then take the room's finish below.
  if (core > 0.0 && body) rgb = mix(rgb, max(rgb, art.rgb / art.a * 1.4 + coreCol * 0.15), core);
  if (haloA >= 0.01) {
    if (body) rgb += halo;
    else {
      // Past her edge the halo is light on the room: added over what's already there (a puff, or nothing).
      vec3 prem = rgb * outA + halo;
      outA = max(outA, haloA);
      rgb = prem / max(outA, 0.001);
    }
  }
  if (uFinish > 0.5) {
    // Where this pixel is on screen, and in the room's frame (0..1).
    vec2 win = uScreen.xy + vec2(sx, auv.y) * uScreen.zw;
    vec2 fr = (win - uFrame.xy) / uFrame.zw;
    // The room's fog ramp (post.ts FOG_STOPS), a share of it (FIGURE_LIGHT.fogFront) standing between her and us.
    float t = clamp(fr.y, 0.0, 1.0);
    float ramp = ${fogRamp()};
    rgb = mix(rgb, uFog.rgb, clamp(ramp * uFog.a, 0.0, 1.0));
    if (uCrt.x > 0.5) {
      // The CRT pass (pixi-filters CRTFilter, curvature 0): its vignette over the frame, its scanlines in device px.
      float outer = 1.414213 - uVig.x * 1.414213;
      vec2 dir = vec2(0.5) - fr;
      dir.y *= uFrame.w / uFrame.z;
      float darker = clamp((outer - length(dir) * 1.414213) / (0.00001 + uVig.z * 1.414213), 0.0, 1.0);
      rgb *= darker + (1.0 - darker) * (1.0 - uVig.y);
      float ydev = floor((win.y - uFrame.y) * uDpr) + 0.5;
      float v = (ydev - uFrame.w * uDpr * 0.5) * min(1.0, 2.0 / uCrt.y);
      rgb *= 1.0 + cos(v * 1.2) * 0.5 * uCrt.z;
      rgb *= 0.99 + ceil(mod(ydev, 4.0)) * 0.015;
    }
  }
  o = vec4(rgb * outA, outA);
}`;

const UNIFORMS = ['uArt', 'uNormal', 'uBox', 'uMirror', 'uAmbient', 'uCount', 'uGeom', 'uColor', 'uK', 'uMap', 'uGlow', 'uShape', 'uKey', 'uKeyHue', 'uFinish', 'uScreen', 'uFrame', 'uDpr', 'uFog', 'uCrt', 'uVig', 'uVis', 'uArtPx', 'uSwell', 'uWaist', 'uPuff', 'uMouth', 'uDrift', 'uDensity', 'uGlowN', 'uGlowC', 'uGlowR', 'uGlowCol', 'uGlowPulse'] as const;

/** A WebGL2 surface for one figure, or null without WebGL2. */
export function glSurface(): LitSurface | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-lit';
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('[figure-light]', gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FIGURE_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[figure-light]', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(UNIFORMS.map((k) => [k, gl.getUniformLocation(prog, k)])) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  const texture = (unit: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
      [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  const artTex = texture(0);
  const mapTex = texture(1);
  gl.uniform1i(u.uArt, 0);
  gl.uniform1i(u.uNormal, 1);
  const comp = document.createElement('canvas');
  let artW = 1;
  let artH = 1;
  let mapSrc: HTMLImageElement | null = null;
  const geom = new Float32Array(MAX * 4);
  const col = new Float32Array(MAX * 3);

  return {
    canvas,
    setArt(art, map) {
      // Her art at its own pixel grid (CSS scales it up, with hard pixels for snapped art).
      const px = art.pixel ? 2 : 1;
      const w = Math.round(art.base.naturalWidth / px);
      const h = Math.round(art.base.naturalHeight / px);
      comp.width = w;
      comp.height = h;
      const ctx = comp.getContext('2d')!;
      ctx.imageSmoothingEnabled = !art.pixel;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(art.base, 0, 0, w, h);
      if (art.step >= art.steps || !art.from) {
        if (art.step >= art.steps) {
          if (art.face) ctx.drawImage(art.face, 0, 0, w, h);
        } else {
          drawDithered(ctx, art.face, art.step, art.steps, true, w, h, px);
        }
      } else {
        drawDithered(ctx, art.from, art.step, art.steps, false, w, h, px);
        drawDithered(ctx, art.face, art.step, art.steps, true, w, h, px);
      }
      // The canvas is sized as she's drawn (litCanvasSize); her art's grid is what it falls back to.
      artW = w;
      artH = h;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, artTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, comp);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (map !== mapSrc) {
        mapSrc = map;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mapTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, map);
      }
    },
    draw(x) {
      gl.useProgram(prog);
      // Finished, she's drawn at screen resolution so the scanlines land on screen rows (the art stays nearest-sampled).
      const f = x.finish;
      const { w, h, visible } = litCanvasSize({ art: { w: artW, h: artH }, ...(f ? { finish: { screen: f.screen, dpr: f.room.dpr, crt: f.room.crt.on, viewportH: f.viewportH } } : {}) });
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const cssH = `${visible * 100}%`;
      if (canvas.style.height !== cssH) canvas.style.height = cssH;
      gl.viewport(0, 0, w, h);
      gl.uniform1f(u.uVis, visible);
      // Her art in art pixels (a snapped sprite's grid is half its image).
      gl.uniform2f(u.uArtPx, artW, artH);
      const br = x.breath;
      gl.uniform1f(u.uSwell, br ? br.swell : 0);
      gl.uniform1f(u.uWaist, br ? br.waist : 0.45);
      gl.uniform1f(u.uPuff, br ? br.puff : -1);
      gl.uniform2f(u.uMouth, br ? br.mouth.x : 0.5, br ? br.mouth.y : 0.115);
      // Her canvas is flipped by CSS under MIRROR: on it, the puff drifts the other way to read right on screen.
      gl.uniform1f(u.uDrift, br ? br.faceDir * (x.mirror ? -1 : 1) : 1);
      gl.uniform1f(u.uDensity, br ? br.density : 1);
      // Her own lights: centres and radii in art px (a radius is a share of her width), colours, pulses.
      const g = x.glow;
      const gn = g ? Math.min(GLOW_MAX, g.points.length) : 0;
      gl.uniform1i(u.uGlowN, gn);
      if (g && gn > 0) {
        const c = new Float32Array(GLOW_MAX * 2);
        const r = new Float32Array(GLOW_MAX);
        const col = new Float32Array(GLOW_MAX * 3);
        const pulse = new Float32Array(GLOW_MAX);
        for (let i = 0; i < gn; i++) {
          const p = g.points[i];
          c.set([p.x * artW, p.y * artH], i * 2);
          r[i] = Math.max(0.5, p.r * artW);
          col.set(parseHex(p.color) ?? [1, 1, 1], i * 3);
          pulse[i] = g.pulse[i] ?? 1;
        }
        gl.uniform2fv(u.uGlowC, c);
        gl.uniform1fv(u.uGlowR, r);
        gl.uniform3fv(u.uGlowCol, col);
        gl.uniform1fv(u.uGlowPulse, pulse);
      }
      gl.uniform1f(u.uFinish, f ? 1 : 0);
      if (f) {
        gl.uniform4f(u.uScreen, f.screen.left, f.screen.top, f.screen.width, f.screen.height);
        gl.uniform4f(u.uFrame, f.room.frame.left, f.room.frame.top, f.room.frame.width, f.room.frame.height);
        gl.uniform1f(u.uDpr, f.room.dpr);
        gl.uniform4f(u.uFog, f.room.fog.rgb[0], f.room.fog.rgb[1], f.room.fog.rgb[2], f.room.fog.alpha * FIGURE_LIGHT.fogFront);
        gl.uniform4f(u.uCrt, f.room.crt.on ? 1 : 0, f.room.crt.lineWidth, f.room.crt.lineContrast, 0);
        gl.uniform3f(u.uVig, f.room.crt.vignetting, f.room.crt.vignettingAlpha, f.room.crt.vignettingBlur);
      }
      gl.uniform4f(u.uBox, x.box.left, x.box.top, x.box.width, x.box.height);
      gl.uniform1f(u.uMirror, x.mirror ? 1 : 0);
      gl.uniform3fv(u.uAmbient, x.lights.ambient);
      const n = Math.min(MAX, x.lights.lights.length);
      geom.fill(0);
      col.fill(0);
      for (let i = 0; i < n; i++) {
        const l = x.lights.lights[i];
        geom.set([l.pos[0], l.pos[1], l.radius, 0], i * 4);
        col.set(l.rgb, i * 3);
      }
      gl.uniform1i(u.uCount, n);
      gl.uniform4fv(u.uGeom, geom);
      gl.uniform3fv(u.uColor, col);
      gl.uniform4f(u.uK, FIGURE_LIGHT.keyZ, x.light.depth, 0, x.light.rim);
      gl.uniform4f(u.uMap, FIGURE_STRENGTH, NEUTRAL_LIGHT, FIGURE_FLOOR, FIGURE_CEILING);
      gl.uniform1f(u.uGlow, GLOW_SCALE);
      gl.uniform3f(u.uShape, FIGURE_LIGHT.flat, FIGURE_LIGHT.rimPower, FIGURE_LIGHT.ceiling);
      gl.uniform4f(u.uKey, x.key.pos[0], x.key.pos[1], 0, x.key.strength);
      gl.uniform3fv(u.uKeyHue, x.key.hue);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/** Draws `face` through the dither at `step` (`incoming`: the cells opening; else the cells closing), as the CSS mask does. */
function drawDithered(ctx: CanvasRenderingContext2D, face: HTMLImageElement | null, step: number, steps: number, incoming: boolean, w: number, h: number, px: number): void {
  if (!face) return;
  // A dither cell is DITHER_CELL_PX of her own pixels, so this many canvas px.
  const cell = DITHER_CELL_PX / px;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 4 * cell;
  const t = tile.getContext('2d')!;
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) if (ditherKeep(step, cx, cy, incoming, steps)) t.fillRect(cx * cell, cy * cell, cell, cell);
  const layer = document.createElement('canvas');
  layer.width = w;
  layer.height = h;
  const l = layer.getContext('2d')!;
  l.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
  l.drawImage(face, 0, 0, w, h);
  l.globalCompositeOperation = 'destination-in';
  l.fillStyle = l.createPattern(tile, 'repeat')!;
  l.fillRect(0, 0, w, h);
  ctx.drawImage(layer, 0, 0);
}
