/**
 * The map's ambience on one canvas, drawn each frame from the camera's view at screen resolution: lit windows,
 * signs, steam and smoke, traffic. It runs only between start() and stop(), skips hidden tabs, draws nothing
 * under reduced motion, and leaves out what's off screen. The model is ambience.ts.
 */
import type { CityMapData } from '../../../../shared/map-schema';
import { liftPct } from '../../../../shared/map-projection';
import { PlumeRun, TRAIN_CARS, TRAIN_GAP, TrafficRun, puffLook, scatterWindows, signLevel, windowLevel, windowShown, type LitWindow } from './ambience';
import type { View } from './camera';
import type { Darkness } from './blackout-layer';
import { MAP_H, MAP_W } from '../../../../shared/map-projection';
import { ownerAt } from '../../../../shared/district-lookup';

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** The picture scaled down to this before looking for lit windows. */
const SCAN_W = 768;
const SCAN_H = 512;
/** How far off screen (css px) something still draws, so glows don't pop at the edge. */
const MARGIN = 60;
/** A new map's runners are run on this far (s), so stacks are already smoking and roads have traffic. */
const PREWARM = 8;

/** The picture's pixels at SCAN_W × SCAN_H, or null when there's no 2D canvas to read them with. */
function readScaled(img: HTMLImageElement): Pixels | null {
  const c = document.createElement('canvas');
  c.width = SCAN_W;
  c.height = SCAN_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, SCAN_W, SCAN_H);
  return g.getImageData(0, 0, SCAN_W, SCAN_H);
}

export interface AmbienceLayerOpts {
  reducedMotion?: boolean;
  /** For tests: the 2D context to draw with (otherwise the canvas's own; null draws nothing). */
  context?: CanvasRenderingContext2D | null;
  rand?: () => number;
  /** For tests: how the picture's pixels are read (otherwise through a scratch canvas). */
  readPixels?: (img: HTMLImageElement) => Pixels | null;
}

export class AmbienceLayer {
  readonly canvas: HTMLCanvasElement;
  /** Asked for on first use (never under reduced motion), so a layer that never draws never makes a context. */
  private context: CanvasRenderingContext2D | null | undefined;
  private readonly rand: () => number;
  private map: CityMapData | null = null;
  private windows: LitWindow[] = [];
  private traffic = new TrafficRun([], Math.random);
  private plumes = new PlumeRun([], Math.random);
  private view: View = { scale: 1, tx: 0, ty: 0 };
  private w = 0;
  /** The map's size at 1× (map % are of this), css px. */
  private mapW = 0;
  private mapH = 0;
  private h = 0;
  private dpr = 1;
  /** What the running state was built from (picture + ambience + districts): the same again keeps it. */
  private key = '';
  private frame = 0;
  private running = false;
  private last: number | null = null;
  private unload: (() => void) | null = null;
  /** How dark each district is (blackouts): windows and signs fade with theirs. */
  private dark: Darkness | null = null;
  /** Each sign's district, by the same lookup as the render's mask ('' = none, never dark). */
  private signDistricts: string[] = [];

  constructor(private readonly opts: AmbienceLayerOpts = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-amb';
    this.context = opts.context;
    this.rand = opts.rand ?? Math.random;
  }

  private get ctx(): CanvasRenderingContext2D | null {
    if (this.opts.reducedMotion) return null;
    if (this.context === undefined) this.context = this.canvas.getContext('2d');
    return this.context;
  }

  /** How many windows and signs (the grid's lights) the last frame drew: the e2e hook reads it. */
  get gridLights(): number {
    return this.lastGrid;
  }
  private lastGrid = 0;

  /** How many lit windows were found in the picture. */
  get windowCount(): number {
    return this.windows.length;
  }

  /** A new map (and its picture): the runners start over, and the windows are found once the picture has loaded. */
  /** The blackout layer's reading (null: nothing ever dark). Windows and signs fade with their district; cars, drones,
   * trains and smoke carry on. */
  setDarkness(d: Darkness | null): void {
    this.dark = d;
  }

  /** Raised traffic (a road's `z`) drawn at its height: on for the rendered map, off for the painting. */
  setLift(on: boolean): void {
    this.lift = on;
  }
  private lift = false;

  /** `windows`: the rendered map's lit windows (windows.json); without them the picture's lit windows are scanned. */
  setMap(map: CityMapData, img: HTMLImageElement, windows?: LitWindow[]): void {
    const key = JSON.stringify([windows ? `rendered:${windows.length}` : img.getAttribute('src'), map.ambience, map.districts]);
    this.map = map;
    const borders = map.districts.map((d) => ({ id: d.id, border: (d.border ?? []).map((a) => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H] as [number, number]) }));
    this.signDistricts = (map.ambience?.signs ?? []).map((s) => borders[ownerAt([(s.at[0] / 100) * MAP_W, (s.at[1] / 100) * MAP_H], borders, 170) - 1]?.id ?? '');
    // The same map again (every reopen): traffic and smoke carry on, and the picture isn't scanned again.
    if (key === this.key) return;
    this.key = key;
    this.traffic = new TrafficRun(map.ambience?.traffic ?? [], this.rand);
    this.plumes = new PlumeRun(map.ambience?.plumes ?? [], this.rand);
    for (let t = 0; t < PREWARM; t += 0.05) {
      this.traffic.step(0.05);
      this.plumes.step(0.05);
    }
    this.windows = [];
    this.unload?.();
    this.unload = null;
    if (windows) {
      this.windows = this.opts.reducedMotion ? [] : windows;
      return;
    }
    const scan = () => {
      try {
        if (this.opts.reducedMotion) return;
        const px = (this.opts.readPixels ?? readScaled)(img);
        this.windows = px ? scatterWindows(px, map) : [];
      } catch {
        this.windows = []; // a picture that can't be read: no windows, the rest still runs
      }
    };
    if (img.complete) scan();
    else {
      img.addEventListener('load', scan, { once: true });
      this.unload = () => img.removeEventListener('load', scan);
    }
  }

  /**
   * The camera's view, the screen's size and the map's (at 1×) in css px; the canvas matches the screen at the device pixel
   * ratio. The map's size is the screen's when not given.
   */
  setView(view: View, size: { w: number; h: number }, map: { w: number; h: number } = size): void {
    const moved =
      view.scale !== this.view.scale || view.tx !== this.view.tx || view.ty !== this.view.ty || map.w !== this.mapW || map.h !== this.mapH;
    this.view = view;
    this.mapW = map.w;
    this.mapH = map.h;
    this.resize(size);
    // The camera moved this frame: draw from the new view now, so the ambience never trails the picture by a frame.
    if (moved && this.running) this.drawFrame(performance.now() / 1000, 0);
  }

  /** The last map's ambience stops (its data failed to load): nothing draws until the next setMap. */
  clearMap(): void {
    this.map = null;
    this.key = '';
    this.windows = [];
    this.traffic = new TrafficRun([], this.rand);
    this.plumes = new PlumeRun([], this.rand);
    if (this.context) this.clear(this.context);
  }

  private resize(size: { w: number; h: number }): void {
    // Device px per css px: the pixel ratio times the game stage's zoom (sizes here are stage px). Either
    // changing at the same size (a monitor switch, a window resize) needs a new backing store.
    const ratio = (globalThis.devicePixelRatio || 1) * ((this.canvas as HTMLCanvasElement & { currentCSSZoom?: number }).currentCSSZoom || 1);
    if (size.w === this.w && size.h === this.h && ratio === this.dpr) return;
    this.w = size.w;
    this.h = size.h;
    const dpr = (this.dpr = ratio);
    this.canvas.width = Math.round(size.w * dpr);
    this.canvas.height = Math.round(size.h * dpr);
    this.canvas.style.width = `${size.w}px`;
    this.canvas.style.height = `${size.h}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start(): void {
    if (this.opts.reducedMotion || this.running) return;
    this.running = true;
    this.last = null;
    this.frame = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    if (this.context) this.clear(this.context);
  }

  /** The whole backing store, in device pixels: at a fractional pixel ratio a css-px clear misses the last row and column. */
  private clear(g: CanvasRenderingContext2D): void {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  dispose(): void {
    this.stop();
    this.unload?.();
    this.canvas.remove();
  }

  private readonly loop = (now: number) => {
    if (!this.running) return;
    if (document.visibilityState !== 'hidden') {
      const dt = this.last === null ? 0 : (now - this.last) / 1000;
      this.drawFrame(now / 1000, dt);
    }
    this.last = now;
    this.frame = requestAnimationFrame(this.loop);
  };

  /** Steps the runners by `dt` and draws the frame at time `t` (s); returns how many things it drew. */
  drawFrame(t: number, dt: number): number {
    const g = this.ctx;
    if (this.opts.reducedMotion || !g || !this.map) return 0;
    this.traffic.step(dt);
    this.plumes.step(dt);
    const { scale, tx, ty } = this.view;
    const W = this.mapW;
    const H = this.mapH;
    const sx = (x: number) => (x / 100) * W * scale + tx;
    const sy = (y: number) => (y / 100) * H * scale + ty;
    const sz = (s: number) => (s / 100) * W * scale;
    const seen = (x: number, y: number, m = MARGIN) => x > -m && y > -m && x < this.w + m && y < this.h + m;
    const glow = (x: number, y: number, r: number, color: string, a: number) => {
      if (a <= 0.01 || r <= 0) return;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(0.25, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    this.clear(g);
    let n = 0;
    // Only asked per item while some district is dark or changing.
    const dk = this.dark?.any() ? this.dark : null;

    // Windows: brighteners flash now and then; dimmers go softly dark (never a hard square).
    for (const w of this.windows) {
      if (!windowShown(w, this.map)) continue;
      const X = sx(w.x);
      const Y = sy(w.y - liftPct(w.z ?? 0));
      if (!seen(X, Y, 10)) continue;
      const k = dk ? 1 - dk.at(w.district, w.x) : 1;
      if (k <= 0.01) continue;
      const v = windowLevel(w, t) * k;
      const r = Math.max(1.2, sz(0.18));
      if (w.dims) {
        if (v <= 0) continue;
        const R = r * 1.8;
        const grad = g.createRadialGradient(X, Y, 0, X, Y, R);
        grad.addColorStop(0, 'rgba(8,5,16,1)');
        grad.addColorStop(1, 'rgba(8,5,16,0)');
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = v * 0.55;
        g.fillStyle = grad;
        g.beginPath();
        g.arc(X, Y, R, 0, Math.PI * 2);
        g.fill();
      } else {
        g.globalCompositeOperation = 'lighter';
        glow(X, Y, r * 3, w.color, v * 0.9);
      }
      n++;
    }

    // Signs.
    g.globalCompositeOperation = 'lighter';
    for (const [i, s] of (this.map.ambience?.signs ?? []).entries()) {
      const k = dk ? 1 - dk.at(this.signDistricts[i] ?? '', s.at[0]) : 1;
      if (k <= 0.01) continue;
      const X = sx(s.at[0]);
      const Y = sy(s.at[1]);
      const r = sz(s.size);
      if (!seen(X, Y, r + MARGIN)) continue;
      const a = signLevel(s, t) * k;
      glow(X, Y, r, s.color, a);
      if (s.mode === 'blink') glow(X, Y, r * 0.3, '#ffffff', a);
      n++;
    }

    this.lastGrid = n;

    // Steam and smoke.
    g.globalCompositeOperation = 'source-over';
    for (const q of this.plumes.puffs) {
      const X = sx(q.x);
      const Y = sy(q.y);
      const look = puffLook(q);
      const r = sz(look.r);
      if (!seen(X, Y, r + MARGIN) || look.alpha <= 0) continue;
      const grad = g.createRadialGradient(X, Y, 0, X, Y, r);
      grad.addColorStop(0, look.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = look.alpha;
      g.fillStyle = grad;
      g.beginPath();
      g.arc(X, Y, r, 0, Math.PI * 2);
      g.fill();
      n++;
    }

    // Traffic, raised roads at their height on the rendered map.
    const up = (z?: number) => (this.lift && z ? liftPct(z) : 0);
    g.globalCompositeOperation = 'lighter';
    for (const m of this.traffic.movers) {
      if (m.traffic.kind === 'train') {
        // Each car on its own: none before the path's start (no bunched-up blob), the tail runs out after the head.
        const u = Math.max(0.9, sz(0.11));
        let drawn = false;
        for (let k = 0; k < TRAIN_CARS; k++) {
          const p = this.traffic.at(m, m.d - k * TRAIN_GAP);
          const py = p ? p.y - up(m.traffic.z) : 0;
          if (!p || !seen(sx(p.x), sy(py))) continue;
          glow(sx(p.x), sy(py), u * 3, k === 0 ? '#ffffff' : '#7fe9ff', k === 0 ? 1 : 0.55);
          drawn = true;
        }
        if (drawn) n++;
        continue;
      }
      const q = this.traffic.at(m);
      if (!q) continue;
      const X = sx(q.x);
      const Y = sy(q.y - up(m.traffic.z));
      if (!seen(X, Y)) continue;
      const u = Math.max(0.9, sz(0.11));
      if (m.traffic.kind === 'cars') {
        const L = Math.hypot(q.dx, q.dy) || 1;
        const dir = m.back ? -1 : 1;
        const ux = (q.dx / L) * dir;
        const uy = (q.dy / L) * dir;
        glow(X + ux * u * 2, Y + uy * u * 2, u * 3.5, '#fff3c8', 0.9); // headlights ahead
        glow(X - ux * u * 2, Y - uy * u * 2, u * 2.2, '#ff3030', 0.7); // tail lights behind
      } else {
        glow(X, Y, u * 2, '#ffffff', 0.35);
        if ((t * 1.2) % 1 < 0.2) glow(X, Y, u * 3.5, '#ff3030', 1);
      }
      n++;
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return n;
  }
}
