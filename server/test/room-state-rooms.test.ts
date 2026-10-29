import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateScenes } from '../../tools/gen-placeholders';
import { completeSceneId, Room } from '../src/room-state';
import { roomRegistry, type RoomRegistry } from '../src/rooms';
import { loadPacks } from '../src/scenes';
import { formatToolLine } from '../src/tool-line';

let dir: string;
let city: RoomRegistry;
const MINE = ['karasu/lowlight-intake', 'karasu/noodle-stall'];
const districtName = (d: string) => (d === 'karasu' ? 'the Ribbon' : d);
const room = (saved: ConstructorParameters<typeof Room>[1] = null, legacyDistrict: string | null = null) =>
  new Room(city, saved, { mine: MINE, start: MINE[0]!, legacyDistrict, districtName });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-roomstate-'));
  await generateScenes(path.join(dir, 'karasu'), 'karasu');
  await generateScenes(path.join(dir, 'default'), 'default');
  fs.cpSync(path.join(dir, 'default', 'rooftop'), path.join(dir, 'karasu', 'rooftop'), { recursive: true });
  city = roomRegistry(await loadPacks(dir));
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('the room state, in rooms', () => {
  it('starts in her first room, and the room line names it in full with its district', () => {
    const r = room();
    expect(r.state.sceneId).toBe('karasu/lowlight-intake');
    expect(r.summary()).toMatch(/^\[room: karasu\/lowlight-intake "Lowlight Intake", the Ribbon · ambient /);
  });

  it('the room line ends with her other places, so go_to needs no list_scenes first', () => {
    const r = room();
    expect(r.summary()).toMatch(/ · places: karasu\/noodle-stall "Noodle Stall"\]$/);
    expect(r.setScene({ id: 'default/workspace' }, 'user').ok).toBe(true);
    expect(r.summary()).toMatch(/ · places: karasu\/lowlight-intake "Lowlight Intake", karasu\/noodle-stall "Noodle Stall"\]$/);
  });

  it('the room line leaves places out when she has nowhere else to go', () => {
    const r = new Room(city, null, { mine: [MINE[0]!], start: MINE[0]!, legacyDistrict: null, districtName });
    expect(r.summary()).not.toContain('places:');
  });

  it('list_scenes gives her rooms, plus where she was walked', () => {
    const r = room();
    expect(r.listScenes().map((s) => s.id)).toEqual(MINE);
    expect(r.setScene({ id: 'default/workspace' }, 'user').ok).toBe(true);
    expect(r.listScenes().map((s) => s.id)).toEqual([...MINE, 'default/workspace']);
  });

  it('she takes you to her own rooms, by full or bare name', () => {
    const r = room();
    expect(r.setScene({ id: 'noodle-stall' }, 'agent').ok).toBe(true);
    expect(r.state.sceneId).toBe('karasu/noodle-stall');
    expect(r.setScene({ id: 'karasu/lowlight-intake' }, 'agent').ok).toBe(true);
  });

  it("someone else's room is refused for her, not for the dev panel", () => {
    const r = room();
    expect(r.setScene({ id: 'default/workspace' }, 'agent')).toEqual({ ok: false, error: "that's not one of your places; they can walk you both there on the map" });
    expect(r.setScene({ id: 'default/workspace' }, 'dev').ok).toBe(true);
  });

  it("a public room is everyone's: in her places, and she can take you there", () => {
    const pub = (s: ReturnType<RoomRegistry['get']>) => (s && s.id === 'default/workspace' ? { ...s, public: true } : s);
    const open = { ...city, get: (id: string) => pub(city.get(id)), list: () => city.list().map((s) => pub(s)!) };
    const r = new Room(open, null, { mine: MINE, start: MINE[0]!, legacyDistrict: null, districtName });
    expect(r.summary()).toContain('default/workspace "Workspace"');
    expect(r.setScene({ id: 'default/workspace' }, 'agent').ok).toBe(true);
    expect(r.setScene({ id: 'default/rooftop' }, 'agent').ok).toBe(false);
  });

  it('walked somewhere else, she can stay there and take you back to hers (Review Focus 2)', () => {
    const r = room();
    r.setScene({ id: 'default/workspace' }, 'user');
    expect(r.setScene({ id: 'default/workspace', transition: 'fade' }, 'agent').ok).toBe(true);
    expect(r.setScene({ id: 'noodle-stall' }, 'agent').ok).toBe(true);
  });

  it('a bare name two rooms share is refused, naming both; an unknown one lists hers', () => {
    const r = room();
    expect(r.setScene({ id: 'rooftop' }, 'dev')).toEqual({ ok: false, error: "'rooftop' is more than one room: default/rooftop, karasu/rooftop" });
    expect(r.setScene({ id: 'nope' }, 'agent')).toEqual({ ok: false, error: "unknown scene 'nope'; yours: karasu/lowlight-intake, karasu/noodle-stall" });
  });

  it('a saved room from before rooms (a bare id) restores to the same room, lights and all (Review Focus 1)', () => {
    const before = room();
    before.setScene({ id: 'noodle-stall' }, 'agent');
    const light = before.state.lights[0]!;
    before.setLight({ light_id: light.id, intensity: 0.33 }, 'agent');
    const saved = { ...before.state, sceneId: 'noodle-stall', lights: before.state.lights.map((l) => ({ ...l })) };
    const after = room(saved, 'karasu');
    expect(after.state.sceneId).toBe('karasu/noodle-stall');
    expect(after.state.lights.find((l) => l.id === light.id)!.intensity).toBeCloseTo(0.33);
  });

  it('a room saved under its old ribbon/ id restores to the same room, lights and all', () => {
    const before = room();
    before.setScene({ id: 'karasu/noodle-stall' }, 'agent');
    const light = before.state.lights[0]!;
    before.setLight({ light_id: light.id, intensity: 0.33 }, 'agent');
    const saved = { ...before.state, sceneId: 'ribbon/noodle-stall', lights: before.state.lights.map((l) => ({ ...l })) };
    const after = room(saved);
    expect(after.state.sceneId).toBe('karasu/noodle-stall');
    expect(after.state.lights.find((l) => l.id === light.id)!.intensity).toBeCloseTo(0.33);
  });

  it('a bare id from an old ribbon scenePack also comes back under karasu/', () => {
    expect(completeSceneId('noodle-stall', () => false, 'ribbon', 'x')).toBe('karasu/noodle-stall');
  });

  it("go_to takes an old ribbon/ id she remembers from earlier turns", () => {
    const r = room();
    expect(r.setScene({ id: 'ribbon/noodle-stall' }, 'agent').ok).toBe(true);
    expect(r.state.sceneId).toBe('karasu/noodle-stall');
  });

  it('a saved room that no longer exists sends her to her start room', () => {
    const r = room({ sceneId: 'gone', lights: [], atmosphere: {} as never }, 'karasu');
    expect(r.state.sceneId).toBe('karasu/lowlight-intake');
  });

  it('the tool line names a room by its name', () => {
    const r = room();
    expect(formatToolLine({ tool: 'go_to', args: { id: 'karasu/noodle-stall', transition: 'fade' } }, r)).toBe('// GO_TO · NOODLE STALL · FADE');
  });
});

describe('completeSceneId', () => {
  const has = (id: string) => id === 'karasu/noodle-stall';
  it('puts a bare id from before rooms in her legacy district', () => {
    expect(completeSceneId('noodle-stall', has, 'karasu', 'default/workspace')).toBe('karasu/noodle-stall');
  });
  it('without a legacy district, uses her start room district', () => {
    expect(completeSceneId('noodle-stall', has, null, 'karasu/lowlight-intake')).toBe('karasu/noodle-stall');
  });
  it('leaves full and known ids alone', () => {
    expect(completeSceneId('karasu/noodle-stall', has, 'other', 'x/y')).toBe('karasu/noodle-stall');
    expect(completeSceneId('noodle-stall', has, null, '')).toBe('noodle-stall');
  });
});

describe('ways out (room exits spec §3)', () => {
  let exitDir: string;
  let exitCity: RoomRegistry;
  beforeAll(async () => {
    exitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-roomexits-'));
    await generateScenes(path.join(exitDir, 'karasu'), 'karasu');
    await generateScenes(path.join(exitDir, 'default'), 'default');
    const file = path.join(exitDir, 'karasu', 'lowlight-intake', 'scene.json');
    const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
    scene.exits = [
      { to: 'default/workspace', way: 'down the back stairs' },
      { to: 'karasu/noodle-stall', way: 'down to the street' },
    ];
    fs.writeFileSync(file, JSON.stringify(scene));
    exitCity = roomRegistry(await loadPacks(exitDir));
  }, 60_000);
  afterAll(() => fs.rmSync(exitDir, { recursive: true, force: true }));
  const r = () => new Room(exitCity, null, { mine: MINE, start: MINE[0]!, legacyDistrict: null, districtName });
  const workspace = () => exitCity.get('default/workspace')!.name;
  const stall = () => exitCity.get('karasu/noodle-stall')!.name;

  it('the room line lists the ways out after her places, and an exit she owns shows once, as an exit', () => {
    const line = r().summary();
    expect(line).toMatch(new RegExp(` · ways out: default/workspace "${workspace()}" \\(down the back stairs\\), karasu/noodle-stall "${stall()}" \\(down to the street\\)\\]$`));
    expect(line).not.toContain('places:');
  });

  it('she takes you through a way out', () => {
    const room = r();
    expect(room.setScene({ id: 'default/workspace' }, 'agent').ok).toBe(true);
    expect(room.state.sceneId).toBe('default/workspace');
  });

  it("from a room without that exit, someone else's room is still refused", () => {
    const room = r();
    expect(room.setScene({ id: 'karasu/noodle-stall' }, 'agent').ok).toBe(true);
    expect(room.setScene({ id: 'default/workspace' }, 'agent').ok).toBe(false);
  });

  it('list_scenes includes the ways out with how you get there', () => {
    expect(r().exitsHere().map((e) => [e.scene.id, e.way])).toEqual([
      ['default/workspace', 'down the back stairs'],
      ['karasu/noodle-stall', 'down to the street'],
    ]);
  });
});
