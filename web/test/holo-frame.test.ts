import { describe, expect, it, vi } from 'vitest';
import { FRAME_IN_MS, FRAME_OUT_MS, TOP, frameGeometry, frameSvg, mountFrame, stateSvg, type FrameShape, type Pt } from '../src/ui/holo-frame';

const SHAPES: [FrameShape, number, number][] = [['main', 1152, 756], ['side', 580, 740], ['band', 620, 520]];

/** Each edge of a closed outline: horizontal, vertical or exactly 45°. */
const edges = (pts: Pt[]) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const);

describe('frame geometry', () => {
  for (const [shape, w, h] of SHAPES) {
    it(`${shape}: whole pixels, and every cut is 45°`, () => {
      const g = frameGeometry(shape, w, h);
      for (const part of [g.pts, g.clip ?? [], g.piece ?? []]) {
        for (const [x, y] of part) {
          expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
        }
        for (const [[x0, y0], [x1, y1]] of edges(part)) {
          const dx = Math.abs(x1 - x0);
          const dy = Math.abs(y1 - y0);
          expect(dx === 0 || dy === 0 || dx === dy).toBe(true);
        }
      }
    });
    it(`${shape}: the outline stays inside the pane's box`, () => {
      for (const [x, y] of frameGeometry(shape, w, h).pts) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(w);
        expect(y).toBeLessThanOrEqual(h);
      }
    });
  }
  it("main clips with room over its top edge for the title's plate, and has the hotkey piece; the others have neither", () => {
    const main = frameGeometry('main', 1152, 756);
    expect(main.clip).toBeDefined();
    expect(Math.min(...main.clip!.map(([, y]) => y))).toBe(0);
    expect(Math.min(...main.pts.map(([, y]) => y))).toBe(TOP);
    expect(frameSvg('main', 1152, 756, 'Q')).toContain('>Q</text>');
    expect(frameSvg('main', 1152, 756, 'Q')).toContain('class="hf-alt"');
    expect(frameSvg('main', 1152, 756, '')).not.toContain('hf-alt');
    expect(frameGeometry('side', 580, 740).clip).toBeUndefined();
    expect(frameGeometry('band', 620, 520).piece).toBeUndefined();
  });
  it('each SVG has its own grid id, so two frames up at once both fill', () => {
    const a = frameSvg('main', 100, 100).match(/id="([^"]+)"/)?.[1];
    const b = frameSvg('main', 100, 100).match(/id="([^"]+)"/)?.[1];
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe('mountFrame', () => {
  const setup = () => {
    const host = document.createElement('div');
    const pane = document.createElement('div');
    host.append(pane);
    document.body.append(host);
    return { host, pane, frame: mountFrame(pane, { shape: 'main', key: 'Y' }) };
  };
  it('puts one frame just before the pane', () => {
    const { host, pane, frame } = setup();
    expect(host.querySelectorAll('.hf')).toHaveLength(1);
    expect(frame.el.nextElementSibling).toBe(pane);
    expect(pane.classList.contains('hf-pane')).toBe(true);
  });
  it('draws on, and off for FRAME_OUT_MS', () => {
    const { pane, frame } = setup();
    frame.open(false);
    expect(frame.el.classList.contains('hf-opening')).toBe(true);
    expect(pane.classList.contains('hf-opening')).toBe(true);
    expect(frame.close(false)).toBe(FRAME_OUT_MS);
    expect(frame.el.classList.contains('hf-closing')).toBe(true);
    expect(frame.el.classList.contains('hf-opening')).toBe(false);
    frame.open(false);
    expect(frame.el.classList.contains('hf-closing')).toBe(false);
  });
  it('drawn on, the class comes off, so a refit never traces it again', () => {
    vi.useFakeTimers();
    try {
      const { pane, frame } = setup();
      frame.open(false);
      vi.advanceTimersByTime(FRAME_IN_MS);
      expect(frame.el.classList.contains('hf-opening')).toBe(false);
      expect(pane.classList.contains('hf-opening')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it('reduced motion: no draw-on, and nothing to wait for', () => {
    const { pane, frame } = setup();
    frame.open(true);
    expect(frame.el.classList.contains('hf-opening')).toBe(false);
    expect(pane.classList.contains('hf-opening')).toBe(false);
    expect(frame.close(true)).toBe(0);
  });
  it("unclipped (the subtitle box): the pane keeps its own box, and the frame takes the pane's size, so CSS can stand it on the pane's floor", () => {
    const pane = document.createElement('div');
    document.body.append(pane);
    Object.defineProperty(pane, 'offsetWidth', { value: 1340 });
    Object.defineProperty(pane, 'offsetHeight', { value: 216 });
    const frame = mountFrame(pane, { shape: 'box', clip: false });
    expect(pane.classList.contains('hf-pane')).toBe(false);
    expect(pane.style.clipPath).toBe('');
    expect([frame.el.style.width, frame.el.style.height]).toEqual(['1340px', '216px']);
    expect(frame.el.querySelector('.hf-gb')).not.toBeNull();
  });
});

describe('the live trim', () => {
  it('the count under the key, the meter filled in whole 2px steps, the lines running when live', () => {
    const svg = stateSvg('main', 1152, 756, 'K', { count: '2 OUT', live: true, meter: { label: 'CREW', frac: 0.5, value: '2 / 4' } });
    expect(svg).toContain('>K</text>');
    expect(svg).toContain('>2 OUT</text>');
    expect(svg).toContain('hf-speedg live');
    expect(svg).toMatch(/class="hf-solid hf-mfill" x="\d+" y="\d+" width="130"/);
    expect(svg).toContain('>2 / 4</text>');
  });
  it('a fill rounds to a whole 2px step and stays on the track', () => {
    const w = (frac: number) => Number(stateSvg('main', 1152, 756, '', { meter: { label: 'X', frac, value: '' } }).match(/hf-mfill" x="\d+" y="\d+" width="(\d+)"/)![1]);
    expect(w(0.333) % 2).toBe(0);
    expect(w(-1)).toBe(0);
    expect(w(2)).toBe(260);
  });
  it('names from the game are escaped', () => {
    expect(stateSvg('main', 1152, 756, '', { meter: { label: 'A<B', frac: 0, value: 'C&D' } })).toContain('A&lt;B');
  });
  it('only main has it', () => {
    expect(stateSvg('side', 580, 740, '', { count: '1' })).toBe('');
  });
  it('setState mirrors on the frame and never draws it on again', () => {
    const pane = document.createElement('div');
    document.body.append(pane);
    const frame = mountFrame(pane, { shape: 'main', key: 'Q' });
    frame.setState({ count: '3 HERE', meter: { label: 'KARASU HEAT', frac: 0.2, value: '2 / 10' } });
    expect(frame.el.dataset.count).toBe('3 HERE');
    expect(frame.el.dataset.meter).toBe('KARASU HEAT 2 / 10');
    expect(frame.el.classList.contains('hf-opening')).toBe(false);
    expect(frameSvg('main', 1152, 756, 'Q', { count: '3 HERE' })).toContain('>3 HERE</text>');
  });
});
