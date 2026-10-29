import { describe, expect, it, vi } from 'vitest';
import type { Atmosphere, RoomState, SceneDef } from '../../shared/types';
import { createPreview } from '../src/landing/preview';
import type { LandingAgent } from '../src/landing/landing';
import { createRoomAudio } from '../src/audio/room-audio';
import { DEFAULT_SOUND } from '../src/audio/settings';
import type { Renderer } from '../src/renderer';

const atmo = (o: Partial<Atmosphere> = {}): Atmosphere => ({ ambient: '#000000', ambientLevel: 0.3, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night', ...o });
const scene = (id: string, a: Partial<Atmosphere> = {}): SceneDef => ({ id, name: id, description: '', resolution: [480, 270], layers: [], lights: [], defaults: atmo(a), presets: {} });
const PACK = { base: '/scenes/default/', scenes: [scene('workspace', { weather: 'rain', weatherLevel: 0.3 }), scene('rooftop')] };
const agent = (o: Partial<LandingAgent> & { id: string }): LandingAgent => ({
  name: o.id, pronoun: 'she', description: '', accent: '#fff', avatarKind: 'monogram', rooms: ['default/workspace'], startRoom: 'default/workspace', legacyDistrict: null, group: null, connected: true, backend: 'direct', modelLabel: null, connectionError: null, link: 'ok', room: null, recaps: {}, sprite: null, start: null,
  tagline: '', bio: [], facts: [], face: { x: 0.5, y: 0.08 }, thumb: null, ...o,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  document.body.innerHTML = '<div id="stage"></div>';
  const audio = { room: vi.fn() };
  const preview = createPreview(document.getElementById('stage')!, async () => PACK, { audio, createRenderer: () => Promise.reject(new Error('no WebGL in jsdom')) });
  return { audio, preview };
}

function fakeRenderer() {
  return {
    loadScene: vi.fn(async () => {}),
    applyState: vi.fn(),
    playTransition: vi.fn(async (_kind: string, swap: () => Promise<void>) => swap()),
    setMaxFps: vi.fn(),
    onStrike: vi.fn(),
    setPaused: vi.fn(),
    nonBlank: vi.fn(() => true),
    setBackdropBrightness: vi.fn(),
  };
}

const SPLASH_PACK = { base: '/scenes/lowlight/', scenes: [scene('splash', { weather: 'rain', weatherLevel: 0.35 })] };

function setupWith(r: ReturnType<typeof fakeRenderer> | null, splashPack = SPLASH_PACK) {
  document.body.innerHTML = '<div id="stage"></div>';
  const audio = { room: vi.fn() };
  const packScenes = async (pack: string) => (pack === 'lowlight' ? splashPack : PACK);
  const preview = createPreview(document.getElementById('stage')!, packScenes, {
    audio,
    createRenderer: () => (r ? Promise.resolve(r as unknown as Renderer) : Promise.reject(new Error('no WebGL in jsdom'))),
  });
  return { audio, preview };
}

describe('landing splash', () => {
  it('showSplash draws lowlight/splash at its defaults and plays no room sound', async () => {
    const r = fakeRenderer();
    const { audio, preview } = setupWith(r);
    expect(await preview.showSplash()).toBe(true);
    expect(r.loadScene).toHaveBeenCalledWith(SPLASH_PACK.scenes[0], '/scenes/lowlight/');
    expect(r.applyState).toHaveBeenCalledWith({ sceneId: 'splash', lights: [], atmosphere: SPLASH_PACK.scenes[0].defaults }, 0);
    expect(audio.room).not.toHaveBeenCalled();
    expect(preview.nonBlank()).toBe(true);
  });

  it('the bars land at 35 % on the splash and under a dimmed room alike (the landing dims a room to 45 %)', async () => {
    const r = fakeRenderer();
    const { preview } = setupWith(r);
    await preview.show(agent({ id: 'case' }));
    expect(r.setBackdropBrightness.mock.calls.at(-1)![0]).toBeCloseTo(0.35 / 0.45, 6);
    await preview.showSplash();
    expect(r.setBackdropBrightness).toHaveBeenLastCalledWith(0.35);
  });

  it('without a renderer showSplash is false and nonBlank is false', async () => {
    const { preview } = setupWith(null);
    expect(await preview.showSplash()).toBe(false);
    expect(preview.nonBlank()).toBe(false);
  });

  it('a missing splash scene returns false and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { preview } = setupWith(fakeRenderer(), { base: '/scenes/lowlight/', scenes: [] });
    expect(await preview.showSplash()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('show with a transition swaps scenes inside playTransition', async () => {
    const r = fakeRenderer();
    const { preview } = setupWith(r);
    await preview.show(agent({ id: 'case' }), { transition: 'glitch' });
    expect(r.playTransition).toHaveBeenCalledWith('glitch', expect.any(Function));
    expect(r.loadScene).toHaveBeenLastCalledWith(PACK.scenes[0], '/scenes/default/');
  });

  it('show with a glitch transition passes it to audio.room', async () => {
    const r = fakeRenderer();
    const { audio, preview } = setupWith(r);
    await preview.show(agent({ id: 'case' }), { transition: 'glitch' });
    expect(audio.room).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), 'glitch');
  });

  it('glitch() plays the glitch transition with a no-op swap and keeps the scene', async () => {
    const r = fakeRenderer();
    const { preview } = setupWith(r);
    await preview.show(agent({ id: 'case' }));
    r.loadScene.mockClear();
    await preview.glitch();
    expect(r.playTransition).toHaveBeenCalledWith('glitch', expect.any(Function));
    const [, swap] = r.playTransition.mock.calls.at(-1)!;
    await swap();
    expect(r.loadScene).not.toHaveBeenCalled();
  });

  it('glitch() without a renderer resolves without throwing', async () => {
    const { preview } = setupWith(null);
    await expect(preview.glitch()).resolves.toBeUndefined();
  });

  it('the skyline is drawn undimmed; the rooms after it are dimmed as before', async () => {
    const r = fakeRenderer();
    const { preview } = setupWith(r);
    const stage = document.getElementById('stage')!;
    await preview.showSplash();
    expect(stage.classList.contains('splash-stage')).toBe(true);
    await preview.show(agent({ id: 'case' }), { transition: 'glitch' });
    expect(stage.classList.contains('splash-stage')).toBe(false);
  });
});

describe('landing ambience', () => {
  it("plays the selected agent's saved room, gliding over 1 s — even without a renderer", async () => {
    const { audio, preview } = setup();
    const saved: RoomState = { sceneId: 'rooftop', lights: [], atmosphere: atmo({ weather: 'dust', weatherLevel: 0.6 }) };
    await preview.show(agent({ id: 'alpha', room: { scene: 'Rooftop', weather: 'dust', weatherLevel: 0.6, fog: 0, state: saved } }));
    await flush();
    expect(audio.room).toHaveBeenCalledWith(saved, PACK.scenes[1], '/scenes/default/', 1, undefined);
  });

  it("an agent with no saved room gets her pack's first scene at its defaults", async () => {
    const { audio, preview } = setup();
    await preview.show(agent({ id: 'case' }));
    await flush();
    expect(audio.room).toHaveBeenCalledWith({ sceneId: 'workspace', lights: [], atmosphere: PACK.scenes[0].defaults }, PACK.scenes[0], '/scenes/default/', 1, undefined);
  });

  it('runs at a quarter level, waits for a gesture, and respects mute', () => {
    const engine = {
      unlock: vi.fn(() => true), apply: vi.fn(), music: vi.fn(), tick: vi.fn(), setMaster: vi.fn(), setChannel: vi.fn(), setScale: vi.fn(), suspend: vi.fn(), resume: vi.fn(), burst: vi.fn(), oneShot: vi.fn(), preload: vi.fn(), thunder: vi.fn(), cancelThunder: vi.fn(),
      state: vi.fn(() => ({ available: true, unlocked: true, context: 'running', voices: [], mix: null })),
    };
    const muted = { ...DEFAULT_SOUND, muted: true };
    const audio = createRoomAudio({ engine, scale: 0.25, settings: { load: () => structuredClone(muted), save: () => {} } });
    expect(engine.setScale).toHaveBeenCalledWith(0.25);
    expect(engine.setMaster).toHaveBeenCalledWith(0.6, true);
    audio.room({ sceneId: 'workspace', lights: [], atmosphere: atmo() }, PACK.scenes[0], '/scenes/default/', 1);
    expect(engine.apply).not.toHaveBeenCalled();
    audio.gesture();
    expect(engine.apply).toHaveBeenCalledTimes(1);
  });
});

describe('the select preview shows her start room', () => {
  it("asks for her start room's district and shows that room", async () => {
    document.body.innerHTML = '<div id="stage"></div>';
    const audio = { room: vi.fn() };
    const pack = vi.fn(async () => PACK);
    const preview = createPreview(document.getElementById('stage')!, pack, { audio, createRenderer: () => Promise.reject(new Error('no WebGL in jsdom')) });
    await preview.show(agent({ id: 'cass', rooms: ['default/rooftop'], startRoom: 'default/rooftop' }));
    await flush();
    expect(pack).toHaveBeenCalledWith('default');
    expect((audio.room.mock.calls.at(-1) as unknown[])[1]).toMatchObject({ id: 'rooftop' });
  });
});

describe('the select preview shows where she is', () => {
  it('her saved room, in another district than her start, with its saved state', async () => {
    document.body.innerHTML = '<div id="stage"></div>';
    const audio = { room: vi.fn() };
    const RIBBON = { base: '/scenes/ribbon/', scenes: [scene('lowlight-intake'), scene('noodle-stall')] };
    const pack = vi.fn(async (d: string) => (d === 'ribbon' ? RIBBON : PACK));
    const preview = createPreview(document.getElementById('stage')!, pack, { audio, createRenderer: () => Promise.reject(new Error('no WebGL in jsdom')) });
    const saved: RoomState = { sceneId: 'ribbon/noodle-stall', lights: [], atmosphere: atmo({ fog: 0.7 }) };
    await preview.show(agent({ id: 'nix', startRoom: 'default/workspace', room: { scene: 'Noodle Stall', weather: 'none', weatherLevel: 0, fog: 0.7, state: saved } }));
    await flush();
    expect(pack).toHaveBeenCalledWith('ribbon');
    const [state, shown] = audio.room.mock.calls.at(-1) as [RoomState, SceneDef];
    expect(shown.id).toBe('noodle-stall');
    expect(state.atmosphere.fog).toBe(0.7);
  });
});
