import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db';
import { readHeldLeads } from '../src/leads-held';
import type { LeadEntry } from '../../shared/leads';
import { tempDir } from './fixtures/temp-dir';

const entry = (id: string, from: string, to: string): LeadEntry => ({
  id,
  title: id,
  from,
  to,
  keys: ['teo'],
  after: null,
  fill: 'x',
  place: null,
  onMind: 'm',
  giverKnows: 'g',
  receiverKnows: 'r',
});
const BOOK = [entry('teo-debt', 'cass', 'hicks'), entry('rot-price', 'hicks', 'cass')];

const open: Db[] = [];
afterEach(() => {
  while (open.length) open.pop()!.close();
});
function charsDir(): { dir: string; db(contact: string): Db } {
  const dir = tempDir('leads-held-');
  return {
    dir,
    db(contact) {
      fs.mkdirSync(path.join(dir, contact), { recursive: true });
      const db = openDb(path.join(dir, contact, 'room.db'), { defaultPlayer: 'ember' });
      open.push(db);
      return db;
    },
  };
}
const give = (db: Db, id: string, player = 'ember', at = 1) => {
  db.insertMessage(player, { id: `${id}-${player}`, role: 'agent', text: 'x', toolLines: [], ts: at, status: 'ok' });
  db.giveLead({ id, player, details: `${id} details`, messageId: `${id}-${player}`, at });
};

describe('readHeldLeads', () => {
  it("reads leads given in any contact's database, oldest first", () => {
    const c = charsDir();
    give(c.db('hicks'), 'rot-price', 'ember', 2);
    give(c.db('cass'), 'teo-debt', 'ember', 1);
    expect(readHeldLeads(c.dir, 'ember', BOOK)).toEqual([
      { id: 'teo-debt', givenBy: 'cass', details: 'teo-debt details', at: 1, followed: false },
      { id: 'rot-price', givenBy: 'hicks', details: 'rot-price details', at: 2, followed: false },
    ]);
  });

  it("ignores another player's leads (Review Focus 4)", () => {
    const c = charsDir();
    give(c.db('cass'), 'teo-debt', 'hicks');
    expect(readHeldLeads(c.dir, 'ember', BOOK)).toEqual([]);
  });

  it('drops a held lead whose file is gone from the book (Review Focus 3)', () => {
    const c = charsDir();
    give(c.db('cass'), 'teo-debt');
    expect(readHeldLeads(c.dir, 'ember', BOOK.slice(1))).toEqual([]);
  });

  it("followed comes from the receiver's database", () => {
    const c = charsDir();
    give(c.db('cass'), 'teo-debt');
    c.db('hicks').setMeta('lead.ember.teo-debt.followed', '1');
    expect(readHeldLeads(c.dir, 'ember', BOOK)[0].followed).toBe(true);
  });

  it('a database without a leads table reads as none', () => {
    const c = charsDir();
    fs.mkdirSync(path.join(c.dir, 'cass'));
    const raw = new DatabaseSync(path.join(c.dir, 'cass', 'room.db'));
    raw.exec('CREATE TABLE messages (id TEXT PRIMARY KEY)');
    raw.close();
    expect(readHeldLeads(c.dir, 'ember', BOOK)).toEqual([]);
  });

  it('a missing chars folder reads as none', () => {
    expect(readHeldLeads('/nonexistent/chars', 'ember', BOOK)).toEqual([]);
  });
});
