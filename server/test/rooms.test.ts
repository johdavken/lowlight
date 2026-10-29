import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateScenes } from '../../tools/gen-placeholders';
import { roomRegistry, type RoomRegistry } from '../src/rooms';
import { loadPacks } from '../src/scenes';

let dir: string;
let rooms: RoomRegistry;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-rooms-'));
  await generateScenes(path.join(dir, 'karasu'), 'karasu');
  await generateScenes(path.join(dir, 'default'), 'default');
  await generateScenes(path.join(dir, 'lowlight'), 'lowlight');
  // A second `rooftop`, in another district: bare names stop being unique.
  fs.cpSync(path.join(dir, 'default', 'rooftop'), path.join(dir, 'karasu', 'rooftop'), { recursive: true });
  rooms = roomRegistry(await loadPacks(dir));
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('the city room registry', () => {
  it('names every room district/folder, sorted, without the splash', () => {
    const ids = rooms.list().map((r) => r.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain('karasu/noodle-stall');
    expect(ids).toContain('default/workspace');
    expect(ids.some((id) => id.startsWith('lowlight/'))).toBe(false);
    expect(rooms.first().id).toBe(ids[0]);
  });
  it('a room knows its district and folder', () => {
    expect(rooms.get('karasu/noodle-stall')).toMatchObject({ id: 'karasu/noodle-stall', district: 'karasu', folder: 'noodle-stall' });
    expect(rooms.has('karasu/noodle-stall')).toBe(true);
    expect(rooms.has('noodle-stall')).toBe(false);
  });
  it('lists a district', () => {
    expect(rooms.inDistrict('default')).toEqual(['default/rooftop', 'default/workspace']);
  });
  it('resolves a full name, and a bare name only one room has', () => {
    expect(rooms.resolve('karasu/noodle-stall')).toEqual({ ok: true, id: 'karasu/noodle-stall' });
    expect(rooms.resolve('noodle-stall')).toEqual({ ok: true, id: 'karasu/noodle-stall' });
  });
  it('refuses a bare name two rooms share, naming both', () => {
    expect(rooms.resolve('rooftop')).toEqual({ ok: false, error: "'rooftop' is more than one room: default/rooftop, karasu/rooftop" });
  });
  it('refuses a name no room has', () => {
    expect(rooms.resolve('nope').ok).toBe(false);
    expect(rooms.resolve('lowlight/splash').ok).toBe(false);
  });
});

describe('room exits in the registry (room exits spec §2)', () => {
  let exitDir: string;
  let city: RoomRegistry;
  const warnings: string[] = [];
  beforeAll(async () => {
    exitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-exits-'));
    await generateScenes(path.join(exitDir, 'karasu'), 'karasu');
    await generateScenes(path.join(exitDir, 'default'), 'default');
    const file = path.join(exitDir, 'karasu', 'noodle-stall', 'scene.json');
    const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
    scene.exits = [
      { to: 'default/workspace', way: 'down the back stairs' },
      { to: 'karasu/nowhere', way: 'through a wall' },
      { to: 'karasu/noodle-stall', way: 'round in a circle' },
    ];
    fs.writeFileSync(file, JSON.stringify(scene));
    city = roomRegistry(await loadPacks(exitDir), (m) => warnings.push(m));
  }, 60_000);
  afterAll(() => fs.rmSync(exitDir, { recursive: true, force: true }));

  it('keeps an exit to a room that exists', () => {
    expect(city.get('karasu/noodle-stall')?.exits).toEqual([{ to: 'default/workspace', way: 'down the back stairs' }]);
  });

  it('drops an exit to an unknown room, with a warning', () => {
    expect(warnings).toContain("room 'karasu/noodle-stall': exit to unknown room 'karasu/nowhere'");
  });

  it('drops an exit to the room itself, with a warning', () => {
    expect(warnings).toContain("room 'karasu/noodle-stall': exit to itself");
  });
});

describe('door boxes in the registry (clickable doors spec §2)', () => {
  let dir: string;
  let city: RoomRegistry;
  const warnings: string[] = [];
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-doors-'));
    await generateScenes(path.join(dir, 'karasu'), 'karasu');
    await generateScenes(path.join(dir, 'default'), 'default');
    const file = path.join(dir, 'default', 'workspace', 'scene.json');
    const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
    scene.exits = [
      { to: 'karasu/noodle-stall', way: 'in', door: [0, 0, 5000, 10] },
      { to: 'karasu/lowlight-intake', way: 'up', door: [10, 10, 40, 40] },
    ];
    fs.writeFileSync(file, JSON.stringify(scene));
    city = roomRegistry(await loadPacks(dir), (m) => warnings.push(m));
  }, 60_000);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps the exit and drops a box outside the picture, with a warning', () => {
    const exits = city.get('default/workspace')!.exits!;
    expect(exits.map((e) => e.to)).toEqual(['karasu/noodle-stall', 'karasu/lowlight-intake']);
    expect('door' in exits[0]).toBe(false);
    expect(warnings).toContain("room 'default/workspace': door for exit to 'karasu/noodle-stall' isn't inside the picture; dropped");
  });

  it('keeps a box inside the picture', () => {
    expect(city.get('default/workspace')!.exits![1].door).toEqual([10, 10, 40, 40]);
  });
});
