import { describe, expect, it } from 'vitest';
import type { ScreenLights } from '../src/renderer';
import { FIGURE_LIGHT, keyLight, resolveFigureLight, toStage } from '../src/ui/figure-light-math';

const box = { left: 1000, top: 100, width: 400, height: 600 };
const lamp = (x: number, y: number, rgb: [number, number, number], radius = 500) => ({ pos: [x, y] as [number, number], radius, rgb });

describe('resolveFigureLight', () => {
  it('fills the defaults', () => {
    expect(resolveFigureLight(undefined)).toEqual({
      breath: false,
      depth: FIGURE_LIGHT.depth,
      rim: FIGURE_LIGHT.rim,
      key: { mode: 'auto', height: FIGURE_LIGHT.keyDrop, strength: FIGURE_LIGHT.keyStrength },
    });
    expect(FIGURE_LIGHT).toMatchObject({ fogFront: 0.5, depth: 140, rim: 0.9, rimPower: 2, flat: 0.75, keyStrength: 0.6, keySide: 0.9, keyDrop: 0.1, keyZ: 260, ceiling: 1.6 });
  });

  it('takes an automatic key strength, depth and rim', () => {
    expect(resolveFigureLight({ key: 'auto', keyStrength: 0.3, depth: 200, rim: 1.2, breath: true })).toEqual({ breath: true, depth: 200, rim: 1.2, key: { mode: 'auto', height: 0.1, strength: 0.3 } });
  });

  it('keeps a manual key\'s side, height, colour and strength', () => {
    expect(resolveFigureLight({ key: { side: 'left', height: 0.25, color: '#ff0000', strength: 0.8 } }).key).toEqual({ mode: 'manual', side: 'left', height: 0.25, color: [1, 0, 0], strength: 0.8 });
  });

  it('an off key has strength 0', () => {
    expect(resolveFigureLight({ key: 'off' }).key).toMatchObject({ mode: 'off', strength: 0 });
  });
});

describe('toStage', () => {
  it('scales positions and radii by the stage rect', () => {
    const sl: ScreenLights = { ambient: [0.5, 0.5, 0.5], lights: [lamp(1600, 800, [1, 1, 1], 320)] };
    const out = toStage(sl, { scale: 1.6, left: 0, top: 0, width: 2560, height: 1440 });
    expect(out.lights[0].pos).toEqual([1000, 500]);
    expect(out.lights[0].radius).toBe(200);
    expect(out.ambient).toEqual([0.5, 0.5, 0.5]);
  });

  it('takes off the bars beside a centred stage', () => {
    const out = toStage({ ambient: [0, 0, 0], lights: [lamp(260, 100, [1, 1, 1])] }, { scale: 1, left: 100, top: 50, width: 1600, height: 900 });
    expect(out.lights[0].pos).toEqual([160, 50]);
  });
});

describe('keyLight', () => {
  const auto = resolveFigureLight(undefined).key;

  it('sits on the side the light comes from, in its colour', () => {
    const k = keyLight({ ambient: [0, 0, 0], lights: [lamp(900, 280, [2, 0, 0])] }, box, auto);
    expect(k.pos[0]).toBeLessThan(box.left + box.width / 2);
    expect(k.pos[0]).toBeCloseTo(box.left + box.width / 2 - 0.9 * box.width);
    expect(k.pos[1]).toBeCloseTo(box.top + 0.1 * box.height);
    expect(k.hue).toEqual([1, 0, 0]);
    expect(k.strength).toBe(0.6);
  });

  it('defaults right, in white, when no lamp reaches her', () => {
    const k = keyLight({ ambient: [0, 0, 0], lights: [lamp(100, 100, [1, 1, 1], 50)] }, box, auto);
    expect(k.pos[0]).toBeGreaterThan(box.left + box.width / 2);
    expect(k.hue).toEqual([1, 1, 1]);
  });

  it('a manual key goes where it says, in its colour or the automatic one', () => {
    const sl: ScreenLights = { ambient: [0, 0, 0], lights: [lamp(1500, 280, [0, 0, 2])] };
    const set = resolveFigureLight({ key: { side: 'left', height: 0.5, color: '#00ff00', strength: 0.9 } }).key;
    const k = keyLight(sl, box, set);
    expect(k.pos[0]).toBeLessThan(box.left + box.width / 2);
    expect(k.pos[1]).toBeCloseTo(box.top + 0.5 * box.height);
    expect(k.hue).toEqual([0, 1, 0]);
    expect(k.strength).toBe(0.9);
    const own = keyLight(sl, box, resolveFigureLight({ key: { side: 'right', height: 0.5, strength: 0.9 } }).key);
    expect(own.hue).toEqual([0, 0, 1]);
  });

  it('an off key has strength 0', () => {
    expect(keyLight({ ambient: [0, 0, 0], lights: [] }, box, resolveFigureLight({ key: 'off' }).key).strength).toBe(0);
  });
});
