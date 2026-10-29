import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SceneRegistry } from '../src/scenes';
import { Room, type RoomChange, completeSceneId, powerOutState, roomChanges } from '../src/room-state';
import { generateScenes } from '../../tools/gen-placeholders';
import type { RoomState } from '../../shared/types';
import { withBase } from '../../shared/light-share';

let tmpDir: string;
let registry: SceneRegistry;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-room-state-'));
  await generateScenes(tmpDir);
  // The intake's window neon is light from outside the room.
  const intake = path.join(tmpDir, 'lowlight-intake', 'scene.json');
  const def = JSON.parse(fs.readFileSync(intake, 'utf8'));
  def.lights.find((l: { id: string }) => l.id === 'window_neon').outside = true;
  fs.writeFileSync(intake, JSON.stringify(def));
  // The stall has a power cut mood (blackouts phase 3 §3).
  const stall = path.join(tmpDir, 'noodle-stall', 'scene.json');
  const sdef = JSON.parse(fs.readFileSync(stall, 'utf8'));
  sdef.lights.find((l: { id: string }) => l.id === 'sign_upper').outside = true;
  sdef.presets['power-cut'] = { ambientLevel: 0.05, lights: { stall_lantern: { intensity: 0 }, sign_upper: { intensity: 0 } } };
  fs.writeFileSync(stall, JSON.stringify(sdef));
  const { registry: reg, errors } = await SceneRegistry.load(tmpDir);
  expect(errors).toEqual([]);
  registry = reg;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function listen(room: Room): RoomChange[] {
  const changes: RoomChange[] = [];
  room.onChange((c) => changes.push(c));
  return changes;
}

describe('Room', () => {
  it('starts on the first scene with its default lights and atmosphere', () => {
    const room = new Room(registry);
    const first = registry.first();
    expect(room.state.sceneId).toBe(first.id);
    expect(room.state.lights).toEqual(withBase(first.lights));
    expect(room.state.atmosphere).toEqual(first.defaults);
  });

  it('summary() formats the scene, atmosphere and lights', () => {
    const room = new Room(registry);
    expect(room.summary()).toBe(
      '[room: lowlight-intake "Lowlight Intake" · ambient #1a1030 35% · rain 70% · fog 20% · lights: desk_lamp "desk lamp" #ffb347 60%, window_neon "pink neon through the window" #ff3c8a 80% outside, monitor "intake terminal glow" #7fe9ff 35% · moods: after-hours, storm, closing, late, quiet, tense · places: noodle-stall "Noodle Stall", ribbon-rooftop "Ribbon Rooftop"]',
    );
  });

  it('summary() reads "clear" when weather is none', () => {
    const room = new Room(registry);
    room.setAtmosphere({ weather: 'none' }, 'dev');
    expect(room.summary()).toContain('· clear ·');
  });

  it('a 0–1 level given as a percentage (2–100) is read as one, and says so', () => {
    const room = new Room(registry);
    const result = room.setLight({ light_id: 'desk_lamp', intensity: 25, flicker: 10 }, 'agent');
    expect(result.ok && result.text).toContain('intensity 25 read as 25%');
    const lamp = room.state.lights.find((l) => l.id === 'desk_lamp');
    expect(lamp?.intensity).toBe(0.25);
    expect(lamp?.flicker).toBe(0.1);
    room.setAmbient({ level: 20 }, 'agent');
    room.setAtmosphere({ weather_level: 50, fog: 5 }, 'agent');
    expect(room.state.atmosphere).toMatchObject({ ambientLevel: 0.2, weatherLevel: 0.5, fog: 0.05 });
    room.setLight({ light_id: 'desk_lamp', intensity: 250 }, 'agent');
    expect(room.state.lights.find((l) => l.id === 'desk_lamp')?.intensity).toBe(1);
  });

  it('setLight clamps intensity, emits one event, and reports the clamp', () => {
    const room = new Room(registry);
    const changes = listen(room);
    const result = room.setLight({ light_id: 'desk_lamp', intensity: 1.4 }, 'agent');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('intensity clamped to 1');
    expect(room.state.lights.find((l) => l.id === 'desk_lamp')?.intensity).toBe(1);
    expect(changes).toHaveLength(1);
    expect(changes[0].duration).toBe(1.5);
    expect(changes[0].source).toBe('agent');
    expect(changes[0].op.args.intensity).toBe(1);
  });

  it('setLight rejects an unknown light id without emitting or changing state', () => {
    const room = new Room(registry);
    const changes = listen(room);
    const before = room.state;
    const result = room.setLight({ light_id: 'lamp' }, 'agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        `unknown light 'lamp'; available: desk_lamp ("desk lamp"), window_neon ("pink neon through the window"), monitor ("intake terminal glow")`,
      );
    }
    expect(changes).toHaveLength(0);
    expect(room.state).toBe(before);
  });

  it('setLight rejects a non-hex color', () => {
    const room = new Room(registry);
    const result = room.setLight({ light_id: 'desk_lamp', color: 'orange' }, 'agent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('color must be #rrggbb');
  });

  it('clamps duration to [0, 10]', () => {
    const room = new Room(registry);
    const changes = listen(room);
    room.setLight({ light_id: 'desk_lamp', duration: 30 }, 'agent');
    room.setLight({ light_id: 'desk_lamp', duration: -1 }, 'agent');
    expect(changes[0].duration).toBe(10);
    expect(changes[1].duration).toBe(0);
  });

  it('setScene resets lights and atmosphere to the new scene defaults, with transition in the event', () => {
    const room = new Room(registry);
    const changes = listen(room);
    const result = room.setScene({ id: 'noodle-stall', transition: 'glitch' }, 'agent');
    expect(result.ok).toBe(true);
    const scene = registry.get('noodle-stall')!;
    expect(room.state.sceneId).toBe('noodle-stall');
    expect(room.state.lights).toEqual(withBase(scene.lights));
    expect(room.state.atmosphere).toEqual(scene.defaults);
    expect(changes).toHaveLength(1);
    expect(changes[0].transition).toBe('glitch');
  });

  it('setScene defaults transition to fade', () => {
    const room = new Room(registry);
    const changes = listen(room);
    room.setScene({ id: 'noodle-stall' }, 'agent');
    expect(changes[0].transition).toBe('fade');
  });

  it('setScene rejects an unknown id, listing valid ids', () => {
    const room = new Room(registry);
    const result = room.setScene({ id: 'nowhere' }, 'agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const scene of registry.list()) expect(result.error).toContain(scene.id);
    }
  });

  it('applyPreset deep-merges atmosphere and light overrides, leaving the rest unchanged', () => {
    const room = new Room(registry);
    const before = room.state;
    const result = room.applyPreset({ name: 'storm' }, 'agent');
    expect(result.ok).toBe(true);
    expect(room.state.atmosphere.weatherLevel).toBe(1);
    expect(room.state.lights.find((l) => l.id === 'window_neon')?.flicker).toBe(0.6);
    expect(room.state.atmosphere.ambient).toBe(before.atmosphere.ambient);
    expect(room.state.atmosphere.ambientLevel).toBe(before.atmosphere.ambientLevel);
    expect(room.state.lights.find((l) => l.id === 'desk_lamp')).toEqual(
      before.lights.find((l) => l.id === 'desk_lamp'),
    );
  });

  it('applyPreset rejects an unknown preset name, listing the scene presets', () => {
    const room = new Room(registry);
    const result = room.applyPreset({ name: 'nope' }, 'agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const name of Object.keys(registry.first().presets)) expect(result.error).toContain(name);
    }
  });

  it('describe() includes scene, lights and preset names', () => {
    const room = new Room(registry);
    const text = room.describe();
    const scene = registry.first();
    expect(text).toContain(scene.name);
    expect(text).toContain(scene.description);
    for (const light of scene.lights) {
      expect(text).toContain(light.id);
      expect(text).toContain(light.label);
      expect(text).toContain(light.color);
      expect(text).toContain(String(Math.round(light.intensity * 100)));
      expect(text).toContain(String(Math.round(light.flicker * 100)));
    }
    for (const name of Object.keys(scene.presets)) expect(text).toContain(name);
  });

  it('restores with first-scene defaults when the saved sceneId is missing from the registry', () => {
    const saved: RoomState = {
      sceneId: 'ghost-scene',
      lights: [],
      atmosphere: registry.first().defaults,
    };
    const room = new Room(registry, saved);
    const first = registry.first();
    expect(room.state.sceneId).toBe(first.id);
    expect(room.state.lights).toEqual(withBase(first.lights));
    expect(room.state.atmosphere).toEqual(first.defaults);
  });

  it('restores the current light list, keeping saved values for lights that still exist', () => {
    const scene = registry.first();
    const saved: RoomState = {
      sceneId: scene.id,
      lights: [
        { ...scene.lights.find((l) => l.id === 'desk_lamp')!, intensity: 0.1 },
        { id: 'removed_light', label: 'gone', pos: [0, 0], color: '#000000', intensity: 1, radius: 1, flicker: 0 },
      ],
      atmosphere: scene.defaults,
    };
    const room = new Room(registry, saved);
    expect(room.state.lights.map((l) => l.id)).toEqual(scene.lights.map((l) => l.id));
    expect(room.state.lights.find((l) => l.id === 'desk_lamp')?.intensity).toBe(0.1);
    expect(room.state.lights.find((l) => l.id === 'removed_light')).toBeUndefined();
  });

  it("restores a saved light's base, and gives an old save's light the room's own level", () => {
    const scene = registry.first();
    const lamp = scene.lights.find((l) => l.id === 'desk_lamp')!;
    const monitor = scene.lights.find((l) => l.id === 'monitor')!;
    const saved: RoomState = {
      sceneId: scene.id,
      lights: [
        { ...lamp, intensity: 0, base: 0.4 },
        { ...monitor, intensity: 0.1 },
      ],
      atmosphere: scene.defaults,
    };
    const room = new Room(registry, saved);
    expect(room.state.lights.find((l) => l.id === 'desk_lamp')).toMatchObject({ intensity: 0, base: 0.4 });
    expect(room.state.lights.find((l) => l.id === 'monitor')).toMatchObject({ intensity: 0.1, base: monitor.intensity });
  });

  it('setLight changes the level and keeps the base', () => {
    const room = new Room(registry);
    expect(room.setLight({ light_id: 'desk_lamp', intensity: 0 }, 'agent').ok).toBe(true);
    expect(room.state.lights.find((l) => l.id === 'desk_lamp')).toMatchObject({ intensity: 0, base: 0.6 });
  });

  it('setAmbient validates and clamps', () => {
    const room = new Room(registry);
    const result = room.setAmbient({ color: '#112233', level: 150 }, 'dev');
    expect(result.ok).toBe(true);
    expect(room.state.atmosphere.ambient).toBe('#112233');
    expect(room.state.atmosphere.ambientLevel).toBe(1);
  });

  it('setAtmosphere rejects an unknown weather value, listing valid values', () => {
    const room = new Room(registry);
    const result = room.setAtmosphere({ weather: 'fog-machine' as never }, 'dev');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const w of ['none', 'rain', 'snow', 'ash', 'dust']) expect(result.error).toContain(w);
    }
  });

  it('state is a deep-frozen snapshot', () => {
    const room = new Room(registry);
    expect(Object.isFrozen(room.state)).toBe(true);
    expect(Object.isFrozen(room.state.atmosphere)).toBe(true);
    expect(Object.isFrozen(room.state.lights)).toBe(true);
    expect(Object.isFrozen(room.state.lights[0])).toBe(true);
  });

  it('onChange unsubscribe stops further notifications', () => {
    const room = new Room(registry);
    const changes: RoomChange[] = [];
    const unsub = room.onChange((c) => changes.push(c));
    room.setAmbient({ level: 0.9 }, 'dev');
    unsub();
    room.setAmbient({ level: 0.1 }, 'dev');
    expect(changes).toHaveLength(1);
  });
});

describe('Room control-link ergonomics (Nix feedback)', () => {
  it('setLight accepts a light label (case-insensitive) and records the resolved id', () => {
    const room = new Room(registry);
    const changes = listen(room);
    const result = room.setLight({ light_id: 'Intake Terminal Glow', intensity: 0.1 }, 'agent');
    expect(result.ok).toBe(true);
    expect(room.state.lights.find((l) => l.id === 'monitor')!.intensity).toBe(0.1);
    expect(changes[0].op.args.light_id).toBe('monitor');
  });

  it('every successful change says "applied:" and ends with the full new room line', () => {
    const room = new Room(registry);
    const results = [
      room.setLight({ light_id: 'desk_lamp', intensity: 0.2 }, 'agent'),
      room.setAmbient({ level: 0.3 }, 'agent'),
      room.setAtmosphere({ fog: 0.4 }, 'agent'),
      room.applyPreset({ name: 'quiet' }, 'agent'),
      room.setScene({ id: 'noodle-stall' }, 'agent'),
    ];
    for (const r of results) {
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.text.startsWith('applied: ')).toBe(true);
    }
    const last = results[results.length - 1];
    if (last.ok) expect(last.text.endsWith(`room now: ${room.summary()}`)).toBe(true);
    expect(room.summary().startsWith('[room: noodle-stall "Noodle Stall"')).toBe(true);
  });

  for (const id of ['lowlight-intake', 'noodle-stall', 'ribbon-rooftop']) {
    it(`${id} has the late, quiet and tense mood presets`, () => {
      const scene = registry.get(id)!;
      for (const name of ['late', 'quiet', 'tense']) expect(scene.presets[name]).toBeDefined();
    });
  }
});

describe('completeSceneId with old ribbon/ ids', () => {
  it('an old ribbon/ id comes back as karasu/; a bare id still takes the start district', () => {
    expect(completeSceneId('ribbon/x', () => false, null, 'karasu/y')).toBe('karasu/x');
    expect(completeSceneId('x', () => false, null, 'karasu/y')).toBe('karasu/x');
  });
});


describe('weather moods (city weather spec §3)', () => {
  const intake = () => {
    const room = new Room(registry);
    room.setScene({ id: 'lowlight-intake' }, 'dev');
    room.setAtmosphere({ weather: 'rain', weather_level: 0.6, fog: 0.5 }, 'dev');
    return room;
  };

  it('a non-weather mood keeps the weather; its other fields and fog still apply', () => {
    const room = intake();
    room.applyPreset({ name: 'quiet' }, 'agent');
    expect(room.state.atmosphere.weather).toBe('rain');
    expect(room.state.atmosphere.weatherLevel).toBe(0.6);
    expect(room.state.atmosphere.ambientLevel).toBe(0.25);
    expect(room.state.atmosphere.fog).toBe(0.15);
  });

  it('a weather mood sets the weather', () => {
    const room = intake();
    room.applyPreset({ name: 'storm' }, 'agent');
    expect(room.state.atmosphere.weatherLevel).toBe(1);
  });
});

describe('roomChanges', () => {
  const at = (over: Partial<RoomState> = {}, lamp = 0.6): RoomState => ({
    sceneId: 'karasu/nix-apartment',
    lights: [
      { id: 'lantern', label: 'paper lantern by the bed', pos: [0, 0], color: '#ff9741', intensity: lamp, radius: 300, flicker: 0 },
      { id: 'kitchen', label: 'the strip light under the kitchen shelf', pos: [0, 0], color: '#ffe2b0', intensity: 0.35, radius: 300, flicker: 0 },
    ],
    atmosphere: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'none', weatherLevel: 0, fog: 0.2, timeOfDay: 'night' },
    ...over,
  });

  it('is null when nothing she would see moved', () => {
    expect(roomChanges(at(), at())).toBeNull();
    expect(roomChanges(at({}, 0.6), at({}, 0.601))).toBeNull();
  });

  it('names each light that moved as the room line does, then ambient, weather and fog', () => {
    const now = at({ atmosphere: { ambient: '#1a1030', ambientLevel: 0.25, weather: 'rain', weatherLevel: 0.4, fog: 0.3, timeOfDay: 'night' } }, 0);
    expect(roomChanges(at(), now)).toBe('[since your last reply: lantern "paper lantern by the bed" #ff9741 0%, ambient #1a1030 25%, rain 40%, fog 30%]');
  });

  it('says only where she is when the scene changed', () => {
    expect(roomChanges(at(), at({ sceneId: 'karasu/noodle-stall' }))).toBe("[since your last reply: you're in karasu/noodle-stall now]");
  });
});

describe('power (blackouts phase 3 §3)', () => {
  it("a room with no blackout mood puts its own lights out; window light from outside stays", () => {
    const room = new Room(registry);
    const changes = listen(room);
    room.setLight({ light_id: 'desk_lamp', intensity: 0.9 }, 'agent');
    room.setAtmosphere({ weather: 'snow', weather_level: 0.4 }, 'world');
    expect(room.setPower({ out: true }, 'world').ok).toBe(true);
    const by = (id: string) => room.state.lights.find((l) => l.id === id)!;
    expect(by('desk_lamp').intensity).toBe(0);
    expect(by('window_neon').intensity).toBe(registry.get('lowlight-intake')!.lights.find((l) => l.id === 'window_neon')!.intensity);
    expect(by('monitor').intensity).toBe(0);
    expect(changes.at(-1)!.op).toEqual({ tool: 'power', args: { state: 'out' } });
    expect(changes.at(-1)!.source).toBe('world');
    room.setPower({ out: false }, 'world');
    const scene = registry.get('lowlight-intake')!;
    expect(room.state.lights).toEqual(withBase(scene.lights));
    // The city's weather stays; the rest of the look is the room's own again.
    expect(room.state.atmosphere).toEqual({ ...scene.defaults, weather: 'snow', weatherLevel: 0.4 });
    expect(changes.at(-1)!.op).toEqual({ tool: 'power', args: { state: 'back' } });
  });

  it('a room with a power cut mood takes it, keeping the weather', () => {
    const room = new Room(registry);
    room.setScene({ id: 'noodle-stall' }, 'world');
    const changes = listen(room);
    room.setAtmosphere({ weather: 'snow', weather_level: 0.4 }, 'world');
    room.setPower({ out: true }, 'world');
    expect(room.state.lights.find((l) => l.id === 'stall_lantern')!.intensity).toBe(0);
    expect(room.state.atmosphere.ambientLevel).toBe(0.05);
    expect(room.state.atmosphere.weather).toBe('snow');
    expect(changes.at(-1)!.op).toEqual({ tool: 'power', args: { state: 'out', mood: 'power-cut' } });
    // Back: the street through the window too (review I1).
    room.setPower({ out: false }, 'world');
    expect(room.state.lights).toEqual(withBase(registry.get('noodle-stall')!.lights));
  });
});

describe('powerOutState', () => {
  it("leaves a screen's light alone", () => {
    const lamp = { id: 'lamp', label: 'lamp', pos: [0, 0] as [number, number], color: '#ffffff', intensity: 0.8, radius: 10, flicker: 0, base: 0.8 };
    const tv = { ...lamp, id: 'tv', label: 'tv', intensity: 0.5, base: 0.5 };
    const state = { sceneId: 'x', lights: [lamp, tv], atmosphere: { ambient: '#000000', ambientLevel: 0.3, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' } } as RoomState;
    const scene = { presets: {}, effects: [{ kind: 'screen', rect: [0, 0, 10, 10], light: 'tv' }] } as never;
    const out = powerOutState(state, scene);
    expect(out.mood).toBeNull();
    expect(out.state.lights.map((l) => [l.id, l.intensity])).toEqual([['lamp', 0], ['tv', 0.5]]);
  });
});
