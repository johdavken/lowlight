import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import type { ChatMessage, RoomState } from '../../shared/types';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 'm1', role: 'agent', text: 'hello', toolLines: [], ts: 1000, status: 'ok', ...overrides };
}

const tmpDirs: string[] = [];
function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-write-log-'));
  tmpDirs.push(dir);
  return path.join(dir, 'room.db');
}
afterEach(() => {
  while (tmpDirs.length > 0) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

const room = (sceneId: string): RoomState => ({
  sceneId,
  lights: [],
  atmosphere: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' },
});
const note = (id: string, text = 'hi') => ({ id, text, pinned: false, createdAt: 1, updatedAt: 1, editedBy: 'agent' as const, about: 'you' as const });
const last = (db: Db) => db.writes().at(-1)!;

describe('the write log', () => {
  it('migration seeds starting rows', () => {
    const file = tmpDbPath();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'm1' }));
    db.insertNote(null, { ...note('n1'), about: 'me' });
    db.insertNote('hicks', note('n2'));
    db.setMeta('recap.hicks.text', 'so far');
    db.setMeta('page.hicks.text', 'him');
    db.saveRoom(room('intake'));
    db.shareContact({ contactId: 'bishop', player: 'hicks', messageId: 'm1', how: null, at: 5 });
    db.close();
    // A database from before the log: the same rows, no writes table.
    const raw = new DatabaseSync(file);
    raw.exec('DROP TABLE writes');
    raw.close();

    const reopened = openDb(file, { defaultPlayer: 'hicks' });
    const rows = reopened.writes();
    expect(rows.map((r) => r.kind).sort()).toEqual(['meta', 'meta', 'note', 'note', 'room', 'share']);
    expect(rows.every((r) => r.take === null)).toBe(true);
    expect(rows.filter((r) => r.kind !== 'share').every((r) => r.messageId === null)).toBe(true);
    expect(rows.find((r) => r.kind === 'share')!.messageId).toBe('m1');
    reopened.close();
    const again = openDb(file, { defaultPlayer: 'hicks' });
    expect(again.writes()).toHaveLength(6);
    again.close();
  });

  it('a write in a reply is stamped with its message and take', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a1' }));
    db.setReplyStamp({ messageId: 'a1', take: 2 });
    db.insertNote('hicks', note('n1'));
    expect(last(db)).toMatchObject({ messageId: 'a1', take: 2, kind: 'note', key: 'n1' });
    db.setReplyStamp(null);
    db.close();
  });

  it("the opening scene row is never a write's stamp: before her first line, a write is stamped null", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'scene-pt', role: 'user', mode: 'scene', text: 'Rain.', scene: { title: 'T', source: 'written' }, ts: 1 }));
    db.setMeta('page.hicks.text', 'x');
    expect(last(db)).toMatchObject({ messageId: null, take: null });
    db.close();
  });

  it('a write outside a reply is stamped with the latest message, take null', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'u1', role: 'user', ts: 1 }));
    db.insertMessage('hicks', makeMessage({ id: 'a1', ts: 2 }));
    db.setMeta('page.hicks.text', 'x');
    expect(last(db)).toMatchObject({ messageId: 'a1', take: null, kind: 'meta', key: 'page.hicks.text', value: 'x' });
    expect(db.stamp()).toEqual({ messageId: 'a1', take: null });
    db.close();
  });

  it('a write with no messages is a starting row', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.saveRoom(room('intake'));
    expect(last(db)).toMatchObject({ messageId: null, take: null, kind: 'room', key: '1' });
    db.close();
  });

  it('journal.next and other meta are not logged', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.setMeta('journal.next', '5');
    db.setMeta('something.else', 'x');
    expect(db.writes()).toEqual([]);
    db.close();
  });

  it('an unchanged write is not logged', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.saveRoom(room('intake'));
    db.saveRoom(room('intake'));
    db.insertNote('hicks', note('n1'));
    db.updateNote('hicks', 'n1', { text: 'hi' });
    db.setMeta('recap.hicks.text', 'a');
    db.setMeta('recap.hicks.text', 'a');
    db.shareContact({ contactId: 'bishop', player: 'hicks', messageId: 'm1', how: null, at: 5 });
    db.shareContact({ contactId: 'bishop', player: 'hicks', messageId: 'm2', how: null, at: 6 });
    expect(db.writes().map((r) => r.kind)).toEqual(['room', 'note', 'meta', 'share']);
    db.close();
  });

  it('deletes are logged with a null value', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertNote('hicks', note('n1'));
    db.deleteNote('hicks', 'n1');
    expect(last(db)).toMatchObject({ kind: 'note', key: 'n1', value: null });
    db.setMeta('recap.hicks.at', '5');
    db.deleteMeta('recap.hicks.at');
    expect(last(db)).toMatchObject({ kind: 'meta', key: 'recap.hicks.at', value: null });
    db.deleteMeta('recap.hicks.at');
    // A write and its undoing under one stamp coalesce: one row each, the delete.
    expect(db.writes().map((w) => w.value)).toEqual([null, null]);
    db.close();
  });

  it('a note row is logged whole, with its owner', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertNote(null, { ...note('n1', 'mine'), about: 'me' });
    expect(JSON.parse(last(db).value!)).toEqual({ id: 'n1', player: null, text: 'mine', pinned: 0, created_at: 1, updated_at: 1, edited_by: 'agent' });
    db.close();
  });
});

describe('rebuild', () => {
  it('a rewind takes scribe.* (the Residual\'s) and summary.* meta back with the reply that wrote them (review C2)', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', ts: 1000 }));
    db.withStamp({ messageId: 'a', take: 0 }, () => db.setMeta('scribe.hicks.through', '{"id":"a","take":0}'));
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 2000 }));
    db.withStamp({ messageId: 'b', take: 0 }, () => {
      db.setMeta('scribe.hicks.through', '{"id":"b","take":0}');
      db.setMeta('summary.hicks', '{"text":"x","through":"b"}');
    });
    db.cutAfter('hicks', 'a');
    expect(db.getMeta('scribe.hicks.through')).toBe('{"id":"a","take":0}');
    expect(db.getMeta('summary.hicks')).toBeNull();
    db.close();
  });

  it('rewinds cipher.* meta with the reply it was stamped to (cipher spec §2.4)', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', ts: 1000 }));
    db.withStamp({ messageId: 'a', take: 0 }, () => db.setMeta('cipher.hicks', '[{"t":"run","replies":6,"seq":1}]'));
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 2000 }));
    db.withStamp({ messageId: 'b', take: 0 }, () => db.setMeta('cipher.hicks', '[{"t":"run","replies":6,"seq":1},{"t":"learned","id":"x","seq":2}]'));
    db.cutAfter('hicks', 'a');
    expect(db.getMeta('cipher.hicks')).toBe('[{"t":"run","replies":6,"seq":1}]');
    db.close();
  });

  it('withStamp stamps writes inside it and restores the previous stamp, even when fn throws', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a', ts: 1000 }));
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 2000 }));
    db.setReplyStamp({ messageId: 'b', take: 1 });
    db.withStamp({ messageId: 'a', take: 0 }, () => db.setMeta('recap.hicks.text', 'x'));
    expect(last(db)).toMatchObject({ messageId: 'a', take: 0 });
    expect(() => db.withStamp({ messageId: 'a', take: 0 }, () => { throw new Error('boom'); })).toThrow('boom');
    expect(db.stamp()).toEqual({ messageId: 'b', take: 1 });
    db.close();
  });

  it("rewind restores a note's keys", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const j = new Journal(db, () => 1);
    db.insertMessage('hicks', makeMessage({ id: 'a', ts: 1000 }));
    j.note('hicks', { text: 'Teo owes', keys: ['Teo'] }, 'agent');
    db.insertMessage('hicks', makeMessage({ id: 'b', ts: 2000 }));
    j.note('hicks', { id: 'n1', keys: ['debt'] }, 'agent');
    expect(j.notes('hicks')[0].keys).toEqual(['debt']);
    db.cutAfter('hicks', 'a');
    expect(j.notes('hicks')[0].keys).toEqual(['Teo']);
    db.close();
  });

  /** A db with messages u1 (1), a1 (2), u2 (3), a2 (4) for hicks. */
  function story(): Db {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'u1', role: 'user', ts: 1 }));
    db.insertMessage('hicks', makeMessage({ id: 'a1', ts: 2 }));
    db.insertMessage('hicks', makeMessage({ id: 'u2', role: 'user', ts: 3 }));
    db.insertMessage('hicks', makeMessage({ id: 'a2', ts: 4 }));
    return db;
  }
  const inReply = (db: Db, messageId: string, take: number, write: () => void) => {
    db.setReplyStamp({ messageId, take });
    write();
    db.setReplyStamp(null);
  };
  const ids = (db: Db) => db.listNotes('hicks').map((n) => n.id).sort();
  const takes = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `take ${i}`, toolLines: [], ts: i }));

  it('rebuild drops writes of deleted messages', () => {
    const db = story();
    inReply(db, 'a1', 0, () => db.saveRoom(room('intake')));
    inReply(db, 'a1', 0, () => db.insertNote('hicks', note('n1')));
    inReply(db, 'a2', 0, () => db.saveRoom(room('rooftop')));
    db.deleteAfter('hicks', 'a1');
    const r = db.rebuild();
    expect(ids(db)).toEqual(['n1']);
    expect(db.loadRoom()!.sceneId).toBe('intake');
    expect(r.roomChanged).toBe(true);
    expect(r.notes).toEqual([]);
    db.close();
  });

  it('rebuild follows the shown take', () => {
    const db = story();
    inReply(db, 'a2', 0, () => db.insertNote('hicks', note('n1')));
    inReply(db, 'a2', 1, () => db.insertNote('hicks', note('n2')));
    db.setTakes('hicks', 'a2', takes(2), 0);
    expect(db.rebuild().notes).toEqual(['hicks']);
    expect(ids(db)).toEqual(['n1']);
    db.setTakes('hicks', 'a2', takes(2), 1);
    db.rebuild();
    expect(ids(db)).toEqual(['n2']);
    db.close();
  });

  it('show overrides the take for one message', () => {
    const db = story();
    inReply(db, 'a2', 0, () => db.insertNote('hicks', note('n1')));
    inReply(db, 'a2', 1, () => db.insertNote('hicks', note('n2')));
    db.rebuild({ show: { messageId: 'a2', take: 1 } });
    expect(ids(db)).toEqual(['n2']);
    db.close();
  });

  it('a null take survives swipes', () => {
    const db = story();
    db.setMeta('page.hicks.text', 'him'); // outside a reply: a2, any take
    db.setTakes('hicks', 'a2', takes(2), 1);
    db.rebuild();
    expect(db.getMeta('page.hicks.text')).toBe('him');
    db.setTakes('hicks', 'a2', takes(2), 0);
    db.rebuild();
    expect(db.getMeta('page.hicks.text')).toBe('him');
    db.close();
  });

  it('starting rows survive any rewind', () => {
    const fresh = openDb(':memory:', { defaultPlayer: 'hicks' });
    fresh.insertNote('hicks', note('n0')); // no messages yet: a starting row
    fresh.insertMessage('hicks', makeMessage({ id: 'u1', role: 'user', ts: 1 }));
    fresh.insertMessage('hicks', makeMessage({ id: 'a1', ts: 2 }));
    fresh.deleteAfter('hicks', 'u1');
    fresh.rebuild();
    expect(fresh.listNotes('hicks').map((n) => n.id)).toEqual(['n0']);
    fresh.close();
  });

  it('a note made after a rewind gets a fresh id', () => {
    const db = story();
    const journal = new Journal(db);
    db.setReplyStamp({ messageId: 'a2', take: 0 });
    expect(journal.note('hicks', { text: 'first' }, 'agent')).toMatchObject({ ok: true });
    db.setReplyStamp(null);
    db.pruneWrites(db.deleteAfter('hicks', 'a1'));
    db.rebuild();
    expect(ids(db)).toEqual([]);
    journal.note('hicks', { text: 'second' }, 'user');
    expect(ids(db)).toEqual(['n2']);
    db.close();
  });

  it('delete then re-insert brings writes back', () => {
    const db = story();
    inReply(db, 'a2', 0, () => db.insertNote('hicks', note('n1')));
    const a2 = db.getMessage('hicks', 'a2')!;
    db.deleteMessage('hicks', 'a2');
    db.rebuild();
    expect(ids(db)).toEqual([]);
    db.insertMessage('hicks', a2);
    db.rebuild();
    expect(ids(db)).toEqual(['n1']);
    db.close();
  });

  it('pruneWrites removes rows', () => {
    const db = story();
    inReply(db, 'a2', 0, () => db.insertNote('hicks', note('n1')));
    inReply(db, 'a1', 0, () => db.insertNote('hicks', note('n2')));
    db.pruneWrites(['a2']);
    expect(db.writes().map((w) => w.messageId)).toEqual(['a1']);
    db.close();
  });

  it('rebuild that throws leaves tables unchanged', () => {
    const file = tmpDbPath();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a1', ts: 2 }));
    db.insertNote('hicks', note('n1'));
    db.saveRoom(room('intake'));
    const raw = new DatabaseSync(file);
    raw.exec("UPDATE writes SET value = '{broken' WHERE kind = 'room'");
    raw.close();
    db.insertMessage('hicks', makeMessage({ id: 'a2', ts: 3 }));
    expect(() => db.rebuild()).toThrow();
    expect(ids(db)).toEqual(['n1']);
    expect(db.loadRoom()!.sceneId).toBe('intake');
    db.close();
  });

  it('the shares follow their message', () => {
    const db = story();
    inReply(db, 'a2', 1, () => db.shareContact({ contactId: 'bishop', player: 'hicks', messageId: 'a2', how: null, at: 5 }));
    db.setTakes('hicks', 'a2', takes(2), 0);
    expect(db.rebuild().shares).toBe(true);
    expect(db.sharedContacts('hicks')).toEqual([]);
    db.setTakes('hicks', 'a2', takes(2), 1);
    db.rebuild();
    expect(db.sharedContacts('hicks').map((s) => s.contactId)).toEqual(['bishop']);
    // A deleted message's shares go with it, and come back with it.
    const a2 = db.getMessage('hicks', 'a2')!;
    db.deleteAfter('hicks', 'u2');
    db.rebuild();
    expect(db.sharedContacts('hicks')).toEqual([]);
    db.insertMessage('hicks', a2);
    db.setTakes('hicks', 'a2', takes(2), 1);
    db.rebuild();
    expect(db.sharedContacts('hicks').map((s) => s.contactId)).toEqual(['bishop']);
    db.close();
  });

  it('rebuild reports recap and page players, and her journal as null', () => {
    const db = story();
    inReply(db, 'a2', 0, () => {
      db.setMeta('recap.hicks.text', 'so far');
      db.setMeta('page.hicks.text', 'him');
      db.insertNote(null, { ...note('n1'), about: 'me' });
    });
    db.deleteAfter('hicks', 'u2');
    const r = db.rebuild();
    expect(r).toEqual({ roomChanged: false, notes: [null], recap: ['hicks'], page: ['hicks'], shares: false, leads: false, quests: false });
    expect(db.getMeta('recap.hicks.text')).toBeNull();
    db.close();
  });

  it('rebuild leaves journal.next alone', () => {
    const db = story();
    db.setMeta('journal.next', '7');
    db.rebuild();
    expect(db.getMeta('journal.next')).toBe('7');
    db.close();
  });

  it('deleteFrom cuts every pair by time', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    for (const [player, id, ts] of [['hicks', 'h1', 1], ['hicks', 'h2', 2], ['hicks', 'h3', 3], ['cass', 'c2', 2], ['cass', 'c3', 3]] as const) {
      db.insertMessage(player, makeMessage({ id, ts }));
    }
    expect(db.deleteFrom(2).sort()).toEqual(['c3', 'h3']);
    expect(db.allMessages('hicks').map((m) => m.id)).toEqual(['h1', 'h2']);
    db.close();
  });

  it('fingerprint moves on swipes and logged writes, not on journal.next', () => {
    const db = story();
    const f0 = db.fingerprint();
    expect(f0).toHaveLength(3);
    db.setTakes('hicks', 'a2', takes(2), 1);
    const f1 = db.fingerprint();
    expect(f1).not.toEqual(f0);
    db.setMeta('journal.next', '9');
    expect(db.fingerprint()).toEqual(f1);
    db.setMeta('page.hicks.text', 'x');
    expect(db.fingerprint()).not.toEqual(f1);
    db.close();
  });
});

describe('the write log, tidied (deferred minors)', () => {
  function story(): Db {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'u1', role: 'user', ts: 1 }));
    db.insertMessage('hicks', makeMessage({ id: 'a1', ts: 2 }));
    db.insertMessage('hicks', makeMessage({ id: 'u2', role: 'user', ts: 3 }));
    db.insertMessage('hicks', makeMessage({ id: 'a2', ts: 4 }));
    return db;
  }
  const takes = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `take ${i}`, toolLines: [], ts: i }));

  it('a run of writes to one thing under one stamp keeps only the last (a slider dragged)', () => {
    const db = story();
    db.saveRoom(room('intake'));
    const fog = (f: number) => ({ ...room('intake'), atmosphere: { ...room('intake').atmosphere, fog: f } });
    for (const f of [0.1, 0.2, 0.3, 0.4]) db.saveRoom(fog(f));
    const rows = db.writes().filter((w) => w.kind === 'room');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].value!).atmosphere.fog).toBe(0.4);
    // Still a newer write: a checkpoint sees the change.
    const f = db.fingerprint();
    db.saveRoom(fog(0.5));
    expect(db.fingerprint()).not.toEqual(f);
    db.close();
  });

  it('a write to something else, or under another stamp, starts a new row', () => {
    const db = story();
    db.saveRoom(room('intake'));
    db.setMeta('page.hicks.text', 'x');
    db.saveRoom(room('rooftop'));
    db.setReplyStamp({ messageId: 'a2', take: 0 });
    db.saveRoom(room('stall'));
    db.setReplyStamp(null);
    expect(db.writes().map((w) => w.kind)).toEqual(['room', 'meta', 'room', 'room']);
    db.close();
  });

  it('opposite swipes on two lines still change the fingerprint', () => {
    const db = story();
    db.setTakes('hicks', 'a1', takes(2), 1);
    db.setTakes('hicks', 'a2', takes(2), 0);
    const f = db.fingerprint();
    db.setTakes('hicks', 'a1', takes(2), 0);
    db.setTakes('hicks', 'a2', takes(2), 1);
    expect(db.fingerprint()).not.toEqual(f);
    db.close();
  });

  it('cutAfter deletes, prunes and rebuilds as one: a failed rebuild leaves every line', () => {
    const file = tmpDbPath();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a1', ts: 2 }));
    db.insertMessage('hicks', makeMessage({ id: 'a2', ts: 3 }));
    db.setReplyStamp({ messageId: 'a1', take: 0 });
    db.saveRoom(room('intake'));
    db.setReplyStamp(null);
    const raw = new DatabaseSync(file);
    raw.exec("UPDATE writes SET value = '{broken' WHERE kind = 'room'");
    raw.close();
    expect(() => db.cutAfter('hicks', 'a1')).toThrow();
    expect(db.allMessages('hicks').map((m) => m.id)).toEqual(['a1', 'a2']);
    db.close();
  });

  it('cutAfter returns the deleted ids and what the rebuild changed', () => {
    const db = story();
    db.setReplyStamp({ messageId: 'a2', take: 0 });
    db.insertNote('hicks', note('n1'));
    db.setReplyStamp(null);
    const r = db.cutAfter('hicks', 'a1');
    expect(r.ids).toEqual(['u2', 'a2']);
    expect(r.rebuilt.notes).toEqual(['hicks']);
    expect(db.writes().some((w) => w.messageId === 'a2')).toBe(false);
    db.close();
  });

  it('opening after a crash mid-take shows the take on screen, not the one being written', () => {
    const file = tmpDbPath();
    const db = openDb(file, { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', makeMessage({ id: 'a1', ts: 2 }));
    db.setReplyStamp({ messageId: 'a1', take: 0 });
    db.insertNote('hicks', note('n1', 'take 0'));
    // A regenerate opened take 1 and wrote, then the process died before the take was added.
    db.setReplyStamp({ messageId: 'a1', take: 1 });
    db.rebuild({ show: { messageId: 'a1', take: 1 } });
    db.insertNote('hicks', note('n2', 'take 1'));
    db.updateMessage('hicks', 'a1', { status: 'streaming' });
    db.close();
    const reopened = openDb(file, { defaultPlayer: 'hicks' });
    reopened.recoverAfterCrash();
    expect(reopened.listNotes('hicks').map((n) => n.id)).toEqual(['n1']);
    expect(reopened.getMessage('hicks', 'a1')!.status).toBe('lost');
    reopened.close();
  });

  it('restampWrites moves a line\'s writes to another (or to the start)', () => {
    const db = story();
    db.insertNote('hicks', note('n1')); // outside a reply: a2
    db.restampWrites('a2', 'a1');
    expect(db.writes().at(-1)).toMatchObject({ messageId: 'a1', take: null });
    db.restampWrites('a1', null);
    expect(db.writes().at(-1)).toMatchObject({ messageId: null, take: null });
    db.close();
  });
});
