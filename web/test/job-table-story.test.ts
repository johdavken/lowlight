import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountJobTable } from '../src/room/table/job-table';
import { isStoryTable } from '../src/room/table/el';
import { onFloor, FLOOR_PARKED } from '../src/room/check-anim';
import type { QuestState } from '../../shared/types';

// The story table (mockup graft-margin.html, 2026-11-17): the JOB column as the page, the choices in a margin.
// table-trace.css turns it on with `--story-table: 1`; jsdom loads no CSS, so each test sets it on the table.
type Active = NonNullable<QuestState['active']>;
const pool = (stat: string, dice: number, position: 'dark' | 'open' | 'wire') => ({ stat, base: dice, dice, parts: [], position, noDeck: false, effect: 'fair' as const });
const beat = (id: string, title: string) => ({ id, title });
const ROUTE = { ways: [{ via: 'charm', beats: [beat('lobby', 'THE LOBBY'), beat('desk', 'THE DESK'), beat('out', 'THE WAY OUT')] }, { via: 'stairs', beats: [beat('lobby', 'THE LOBBY'), beat('stairwell', 'THE STAIRWELL'), beat('out', 'THE WAY OUT')] }], played: [] as string[] };
const A: Active = {
  id: 'night-clerk',
  title: 'Night Clerk',
  beat: 'lobby',
  tier: 2,
  route: ROUTE,
  choices: [
    { id: 'charm', line: 'Go to the glass.', leads: 'THE DESK', pool: pool('COOL', 3, 'open') },
    { id: 'stairs', line: 'Take the stair.', leads: 'THE STAIRWELL', pool: pool('REFLEX', 2, 'dark') },
  ],
  alarm: 1,
  nerve: { left: 4, max: 5 },
  take: { filled: 1, size: 4 },
  heat: 0,
  pay: [360, 440],
};

const one = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const card = (id: string) => one(`.tb-deal .tb-card[data-choice="${id}"]`);
const mount = (story = true) => {
  const g = document.createElement('div');
  g.id = 'game';
  document.body.append(g);
  const onChoose = vi.fn();
  const t = mountJobTable(g, { onChoose, onTalk: vi.fn(), reduced: () => true });
  if (story) one('.tb.hud').style.setProperty('--story-table', '1');
  return { t, onChoose };
};
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the story table (mockup graft-margin.html)', () => {
  it('is on only where its stylesheet says so, and steps out at the debrief and on a board', () => {
    mount(false);
    expect(isStoryTable(one('.tb.hud'))).toBe(false);
    one('.tb.hud').style.setProperty('--story-table', '1');
    expect(isStoryTable(one('.tb.hud'))).toBe(true);
    one('.tb.hud').classList.add('tb-ended');
    expect(isStoryTable(one('.tb.hud'))).toBe(false);
    one('.tb.hud').classList.remove('tb-ended');
    one('.tb.hud').classList.add('tb-deduction');
    expect(isStoryTable(one('.tb.hud'))).toBe(false);
  });

  it('a click on a closed card opens it; the open one rolls', () => {
    const { t, onChoose } = mount();
    t.show(A);
    expect(card('charm').classList.contains('sel')).toBe(true);
    card('stairs').click();
    expect(onChoose).not.toHaveBeenCalled();
    expect(card('stairs').classList.contains('sel')).toBe(true);
    expect(card('charm').classList.contains('sel')).toBe(false);
    card('stairs').click();
    expect(onChoose).toHaveBeenLastCalledWith('stairs', {});
  });

  it('the classic table still rolls on the first click', () => {
    const { t, onChoose } = mount(false);
    t.show(A);
    card('stairs').click();
    expect(onChoose).toHaveBeenLastCalledWith('stairs', {});
  });

  it('↑ ↓ move along the stacked choices, and the key line says so', () => {
    const { t } = mount();
    t.show(A);
    expect(one('.tb-keys').textContent).toContain('[↑↓] CHOICE');
    expect(t.key('ArrowDown', true)).toBe(true);
    expect(card('stairs').classList.contains('sel')).toBe(true);
    expect(t.key('ArrowUp', true)).toBe(true);
    expect(card('charm').classList.contains('sel')).toBe(true);
  });

  it('the wheel over the cards steps the open one: a notch a step, small deltas gathered, no faster than 140ms', () => {
    const { t, onChoose } = mount();
    t.show(A);
    const spin = (deltaY: number, timeStamp: number) => {
      const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'timeStamp', { value: timeStamp });
      card('charm').dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(spin(100, 1000)).toBe(true);
    expect(card('stairs').classList.contains('sel')).toBe(true);
    spin(100, 1050);
    expect(card('stairs').classList.contains('sel')).toBe(true);
    spin(20, 1300);
    expect(card('stairs').classList.contains('sel')).toBe(true);
    spin(20, 1310);
    expect(card('charm').classList.contains('sel')).toBe(true);
    spin(-100, 1600);
    expect(card('stairs').classList.contains('sel')).toBe(true);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('the choices stay a fixed list: the open one’s roll, odds and key stand in the detail under it, and its key rolls it', () => {
    const { t, onChoose } = mount();
    t.show(A);
    const detail = one('.tb-middle > .tb-detail');
    expect(detail.hidden).toBe(false);
    expect(one('.tb-detail-head').textContent).toBe('COOL · 3D · FAIR');
    expect(detail.querySelector('.tb-oddsbar')).not.toBeNull();
    expect(detail.querySelectorAll('.tb-res-row')).toHaveLength(3);
    // Each row carries its clean chance on its dice count.
    expect(card('stairs').querySelector<HTMLElement>('.tb-sum')!.dataset.pct).toMatch(/^\d+%$/);
    t.key('ArrowDown', true);
    expect(one('.tb-detail-head').textContent).toBe('REFLEX · 2D · FAIR');
    one('.tb-detail .tb-key').click();
    expect(onChoose).toHaveBeenLastCalledWith('stairs', {});
  });

  it('the classic table has no detail block up', () => {
    const { t } = mount(false);
    t.show(A);
    expect(one('.tb-middle > .tb-detail').hidden).toBe(true);
  });

  it('the route stands beside the job’s line, 340px wide', () => {
    const { t } = mount();
    t.show(A);
    expect(one('.tb-route svg.rt').getAttribute('width')).toBe('340');
  });

  it('a parked roll’s dice go to the floor: centred past the margin, foot over the key line, at its scale', () => {
    mount();
    const tb = one('.tb.hud');
    const mid = one('.tb.hud > .tb-middle');
    Object.defineProperty(tb, 'offsetWidth', { value: 1600 });
    vi.spyOn(tb, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(mid, 'getBoundingClientRect').mockReturnValue({ left: 772, top: 130, right: 1132, bottom: 790, width: 360, height: 660, x: 772, y: 130, toJSON: () => ({}) });
    const tray = document.createElement('div');
    tray.className = 'tb-roll';
    mid.append(tray);
    onFloor(tray, FLOOR_PARKED);
    expect(tray.classList.contains('on-floor')).toBe(true);
    expect(tray.style.zoom).toBe(String(FLOOR_PARKED));
    // The floor's centre is (1132 + 1600) / 2 = 1366; the tray is 420 wide there.
    expect(parseFloat(tray.style.left) * FLOOR_PARKED).toBeCloseTo(1366 - 210, -1);
    expect(parseFloat(tray.style.bottom) * FLOOR_PARKED).toBeCloseTo(44, -1);
  });

  it('five dice wider than the floor shrink to fit, and never start over the margin', () => {
    mount();
    const tb = one('.tb.hud');
    const mid = one('.tb.hud > .tb-middle');
    Object.defineProperty(tb, 'offsetWidth', { value: 1600 });
    vi.spyOn(tb, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(mid, 'getBoundingClientRect').mockReturnValue({ left: 772, top: 130, right: 1132, bottom: 790, width: 360, height: 660, x: 772, y: 130, toJSON: () => ({}) });
    const tray = document.createElement('div');
    tray.className = 'tb-roll';
    const canvas = document.createElement('canvas');
    canvas.style.width = '600px';
    tray.append(canvas);
    mid.append(tray);
    onFloor(tray, 1.15);
    const s = parseFloat(tray.style.zoom);
    expect(600 * s).toBeLessThanOrEqual(1600 - 1132 - 24 + 1);
    expect(parseFloat(tray.style.left) * s).toBeGreaterThanOrEqual(1132 + 12 - 1);
  });
});
