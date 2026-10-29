import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SceneRegistry } from '../src/scenes';
import { Room } from '../src/room-state';
import { generateScenes } from '../../tools/gen-placeholders';
import { formatToolLine } from '../src/tool-line';
import type { RoomOp } from '../src/room-state';

let tmpDir: string;
let registry: SceneRegistry;
let room: Room;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-toolline-'));
  await generateScenes(tmpDir);
  const { registry: reg, errors } = await SceneRegistry.load(tmpDir);
  expect(errors).toEqual([]);
  registry = reg;
  room = new Room(registry);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('formatToolLine', () => {
  it('formats set_light', () => {
    room.setLight({ light_id: 'desk_lamp', color: '#ffb347', intensity: 0.4 }, 'agent');
    const op: RoomOp = { tool: 'set_light', args: { light_id: 'desk_lamp', color: '#ffb347', intensity: 0.4 } };
    expect(formatToolLine(op, room)).toBe('// SET_LIGHT · DESK LAMP · #FFB347 · 40%');
  });

  it('formats go_to', () => {
    const op: RoomOp = { tool: 'go_to', args: { id: 'noodle-stall', transition: 'glitch' } };
    expect(formatToolLine(op, room)).toBe('// GO_TO · NOODLE STALL · GLITCH');
  });

  it('formats set_atmosphere', () => {
    const args = { weather: 'rain', weather_level: 1, fog: 0.5 } as const;
    room.setAtmosphere(args, 'agent'); // formatToolLine runs after the op is applied
    const op: RoomOp = { tool: 'set_atmosphere', args };
    expect(formatToolLine(op, room)).toBe('// SET_ATMOSPHERE · RAIN 100% · FOG 50%');
  });

  it('set_atmosphere with weather but no weather_level reports the level the room actually kept', () => {
    room.setAtmosphere({ weather: 'rain', weather_level: 0.7 }, 'agent');
    const args = { weather: 'snow' } as const;
    room.setAtmosphere(args, 'agent');
    const op: RoomOp = { tool: 'set_atmosphere', args };
    expect(formatToolLine(op, room)).toBe('// SET_ATMOSPHERE · SNOW 70%');
  });

  it('a mood the story applied reads MOOD, not APPLY_MOOD (story moods spec §4)', () => {
    const op: RoomOp = { tool: 'apply_mood', args: { name: 'late' } };
    expect(formatToolLine(op, room, 'world')).toBe('// MOOD · LATE');
    expect(formatToolLine(op, room, 'agent')).toBe('// APPLY_MOOD · LATE');
    expect(formatToolLine(op, room)).toBe('// APPLY_MOOD · LATE');
  });

  it('formats the power going and coming back (blackouts phase 3 §3)', () => {
    expect(formatToolLine({ tool: 'power', args: { state: 'out', mood: 'power-cut' } }, room, 'world')).toBe('// MOOD · POWER OUT');
    expect(formatToolLine({ tool: 'power', args: { state: 'back' } }, room, 'world')).toBe('// MOOD · POWER BACK');
  });

  it('formats apply_mood', () => {
    const op: RoomOp = { tool: 'apply_mood', args: { name: 'after-hours' } };
    expect(formatToolLine(op, room)).toBe('// APPLY_MOOD · AFTER-HOURS');
  });

  it('formats set_ambient', () => {
    const op: RoomOp = { tool: 'set_ambient', args: { color: '#1a1030', level: 0.35 } };
    expect(formatToolLine(op, room)).toBe('// SET_AMBIENT · #1A1030 · 35%');
  });

  it('never includes duration', () => {
    const op: RoomOp = { tool: 'set_light', args: { light_id: 'desk_lamp', intensity: 0.4, duration: 3 } };
    expect(formatToolLine(op, room)).not.toContain('3');
    expect(formatToolLine(op, room).toLowerCase()).not.toContain('duration');
  });
});
