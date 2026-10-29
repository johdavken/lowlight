/**
 * A room's ambient effects (screens, LEDs, dust, lightning, rain on the glass, steam and smoke, passing
 * light), built per scene, updated every frame
 * from the room state, drawn in room px above the art and its glow. One effect that fails to build
 * is disabled with a reason; the rest run.
 */
import { BufferImageSource, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { lerpOklab } from '../../../../shared/color';
import type { EffectDef, LightDef, RoomState, SceneDef } from '../../../../shared/types';
import { areaBounds, type Shape } from '../../../../shared/weather-area';
import { drawArea } from '../weather-mask';
import { dustAmount, dustCount, dustFade, dustSpread, Motes } from './dust';
import { Glass, glassAmount, GLASS_PX } from './glass';
import { Passing, type PassLight } from './passing';
import { Plume, plumeAmount, plumeLean, PUFF_PX, puffPixels, PUFF_SIZES } from './plume';
import { dotAlpha, dotPhase, findDots, type Dot, type DotPhase } from './leds';
import { flashAt, seededRng, strikeShape, StrikeScheduler, type StrikeShape } from './lightning';
import { crt, ScreenPower, snow, snowPixels, STATIC_FRAMES } from './screen';

type Rect4 = [number, number, number, number];

/** Where the effects read the room's own pixels from. */
export interface EffectsArt {
  /** A new texture of the room's art and glow inside `rect` (the layer owns and destroys it); null without a canvas. */
  roomTexture(rect: Rect4): Texture | null;
  /** The always-on glow map's alpha channel and its width (null when the room has none). */
  glowAlpha(): { alpha: Uint8Array; w: number } | null;
}

/** A lightning strike, and the room it struck in (the sound drops strikes from a room being left). */
export interface Strike {
  distance: number;
  sceneId: string;
}

export interface EffectsState {
  /** Each screen: powered, and its picture's opacity this frame (0..~1). */
  screens: { on: boolean; picture: number }[];
  /** LED dots found. */
  leds: number;
  /** Dust motes drawn this frame. */
  dust: number;
  /** Drops on the glass drawn this frame (beads, runners and trail). */
  glass: number;
  /** Steam and smoke puffs drawn this frame. */
  puffs: number;
  /** Passing lights started since the room opened. */
  passes: number;
  strikes: number;
  /** The brightest flash this frame (0..1). */
  flash: number;
  /** What lightning flashes: the weather area's shapes, the whole frame, or nothing (no lightning). */
  flashArea: 'shapes' | 'frame' | null;
  disabled: string[];
}

interface Frame {
  dt: number;
  t: number;
  state: RoomState | null;
}

interface Fx {
  update(f: Frame, lights: Map<string, LightDef>): void;
  destroy(): void;
}

const FLASH_COLOR = 0xc8d8ff;
const SCANLINE_EVERY = 3;
const SCANLINE_ALPHA = 0.18;
/** Static's grain, in room px (the art's own pixel size). */
const SNOW_PX = 2;
const SNOW_GRAIN = 0.7;
/** The rolling band: its share of the screen's height and how much brighter it is. */
const BAND_HEIGHT = 0.15;
const BAND_ALPHA = 0.5;
/** An off LED loses this share of its glow (drawn in the glow pass, so its bloom halo goes too). */
const LED_DIM = 1;
/** A drop on the glass at its dimmest (no light through the window) and at full light. */
const GLASS_DIM = 0.4;
/** The dark under a drop (and along a trail), as a share of the drop's alpha. */
const GLASS_SHADE = 0.6;
/** A trail's dark, as a share of its alpha: a wet streak, darker than the glass around it. */
const TRAIL_SHADE = 1.6;
/** Steam and smoke before any light colours them, and the most a lamp tints them. */
const PLUME_COLOR = { steam: '#e8eef2', smoke: '#b8b4bc' } as const;
const PLUME_TINT = 0.35;

export class EffectsLayer {
  readonly view = new Container();
  /** Drawn inside the glow pass, under the bloom (LED dimming), so a glow and its halo go off together. */
  readonly glowView = new Container();
  /** Rain on the glass: drawn above the weather particles (the rain outside is behind the window). */
  readonly glassView = new Container();
  private readonly fx: Fx[] = [];
  private readonly screens: { on: boolean; picture: number }[] = [];
  private readonly disabled: string[] = [];
  private readonly strikeFns: Array<(s: Strike) => void> = [];
  private readonly scheduler = new StrikeScheduler();
  private readonly rng: () => number;
  private readonly lightning: { def: Extract<EffectDef, { kind: 'lightning' }>; gfx: Graphics }[] = [];
  /** Where a flash lands: the weather area, or (none) the whole frame. */
  private readonly flashShapes: Shape[] | undefined;
  private readonly frame: [number, number];
  private strike: { at: number; shapes: StrikeShape[] } | null = null;
  private ledCount = 0;
  private motesDrawn = 0;
  private glassDrawn = 0;
  private puffsDrawn = 0;
  /** Every passing path in the room shares one: a single light at a time. */
  private readonly passing: Passing | null;
  private passLight: PassLight | null = null;
  private passes = 0;
  /** One soft disc per puff size, made with the first plume and shared by every plume. */
  private puffTextures: Map<number, Texture> | null = null;
  private strikes = 0;
  private flash = 0;
  private lift = 0;
  private dead = false;
  private readonly sceneLights: Map<string, LightDef>;
  private readonly sceneId: string;

  constructor(
    scene: SceneDef,
    art: EffectsArt,
    private readonly opts: { reducedMotion: boolean; seed: number },
  ) {
    this.rng = seededRng(opts.seed);
    this.sceneId = scene.id;
    this.sceneLights = new Map(scene.lights.map((l) => [l.id, l]));
    this.flashShapes = scene.weatherArea?.length ? scene.weatherArea : undefined;
    this.frame = scene.resolution;
    (scene.effects ?? []).forEach((def, i) => {
      try {
        if (def.kind === 'screen') this.fx.push(this.screen(def, art));
        else if (def.kind === 'leds') this.fx.push(this.leds(def, art));
        else if (def.kind === 'plume') this.fx.push(this.plume(def));
        else if (def.kind === 'passing') return; // gathered below, into one
        else if (def.kind === 'glass') {
          // A window out of sight shows no glass either.
          if (!scene.weatherHidden) this.fx.push(this.glass(def, scene));
        } else this.addLightning(def);
      } catch (err) {
        this.disabled.push(`effect ${i} (${def.kind}) disabled: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    scene.lights.forEach((l, i) => {
      if (l.dust) this.fx.push(this.dust(l, opts.seed * 31 + i));
    });
    const paths = (scene.effects ?? []).filter((e): e is Extract<EffectDef, { kind: 'passing' }> => e.kind === 'passing');
    this.passing = paths.length ? new Passing(Math.floor(this.rng() * 2 ** 31), paths) : null;
  }

  onStrike(fn: (s: Strike) => void): void {
    this.strikeFns.push(fn);
  }

  update(f: Frame): void {
    if (this.dead) return;
    this.motesDrawn = 0;
    this.glassDrawn = 0;
    this.puffsDrawn = 0;
    const lights = new Map((f.state?.lights ?? []).map((l) => [l.id, l]));
    for (const fx of this.fx) fx.update(f, lights);
    this.updateLightning(f);
    const was = this.passLight;
    this.passLight = this.passing?.step(f.dt, this.opts.reducedMotion) ?? null;
    if (this.passLight && !was) this.passes++;
  }

  /** The passing light this frame, in room px, lit after the room's own lights (null between passes). */
  passingLight(): PassLight | null {
    return this.passLight;
  }

  /** Added to the room's ambient light this frame (a lightning flash). */
  ambientLift(): number {
    return this.lift;
  }

  state(): EffectsState {
    return { screens: this.screens.map((s) => ({ ...s })), leds: this.ledCount, dust: this.motesDrawn, glass: this.glassDrawn, puffs: this.puffsDrawn, passes: this.passes, strikes: this.strikes, flash: this.flash, flashArea: this.lightning.length === 0 ? null : this.flashShapes ? 'shapes' : 'frame', disabled: [...this.disabled] };
  }

  destroy(): void {
    this.dead = true;
    this.strikeFns.length = 0;
    for (const fx of this.fx) fx.destroy();
    this.view.destroy({ children: true });
    this.glowView.destroy({ children: true });
    this.glassView.destroy({ children: true });
    this.puffTextures?.forEach((t) => t.destroy(true));
    this.puffTextures = null;
  }

  // ---- screen ------------------------------------------------------------------------------

  private screen(def: Extract<EffectDef, { kind: 'screen' }>, art: EffectsArt): Fx {
    const [x, y, w, h] = def.rect;
    // The picture dims with its light, relative to the light's default brightness.
    const ref = Math.max(0.05, this.sceneLights.get(def.light)?.intensity ?? 1);
    const reduced = this.opts.reducedMotion;
    const power = new ScreenPower(reduced);
    const seed = this.rng();
    const status = { on: true, picture: 0 };
    /** The picture's level while it was last fully on: a power-off squeezes from there, never brighter. */
    let level = 1;
    const texture = art.roomTexture(def.rect);
    const root = new Container();
    const cover = new Graphics().rect(x, y, w, h).fill(0x000000);
    cover.alpha = 0;
    const content = texture ? new TilingSprite({ texture, width: w, height: h }) : null;
    const scan = new Graphics();
    for (let sy = y; sy < y + h; sy += SCANLINE_EVERY) scan.rect(x, sy, w, 1);
    scan.fill({ color: 0x000000, alpha: SCANLINE_ALPHA });
    const bar = new Graphics();
    bar.label = 'roll';
    bar.blendMode = 'add';
    // Power-off: the picture squeezes to a bright line, then a dot.
    const squeeze = new Graphics();
    squeeze.blendMode = 'add';
    const tv = def.picture === 'static' ? this.snow(def) : null;
    root.addChild(cover, ...(content ? [content] : []), ...(tv?.sprites ?? []), scan, bar, squeeze);
    this.view.addChild(root);
    this.screens.push(status);
    let scrolled = 0;
    return {
      update: (f, lights) => {
        const light = lights.get(def.light);
        const p = power.update(f.dt, light?.intensity ?? 0);
        status.on = p.on;
        const c = crt(f.t, seed, reduced);
        const full = p.scaleX >= 1 && p.scaleY >= 1;
        const live = Math.min(1, (light?.intensity ?? 0) / ref);
        if (full && p.on && live > 0) level = live;
        const picture = p.brightness <= 0 ? 0 : full ? p.brightness * Math.min(1.04, c.brightness) * live : p.brightness * level;
        status.picture = picture;
        // The glass darkens as the power goes, and clears as it warms up.
        cover.alpha = 0.85 * (1 - p.brightness);
        const ww = w * p.scaleX, wh = h * p.scaleY;
        const wx = x + (w - ww) / 2, wy = y + (h - wh) / 2;
        tv?.update(f.t, picture, wx, wy, p, full);
        if (content) {
          if (!reduced && def.scroll && !tv) scrolled = (scrolled + def.scroll * f.dt) % h;
          content.tilePosition.y = -scrolled;
          content.position.set(wx, wy);
          content.scale.set(p.scaleX, p.scaleY);
          content.alpha = picture;
          content.visible = picture > 0;
        }
        scan.visible = full && p.brightness > 0;
        squeeze.clear();
        if (!full && picture > 0) squeeze.rect(wx, wy, ww, wh).fill({ color: 0xffffff, alpha: 0.6 * picture * (1 - p.scaleY) });
        bar.clear();
        if (def.roll !== false && c.bar !== null && p.on && full && p.brightness > 0) {
          const bh = Math.max(2, h * 0.12);
          bar.rect(x, y + c.bar * (h - bh), w, bh).fill({ color: 0xffffff, alpha: 0.06 * p.brightness });
        }
      },
      destroy: () => {
        root.destroy({ children: true });
        texture?.destroy(true);
        tv?.destroy();
      },
    };
  }

  /**
   * A static screen's snow: noise frames over the art, tinted toward its light, flipped 15 times a
   * second, with a brighter band rolling down now and then (the vertical hold slipping).
   */
  private snow(def: Extract<EffectDef, { kind: 'screen' }>) {
    const [, y, w, h] = def.rect;
    const grain = def.grain ?? SNOW_GRAIN;
    const seed = this.rng();
    const tw = Math.ceil(w / SNOW_PX), th = Math.ceil(h / SNOW_PX);
    const frames = Array.from({ length: STATIC_FRAMES }, () => {
      const source = new BufferImageSource({ resource: snowPixels(tw, th, this.rng), width: tw, height: th, scaleMode: 'nearest' });
      return new Texture({ source });
    });
    const tint = snowTint(this.sceneLights.get(def.light)?.color);
    const sprite = (height: number) => {
      const s = new TilingSprite({ texture: frames[0], width: w, height });
      s.tileScale.set(SNOW_PX);
      s.tint = tint;
      return s;
    };
    const fuzz = sprite(h);
    const bh = Math.max(3, Math.round(h * BAND_HEIGHT));
    const band = sprite(bh);
    band.blendMode = 'add';
    const reduced = this.opts.reducedMotion;
    return {
      sprites: [fuzz, band],
      update: (t: number, picture: number, wx: number, wy: number, p: { scaleX: number; scaleY: number }, full: boolean) => {
        const s = snow(t, seed, reduced);
        fuzz.texture = band.texture = frames[s.frame];
        fuzz.tilePosition.set(-s.ox * w, -s.oy * h);
        fuzz.position.set(wx, wy);
        fuzz.scale.set(p.scaleX, p.scaleY);
        fuzz.alpha = grain * picture;
        fuzz.visible = picture > 0 && grain > 0;
        band.visible = s.band !== null && full && picture > 0 && grain > 0;
        if (band.visible) {
          const by = s.band! * (h - bh);
          band.position.set(wx, y + by);
          band.tilePosition.set(-s.oy * w, -s.ox * h - by);
          band.alpha = BAND_ALPHA * grain * picture;
        }
      },
      destroy: () => frames.forEach((t) => t.destroy(true)),
    };
  }

  // ---- leds --------------------------------------------------------------------------------

  private leds(def: Extract<EffectDef, { kind: 'leds' }>, art: EffectsArt): Fx {
    const glow = art.glowAlpha();
    const found: Dot[] = glow ? findDots(glow.alpha, glow.w, def.rect) : [];
    const w = glow?.w ?? 1;
    const dots = found.map((d) => ({ d, phase: dotPhase(d.x, d.y, def.rate ?? 1) as DotPhase }));
    this.ledCount += dots.length;
    const gfx = new Graphics();
    this.glowView.addChild(gfx);
    return {
      update: (f) => {
        gfx.clear();
        for (const { d, phase } of dots) {
          const dim = (1 - dotAlpha(f.t, phase, this.opts.reducedMotion)) * LED_DIM;
          if (dim <= 0.01) continue;
          for (const p of d.pixels) gfx.rect(p % w, Math.floor(p / w), 1, 1);
          gfx.fill({ color: 0x000000, alpha: dim });
        }
      },
      destroy: () => gfx.destroy(),
    };
  }

  // ---- dust --------------------------------------------------------------------------------

  private dust(light: LightDef, seed: number): Fx {
    const motes = new Motes(seed);
    const gfx = new Graphics();
    gfx.blendMode = 'add';
    this.view.addChild(gfx);
    const color = parseInt(light.color.slice(1), 16);
    const amount = dustAmount(light.dust);
    return {
      update: (f, lights) => {
        const live = lights.get(light.id);
        const b = live ? Math.max(0, Math.min(1, live.intensity)) : 0;
        const count = dustCount(b, this.opts.reducedMotion, amount);
        gfx.clear();
        if (count === 0 || !live) return;
        for (const m of motes.step(f.dt, live.pos, live.radius * dustSpread(amount), count)) gfx.rect(m.x, m.y, m.size, m.size).fill({ color, alpha: m.alpha * dustFade(b) });
        this.motesDrawn += count;
      },
      destroy: () => gfx.destroy(),
    };
  }

  // ---- glass -------------------------------------------------------------------------------

  private glass(def: Extract<EffectDef, { kind: 'glass' }>, scene: SceneDef): Fx {
    const shapes = this.flashShapes;
    const glass = new Glass(Math.floor(this.rng() * 2 ** 31), shapes, this.frame, glassAmount(def.amount));
    const root = new Container();
    root.label = 'glass';
    // A drop reads on any sky as a lit pixel over a dark one (the light it bends): the dark is drawn
    // normally, the light added on top.
    const shade = new Graphics();
    const shine = new Graphics();
    shine.blendMode = 'add';
    root.addChild(shade, shine);
    this.glassView.addChild(root);
    // Clipped to the glass, so a drop on its edge doesn't sit on the frame.
    if (shapes) {
      const mask = drawArea(new Graphics(), shapes);
      this.glassView.addChild(mask);
      root.mask = mask;
    }
    const outside = new Set(scene.lights.filter((l) => l.outside).map((l) => l.id));
    return {
      update: (f, lights) => {
        shade.clear();
        shine.clear();
        const atmo = f.state?.atmosphere;
        const view = glass.step(f.dt, atmo?.weather ?? 'none', atmo?.weatherLevel ?? 0, this.opts.reducedMotion);
        const count = view.trail.length + view.beads.length + view.runners.length;
        if (count === 0) return;
        // The drops catch the light through the window: an outside light if the room has one.
        const live = [...lights.values()];
        const pool = live.some((l) => outside.has(l.id)) ? live.filter((l) => outside.has(l.id)) : live;
        const lit = pool.reduce<LightDef | null>((b, l) => (!b || l.intensity > b.intensity ? l : b), null);
        const color = snowTint(lit?.color);
        const k = GLASS_DIM + (1 - GLASS_DIM) * Math.max(0, Math.min(1, lit?.intensity ?? 0));
        // The trail is a wet streak: darker glass with a faint sheen.
        for (const t of view.trail) {
          shade.rect(t.x, t.y, t.size, t.size).fill({ color: 0x000000, alpha: t.alpha * TRAIL_SHADE });
          shine.rect(t.x, t.y, t.size, t.size).fill({ color, alpha: t.alpha * k * 0.6 });
        }
        for (const d of view.beads) {
          shade.rect(d.x, d.y + d.size, d.size, GLASS_PX).fill({ color: 0x000000, alpha: d.alpha * GLASS_SHADE });
          shine.rect(d.x, d.y, d.size, d.size).fill({ color, alpha: d.alpha * k });
        }
        // A running drop is drawn a pixel taller: it reads as falling, not as another bead.
        for (const d of view.runners) {
          shade.rect(d.x, d.y + d.size + GLASS_PX, d.size, GLASS_PX).fill({ color: 0x000000, alpha: d.alpha * GLASS_SHADE });
          shine.rect(d.x, d.y, d.size, d.size + GLASS_PX).fill({ color, alpha: d.alpha * k });
        }
        this.glassDrawn += count;
      },
      destroy: () => root.destroy({ children: true }),
    };
  }

  // ---- plume -------------------------------------------------------------------------------

  private plume(def: Extract<EffectDef, { kind: 'plume' }>): Fx {
    const style = def.style ?? 'steam';
    const plume = new Plume(Math.floor(this.rng() * 2 ** 31), def.rect, style, plumeAmount(def.amount), plumeLean(def.lean));
    const textures = this.puffs();
    const root = new Container();
    root.label = 'plume';
    this.view.addChild(root);
    const sprites: Sprite[] = [];
    const [x, y, w, h] = def.rect;
    const mid: [number, number] = [x + w / 2, y + h / 2];
    return {
      update: (f, lights) => {
        const puffs = this.opts.reducedMotion ? [] : plume.step(f.dt);
        while (sprites.length < puffs.length) {
          const s = new Sprite(textures.get(PUFF_SIZES[0])!);
          s.scale.set(PUFF_PX);
          root.addChild(s);
          sprites.push(s);
        }
        // Lit by the lamp that reaches the plume's middle most, if any does.
        let best: LightDef | null = null, reach = 0;
        for (const l of lights.values()) {
          const r = Math.max(0, 1 - Math.hypot(l.pos[0] - mid[0], l.pos[1] - mid[1]) / Math.max(1, l.radius)) * Math.max(0, Math.min(1, l.intensity));
          if (r > reach) [best, reach] = [l, r];
        }
        const tint = parseInt((best ? lerpOklab(PLUME_COLOR[style], best.color, PLUME_TINT * reach) : PLUME_COLOR[style]).slice(1), 16);
        sprites.forEach((s, i) => {
          const p = puffs[i];
          s.visible = p !== undefined;
          if (!p) return;
          s.texture = textures.get(p.size)!;
          s.position.set(p.x, p.y);
          s.alpha = p.alpha;
          s.tint = tint;
        });
        this.puffsDrawn += puffs.length;
      },
      destroy: () => root.destroy({ children: true }),
    };
  }

  private puffs(): Map<number, Texture> {
    if (!this.puffTextures) {
      this.puffTextures = new Map(
        PUFF_SIZES.map((size) => {
          const cells = size / PUFF_PX;
          const source = new BufferImageSource({ resource: puffPixels(cells), width: cells, height: cells, scaleMode: 'nearest' });
          return [size, new Texture({ source })];
        }),
      );
    }
    return this.puffTextures;
  }

  // ---- lightning ---------------------------------------------------------------------------

  private addLightning(def: Extract<EffectDef, { kind: 'lightning' }>): void {
    const gfx = new Graphics();
    gfx.label = 'lightning';
    gfx.blendMode = 'add';
    this.view.addChild(gfx);
    // One fill clipped by the shapes, so where two shapes overlap the glass still lights only once.
    if (this.flashShapes) {
      const mask = drawArea(new Graphics(), this.flashShapes);
      this.view.addChild(mask);
      gfx.mask = mask;
    }
    this.lightning.push({ def, gfx });
  }

  private updateLightning(f: Frame): void {
    this.flash = 0;
    this.lift = 0;
    if (this.lightning.length === 0) return;
    const atmo = f.state?.atmosphere;
    const hit = atmo ? this.scheduler.update(f.dt, atmo.weather, atmo.weatherLevel, this.rng) : null;
    if (hit) {
      this.strikes++;
      this.strike = { at: f.t, shapes: this.lightning.map((l) => strikeShape(hit.distance, l.def.strength ?? 1)) };
      for (const fn of this.strikeFns) fn({ distance: hit.distance, sceneId: this.sceneId });
    }
    this.lightning.forEach(({ gfx }, i) => {
      gfx.clear();
      const shape = this.strike?.shapes[i];
      const v = shape && !this.opts.reducedMotion ? flashAt(f.t - this.strike!.at, shape) : 0;
      if (v <= 0) return;
      this.flash = Math.max(this.flash, v);
      this.lift = Math.max(this.lift, (shape!.lift * v) / Math.max(1e-6, shape!.peak));
      // Hard edges: the window frame around the glass gives the flash its outline. Without an area
      // (outdoors) the whole sky flashes, at half, or it reads as a white-out.
      if (this.flashShapes) {
        const [x, y, w, h] = areaBounds(this.flashShapes);
        gfx.rect(x, y, w, h).fill({ color: FLASH_COLOR, alpha: v });
      } else {
        gfx.rect(0, 0, this.frame[0], this.frame[1]).fill({ color: FLASH_COLOR, alpha: 0.5 * v });
      }
    });
  }
}

/** Snow's (and the glass's) tint: its light's colour, half-way to white (white without one). */
function snowTint(color: string | undefined): number {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? parseInt(color.slice(1), 16) : 0xffffff;
  const mix = (shift: number) => Math.round((((c >> shift) & 0xff) + 0xff) / 2) << shift;
  return mix(16) | mix(8) | mix(0);
}
