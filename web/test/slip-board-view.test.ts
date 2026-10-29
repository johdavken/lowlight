import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlipBoardView, slipProject, type SlipMarks } from '../src/ui/slip/board-view';
import { generateSlip } from '../../shared/slip/generate';
import { predictWatch, startSlip, step, watchedBy, type SlipBoard, type SlipState } from '../../shared/slip/rules';
import type { Tier } from '../../shared/gig/rules';

let host: HTMLElement;
let view: SlipBoardView;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  view?.destroy();
  host.remove();
});

const board = generateSlip('medium', 1)!;
const NONE: SlipMarks = { sel: null, aim: null, moves: [] };
const $$ = (sel: string) => [...host.querySelectorAll<SVGElement>(sel)];
function mount(b: SlipBoard = board, s: SlipState = startSlip(b), marks: SlipMarks = NONE, reducedMotion = true) {
  const onNode = vi.fn();
  view = new SlipBoardView(host, b, { onNode, reducedMotion, placeName: 'Glass Orchid' });
  view.render(s, marks);
  return onNode;
}
const label = (id: number) => host.querySelector(`g.slip-pad[data-id="${id}"] text.slip-label`)?.textContent ?? null;

describe('SlipBoardView', () => {
  it('pads: one per node with its id; a click hands the id over', () => {
    const onNode = mount();
    const pads = $$('g.slip-pad');
    expect(pads.map((p) => Number(p.getAttribute('data-id')))).toEqual(board.nodes.map((n) => n.id));
    pads[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onNode).toHaveBeenCalledWith(board.nodes[3].id);
  });

  it('labels: ENTRY, TARGET, EXIT and HIDE; TARGET reads LIFTED after the lift; easy reads ENTRY · EXIT', () => {
    mount();
    expect(label(board.entry)).toBe('ENTRY');
    expect(label(board.target)).toBe('TARGET');
    expect(label(board.exit)).toBe('EXIT');
    for (const n of board.nodes.filter((x) => x.type === 'HIDE')) expect(label(n.id)).toBe('HIDE');
    view.render({ ...startSlip(board), lifted: true }, NONE);
    expect(label(board.target)).toBe('LIFTED');
    view.destroy();
    const easy = generateSlip('easy', 3)!;
    mount(easy);
    expect(label(easy.entry)).toBe('ENTRY · EXIT');
  });

  it('wedges: one per watcher that sees a second node; none from a jammed camera', () => {
    const s = startSlip(board);
    mount(board, s);
    const seeing = watchedBy(board, s).filter((w) => w.nodes.length > 1);
    expect($$('polygon.slip-wedge')).toHaveLength(seeing.length);
    view.render({ ...s, jam: s.jam.map(() => 2) }, NONE);
    expect($$('polygon.slip-wedge')).toHaveLength(watchedBy(board, { ...s, jam: s.jam.map(() => 2) }).filter((w) => w.nodes.length > 1).length);
    expect(watchedBy(board, { ...s, jam: s.jam.map(() => 2) }).some((w) => w.cam !== undefined)).toBe(false);
  });

  it('wedges never point into a HIDE node (you cannot be seen there)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = generateSlip('medium', seed)!;
      const s = startSlip(b);
      mount(b, s);
      const want = watchedBy(b, s).filter((w) => w.nodes.length > 1 && b.nodes[w.nodes[1]].type !== 'HIDE');
      const tos = $$('polygon.slip-wedge').map((p) => Number(p.getAttribute('data-to')));
      expect(tos.every((t) => b.nodes[t].type !== 'HIDE')).toBe(true);
      expect(tos).toHaveLength(want.length);
      checked += watchedBy(b, s).filter((w) => w.nodes.length > 1 && b.nodes[w.nodes[1]].type === 'HIDE').length;
      view.destroy();
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a reorder happens before the move, so a re-appended figure still has its old place when it moves (it slides)', () => {
    const b = generateSlip('medium', 1)!;
    const s = startSlip(b);
    mount(b, s);
    const atAppend = new Map<Node, string>();
    const figs = host.querySelector('g.slip-figs')!;
    const realAppend = figs.appendChild.bind(figs);
    const realInsert = figs.insertBefore.bind(figs);
    const seen = (n: Node) => atAppend.set(n, (n as unknown as HTMLElement).style.transform);
    figs.appendChild = (<T extends Node>(n: T): T => (seen(n), realAppend(n))) as typeof figs.appendChild;
    figs.insertBefore = (<T extends Node>(n: T, ref: Node | null): T => (seen(n), realInsert(n, ref))) as typeof figs.insertBefore;
    const before = new Map<Node, string>($$('g.slip-fig').map((g) => [g, (g as unknown as HTMLElement).style.transform]));
    // Put you at the deepest node, so the order must change.
    const deepest = [...b.nodes].sort((p, q) => q.u + q.v - (p.u + p.v))[0].id;
    view.render({ ...s, p: deepest }, NONE);
    expect(atAppend.size).toBeGreaterThan(0);
    for (const [n, t] of atAppend) expect(t).toBe(before.get(n));
    const n = b.nodes[deepest];
    const [x, y] = slipProject(n.u, n.v);
    expect(($$('g.slip-fig.slip-you')[0] as unknown as HTMLElement).style.transform).toBe(`translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`);
  });

  it("next turn: a dashed outline on every node predictWatch sees, except HIDE", () => {
    const s = startSlip(board);
    mount(board, s);
    const want = new Set(predictWatch(board, s).flatMap((w) => w.nodes).filter((n) => board.nodes[n].type !== 'HIDE'));
    expect(new Set($$('polygon.slip-next').map((p) => Number(p.getAttribute('data-id'))))).toEqual(want);
  });

  it('figures: you, each guard and each camera; a chasing guard is slip-chase; a jammed camera says ⌁', () => {
    const s = startSlip(board);
    mount(board, s);
    expect($$('g.slip-fig.slip-you')).toHaveLength(1);
    expect($$('g.slip-fig.slip-guard')).toHaveLength(board.guards.length);
    expect($$('g.slip-fig.slip-cam')).toHaveLength(board.cams.length);
    view.render({ ...s, g: s.g.map((g, i) => (i === 0 ? { ...g, m: 'chase' } : g)), jam: s.jam.map(() => 3) }, NONE);
    const guards = $$('g.slip-fig.slip-guard');
    expect(guards[0].classList.contains('slip-chase')).toBe(true);
    expect(guards[0].querySelector('text.slip-tag')!.textContent).toBe('G-01 ◉');
    expect($$('g.slip-fig.slip-cam')[0].querySelector('text.slip-tag')!.textContent).toBe('CAM 1 ⌁3');
  });

  it('figures persist across renders (so moves animate) and sit on their node', () => {
    const s = startSlip(board);
    mount(board, s);
    const you = $$('g.slip-fig.slip-you')[0];
    const d = board.nodes[s.p].adj.findIndex((m) => m >= 0) as 0 | 1 | 2 | 3;
    const next = step(board, s, { k: 'move', d }).state;
    expect(next.p).not.toBe(s.p);
    view.render(next, NONE);
    expect($$('g.slip-fig.slip-you')[0]).toBe(you);
    const n = board.nodes[next.p];
    const [x, y] = slipProject(n.u, n.v);
    expect((you as unknown as HTMLElement).style.transform).toBe(`translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`);
  });

  it('marks: moves outlined, aim targets dashed and the current aim ringed, the selection ticked', () => {
    const moves = board.nodes[board.entry].adj.filter((n) => n >= 0);
    mount(board, startSlip(board), { sel: board.target, aim: null, moves });
    expect(new Set($$('polygon.slip-move').map((p) => Number(p.getAttribute('data-id'))))).toEqual(new Set(moves));
    expect($$(`g.slip-pad[data-id="${board.target}"] .slip-tick`)).toHaveLength(4);
    view.render(startSlip(board), { sel: null, aim: { targets: moves, cur: moves[0] }, moves: [] });
    expect($$('polygon.slip-aim')).toHaveLength(moves.length);
    expect($$('polygon.slip-aim-cur').map((p) => Number(p.getAttribute('data-id')))).toEqual([moves[0]]);
    expect($$('polygon.slip-move')).toHaveLength(0);
  });

  it('the feed stamp names the place, and the turn counts', () => {
    mount();
    expect(host.querySelector('.slip-stamp')!.textContent).toBe('CAM 03 · GLASS ORCHID · REC');
    expect(host.querySelector('.slip-turn')!.textContent).toBe('T+00');
  });

  it.each<Tier>(['easy', 'medium', 'hard'])('view-fit (%s): every pad and figure tag lies inside the viewBox, seeds 1..20', (tier) => {
    for (let seed = 1; seed <= 20; seed++) {
      const b = generateSlip(tier, seed)!;
      mount(b);
      const [x0, y0, w, h] = host.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
      for (const n of b.nodes) {
        const [x, y] = slipProject(n.u, n.v);
        // The pad, the tallest figure with its tag (up to 60 px right, 56 up), and a label under it.
        expect(x - 40).toBeGreaterThanOrEqual(x0);
        expect(x + 60).toBeLessThanOrEqual(x0 + w);
        expect(y - 56).toBeGreaterThanOrEqual(y0);
        expect(y + 30).toBeLessThanOrEqual(y0 + h);
      }
      view.destroy();
    }
  }, 30_000);

  it('reduced motion: no slip-motion class; setReducedMotion(false) adds it', () => {
    mount(board, startSlip(board), NONE, true);
    const screen = host.querySelector('.slip-screen')!;
    expect(screen.classList.contains('slip-motion')).toBe(false);
    view.setReducedMotion(false);
    expect(screen.classList.contains('slip-motion')).toBe(true);
  });

  it('destroy removes the board', () => {
    mount();
    view.destroy();
    expect(host.querySelector('svg')).toBeNull();
  });

  it('patrol routes carry direction arrows: one per link of a loop, two (out and back) on a beat, none for a post', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const b = generateSlip('hard', seed)!;
      mount(b);
      const want = b.guards.reduce((n, g) => n + (g.kind === 'loop' ? g.poses.length : g.kind === 'pace' ? 2 : 0), 0);
      expect($$('.slip-route-arrow')).toHaveLength(want);
      view.destroy();
    }
  });

  it('the REC dot sits before the stamp, so a long place name never runs it into the turn counter', () => {
    const onNode = vi.fn();
    view = new SlipBoardView(host, generateSlip('easy', 3)!, { onNode, reducedMotion: true, placeName: 'A Very Long Place Name For A Small Board' });
    view.render(startSlip(generateSlip('easy', 3)!), NONE);
    const dot = Number(host.querySelector('.slip-rec')!.getAttribute('cx'));
    const stamp = Number(host.querySelector('.slip-stamp')!.getAttribute('x'));
    expect(dot).toBeLessThan(stamp);
  });

  it('states: EXIT opens after the lift; you dim on a booth; a jammed camera is classed; search and noise and return have their marks; the visor follows the facing', () => {
    const s = startSlip(board);
    const hide = board.nodes.find((n) => n.type === 'HIDE')!.id;
    mount(board, { ...s, lifted: true, p: hide });
    expect(host.querySelector(`g.slip-pad[data-id="${board.exit}"]`)!.classList.contains('slip-open')).toBe(true);
    expect($$('g.slip-fig.slip-you')[0].classList.contains('slip-hidden')).toBe(true);
    view.render({ ...s, jam: s.jam.map(() => 1), g: s.g.map((g, i) => ({ ...g, m: (['search', 'investigate', 'return'] as const)[i % 3], f: 0 })) }, NONE);
    expect($$('g.slip-fig.slip-cam')[0].classList.contains('slip-jammed')).toBe(true);
    const tags = $$('g.slip-fig.slip-guard').map((g) => g.querySelector('text.slip-tag')!.textContent);
    expect(tags[0]).toBe('G-01 ?');
    if (tags[1]) expect(tags[1]).toBe('G-02 ~');
    const visor = $$('g.slip-fig.slip-guard')[0].querySelector('line.slip-visor')!;
    // Facing +u is down-right on screen.
    expect(Number(visor.getAttribute('x2'))).toBeGreaterThan(0);
    expect(Number(visor.getAttribute('y2'))).toBeGreaterThan(-42);
  });

  it.each<Tier>(['easy', 'medium', 'hard'])("tag-fit (%s): the widest figure tag and label, measured by characters, stay inside the viewBox", (tier) => {
    // VT323 at 13 px is about 6.5 px a character (tags); at 15 px with 1.5 px spacing about 9 (labels).
    const tagW = 'G-01 ◉'.length * 6.5;
    const labelW = 'ENTRY · EXIT'.length * 9;
    for (let seed = 1; seed <= 10; seed++) {
      const b = generateSlip(tier, seed)!;
      mount(b);
      const [x0, y0, w, h] = host.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
      for (const n of b.nodes) {
        const [x, y] = slipProject(n.u, n.v);
        expect(x + 13 + tagW).toBeLessThanOrEqual(x0 + w);
        expect(y - 48 - 13).toBeGreaterThanOrEqual(y0);
        expect(x - labelW / 2).toBeGreaterThanOrEqual(x0);
        expect(x + labelW / 2).toBeLessThanOrEqual(x0 + w);
        expect(y + 26).toBeLessThanOrEqual(y0 + h);
      }
      view.destroy();
    }
  }, 30_000);
});

