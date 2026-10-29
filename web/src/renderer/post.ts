import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture, type Filter } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter, GlitchFilter, GodrayFilter, RGBSplitFilter } from 'pixi-filters';
import { splitPx } from './split';
import { lerpOklab, parseHex } from '../../../shared/color';
import type { Atmosphere, Hex, Weather } from '../../../shared/types';
import type { ShaderLight } from './lighting';
import { RENDER_H, RENDER_W } from './stage';
import { streakSlope, type Particle } from './weather';

/** The current room's frame (the renderer resizes it in place when a room of another size loads). */
export const FRAME = new Rectangle(0, 0, RENDER_W, RENDER_H);

const hexToNum = (h: Hex) => parseInt(h.slice(1), 16);

/** Bloom blur for a room: `unit` (room px per 480 px) keeps the halo's on-screen size the same. */
export function bloomBlur(unit: number): number {
  return 6 * unit;
}

/** Threshold bloom over the additive emissive layer. */
export function createBloom(unit = 1): AdvancedBloomFilter {
  const bloom = new AdvancedBloomFilter({ threshold: 0.4, bloomScale: 1.2, brightness: 1, blur: bloomBlur(unit), quality: 5 });
  bloom.blendMode = 'add';
  return bloom;
}

/** Vertical alpha ramp, faint at the top and dense at the bottom. */
function fogTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = RENDER_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  const g = ctx.createLinearGradient(0, 0, 0, RENDER_H);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.3)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, RENDER_H);
  const tex = Texture.from(c);
  // Smooth when a flat room stretches the 270 rows to 864 (in a 480 room it is drawn 1:1, unchanged).
  tex.source.style.scaleMode = 'linear';
  return tex;
}

/** Godray time wraps here (≈ 40 min at 0.4/s) so it never grows unbounded. */
const GODRAY_TIME_WRAP = 1000;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Fog wash and light shafts, drawn over the lit layers.
 * - Fog: a bottom-weighted gradient tinted `lerpOklab(ambient, brightest light color, 0.4)`, alpha `fog * 0.6`.
 * - Shafts: `GodrayFilter` rays from the brightest light with `pos[1] < 90`, enabled while fog > 0.2.
 */
export class Atmospherics {
  readonly fog: Sprite;
  readonly shafts = new Container();
  private readonly godray = new GodrayFilter({ parallel: false, gain: 0.55, lacunarity: 2.6, alpha: 0 });
  private readonly shaftTint = new ColorMatrixFilter();
  private readonly shaftBase = new Sprite(Texture.WHITE);
  /** Room px per 480 px. */
  private unit = 1;

  constructor() {
    this.fog = new Sprite(fogTexture());
    this.shaftBase.tint = 0x000000;
    this.setFrame(RENDER_W, RENDER_H);
    this.shafts.addChild(this.shaftBase);
    this.shafts.filterArea = FRAME;
    this.shaftTint.blendMode = 'add';
    this.shafts.filters = [this.godray, this.shaftTint];
    this.shafts.visible = false;
  }

  /** Sizes the fog and the shafts to the room's frame. */
  setFrame(w: number, h: number): void {
    this.unit = w / RENDER_W;
    this.fog.width = w;
    this.fog.height = h;
    this.shaftBase.width = w;
    this.shaftBase.height = h;
  }

  update(atmo: Atmosphere, lights: ShaderLight[], dt: number): void {
    const brightest = lights.reduce<ShaderLight | null>((b, l) => (!b || l.intensity > b.intensity ? l : b), null);
    const fogColor = brightest && brightest.intensity > 0 ? lerpOklab(atmo.ambient, brightest.color, 0.4) : atmo.ambient;
    this.fog.tint = hexToNum(fogColor);
    this.fog.alpha = atmo.fog * 0.6;
    this.fog.visible = this.fog.alpha > 0.001;

    const high = lights
      .filter((l) => l.pos[1] < 90 * this.unit && l.intensity > 0)
      .reduce<ShaderLight | null>((b, l) => (!b || l.intensity > b.intensity ? l : b), null);
    const strength = high && atmo.fog > 0.2 ? smoothstep(0.2, 0.5, atmo.fog) * Math.min(1, high.intensity) : 0;
    this.shafts.visible = strength > 0.001;
    if (!high || !this.shafts.visible) return;
    this.godray.center = { x: high.pos[0], y: high.pos[1] };
    this.godray.alpha = 0.55 * strength;
    // The rays' noise is smooth in time, so wrapping only causes a rare, faint jump; keeping the value
    // small preserves float precision in the shader.
    this.godray.time = (this.godray.time + dt * 0.4) % GODRAY_TIME_WRAP;
    const [r, g, b] = parseHex(high.color) ?? [1, 1, 1];
    // prettier-ignore
    this.shaftTint.matrix = [
      r, 0, 0, 0, 0,
      0, g, 0, 0, 0,
      0, 0, b, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }
}

/** Draws weather particles at native resolution: rain as slanted 1 px streaks, the rest as single pixels. */
export class WeatherLayer {
  readonly gfx = new Graphics();

  draw(kind: Weather, particles: Particle[]): void {
    const g = this.gfx;
    g.clear();
    if (kind === 'none' || particles.length === 0) return;
    const slope = streakSlope(kind);
    for (const p of particles) {
      if (p.len <= 1) {
        g.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill({ color: p.color, alpha: p.alpha });
      } else {
        g.moveTo(p.x, p.y)
          .lineTo(p.x - slope * p.len, p.y - p.len)
          .stroke({ color: p.color, alpha: p.alpha, width: 1, cap: 'butt' });
      }
    }
  }
}

/**
 * Final grade on the upscaled view: CRT scanlines + vignette and a hairline RGB split.
 * `glitch(amount)` (0..1) ramps the split toward ±6 art px and adds GlitchFilter slice tearing.
 */
export class Grade {
  private readonly crt = new CRTFilter({
    curvature: 0,
    lineContrast: 0.15,
    lineWidth: 1,
    vignetting: 0.35,
    vignettingAlpha: 0.8,
    vignettingBlur: 0.35,
    noise: 0,
  });
  private readonly split = new RGBSplitFilter();
  private readonly glitchFx = new GlitchFilter({ slices: 12, offset: 0, fillMode: 2, average: false });
  private scale = 1;
  private amount = 0;

  constructor(private readonly target: { filters: Filter | readonly Filter[] | null | undefined }) {
    this.apply();
  }

  /** Integer upscale factor of the view (screen px per render-texture px). */
  setScale(scale: number): void {
    this.scale = Math.max(1, scale);
    // Scanline period is ~5.24·lineWidth/2 screen px (min 5.24): align it to whole art pixels.
    const rows = Math.max(1, Math.ceil(5.24 / this.scale));
    this.crt.lineWidth = Math.max(1, (2 * rows * this.scale) / 5.24);
    this.apply();
  }

  glitch(amount: number): void {
    const a = Math.max(0, Math.min(1, amount));
    if (a === 0 && this.amount === 0) return;
    this.amount = a;
    this.apply();
  }

  private apply(): void {
    const a = this.amount;
    const px = splitPx(a, this.scale);
    const vy = a > 0 ? Math.round(a * this.scale * 2) : 0;
    this.split.red = { x: -px, y: vy };
    this.split.green = { x: 0, y: 0 };
    this.split.blue = { x: px, y: -vy };
    if (a > 0) {
      this.glitchFx.offset = Math.round(a * 28 * this.scale);
      this.glitchFx.seed = Math.random();
      this.glitchFx.slices = 6 + Math.floor(Math.random() * 10);
      this.glitchFx.refresh();
      this.target.filters = [this.glitchFx, this.split, this.crt];
    } else {
      this.target.filters = [this.split, this.crt];
    }
  }
}
