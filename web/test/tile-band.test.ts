import { describe, expect, it, vi } from 'vitest';
import { BAND_GAP, TileBand, type BandTile } from '../src/landing/tile-band';

const W = 112;
const H = 124;
const STEP = W + BAND_GAP;

function host() {
  document.body.innerHTML = '<div id="host"></div>';
  return document.getElementById('host')!;
}
function band(o: { visible?: number; reducedMotion?: boolean } = {}) {
  const onPick = vi.fn();
  const b = new TileBand(host(), { reducedMotion: o.reducedMotion ?? false, visible: o.visible ?? 8, tileW: W, tileH: H, onPick });
  return { b, onPick };
}
const rooms = (n: number): BandTile[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `${i}m`, art: { kind: 'room', src: `/scenes/r${i}/room.png` } }));
const tiles = (b: TileBand) => [...b.el.querySelectorAll<HTMLElement>('.tile')];
const cursor = (b: TileBand) => b.el.querySelector<HTMLElement>('.cursor')!;
const track = (b: TileBand) => b.el.querySelector<HTMLElement>('.band-track')!;

describe('TileBand', () => {
  it('renders one .tile per BandTile with data-id, .tile-name and the art kind', () => {
    const { b } = band();
    b.setTiles(
      [
        { id: 'room', name: 'r', art: { kind: 'room', src: '/scenes/a/room.png' }, tag: { text: '▶ NOW', now: true } },
        { id: 'face', name: 'f', art: { kind: 'face', src: '/face.png' } },
        { id: 'mosaic', name: 'm', art: { kind: 'mosaic', srcs: ['/a.png', '/b.png', '/c.png', '/d.png'] } },
        { id: 'mark', name: 'new game', art: { kind: 'mark', text: '?' } },
      ],
      0,
    );
    const t = tiles(b);
    expect(t.map((x) => x.dataset.id)).toEqual(['room', 'face', 'mosaic', 'mark']);
    expect(t[3]!.querySelector('.tile-name')!.textContent).toBe('NEW GAME');
    expect(t[0]!.querySelector<HTMLImageElement>('img.tile-art')!.getAttribute('src')).toBe('/scenes/a/room.png');
    expect(t[0]!.querySelector('.band-tag.now')!.textContent).toBe('▶ NOW');
    expect(t[1]!.querySelector<HTMLElement>('.tile-face')!.style.backgroundImage).toContain('/face.png');
    expect(t[2]!.querySelectorAll('.tile-mosaic i')).toHaveLength(4);
    expect(t[3]!.querySelector('.tile-mark')!.textContent).toBe('?');
  });

  it('the cursor sits on the focused tile and .on moves with move()', () => {
    const { b } = band();
    b.setTiles(rooms(4), 0);
    b.move(2);
    expect(b.index).toBe(2);
    expect(tiles(b).map((t) => t.classList.contains('on'))).toEqual([false, false, true, false]);
    expect(cursor(b).style.left).toBe(`${2 * STEP}px`);
    expect(cursor(b).querySelector('.lbl')!.textContent).toBe('1P');
  });

  it('move clamps and never wraps', () => {
    const { b } = band();
    b.setTiles(rooms(3), 1);
    b.move(-1);
    expect(b.index).toBe(0);
    b.move(9);
    expect(b.index).toBe(2);
  });

  it('scroll window: 20 tiles, 8 visible', () => {
    const { b } = band({ visible: 8 });
    b.setTiles(rooms(20), 0);
    expect(track(b).style.transform).toBe('translateX(0px)');
    expect(b.el.classList.contains('more-left')).toBe(false);
    expect(b.el.classList.contains('more-right')).toBe(true);
    b.move(12);
    expect(track(b).style.transform).toBe(`translateX(${-(12 - 7) * STEP}px)`);
    expect(b.el.classList.contains('more-left')).toBe(true);
    b.move(19);
    expect(b.el.classList.contains('more-right')).toBe(false);
    b.move(0);
    expect(track(b).style.transform).toBe('translateX(0px)');
  });

  it('the band is as wide as its visible tiles', () => {
    const { b } = band({ visible: 3 });
    b.setTiles(rooms(2), 0);
    expect(b.el.style.width).toBe(`${2 * W + BAND_GAP}px`);
    b.setTiles(rooms(5), 0);
    expect(b.el.style.width).toBe(`${3 * W + 2 * BAND_GAP}px`);
  });

  it('an image that fails to load becomes the mark (no broken image)', () => {
    const { b } = band();
    b.setTiles([{ id: 'x', name: 'x', art: { kind: 'room', src: '/missing.png' } }], 0);
    tiles(b)[0]!.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(tiles(b)[0]!.querySelector('img')).toBeNull();
    expect(tiles(b)[0]!.querySelector('.tile-mark')!.textContent).toBe('?');
  });

  it('the mouse entering a tile calls onHover(i), when given', () => {
    const onHover = vi.fn();
    const b = new TileBand(host(), { reducedMotion: false, visible: 8, tileW: W, tileH: H, onPick: vi.fn(), onHover });
    b.setTiles(rooms(3), 0);
    tiles(b)[1]!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(onHover).toHaveBeenCalledWith(1);
  });

  it('a click on a tile calls onPick(i)', () => {
    const { b, onPick } = band();
    b.setTiles(rooms(3), 0);
    tiles(b)[2]!.click();
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it('setTiles with glitch adds .glitch-in to each tile, staggered 40 ms; reduced motion adds none', () => {
    const { b } = band();
    b.setTiles(rooms(3), 0, { glitch: true });
    expect(tiles(b).every((t) => t.classList.contains('glitch-in'))).toBe(true);
    expect(tiles(b).map((t) => t.style.animationDelay)).toEqual(['0ms', '40ms', '80ms']);
    const still = band({ reducedMotion: true }).b;
    still.setTiles(rooms(3), 0, { glitch: true });
    expect(tiles(still).some((t) => t.classList.contains('glitch-in'))).toBe(false);
  });

  it('setLive(false) removes .live from the cursor', () => {
    const { b } = band();
    b.setTiles(rooms(2), 0);
    expect(cursor(b).classList.contains('live')).toBe(true);
    b.setLive(false);
    expect(cursor(b).classList.contains('live')).toBe(false);
  });
});
