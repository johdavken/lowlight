import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, LEGACY_RESIDENT, type Db } from '../src/db';
import type { ChatMessage, RoomState, Take } from '../../shared/types';
import { tempDir } from './fixtures/temp-dir';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'agent',
    text: 'hello',
    toolLines: ['[room: Lowlight Intake]', '[set_light desk_lamp]'],
    ts: 1000,
    status: 'ok',
    ...overrides,
  };
}

const tmpFiles: string[] = [];

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-room-db-'));
  const file = path.join(dir, 'nix-room.db');
  tmpFiles.push(dir);
  return file;
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const dir = tmpFiles.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Db', () => {
  it('insert, update and get round-trip, with toolLines stored as a JSON array', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const msg = makeMessage();
    db.insertMessage('hicks', msg);
    expect(db.getMessage('hicks', 'm1')).toEqual(msg);

    db.updateMessage('hicks', 'm1', { text: 'hello there', status: 'streaming', toolLines: ['[updated]'] });
    expect(db.getMessage('hicks', 'm1')).toEqual({
      ...msg,
      text: 'hello there',
      status: 'streaming',
      toolLines: ['[updated]'],
    });
    db.close();
  });

  it('round-trips replyTo as undefined when absent, not null', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const msg = makeMessage({ id: 'm2', role: 'user', replyTo: undefined });
    db.insertMessage('hicks', msg);
    const loaded = db.getMessage('hicks', 'm2');
    expect(loaded).toBeDefined();
    expect(loaded!.replyTo).toBeUndefined();
    expect('replyTo' in loaded!).toBe(false);
    db.close();
  });

  it('round-trips replyTo when present', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1' }));
    db.insertMessage('hicks', makeMessage({ id: 'm2', role: 'user', text: 'retry', replyTo: 'm1' }));
    expect(db.getMessage('hicks', 'm2')?.replyTo).toBe('m1');
    db.close();
  });

  it('updateMessage on an unknown id is a no-op', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(() => db.updateMessage('hicks', 'nope', { text: 'x' })).not.toThrow();
    expect(db.getMessage('hicks', 'nope')).toBeUndefined();
    db.close();
  });

  it('getMessage on an unknown id returns undefined', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(db.getMessage('hicks', 'nope')).toBeUndefined();
    db.close();
  });

  it('recentMessages(2) returns the latest 2 in ascending order', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', ts: 100 }));
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 200 }));
    db.insertMessage('hicks', makeMessage({ id: 'c', ts: 300 }));
    const recent = db.recentMessages('hicks', 2);
    expect(recent.map((m) => m.id)).toEqual(['b', 'c']);
    db.close();
  });

  it('recentMessages defaults to 200 and ascending order', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', ts: 300 }));
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 100 }));
    db.insertMessage('hicks', makeMessage({ id: 'c', ts: 200 }));
    const recent = db.recentMessages('hicks');
    expect(recent.map((m) => m.id)).toEqual(['b', 'c', 'a']);
    db.close();
  });

  it('recentMessages ties on equal ts keep insertion order', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', ts: 100 }));
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 100 }));
    db.insertMessage('hicks', makeMessage({ id: 'c', ts: 100 }));
    const recent = db.recentMessages('hicks');
    expect(recent.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    db.close();
  });

  it('saveRoom then loadRoom round-trips, and loadRoom on a fresh DB is null', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(db.loadRoom()).toBeNull();

    const state: RoomState = {
      sceneId: 'intake',
      lights: [
        { id: 'desk_lamp', label: 'desk lamp', pos: [1, 2], color: '#ffb347', intensity: 0.6, radius: 10, flicker: 0 },
      ],
      atmosphere: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'rain', weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night' },
    };
    db.saveRoom(state);
    expect(db.loadRoom()).toEqual(state);

    const state2: RoomState = { ...state, sceneId: 'noodle-stall' };
    db.saveRoom(state2);
    expect(db.loadRoom()).toEqual(state2);
    db.close();
  });

  it('meta get and set', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(db.getMeta('session_id')).toBeNull();
    db.setMeta('session_id', 'abc123');
    expect(db.getMeta('session_id')).toBe('abc123');
    db.setMeta('session_id', 'def456');
    expect(db.getMeta('session_id')).toBe('def456');
    db.close();
  });

  it('reopening the same file path keeps the data', () => {
    const file = tmpDbPath();
    let db: Db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1' }));
    db.saveRoom({
      sceneId: 'intake',
      lights: [],
      atmosphere: { ambient: '#000000', ambientLevel: 0, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'dusk' },
    });
    db.setMeta('session_id', 'xyz');
    db.close();

    db = openDb(file, { defaultPlayer: 'hicks' });
    expect(db.getMessage('hicks', 'm1')).toEqual(makeMessage({ id: 'm1' }));
    expect(db.loadRoom()?.sceneId).toBe('intake');
    expect(db.getMeta('session_id')).toBe('xyz');
    db.close();
  });
});

describe('message mode (rp / ooc)', () => {
  it('round-trips mode ooc, and leaves mode absent for roleplay messages', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', mode: 'ooc' }));
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 2000 }));
    expect(db.getMessage('hicks', 'a')?.mode).toBe('ooc');
    expect('mode' in db.getMessage('hicks', 'b')!).toBe(false);
    db.updateMessage('hicks', 'a', { text: 'edited' });
    expect(db.getMessage('hicks', 'a')).toMatchObject({ text: 'edited', mode: 'ooc' });
    db.close();
  });

  it('migrates a database created before modes existed (old rows read as roleplay)', async () => {
    const file = tmpDbPath();
    const { DatabaseSync } = await import('node:sqlite');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL,
      tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT)`);
    old.exec(`INSERT INTO messages VALUES ('old', 'user', 'hi', '[]', 1, 'ok', NULL)`);
    old.close();

    const db = openDb(file, { defaultPlayer: 'hicks' });
    expect(db.getMessage('hicks', 'old')).toMatchObject({ id: 'old', text: 'hi' });
    expect('mode' in db.getMessage('hicks', 'old')!).toBe(false);
    db.insertMessage('hicks', makeMessage({ id: 'new', mode: 'ooc' }));
    expect(db.getMessage('hicks', 'new')?.mode).toBe('ooc');
    db.close();
  });

  it('round-trips mode end', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'c', mode: 'end' }));
    expect(db.getMessage('hicks', 'c')?.mode).toBe('end');
    db.close();
  });

  it('round-trips a leave line; a plain end has no leave', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'l', mode: 'end', leave: true }));
    db.insertMessage('hicks', makeMessage({ id: 'e', mode: 'end' }));
    expect(db.getMessage('hicks', 'l')?.leave).toBe(true);
    expect('leave' in db.getMessage('hicks', 'e')!).toBe(false);
    db.close();
  });

  it('round-trips a clock stamp; maxClock is the largest, null with none', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(db.maxClock()).toBeNull();
    db.insertMessage('hicks', makeMessage({ id: 'a', clock: 1205 }));
    db.insertMessage('hicks', makeMessage({ id: 'b' }));
    db.insertMessage('cass', makeMessage({ id: 'c', clock: 1300 }));
    expect(db.getMessage('hicks', 'a')?.clock).toBe(1205);
    expect('clock' in db.getMessage('hicks', 'b')!).toBe(false);
    expect(db.maxClock()).toBe(1300);
    db.close();
  });

  it('maxClock leaves out a failed line (a send that never reached her costs nothing) (Task 2 review 7)', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', clock: 1205 }));
    db.insertMessage('hicks', makeMessage({ id: 'b', clock: 1210, status: 'failed' }));
    expect(db.maxClock()).toBe(1205);
    db.close();
  });

  it('round-trips mode greet', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'g', mode: 'greet' }));
    expect(db.getMessage('hicks', 'g')?.mode).toBe('greet');
    db.close();
  });
});

describe('legacy role rename', () => {
  it("reads rows stored with role 'nix' as role 'agent'", async () => {
    const file = tmpDbPath();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.close();
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(file);
    raw.exec(`INSERT INTO messages (id, role, text, tool_lines, ts, status, reply_to) VALUES ('old', 'nix', 'hi', '[]', 1, 'ok', NULL)`);
    raw.close();
    const again = openDb(file, { defaultPlayer: 'hicks' });
    expect(again.getMessage('hicks', 'old')?.role).toBe('agent');
    again.close();
  });
});

describe('notes table', () => {
  it('appears in a room DB created before the journal existed, and rows round-trip', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const file = path.join(tempDir('notes-'), 'room.db');
    const old = new DatabaseSync(file);
    old.exec('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    old.exec("INSERT INTO meta (k, v) VALUES ('roomSessionId', 's1')");
    old.close();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    expect(db.listNotes('hicks')).toEqual([]);
    expect(db.getMeta('roomSessionId')).toBe('s1');
    const note = { id: 'n1', text: 'hi', pinned: true, createdAt: 1, updatedAt: 2, editedBy: 'user' as const, about: 'you' as const, keys: [] as string[] };
    db.insertNote('hicks', note);
    expect(db.getNote('hicks', 'n1')).toEqual(note);
    db.updateNote('hicks', 'n1', { text: 'yo', pinned: false });
    expect(db.getNote('hicks', 'n1')).toMatchObject({ text: 'yo', pinned: false, createdAt: 1 });
    expect(db.deleteNote('hicks', 'n1')).toBe(true);
    expect(db.deleteNote('hicks', 'n1')).toBe(false);
    db.close();
  });
});

describe('expression', () => {
  it('insert with an expression round-trips through getMessage and recentMessages', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', expression: 'happy' }));
    expect(db.getMessage('hicks', 'm1')!.expression).toBe('happy');
    expect(db.recentMessages('hicks').find((m) => m.id === 'm1')!.expression).toBe('happy');
    db.close();
  });

  it('updateMessage(id, { expression: undefined }) clears it', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', expression: 'happy' }));
    db.updateMessage('hicks', 'm1', { expression: undefined });
    expect(db.getMessage('hicks', 'm1')!.expression).toBeUndefined();
    expect('expression' in db.getMessage('hicks', 'm1')!).toBe(false);
    db.close();
  });

  it("setTakes with a shown take's expression sets the message's expression, and clears it when the take has none", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'r', text: 'first' }));
    db.setTakes('hicks', 
      'r',
      [
        { text: 'first', toolLines: [], ts: 1, expression: 'annoyed' },
        { text: 'second', toolLines: [], ts: 2 },
      ],
      0,
    );
    expect(db.getMessage('hicks', 'r')!.expression).toBe('annoyed');
    db.setTakes('hicks', 'r', db.getTakes('hicks', 'r')!.takes, 1);
    expect(db.getMessage('hicks', 'r')!.expression).toBeUndefined();
    db.close();
  });

  it('an existing DB file without the expression column opens and gains it', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const file = tmpDbPath();
    const raw = new DatabaseSync(file);
    raw.exec(
      "CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT, mode TEXT NOT NULL DEFAULT 'rp', takes TEXT, take_index INTEGER NOT NULL DEFAULT 0, model TEXT)",
    );
    raw.exec("INSERT INTO messages VALUES ('old', 'agent', 'hi', '[]', 1, 'ok', NULL, 'rp', NULL, 0, NULL)");
    raw.close();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    expect(db.getMessage('hicks', 'old')!.expression).toBeUndefined();
    db.updateMessage('hicks', 'old', { expression: 'happy' });
    expect(db.getMessage('hicks', 'old')!.expression).toBe('happy');
    db.close();
  });
});

describe('takes, delete and rewind', () => {
  const ask = (id: string, ts: number, text = id): ChatMessage => makeMessage({ id, ts, text, role: 'user', toolLines: [] });
  const say = (id: string, ts: number, text = id): ChatMessage => makeMessage({ id, ts, text, toolLines: [] });

  it('an old database without the take columns opens and gains them', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const file = tmpDbPath();
    const raw = new DatabaseSync(file);
    raw.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT, mode TEXT NOT NULL DEFAULT 'rp')");
    raw.exec("INSERT INTO messages VALUES ('old', 'agent', 'hi', '[]', 1, 'ok', NULL, 'rp')");
    raw.close();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    expect(db.getMessage('hicks', 'old')).toMatchObject({ text: 'hi' });
    expect(db.getMessage('hicks', 'old')!.takes).toBeUndefined();
    expect(db.getTakes('hicks', 'old')).toBeNull();
    db.close();
  });

  it('an old database without the model column opens and gains it', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const file = tmpDbPath();
    const raw = new DatabaseSync(file);
    raw.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT, mode TEXT NOT NULL DEFAULT 'rp', takes TEXT, take_index INTEGER NOT NULL DEFAULT 0)");
    raw.exec("INSERT INTO messages VALUES ('old', 'agent', 'hi', '[]', 1, 'ok', NULL, 'rp', NULL, 0)");
    raw.close();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    expect(db.getMessage('hicks', 'old')!.model).toBeUndefined();
    db.updateMessage('hicks', 'old', { model: 'z-ai/glm-5.2' });
    expect(db.getMessage('hicks', 'old')!.model).toBe('z-ai/glm-5.2');
    db.close();
  });

  it('model round-trips on messages and takes; the row shows the shown take\'s model', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', { ...say('r', 2, 'first'), model: 'model/a' });
    expect(db.getMessage('hicks', 'r')!.model).toBe('model/a');
    db.setTakes('hicks', 'r', [{ text: 'first', toolLines: [], ts: 2, model: 'model/a' }, { text: 'second', toolLines: [], ts: 3, model: 'model/b' }], 1);
    expect(db.getMessage('hicks', 'r')!.model).toBe('model/b');
    expect(db.getTakes('hicks', 'r')!.takes.map((t) => t.model)).toEqual(['model/a', 'model/b']);
    db.setTakes('hicks', 'r', db.getTakes('hicks', 'r')!.takes, 0);
    expect(db.getMessage('hicks', 'r')!.model).toBe('model/a');
    db.close();
  });

  it('takes round-trip; the row shows the chosen take', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', say('r', 2, 'first'));
    db.setTakes('hicks', 'r', [{ text: 'first', toolLines: [], ts: 2 }, { text: 'second', toolLines: ['// NOTED'], ts: 3 }], 1);
    expect(db.getMessage('hicks', 'r')).toMatchObject({ text: 'second', toolLines: ['// NOTED'], takes: { index: 1, count: 2 } });
    expect(db.getTakes('hicks', 'r')!.takes.map((t) => t.text)).toEqual(['first', 'second']);
    db.setTakes('hicks', 'r', [{ text: 'first', toolLines: [], ts: 2 }, { text: 'second', toolLines: [], ts: 3 }], 0);
    expect(db.getMessage('hicks', 'r')!.text).toBe('first');
    db.setTakes('hicks', 'r', null, 0);
    expect(db.getMessage('hicks', 'r')!.takes).toBeUndefined();
    expect(db.getMessage('hicks', 'r')!.text).toBe('first');
    db.close();
  });

  it('deleteAfter removes and returns only the later lines', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    for (const [i, m] of [ask('a', 1), say('b', 2), ask('c', 3), say('d', 4)].entries()) db.insertMessage('hicks', { ...m, ts: i + 1 });
    expect(db.deleteAfter('hicks', 'b')).toEqual(['c', 'd']);
    expect(db.allMessages('hicks').map((m) => m.id)).toEqual(['a', 'b']);
    expect(db.deleteAfter('hicks', 'missing')).toEqual([]);
    db.close();
  });

  it('a deleted line restored later returns to its place in time (Review Focus 3)', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', ask('a', 1));
    const b = say('b', 2);
    db.insertMessage('hicks', b);
    db.deleteMessage('hicks', 'b');
    db.insertMessage('hicks', ask('c', 3));
    db.insertMessage('hicks', b);
    expect(db.allMessages('hicks').map((m) => m.id)).toEqual(['a', 'b', 'c']);
    db.close();
  });
});

describe('players: per-pair messages and dossier notes', () => {
  const note = (id: string, text = id) => ({ id, text, pinned: false, createdAt: 1, updatedAt: 1, editedBy: 'user' as const, about: 'you' as const, keys: [] as string[] });

  async function oldDb(file: string, extra?: (raw: import('node:sqlite').DatabaseSync) => void): Promise<void> {
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(file);
    raw.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL,
      ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT, mode TEXT NOT NULL DEFAULT 'rp', takes TEXT,
      take_index INTEGER NOT NULL DEFAULT 0, model TEXT, expression TEXT)`);
    raw.exec('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    raw.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, keys TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, edited_by TEXT NOT NULL)`);
    raw.exec(`INSERT INTO messages (id, role, text, tool_lines, ts, status) VALUES ('m1', 'user', 'hi', '[]', 1, 'ok'), ('m2', 'agent', 'yo', '[]', 2, 'ok')`);
    raw.exec(`INSERT INTO notes VALUES ('n1', 'likes rain', 0, NULL, 1, 1, 'agent')`);
    raw.exec(`INSERT INTO meta VALUES ('recap.text', 'we talked'), ('recap.at', '5'), ('recap.seen_at', '5'), ('backend.model', 'm'), ('journal.next', '2')`);
    extra?.(raw);
    raw.close();
  }

  async function rawRows(file: string) {
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(file);
    const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as unknown as { name: string }[]).map((c) => c.name);
    const rows = (sql: string) => (raw.prepare(sql).all() as object[]).map((r) => ({ ...r }));
    const out = {
      messageCols: cols('messages'),
      noteCols: cols('notes'),
      meta: Object.fromEntries((raw.prepare('SELECT k, v FROM meta ORDER BY k').all() as unknown as { k: string; v: string }[]).map((r) => [r.k, r.v])),
      messagePlayers: cols('messages').includes('player') ? rows('SELECT id, player FROM messages ORDER BY id') : null,
      notePlayers: cols('notes').includes('player') ? rows('SELECT id, player FROM notes ORDER BY id') : null,
    };
    raw.close();
    return out;
  }

  it('migration: an old DB gets player columns filled with the default and recap keys moved', async () => {
    const file = tmpDbPath();
    await oldDb(file);
    openDb(file, { defaultPlayer: 'hicks' }).close();
    const after = await rawRows(file);
    expect(after.messagePlayers).toEqual([{ id: 'm1', player: 'hicks' }, { id: 'm2', player: 'hicks' }]);
    expect(after.notePlayers).toEqual([{ id: 'n1', player: 'hicks' }]);
    expect(after.meta).toEqual({
      'backend.model': 'm',
      'journal.next': '2',
      'recap.hicks.at': '5',
      'recap.hicks.seen_at': '5',
      'recap.hicks.text': 'we talked',
    });
  });

  it('migration is idempotent (open twice → same rows, no error)', async () => {
    const file = tmpDbPath();
    await oldDb(file);
    openDb(file, { defaultPlayer: 'hicks' }).close();
    const once = await rawRows(file);
    const db = openDb(file, { defaultPlayer: 'hicks' });
    expect(db.allMessages('hicks').map((m) => m.id)).toEqual(['m1', 'm2']);
    db.close();
    expect(await rawRows(file)).toEqual(once);
  });

  it('migration keeps a newer per-pair recap and drops the old keys', async () => {
    const file = tmpDbPath();
    await oldDb(file, (raw) => raw.exec(`INSERT INTO meta VALUES ('recap.hicks.text', 'newer')`));
    openDb(file, { defaultPlayer: 'hicks' }).close();
    const { meta } = await rawRows(file);
    expect(meta['recap.hicks.text']).toBe('newer');
    expect(meta['recap.text']).toBeUndefined();
  });

  it('migration rolls back on failure', async () => {
    const file = tmpDbPath();
    // The fault: a trigger in the old DB that refuses the recap move's delete of an old key.
    await oldDb(file, (raw) =>
      raw.exec(`CREATE TRIGGER no_move BEFORE DELETE ON meta WHEN old.k = 'recap.text' BEGIN SELECT RAISE(ABORT, 'boom'); END`),
    );
    const before = await rawRows(file);
    expect(() => openDb(file, { defaultPlayer: 'hicks' })).toThrow(/boom/);
    const after = await rawRows(file);
    expect(after).toEqual(before);
    expect(after.messageCols).not.toContain('player');
    expect(after.meta['recap.hicks.text']).toBeUndefined();
  });

  it('messages are scoped: pair A never sees pair B (recent, all, get, takes, deleteAfter)', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a1', ts: 1 }));
    db.insertMessage('cass', makeMessage({ id: 'b1', ts: 2 }));
    db.insertMessage('hicks', makeMessage({ id: 'a2', ts: 3 }));
    db.insertMessage('cass', makeMessage({ id: 'b2', ts: 4 }));

    expect(db.recentMessages('hicks').map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(db.recentMessages('cass', 1).map((m) => m.id)).toEqual(['b2']);
    expect(db.allMessages('cass').map((m) => m.id)).toEqual(['b1', 'b2']);
    expect(db.getMessage('hicks', 'b1')).toBeUndefined();
    expect(db.getMessage('cass', 'b1')?.id).toBe('b1');

    db.updateMessage('hicks', 'b1', { text: 'stolen' });
    expect(db.getMessage('cass', 'b1')?.text).toBe('hello');

    const takes = [{ text: 'one', toolLines: [], ts: 1 }, { text: 'two', toolLines: [], ts: 2 }];
    db.setTakes('hicks', 'b2', takes, 1);
    expect(db.getTakes('cass', 'b2')).toBeNull();
    db.setTakes('cass', 'b2', takes, 1);
    expect(db.getTakes('hicks', 'b2')).toBeNull();
    expect(db.getTakes('cass', 'b2')).toEqual({ takes, index: 1 });

    // Rewinding pair A from its first line takes only pair A's later lines.
    expect(db.deleteAfter('hicks', 'a1')).toEqual(['a2']);
    expect(db.deleteAfter('hicks', 'b1')).toEqual([]);
    expect(db.allMessages('cass').map((m) => m.id)).toEqual(['b1', 'b2']);

    db.deleteMessage('hicks', 'b1');
    expect(db.getMessage('cass', 'b1')).toBeDefined();
    db.deleteMessage('cass', 'b1');
    expect(db.getMessage('cass', 'b1')).toBeUndefined();
    db.close();
  });

  it('notes: listNotes(null) = journal only; listNotes("hicks") = journal + hicks; getNote across pairs → undefined; about derived', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertNote(null, { ...note('n1'), about: 'me' });
    db.insertNote('hicks', note('n2'));
    db.insertNote('cass', note('n3'));
    const ids = (ns: { id: string }[]) => ns.map((n) => n.id).sort();

    expect(ids(db.listNotes(null))).toEqual(['n1']);
    expect(ids(db.listNotes('hicks'))).toEqual(['n1', 'n2']);
    expect(ids(db.listNotes('cass'))).toEqual(['n1', 'n3']);
    expect(db.getNote('hicks', 'n3')).toBeUndefined();
    expect(db.getNote('hicks', 'n1')).toEqual({ ...note('n1'), about: 'me' });
    expect(db.getNote('hicks', 'n2')).toEqual(note('n2'));
    // `about` is derived from the owner, not stored: a 'me' note filed in a pair reads as 'you'.
    db.insertNote('cass', { ...note('n4'), about: 'me' });
    expect(db.getNote('cass', 'n4')?.about).toBe('you');

    db.updateNote('hicks', 'n3', { text: 'stolen' });
    expect(db.getNote('cass', 'n3')?.text).toBe('n3');
    expect(db.deleteNote('hicks', 'n3')).toBe(false);
    expect(db.deleteNote('cass', 'n3')).toBe(true);
    db.close();
  });

  it('updateNote with an owner moves a note between journal and a pair', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertNote('hicks', note('n1'));
    db.updateNote('hicks', 'n1', { text: 'mine now' }, null);
    expect(db.getNote('cass', 'n1')).toMatchObject({ text: 'mine now', about: 'me' });
    db.updateNote('cass', 'n1', {}, 'cass');
    expect(db.getNote('hicks', 'n1')).toBeUndefined();
    expect(db.getNote('cass', 'n1')?.about).toBe('you');
    // Leaving the owner out keeps it where it is.
    db.updateNote('cass', 'n1', { pinned: true });
    expect(db.listNotes(null)).toEqual([]);
    db.close();
  });

  it("updateNote refuses to move a note into another pair's dossier (Task 1 review)", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertNote('hicks', note('n1'));
    expect(() => db.updateNote('hicks', 'n1', { text: 'yours now' }, 'cass')).toThrow(/another pair/);
    expect(db.getNote('hicks', 'n1')).toEqual(note('n1'));
    expect(db.getNote('cass', 'n1')).toBeUndefined();
    db.close();
  });

  it('noteExists checks every pair and the journal', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertNote('cass', note('n1'));
    db.insertNote(null, note('n2'));
    expect(db.noteExists('n1')).toBe(true);
    expect(db.noteExists('n2')).toBe(true);
    expect(db.noteExists('n3')).toBe(false);
    db.close();
  });

  it('messageExists checks every pair', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('cass', { id: 'm1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' });
    expect(db.messageExists('m1')).toBe(true);
    expect(db.messageExists('m2')).toBe(false);
    db.close();
  });

  it('pairPlayers lists every player with messages, notes, a recap or a page (Review Focus 4)', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(db.pairPlayers()).toEqual([]);
    db.insertMessage('hicks', makeMessage({ id: 'a1' }));
    db.insertNote('cass', note('n1'));
    db.insertNote(null, note('n2'));
    db.setMeta('recap.vex.text', 'hey');
    db.setMeta('recap.mara.seen_at', '1');
    db.setMeta('backend.model', 'x');
    db.setMeta('page.zed.text', 'a page only');
    expect(db.pairPlayers().sort()).toEqual(['cass', 'hicks', 'mara', 'vex', 'zed']);
    db.close();
  });

  it('deleteMeta removes a key', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.setMeta('page.hicks.text', 'x');
    db.deleteMeta('page.hicks.text');
    expect(db.getMeta('page.hicks.text')).toBeNull();
    db.close();
  });
});

describe('replies saved with leading blank lines', () => {
  it('opening the db trims them from her replies and their takes, and leaves the player\'s lines alone', () => {
    const file = tmpDbPath();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a1', text: '\n\n*leans in* Hey.' }));
    db.insertMessage('hicks', makeMessage({ id: 'u1', role: 'user', text: '\n  indented on purpose' }));
    db.insertMessage('hicks', makeMessage({ id: 'a2', text: 'fine' }));
    db.setTakes('hicks', 'a2', [
      { text: '\n\nfirst take', toolLines: [], ts: 1 },
      { text: ' \nsecond take', toolLines: [], ts: 2 },
    ], 1);
    db.close();

    const again = openDb(file, { defaultPlayer: 'hicks' });
    expect(again.getMessage('hicks', 'a1')!.text).toBe('*leans in* Hey.');
    expect(again.getMessage('hicks', 'u1')!.text).toBe('\n  indented on purpose');
    expect(again.getMessage('hicks', 'a2')!.text).toBe('second take');
    expect(again.getTakes('hicks', 'a2')!.takes.map((t) => t.text)).toEqual(['first take', 'second take']);
    again.close();
  });
});

describe('resident expression', () => {
  it('round-trips through insert, updateMessage and getMessage; undefined clears it', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', othersExpressions: { hae: 'happy' } }));
    expect(db.getMessage('hicks', 'm1')!.othersExpressions?.hae).toBe('happy');
    db.updateMessage('hicks', 'm1', { othersExpressions: { hae: 'annoyed' } });
    expect(db.recentMessages('hicks').find((m) => m.id === 'm1')!.othersExpressions?.hae).toBe('annoyed');
    db.updateMessage('hicks', 'm1', { othersExpressions: undefined });
    expect('othersExpressions' in db.getMessage('hicks', 'm1')!).toBe(false);
    db.close();
  });

  it("setTakes puts the shown take's resident face on the row, and clears it when the take has none", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'r', text: 'first' }));
    const takes = [
      { text: 'first', toolLines: [], ts: 1, othersExpressions: { hae: 'concerned' } },
      { text: 'second', toolLines: [], ts: 2 },
    ];
    db.setTakes('hicks', 'r', takes, 0);
    expect(db.getMessage('hicks', 'r')!.othersExpressions?.hae).toBe('concerned');
    db.setTakes('hicks', 'r', takes, 1);
    expect(db.getMessage('hicks', 'r')!.othersExpressions).toBeUndefined();
    db.close();
  });

  it("a reply's others' faces round-trip, one per person", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', othersExpressions: { hae: 'happy', silas: 'annoyed' } }));
    expect(db.getMessage('hicks', 'm1')!.othersExpressions).toEqual({ hae: 'happy', silas: 'annoyed' });
    db.close();
  });

  it("an old resident_expression reads as Hae's; saving again writes only the new column", async () => {
    const file = tmpDbPath();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1' }));
    db.close();
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(file);
    raw.exec("UPDATE messages SET resident_expression = 'happy', others_expressions = NULL WHERE id = 'm1'");
    raw.close();
    const again = openDb(file, { defaultPlayer: 'hicks' });
    expect(again.getMessage('hicks', 'm1')!.othersExpressions).toEqual({ [LEGACY_RESIDENT]: 'happy' });
    again.updateMessage('hicks', 'm1', { othersExpressions: { hae: 'annoyed' } });
    again.close();
    const check = new DatabaseSync(file);
    expect(check.prepare("SELECT resident_expression, others_expressions FROM messages WHERE id = 'm1'").get()).toEqual({
      resident_expression: null,
      others_expressions: JSON.stringify({ hae: 'annoyed' }),
    });
    check.close();
  });

  it("an old take's residentExpression reads as Hae's", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'r', text: 'first' }));
    db.setTakes('hicks', 'r', [{ text: 'first', toolLines: [], ts: 1, residentExpression: 'concerned' } as unknown as Take], 0);
    expect(db.getTakes('hicks', 'r')!.takes[0].othersExpressions).toEqual({ hae: 'concerned' });
    db.close();
  });

  it('an old database gains the column', async () => {
    const file = tmpDbPath();
    const { DatabaseSync } = await import('node:sqlite');
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL DEFAULT '[]', ts INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ok', reply_to TEXT)");
    old.close();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', othersExpressions: { hae: 'happy' } }));
    expect(db.getMessage('hicks', 'm1')!.othersExpressions?.hae).toBe('happy');
    db.close();
  });

  describe('shared contacts, copies and fingerprint', () => {
    const share = (contactId: string, messageId: string) => ({ contactId, player: 'hicks', messageId, how: null, at: 5 });

    it('shareContact inserts once', () => {
      const db = openDb(':memory:', { defaultPlayer: 'hicks' });
      expect(db.shareContact(share('bishop', 'm1'))).toBe(true);
      expect(db.shareContact(share('bishop', 'm2'))).toBe(false);
      expect(db.sharedContacts('hicks')).toEqual([{ contactId: 'bishop', messageId: 'm1', how: null, at: 5 }]);
      db.close();
    });

    it('deleteMessage removes shares made by that message', () => {
      const db = openDb(':memory:', { defaultPlayer: 'hicks' });
      db.insertMessage('hicks', makeMessage({ id: 'm1' }));
      db.shareContact(share('bishop', 'm1'));
      db.deleteMessage('hicks', 'm1');
      expect(db.sharedContacts('hicks')).toEqual([]);
      db.close();
    });

    it('deleteAfter removes shares from deleted messages only', () => {
      const db = openDb(':memory:', { defaultPlayer: 'hicks' });
      for (const [id, ts] of [['m1', 1], ['m2', 2], ['m3', 3]] as const) db.insertMessage('hicks', makeMessage({ id, ts }));
      db.shareContact(share('bishop', 'm1'));
      db.shareContact(share('vasquez', 'm3'));
      db.deleteAfter('hicks', 'm1');
      expect(db.sharedContacts('hicks').map((s) => s.contactId)).toEqual(['bishop']);
      db.close();
    });

    it('vacuumInto makes an openable copy', () => {
      const db = openDb(':memory:', { defaultPlayer: 'hicks' });
      db.insertMessage('hicks', makeMessage({ id: 'm1' }));
      db.shareContact(share('bishop', 'm1'));
      const copy = path.join(tempDir('vacuum-'), "it's a copy.db");
      db.vacuumInto(copy);
      const opened = openDb(copy, { defaultPlayer: 'hicks' });
      expect(opened.allMessages('hicks')).toEqual(db.allMessages('hicks'));
      expect(opened.sharedContacts('hicks')).toHaveLength(1);
      opened.close();
      db.close();
    });

    it('fingerprint is the last message rowid, the last write and the shown takes', () => {
      const db = openDb(':memory:', { defaultPlayer: 'hicks' });
      const empty = db.fingerprint();
      expect(empty.slice(0, 2)).toEqual([0, 0]);
      db.insertMessage('hicks', makeMessage({ id: 'm1' }));
      db.insertNote('hicks', { id: 'n1', text: 'hi', pinned: false, createdAt: 1, updatedAt: 1, editedBy: 'user', about: 'you' });
      db.shareContact(share('bishop', 'm1'));
      expect(db.fingerprint()).toEqual([1, 2, empty[2]]); // no takes yet: the takes part is unchanged
      db.setTakes('hicks', 'm1', [{ text: 'a', toolLines: [], ts: 1 }, { text: 'b', toolLines: [], ts: 2 }], 1);
      expect(db.fingerprint()[2]).not.toBe(empty[2]);
      db.close();
    });
  });
});

describe('leads', () => {
  const give = (id: string, messageId: string, player = 'hicks') => ({ id, player, details: `${id} details`, messageId, at: 5 });

  it('giveLead writes a row and a lead log entry', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1' }));
    expect(db.giveLead(give('teo-debt', 'm1'))).toBe(true);
    expect(db.leadsGiven('hicks')).toEqual([{ id: 'teo-debt', details: 'teo-debt details', messageId: 'm1', at: 5 }]);
    const w = db.writes().at(-1)!;
    expect(w.kind).toBe('lead');
    expect(w.key).toBe('teo-debt\u0000hicks');
    db.close();
  });

  it('a second giveLead for the same id and player returns false and logs nothing', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1' }));
    db.giveLead(give('teo-debt', 'm1'));
    const before = db.writes().length;
    expect(db.giveLead({ ...give('teo-debt', 'm1'), details: 'other' })).toBe(false);
    expect(db.writes()).toHaveLength(before);
    expect(db.leadsGiven('hicks')[0].details).toBe('teo-debt details');
    db.close();
  });

  it('leadsGiven filters by player', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.giveLead(give('teo-debt', 'm1', 'ember'));
    expect(db.leadsGiven('hicks')).toEqual([]);
    expect(db.leadsGiven('ember').map((l) => l.id)).toEqual(['teo-debt']);
    db.close();
  });

  it('deleteAfter, deleteMessage and deleteFrom drop the leads their messages gave', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    for (const [id, ts] of [['m1', 1], ['m2', 2], ['m3', 3], ['m4', 4]] as const) db.insertMessage('hicks', makeMessage({ id, ts }));
    db.giveLead(give('a', 'm1'));
    db.giveLead(give('b', 'm2'));
    db.giveLead(give('c', 'm3'));
    db.giveLead(give('d', 'm4'));
    db.deleteMessage('hicks', 'm4');
    expect(db.leadsGiven('hicks').map((l) => l.id)).toEqual(['a', 'b', 'c']);
    db.deleteFrom(2);
    expect(db.leadsGiven('hicks').map((l) => l.id)).toEqual(['a', 'b']);
    db.deleteAfter('hicks', 'm1');
    expect(db.leadsGiven('hicks').map((l) => l.id)).toEqual(['a']);
    db.close();
  });

  it('rebuild restores leads from the log and reports leads: true when they changed', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', ts: 1 }));
    db.insertMessage('hicks', makeMessage({ id: 'm2', ts: 2 }));
    db.giveLead(give('a', 'm1'));
    db.setReplyStamp({ messageId: 'm2', take: 0 });
    db.giveLead(give('b', 'm2'));
    db.setReplyStamp(null);
    expect(db.rebuild().leads).toBe(false);
    expect(db.leadsGiven('hicks').map((l) => l.id)).toEqual(['a', 'b']);
    db.pruneWritesAfter(0);
    // Starting rows aside, nothing kept: both leads go.
    expect(db.rebuild().leads).toBe(true);
    expect(db.leadsGiven('hicks')).toEqual([]);
    db.close();
  });

  it('lead followed meta is story meta: logged, and gone with its message on rebuild', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', ts: 1 }));
    db.setMeta('lead.hicks.teo-debt.followed', '1');
    expect(db.writes().at(-1)).toMatchObject({ kind: 'meta', key: 'lead.hicks.teo-debt.followed', value: '1' });
    db.deleteMessage('hicks', 'm1');
    db.rebuild();
    expect(db.getMeta('lead.hicks.teo-debt.followed')).toBeNull();
    db.close();
  });
});

describe('story mood meta (story moods, Task 3 review I1)', () => {
  it('storyMood.* is story meta: logged, and gone with its turn on rebuild, so a swipe re-applies the mood', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1', ts: 1 }));
    db.setMeta('storyMood.key', 'late@2');
    expect(db.writes().at(-1)).toMatchObject({ kind: 'meta', key: 'storyMood.key', value: 'late@2' });
    db.deleteMessage('hicks', 'm1');
    db.rebuild();
    expect(db.getMeta('storyMood.key')).toBeNull();
    db.close();
  });
});

describe('the opening scene row', () => {
  it('round-trips with its mode, title and source', () => {
    const db = openDb(tmpDbPath(), { defaultPlayer: 'you' });
    const scene = makeMessage({ id: 's1', role: 'user', text: 'Rain.', mode: 'scene', scene: { title: 'After closing', source: 'generated' } });
    db.insertMessage('you', scene);
    expect(db.getMessage('you', 's1')).toMatchObject({ mode: 'scene', scene: { title: 'After closing', source: 'generated' }, text: 'Rain.' });
    db.updateMessage('you', 's1', { text: 'Rain!' });
    expect(db.getMessage('you', 's1')!.scene).toEqual({ title: 'After closing', source: 'generated' });
    db.close();
  });

  it('an older database gains the column', async () => {
    const file = tmpDbPath();
    const { DatabaseSync } = await import('node:sqlite');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT)`);
    old.close();
    const db = openDb(file, { defaultPlayer: 'you' });
    db.insertMessage('you', makeMessage({ id: 's2', role: 'user', mode: 'scene', scene: { title: 'T', source: 'written' } }));
    expect(db.getMessage('you', 's2')!.scene).toEqual({ title: 'T', source: 'written' });
    db.close();
  });
});

describe('the gig row', () => {
  const gig = { you: 'Hicks', title: 'Held Pay', tier: 'hard' as const, place: 'The Tilt', client: 'C', target: 'T', take: 'K', brief: 'B', result: 'close' as const, trace: 12, max: 14 };
  it('round-trips its snapshot; her reaction keeps the mode', () => {
    const db = openDb(tmpDbPath(), { defaultPlayer: 'you' });
    db.insertMessage('you', makeMessage({ id: 'g1', role: 'user', text: '*Hicks jacks in.*', mode: 'gig', gig }));
    db.insertMessage('you', makeMessage({ id: 'g2', role: 'agent', text: 'Close.', mode: 'gig', replyTo: 'g1' }));
    expect(db.getMessage('you', 'g1')).toMatchObject({ mode: 'gig', gig });
    db.updateMessage('you', 'g1', { status: 'failed' });
    expect(db.getMessage('you', 'g1')!.gig).toEqual(gig);
    expect(db.getMessage('you', 'g2')).toMatchObject({ mode: 'gig' });
    expect('gig' in db.getMessage('you', 'g2')!).toBe(false);
    db.close();
  });

  it('an older database gains the column', async () => {
    const file = tmpDbPath();
    const { DatabaseSync } = await import('node:sqlite');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT)`);
    old.close();
    const db = openDb(file, { defaultPlayer: 'you' });
    db.insertMessage('you', makeMessage({ id: 'g3', role: 'user', mode: 'gig', gig }));
    expect(db.getMessage('you', 'g3')).toMatchObject({ mode: 'gig', gig });
    db.close();
  });
});

describe('the encounter row', () => {
  it('round-trips with its title and stranger', () => {
    const db = openDb(tmpDbPath(), { defaultPlayer: 'you' });
    const encounter = { title: 'Wrong package', stranger: { name: 'Courier', voice: 'clipped' } };
    db.insertMessage('you', makeMessage({ id: 'e1', role: 'user', text: 'A courier drops a box.', mode: 'encounter', encounter }));
    expect(db.getMessage('you', 'e1')).toMatchObject({ mode: 'encounter', encounter, text: 'A courier drops a box.' });
    db.updateMessage('you', 'e1', { status: 'failed' });
    expect(db.getMessage('you', 'e1')!.encounter).toEqual(encounter);
    db.insertMessage('you', makeMessage({ id: 'e2', role: 'user', mode: 'encounter', encounter: { title: 'Blackout' } }));
    expect(db.allMessages('you').find((m) => m.id === 'e2')!.encounter).toEqual({ title: 'Blackout' });
    db.close();
  });

  it('an older database gains the column', async () => {
    const file = tmpDbPath();
    const { DatabaseSync } = await import('node:sqlite');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT)`);
    old.close();
    const db = openDb(file, { defaultPlayer: 'you' });
    db.insertMessage('you', makeMessage({ id: 'e3', role: 'user', mode: 'encounter', encounter: { title: 'T' } }));
    expect(db.getMessage('you', 'e3')).toMatchObject({ mode: 'encounter', encounter: { title: 'T' } });
    db.close();
  });
});

describe('the dice row', () => {
  const dice = { you: 'Hicks', her: 'Nix', stake: 'a drink', result: 'won' as const, rounds: [{ round: 1, bids: [{ q: 2, face: 4 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [4, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 2, face: 4 as const, by: 'you' as const }, count: 1, loser: 'you' as const, left: { you: 0, her: 2 } }], lines: [null] };
  it('round-trips its snapshot; a row without one is unchanged', () => {
    const db = openDb(tmpDbPath(), { defaultPlayer: 'you' });
    db.insertMessage('you', makeMessage({ id: 'd1', role: 'user', text: '*Hicks plays.*', mode: 'dice', dice }));
    db.insertMessage('you', makeMessage({ id: 'd2', role: 'agent', text: 'Fine.', mode: 'dice', replyTo: 'd1' }));
    expect(db.getMessage('you', 'd1')).toMatchObject({ mode: 'dice', dice });
    db.updateMessage('you', 'd1', { status: 'failed' });
    expect(db.getMessage('you', 'd1')!.dice).toEqual(dice);
    expect(db.getMessage('you', 'd2')).toMatchObject({ mode: 'dice' });
    expect('dice' in db.getMessage('you', 'd2')!).toBe(false);
    db.close();
  });
});

describe('old ribbon/ room ids', () => {
  const room = (sceneId: string): RoomState => ({
    sceneId,
    lights: [],
    atmosphere: { ambient: '#000000', ambientLevel: 0, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' },
  });

  it('loadRoom reads an old id as its current one (Glass Orchid by its exact alias)', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.saveRoom(room('ribbon/glass-orchid'));
    expect(db.loadRoom()?.sceneId).toBe('velvet/glass-orchid');
    db.close();
  });

  it('a room rebuilt from the write log comes back under its current id', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.saveRoom(room('ribbon/the-tilt')); // a starting row
    db.insertMessage('hicks', makeMessage({ id: 'm1', ts: 500 }));
    db.saveRoom(room('karasu/hicks-room')); // stamped with m1
    db.deleteFrom(400);
    db.rebuild();
    expect(db.loadRoom()?.sceneId).toBe('karasu/the-tilt');
    db.close();
  });
});

