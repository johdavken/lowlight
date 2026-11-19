import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomFinish, ScreenLights } from '../src/renderer';
import { BREATH, breathAt } from '../src/ui/figure-breath';
import { FigureLight, figureLightMode, litCanvasSize, type LitSurface, type LitUniforms } from '../src/ui/figure-light';
import type { FigureArt } from '../src/ui/stage';

const rect = { scale: 1, left: 0, top: 0, width: 1600, height: 900 };

/** A fake image loader whose loads each resolve when the test says. */
function loader() {
  const pending = new Map<string, (ok: boolean) => void>();
  const loadImage = vi.fn(
    (url: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        pending.set(url, (ok) => resolve(ok ? ({ src: url } as HTMLImageElement) : null));
      }),
  );
  const finish = async (url: string, ok = true) => {
    pending.get(url)!(ok);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { loadImage, finish };
}

/** A fake GL surface: records what it was given. */
function surfaces() {
  const made: { canvas: HTMLCanvasElement; arts: string[]; draws: LitUniforms[] }[] = [];
  const surface = (): LitSurface => {
    const rec = { canvas: document.createElement('canvas'), arts: [] as string[], draws: [] as LitUniforms[] };
    made.push(rec);
    return {
      canvas: rec.canvas,
      setArt: (art, map) => rec.arts.push(`${art.base.src}|${map.src}`),
      draw: (u) => rec.draws.push(u),
      dispose: () => {},
    };
  };
  return { made, surface };
}

function renderer(lights: () => ScreenLights | null, finish?: () => RoomFinish | null) {
  const frames: (() => void)[] = [];
  return {
    r: { screenLights: lights, onFrame: (fn: () => void) => (frames.push(fn), () => {}), ...(finish ? { finish } : {}) },
    frame: () => frames.forEach((f) => f()),
  };
}

function figure(side: 'left' | 'right' = 'right'): HTMLElement {
  const fig = document.createElement('div');
  fig.className = `stage-figure stage-${side}`;
  const art = document.createElement('div');
  art.className = 'stage-art';
  // jsdom lays nothing out: her art box on screen, as the stage would place it.
  art.getBoundingClientRect = () => ({ left: 1000, top: 100, width: 400, height: 600, right: 1400, bottom: 700, x: 1000, y: 100, toJSON: () => ({}) });
  fig.append(art);
  document.body.append(fig);
  return fig;
}

const art = (base: string, face: string | null = null): FigureArt => ({ base, face, from: null, step: 8, steps: 8, pixel: true, waist: 0.4, facePoint: { x: 0.5, y: 0.1 }, lights: null });
const LIGHTS: ScreenLights = { ambient: [0.5, 0.5, 0.5], lights: [{ pos: [100, 100], radius: 400, rgb: [1, 1, 1] }] };

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('figureLightMode', () => {
  it('lights only where it can', () => {
    expect(figureLightMode({ firefox: true, webgl2: true, on: true })).toBe('tint');
    expect(figureLightMode({ firefox: false, webgl2: false, on: true })).toBe('tint');
    expect(figureLightMode({ firefox: false, webgl2: true, on: false })).toBe('tint');
    expect(figureLightMode({ firefox: false, webgl2: true, on: true })).toBe('lit');
  });
});

describe('FigureLight', () => {
  it('lights a figure once its art and map load, through its map url', async () => {
    const { loadImage, finish } = loader();
    const { made, surface } = surfaces();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface, lit: true });
    const fig = figure();
    fl.art(fig, art('/api/agents/ember/outfit/home'));
    await finish('/api/agents/ember/outfit/home');
    await finish('/api/agents/ember/outfit/home?normal=1');
    expect(fig.hasAttribute('data-lit')).toBe(true);
    expect(fig.querySelector('.stage-art canvas.stage-lit')).not.toBeNull();
    expect(made[0].arts).toEqual(['/api/agents/ember/outfit/home|/api/agents/ember/outfit/home?normal=1']);
    expect(loadImage).toHaveBeenCalledWith('/api/agents/ember/outfit/home?normal=1');
  });

  it('a map url keeps the route\'s own query', async () => {
    const { loadImage } = loader();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface: surfaces().surface, lit: true });
    fl.art(figure(), art('/api/persona/sprite?as=hicks'));
    expect(loadImage).toHaveBeenCalledWith('/api/persona/sprite?as=hicks&normal=1');
  });

  it('a stale art() never applies', async () => {
    const { loadImage, finish } = loader();
    const { made, surface } = surfaces();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface, lit: true });
    const fig = figure();
    fl.art(fig, art('/a.png'));
    fl.art(fig, art('/b.png'));
    await finish('/b.png');
    await finish('/b.png?normal=1');
    await finish('/a.png');
    await finish('/a.png?normal=1');
    expect(made[0].arts).toEqual(['/b.png|/b.png?normal=1']);
  });

  it('a failed map leaves the tint', async () => {
    const { loadImage, finish } = loader();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface: surfaces().surface, lit: true });
    const fig = figure();
    fl.art(fig, art('/a.png'));
    await finish('/a.png');
    await finish('/a.png?normal=1', false);
    expect(fig.hasAttribute('data-lit')).toBe(false);
    expect(fig.querySelector('canvas')).toBeNull();
  });

  it('null art (not a sprite) and switching off put the tint back', async () => {
    const { loadImage, finish } = loader();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface: surfaces().surface, lit: true });
    const fig = figure();
    fl.art(fig, art('/a.png'));
    await finish('/a.png');
    await finish('/a.png?normal=1');
    fl.setOn(false);
    expect(fig.hasAttribute('data-lit')).toBe(false);
    fl.setOn(true);
    expect(fig.hasAttribute('data-lit')).toBe(true);
    fl.art(fig, null);
    expect(fig.hasAttribute('data-lit')).toBe(false);
  });

  it('in tint mode it never loads or lights', () => {
    const { loadImage } = loader();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface: surfaces().surface, lit: false });
    const fig = figure();
    fl.art(fig, art('/a.png'));
    expect(loadImage).not.toHaveBeenCalled();
    expect(fig.hasAttribute('data-lit')).toBe(false);
  });

  it('draws nothing new while screenLights() is null', async () => {
    vi.useFakeTimers();
    let lights: ScreenLights | null = LIGHTS;
    const rr = renderer(() => lights);
    const { loadImage, finish } = loader();
    const { made, surface } = surfaces();
    const fl = new FigureLight(rr.r, () => rect, { loadImage, surface, lit: true });
    fl.art(figure(), art('/a.png'));
    await finish('/a.png');
    await finish('/a.png?normal=1');
    const before = made[0].draws.length;
    lights = null;
    vi.advanceTimersByTime(100);
    rr.frame();
    expect(made[0].draws.length).toBe(before);
    lights = LIGHTS;
    vi.advanceTimersByTime(100);
    rr.frame();
    expect(made[0].draws.length).toBe(before + 1);
  });

  it('draws with the room\'s settings in stage units', async () => {
    const { loadImage, finish } = loader();
    const { made, surface } = surfaces();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => ({ scale: 2, left: 0, top: 0, width: 3200, height: 1800 }), { loadImage, surface, lit: true });
    fl.setRoom({ depth: 300, key: 'off' });
    fl.art(figure(), art('/a.png'));
    await finish('/a.png');
    await finish('/a.png?normal=1');
    const u = made[0].draws.at(-1)!;
    expect(u.light.depth).toBe(300);
    expect(u.key.strength).toBe(0);
    expect(u.lights.lights[0].radius).toBe(200);
  });

  it('a new base (outfit or person) drops the old lit canvas until its own map is in', async () => {
    const { loadImage, finish } = loader();
    const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface: surfaces().surface, lit: true });
    const fig = figure();
    fl.art(fig, art('/a.png'));
    await finish('/a.png');
    await finish('/a.png?normal=1');
    expect(fig.hasAttribute('data-lit')).toBe(true);
    fl.art(fig, art('/a.png', '/face.png'));
    expect(fig.hasAttribute('data-lit')).toBe(true);
    fl.art(fig, art('/b.png'));
    expect(fig.hasAttribute('data-lit')).toBe(false);
    await finish('/b.png');
    await finish('/b.png?normal=1');
    expect(fig.hasAttribute('data-lit')).toBe(true);
  });

  describe('the room\'s finish (fog, vignette, scanlines)', () => {
    const ROOM: RoomFinish = {
      fog: { rgb: [0.2, 0.1, 0.3], alpha: 0.12 },
      crt: { on: true, lineWidth: 2.29, lineContrast: 0.15, vignetting: 0.35, vignettingAlpha: 0.8, vignettingBlur: 0.35 },
      frame: { left: 0, top: 0, width: 1600, height: 900 },
      dpr: 1,
    };
    const lit = async (finish?: () => RoomFinish | null) => {
      const { loadImage, finish: done } = loader();
      const { made, surface } = surfaces();
      const fl = new FigureLight(renderer(() => LIGHTS, finish).r, () => rect, { loadImage, surface, lit: true });
      fl.art(figure(), art('/a.png'));
      await done('/a.png');
      await done('/a.png?normal=1');
      return made[0].draws.at(-1)!;
    };

    it('a draw carries the room\'s finish and her art box on screen', async () => {
      const u = await lit(() => ROOM);
      expect(u.finish).toEqual({ room: ROOM, screen: { left: 1000, top: 100, width: 400, height: 600 }, viewportH: window.innerHeight });
    });

    it('a renderer without a finish draws her unfinished', async () => {
      expect((await lit()).finish).toBeUndefined();
    });

    it('between rooms (no finish yet) she is drawn without one', async () => {
      expect((await lit(() => null)).finish).toBeUndefined();
    });
  });

  describe('litCanvasSize', () => {
    const art = { w: 512, h: 768 };
    const screen = { left: 0, top: 100, width: 690, height: 1035 };

    it('unfinished: her art grid, all of her', () => {
      expect(litCanvasSize({ art })).toEqual({ w: 512, h: 768, visible: 1 });
    });

    it('finished with scanlines: screen resolution, only the part of her on screen', () => {
      // 1035 tall from y 100 in a 900 window: 800 px of her show.
      expect(litCanvasSize({ art, finish: { screen, dpr: 1, crt: true, viewportH: 900 } })).toEqual({ w: 690, h: 800, visible: 800 / 1035 });
    });

    it('never below her art grid (RENDER SCALE 50)', () => {
      const out = litCanvasSize({ art, finish: { screen, dpr: 0.5, crt: true, viewportH: 2000 } });
      expect(out.h).toBeGreaterThanOrEqual(768);
      expect(out.w).toBeGreaterThanOrEqual(512);
    });

    it('scanlines off: back to her art grid, still only the part on screen', () => {
      expect(litCanvasSize({ art, finish: { screen, dpr: 2, crt: false, viewportH: 900 } })).toEqual({ w: 512, h: Math.round(768 * (800 / 1035)), visible: 800 / 1035 });
    });
  });

  it('a finished draw says how much of her is on screen', async () => {
    const before = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    try {
      const { loadImage, finish } = loader();
      const { made, surface } = surfaces();
      const ROOM = { fog: { rgb: [0, 0, 0] as [number, number, number], alpha: 0 }, crt: { on: true, lineWidth: 2.29, lineContrast: 0.15, vignetting: 0.35, vignettingAlpha: 0.8, vignettingBlur: 0.35 }, frame: { left: 0, top: 0, width: 1600, height: 900 }, dpr: 1 };
      const fl = new FigureLight(renderer(() => LIGHTS, () => ROOM).r, () => rect, { loadImage, surface, lit: true });
      fl.art(figure(), art('/a.png'));
      await finish('/a.png');
      await finish('/a.png?normal=1');
      // Her art box is 600 tall from y 100: 400 px of her show in a 500 px window.
      expect(made[0].draws.at(-1)!.finish!.viewportH).toBe(500);
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: before, configurable: true });
    }
  });

  describe('breath', () => {
    const lit = async (o: { side?: 'left' | 'right'; mirror?: boolean; breath?: boolean; weather?: string; reducedMotion?: boolean; now?: number; speaking?: boolean; comms?: boolean } = {}) => {
      const { loadImage, finish } = loader();
      const { made, surface } = surfaces();
      const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface, lit: true, reducedMotion: o.reducedMotion ?? false, now: () => o.now ?? 1000 });
      fl.setRoom({ breath: o.breath ?? true });
      if (o.weather) fl.setWeather(o.weather);
      const fig = figure(o.side);
      if (o.mirror) fig.setAttribute('data-mirror', '');
      if (o.speaking) fig.classList.add('speaking');
      if (o.comms) fig.setAttribute('data-comms', '');
      fl.art(fig, { ...art('/a.png'), waist: 0.4, facePoint: { x: 0.45, y: 0.1 } });
      await finish('/a.png');
      await finish('/a.png?normal=1');
      return made[0].draws.at(-1)!.breath!;
    };

    it('a draw carries her breath level, the out-breath, her mouth, her waist, which way she faces and the fog\'s density', async () => {
      // 1000 s in, the right figure (phase 0.37) listening: breathAt(1000, 0.37, false).
      const b = await lit();
      const want = breathAt(1000, 0.37, false);
      expect(b).not.toHaveProperty('lift');
      expect(b.swell).toBe(want.level);
      expect(b.puff).toBe(want.puff);
      expect(b.mouth.x).toBeCloseTo(0.45);
      expect(b.mouth.y).toBeCloseTo(0.135);
      expect(b.waist).toBe(0.4);
      // The cast's art is all drawn facing right: she breathes that way, wherever she stands.
      expect(b.faceDir).toBe(1);
      expect(b.density).toBe(1);
    });

    it('speaking breathes on the speaking cycle; the left figure has its own phase; MIRROR turns her breath with her', async () => {
      const b = await lit({ side: 'left', speaking: true, now: 7 });
      expect(b.swell).toBe(breathAt(7, 0, true).level);
      expect(b.faceDir).toBe(1);
      expect((await lit({ side: 'left', mirror: true })).faceDir).toBe(-1);
      expect((await lit({ side: 'right', mirror: true })).faceDir).toBe(-1);
    });

    it('no breath fog where the room has none', async () => {
      // A moment on the out-breath, where an open-air room would puff.
      const t = BREATH.listen.period * (1 - BREATH.exhale / 2) - 0.37 * BREATH.listen.period + 10 * BREATH.listen.period;
      expect((await lit({ breath: true, now: t })).puff).toBeGreaterThan(0);
      expect((await lit({ breath: false, now: t })).puff).toBe(-1);
    });

    it('on the line (her comms figure) she breathes but puffs no fog: she isn\'t in this room', async () => {
      const t = BREATH.listen.period * (1 - BREATH.exhale / 2) - 0.37 * BREATH.listen.period + 10 * BREATH.listen.period;
      expect((await lit({ comms: true, now: t })).puff).toBe(-1);
    });

    it('reduced motion: still, no puff, no swell', async () => {
      const t = BREATH.listen.period * (1 - BREATH.exhale / 2) - 0.37 * BREATH.listen.period + 10 * BREATH.listen.period;
      expect(await lit({ reducedMotion: true, now: t })).toMatchObject({ puff: -1, swell: 0 });
    });

    it('her chest swells with her breath level', async () => {
      expect((await lit({ now: 1000 })).swell).toBe(breathAt(1000, 0.37, false).level);
    });

    it('rain or snow thickens the fog', async () => {
      expect((await lit({ weather: 'rain' })).density).toBe(1.4);
      expect((await lit({ weather: 'snow' })).density).toBe(1.4);
      expect((await lit({ weather: 'none' })).density).toBe(1);
    });
  });

  describe('her lights (clicked lights)', () => {
    const draw = async (lights: FigureArt['lights']) => {
      const { loadImage, finish } = loader();
      const { made, surface } = surfaces();
      const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface, lit: true, now: () => 12 });
      fl.art(figure(), { ...art('/a.png'), lights });
      await finish('/a.png');
      await finish('/a.png?normal=1');
      return made[0].draws.at(-1)!;
    };

    it('a draw carries her lights and their pulse', async () => {
      const lights = [{ x: 0.6, y: 0.08, r: 0.012, color: '#ff8800' }, { x: 0.4, y: 0.1, r: 0.02, color: '#00ffcc' }];
      const u = await draw(lights);
      expect(u.glow!.points).toEqual(lights);
      expect(u.glow!.pulse).toHaveLength(2);
      for (const p of u.glow!.pulse) {
        expect(p).toBeGreaterThanOrEqual(0.8);
        expect(p).toBeLessThanOrEqual(1);
      }
      // Each light pulses on its own.
      expect(u.glow!.pulse[0]).not.toBe(u.glow!.pulse[1]);
    });

    it('reduced motion: her lights hold still at full brightness', async () => {
      const { loadImage, finish } = loader();
      const { made, surface } = surfaces();
      const fl = new FigureLight(renderer(() => LIGHTS).r, () => rect, { loadImage, surface, lit: true, now: () => 12, reducedMotion: true });
      fl.art(figure(), { ...art('/a.png'), lights: [{ x: 0.6, y: 0.08, r: 0.012, color: '#ff8800' }, { x: 0.4, y: 0.1, r: 0.02, color: '#00ffcc' }] });
      await finish('/a.png');
      await finish('/a.png?normal=1');
      expect(made[0].draws.at(-1)!.glow!.pulse).toEqual([1, 1]);
    });

    it('a figure without lights draws none', async () => {
      expect((await draw(null)).glow).toBeUndefined();
    });
  });
});
