import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardView, project } from '../src/ui/gig/board-view';
import { generate } from '../../shared/gig/generate';
import { act, neighbours, startRun, type Board, type RunState } from '../../shared/gig/rules';

let host: HTMLElement;
let view: BoardView;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  view?.destroy();
  host.remove();
});

const board = generate('medium', 7);
const nodes = () => [...host.querySelectorAll<SVGGElement>('g.gig-node')];
const nodeEl = (id: number) => host.querySelector<SVGGElement>(`g.gig-node[data-id="${id}"]`)!;

function mount(state: RunState = startRun(board), opts: { reveal?: boolean; reducedMotion?: boolean } = {}) {
  const onSelect = vi.fn();
  view = new BoardView(host, { onSelect, reducedMotion: opts.reducedMotion ?? false, reveal: opts.reveal });
  view.render(state, null);
  return onSelect;
}

describe('BoardView', () => {
  it('draws every node and link', () => {
    mount();
    expect(nodes()).toHaveLength(board.nodes.length);
    expect(host.querySelectorAll('path.gig-link')).toHaveLength(board.links.length);
  });

  it('ENTRY is yours, its neighbours in reach, the rest far', () => {
    mount();
    const near = new Set(neighbours(board, board.entry));
    for (const n of board.nodes) {
      const cls = nodeEl(n.id).classList;
      const want = n.id === board.entry ? 'gig-held' : near.has(n.id) ? 'gig-reach' : 'gig-far';
      expect(cls.contains(want)).toBe(true);
    }
    const live = host.querySelectorAll('path.gig-link.gig-live');
    expect(live).toHaveLength(0);
    expect(host.querySelectorAll('path.gig-link.gig-reachable')).toHaveLength(near.size);
  });

  it('hidden types are fog; visible ones carry their type', () => {
    mount();
    for (const n of board.nodes) {
      const cls = nodeEl(n.id).classList;
      const shown = ['ENTRY', 'TARGET', 'ICE2', 'ICE3', 'SENTRY'].includes(n.type);
      expect(cls.contains('gig-fog')).toBe(!shown);
      if (shown) expect(cls.contains(`gig-t-${n.type.toLowerCase()}`)).toBe(true);
    }
  });

  it('a sentry next to your territory is watching; links you hold flow', () => {
    // Walk toward the sentry: take nodes until one of yours touches it.
    const sentry = board.nodes.find((n) => n.type === 'SENTRY')!;
    let s = startRun(board, 99);
    const path = (() => {
      const prev = new Map<number, number>([[board.entry, -1]]);
      const q = [board.entry];
      while (q.length) {
        const id = q.shift()!;
        for (const m of neighbours(board, id)) if (!prev.has(m)) (prev.set(m, id), q.push(m));
      }
      const out: number[] = [];
      for (let id = prev.get(sentry.id)!; id !== board.entry; id = prev.get(id)!) out.unshift(id);
      return out;
    })();
    for (const id of path) {
      const r = act({ ...s, trace: 0 }, { kind: 'enter', node: id });
      if (!r.ok) throw new Error(r.why);
      s = r.state;
    }
    mount(s);
    expect(nodeEl(sentry.id).classList.contains('gig-watch')).toBe(true);
    if (path.length) {
      expect(host.querySelectorAll('path.gig-link.gig-live').length).toBeGreaterThan(0);
      expect(host.querySelectorAll('path.gig-flow').length).toBe(host.querySelectorAll('path.gig-link.gig-live').length);
    }
  });

  it('exactly the sentries the rules count are watching, each gaze on a node of yours; a taken sentry stops (review I1)', () => {
    const watchingIds = (b: Board, s: RunState) =>
      b.nodes.filter((n) => n.type === 'SENTRY' && !s.held.has(n.id) && neighbours(b, n.id).some((m) => s.held.has(m))).map((n) => n.id);
    const gazes = (b: Board, s: RunState) => watchingIds(b, s).reduce((sum, id) => sum + neighbours(b, id).filter((m) => s.held.has(m)).length, 0);
    const hard = generate('hard', 21);
    let s = startRun(hard, 99);
    const check = () => {
      view?.destroy();
      mount(s);
      const marked = [...host.querySelectorAll('g.gig-node.gig-watch')].map((g) => Number(g.getAttribute('data-id'))).sort((a, b) => a - b);
      expect(marked).toEqual(watchingIds(hard, s).sort((a, b) => a - b));
      expect(host.querySelectorAll('.gig-gaze')).toHaveLength(gazes(hard, s));
    };
    check();
    // Take nodes breadth-first from ENTRY until a sentry is watching, then take that sentry too.
    for (let guard = 0; guard < 20 && watchingIds(hard, s).length === 0; guard++) {
      const next = hard.nodes.find((n) => !s.held.has(n.id) && n.type !== 'SENTRY' && neighbours(hard, n.id).some((m) => s.held.has(m)))!;
      const r = act({ ...s, trace: 0 }, { kind: 'enter', node: next.id });
      if (!r.ok) throw new Error(r.why);
      s = r.state;
    }
    check();
    const sentry = watchingIds(hard, s)[0];
    expect(sentry).toBeDefined();
    const r = act({ ...s, trace: 0 }, { kind: 'enter', node: sentry });
    if (!r.ok) throw new Error(r.why);
    s = r.state;
    check();
    expect(nodeEl(sentry).classList.contains('gig-watch')).toBe(false);
  });

  it('a click on a block face, the floor tile or a fog mark selects its node; the background selects nothing (review I2)', () => {
    const onSelect = mount();
    const fog = board.nodes.find((n) => !['ENTRY', 'TARGET', 'ICE2', 'ICE3', 'SENTRY'].includes(n.type))!;
    nodeEl(board.target).querySelector('.gig-top')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    nodeEl(board.entry).querySelector('.gig-hit')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    nodeEl(fog.id).querySelector('text')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    host.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([board.target, board.entry, fog.id]);
  });

  it('reveal shows every type', () => {
    mount(startRun(board), { reveal: true });
    expect(host.querySelector('.gig-fog')).toBeNull();
  });

  it('a click selects the node; the selected one is marked', () => {
    const onSelect = mount();
    nodeEl(board.target).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith(board.target);
    view.render(startRun(board), board.target);
    expect(nodeEl(board.target).classList.contains('gig-sel')).toBe(true);
  });

  it('the trap glyph is a text cross, never the emoji one', () => {
    mount(startRun(board), { reveal: true });
    const trap = board.nodes.find((n) => n.type === 'TRAP')!;
    expect(host.querySelector(`.gig-labels text[data-for="${trap.id}"]`)!.textContent).toContain('✕');
    expect(host.innerHTML).not.toContain('✖');
  });

  it('labels sit in one layer over every block, so a nearer block never hides one', () => {
    mount();
    const layer = host.querySelector('.gig-labels')!;
    expect(layer.previousElementSibling?.classList.contains('gig-node')).toBe(true);
    expect(layer.nextElementSibling).toBeNull();
    const shown = board.nodes.filter((n) => ['ENTRY', 'TARGET', 'ICE2', 'ICE3', 'SENTRY'].includes(n.type));
    expect(layer.querySelectorAll('text')).toHaveLength(shown.length);
  });

  it('motion is on unless reduced; the CRT layers are there', () => {
    mount();
    expect(host.querySelector('.gig-screen.gig-crt.gig-motion')).not.toBeNull();
    for (const fx of ['roll', 'scan', 'mask', 'glare', 'vig']) expect(host.querySelector(`.gig-fx-${fx}`)).not.toBeNull();
    view.destroy();
    mount(startRun(board), { reducedMotion: true });
    expect(host.querySelector('.gig-motion')).toBeNull();
  });

  it('the svg scales: a viewBox and no fixed width', () => {
    mount();
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
    expect(svg.getAttribute('width')).toBeNull();
  });

  it('two views on one page keep their own filter ids', () => {
    mount();
    const other = document.createElement('div');
    document.body.append(other);
    const second = new BoardView(other, { onSelect: () => {}, reducedMotion: false });
    second.render(startRun(board), null);
    const ids = [...document.querySelectorAll('filter')].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    second.destroy();
    other.remove();
  });
});

describe('project', () => {
  it('is isometric: across a column moves right and down, down a row moves left and down', () => {
    const [x0, y0] = project(0, 0, 6);
    const [x1, y1] = project(1, 0, 6);
    const [x2, y2] = project(0, 1, 6);
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    expect(x2).toBeLessThan(x0);
    expect(y2).toBeGreaterThan(y0);
  });
});

describe('deferred minors', () => {
  it('reduced motion can follow a setting that changes: it is read on every render', () => {
    let reduced = false;
    const v = new BoardView(host, { onSelect: () => {}, reducedMotion: () => reduced });
    v.render(startRun(board), null);
    expect(host.querySelector('.gig-motion')).not.toBeNull();
    reduced = true;
    v.render(startRun(board), null);
    expect(host.querySelector('.gig-motion')).toBeNull();
    v.destroy();
  });

  it('the view holds the whole board for every tier: each footprint, tower headroom above, the target label below', () => {
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      for (const seed of [1, 2, 3, 99, 4242]) {
        const b = generate(tier, seed);
        const v = new BoardView(host, { onSelect: () => {}, reducedMotion: true });
        v.render(startRun(b), null);
        const [x, y, w, h] = host.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
        const cols = Math.max(...b.nodes.map((n) => n.col)) + 1;
        for (const n of b.nodes) {
          const [px, py] = project(n.col, n.row, cols);
          expect(px - 50).toBeGreaterThanOrEqual(x);
          expect(px + 50).toBeLessThanOrEqual(x + w);
          expect(py - 64).toBeGreaterThanOrEqual(y); // the tallest tower plus its label
          expect(py + 40).toBeLessThanOrEqual(y + h); // the target's label under its rings
        }
        v.destroy();
      }
    }
  });
});
