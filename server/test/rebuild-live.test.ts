import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SceneRegistry } from '../src/scenes';
import { Room, type RoomChange } from '../src/room-state';
import { openDb } from '../src/db';
import { Journal, type JournalChange } from '../src/journal';
import { generateScenes } from '../../tools/gen-placeholders';

let tmpDir: string;
let registry: SceneRegistry;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-rebuild-live-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function listen(room: Room): RoomChange[] {
  const changes: RoomChange[] = [];
  room.onChange((c) => changes.push(c));
  return changes;
}

describe('Room.restore', () => {
  it('restore replaces the state and reports no change when equal', () => {
    const room = new Room(registry);
    const changes = listen(room);
    expect(room.restore(room.state)).toBe(false);
    expect(changes).toEqual([]);

    const dimmed = { ...room.state, atmosphere: { ...room.state.atmosphere, fog: 0.9 } };
    expect(room.restore(dimmed)).toBe(true);
    expect(room.state.atmosphere.fog).toBe(0.9);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ source: 'user', duration: 1.5, op: { tool: 'restore' } });
    expect(changes[0].transition).toBeUndefined();
  });

  it('restore to another scene fades', () => {
    const room = new Room(registry);
    const changes = listen(room);
    const other = registry.list()[1];
    expect(room.restore({ ...room.state, sceneId: other.id })).toBe(true);
    expect(room.state.sceneId).toBe(other.id);
    expect(changes[0]).toMatchObject({ duration: 1.2, transition: 'fade', op: { tool: 'restore' } });
  });

  it("restore null goes to the start room's default", () => {
    const room = new Room(registry);
    room.setAtmosphere({ fog: 0.9 }, 'dev');
    expect(room.restore(null)).toBe(true);
    expect(room.state).toEqual(new Room(registry).state);
  });
});

describe('Journal.announce', () => {
  it('announce emits one change per player, with no line', () => {
    const journal = new Journal(openDb(':memory:', { defaultPlayer: 'hicks' }));
    const changes: JournalChange[] = [];
    journal.onChange((c) => changes.push(c));
    journal.announce({ roomChanged: true, notes: [null, 'hicks'], recap: ['hicks'], page: ['cass'], shares: false, leads: false, quests: false });
    expect(changes).toEqual([
      { kind: 'notes', line: null, by: 'user', source: 'user', player: null },
      { kind: 'notes', line: null, by: 'user', source: 'user', player: 'hicks' },
      { kind: 'recap', line: null, by: 'user', source: 'user', player: 'hicks' },
      { kind: 'page', line: null, by: 'user', source: 'user', player: 'cass' },
    ]);
  });
});
