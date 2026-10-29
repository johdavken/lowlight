import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db';
import { createPlaythroughs } from '../src/playthroughs';
import { migrateToPlaythroughs } from '../src/migrate-playthroughs';
import { tempDir } from './fixtures/temp-dir';

let dataDir: string;
let ptRoot: string;
const logs: string[] = [];
const log = (m: string) => logs.push(m);
const room = (sceneId: string) => ({
  sceneId,
  lights: [],
  atmosphere: { ambient: '#000000', ambientLevel: 0.3, weather: 'rain' as const, weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night' as const },
});
const msg = (id: string, ts: number) => ({ id, role: 'user' as const, text: id, toolLines: [], ts, status: 'ok' as const });
const note = (id: string) => ({ id, text: id, pinned: false, createdAt: 1, updatedAt: 1, editedBy: 'agent' as const, about: 'me' as const });

beforeEach(() => {
  const base = tempDir('migrate-pt-');
  dataDir = path.join(base, 'data');
  ptRoot = path.join(dataDir, 'playthroughs');
  logs.length = 0;

  // nix: hicks 3 messages, you 1 (newest overall: ts 50)
  fs.mkdirSync(path.join(dataDir, 'nix'), { recursive: true });
  const nix = openDb(path.join(dataDir, 'nix', 'room.db'), { defaultPlayer: 'hicks' });
  nix.insertMessage('hicks', msg('h1', 1));
  nix.insertMessage('hicks', msg('h2', 2));
  nix.insertMessage('hicks', msg('h3', 3));
  nix.insertMessage('you', msg('y1', 50));
  nix.insertNote(null, note('journal'));
  nix.insertNote('hicks', { ...note('dossier'), about: 'you' });
  nix.insertNote('you', { ...note('other-dossier'), about: 'you' });
  nix.setMeta('recap.you.text', 'you recap');
  nix.setMeta('recap.hicks.text', 'hicks recap');
  nix.setMeta('page.you.text', 'you page');
  nix.setMeta('unrelated', 'kept');
  nix.shareContact({ contactId: 'hae', player: 'you', messageId: 'y1', how: null, at: 5 });
  nix.shareContact({ contactId: 'hae', player: 'hicks', messageId: 'h1', how: null, at: 5 });
  nix.saveRoom(room('karasu/nix-scene'));
  nix.close();

  // hae: hicks 5 messages (most), you 0; newest hicks message ts 38
  fs.mkdirSync(path.join(dataDir, 'hae'), { recursive: true });
  const hae = openDb(path.join(dataDir, 'hae', 'room.db'), { defaultPlayer: 'hicks' });
  for (let i = 0; i < 5; i++) hae.insertMessage('hicks', msg(`hh${i}`, 10 + i * 7));
  hae.saveRoom(room('karasu/noodle-stall'));
  hae.close();
});

const run = (pts = createPlaythroughs(ptRoot)) => migrateToPlaythroughs(dataDir, pts, ['nix', 'hae'], log);

describe('migrateToPlaythroughs', () => {
  it('two players in one db become two playthroughs', () => {
    expect(run()).toBe(2);
    const pts = createPlaythroughs(ptRoot);
    expect(pts.list().map((p) => p.name).sort()).toEqual(['Imported — hicks', 'Imported — you']);
    const hicks = pts.list().find((p) => p.player === 'hicks')!;
    const db = openDb(path.join(pts.charsDir(hicks.id), 'nix', 'room.db'), { defaultPlayer: 'hicks' });
    expect(db.allMessages('hicks').map((m) => m.id)).toEqual(['h1', 'h2', 'h3']);
    expect(db.allMessages('you')).toEqual([]);
    expect(db.listNotes(null).map((n) => n.id)).toEqual(['journal']);
    expect(db.getNote('hicks', 'dossier')).toBeDefined();
    expect(db.getNote('hicks', 'other-dossier')).toBeUndefined();
    expect(db.getMeta('recap.you.text')).toBeNull();
    expect(db.getMeta('page.you.text')).toBeNull();
    expect(db.getMeta('recap.hicks.text')).toBe('hicks recap');
    expect(db.getMeta('unrelated')).toBe('kept');
    expect(db.sharedContacts('you')).toEqual([]);
    expect(db.sharedContacts('hicks')).toHaveLength(1);
    db.close();
  });

  it("another player's notes and pages don't come back on a rebuild (final review I2)", () => {
    expect(run()).toBe(2);
    const pts = createPlaythroughs(ptRoot);
    const hicks = pts.list().find((p) => p.player === 'hicks')!;
    const db = openDb(path.join(pts.charsDir(hicks.id), 'nix', 'room.db'), { defaultPlayer: 'hicks' });
    db.rebuild();
    expect(db.getNote('hicks', 'other-dossier')).toBeUndefined();
    expect(db.getMeta('recap.you.text')).toBeNull();
    expect(db.getMeta('page.you.text')).toBeNull();
    expect(db.getMeta('recap.hicks.text')).toBe('hicks recap');
    expect(db.sharedContacts('hicks')).toHaveLength(1);
    expect(db.writes().some((w) => w.key.includes('you'))).toBe(false);
    db.close();
  });

  it('copies only the contact databases that have messages from that player', () => {
    run();
    const pts = createPlaythroughs(ptRoot);
    const you = pts.list().find((p) => p.player === 'you')!;
    expect(fs.readdirSync(pts.charsDir(you.id))).toEqual(['nix']);
    const hicks = pts.list().find((p) => p.player === 'hicks')!;
    expect(fs.readdirSync(pts.charsDir(hicks.id)).sort()).toEqual(['hae', 'nix']);
  });

  it('startContact is the contact with most messages from that player; location comes from the newest message', () => {
    run();
    const pts = createPlaythroughs(ptRoot);
    const hicks = pts.list().find((p) => p.player === 'hicks')!;
    expect(hicks.startContact).toBe('hae');
    expect(hicks.location).toEqual({ contactId: 'hae', sceneId: 'karasu/noodle-stall' });
    const you = pts.list().find((p) => p.player === 'you')!;
    expect(you.startContact).toBe('nix');
    expect(you.location).toEqual({ contactId: 'nix', sceneId: 'karasu/nix-scene' });
  });

  it('start contact and location skip contacts off the roster (their databases are still copied)', () => {
    const onRoster = (id: string) => id !== 'hae';
    migrateToPlaythroughs(dataDir, createPlaythroughs(ptRoot), ['nix', 'hae'], log, undefined, onRoster);
    const pts = createPlaythroughs(ptRoot);
    const hicks = pts.list().find((p) => p.player === 'hicks')!;
    expect(hicks.startContact).toBe('nix');
    expect(hicks.location?.contactId).toBe('nix');
    expect(fs.existsSync(path.join(pts.charsDir(hicks.id), 'hae', 'room.db'))).toBe(true);
  });

  it('a bare room id from before rooms is completed for the location', () => {
    const hae = openDb(path.join(dataDir, 'hae', 'room.db'), { defaultPlayer: 'hicks' });
    hae.saveRoom(room('noodle-stall'));
    hae.close();
    const seen: [string, string][] = [];
    const complete = (contactId: string, sceneId: string) => {
      seen.push([contactId, sceneId]);
      return contactId === 'hae' && sceneId === 'noodle-stall' ? 'karasu/noodle-stall' : sceneId;
    };
    migrateToPlaythroughs(dataDir, createPlaythroughs(ptRoot), ['nix', 'hae'], log, complete);
    const hicks = createPlaythroughs(ptRoot).list().find((p) => p.player === 'hicks')!;
    expect(hicks.location).toEqual({ contactId: 'hae', sceneId: 'karasu/noodle-stall' });
    expect(seen).toContainEqual(['hae', 'noodle-stall']);
  });

  it('newest imported playthrough becomes active, and every room.db is renamed', () => {
    run();
    const pts = createPlaythroughs(ptRoot);
    expect(pts.active()?.player).toBe('you');
    for (const id of ['nix', 'hae']) {
      expect(fs.existsSync(path.join(dataDir, id, 'room.db'))).toBe(false);
      expect(fs.existsSync(path.join(dataDir, id, 'room.db.pre-playthroughs'))).toBe(true);
    }
  });

  it('failure leaves old files and no playthroughs dir', () => {
    const real = createPlaythroughs(ptRoot);
    let n = 0;
    // The second playthrough's copy lands on an existing file, so VACUUM INTO fails.
    const pts = {
      ...real,
      charsDir: (id: string) => {
        if (++n < 2) return real.charsDir(id);
        const blocked = path.join(dataDir, 'blocked');
        fs.mkdirSync(path.join(blocked, 'nix'), { recursive: true });
        fs.writeFileSync(path.join(blocked, 'nix', 'room.db'), 'occupied');
        return blocked;
      },
    };
    expect(() => run(pts)).toThrow();
    expect(fs.existsSync(path.join(dataDir, 'nix', 'room.db'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'hae', 'room.db'))).toBe(true);
    expect(fs.existsSync(ptRoot)).toBe(false);
  });

  it('failure keeps a pre-existing .lobby and leaves no playthroughs', () => {
    fs.mkdirSync(path.join(ptRoot, '.lobby', 'chars'), { recursive: true });
    const real = createPlaythroughs(ptRoot);
    const pts = {
      ...real,
      charsDir: (id: string) => {
        if (real.list().length >= 2) throw new Error('boom');
        return real.charsDir(id);
      },
    };
    expect(() => run(pts)).toThrow('boom');
    expect(fs.existsSync(path.join(ptRoot, '.lobby'))).toBe(true);
    expect(real.list()).toEqual([]);
    expect(fs.existsSync(path.join(ptRoot, 'index.json'))).toBe(false);
  });

  it('a lone .lobby folder does not prevent the migration', () => {
    fs.mkdirSync(path.join(ptRoot, '.lobby', 'chars'), { recursive: true });
    expect(run()).toBe(2);
  });

  it('second run is a no-op', () => {
    expect(run()).toBe(2);
    expect(run()).toBe(0);
    expect(createPlaythroughs(ptRoot).list()).toHaveLength(2);
  });

  it('does nothing when there are no old databases', () => {
    fs.rmSync(path.join(dataDir, 'nix'), { recursive: true });
    fs.rmSync(path.join(dataDir, 'hae'), { recursive: true });
    expect(run()).toBe(0);
    expect(createPlaythroughs(ptRoot).list()).toEqual([]);
  });

  it('keeps the originals complete under the new name', () => {
    run();
    const raw = new DatabaseSync(path.join(dataDir, 'nix', 'room.db.pre-playthroughs'));
    expect((raw.prepare('SELECT COUNT(*) AS c FROM messages').get() as { c: number }).c).toBe(4);
    raw.close();
  });

  it('old databases with no messages: returns 0 and leaves them alone', () => {
    for (const id of ['nix', 'hae']) {
      fs.rmSync(path.join(dataDir, id), { recursive: true });
      fs.mkdirSync(path.join(dataDir, id), { recursive: true });
      openDb(path.join(dataDir, id, 'room.db'), { defaultPlayer: 'hicks' }).close();
    }
    expect(run()).toBe(0);
    expect(createPlaythroughs(ptRoot).list()).toEqual([]);
    expect(fs.existsSync(path.join(dataDir, 'nix', 'room.db'))).toBe(true);
  });

  it('a second connection holding the db aborts the migration and leaves the original readable', () => {
    const holder = new DatabaseSync(path.join(dataDir, 'nix', 'room.db'));
    try {
      holder.exec('BEGIN');
      holder.prepare('SELECT COUNT(*) FROM messages').get(); // open read transaction pins the WAL
      expect(() => run()).toThrow(/still has content|locked|busy/i);
      expect(fs.existsSync(path.join(dataDir, 'nix', 'room.db'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'hae', 'room.db'))).toBe(true);
      expect(fs.existsSync(ptRoot)).toBe(false);
      expect((holder.prepare('SELECT COUNT(*) AS c FROM messages').get() as { c: number }).c).toBe(4);
    } finally {
      holder.close();
    }
  });
});
