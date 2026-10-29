import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIGURE_CEILING, FIGURE_FLOOR, figureLight, lightCss, NEUTRAL_LIGHT, StageLight } from '../src/ui/stage-light';

type RGB = [number, number, number];

/** A renderer stand-in: light by x (left of 500 is `leftLight`, the rest `rightLight`), frames on demand. */
function fakeRenderer(leftLight: RGB | null, rightLight: RGB | null = leftLight) {
  const hooks = new Set<() => void>();
  const r = {
    light: { left: leftLight, right: rightLight },
    lightAt: vi.fn((x: number) => (x < 500 ? r.light.left : r.light.right)),
    onFrame: (fn: () => void) => {
      hooks.add(fn);
      return () => hooks.delete(fn);
    },
    frame: () => hooks.forEach((h) => h()),
  };
  return r;
}

/** A figure 400 px wide from x 300: its left sample (x 400) is "left", its right (x 600) "right". */
function figure(kind = 'sprite'): HTMLElement {
  const f = document.createElement('div');
  f.className = 'stage-figure';
  f.dataset.kind = kind;
  f.getBoundingClientRect = () => ({ x: 300, y: 0, left: 300, top: 0, width: 400, height: 1000, right: 700, bottom: 1000, toJSON: () => ({}) }) as DOMRect;
  document.body.append(f);
  return f;
}
const N = NEUTRAL_LIGHT;
let light: StageLight | null = null;
afterEach(() => {
  light?.dispose();
  light = null;
  document.body.innerHTML = '';
});

describe('figureLight', () => {
  it('a neutral room leaves the figure as drawn', () => {
    expect(figureLight([N, N, N])).toEqual([1, 1, 1]);
  });
  it('a black room stops at the floor; a blazing lamp at the ceiling', () => {
    expect(figureLight([0, 0, 0])).toEqual([FIGURE_FLOOR, FIGURE_FLOOR, FIGURE_FLOOR]);
    expect(figureLight([99, 99, 99])).toEqual([FIGURE_CEILING, FIGURE_CEILING, FIGURE_CEILING]);
  });
  it('strength mixes toward as drawn', () => {
    // raw 0.5 → 0.75 × 0.5 + 0.25 = 0.625
    expect(figureLight([N * 0.5, N * 0.5, N * 0.5])[0]).toBeCloseTo(0.625, 5);
  });
});

describe('lightCss', () => {
  it('splits multiply and add per channel', () => {
    expect(lightCss([1, 0.5, 1.25])).toEqual({ shade: 'rgb(255, 128, 255)', glow: 'rgb(0, 0, 38)' });
  });
});

describe('StageLight', () => {
  it("sets the left and right light from the figure's two sides on a frame", () => {
    const r = fakeRenderer([N * 0.5, N * 0.5, N * 0.5], [N, N, N]);
    const f = figure();
    let t = 0;
    light = new StageLight(r, () => [f], { now: () => t });
    r.frame();
    expect(f.style.getPropertyValue('--light-r')).toBe('rgb(255, 255, 255)');
    // left: two thirds the left sample (0.625 lit), one third the head (centre x 500 → "right", 1)
    const leftLit = (2 * 0.625 + 1) / 3;
    const v = Math.round(leftLit * 255);
    expect(f.style.getPropertyValue('--light-l')).toBe(`rgb(${v}, ${v}, ${v})`);
    expect(f.style.getPropertyValue('--glow-l')).toBe('rgb(0, 0, 0)');
  });

  it('updates at most every 66 ms and writes only on change', () => {
    const r = fakeRenderer([N, N, N]);
    const f = figure();
    let t = 0;
    light = new StageLight(r, () => [f], { now: () => t });
    const set = vi.spyOn(f.style, 'setProperty');
    r.frame();
    const first = set.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    t = 30;
    r.light.left = r.light.right = [0, 0, 0];
    r.frame();
    expect(set.mock.calls.length).toBe(first); // too soon
    t = 100;
    r.frame();
    expect(set.mock.calls.length).toBeGreaterThan(first); // changed
    const second = set.mock.calls.length;
    t = 200;
    r.frame();
    expect(set.mock.calls.length).toBe(second); // same light: no writes
  });

  it('keeps the last light while lightAt is null (between rooms; Review Focus 3)', () => {
    const r = fakeRenderer([0, 0, 0]);
    const f = figure();
    let t = 0;
    light = new StageLight(r, () => [f], { now: () => t });
    r.frame();
    const before = f.style.getPropertyValue('--light-l');
    r.light.left = r.light.right = null;
    t = 100;
    r.frame();
    expect(f.style.getPropertyValue('--light-l')).toBe(before);
  });

  it('a figure without a sprite gets one uniform light, as a brightness (Review Focus 4)', () => {
    const r = fakeRenderer([N * 0.5, N * 0.5, N * 0.5], [N, N, N]);
    const f = figure('monogram');
    light = new StageLight(r, () => [f], { now: () => 0 });
    r.frame();
    // one sample at the centre (x 500 → "right", lit 1)
    expect(f.style.getPropertyValue('--fig-light')).toBe('1');
    expect(f.style.getPropertyValue('--light-l')).toBe('');
  });

  it('a figure that turns from a monogram into a sprite is lit at once, even when the numbers look alike (final review)', () => {
    // Uniform light whose luma equals its red share: the old one-number check would see "no change".
    const r = fakeRenderer([0, 0, 0]);
    const f = figure('monogram');
    let t = 0;
    light = new StageLight(r, () => [f], { now: () => t });
    r.frame();
    expect(f.style.getPropertyValue('--fig-light')).toBe(String(FIGURE_FLOOR));
    f.dataset.kind = 'sprite';
    t = 100;
    r.frame();
    expect(f.style.getPropertyValue('--light-l')).not.toBe('');
  });

  it('dispose stops updates', () => {
    const r = fakeRenderer([N, N, N]);
    const f = figure();
    light = new StageLight(r, () => [f], { now: () => 0 });
    light.dispose();
    r.frame();
    expect(f.style.getPropertyValue('--light-l')).toBe('');
  });
});
