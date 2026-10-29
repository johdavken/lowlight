/**
 * The rendered map's screen effects (spec 2026-10-25 §5): what belongs to the screen, not to a place, so it isn't baked
 * into the tiles. Rain that follows the city's weather, fine grain, a soft vignette and a slight colour fringe at the edges.
 * One canvas over the map, under the band and strip; nothing at all under reduced motion.
 */
import type { Weather } from '../../../../shared/types';

/** Streaks for a weather and level over an area (css px²): none unless it's raining. */
export function rainCount(weather: Weather, level: number, area: number): number {
  return weather === 'rain' ? Math.round((Math.max(0, Math.min(1, level)) * area) / 2600) : 0;
}

/** Streaks lean this far from vertical (radians), falling this fast (css px a second). */
const LEAN = (12 * Math.PI) / 180;
const FALL = 900;

export class ScreenFx {
  readonly canvas: HTMLCanvasElement;
  private weather: Weather = 'none';
  private level = 0;
  private frame = 0;
  private running = false;
  private drops: { x: number; y: number; len: number; speed: number }[] = [];
  private grain: HTMLCanvasElement | null = null;
  private last = 0;

  constructor(private readonly opts: { reducedMotion?: boolean; context?: CanvasRenderingContext2D } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-fx';
  }

  private get ctx(): CanvasRenderingContext2D | null {
    return this.opts.context ?? this.canvas.getContext('2d');
  }

  setWeather(weather: Weather, level: number): void {
    this.weather = weather;
    this.level = level;
    this.drops = [];
  }

  start(): void {
    if (this.running || this.opts.reducedMotion) return;
    this.running = true;
    const step = (now: number) => {
      if (!this.running) return;
      this.drawFrame(now / 1000);
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  dispose(): void {
    this.stop();
    this.canvas.remove();
  }

  /** Draws one frame at time `t` (s); returns how many rain streaks it drew. */
  drawFrame(t: number): number {
    if (this.opts.reducedMotion) return 0;
    const g = this.ctx;
    if (!g) return 0;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || 1600, h = this.canvas.clientHeight || 900;
    if (this.canvas.width !== Math.round(w * dpr)) [this.canvas.width, this.canvas.height] = [Math.round(w * dpr), Math.round(h * dpr)];
    const dt = this.last ? Math.min(0.1, t - this.last) : 0;
    this.last = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // Rain: streaks falling at a slant, wrapping round the screen.
    const want = rainCount(this.weather, this.level, w * h);
    while (this.drops.length < want) this.drops.push({ x: Math.random() * w, y: Math.random() * h, len: 8 + Math.random() * 14, speed: FALL * (0.7 + Math.random() * 0.6) });
    this.drops.length = want;
    g.strokeStyle = 'rgba(190, 210, 240, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    const sx = Math.sin(LEAN), cy = Math.cos(LEAN);
    for (const d of this.drops) {
      d.x += sx * d.speed * dt;
      d.y += cy * d.speed * dt;
      if (d.y > h) [d.y, d.x] = [-d.len, Math.random() * w];
      if (d.x > w) d.x -= w;
      g.moveTo(d.x, d.y);
      g.lineTo(d.x - sx * d.len, d.y - cy * d.len);
    }
    g.stroke();
    // Grain: a small noise tile, shifted each frame.
    if (!this.grain) this.grain = makeGrain();
    if (this.grain) {
      g.globalAlpha = 0.06;
      const pattern = g.createPattern?.(this.grain, 'repeat');
      if (pattern) {
        g.save();
        g.translate((t * 977) % 128, (t * 661) % 128);
        g.fillStyle = pattern;
        g.fillRect(-128, -128, w + 256, h + 256);
        g.restore();
      }
      g.globalAlpha = 1;
    }
    // Vignette: darker towards the corners.
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    // Fringe: a faint red and cyan edge, as a lens would.
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255, 60, 80, 0.08)';
    g.strokeRect(1.5, 1.5, w - 3, h - 3);
    g.strokeStyle = 'rgba(80, 230, 255, 0.08)';
    g.strokeRect(3.5, 3.5, w - 7, h - 7);
    return this.drops.length;
  }
}

function makeGrain(): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
