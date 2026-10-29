/**
 * The rendered map's tiles (spec 2026-10-25 §5), in place of the painting: the tiles covering the view at the lowest
 * level sharp enough for the screen, over the 1× tiles (always there underneath, so nothing is ever blank while sharper
 * ones load). Where the chosen level has no tile (8× exists only over Karasu), the next lower level's tile stands in.
 * Tiles live in the camera's world box, placed in map %, so they move and zoom with it.
 */
import { hasTile, parseManifest, tileGrid, tileRect, type TileManifest } from '../../../../shared/map-tiles';
import type { Size, View } from './camera';

export interface TileRef {
  scale: number;
  key: string;
  /** Standing in for a missing tile at a sharper level. */
  fallback: boolean;
}

/** The visible map % for a view (clamped to the map). */
function visible(view: View, map: Size, screen: Size) {
  const x0 = Math.max(0, (-view.tx / view.scale / map.w) * 100), x1 = Math.min(100, ((screen.w - view.tx) / view.scale / map.w) * 100);
  const y0 = Math.max(0, (-view.ty / view.scale / map.h) * 100), y1 = Math.min(100, ((screen.h - view.ty) / view.scale / map.h) * 100);
  return { x0, x1, y0, y1 };
}

function keysIn(scale: number, v: { x0: number; x1: number; y0: number; y1: number }): string[] {
  const { cols, rows } = tileGrid(scale);
  const c0 = Math.floor((v.x0 / 100) * cols), c1 = Math.min(cols - 1, Math.floor((v.x1 / 100) * cols - 1e-9));
  const r0 = Math.floor((v.y0 / 100) * rows), r1 = Math.min(rows - 1, Math.floor((v.y1 / 100) * rows - 1e-9));
  const out: string[] = [];
  for (let r = Math.max(0, r0); r <= r1; r++) for (let c = Math.max(0, c0); c <= c1; c++) out.push(`${c}_${r}`);
  return out;
}

/** The tiles a view needs: the sharp enough level's, each missing one replaced by the lower level's that covers it. */
export function tilesForView(m: TileManifest, view: View, map: Size, screen: Size, dpr: number): TileRef[] {
  const levels = [...m.levels].sort((a, b) => a.scale - b.scale);
  const need = (view.scale * dpr * map.w) / m.size[0];
  const level = levels.find((l) => l.scale >= need) ?? levels.at(-1)!;
  const v = visible(view, map, screen);
  const out: TileRef[] = [];
  const seen = new Set<string>();
  const add = (t: TileRef) => {
    const id = `${t.scale}/${t.key}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(t);
    }
  };
  for (const key of keysIn(level.scale, v)) {
    if (hasTile(level, key)) {
      add({ scale: level.scale, key, fallback: false });
      continue;
    }
    // The next lower level that has the tile covering this one.
    const [c, r] = key.split('_').map(Number) as [number, number];
    for (const lower of levels.filter((l) => l.scale < level.scale).reverse()) {
      const k = `${Math.floor((c * lower.scale) / level.scale)}_${Math.floor((r * lower.scale) / level.scale)}`;
      if (hasTile(lower, k)) {
        add({ scale: lower.scale, key: k, fallback: true });
        break;
      }
    }
  }
  return out;
}

export class TileLayer {
  readonly el: HTMLElement;
  private m: TileManifest | null = null;
  /** Every tile <img> made, by `<scale>/<key>`, most recently used last. */
  private readonly imgs = new Map<string, HTMLImageElement>();
  private readonly loaded = new Set<string>();
  /** Each <img>'s listeners, dropped before its load is cancelled (clearing src fires error, which isn't a failure). */
  private readonly listeners = new Map<string, AbortController>();
  private readonly cacheSize: number;
  private firstResult: Promise<boolean> | null = null;
  private settleFirst: ((failed: boolean) => void) | null = null;

  constructor(
    world: HTMLElement,
    private readonly opts: { base: string; cacheSize?: number },
  ) {
    this.cacheSize = opts.cacheSize ?? 200;
    this.el = document.createElement('div');
    this.el.className = 'map-tiles';
    world.prepend(this.el);
  }

  get manifest(): TileManifest | null {
    return this.m;
  }

  /** The manifest, or null when there's no usable render (the map shows the painting). */
  async load(): Promise<TileManifest | null> {
    // Each load is a fresh look at the render: its first 1× tile decides again.
    this.firstResult = null;
    this.settleFirst = null;
    try {
      const r = await fetch(`${this.opts.base}tiles.json`);
      this.m = r.ok ? parseManifest(await r.json()) : null;
    } catch {
      this.m = null;
    }
    return this.m;
  }

  /** Resolves once the first tile has loaded (false) or failed (true). */
  firstTileFailed(): Promise<boolean> {
    this.firstResult ??= new Promise((res) => (this.settleFirst = res));
    return this.firstResult;
  }

  update(view: View, map: Size, screen: Size, dpr: number): void {
    const m = this.m;
    if (!m || !map.w || !map.h) return;
    const base = m.levels.reduce((a, b) => (b.scale < a.scale ? b : a));
    // The lowest level under everything, then the view's tiles.
    const wanted = [...tilesForView(m, { scale: 1, tx: 0, ty: 0 }, map, map, 1).filter((t) => t.scale === base.scale), ...tilesForView(m, view, map, screen, dpr)];
    const ids = new Set<string>();
    for (const t of wanted) {
      const id = `${t.scale}/${t.key}`;
      if (ids.has(id)) continue;
      ids.add(id);
      let img = this.imgs.get(id);
      if (img) this.imgs.delete(id);
      else img = this.make(t, m.levels.findIndex((l) => l.scale === t.scale));
      this.imgs.set(id, img);
      if (!img.getAttribute('src')) img.src = this.url(t);
      if (!img.isConnected) this.el.append(img);
    }
    // Tiles out of view: unloaded ones stop loading; beyond the cache, the least recently used go.
    let spare = [...this.imgs.keys()].filter((id) => !ids.has(id));
    for (const id of spare) if (!this.loaded.has(id)) this.drop(id);
    spare = [...this.imgs.keys()].filter((id) => !ids.has(id));
    for (const id of spare.slice(0, Math.max(0, spare.length - this.cacheSize))) this.drop(id);
  }

  dispose(): void {
    for (const id of [...this.imgs.keys()]) this.drop(id);
    this.el.remove();
  }

  /** Forgets a tile: its listeners first, then its load stops and it leaves the page (a later update can ask again). */
  private drop(id: string): void {
    this.listeners.get(id)?.abort();
    this.listeners.delete(id);
    const img = this.imgs.get(id);
    if (img) {
      if (!this.loaded.has(id)) {
        img.removeAttribute('src');
        img.src = '';
      }
      img.remove();
    }
    this.imgs.delete(id);
    this.loaded.delete(id);
  }

  private url(t: TileRef): string {
    return `${this.opts.base}tiles/${t.scale}/${t.key}.webp`;
  }

  private make(t: TileRef, levelIndex: number): HTMLImageElement {
    const id = `${t.scale}/${t.key}`;
    const img = document.createElement('img');
    img.className = 'map-tile';
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.dataset.key = id;
    const [c, r] = t.key.split('_').map(Number) as [number, number];
    const rect = tileRect(t.scale, c, r);
    Object.assign(img.style, { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%`, zIndex: String(levelIndex + 1) });
    const ctl = new AbortController();
    this.listeners.set(id, ctl);
    // Only the lowest level's tiles decide whether the render works at all; a sharper tile failing just leaves the level below.
    const base = this.m ? Math.min(...this.m.levels.map((l) => l.scale)) : t.scale;
    const settle = (failed: boolean) => {
      if (t.scale !== base) return;
      this.settleFirst?.(failed);
      this.settleFirst = null;
    };
    img.addEventListener(
      'load',
      () => {
        this.loaded.add(id);
        settle(false);
      },
      { signal: ctl.signal },
    );
    img.addEventListener(
      'error',
      () => {
        settle(true);
        // Gone from the page and forgotten, so the next update asks for it again.
        this.drop(id);
      },
      { signal: ctl.signal },
    );
    return img;
  }
}
