import { describe, expect, it, vi } from 'vitest';
import { COLUMNS, GAP, LABEL_H, ROW_H, TILE_H, TILE_W, VISIBLE_ROWS, RosterGrid, topRowFor, type GridTile } from '../src/landing/roster-grid';
import { RANDOM } from '../src/landing/select-flow';

function tile(id: string, name: string, extra: Partial<GridTile> = {}): GridTile {
  return { id, name, accent: '#3dff7a', thumb: null, avatar: null, avatarKind: 'monogram', offline: false, noLink: false, ...extra };
}

function makeTiles(n: number): GridTile[] {
  const out: GridTile[] = [tile(RANDOM, 'RANDOM')];
  for (let i = 0; i < n; i++) out.push(tile(`c${i}`, `Char ${i}`));
  return out;
}

describe('topRowFor', () => {
  it('keeps the cursor row visible with the smallest scroll', () => {
    expect(topRowFor(0, 0, 5)).toBe(0);
    expect(topRowFor(2, 0, 5)).toBe(1);
    expect(topRowFor(4, 1, 5)).toBe(3);
    expect(topRowFor(1, 3, 5)).toBe(1);
    expect(topRowFor(0, 0, 1)).toBe(0);
  });
});

describe('RosterGrid', () => {
  function makeHost() {
    document.body.innerHTML = '<div id="host"></div>';
    return document.getElementById('host')!;
  }

  function makeCb() {
    return { onHover: vi.fn(), onPick: vi.fn(), onWheel: vi.fn() };
  }

  it('renders RANDOM first, then the tiles, with data-id and names', () => {
    const host = makeHost();
    const cb = makeCb();
    const grid = new RosterGrid(host, cb);
    grid.render([tile(RANDOM, 'RANDOM'), tile('aria', 'Aria'), tile('bolt', 'Bolt')]);

    const tiles = grid.el.querySelectorAll('.tile');
    expect(tiles.length).toBe(3);
    expect((tiles[0] as HTMLElement).dataset.id).toBe(RANDOM);
    expect((tiles[1] as HTMLElement).dataset.id).toBe('aria');
    expect((tiles[2] as HTMLElement).dataset.id).toBe('bolt');

    const names = Array.from(tiles).map((t) => t.querySelector('.tile-name')?.textContent);
    expect(names).toEqual(['RANDOM', 'ARIA', 'BOLT']);

    const randomTile = tiles[0] as HTMLElement;
    expect(randomTile.querySelector('.tile-art')).toBeNull();
    expect(randomTile.textContent).toContain('?');

    // geometry: tile 0 at col0/row0, tile 1 at col1/row0 etc.
    const t1 = tiles[1] as HTMLElement;
    expect(t1.style.left).toBe(`${TILE_W + GAP}px`);
    expect(t1.style.top).toBe('0px');
    expect(t1.style.width).toBe(`${TILE_W}px`);
    expect(t1.style.height).toBe(`${TILE_H}px`);
  });

  it('places tiles at the right column/row for COLUMNS and GAP', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());
    const tiles = makeTiles(COLUMNS * 2); // enough for 2 full rows + RANDOM
    grid.render(tiles);
    const els = grid.el.querySelectorAll('.tile');
    const last = els[els.length - 1] as HTMLElement;
    const i = els.length - 1;
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    expect(last.style.left).toBe(`${col * (TILE_W + GAP)}px`);
    expect(last.style.top).toBe(`${row * ROW_H}px`);
  });

  it('tile art falls back thumb -> portrait -> monogram on image error', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());

    // Case 1: thumb present, errors -> falls to mask avatar.
    grid.render([
      tile(RANDOM, 'RANDOM'),
      tile('a', 'Aria', { thumb: '/thumb-a.png', avatar: '/avatar-a.png', avatarKind: 'mask', accent: '#fff' }),
    ]);
    const tileA = grid.el.querySelectorAll('.tile')[1] as HTMLElement;
    const art = tileA.querySelector('img.tile-art') as HTMLImageElement;
    expect(art).not.toBeNull();
    expect(art.getAttribute('src')).toBe('/thumb-a.png');
    art.dispatchEvent(new Event('error'));
    const mask = tileA.querySelector('.tile-mask') as HTMLElement;
    expect(mask).not.toBeNull();
    expect(mask.style.getPropertyValue('--img')).toBe('url("/avatar-a.png")');
    expect(mask.style.getPropertyValue('--a')).toBe('#fff');

    // Case 2: thumb present, no avatar, errors -> monogram.
    grid.render([
      tile(RANDOM, 'RANDOM'),
      tile('b', 'Bolt', { thumb: '/thumb-b.png', avatar: null, avatarKind: 'monogram' }),
    ]);
    const tileB = grid.el.querySelectorAll('.tile')[1] as HTMLElement;
    const thumbB = tileB.querySelector('img.tile-art') as HTMLImageElement;
    expect(thumbB).not.toBeNull();
    thumbB.dispatchEvent(new Event('error'));
    const mono = tileB.querySelector('.tile-mono') as HTMLElement;
    expect(mono).not.toBeNull();
    expect(mono.textContent).toBe('B');

    // Case 3: no thumb, no avatar -> straight to monogram.
    grid.render([tile(RANDOM, 'RANDOM'), tile('c', 'Cora', { thumb: null, avatar: null })]);
    const tileC = grid.el.querySelectorAll('.tile')[1] as HTMLElement;
    expect(tileC.querySelector('.tile-mono')?.textContent).toBe('C');
    expect(tileC.querySelector('.tile-art')).toBeNull();
  });

  it('setCursor positions the cursor on the tile and scrolls its row into view', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());
    const tiles = makeTiles(COLUMNS * 4); // several rows
    grid.render(tiles);

    // Move cursor to a tile in a row beyond VISIBLE_ROWS, with live true: grid scrolls.
    const targetIndex = COLUMNS * 3; // row 3
    grid.setCursor('p1', targetIndex, { live: true, locked: false });

    expect(grid.top).toBeGreaterThan(0);

    const c1 = grid.el.querySelector('.cursor.c1') as HTMLElement;
    expect(c1.classList.contains('hide')).toBe(false);
    expect(c1.classList.contains('live')).toBe(true);
    expect(c1.classList.contains('locked')).toBe(false);

    const targetTile = grid.el.querySelectorAll('.tile')[targetIndex] as HTMLElement;
    expect(c1.style.left).toBe(targetTile.style.left);
    expect(c1.style.top).toBe(targetTile.style.top);
    expect(c1.style.width).toBe(targetTile.style.width);
    expect(c1.style.height).toBe(targetTile.style.height);

    expect(targetTile.classList.contains('hot')).toBe(true);

    // Lock it: tile gets locked-p1, cursor gets locked class.
    grid.setCursor('p1', targetIndex, { live: false, locked: true });
    expect(c1.classList.contains('locked')).toBe(true);
    expect(targetTile.classList.contains('locked-p1')).toBe(true);

    // Hide it.
    grid.setCursor('p1', null, { live: false, locked: false });
    expect(c1.classList.contains('hide')).toBe(true);
  });

  it('more-above / more-below reflect hidden rows', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());
    const tiles = makeTiles(COLUMNS * 4);
    grid.render(tiles);

    expect(grid.el.classList.contains('more-above')).toBe(false);
    expect(grid.el.classList.contains('more-below')).toBe(true);

    grid.scrollTo(1);
    expect(grid.el.classList.contains('more-above')).toBe(true);
    expect(grid.el.classList.contains('more-below')).toBe(true);

    const maxTop = Math.ceil(tiles.length / COLUMNS) - VISIBLE_ROWS;
    grid.scrollTo(maxTop);
    expect(grid.el.classList.contains('more-below')).toBe(false);
    expect(grid.el.classList.contains('more-above')).toBe(true);
  });

  it('scrollTo clamps; a roster of two rows or fewer never scrolls (wheel does nothing)', () => {
    const host = makeHost();
    const cb = makeCb();
    const grid = new RosterGrid(host, cb);
    const tiles = makeTiles(COLUMNS * 2 - 1); // RANDOM + 2*COLUMNS-1 = exactly 2 rows
    grid.render(tiles);

    grid.scrollTo(5);
    expect(grid.top).toBe(0);
    grid.scrollTo(-5);
    expect(grid.top).toBe(0);

    expect(grid.el.classList.contains('more-above')).toBe(false);
    expect(grid.el.classList.contains('more-below')).toBe(false);

    // A larger roster clamps to rows - VISIBLE_ROWS.
    const host2 = makeHost();
    const grid2 = new RosterGrid(host2, makeCb());
    const tiles2 = makeTiles(COLUMNS * 4);
    grid2.render(tiles2);
    const rows = Math.ceil(tiles2.length / COLUMNS);
    grid2.scrollTo(999);
    expect(grid2.top).toBe(rows - VISIBLE_ROWS);
  });

  it('hover and click call onHover / onPick with the tile index; wheel calls onWheel(±1)', () => {
    const host = makeHost();
    const cb = makeCb();
    const grid = new RosterGrid(host, cb);
    const tiles = makeTiles(COLUMNS * 4);
    grid.render(tiles);

    const els = grid.el.querySelectorAll('.tile');
    els[2].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(cb.onHover).toHaveBeenCalledWith(2);

    els[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cb.onPick).toHaveBeenCalledWith(3);

    const gridEl = host.querySelector('.grid') as HTMLElement;
    const wheelDown = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });
    gridEl.dispatchEvent(wheelDown);
    expect(cb.onWheel).toHaveBeenCalledWith(1);
    expect(wheelDown.defaultPrevented).toBe(true);

    const wheelUp = new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true });
    gridEl.dispatchEvent(wheelUp);
    expect(cb.onWheel).toHaveBeenCalledWith(-1);
  });

  it('render() can be called again and keeps the cursor elements', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());
    grid.render(makeTiles(COLUMNS));
    const c1Before = grid.el.querySelector('.cursor.c1');
    const c2Before = grid.el.querySelector('.cursor.c2');
    grid.render(makeTiles(COLUMNS * 2));
    const c1After = grid.el.querySelector('.cursor.c1');
    const c2After = grid.el.querySelector('.cursor.c2');
    expect(c1After).toBe(c1Before);
    expect(c2After).toBe(c2Before);
    expect(grid.el.querySelectorAll('.tile').length).toBe(COLUMNS * 2 + 1);
  });

  it('setOffline toggles the offline class in place', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());
    grid.render([
      tile(RANDOM, 'RANDOM'),
      tile('a', 'Alice', { offline: true }),
      tile('b', 'Bob', { offline: false }),
    ]);

    const tiles = grid.el.querySelectorAll('.tile');
    const tileA = tiles[1] as HTMLElement;
    const tileB = tiles[2] as HTMLElement;

    // Keep references to the element objects to verify no re-render
    const tileARef = tileA;
    const tileBRef = tileB;

    expect(tileA.classList.contains('offline')).toBe(true);
    expect(tileB.classList.contains('offline')).toBe(false);

    // setOffline to set b offline and a online
    grid.setOffline(new Set(['b']));

    expect(tileARef.classList.contains('offline')).toBe(false);
    expect(tileBRef.classList.contains('offline')).toBe(true);

    // Verify same element objects (no re-render)
    const tilesAfter = grid.el.querySelectorAll('.tile');
    expect(tilesAfter[1]).toBe(tileARef);
    expect(tilesAfter[2]).toBe(tileBRef);
  });

  it('a no-link tile carries the NO LINK chip and is not dimmed as offline', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());
    grid.render([tile(RANDOM, 'RANDOM'), tile('nix', 'Nix', { noLink: true }), tile('cass', 'Cass')]);
    const [, nix, cass] = [...grid.el.querySelectorAll<HTMLElement>('.tile')];
    expect(nix!.querySelector('.tile-chip')!.textContent).toBe('NO LINK');
    expect(nix!.classList.contains('offline')).toBe(false);
    expect(cass!.querySelector('.tile-chip')).toBeNull();
  });

  it('setNoLink adds and removes the chip in place', () => {
    const host = makeHost();
    const grid = new RosterGrid(host, makeCb());
    grid.render([tile(RANDOM, 'RANDOM'), tile('nix', 'Nix', { noLink: true }), tile('cass', 'Cass')]);
    grid.setNoLink(new Set(['cass']));
    const [, nix, cass] = [...grid.el.querySelectorAll<HTMLElement>('.tile')];
    expect(nix!.querySelector('.tile-chip')).toBeNull();
    expect(cass!.querySelector('.tile-chip')!.textContent).toBe('NO LINK');
  });
});

describe('RosterGrid: grouped by district (spec 2026-10-25)', () => {
  const host = () => {
    document.body.innerHTML = '<div id="host"></div>';
    return document.getElementById('host')!;
  };
  const cb = () => ({ onHover: vi.fn(), onPick: vi.fn(), onWheel: vi.fn() });
  // RANDOM + karasu (a, b) on row 0, spine (c, d, e) on row 1 — as district-groups would lay them out.
  const tiles = [tile(RANDOM, 'RANDOM'), tile('a', 'A'), tile('b', 'B'), tile('c', 'C'), tile('d', 'D'), tile('e', 'E')];
  const layout = {
    pos: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }],
    rows: 2,
    labels: [{ group: 'karasu', col: 1, row: 0, span: 2 }, { group: 'spine', col: 0, row: 1, span: 3 }],
  };
  const names = (g: string) => ({ karasu: 'Karasu', spine: 'The Spine' })[g] ?? null;

  it('places tiles from the layout, under a label row', () => {
    const g = new RosterGrid(host(), cb());
    g.render(tiles, { layout, groupName: names });
    const el = (id: string) => g.el.querySelector(`.tile[data-id="${id}"]`) as HTMLElement;
    expect(el('a').style.left).toBe(`${TILE_W + GAP}px`);
    expect(el('a').style.top).toBe(`${LABEL_H}px`);
    expect(el('c').style.left).toBe('0px');
    expect(el('c').style.top).toBe(`${ROW_H + LABEL_H + LABEL_H}px`);
  });

  it('draws a label over each group, as wide as its run, with the district name', () => {
    const g = new RosterGrid(host(), cb());
    g.render(tiles, { layout, groupName: names });
    const labels = [...g.el.querySelectorAll('.tile-group')] as HTMLElement[];
    expect(labels.map((l) => l.textContent)).toEqual(['KARASU', 'THE SPINE']);
    expect(labels[0].style.left).toBe(`${TILE_W + GAP}px`);
    expect(labels[0].style.width).toBe(`${2 * (TILE_W + GAP) - GAP}px`);
    expect(labels[1].style.top).toBe(`${ROW_H + LABEL_H}px`);
    expect(labels.map((l) => l.dataset.group)).toEqual(['karasu', 'spine']);
  });

  it('a group name that arrives later fills its label; unknown stays blank', () => {
    const g = new RosterGrid(host(), cb());
    g.render(tiles, { layout });
    expect([...g.el.querySelectorAll('.tile-group')].map((l) => l.textContent)).toEqual(['', '']);
    g.setGroupNames((gr) => (gr === 'spine' ? 'The Spine' : null));
    expect([...g.el.querySelectorAll('.tile-group')].map((l) => l.textContent)).toEqual(['', 'THE SPINE']);
  });

  it('the cursor sits on the tile and the grid is tall enough for both labelled rows', () => {
    const g = new RosterGrid(host(), cb());
    g.render(tiles, { layout, groupName: names });
    g.setCursor('p1', 4, { live: true, locked: false });
    const c1 = g.el.querySelector('.cursor.c1') as HTMLElement;
    const d = g.el.querySelector('.tile[data-id="d"]') as HTMLElement;
    expect([c1.style.left, c1.style.top]).toEqual([d.style.left, d.style.top]);
    expect(g.el.style.height).toBe(`${VISIBLE_ROWS * (ROW_H + LABEL_H) - GAP}px`);
    expect(g.top).toBe(0);
  });

  it('scrolls by layout rows', () => {
    const many = { pos: [0, 1, 2, 3].map((row) => ({ col: 0, row })), rows: 4, labels: [] as typeof layout.labels };
    const g = new RosterGrid(host(), cb());
    g.render([0, 1, 2, 3].map((i) => tile(`t${i}`, `T${i}`)), { layout: many });
    g.setCursor('p1', 3, { live: true, locked: false });
    expect(g.top).toBe(2);
  });
});
