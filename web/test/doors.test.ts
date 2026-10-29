import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoorLayer, placeDoor } from '../src/room/doors';
import type { ExitDef } from '../../shared/types';

describe('placeDoor (clickable doors spec §3)', () => {
  it('maps a box from room px to stage px', () => {
    const r = placeDoor([768, 432, 154, 86], [1536, 864], { left: 160, top: 90, width: 1600, height: 900 }, { scale: 1, left: 160, top: 90, width: 1600, height: 900 });
    expect(r.left).toBeCloseTo(800);
    expect(r.top).toBeCloseTo(450);
    expect(r.width).toBeCloseTo(160.42, 1);
    expect(r.height).toBeCloseTo(89.58, 1);
  });

  it('stage px stay the same at any zoom', () => {
    const r = placeDoor([768, 432, 154, 86], [1536, 864], { left: 0, top: 0, width: 800, height: 450 }, { scale: 0.5, left: 0, top: 0, width: 800, height: 450 });
    expect(r.left).toBeCloseTo(800);
    expect(r.top).toBeCloseTo(450);
  });
});

describe('DoorLayer (clickable doors spec §3)', () => {
  const room = { left: 0, top: 0, width: 1600, height: 900 };
  const stage = { scale: 1, left: 0, top: 0, width: 1600, height: 900 };
  const exits: ExitDef[] = [
    { to: 'karasu/hicks-room', way: 'through the grey door into his room', door: [1245, 95, 180, 705] },
    { to: 'karasu/dead-blocks', way: 'down the back way' },
    { to: 'karasu/zhou-flat', way: "through the stickered door into the twins' place", door: [1200, 260, 120, 365] },
  ];
  const scene = { resolution: [1536, 864] as [number, number], exits };
  let root: HTMLElement;
  const make = (o: { blocked?: () => boolean } = {}) => {
    root = document.createElement('div');
    document.body.append(root);
    const send = vi.fn();
    const layer = new DoorLayer(root, { send, blocked: o.blocked ?? (() => false), roomRect: () => room, stage: () => stage });
    return { layer, send };
  };
  const spot = (to: string) => root.querySelector<HTMLElement>(`.door-spot[data-to="${to}"]`)!;
  afterEach(() => root.remove());

  it('makes one spot per door, none for an exit without a box', () => {
    const { layer } = make();
    layer.show(scene);
    expect([...root.querySelectorAll('.door-spot')].map((s) => (s as HTMLElement).dataset.to)).toEqual(['karasu/hicks-room', 'karasu/zhou-flat']);
    expect(root.classList.contains('door-none')).toBe(false);
  });

  it('with no room or no doors, the layer is empty and takes no pointer events', () => {
    const { layer } = make();
    layer.show(null);
    expect(root.querySelectorAll('.door-spot')).toHaveLength(0);
    expect(root.classList.contains('door-none')).toBe(true);
    layer.show({ resolution: [1536, 864], exits: [{ to: 'x/y', way: 'w' }] });
    expect(root.classList.contains('door-none')).toBe(true);
  });

  it('hover shows the way in capitals; a click sends the exit once', () => {
    const { layer, send } = make();
    layer.show(scene);
    spot('karasu/hicks-room').dispatchEvent(new MouseEvent('mouseenter'));
    expect(spot('karasu/hicks-room').classList.contains('door-hover')).toBe(true);
    expect(spot('karasu/hicks-room').querySelector('.door-label')!.textContent).toBe('THROUGH THE GREY DOOR INTO HIS ROOM');
    spot('karasu/hicks-room').click();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('karasu/hicks-room');
  });

  it('while blocked, no hover and no click', () => {
    const { layer, send } = make({ blocked: () => true });
    layer.show(scene);
    spot('karasu/hicks-room').dispatchEvent(new MouseEvent('mouseenter'));
    spot('karasu/hicks-room').click();
    expect(spot('karasu/hicks-room').classList.contains('door-hover')).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('a click whose press closed a panel does nothing (review I1)', () => {
    let open = true;
    const { layer, send } = make({ blocked: () => open });
    layer.show(scene);
    const s = spot('karasu/hicks-room');
    // The panel closes on press (click-away), so by the click it isn't open any more.
    s.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    open = false;
    s.click();
    expect(send).not.toHaveBeenCalled();
    // The next press and click, with nothing open, go through.
    s.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    s.click();
    expect(send).toHaveBeenCalledWith('karasu/hicks-room');
  });

  it('a door click still reaches the page, so click-away menus and cards close (review I2)', () => {
    const { layer } = make();
    layer.show(scene);
    const heard = vi.fn();
    document.addEventListener('click', heard);
    spot('karasu/hicks-room').click();
    document.removeEventListener('click', heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('a later exit sits on top of an earlier one', () => {
    const { layer } = make();
    layer.show(scene);
    const spots = [...root.querySelectorAll('.door-spot')];
    expect(spots.indexOf(spot('karasu/zhou-flat'))).toBeGreaterThan(spots.indexOf(spot('karasu/hicks-room')));
  });

  it("a new room replaces the old room's doors; a refusal clears the label", () => {
    const { layer } = make();
    layer.show(scene);
    spot('karasu/hicks-room').dispatchEvent(new MouseEvent('mouseenter'));
    spot('karasu/hicks-room').click();
    layer.refused();
    expect(root.querySelector('.door-hover')).toBeNull();
    layer.show({ resolution: [1536, 864], exits: [{ to: 'karasu/hicks-gallery', way: 'out to the walkway', door: [10, 10, 40, 40] }] });
    expect([...root.querySelectorAll('.door-spot')].map((s) => (s as HTMLElement).dataset.to)).toEqual(['karasu/hicks-gallery']);
  });

  it('places each spot in stage px, and the label under a door at the top of the room', () => {
    const { layer } = make();
    layer.show({ resolution: [1536, 864], exits: [{ to: 'a/b', way: 'up', door: [768, 0, 154, 86] }] });
    const s = spot('a/b');
    expect(parseFloat(s.style.left)).toBeCloseTo(800);
    expect(parseFloat(s.style.top)).toBeCloseTo(0);
    expect(s.classList.contains('door-label-below')).toBe(true);
  });
});

describe('main.ts wires the doors (clickable doors spec §3)', () => {
  it('doors wait while a file card or the quest list is open, as for the other panels', () => {
    const main = readFileSync(path.resolve('web/src/main.ts'), 'utf8');
    const blocked = main.match(/new DoorLayer\([\s\S]*?blocked: \(\) => ([^\n]+)/)![1]!;
    for (const open of ['chromeOpen', 'map.isOpen', 'whosHere.cardOpen', 'questList.isOpen', 'dice.open', 'gigWindow !== null']) expect(blocked).toContain(open);
  });
});
