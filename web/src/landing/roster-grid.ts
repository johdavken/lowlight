/** The roster grid: a scrolling window of character tiles with two player cursors. View only — see spec §5. */
import { COPY } from './copy';
import { labelText, RANDOM, type Layout } from './district-groups';

export const COLUMNS = 6;
export const VISIBLE_ROWS = 2;
export const TILE_W = 104;
export const TILE_H = 120;
export const GAP = 8;
export const ROW_H = TILE_H + GAP;
/** The group label's band above each row, when the roster is grouped (spec 2026-10-25). */
export const LABEL_H = 26;

export interface GridTile {
  id: string;
  name: string;
  accent: string;
  thumb: string | null;
  avatar: string | null;
  avatarKind: 'face' | 'mask' | 'monogram';
  offline: boolean;
  /** A direct contact with no key linked: lit and pickable, tagged NO LINK. */
  noLink: boolean;
}

/** Smallest change to `top` that keeps `cursorRow` within `[top, top + visible)`, clamped to the roster's rows. */
export function topRowFor(cursorRow: number, top: number, rows: number, visible: number = VISIBLE_ROWS): number {
  const maxTop = Math.max(0, rows - visible);
  let next = top;
  if (cursorRow < next) next = cursorRow;
  else if (cursorRow >= next + visible) next = cursorRow - visible + 1;
  return Math.max(0, Math.min(maxTop, next));
}

interface Cb {
  onHover(i: number): void;
  onPick(i: number): void;
  onWheel(rows: number): void;
}

interface CursorState {
  index: number | null;
  live: boolean;
  locked: boolean;
}

function buildArt(tile: GridTile): HTMLElement {
  if (tile.thumb) {
    const img = document.createElement('img');
    img.className = 'tile-art';
    img.src = tile.thumb;
    img.addEventListener('error', () => {
      img.replaceWith(buildPortraitOrMono(tile));
    });
    return img;
  }
  return buildPortraitOrMono(tile);
}

function buildMono(tile: GridTile): HTMLElement {
  const mono = document.createElement('div');
  mono.className = 'tile-mono';
  mono.textContent = tile.name.charAt(0).toUpperCase();
  return mono;
}

function buildPortraitOrMono(tile: GridTile): HTMLElement {
  if (!tile.avatar || tile.avatarKind !== 'mask') return buildMono(tile);
  const mask = document.createElement('div');
  mask.className = 'tile-mask';
  mask.style.setProperty('--img', `url("${tile.avatar}")`);
  mask.style.setProperty('--a', tile.accent);
  return mask;
}

function buildChip(): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'tile-chip';
  chip.textContent = COPY.link.tileTag;
  return chip;
}

function buildTileEl(tile: GridTile, index: number, at: { left: number; top: number }, cb: Cb): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = tile.id;
  if (tile.offline) el.classList.add('offline');

  el.style.position = 'absolute';
  el.style.left = `${at.left}px`;
  el.style.top = `${at.top}px`;
  el.style.width = `${TILE_W}px`;
  el.style.height = `${TILE_H}px`;

  if (tile.id === RANDOM) {
    const glyph = document.createElement('div');
    glyph.className = 'tile-random';
    glyph.textContent = '?';
    glyph.title = COPY.random;
    glyph.setAttribute('aria-label', COPY.random);
    el.append(glyph);
  } else {
    el.append(buildArt(tile));
  }

  if (tile.noLink) el.append(buildChip());

  const name = document.createElement('div');
  name.className = 'tile-name';
  name.textContent = tile.name.toUpperCase();
  el.append(name);

  el.addEventListener('mouseenter', () => cb.onHover(index));
  el.addEventListener('click', () => cb.onPick(index));

  return el;
}

function buildCursorEl(which: 'p1' | 'p2'): HTMLElement {
  const el = document.createElement('div');
  el.className = `cursor c${which === 'p1' ? '1' : '2'} hide`;
  el.style.position = 'absolute';
  return el;
}

export class RosterGrid {
  readonly el: HTMLElement;
  private readonly track: HTMLElement;
  private readonly c1: HTMLElement;
  private readonly c2: HTMLElement;
  private readonly cb: Cb;
  private tiles: GridTile[] = [];
  private layout: Layout = { pos: [], rows: 0, labels: [] };
  private groupName: (group: string) => string | null = () => null;
  private _top = 0;
  private cursors: { p1: CursorState; p2: CursorState } = {
    p1: { index: null, live: false, locked: false },
    p2: { index: null, live: false, locked: false },
  };

  constructor(host: HTMLElement, cb: Cb) {
    this.cb = cb;
    this.el = document.createElement('div');
    this.el.className = 'grid';
    this.el.style.position = 'relative';
    this.el.style.overflow = 'hidden';
    this.el.style.height = `${VISIBLE_ROWS * TILE_H + (VISIBLE_ROWS - 1) * GAP}px`;
    this.el.style.width = `${COLUMNS * TILE_W + (COLUMNS - 1) * GAP}px`;

    this.track = document.createElement('div');
    this.track.className = 'track';
    this.track.style.position = 'relative';
    this.el.append(this.track);

    this.c1 = buildCursorEl('p1');
    this.c2 = buildCursorEl('p2');
    this.track.append(this.c1, this.c2);

    this.el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.cb.onWheel(Math.sign(e.deltaY));
      },
      { passive: false },
    );

    host.append(this.el);
  }

  get top(): number {
    return this._top;
  }

  private rows(): number {
    return this.layout.rows;
  }

  /** One row's height: taller by the label band when the roster is grouped. */
  private pitch(): number {
    return this.layout.labels.length > 0 ? ROW_H + LABEL_H : ROW_H;
  }

  private tileEls(): HTMLElement[] {
    return Array.from(this.track.querySelectorAll('.tile'));
  }

  /**
   * Draws `tiles` where `layout` puts them (district-groups), with a label over each group named by
   * `groupName`; without a layout, rows of COLUMNS in order.
   */
  render(tiles: GridTile[], o: { layout?: Layout; groupName?: (group: string) => string | null } = {}): void {
    this.tiles = tiles;
    this.layout = o.layout ?? { pos: tiles.map((_, i) => ({ col: i % COLUMNS, row: Math.floor(i / COLUMNS) })), rows: Math.ceil(tiles.length / COLUMNS), labels: [] };
    if (o.groupName) this.groupName = o.groupName;
    for (const el of this.tileEls()) el.remove();
    for (const el of this.track.querySelectorAll('.tile-group')) el.remove();
    const band = this.layout.labels.length > 0 ? LABEL_H : 0;
    tiles.forEach((tile, i) => {
      const p = this.layout.pos[i] ?? { col: i % COLUMNS, row: Math.floor(i / COLUMNS) };
      this.track.append(buildTileEl(tile, i, { left: p.col * (TILE_W + GAP), top: p.row * this.pitch() + band }, this.cb));
    });
    for (const l of this.layout.labels) {
      const el = document.createElement('div');
      el.className = 'tile-group';
      el.dataset.group = l.group;
      el.dataset.span = String(l.span);
      el.style.position = 'absolute';
      el.style.left = `${l.col * (TILE_W + GAP)}px`;
      el.style.top = `${l.row * this.pitch()}px`;
      el.style.width = `${l.span * (TILE_W + GAP) - GAP}px`;
      this.track.append(el);
    }
    this.paintLabels();
    this.el.style.height = `${VISIBLE_ROWS * this.pitch() - GAP}px`;
    this._top = 0;
    this.applyTransform();
    this.refreshEdges();
    this.refreshCursor('p1');
    this.refreshCursor('p2');
  }

  private applyTransform(): void {
    this.track.style.transform = `translateY(-${this._top * this.pitch()}px)`;
  }

  /** The district names for the labels, when they arrive (or change). */
  setGroupNames(groupName: (group: string) => string | null): void {
    this.groupName = groupName;
    this.paintLabels();
  }

  private paintLabels(): void {
    for (const el of this.track.querySelectorAll<HTMLElement>('.tile-group')) {
      const name = this.groupName(el.dataset.group ?? '');
      el.textContent = name ? labelText(name, Number(el.dataset.span)) : '';
    }
  }

  private refreshEdges(): void {
    const maxTop = Math.max(0, this.rows() - VISIBLE_ROWS);
    this.el.classList.toggle('more-above', this._top > 0);
    this.el.classList.toggle('more-below', this._top < maxTop);
  }

  scrollTo(top: number): void {
    const maxTop = Math.max(0, this.rows() - VISIBLE_ROWS);
    this._top = Math.max(0, Math.min(maxTop, top));
    this.applyTransform();
    this.refreshEdges();
  }

  setCursor(which: 'p1' | 'p2', index: number | null, s: { live: boolean; locked: boolean }): void {
    this.cursors[which] = { index, live: s.live, locked: s.locked };
    if (index !== null && s.live) {
      const row = this.layout.pos[index]?.row ?? Math.floor(index / COLUMNS);
      this.scrollTo(topRowFor(row, this._top, this.rows()));
    }
    this.refreshCursor('p1');
    this.refreshCursor('p2');
    this.refreshHotAndLocked();
  }

  private refreshCursor(which: 'p1' | 'p2'): void {
    const el = which === 'p1' ? this.c1 : this.c2;
    const state = this.cursors[which];
    const els = this.tileEls();
    if (state.index === null || !els[state.index]) {
      el.classList.add('hide');
      return;
    }
    el.classList.remove('hide');
    el.classList.toggle('live', state.live);
    el.classList.toggle('locked', state.locked);
    const tileEl = els[state.index];
    el.style.left = tileEl.style.left;
    el.style.top = tileEl.style.top;
    el.style.width = tileEl.style.width;
    el.style.height = tileEl.style.height;
  }

  private refreshHotAndLocked(): void {
    const els = this.tileEls();
    els.forEach((el) => {
      el.classList.remove('hot', 'locked-p1', 'locked-p2');
    });
    for (const which of ['p1', 'p2'] as const) {
      const state = this.cursors[which];
      if (state.index === null) continue;
      const tileEl = els[state.index];
      if (!tileEl) continue;
      if (state.live) tileEl.classList.add('hot');
      if (state.locked) tileEl.classList.add(`locked-${which}`);
    }
  }

  /** Adds or removes the NO LINK chip in place (after a link, an unlink, or a poll). */
  setNoLink(noLink: ReadonlySet<string>): void {
    for (const el of this.tileEls()) {
      const id = el.dataset.id;
      if (id === undefined) continue;
      const chip = el.querySelector('.tile-chip');
      if (noLink.has(id) && !chip) el.insertBefore(buildChip(), el.querySelector('.tile-name'));
      else if (!noLink.has(id)) chip?.remove();
    }
  }

  setOffline(offline: ReadonlySet<string>): void {
    const els = this.tileEls();
    for (const el of els) {
      const id = el.dataset.id;
      if (id === undefined) continue;
      const isOffline = offline.has(id);
      el.classList.toggle('offline', isOffline);
    }
  }
}
