import { describe, expect, it } from 'vitest';
import { Graphics, Texture, TextureSource } from 'pixi.js';
import { EffectsLayer, type EffectsArt } from '../src/renderer/effects';
import type { LightDef, RoomState, SceneDef } from '../../shared/types';

const W = 1536, H = 864;
const screens: LightDef = { id: 'screens', label: 'screens', pos: [300, 300], color: '#7fe9ff', intensity: 0.4, radius: 200, flicker: 0, dust: true };

function scene(): SceneDef {
  return {
    id: 'fx', name: 'FX', description: '', resolution: [W, H],
    layers: [{ id: 'room', src: 'room.png', parallax: 0, emissive: 'room_e.png' }],
    lights: [screens],
    defaults: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' },
    presets: {},
    weatherHidden: true,
    effects: [
      { kind: 'screen', rect: [100, 100, 80, 60], light: 'screens', scroll: 12 },
      { kind: 'leds', rect: [600, 100, 40, 40] },
      { kind: 'lightning' },
    ],
    weatherArea: [[[1000, 50], [1200, 50], [1200, 250], [1000, 250]]],
  };
}

/** A glow map with two LED dots inside the leds box and one outside it. */
function art(over: Partial<EffectsArt> = {}): EffectsArt {
  const alpha = new Uint8Array(W * H);
  for (const [x, y] of [[610, 110], [611, 110], [620, 120], [900, 500]]) alpha[y * W + x] = 255;
  return { roomTexture: () => null, glowAlpha: () => ({ alpha, w: W }), ...over };
}

const room = (weather: 'none' | 'rain', level: number, intensity = 0.4): RoomState => ({
  sceneId: 'fx',
  lights: [{ ...screens, intensity }],
  atmosphere: { ambient: '#1a1030', ambientLevel: 0.35, weather, weatherLevel: level, fog: 0, timeOfDay: 'night' },
});

/** Runs `seconds` of frames; returns the strikes seen and the highest flash. */
function run(layer: EffectsLayer, state: RoomState, seconds: number, from = 0) {
  let strikes = 0, maxFlash = 0;
  layer.onStrike(() => strikes++);
  for (let t = from; t < from + seconds; t += 0.25) {
    layer.update({ dt: 0.25, t, state });
    maxFlash = Math.max(maxFlash, layer.state().flash);
  }
  return { strikes, maxFlash };
}

describe('EffectsLayer', () => {
  it('builds one effect per def and counts LED dots', () => {
    const layer = new EffectsLayer(scene(), art(), { reducedMotion: false, seed: 1 });
    layer.update({ dt: 0.1, t: 0, state: room('none', 0) });
    const s = layer.state();
    expect(s.screens.map((x) => x.on)).toEqual([true]);
    expect(s.leds).toBe(2);
    expect(s.dust).toBe(12); // round(30 × 0.4)
    expect(s.disabled).toEqual([]);
  });

  it("a light's dust amount scales its motes", () => {
    const heavy = { ...scene(), lights: [{ ...screens, dust: 2.5 }] };
    const layer = new EffectsLayer(heavy, art(), { reducedMotion: false, seed: 1 });
    layer.update({ dt: 0.1, t: 0, state: { ...room('none', 0), lights: heavy.lights } });
    expect(layer.state().dust).toBe(30); // round(30 × 2.5 × 0.4)
  });

  it('a screen reports off once its light is at 0 for 0.4 s', () => {
    const layer = new EffectsLayer(scene(), art(), { reducedMotion: false, seed: 1 });
    layer.update({ dt: 0.1, t: 0, state: room('none', 0) });
    run(layer, room('none', 0, 0), 0.5, 0.1);
    expect(layer.state().screens.map((x) => x.on)).toEqual([false]);
  });

  it('a storm emits strikes to onStrike; below 0.7 none', () => {
    const calm = new EffectsLayer(scene(), art(), { reducedMotion: false, seed: 2 });
    expect(run(calm, room('rain', 0.6), 300).strikes).toBe(0);
    const storm = new EffectsLayer(scene(), art(), { reducedMotion: false, seed: 2 });
    const { strikes, maxFlash } = run(storm, room('rain', 1), 300);
    expect(strikes).toBeGreaterThan(10);
    expect(maxFlash).toBeGreaterThan(0);
    expect(storm.state().strikes).toBe(strikes);
  });

  it('destroy stops strikes: no onStrike after destroy (Review Focus 1)', () => {
    const layer = new EffectsLayer(scene(), art(), { reducedMotion: false, seed: 3 });
    let strikes = 0;
    layer.onStrike(() => strikes++);
    layer.destroy();
    for (let t = 0; t < 300; t += 0.25) layer.update({ dt: 0.25, t, state: room('rain', 1) });
    expect(strikes).toBe(0);
  });

  it('reduced motion: no dust, flash stays 0 while strikes still emit', () => {
    const layer = new EffectsLayer(scene(), art(), { reducedMotion: true, seed: 4 });
    const { strikes, maxFlash } = run(layer, room('rain', 1), 300);
    expect(strikes).toBeGreaterThan(0);
    expect(maxFlash).toBe(0);
    expect(layer.ambientLift()).toBe(0);
    expect(layer.state().dust).toBe(0);
  });

  it('a throwing effect is listed in disabled and the rest run', () => {
    const broken = art({
      roomTexture: () => {
        throw new Error('no pixels');
      },
    });
    const layer = new EffectsLayer(scene(), broken, { reducedMotion: false, seed: 5 });
    layer.update({ dt: 0.1, t: 0, state: room('none', 0) });
    expect(layer.state().disabled).toEqual(['effect 0 (screen) disabled: no pixels']);
    expect(layer.state().leds).toBe(2);
  });

  it('a room without effects or dust builds an empty layer', () => {
    const plain = { ...scene(), effects: undefined, lights: [{ ...screens, dust: undefined }] };
    const layer = new EffectsLayer(plain, art(), { reducedMotion: false, seed: 6 });
    layer.update({ dt: 0.1, t: 0, state: room('rain', 1) });
    expect(layer.state()).toMatchObject({ screens: [], leds: 0, dust: 0, strikes: 0, flash: 0, disabled: [] });
  });

  it("destroying the layer frees each screen's picture texture (no leak per room change)", () => {
    const made: Texture[] = [];
    const layer = new EffectsLayer(scene(), art({
      roomTexture: () => {
        const t = new Texture({ source: new TextureSource({ width: 80, height: 60 }) });
        made.push(t);
        return t;
      },
    }), { reducedMotion: false, seed: 7 });
    expect(made).toHaveLength(1);
    layer.destroy();
    expect(made[0].destroyed).toBe(true);
  });

  it('LEDs dim in the glow pass (under the bloom), not over the finished picture', () => {
    const layer = new EffectsLayer(scene(), art(), { reducedMotion: false, seed: 8 });
    expect(layer.glowView.children).toHaveLength(1);
    for (let t = 0; t < 5; t += 0.1) layer.update({ dt: 0.1, t, state: room('none', 0) });
    expect(layer.glowView.children.length).toBe(1);
    expect(layer.view.children.every((c) => !layer.glowView.children.includes(c))).toBe(true);
  });

  it('a strike says which room it came from', () => {
    const layer = new EffectsLayer(scene(), art(), { reducedMotion: false, seed: 9 });
    const seen: { sceneId: string }[] = [];
    layer.onStrike((s) => seen.push(s));
    for (let t = 0; t < 200; t += 0.25) layer.update({ dt: 0.25, t, state: room('rain', 1) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.sceneId === 'fx')).toBe(true);
  });

  it('a screen whose light glides to 0 never flares back up while it powers off (final review 2)', () => {
    const tex = () => new Texture({ source: new TextureSource({ width: 80, height: 60 }) });
    const layer = new EffectsLayer(scene(), art({ roomTexture: tex }), { reducedMotion: false, seed: 10 });
    let prev = Infinity;
    for (let t = 0; t < 3; t += 0.05) {
      const intensity = Math.max(0, 0.4 * (1 - t / 2)); // a 2 s glide to 0, then off
      layer.update({ dt: 0.05, t, state: room('none', 0, intensity) });
      const picture = layer.state().screens[0].picture;
      // CRT breathe/flicker may wobble ±4 %; it must never jump back up.
      expect(picture).toBeLessThanOrEqual(prev * 1.05 + 1e-6);
      prev = picture;
    }
    expect(layer.state().screens[0]).toMatchObject({ on: false, picture: 0 });
  });

  /** Runs a storm frame by frame until the first flash; returns the lightning drawing then. */
  const firstFlash = (sc: SceneDef) => {
    const layer = new EffectsLayer(sc, art(), { reducedMotion: false, seed: 9 });
    for (let t = 0; t < 300 && layer.state().flash <= 0; t += 0.05) layer.update({ dt: 0.05, t, state: room('rain', 1) });
    const gfx = layer.view.children.find((c) => c.label === 'lightning') as Graphics;
    const b = gfx.getLocalBounds();
    const alpha = (gfx.context.instructions[0].data as { style: { alpha: number } }).style.alpha;
    return { layer, bounds: [b.x, b.y, b.width, b.height], alpha };
  };

  it('the flash fills the area', () => {
    const { layer, bounds, alpha } = firstFlash(scene());
    expect(layer.state().flash).toBeGreaterThan(0);
    expect(bounds).toEqual([1000, 50, 200, 200]);
    expect(layer.state().flashArea).toBe('shapes');
    expect(alpha).toBeCloseTo(layer.state().flash, 6);
  });

  it('without an area the whole frame flashes at half', () => {
    const { layer, bounds, alpha } = firstFlash({ ...scene(), weatherArea: undefined });
    expect(bounds).toEqual([0, 0, W, H]);
    expect(layer.state().flashArea).toBe('frame');
    expect(alpha).toBeCloseTo(0.5 * layer.state().flash, 6);
  });

  it('overlapping shapes flash once: one fill, clipped by a mask of the shapes', () => {
    const sq = (x: number): [number, number][] => [[x, 50], [x + 150, 50], [x + 150, 250], [x, 250]];
    const { layer, bounds } = firstFlash({ ...scene(), weatherArea: [sq(1000), sq(1100)] });
    const gfx = layer.view.children.find((c) => c.label === 'lightning') as Graphics;
    expect(gfx.context.instructions).toHaveLength(1);
    expect(bounds).toEqual([1000, 50, 250, 200]);
    const mask = gfx.mask as Graphics;
    expect(mask).toBeInstanceOf(Graphics);
    const mb = mask.getLocalBounds();
    expect([mb.x, mb.y, mb.width, mb.height]).toEqual([1000, 50, 250, 200]);
  });

  /** The scene with glass on its window, in a room lit by `outside` through it. */
  const glassScene = (over: Partial<SceneDef> = {}): SceneDef => ({ ...scene(), weatherHidden: false, effects: [{ kind: 'glass', amount: 1 }], ...over });

  it('glass on a rainy window draws drops, clipped to the window, in their own view above the weather', () => {
    const layer = new EffectsLayer(glassScene(), art(), { reducedMotion: false, seed: 3 });
    run(layer, room('rain', 1), 2);
    expect(layer.state().glass).toBeGreaterThan(0);
    const root = layer.glassView.children.find((c) => c.label === 'glass')!;
    expect(root).toBeDefined();
    const mb = (root.mask as Graphics).getLocalBounds();
    expect([mb.x, mb.y, mb.width, mb.height]).toEqual([1000, 50, 200, 200]);
    expect(layer.view.children.some((c) => c.label === 'glass')).toBe(false);
  });

  it('glass stays dry without rain, and draws nothing in a room whose window is out of sight', () => {
    const dry = new EffectsLayer(glassScene(), art(), { reducedMotion: false, seed: 3 });
    run(dry, room('none', 0), 2);
    expect(dry.state().glass).toBe(0);
    const hidden = new EffectsLayer(glassScene({ weatherHidden: true }), art(), { reducedMotion: false, seed: 3 });
    run(hidden, room('rain', 1), 2);
    expect(hidden.state().glass).toBe(0);
    expect(hidden.glassView.children).toHaveLength(0);
  });

  it('a passing light comes now and then, inside its box; never with reduced motion', () => {
    const passScene: SceneDef = { ...scene(), effects: [{ kind: 'passing', rect: [400, 200, 300, 100], every: 5 }] };
    const lit = (reducedMotion: boolean) => {
      const layer = new EffectsLayer(passScene, art(), { reducedMotion, seed: 4 });
      const seen = [];
      for (let t = 0; t < 30; t += 0.05) {
        layer.update({ dt: 0.05, t, state: room('none', 0) });
        const l = layer.passingLight();
        if (l) seen.push(l);
      }
      return { seen, passes: layer.state().passes };
    };
    const { seen, passes } = lit(false);
    expect(seen.length).toBeGreaterThan(0);
    expect(passes).toBeGreaterThan(0);
    for (const l of seen) expect(l.pos[0] >= 400 && l.pos[0] <= 700 && l.pos[1] === 250).toBe(true);
    expect(lit(true).seen).toHaveLength(0);
  });

  it('a plume draws its puffs as sprites on the room, more with more amount, none with reduced motion', () => {
    const plumeScene = (amount: number): SceneDef => ({ ...scene(), effects: [{ kind: 'plume', rect: [700, 300, 40, 120], style: 'steam', amount }] });
    const puffs = (amount: number, reducedMotion = false) => {
      const layer = new EffectsLayer(plumeScene(amount), art(), { reducedMotion, seed: 2 });
      run(layer, room('none', 0), 1);
      return layer;
    };
    const one = puffs(1);
    expect(one.state().puffs).toBeGreaterThan(5);
    const root = one.view.children.find((c) => c.label === 'plume')!;
    expect(root.children.filter((c) => c.visible).length).toBe(one.state().puffs);
    expect(puffs(3).state().puffs).toBeGreaterThan(one.state().puffs);
    expect(puffs(1, true).state().puffs).toBe(0);
  });

  it('a room without lightning has no flash area', () => {
    const layer = new EffectsLayer({ ...scene(), effects: [] }, art(), { reducedMotion: false, seed: 1 });
    expect(layer.state().flashArea).toBeNull();
  });

  it('a static screen runs without room pixels, dims with its light, and frees its noise frames', () => {
    const fx = { ...scene(), effects: [{ kind: 'screen' as const, rect: [100, 100, 80, 60] as [number, number, number, number], light: 'screens', picture: 'static' as const }] };
    const layer = new EffectsLayer(fx, art(), { reducedMotion: false, seed: 11 });
    layer.update({ dt: 0.1, t: 0, state: room('none', 0) });
    const bright = layer.state().screens[0].picture;
    expect(bright).toBeGreaterThan(0.9);
    layer.update({ dt: 0.1, t: 0.1, state: room('none', 0, 0.2) });
    expect(layer.state().screens[0].picture).toBeCloseTo(bright / 2, 1);
    expect(layer.state().disabled).toEqual([]);
    const sprites = layer.view.children[0].children.filter((c) => 'tilePosition' in c) as unknown as { texture: Texture }[];
    expect(sprites).toHaveLength(2); // the snow and its rolling band
    const shown = sprites[0].texture;
    layer.update({ dt: 0.1, t: 0.2, state: room('none', 0) });
    expect(sprites[0].texture).not.toBe(shown);
    layer.destroy();
    expect(shown.destroyed).toBe(true);
  });
});

describe('screen roll bar', () => {
  /** Frames over 15 s (longer than the longest 12 s roll period) in which the screen's roll bar was drawn. */
  const rollFrames = (roll?: boolean) => {
    const sc = scene();
    sc.effects = [{ kind: 'screen', rect: [100, 100, 80, 60], light: 'screens', ...(roll === undefined ? {} : { roll }) }];
    const tex = () => new Texture({ source: new TextureSource({ width: 80, height: 60 }) });
    const layer = new EffectsLayer(sc, art({ roomTexture: tex }), { reducedMotion: false, seed: 3 });
    const bars = () => layer.view.children.flatMap((c) => ('children' in c ? c.children : [])).filter((c) => c.label === 'roll') as Graphics[];
    let drawn = 0;
    for (let t = 0; t < 15; t += 0.05) {
      layer.update({ dt: 0.05, t, state: room('none', 0) });
      if (bars().some((b) => b.context.instructions.length > 0)) drawn++;
    }
    return { drawn, bars: bars().length };
  };

  it('rolls by default', () => {
    const r = rollFrames();
    expect(r.bars).toBe(1);
    expect(r.drawn).toBeGreaterThan(0);
  });

  it('roll: false never draws the bar', () => {
    expect(rollFrames(false).drawn).toBe(0);
  });
});
