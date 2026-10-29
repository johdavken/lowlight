/**
 * Blackouts on the rendered map (spec 2026-10-27): over the lit tiles, each visible tile's lights-off copy split by its
 * district mask, one canvas per district it holds. A district's canvases live in one box with one opacity (and, while
 * the grid comes back, one sweep mask in map %), so every tile of a district goes dark at the same moment and a lower
 * level's canvas under a sharper one never darkens twice. Nothing loads while every district is lit.
 */
import { tileRect, type TileManifest } from '../../../../shared/map-tiles';
import { districtsIn, splitDark } from './blackout';
import type { Size, View } from './camera';
import { tilesForView, type TileRef } from './tile-layer';

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Ctx2d {
  createImageData(w: number, h: number): { data: Uint8ClampedArray };
  putImageData(img: unknown, x: number, y: number): void;
}

export interface BlackoutOptions {
  base: string;
  /** Tiles kept off screen (each holds a canvas per district in it; small for the Fold). */
  cacheSize?: number;
  loadPixels?: (url: string) => Promise<Pixels>;
  makeCanvas?: () => HTMLCanvasElement;
  raf?: (f: () => void) => void;
  now?: () => number;
}

/** Lights out: stutters (dark opacity over seconds), then dark. */
const OUT: [number, number][] = [[0, 0], [0.12, 0.8], [0.24, 0.1], [0.42, 0.6], [0.56, 0.05], [0.85, 1], [1.2, 1]];
const BACK_S = 2.5;
const FADE_S = 0.3;
/** The sweep's soft edge, in map %. */
const EDGE = 6;

function keyframes(k: [number, number][], s: number): number {
  for (let i = 1; i < k.length; i++) {
    const [t1, v1] = k[i]!, [t0, v0] = k[i - 1]!;
    if (s <= t1) return v0 + ((v1 - v0) * (s - t0)) / (t1 - t0);
  }
  return k.at(-1)![1];
}

async function decode(url: string): Promise<Pixels> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  // The mask's values must come back exact: no colour management, no premultiplying.
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** How dark each district is right now (blackouts phase 2 §3), for the live layer's windows and signs. */
export interface Darkness {
  /** True while some district is dark or on its way in or out; false means every `at` is 0. */
  any(): boolean;
  /** 0 lit … 1 dark, at map % x (the sweep back lights the west first). Unknown ids are 0. */
  at(district: string, xPct: number): number;
}

interface District {
  on: boolean;
  opacity: number;
  /** The sweep's front while the grid comes back (map % x); null otherwise. */
  front: number | null;
  anim: { kind: 'out' | 'back' | 'fade'; t0: number; from: number; x0: number; x1: number } | null;
}

interface Tile {
  ready: boolean;
  canvases: Map<number, HTMLCanvasElement>;
}

export class BlackoutLayer implements Darkness {
  readonly el: HTMLElement;
  private m: TileManifest | null = null;
  private readonly districts = new Map<number, District>();
  private readonly boxes = new Map<number, HTMLElement>();
  /** By `<scale>/<key>`, most recently used last. */
  private readonly tiles = new Map<string, Tile>();
  private readonly failed = new Set<string>();
  private last: [View, Size, Size, number] | null = null;
  /** The lower level's tiles under the view's sharper ones, and those sharper ones: the lower hide once the sharper are in. */
  private under = new Set<string>();
  private sharp = new Set<string>();
  private ticking = false;
  private readonly cacheSize: number;
  private readonly loadPixels: (url: string) => Promise<Pixels>;
  private readonly makeCanvas: () => HTMLCanvasElement;
  private readonly raf: (f: () => void) => void;
  private readonly now: () => number;

  constructor(world: HTMLElement, private readonly opts: BlackoutOptions) {
    this.cacheSize = opts.cacheSize ?? 48;
    this.loadPixels = opts.loadPixels ?? decode;
    this.makeCanvas = opts.makeCanvas ?? (() => document.createElement('canvas'));
    this.raf = opts.raf ?? ((f) => requestAnimationFrame(() => f()));
    this.now = opts.now ?? (() => performance.now());
    this.el = document.createElement('div');
    this.el.className = 'map-blackout';
    this.el.hidden = true;
    const tiles = world.querySelector('.map-tiles');
    if (tiles) tiles.after(this.el);
    else world.prepend(this.el);
  }

  /** The render's manifest; without a dark set the layer stays hidden and does nothing. */
  setManifest(m: TileManifest | null): void {
    const next = m?.dark?.levels.length && m.mask ? m : null;
    const print = (x: TileManifest | null) => (x ? JSON.stringify([x.rendered, x.dark, x.mask]) : '');
    // The same render again (the map opening again): the dark tiles already made stay, so nothing shows lit first.
    if (print(next) !== print(this.m)) {
      for (const id of [...this.tiles.keys()]) this.drop(id);
      this.failed.clear();
      // A different district table: an index may name another district now, so every district starts lit.
      if (JSON.stringify(next?.mask?.districts ?? []) !== JSON.stringify(this.m?.mask?.districts ?? [])) {
        this.districts.clear();
        for (const b of this.boxes.values()) b.remove();
        this.boxes.clear();
      }
    }
    this.m = next;
    this.el.hidden = !this.m;
  }

  /** The district ids the render knows (index - 1). */
  get known(): string[] {
    return this.m?.mask?.districts ?? [];
  }

  /** Blacks out exactly `ids`, animating only the districts that change. */
  set(ids: string[], reducedMotion: boolean): void {
    if (!this.m) return;
    const t = this.now();
    this.known.forEach((id, i) => {
      const index = i + 1;
      const d = this.district(index);
      const on = ids.includes(id);
      if (on === d.on) return;
      d.on = on;
      const [x0, x1] = this.bounds(index);
      d.anim = { kind: reducedMotion ? 'fade' : on ? 'out' : 'back', t0: t, from: d.opacity, x0, x1 };
      // Going dark again mid-sweep: the sweep's mask goes, or part of the district would stay lit.
      if (d.anim.kind !== 'back') d.front = null;
    });
    if (this.last) this.update(...this.last);
    this.tick();
  }

  update(view: View, map: Size, screen: Size, dpr: number): void {
    this.last = [view, map, screen, dpr];
    const m = this.m;
    if (!m || !map.w || !map.h || !this.active()) return;
    const darkLevels = m.levels.filter((l) => m.dark!.levels.includes(l.scale));
    const lowest = darkLevels.reduce((a, b) => (b.scale < a.scale ? b : a));
    // The lowest dark level under the view's (never a lit gap while a sharper one loads), then the view's own.
    const low = tilesForView({ ...m, levels: [lowest] }, view, map, screen, dpr);
    const own = tilesForView({ ...m, levels: darkLevels }, view, map, screen, dpr);
    const wanted = [...low, ...own];
    this.sharp = new Set(own.map((t) => `${t.scale}/${t.key}`));
    this.under = new Set(low.map((t) => `${t.scale}/${t.key}`).filter((id) => !this.sharp.has(id)));
    const ids = new Set<string>();
    for (const t of wanted) {
      const id = `${t.scale}/${t.key}`;
      if (ids.has(id) || this.failed.has(id)) continue;
      ids.add(id);
      const tile = this.tiles.get(id);
      this.tiles.delete(id);
      this.tiles.set(id, tile ?? this.load(t, darkLevels.findIndex((l) => l.scale === t.scale)));
    }
    let spare = [...this.tiles.keys()].filter((id) => !ids.has(id));
    for (const id of spare) if (!this.tiles.get(id)!.ready) this.drop(id);
    spare = [...this.tiles.keys()].filter((id) => !ids.has(id));
    for (const id of spare.slice(0, Math.max(0, spare.length - this.cacheSize))) this.drop(id);
    this.layer();
  }

  /** The lower level shows only while the view's sharper tiles load: under them its coarser mask would darken a strip
   * of a lit neighbour at the district line. Off-screen tiles hide too. */
  private layer(): void {
    const sharpIn = [...this.sharp].every((id) => this.failed.has(id) || this.tiles.get(id)?.ready);
    for (const [id, tile] of this.tiles) {
      const hide = (this.under.has(id) && sharpIn) || (!this.under.has(id) && !this.sharp.has(id));
      for (const cv of tile.canvases.values()) cv.hidden = hide;
    }
  }

  any(): boolean {
    return this.m !== null && this.active();
  }

  at(district: string, xPct: number): number {
    const d = this.districts.get(this.known.indexOf(district) + 1);
    if (!d) return 0;
    if (d.front === null) return d.opacity;
    // The same ramp as the sweep's mask: lit west of the front, dark east of it.
    return d.opacity * Math.min(1, Math.max(0, (xPct - (d.front - EDGE / 2)) / EDGE));
  }

  /** Tiles held (loading or loaded). */
  cachedTiles(): number {
    return this.tiles.size;
  }

  dispose(): void {
    for (const id of [...this.tiles.keys()]) this.drop(id);
    this.el.remove();
  }

  private active(): boolean {
    return [...this.districts.values()].some((d) => d.on || d.anim || d.opacity > 0);
  }

  private district(index: number): District {
    let d = this.districts.get(index);
    if (!d) this.districts.set(index, (d = { on: false, opacity: 0, front: null, anim: null }));
    return d;
  }

  private box(index: number): HTMLElement {
    let b = this.boxes.get(index);
    if (!b) {
      b = document.createElement('div');
      b.className = 'map-blackout-d';
      b.dataset.index = String(index);
      b.dataset.id = this.known[index - 1] ?? '';
      b.hidden = true;
      this.el.append(b);
      this.boxes.set(index, b);
      this.apply(index);
    }
    return b;
  }

  /** The district's extent in map % x, from the tiles holding it (for the sweep back). */
  private bounds(index: number): [number, number] {
    let x0 = Infinity, x1 = -Infinity;
    for (const [id, tile] of this.tiles) {
      if (!tile.canvases.has(index)) continue;
      const [s, key] = id.split('/') as [string, string];
      const [c, r] = key.split('_').map(Number) as [number, number];
      const rect = tileRect(Number(s), c, r);
      x0 = Math.min(x0, rect.x);
      x1 = Math.max(x1, rect.x + rect.w);
    }
    return x0 < x1 ? [x0, x1] : [0, 100];
  }

  private tick(): void {
    if (this.ticking) return;
    const frame = () => {
      const t = this.now();
      let more = false;
      for (const [index, d] of this.districts) {
        const a = d.anim;
        if (!a) continue;
        const s = (t - a.t0) / 1000;
        if (a.kind === 'fade') {
          const k = Math.min(1, s / FADE_S);
          d.opacity = a.from + ((d.on ? 1 : 0) - a.from) * k;
          if (k >= 1) d.anim = null;
        } else if (a.kind === 'out') {
          d.opacity = keyframes(OUT, s);
          if (s >= OUT.at(-1)![0]) d.anim = null;
        } else {
          // The grid comes back street by street from the west: lit behind the front, still dark ahead of it.
          const k = Math.min(1, s / BACK_S);
          d.opacity = a.from;
          d.front = a.x0 - EDGE + (a.x1 - a.x0 + 2 * EDGE) * k;
          if (k >= 1) {
            d.anim = null;
            d.front = null;
            d.opacity = 0;
          }
        }
        more ||= d.anim !== null;
        this.apply(index);
      }
      this.ticking = more;
      if (more) this.raf(frame);
      // Every district lit again: the dark tiles go, so they don't sit in memory (the Fold) until the map reopens.
      else if (!this.active()) for (const id of [...this.tiles.keys()]) this.drop(id);
    };
    this.ticking = true;
    this.raf(frame);
  }

  private apply(index: number): void {
    const b = this.boxes.get(index);
    if (!b) return;
    const d = this.district(index);
    b.style.opacity = String(Math.round(d.opacity * 1000) / 1000);
    b.hidden = d.opacity <= 0 && !d.anim;
    const mask = d.front === null ? '' : `linear-gradient(to right, transparent ${d.front - EDGE / 2}%, #000 ${d.front + EDGE / 2}%)`;
    b.style.setProperty('mask-image', mask);
    b.style.setProperty('-webkit-mask-image', mask);
  }

  private load(t: TileRef, levelIndex: number): Tile {
    const id = `${t.scale}/${t.key}`;
    const tile: Tile = { ready: false, canvases: new Map() };
    const base = this.opts.base;
    void Promise.all([this.loadPixels(`${base}tiles-dark/${t.scale}/${t.key}.webp`), this.loadPixels(`${base}tiles-mask/${t.scale}/${t.key}.png`)]).then(
      ([dark, mask]) => {
        if (this.tiles.get(id) !== tile) return;
        const [c, r] = t.key.split('_').map(Number) as [number, number];
        const rect = tileRect(t.scale, c, r);
        for (const index of districtsIn(mask.data)) {
          const cv = this.makeCanvas();
          cv.width = dark.width;
          cv.height = dark.height;
          cv.className = 'map-blackout-tile';
          Object.assign(cv.style, { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%`, zIndex: String(levelIndex + 1) });
          const ctx = cv.getContext('2d') as unknown as Ctx2d;
          const img = ctx.createImageData(dark.width, dark.height);
          img.data.set(splitDark(dark.data, mask.data, index));
          ctx.putImageData(img, 0, 0);
          tile.canvases.set(index, cv);
          this.box(index).append(cv);
        }
        tile.ready = true;
        this.layer();
      },
      () => {
        if (this.tiles.get(id) !== tile) return;
        this.tiles.delete(id);
        this.failed.add(id);
        this.layer();
      },
    );
    return tile;
  }

  private drop(id: string): void {
    const tile = this.tiles.get(id);
    if (tile) for (const cv of tile.canvases.values()) cv.remove();
    this.tiles.delete(id);
  }
}
