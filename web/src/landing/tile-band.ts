/**
 * The title's and LOAD's tile band (spec 2026-10-09 front-end restyle §3, §4): select's skewed
 * tiles in one row, with the 1P cursor and a sideways scroll window. View only.
 */
import { topRowFor } from './roster-grid';
import './band.css';

export const BAND_GAP = 6;
/** Each tile glitches in this long after the one before it. */
const STAGGER_MS = 40;

export interface BandTile {
  id: string;
  name: string;
  art: { kind: 'face' | 'room'; src: string } | { kind: 'mosaic'; srcs: string[] } | { kind: 'mark'; text: string };
  /** The corner tag (▶ NOW green, the save icons amber). */
  tag?: { text: string; now?: boolean };
}

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function buildArt(art: BandTile['art']): HTMLElement {
  if (art.kind === 'mark') return el('div', 'tile-mark', art.text);
  if (art.kind === 'mosaic') {
    const grid = el('div', 'tile-mosaic');
    for (const src of art.srcs.slice(0, 4)) {
      const i = el('i', '');
      i.style.backgroundImage = `url("${src}")`;
      grid.append(i);
    }
    return grid;
  }
  if (art.kind === 'face') {
    const face = el('div', 'tile-face');
    face.style.backgroundImage = `url("${art.src}")`;
    return face;
  }
  const img = el('img', 'tile-art') as HTMLImageElement;
  img.alt = '';
  // An image that won't load becomes the mark: never a broken image on the band.
  img.addEventListener('error', () => img.replaceWith(el('div', 'tile-mark', '?')), { once: true });
  img.src = art.src;
  return img;
}

export class TileBand {
  readonly el: HTMLElement;
  private readonly track: HTMLElement;
  private readonly cursor: HTMLElement;
  private readonly o: { reducedMotion: boolean; visible: number; tileW: number; tileH: number; onPick(i: number): void; onHover?(i: number): void };
  private els: HTMLElement[] = [];
  private at = 0;
  /** The first visible tile. */
  private start = 0;

  constructor(host: HTMLElement, o: { reducedMotion: boolean; visible: number; tileW: number; tileH: number; onPick(i: number): void; onHover?(i: number): void }) {
    this.o = o;
    this.el = el('div', 'band');
    this.el.style.height = `${o.tileH}px`;
    this.track = el('div', 'band-track');
    this.cursor = el('div', 'cursor c1 live');
    this.cursor.append(el('span', 'lbl', '1P'));
    this.cursor.style.width = `${o.tileW}px`;
    this.cursor.style.height = `${o.tileH}px`;
    this.track.append(this.cursor);
    this.el.append(this.track);
    host.append(this.el);
  }

  get index(): number {
    return this.at;
  }

  private get step(): number {
    return this.o.tileW + BAND_GAP;
  }

  setTiles(tiles: BandTile[], at: number, opts: { glitch?: boolean } = {}): void {
    for (const t of this.els) t.remove();
    this.els = tiles.map((tile, i) => {
      const t = el('div', 'tile band-tile');
      t.dataset.id = tile.id;
      t.style.left = `${i * this.step}px`;
      t.style.width = `${this.o.tileW}px`;
      t.style.height = `${this.o.tileH}px`;
      t.append(buildArt(tile.art));
      if (tile.tag) t.append(el('span', `band-tag${tile.tag.now ? ' now' : ''}`, tile.tag.text));
      t.append(el('div', 'tile-name', tile.name.toUpperCase()));
      t.addEventListener('click', () => this.o.onPick(i));
      if (this.o.onHover) t.addEventListener('mouseenter', () => this.o.onHover!(i));
      if (opts.glitch && !this.o.reducedMotion) {
        t.style.animationDelay = `${i * STAGGER_MS}ms`;
        t.classList.add('glitch-in');
      }
      this.track.insertBefore(t, this.cursor);
      return t;
    });
    const shown = Math.min(this.o.visible, tiles.length);
    this.el.style.width = `${Math.max(0, shown * this.step - BAND_GAP)}px`;
    this.cursor.hidden = tiles.length === 0;
    this.start = 0;
    this.move(at);
  }

  /** Focuses tile `at`, clamped to the band (no wrap), scrolling it into the window. */
  move(at: number): void {
    const n = this.els.length;
    this.at = Math.max(0, Math.min(n - 1, at));
    if (n === 0) return;
    this.els.forEach((t, i) => t.classList.toggle('on', i === this.at));
    this.cursor.style.left = `${this.at * this.step}px`;
    this.start = topRowFor(this.at, this.start, n, this.o.visible);
    this.track.style.transform = `translateX(${-this.start * this.step}px)`;
    this.el.classList.toggle('more-left', this.start > 0);
    this.el.classList.toggle('more-right', this.start + this.o.visible < n);
  }

  setLive(live: boolean): void {
    this.cursor.classList.toggle('live', live);
  }
}
